const { GoogleGenerativeAI } = require('@google/generative-ai');

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

// ---------- Extração e (re)montagem de arquivos multi-componente ----------

// Extrai o código de um componente único (fallback para quando a IA não
// segue o formato de múltiplos arquivos, ou para compatibilidade com o
// formato antigo de componente único).
function extrairComponenteReact(texto) {
  const blocoMarkdown = texto.match(/```(?:jsx|javascript|js|tsx)?\s*([\s\S]*?)```/i);
  let codigo = blocoMarkdown ? blocoMarkdown[1] : texto;
  const inicio = codigo.search(/function\s+App\s*\(/);
  if (inicio !== -1) codigo = codigo.slice(inicio);
  return codigo.trim();
}

// Extrai a lista de arquivos da resposta bruta da IA, no formato:
// ===ARQUIVO: caminho/Nome.jsx===
// <código>
// ===FIM===
// Formato escolhido (em vez de JSON) para não sofrer com problemas de
// escape de aspas/quebras de linha dentro do código gerado.
function extrairArquivos(texto) {
  const regex = /===ARQUIVO:\s*([^\n=]+?)\s*===\n([\s\S]*?)\n===FIM===/g;
  const arquivos = [];
  let match;
  while ((match = regex.exec(texto)) !== null) {
    const path = match[1].trim();
    const content = match[2].trim();
    if (path && content) arquivos.push({ path, content });
  }

  if (arquivos.length === 0) {
    // a IA não seguiu o formato pedido: trata a resposta inteira como App.jsx
    arquivos.push({ path: 'App.jsx', content: extrairComponenteReact(texto) });
  }
  if (!arquivos.some((arquivo) => arquivo.path === 'App.jsx')) {
    throw new Error('A resposta da IA não incluiu o arquivo App.jsx.');
  }
  return arquivos;
}

// Garante que App.jsx seja sempre o último a ser declarado/renderizado,
// já que ele referencia os demais componentes.
function ordenarParaRenderizacao(arquivos) {
  const app = arquivos.find((arquivo) => arquivo.path === 'App.jsx');
  const outros = arquivos.filter((arquivo) => arquivo.path !== 'App.jsx');
  return [...outros, app];
}

// Detecta o idioma declarado no <html lang="..."> de um shell já montado.
function detectarIdiomaDoShell(html) {
  const match = String(html || '').match(/<html\s+lang="([a-z]{2})"/i);
  return match ? match[1] : 'pt';
}

// Extrai de volta a lista de arquivos de dentro do shell HTML já montado
// (usado no refinamento, pra não reenviar todo o boilerplate de CDN pra IA
// nem perder a divisão em arquivos entre uma geração e outra).
function extrairArquivosDoShell(html) {
  const texto = String(html || '');
  const regex = /<script type="text\/babel" data-presets="react" data-arquivo="([^"]+)">\n([\s\S]*?)\n<\/script>/g;
  const arquivos = [];
  let match;
  while ((match = regex.exec(texto)) !== null) {
    arquivos.push({ path: match[1], content: match[2].trim() });
  }
  if (arquivos.length > 0) return arquivos;

  // compatibilidade com o formato antigo (componente único, sem data-arquivo)
  const antigo = texto.match(/data-presets="react">\s*const \{ useState[\s\S]*?\n\n([\s\S]*?)\n\nReactDOM\.createRoot/);
  if (antigo) return [{ path: 'App.jsx', content: antigo[1].trim() }];

  return [{ path: 'App.jsx', content: extrairComponenteReact(texto) }];
}

// Monta o HTML completo e autocontido a partir dos arquivos gerados:
// React, ReactDOM e Babel standalone via CDN (compila JSX no navegador) + Tailwind CDN.
// Cada arquivo vira um <script type="text/babel"> próprio, na mesma página —
// scripts clássicos (não-módulo) compartilham o mesmo escopo global/léxico,
// então os componentes conseguem se chamar uns aos outros sem import/export.
// O resultado final continua sendo um único HTML — mantém 100% de compatibilidade
// com o preview em iframe, o "Baixar .html" e o "Salvar na Oficina" já existentes.
function montarShellReact(arquivos, language = 'pt') {
  const ordenados = ordenarParaRenderizacao(arquivos);
  const blocosArquivos = ordenados
    .map((arquivo) => `<script type="text/babel" data-presets="react" data-arquivo="${arquivo.path}">\n${arquivo.content}\n</script>`)
    .join('\n');

  return `<!DOCTYPE html>
<html lang="${language}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>App gerado — Oficina</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
<script src="https://cdn.tailwindcss.com"></script>
<style>html,body,#root{height:100%;margin:0;}</style>
</head>
<body>
<div id="root"></div>
<script type="text/babel" data-presets="react">
const { useState, useEffect, useRef, useMemo, useCallback } = React;
</script>
${blocosArquivos}
<script type="text/babel" data-presets="react">
ReactDOM.createRoot(document.getElementById('root')).render(<App />);
</script>
</body>
</html>`;
}

function extrairLista(texto) {
  // pega linhas que parecem itens de lista (-, *, ou numeradas) e limpa
  const linhas = texto
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^[-*\d.]/.test(l))
    .map((l) => l.replace(/^[-*\d.\s]+/, '').trim())
    .filter(Boolean);
  return linhas.length > 0 ? linhas.slice(0, 5) : [texto.trim().slice(0, 140)];
}

const INSTRUCAO_GLOBAL = `REGRAS PERMANENTES DA PLATAFORMA:
1. Ao atualizar, corrigir ou ajustar um aplicativo existente, preserve todo o código e comportamento que já funcionam. Faça somente as alterações necessárias no arquivo correto; nunca reescreva tudo do zero.
2. O app deve manter seu estado e dados de forma persistente. Use useState/useEffect junto com localStorage ou IndexedDB: salve cada alteração relevante e restaure o estado assim que o componente montar.
3. Siga exatamente o que foi pedido pelo usuário. Não invente funcionalidades, telas, textos ou mudanças que não foram solicitadas.
4. Se o trabalho for grande, organize a implementação em blocos coerentes (arquivos/componentes bem divididos), revise cada bloco e corrija os erros antes de entregar.
5. Antes de entregar, confira sintaxe JSX, hooks usados corretamente e se todas as funcionalidades solicitadas estão presentes em algum dos arquivos.
6. Essas regras fazem parte do produto e devem ser aplicadas em todos os aplicativos gerados.`;

const INSTRUCAO_PLANO = `Você é o planejador do Oficina, um gerador de mini-aplicativos web em React.
Dado o pedido do usuário, responda com uma lista curta (3 a 5 itens) em português, cada item em uma linha
começando com "-", descrevendo os passos que você vai seguir para construir o app (ex: "Criar a estrutura da lista de tarefas",
"Adicionar campo de prioridade e prazo", "Estilizar com visual escuro e dourado"). Seja direto, sem explicações extras,
sem introdução, apenas a lista.`;

const INSTRUCAO_CODIGO = `Você é um gerador de mini-aplicativos web usando React 18 e Tailwind CSS.
Organize o app em um ou mais arquivos de componente (divida em mais arquivos só quando isso deixar o código mais organizado — apps simples podem ter um único arquivo).

Responda ESTRITAMENTE neste formato de texto simples, um bloco por arquivo, nada além disso:

===ARQUIVO: App.jsx===
function App() {
  ...
}
===FIM===

===ARQUIVO: components/NomeDoComponente.jsx===
function NomeDoComponente() {
  ...
}
===FIM===

Regras obrigatórias:
- Sempre inclua um arquivo "App.jsx" contendo "function App() {...}" — é o componente raiz, o único que é renderizado diretamente.
- Cada arquivo define exatamente um componente funcional (uma função por arquivo), com hooks (useState, useEffect etc.) quando necessário e Tailwind para todo o estilo.
- NÃO use import/export. Os componentes de arquivos diferentes compartilham o mesmo escopo global e podem ser chamados diretamente uns pelos outros só pelo nome da função (ex: <NomeDoComponente />).
- React, ReactDOM e os hooks (useState, useEffect, useRef, useMemo, useCallback) já estão disponíveis globalmente, não precisa importar.
- NÃO escreva nenhuma explicação, comentário fora do código, introdução ou blocos de markdown com \`\`\`.
- NÃO use os marcadores "===ARQUIVO===" ou "===FIM===" dentro do próprio código de um arquivo.`;

async function chamarGemini(key, promptFinal) {
  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({ model: 'gemini-3.6-flash' });
  const result = await model.generateContent(promptFinal);
  const response = await result.response;
  return response.text();
}

// Gera o plano (etapa 1) e os arquivos do app (etapa 2), narrando cada etapa via onStep(texto)
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

  // ETAPA 2: gerar os arquivos de verdade
  onStep({ stage: 'criando', message: 'Escrevendo o código do aplicativo...' });
  for (const key of keys) {
    try {
      const promptFinal = `${INSTRUCAO_GLOBAL}\n\nIdioma obrigatório do aplicativo e dos textos: ${language}.\n${INSTRUCAO_CODIGO}\n\nPedido do usuário: ${prompt}\n\nPlano a seguir:\n${plano.join('\n')}`;
      const textoBruto = await chamarGemini(key, promptFinal);
      const files = extrairArquivos(textoBruto);
      const html = montarShellReact(files, language);
      onStep({ stage: 'concluido', message: 'Aplicativo pronto!' });
      return { html, files, plano };
    } catch (err) {
      console.warn('Erro na geração com uma das chaves, tentando a próxima...', err.message);
      ultimoErro = err;
    }
  }

  onStep({ stage: 'erro', message: 'Não foi possível gerar o aplicativo.' });
  throw new Error(
    'Todas as chaves de API falharam ao processar a requisição. Último erro: ' +
    (ultimoErro ? ultimoErro.message : 'desconhecido')
  );
}

async function refinarComGemini(htmlAtual, pedido, onStep = () => {}) {
  const keys = getApiKeys();
  if (keys.length === 0) throw new Error('Nenhuma chave de API configurada.');

  const arquivosAtuais = extrairArquivosDoShell(htmlAtual);
  const language = detectarIdiomaDoShell(htmlAtual);
  const listaAtual = arquivosAtuais
    .map((arquivo) => `===ARQUIVO: ${arquivo.path}===\n${arquivo.content}\n===FIM===`)
    .join('\n\n');

  const instrucao = `${INSTRUCAO_GLOBAL}

${INSTRUCAO_CODIGO}

Você está refinando um aplicativo React existente, já organizado em arquivos. Preserve tudo que já funciona e aplique somente as mudanças pedidas.
Devolva a lista COMPLETA e atualizada de arquivos, no mesmo formato — inclusive os arquivos que não mudaram, sem omitir nenhum.

Pedido de refinamento: ${pedido}

Arquivos atuais:
${listaAtual}`;

  onStep({ stage: 'refinando', message: 'Aplicando as alterações no aplicativo...' });
  let ultimoErro = null;
  for (const key of keys) {
    try {
      const files = extrairArquivos(await chamarGemini(key, instrucao));
      const html = montarShellReact(files, language);
      onStep({ stage: 'concluido', message: 'Alteração aplicada!' });
      return { html, files };
    } catch (err) {
      ultimoErro = err;
      console.warn('Erro no refinamento com uma das chaves, tentando a próxima...', err.message);
    }
  }
  throw new Error('Não foi possível aplicar o refinamento. Último erro: ' + (ultimoErro?.message || 'desconhecido'));
}

const INSTRUCAO_DISCUSSAO = `Você é um consultor técnico e de produto do Oficina, uma plataforma que gera mini-aplicativos web com IA.
Aqui você está no MODO PLANEJAMENTO: converse com a pessoa, tire dúvidas, sugira arquitetura de telas/banco de dados, discuta ideias.
NÃO gere código nenhum e NÃO produza um app aqui — isso só acontece no Modo Construção, separadamente.
Seja direto, útil e breve (poucos parágrafos curtos, sem enrolação). Responda em português.`;

const INSTRUCAO_SUGESTOES = `Você é o consultor do Oficina. Olhando o código de um app React que acabou de ser gerado, sugira 3 melhorias profissionais de alto nível que a pessoa poderia pedir em seguida.
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
    .map((arquivo) => `// ${arquivo.path}\n${arquivo.content.slice(0, 600)}`)
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

module.exports = { gerarComGemini, refinarComGemini, discutirComGemini, sugerirMelhorias, getApiKeys };
