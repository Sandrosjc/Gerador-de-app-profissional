// sandbox-real.js — roda o app gerado num bundler de verdade (Sandpack, o
// motor por trás do CodeSandbox), diferente do preview rápido padrão que só
// compila com Babel no navegador. Carregado como <script type="module">.
// Expõe window.chequettoSandbox.render(files) pro script.js chamar.
// Também monta um editor simples (lista de arquivos + textarea) que aplica
// mudanças direto no sandbox ao vivo, sem precisar gerar tudo de novo.

import { loadSandpackClient } from "https://esm.sh/@codesandbox/sandpack-client@2.19.8";

let clientAtual = null;
let carregando = false;
let arquivosAtuais = [];
let arquivoSelecionado = null;
let modoImportado = false; // true quando os arquivos vieram de um repositório real (já com imports)

// Corre uma Promise contra um cronômetro — se estourar o tempo, rejeita com
// uma mensagem clara em vez de deixar a pessoa olhando um símbolo girando pra sempre.
function comLimiteDeTempo(promessa, ms, mensagemTimeout) {
  return Promise.race([
    promessa,
    new Promise((_, reject) => setTimeout(() => reject(new Error(mensagemTimeout)), ms)),
  ]);
}

async function montarArquivosNoServidor(files, jaTemImports = false) {
  const res = await fetch('/api/sandbox-files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files, lang: document.documentElement.lang || 'pt', jaTemImports }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erro ao montar arquivos do sandbox');
  return data.files;
}

function montarListaDeArquivos() {
  const container = document.getElementById('sandboxEditorFiles');
  const textarea = document.getElementById('sandboxEditorTextarea');
  if (!container) return;
  container.innerHTML = '';
  arquivosAtuais.forEach((arquivo) => {
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'sandbox-editor__file' + (arquivo.path === arquivoSelecionado ? ' is-active' : '');
    botao.textContent = arquivo.path;
    botao.addEventListener('click', () => {
      arquivoSelecionado = arquivo.path;
      if (textarea) textarea.value = arquivo.content;
      montarListaDeArquivos();
    });
    container.appendChild(botao);
  });
  if (!arquivoSelecionado && arquivosAtuais.length) {
    arquivoSelecionado = arquivosAtuais[0].path;
    if (textarea) textarea.value = arquivosAtuais[0].content;
    montarListaDeArquivos();
  }
}

// Aplica a edição feita na textarea: atualiza o arquivo em memória, remonta
// pro formato do Sandpack e empurra pro iframe ao vivo (hot update).
async function aplicarEdicao() {
  const textarea = document.getElementById('sandboxEditorTextarea');
  const botaoAplicar = document.getElementById('btnAplicarEdicaoSandbox');
  if (!textarea || !arquivoSelecionado || !clientAtual) return;

  const arquivo = arquivosAtuais.find((item) => item.path === arquivoSelecionado);
  if (!arquivo) return;
  arquivo.content = textarea.value;

  const original = botaoAplicar.textContent;
  botaoAplicar.disabled = true;
  botaoAplicar.textContent = 'Aplicando...';
  try {
    const sandpackFiles = await montarArquivosNoServidor(arquivosAtuais, modoImportado);
    await clientAtual.updateSandbox({ files: sandpackFiles, template: 'create-react-app' });
    // Avisa o script.js que os arquivos mudaram, pra manter tudo em sincronia
    // (refino, publicar no GitHub, etc. devem usar a versão editada).
    window.dispatchEvent(new CustomEvent('chequetto:sandbox-arquivos-editados', { detail: { files: arquivosAtuais } }));
    botaoAplicar.textContent = 'Aplicado ✓';
  } catch (error) {
    console.error('[SANDBOX REAL] erro ao aplicar edição', error);
    botaoAplicar.textContent = 'Erro ao aplicar';
  } finally {
    setTimeout(() => { botaoAplicar.textContent = original; botaoAplicar.disabled = false; }, 1600);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btnAplicarEdicaoSandbox')?.addEventListener('click', aplicarEdicao);
});

async function render(files, jaTemImports = false) {
  const hint = document.getElementById('sandboxHint');
  const body = document.getElementById('sandboxBody');
  const frame = document.getElementById('sandboxFrame');
  if (!frame) return;

  if (!files || !files.length) {
    if (hint) {
      hint.hidden = false;
      hint.textContent = 'Gere um app primeiro — depois volte nessa aba pra ver ele rodando num bundler de verdade.';
    }
    if (body) body.hidden = true;
    return;
  }

  if (carregando) return;
  carregando = true;
  arquivosAtuais = files.map((arquivo) => ({ ...arquivo }));
  arquivoSelecionado = null;
  modoImportado = jaTemImports;

  if (hint) {
    hint.hidden = false;
    hint.textContent = 'Montando o sandbox real (isso pode levar alguns segundos na primeira vez)...';
  }
  if (body) body.hidden = true;

  try {
    const sandpackFiles = await montarArquivosNoServidor(files, jaTemImports);

    if (!clientAtual) {
      clientAtual = await comLimiteDeTempo(
        loadSandpackClient(
          frame,
          { files: sandpackFiles, template: 'create-react-app' },
          { showOpenInCodeSandbox: false, showErrorScreen: true, showLoadingScreen: true }
        ),
        20000,
        'O sandbox real demorou demais pra carregar (mais de 20 segundos) e foi cancelado.'
      );
    } else {
      await comLimiteDeTempo(
        clientAtual.updateSandbox({ files: sandpackFiles, template: 'create-react-app' }),
        20000,
        'O sandbox real demorou demais pra atualizar (mais de 20 segundos) e foi cancelado.'
      );
    }

    montarListaDeArquivos();
    if (hint) hint.hidden = true;
    if (body) body.hidden = false;
  } catch (error) {
    console.error('[SANDBOX REAL] erro ao montar', error);
    if (hint) {
      hint.hidden = false;
      hint.textContent = 'Não foi possível carregar o sandbox real agora: ' + (error.message || 'erro desconhecido') + '. O preview rápido (aba Prévia) continua funcionando normalmente.';
    }
  } finally {
    carregando = false;
  }
}

window.chequettoSandbox = { render };
