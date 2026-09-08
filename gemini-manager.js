const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
const { registrarErro, listarErrosRecentes } = require('./db');

// Nome do modelo configurável por variável de ambiente — NÃO fixo no código.
// Lição aprendida com uma versão anterior deste projeto: a Google desativou
// o gemini-1.5-flash de uma hora pra outra, e como o nome estava fixo no
// código, quebrou tudo até alguém corrigir e re-implantar manualmente. Com
// isso configurável, dá pra trocar o modelo só mudando a variável de
// ambiente no Render, sem precisar mexer em código nem esperar um novo deploy.
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

// Limite de tokens de saída, também configurável. O valor anterior (8192)
// era baixo demais pra apps reais (com CSS, JS, várias telas/modais) — apps
// com bastante funcionalidade batiam no teto, a resposta vinha cortada, e
// ISSO SOZINHO já contava como falha (a chave é descartada e tenta a
// próxima, repetindo o problema em todas). 32768 dá bem mais fôlego.
const GEMINI_MAX_OUTPUT_TOKENS = Number(process.env.GEMINI_MAX_OUTPUT_TOKENS) || 32768;

// Se TODAS as chaves esgotarem por cota (429), espera e tenta o ciclo de
// chaves de novo, em vez de desistir na hora — cotas por minuto costumam
// resetar rápido. Não adianta esperar se o erro não for de cota (aí é um
// problema de verdade, esperar não resolve).
const GEMINI_ESPERA_COTA_MS = Number(process.env.GEMINI_ESPERA_COTA_MS) || 65000;
const GEMINI_RODADAS_EXTRAS_COTA = Number(process.env.GEMINI_RODADAS_EXTRAS_COTA) || 2;

// Palavras que indicam que um pedido de refino é "corrigir um erro" (e não
// só adicionar uma funcionalidade nova) — usado pra alimentar a memória de erros.
const PALAVRAS_DE_ERRO = ['erro', 'bug', 'não funciona', 'nao funciona', 'quebrou', 'quebrado', 'não abre', 'nao abre', 'corrig', 'consert', 'falha', 'travou', 'trava '];

function pareceCorrecaoDeErro(pedido) {
  const texto = String(pedido || '').toLowerCase();
  return PALAVRAS_DE_ERRO.some((palavra) => texto.includes(palavra));
}

// Descobre se o "último erro" ao esgotar todas as chaves foi por cota
// estourada (429/403) — isso muda completamente a mensagem que a pessoa
// precisa ver: não é um bug, é "espere um pouco ou use mais chaves".
function ehErroDeCota(err) {
  const status = err?.status;
  const texto = String(err?.message || '').toLowerCase();
  return status === 429 || status === 403 || texto.includes('quota') || texto.includes('rate limit') || texto.includes('429');
}

function mensagemErroFinal(ultimoErro, totalChaves) {
  if (ultimoErro && ehErroDeCota(ultimoErro)) {
    return `As ${totalChaves} chave${totalChaves > 1 ? 's' : ''} de API configurada${totalChaves > 1 ? 's' : ''} atingiram o limite de uso gratuito no momento (não é um erro no app). Espere alguns minutos e tente de novo, ou adicione mais chaves em GEMINI_API_KEYS.`;
  }
  return 'Todas as chaves de API falharam ao processar a requisição. Último erro: ' + (ultimoErro ? ultimoErro.message : 'desconhecido');
}

// Percorre todas as chaves tentando `tentarComChave(key)`. Se TODAS falharem
// por cota estourada (429), espera GEMINI_ESPERA_COTA_MS e repete o ciclo
// inteiro, até GEMINI_RODADAS_EXTRAS_COTA vezes extras. Se o erro não for de
// cota, desiste na hora (esperar não ia resolver um bug de verdade).
// `onTentativa(key)` é chamado antes de cada tentativa individual, e
// `onEsperando(segundos)` quando entra em espera entre rodadas.
async function tentarComTodasAsChaves(keys, tentarComChave, onTentativa = () => {}, onEsperando = () => {}) {
  let ultimoErro = null;

  for (let rodada = 0; rodada <= GEMINI_RODADAS_EXTRAS_COTA; rodada++) {
    for (const key of keys) {
      try {
        onTentativa(key);
        return await tentarComChave(key);
      } catch (err) {
        ultimoErro = err;
        console.warn('Falhou com uma chave, tentando a próxima...', err.message);
      }
    }

    const aindaTemRodadaSobrando = rodada < GEMINI_RODADAS_EXTRAS_COTA;
    if (aindaTemRodadaSobrando && ultimoErro && ehErroDeCota(ultimoErro)) {
      onEsperando(Math.round(GEMINI_ESPERA_COTA_MS / 1000));
      await new Promise((resolve) => setTimeout(resolve, GEMINI_ESPERA_COTA_MS));
    } else {
      break;
    }
  }

  throw ultimoErro || new Error('Nenhuma chave de API disponível.');
}

function getApiKeys() {
  const keys = (process.env.GEMINI_API_KEYS || '')
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean);
  for (let i = 1; i <= 10; i++) {
    const key = process.env[`GEMINI_API_KEY_${i}`];
    if (key) keys.push(key);
  }
  return [...new Set(keys)];
}

// ---------- Extração do HTML gerado (lógica comprovada da versão anterior) ----------
// Em vez de exigir um formato customizado nosso (marcadores ===ARQUIVO===) que
// a IA precisa "aprender" a seguir à risca, pedimos direto um HTML completo —
// formato natural que o modelo já sabe produzir bem — e extraímos com váRIAS
// estratégias de fallback, na ordem de mais específica pra mais tolerante.
function extrairHtml(texto) {
  const blocoMarkdown = texto.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (blocoMarkdown) {
    return blocoMarkdown[1].trim();
  }
  const doctypeIndex = texto.search(/<!DOCTYPE html>/i);
  const htmlIndex = texto.search(/<html/i);
  const start = doctypeIndex !== -1 ? doctypeIndex : htmlIndex;
  if (start !== -1) {
    return texto.slice(start).trim();
  }
  return texto.trim();
}

// Detecta o idioma declarado no <html lang="...">, se houver.
function detectarIdiomaDoShell(html) {
  const match = String(html || '').match(/<html\s+lang="([a-z]{2})"/i);
  return match ? match[1] : 'pt';
}

// Separa o HTML único (que a IA gera de forma confiável) em arquivos de
// verdade: index.html, style.css e script.js — um repositório real, igual
// ferramentas como o Lovable entregam. Feito por código determinístico (não
// pedindo pra IA seguir mais um formato customizado), então não tem risco
// de quebrar por causa de a IA "não seguir o formato direito".
function dividirHtmlEmArquivos(html) {
  let restante = String(html || '');

  let css = '';
  restante = restante.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (match, conteudo) => {
    css += conteudo + '\n';
    return '';
  });

  // Só puxa pra fora os <script> SEM atributo src (código escrito pela IA);
  // scripts com src (CDNs como React/Tailwind) continuam no HTML, intocados.
  let js = '';
  restante = restante.replace(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi, (match, conteudo) => {
    js += conteudo + '\n';
    return '';
  });

  const temCss = css.trim().length > 0;
  const temJs = js.trim().length > 0;

  if (temCss && /<\/head>/i.test(restante)) {
    restante = restante.replace(/<\/head>/i, '<link rel="stylesheet" href="style.css">\n</head>');
  }
  if (temJs && /<\/body>/i.test(restante)) {
    restante = restante.replace(/<\/body>/i, '<script src="script.js"></script>\n</body>');
  }

  const arquivos = [{ path: 'index.html', content: restante.trim() }];
  if (temCss) arquivos.push({ path: 'style.css', content: css.trim() });
  if (temJs) arquivos.push({ path: 'script.js', content: js.trim() });
  return arquivos;
}

function extrairLista(texto) {
  const linhas = texto
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^[-*\d.]/.test(l))
    .map((l) => l.replace(/^[-*\d.\s]+/, '').trim())
    .filter(Boolean);
  return linhas.length > 0 ? linhas.slice(0, 5) : [texto.trim().slice(0, 140)];
}

const INSTRUCAO_GLOBAL = `REGRAS PERMANENTES DA PLATAFORMA:
1. Ao atualizar, corrigir ou ajustar um aplicativo existente, preserve todo o código e comportamento que já funcionam. Faça somente as alterações necessárias no local correto; nunca reescreva o projeto inteiro do zero.
2. O projeto deve manter seu estado e dados de forma persistente. Implemente salvamento automático e restauração após atualização, fechamento ou reinicialização da página, sem perder o progresso do usuário.
   Para dados do app no navegador, use localStorage ou IndexedDB: salve cada alteração relevante e restaure o estado assim que a página abrir.
3. Siga exatamente o que foi pedido pelo usuário. Não invente funcionalidades, telas, textos ou mudanças que não foram solicitadas.
4. Se o trabalho for grande, organize a implementação em blocos coerentes, revise cada bloco e corrija os erros antes de entregar. A resposta final ainda deve ser um único HTML completo, autocontido e funcionando.
5. Antes de entregar, confira sintaxe, referências entre HTML/CSS/JavaScript e se todas as funcionalidades solicitadas estão presentes.
6. Essas regras fazem parte do produto e devem ser aplicadas em todos os aplicativos e sites gerados.`;

const INSTRUCAO_PLANO = `Você é o planejador do Oficina, um gerador de mini-aplicativos web.
Dado o pedido do usuário, responda com uma lista curta (3 a 5 itens) em português, cada item em uma linha
começando com "-", descrevendo os passos que você vai seguir para construir o app (ex: "Criar a estrutura da lista de tarefas",
"Adicionar campo de prioridade e prazo", "Estilizar com visual escuro e dourado"). Seja direto, sem explicações extras,
sem introdução, apenas a lista.`;

const INSTRUCAO_CODIGO = `Você é um gerador de mini-aplicativos web.
Responda APENAS com o código HTML completo (incluindo <style> e <script> internos, tudo em um único arquivo autocontido — pode usar Tailwind via <script src="https://cdn.tailwindcss.com"></script> pra estilizar rápido, ou CSS próprio no <style>).
NÃO escreva nenhuma explicação, introdução, comentário ou lista de funcionalidades antes ou depois do código.
NÃO use blocos de markdown com \`\`\`.
Sua resposta deve começar diretamente com <!DOCTYPE html> e terminar com </html>.`;

const INSTRUCAO_REVISAO = `Você é um revisor sênior de código web, extremamente cauteloso. Releia o HTML abaixo com atenção total, procurando erros reais: tags não fechadas, JavaScript com erro de sintaxe, funções chamadas mas nunca definidas, chaves/parênteses desbalanceados, elementos referenciados por getElementById que não existem.
Se encontrar problemas, corrija e devolva o HTML COMPLETO corrigido, seguindo as mesmas regras (só o HTML, sem explicação, sem markdown, começando com <!DOCTYPE html>).
Se não encontrar nenhum problema, responda só com a palavra OK, sem mais nada.
NÃO adicione nenhuma funcionalidade nova — só corrija problemas reais que você encontrar.`;

// Memória de erros: busca os últimos problemas já relatados/corrigidos e
// devolve um texto pronto pra injetar no prompt, pra IA não repetir a causa.
function errosConhecidosTexto() {
  try {
    const erros = listarErrosRecentes(6);
    if (!erros.length) return '';
    const linhas = erros.map((erro) => `- Pedido do usuário: "${erro.pedido}" → o que resolveu: ${erro.resumo_solucao || 'ajuste aplicado no refino'}`);
    return `\n\nErros já relatados e corrigidos antes nesta plataforma (evite reintroduzir essas mesmas causas de novo):\n${linhas.join('\n')}`;
  } catch {
    return '';
  }
}

async function chamarGemini(key, promptFinal) {
  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL, generationConfig: { maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS } });
  const result = await model.generateContent(promptFinal);
  const response = await result.response;
  const motivoParada = response.candidates?.[0]?.finishReason;
  if (motivoParada === 'MAX_TOKENS') {
    throw new Error('A resposta da IA foi cortada por ser grande demais (limite de tamanho atingido). Tente pedir algo um pouco mais simples, ou dividir o pedido em partes menores.');
  }
  return response.text();
}

// Igual a chamarGemini, mas transmite cada pedaço de texto conforme a IA
// escreve (via onChunk), pra a pessoa ver o código sendo gerado em tempo real.
async function chamarGeminiStream(key, promptFinal, onChunk = () => {}) {
  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL, generationConfig: { maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS } });
  const resultado = await model.generateContentStream(promptFinal);
  let textoCompleto = '';
  for await (const pedaco of resultado.stream) {
    const texto = pedaco.text();
    if (texto) {
      textoCompleto += texto;
      onChunk(texto);
    }
  }
  const respostaFinal = await resultado.response;
  const motivoParada = respostaFinal.candidates?.[0]?.finishReason;
  if (motivoParada === 'MAX_TOKENS') {
    throw new Error('A resposta da IA foi cortada por ser grande demais (limite de tamanho atingido). Tente pedir algo um pouco mais simples, ou dividir o pedido em partes menores.');
  }
  return textoCompleto;
}

// Autorrevisão: manda o HTML de volta pra IA pra ela mesma achar e corrigir
// erros óbvios antes de entregar. Como agora é só 1 arquivo, a resposta ou é
// o HTML corrigido inteiro, ou "OK" — sem risco de "esquecer" outros arquivos
// (não existem outros arquivos pra esquecer).
async function revisarHtml(html, language = 'pt') {
  const keys = getApiKeys();
  if (keys.length === 0) return html;

  for (const key of keys) {
    try {
      const texto = await chamarGemini(key, `${INSTRUCAO_REVISAO}\n\nHTML atual:\n${html}`);
      if (texto.trim().toUpperCase().startsWith('OK')) return html;
      const corrigido = extrairHtml(texto);
      // proteção básica: só aceita se realmente parecer um documento HTML válido
      return corrigido && /<html[\s>]/i.test(corrigido) ? corrigido : html;
    } catch (err) {
      console.warn('Erro na autorrevisão com uma das chaves, tentando a próxima...', err.message);
    }
  }
  return html;
}

// Gera o plano (etapa 1) e o HTML completo do app (etapa 2), narrando cada etapa via onStep(texto)
async function gerarComGemini(prompt, history = [], onStep = () => {}, language = 'pt') {
  const keys = getApiKeys();
  if (keys.length === 0) {
    throw new Error('Nenhuma chave de API configurada.');
  }

  let ultimoErro = null;
  let plano = [];

  // ETAPA 1: planejar
  onStep({ stage: 'planejando', message: 'Analisando o que você pediu...' });
  for (const key of keys) {
    try {
      const textoPlano = await chamarGemini(key, `${INSTRUCAO_GLOBAL}\n\nIdioma de resposta: ${language}. Gere o plano neste idioma.\n${INSTRUCAO_PLANO}\n\nPedido do usuário: ${prompt}`);
      plano = extrairLista(textoPlano);
      break;
    } catch (err) {
      ultimoErro = err;
      console.warn('Erro no planejamento com uma das chaves, tentando a próxima...', err.message);
    }
  }
  if (plano.length === 0) {
    plano = ['Montando seu aplicativo...'];
  }
  onStep({ stage: 'planejando', message: 'Plano pronto', plano });

  // ETAPA 2: gerar o HTML de verdade
  try {
    const resultado = await tentarComTodasAsChaves(
      keys,
      async (key) => {
        const promptFinal = `${INSTRUCAO_GLOBAL}\n\nIdioma obrigatório do aplicativo e dos textos: ${language}.\n${INSTRUCAO_CODIGO}\n\nPedido do usuário: ${prompt}\n\nPlano a seguir:\n${plano.join('\n')}${errosConhecidosTexto()}`;
        const textoBruto = await chamarGeminiStream(key, promptFinal, (pedaco) => {
          onStep({ stage: 'escrevendo_ao_vivo', chunk: pedaco });
        });
        let html = extrairHtml(textoBruto);

        onStep({ stage: 'revisando', message: 'Revisando o código antes de entregar...' });
        html = await revisarHtml(html, language);
        return html;
      },
      () => {
        // Emite 'criando' a CADA tentativa (não só uma vez) — o front-end
        // limpa a caixinha de código nesse sinal; sem isso, se uma chave
        // falhasse no meio, o texto da tentativa anterior ficava acumulado
        // visualmente junto com o da nova tentativa.
        onStep({ stage: 'criando', message: 'Escrevendo o código do aplicativo...' });
      },
      (segundos) => {
        onStep({ stage: 'aguardando_cota', message: `Todas as chaves atingiram o limite de uso no momento. Aguardando ${segundos}s pra tentar de novo...`, segundos });
      }
    );
    const files = [{ path: 'index.html', content: resultado }];
    onStep({ stage: 'concluido', message: 'Aplicativo pronto!' });
    return { html: resultado, files, plano };
  } catch (err) {
    ultimoErro = err;
  }

  onStep({ stage: 'erro', message: 'Não foi possível gerar o aplicativo.' });
  throw new Error(mensagemErroFinal(ultimoErro, keys.length));
}

async function refinarComGemini(htmlAtual, pedido, onStep = () => {}) {
  const keys = getApiKeys();
  if (keys.length === 0) throw new Error('Nenhuma chave de API configurada.');

  const language = detectarIdiomaDoShell(htmlAtual);

  const instrucao = `${INSTRUCAO_GLOBAL}

${INSTRUCAO_CODIGO}

Você está refinando um aplicativo existente. Preserve tudo que já funciona e aplique somente as mudanças pedidas.
Garanta que o resultado continue sendo um único documento HTML completo e autocontido.

Pedido de refinamento: ${pedido}

Código atual:
${htmlAtual}${errosConhecidosTexto()}`;

  try {
    const resultado = await tentarComTodasAsChaves(
      keys,
      async (key) => {
        const textoBruto = await chamarGeminiStream(key, instrucao, (pedaco) => {
          onStep({ stage: 'escrevendo_ao_vivo', chunk: pedaco });
        });
        let html = extrairHtml(textoBruto);

        onStep({ stage: 'revisando', message: 'Revisando a alteração antes de entregar...' });
        html = await revisarHtml(html, language);
        return html;
      },
      () => {
        onStep({ stage: 'refinando', message: 'Aplicando as alterações no aplicativo...' });
      },
      (segundos) => {
        onStep({ stage: 'aguardando_cota', message: `Todas as chaves atingiram o limite de uso no momento. Aguardando ${segundos}s pra tentar de novo...`, segundos });
      }
    );

    if (pareceCorrecaoDeErro(pedido)) {
      try {
        registrarErro({ pedido, resumoErro: pedido, resumoSolucao: 'Corrigido via refino (revisão automática aplicada).' });
      } catch (err) {
        console.warn('Não foi possível registrar na memória de erros (não bloqueia o refino):', err.message);
      }
    }

    const files = [{ path: 'index.html', content: resultado }];
    onStep({ stage: 'concluido', message: 'Alteração aplicada!' });
    return { html: resultado, files };
  } catch (err) {
    throw new Error(mensagemErroFinal(err, keys.length));
  }
}

const INSTRUCAO_DISCUSSAO = `Você é um consultor técnico e de produto do Oficina, uma plataforma que gera mini-aplicativos web com IA.
Aqui você está no MODO PLANEJAMENTO: converse com a pessoa, tire dúvidas, sugira arquitetura de telas/banco de dados, discuta ideias.
NÃO gere código nenhum e NÃO produza um app aqui — isso só acontece no Modo Construção, separadamente.
Seja direto, útil e breve (poucos parágrafos curtos, sem enrolação). Responda em português.`;

const INSTRUCAO_SUGESTOES = `Você é o consultor do Oficina. Olhando o código de um app que acabou de ser gerado, sugira 3 melhorias profissionais de alto nível que a pessoa poderia pedir em seguida.
Responda com exatamente 3 linhas, cada uma começando com "-", curtas (até 8 palavras), no imperativo (ex: "Adicionar validação de formulário", "Criar modo escuro", "Adicionar filtro de busca").
Nada além das 3 linhas — sem introdução, sem explicação.`;

// Modo Planejamento: só conversa, não gera nem altera código, não consome crédito.
async function discutirComGemini(mensagem, historico = []) {
  const keys = getApiKeys();
  if (keys.length === 0) throw new Error('Nenhuma chave de API configurada.');

  const contexto = historico
    .slice(-10)
    .map((item) => `${item.autor === 'user' ? 'Usuário' : 'Você'}: ${item.texto}`)
    .join('\n');

  const promptFinal = `${INSTRUCAO_DISCUSSAO}\n\n${contexto ? `Conversa até agora:\n${contexto}\n\n` : ''}Usuário: ${mensagem}`;

  let ultimoErro = null;
  for (const key of keys) {
    try {
      return (await chamarGemini(key, promptFinal)).trim();
    } catch (err) {
      ultimoErro = err;
      console.warn('Erro na discussão com uma das chaves, tentando a próxima...', err.message);
    }
  }
  throw new Error('Não foi possível responder agora. Último erro: ' + (ultimoErro?.message || 'desconhecido'));
}

// Depois de gerar/refinar: sugere 3 melhorias de alto nível, exibidas como chips clicáveis.
async function sugerirMelhorias(files) {
  const keys = getApiKeys();
  if (keys.length === 0) return [];

  const resumoArquivos = (files || [])
    .map((arquivo) => `// ${arquivo.path}\n${arquivo.content.slice(0, 2000)}`)
    .join('\n\n');

  for (const key of keys) {
    try {
      const texto = await chamarGemini(key, `${INSTRUCAO_SUGESTOES}\n\nCódigo do app:\n${resumoArquivos}`);
      const sugestoes = extrairLista(texto);
      return sugestoes.slice(0, 3);
    } catch (err) {
      console.warn('Erro ao gerar sugestões com uma das chaves, tentando a próxima...', err.message);
    }
  }
  return [];
}

// ---------- Conversão pro Sandbox real (Sandpack / bundler de verdade) ----------

function nomeDoComponente(conteudo) {
  const match = String(conteudo || '').match(/function\s+([A-Za-z0-9_]+)\s*\(/);
  return match ? match[1] : null;
}

function caminhoRelativo(deArquivo, paraArquivo) {
  const dirDe = path.dirname(deArquivo);
  let rel = path.relative(dirDe, paraArquivo).replace(/\.jsx?$/, '').split(path.sep).join('/');
  if (!rel.startsWith('.')) rel = './' + rel;
  return rel;
}

// Converte os arquivos gerados pro formato que o Sandpack entende.
// Caso principal (hoje): um único HTML autocontido — usa o template "static"
// do Sandpack, que serve o HTML direto, sem bundler nenhum (mais simples e confiável).
// Caso legado: se algum projeto salvo antes ainda estiver no formato antigo de
// múltiplos componentes React (sem import/export), monta como React/CRA.
function montarArquivosSandpack(arquivos, language = 'pt') {
  const lista = Array.isArray(arquivos) ? arquivos : [];

  const ehHtmlUnico = lista.length === 1 && /<!DOCTYPE html>|<html[\s>]/i.test(lista[0].content || '');
  if (ehHtmlUnico) {
    const arquivosSeparados = dividirHtmlEmArquivos(lista[0].content);
    const sandpackFiles = {};
    arquivosSeparados.forEach((arquivo) => {
      sandpackFiles['/' + arquivo.path] = { code: arquivo.content };
    });
    sandpackFiles['/package.json'] = {
      code: JSON.stringify({
        name: 'meu-app-chequetto',
        version: '0.1.0',
        private: true,
        scripts: { start: 'npx --yes serve -s . -l 3000' },
      }, null, 2),
    };
    return sandpackFiles;
  }

  // ---- formato legado (múltiplos componentes React sem import/export) ----
  const mapaComponentes = {};
  lista.forEach((arquivo) => {
    const nome = nomeDoComponente(arquivo.content);
    if (nome) mapaComponentes[nome] = arquivo.path;
  });

  const sandpackFiles = {};

  lista.forEach((arquivo) => {
    const nomeProprio = nomeDoComponente(arquivo.content);
    const usados = new Set();
    Object.keys(mapaComponentes).forEach((nomeComponente) => {
      if (nomeComponente === nomeProprio) return;
      const regexUso = new RegExp(`<${nomeComponente}[\\s/>]`);
      if (regexUso.test(arquivo.content)) usados.add(nomeComponente);
    });

    const importsComponentes = [...usados]
      .map((nomeComponente) => `import ${nomeComponente} from '${caminhoRelativo(arquivo.path, mapaComponentes[nomeComponente])}';`)
      .join('\n');

    const cabecalho = `import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';\n${importsComponentes ? importsComponentes + '\n' : ''}`;
    const rodape = nomeProprio ? `\n\nexport default ${nomeProprio};` : '';
    const caminho = '/' + arquivo.path.replace(/\.jsx$/, '.js');

    sandpackFiles[caminho] = { code: `${cabecalho}\n${arquivo.content}${rodape}` };
  });

  sandpackFiles['/index.js'] = {
    code: `import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport App from './App';\n\nReactDOM.createRoot(document.getElementById('root')).render(<App />);`,
  };
  sandpackFiles['/public/index.html'] = {
    code: `<!DOCTYPE html>\n<html lang="${language}">\n<head>\n<meta charset="UTF-8" />\n<script src="https://cdn.tailwindcss.com"></script>\n</head>\n<body>\n<div id="root"></div>\n</body>\n</html>`,
  };
  sandpackFiles['/package.json'] = {
    code: JSON.stringify({
      name: 'meu-app-chequetto',
      version: '0.1.0',
      private: true,
      dependencies: { react: '18.2.0', 'react-dom': '18.2.0', 'react-scripts': '5.0.1' },
      scripts: { start: 'react-scripts start', build: 'react-scripts build', test: 'react-scripts test', eject: 'react-scripts eject' },
      eslintConfig: { extends: ['react-app'] },
      browserslist: {
        production: ['>0.2%', 'not dead', 'not op_mini all'],
        development: ['last 1 chrome version', 'last 1 firefox version', 'last 1 safari version'],
      },
    }, null, 2),
  };

  return sandpackFiles;
}

// Diz ao front qual template do Sandpack usar pros arquivos que acabaram de
// ser montados — "static" pro HTML único (caso comum), "create-react-app"
// pro formato legado de múltiplos componentes.
function templateSandpackPara(arquivos) {
  const lista = Array.isArray(arquivos) ? arquivos : [];
  const ehHtmlUnico = lista.length === 1 && /<!DOCTYPE html>|<html[\s>]/i.test(lista[0].content || '');
  return ehHtmlUnico ? 'static' : 'create-react-app';
}

// Igual ao montarArquivosSandpack, mas pra arquivos que JÁ vieram de um
// repositório real (imports de verdade, própria estrutura de pastas) — como
// os que a IA gera aqui são um HTML único, essa variante não tenta "adivinhar"
// nada, só empacota o que já veio pronto. Usada só pelo importar do GitHub.
function prepararArquivosImportados(arquivos) {
  const lista = Array.isArray(arquivos) ? arquivos : [];
  const sandpackFiles = {};
  let temPackageJson = false;
  let temIndexHtml = false;
  let temEntryPoint = false;

  lista.forEach((arquivo) => {
    const caminho = '/' + arquivo.path.replace(/^\/+/, '');
    sandpackFiles[caminho] = { code: arquivo.content };
    if (caminho === '/package.json') temPackageJson = true;
    if (caminho === '/public/index.html' || caminho === '/index.html') temIndexHtml = true;
    if (['/index.js', '/index.jsx', '/src/index.js', '/src/index.jsx'].includes(caminho)) temEntryPoint = true;
  });

  if (!temIndexHtml) {
    sandpackFiles['/public/index.html'] = {
      code: `<!DOCTYPE html>\n<html>\n<head>\n<meta charset="UTF-8" />\n<script src="https://cdn.tailwindcss.com"></script>\n</head>\n<body>\n<div id="root"></div>\n</body>\n</html>`,
    };
  }

  if (!temPackageJson) {
    sandpackFiles['/package.json'] = {
      code: JSON.stringify({
        name: 'projeto-importado',
        version: '0.1.0',
        private: true,
        dependencies: { react: '18.2.0', 'react-dom': '18.2.0', 'react-scripts': '5.0.1' },
        scripts: { start: 'react-scripts start', build: 'react-scripts build' },
      }, null, 2),
    };
  }

  if (!temEntryPoint) {
    const temApp = Object.keys(sandpackFiles).some((c) => /\/App\.(js|jsx|tsx)$/.test(c));
    sandpackFiles['/index.js'] = {
      code: temApp
        ? `import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport App from './App';\n\nReactDOM.createRoot(document.getElementById('root')).render(<App />);`
        : `import React from 'react';\nimport ReactDOM from 'react-dom/client';\n\nReactDOM.createRoot(document.getElementById('root')).render(<div>Repositório importado — abra o arquivo certo na aba de edição pra ver o componente principal.</div>);`,
    };
  }

  return sandpackFiles;
}

module.exports = {
  gerarComGemini,
  refinarComGemini,
  discutirComGemini,
  sugerirMelhorias,
  montarArquivosSandpack,
  templateSandpackPara,
  prepararArquivosImportados,
  getApiKeys,
};
