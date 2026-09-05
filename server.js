const express = require('express');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const XLSX = require('xlsx');
const dotenv = require('dotenv');
dotenv.config();
const cookieParser = require('cookie-parser');
const { gerarComGemini, refinarComGemini, discutirComGemini, sugerirMelhorias, montarArquivosSandpack, getApiKeys } = require('./gemini-manager');
const {
  createUser,
  getUserByEmail,
  getUserById,
  getUserByGithubId,
  linkGithubAccount,
  applyInviteBonusIfNeeded,
  invitesRequiredForNextTier,
  countSignupsByIp,
  saveProject,
  getProjectById,
  listProjectsByUser,
  createPendingSubscription,
  setUnlimited,
  saveAuthVerification,
  getAuthVerification,
  incrementAuthVerificationAttempts,
  deleteAuthVerification,
  markEmailVerified,
  getAnonCredits,
  deductAnonCredit,
} = require('./db');
const { signUserToken, requireAuth } = require('./auth');
const plans = require('./plans.json');

const app = express();
const PORT = process.env.PORT || 10000;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { files: 10, fileSize: 50 * 1024 * 1024 },
});

const keys = getApiKeys();
const ASAAS_API_URL = process.env.ASAAS_API_URL || 'https://api.asaas.com/v3';

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

function clientIp(req) {
  return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    credits: user.credits,
    unlimited: !!user.unlimited_credits,
    referralCode: user.referral_code,
  };
}

async function asaasRequest(endpoint, options = {}) {
  if (!process.env.ASAAS_API_KEY) throw new Error('ASAAS_API_KEY não configurada no servidor.');
  const response = await fetch(`${ASAAS_API_URL}${endpoint}`, {
    ...options,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      access_token: process.env.ASAAS_API_KEY,
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data.errors?.map((item) => item.description).join(', ');
    throw new Error(detail || data.message || `Asaas respondeu com HTTP ${response.status}.`);
  }
  return data;
}

function asaasSubscriptionCycle(plan) {
  return { month: 'MONTHLY', quarter: 'QUARTERLY', year: 'ANNUALLY' }[plan.interval];
}

// tenta pegar o usuário logado, sem exigir login (gerar app funciona sem conta também)
function tryGetUser(req) {
  const token = req.cookies && req.cookies.oficina_token;
  if (!token) return null;
  const { verifyToken } = require('./auth');
  const payload = verifyToken(token);
  if (!payload) return null;
  return getUserById(payload.uid);
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', keysLoaded: keys.length });
});

app.get('/api/credits', (req, res) => {
  const anon = getAnonCredits(clientIp(req));
  res.json({ credits: anon.credits });
});

app.get('/api/plans', (req, res) => {
  res.json({ plans });
});

app.post('/api/files/extract', (req, res, next) => {
  upload.array('files', 10)(req, res, (error) => {
    if (error) return next(error);
    next();
  });
}, async (req, res) => {
  try {
    const documents = await Promise.all((req.files || []).map(async (file) => {
      const extension = path.extname(file.originalname).toLowerCase();
      let text = '';
      let readable = true;

      if (extension === '.pdf' || file.mimetype === 'application/pdf') {
        text = (await pdfParse(file.buffer)).text;
      } else if (extension === '.docx') {
        text = (await mammoth.extractRawText({ buffer: file.buffer })).value;
      } else if (['.xlsx', '.xls', '.ods'].includes(extension)) {
        const workbook = XLSX.read(file.buffer, { type: 'buffer' });
        text = workbook.SheetNames.map((sheetName) => {
          const sheet = workbook.Sheets[sheetName];
          return `Planilha: ${sheetName}\n${XLSX.utils.sheet_to_csv(sheet)}`;
        }).join('\n\n');
      } else if (['.txt', '.md', '.csv', '.json', '.html', '.htm', '.js', '.jsx', '.ts', '.tsx', '.css', '.scss', '.xml', '.yaml', '.yml', '.sql', '.py', '.java', '.go', '.rs', '.php', '.vue', '.svelte', '.log', '.rtf'].includes(extension) || file.mimetype.startsWith('text/')) {
        text = file.buffer.toString('utf8');
      } else {
        const binary = file.buffer.subarray(0, Math.min(file.buffer.length, 100000)).includes(0);
        if (!binary) text = file.buffer.toString('utf8');
        else readable = false;
      }

      return {
        name: file.originalname,
        readable,
        text: text.trim().slice(0, 50000),
        message: readable ? undefined : 'Formato anexado sem extração de texto disponível.',
      };
    }));
    res.json({ documents });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Não foi possível ler os arquivos.' });
  }
});

app.use('/api/files/extract', (error, req, res, next) => {
  if (!error) return next();
  const message = error.code === 'LIMIT_FILE_SIZE'
    ? 'O arquivo é maior que o limite de 50 MB.'
    : error.code === 'LIMIT_FILE_COUNT'
      ? 'Você pode enviar no máximo 10 arquivos por vez.'
      : error.message || 'Não foi possível receber o arquivo.';
  res.status(400).json({ error: message });
});

// ---------- Auth ----------

function normalizeEmail(email) {
  return (email || '').trim().toLowerCase();
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

function hashVerificationCode(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

async function sendVerificationCode(email, code) {
  if (!process.env.RESEND_API_KEY || !process.env.AUTH_FROM_EMAIL) {
    throw new Error('O envio de códigos não está configurado no servidor.');
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.AUTH_FROM_EMAIL,
      to: [email],
      subject: 'Seu código de verificação Chequetto',
      text: `Seu código de verificação é ${code}. Ele expira em 10 minutos.`,
    }),
  });
  if (!response.ok) throw new Error('Não foi possível enviar o código de verificação.');
}

async function issueVerificationCode(email, purpose, payload) {
  const code = String(crypto.randomInt(100000, 1000000));
  saveAuthVerification({
    email,
    purpose,
    codeHash: hashVerificationCode(code),
    payload,
    expiresAt: Date.now() + 10 * 60 * 1000,
  });
  try {
    await sendVerificationCode(email, code);
  } catch (error) {
    deleteAuthVerification(email, purpose);
    throw error;
  }
}

function verificationMatches(record, code) {
  if (!record || record.expires_at < Date.now() || record.attempts >= 5) return false;
  const expected = Buffer.from(record.code_hash, 'hex');
  const received = Buffer.from(hashVerificationCode(String(code || '')), 'hex');
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

function issueSession(res, user) {
  const token = signUserToken(user);
  res.cookie('oficina_token', token, { httpOnly: true, sameSite: 'lax', maxAge: 30 * 24 * 3600 * 1000 });
}

function safeReferralCode(value) {
  return String(value || '').trim().slice(0, 32) || undefined;
}

// ---------- Opção 1: entrar/criar conta com e-mail (código de verificação) ----------

app.post('/api/auth/email/request-code', async (req, res) => {
  const { email, referralCode } = req.body || {};
  const finalEmail = normalizeEmail(email);
  if (!validEmail(finalEmail)) return res.status(400).json({ error: 'Informe um e-mail válido.' });
  try {
    await issueVerificationCode(finalEmail, 'email', {
      referralCode: safeReferralCode(referralCode),
      signupIp: clientIp(req),
    });
    res.json({ message: 'Código de verificação enviado para seu e-mail.' });
  } catch (error) {
    res.status(503).json({ error: error.message });
  }
});

app.post('/api/auth/email/verify', (req, res) => {
  const finalEmail = normalizeEmail(req.body?.email);
  const record = getAuthVerification(finalEmail, 'email');
  if (!verificationMatches(record, req.body?.code)) {
    if (record) incrementAuthVerificationAttempts(finalEmail, 'email');
    return res.status(401).json({ error: 'Código inválido ou expirado.' });
  }
  const payload = JSON.parse(record.payload || '{}');
  deleteAuthVerification(finalEmail, 'email');

  let user = getUserByEmail(finalEmail);
  if (!user) {
    user = createUser({ email: finalEmail, referredByCode: payload.referralCode, signupIp: payload.signupIp });
    if (user.referred_by) applyInviteBonusIfNeeded(user.id);
  }
  if (!user.email_verified_at) markEmailVerified(user.id);

  issueSession(res, user);
  res.json({ user: publicUser(getUserByEmail(finalEmail)) });
});

// ---------- Opção 2: entrar/criar conta com GitHub (OAuth) ----------

app.get('/api/auth/github', (req, res) => {
  if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
    return res.redirect('/?auth_error=' + encodeURIComponent('Login com GitHub não está configurado no servidor.'));
  }
  const csrf = crypto.randomBytes(16).toString('hex');
  const referralCode = safeReferralCode(req.query.convite) || '';
  res.cookie('oficina_oauth_state', csrf, { httpOnly: true, sameSite: 'lax', maxAge: 10 * 60 * 1000 });
  const publicUrl = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID,
    redirect_uri: `${publicUrl}/api/auth/github/callback`,
    scope: 'read:user user:email',
    state: `${csrf}.${encodeURIComponent(referralCode)}`,
    allow_signup: 'true',
  });
  res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
});

app.get('/api/auth/github/callback', async (req, res) => {
  const savedState = req.cookies && req.cookies.oficina_oauth_state;
  res.clearCookie('oficina_oauth_state');
  const { code, state } = req.query || {};
  const [csrf, referralCodeEncoded] = String(state || '').split('.');

  if (!code || !csrf || !savedState || csrf !== savedState) {
    return res.redirect('/?auth_error=' + encodeURIComponent('Não foi possível confirmar o login com GitHub. Tente novamente.'));
  }

  try {
    const publicUrl = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: `${publicUrl}/api/auth/github/callback`,
      }),
    });
    const tokenData = await tokenResponse.json();
    if (!tokenData.access_token) throw new Error(tokenData.error_description || 'O GitHub não autorizou o acesso.');

    const authHeaders = { authorization: `Bearer ${tokenData.access_token}`, accept: 'application/vnd.github+json' };
    const profileResponse = await fetch('https://api.github.com/user', { headers: authHeaders });
    const profile = await profileResponse.json();
    if (!profile || !profile.id) throw new Error('Não foi possível obter os dados da conta do GitHub.');

    let email = profile.email;
    if (!email) {
      const emailsResponse = await fetch('https://api.github.com/user/emails', { headers: authHeaders });
      const emails = await emailsResponse.json();
      const primary = Array.isArray(emails)
        ? emails.find((item) => item.primary && item.verified) || emails.find((item) => item.verified)
        : null;
      email = primary && primary.email;
    }
    if (!email) throw new Error('Sua conta do GitHub não tem um e-mail verificado disponível. Adicione um e tente novamente.');

    const finalEmail = normalizeEmail(email);
    const githubId = String(profile.id);
    const referralCode = referralCodeEncoded ? safeReferralCode(decodeURIComponent(referralCodeEncoded)) : undefined;

    let user = getUserByGithubId(githubId) || getUserByEmail(finalEmail);
    if (user) {
      if (!user.github_id) user = linkGithubAccount(user.id, githubId);
    } else {
      user = createUser({
        email: finalEmail,
        name: profile.name || profile.login,
        githubId,
        referredByCode: referralCode,
        signupIp: clientIp(req),
      });
      if (user.referred_by) applyInviteBonusIfNeeded(user.id);
    }
    if (!user.email_verified_at) markEmailVerified(user.id);

    issueSession(res, user);
    res.redirect('/');
  } catch (error) {
    console.error('Erro no login com GitHub:', error.message);
    res.redirect('/?auth_error=' + encodeURIComponent(error.message || 'Erro ao entrar com GitHub.'));
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('oficina_token');
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  const user = getUserById(req.userId);
  res.json({ user: publicUser(user), nextTier: invitesRequiredForNextTier(user) });
});

app.post('/api/billing/checkout', requireAuth, async (req, res) => {
  const { planId } = req.body || {};
  const plan = plans[planId];
  if (!plan || planId === 'gratis') {
    return res.status(400).json({ error: 'Plano pago inválido.' });
  }

  try {
    const user = getUserById(req.userId);
    const isRecurring = plan.type !== 'unico';
    const paymentLink = await asaasRequest('/paymentLinks', {
      method: 'POST',
      body: JSON.stringify({
        name: plan.name,
        description: `Plano ${plan.name} - Chequetto`,
        value: plan.amount,
        billingType: 'UNDEFINED',
        chargeType: isRecurring ? 'RECURRENT' : 'DETACHED',
        ...(isRecurring ? { subscriptionCycle: asaasSubscriptionCycle(plan) } : {}),
        dueDateLimitDays: 3,
        externalReference: `${user.id}:${planId}`,
      }),
    });
    if (!paymentLink.url) throw new Error('O Asaas não retornou o link de pagamento.');
    const subscription = createPendingSubscription({
      userId: req.userId,
      planId,
      amount: plan.amount,
      currency: plan.currency,
      gateway: 'asaas',
      gatewayCheckoutId: paymentLink.id,
    });

    res.status(202).json({
      status: subscription.status,
      subscriptionId: subscription.id,
      checkoutUrl: paymentLink.url,
    });
  } catch (error) {
    console.error('Erro ao criar checkout Asaas:', error.message);
    res.status(502).json({ error: error.message || 'Não foi possível iniciar o pagamento.' });
  }
});

app.post('/api/billing/asaas/webhook', (req, res) => {
  const expectedToken = process.env.ASAAS_WEBHOOK_TOKEN;
  if (expectedToken && req.headers['asaas-access-token'] !== expectedToken) {
    return res.status(401).json({ error: 'Webhook não autorizado.' });
  }

  const paymentEvents = new Set(['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED']);
  const payment = req.body?.payment;
  if (paymentEvents.has(req.body?.event) && payment?.externalReference) {
    const [userId] = payment.externalReference.split(':');
    if (userId) setUnlimited(userId, true);
  }

  res.status(202).json({ received: true });
});

// ---------- Geração com etapas em tempo real (Server-Sent Events) ----------

app.get('/generate/stream', async (req, res) => {
  const prompt = req.query.prompt;
  if (!prompt) {
    res.status(400).json({ error: 'Prompt não fornecido' });
    return;
  }

  const ip = clientIp(req);
  const anon = getAnonCredits(ip);
  if (anon.credits <= 0) {
    res.status(402).json({ error: 'Seus 20 créditos grátis acabaram por enquanto.' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    deductAnonCredit(ip);

    const { html, files, plano } = await gerarComGemini(prompt, [], (step) => send(step), req.query.lang);
    send({ stage: 'salvo_temp', html, files, plano });
  } catch (error) {
    console.error('Erro na geração:', error);
    send({ stage: 'erro', message: error.message || 'Erro ao processar requisição com IA' });
  } finally {
    res.end();
  }
});

// mantém a rota antiga funcionando também, sem streaming, pra compatibilidade
app.post('/generate', async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt não fornecido' });
    }

    const ip = clientIp(req);
    const anon = getAnonCredits(ip);
    if (anon.credits <= 0) {
      return res.status(402).json({ error: 'Seus 20 créditos grátis acabaram por enquanto.' });
    }
    deductAnonCredit(ip);

    const { html, files, plano } = await gerarComGemini(prompt, [], () => {});
    res.json({ code: html, files, plano });
  } catch (error) {
    console.error('Erro na geração:', error);
    res.status(500).json({ error: error.message || 'Erro ao processar requisição com IA' });
  }
});

app.post('/refine', async (req, res) => {
  const { html, pedido } = req.body || {};
  if (!html || !pedido) return res.status(400).json({ error: 'Aplicativo e pedido de alteração são obrigatórios' });
  try {
    const { html: codigo, files } = await refinarComGemini(html, pedido);
    res.json({ code: codigo, files });
  } catch (error) {
    console.error('Erro no refinamento:', error);
    res.status(500).json({ error: error.message || 'Erro ao aplicar alteração' });
  }
});

// ---------- Modo Planejamento: conversa livre, não consome crédito, não gera código ----------

app.post('/api/chat/discutir', async (req, res) => {
  const { mensagem, historico } = req.body || {};
  if (!mensagem) return res.status(400).json({ error: 'Mensagem vazia' });
  try {
    const resposta = await discutirComGemini(mensagem, Array.isArray(historico) ? historico : []);
    res.json({ resposta });
  } catch (error) {
    console.error('Erro na discussão:', error);
    res.status(500).json({ error: error.message || 'Erro ao conversar com a IA' });
  }
});

// ---------- Sugestões automáticas da IA após gerar/refinar (gratuitas) ----------

app.post('/api/sugestoes', async (req, res) => {
  const { files } = req.body || {};
  try {
    const sugestoes = await sugerirMelhorias(Array.isArray(files) ? files : []);
    res.json({ sugestoes });
  } catch (error) {
    console.error('Erro ao gerar sugestões:', error);
    res.json({ sugestoes: [] });
  }
});

// ---------- Sandbox real (bundler de verdade, via Sandpack) ----------

app.post('/api/sandbox-files', (req, res) => {
  const { files, lang } = req.body || {};
  try {
    const sandpackFiles = montarArquivosSandpack(Array.isArray(files) ? files : [], lang || 'pt');
    res.json({ files: sandpackFiles });
  } catch (error) {
    console.error('Erro ao montar arquivos do sandbox:', error);
    res.status(500).json({ error: error.message || 'Erro ao montar sandbox' });
  }
});

// Publica o projeto atual como um repositório novo no GitHub do próprio usuário.
// Usa o token de acesso do GitHub que o Firebase Auth entrega no login (com escopo "repo").
app.post('/api/github/publicar', async (req, res) => {
  const { githubToken, files, lang, nomeRepo } = req.body || {};
  try {
    if (!githubToken) {
      return res.status(400).json({ error: 'Você precisa entrar com o GitHub antes de publicar.' });
    }
    if (!Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: 'Nenhum arquivo pra publicar ainda.' });
    }

    const nomeLimpo = String(nomeRepo || 'meu-app-chequetto')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 90) || 'meu-app-chequetto';

    const headersGithub = {
      Authorization: `token ${githubToken}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    };

    // 1. Cria o repositório
    const criarResp = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers: headersGithub,
      body: JSON.stringify({ name: nomeLimpo, description: 'Gerado com Chequetto/Oficina', private: false, auto_init: false }),
    });
    const repoData = await criarResp.json();
    if (!criarResp.ok) {
      return res.status(criarResp.status).json({ error: repoData.message || 'Não foi possível criar o repositório no GitHub.' });
    }

    // 2. Converte pro formato de projeto React real (com imports, package.json etc.)
    const arquivosFinais = montarArquivosSandpack(files, lang || 'pt');
    const listaArquivos = Object.entries(arquivosFinais).map(([caminho, obj]) => ({
      caminho: caminho.replace(/^\//, ''),
      conteudo: obj.code,
    }));
    listaArquivos.push({
      caminho: 'README.md',
      conteudo: `# ${repoData.name}\n\nGerado com [Chequetto/Oficina](https://gerador-de-app-profissional.onrender.com/).\n\nPra rodar localmente:\n\n\`\`\`\nnpm install\nnpm start\n\`\`\`\n`,
    });

    // 3. Envia cada arquivo pro repositório recém-criado
    const falhas = [];
    for (const arquivo of listaArquivos) {
      const conteudoBase64 = Buffer.from(arquivo.conteudo, 'utf-8').toString('base64');
      const putResp = await fetch(
        `https://api.github.com/repos/${repoData.owner.login}/${repoData.name}/contents/${arquivo.caminho.split('/').map(encodeURIComponent).join('/')}`,
        {
          method: 'PUT',
          headers: headersGithub,
          body: JSON.stringify({ message: `Adiciona ${arquivo.caminho}`, content: conteudoBase64 }),
        }
      );
      if (!putResp.ok) {
        const erroArquivo = await putResp.json().catch(() => ({}));
        falhas.push(arquivo.caminho);
        console.warn(`Falha ao enviar ${arquivo.caminho} pro GitHub:`, erroArquivo.message);
      }
    }

    res.json({ url: repoData.html_url, nome: repoData.name, falhas });
  } catch (error) {
    console.error('Erro ao publicar no GitHub:', error);
    res.status(500).json({ error: 'Erro ao publicar no GitHub.' });
  }
});

// ---------- Salvar app gerado na plataforma ----------
// Sem sistema de login: o histórico "salvo" fica associado ao navegador
// (localStorage, no script.js) — aqui só persistimos o registro em si.

app.post('/api/projects/save', (req, res) => {
  const { prompt, plano, html, files, nome } = req.body || {};
  if (!html || !prompt) return res.status(400).json({ error: 'Dados incompletos para salvar' });

  const project = saveProject({ userId: null, prompt, plano, html, files, nome });
  res.json({ project: { id: project.id, nome: project.nome, created_at: project.created_at } });
});

app.get('/api/projects/:id', (req, res) => {
  const project = getProjectById(req.params.id);
  if (!project) return res.status(404).json({ error: 'Não encontrado' });
  project.plano = JSON.parse(project.plano || '[]');
  res.json({ project });
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`   Chaves carregadas: ${keys.length}`);
  console.log(`Servidor rodando com sucesso! (sem exigência de login — créditos por IP)`);
});
