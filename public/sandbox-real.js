// sandbox-real.js — roda o app gerado num bundler de verdade (Sandpack, o
// motor por trás do CodeSandbox), diferente do preview rápido padrão que só
// compila com Babel no navegador. Carregado como <script type="module">.
// Expõe window.chequettoSandbox.render(files) pro script.js chamar.

import { loadSandpackClient } from "https://esm.sh/@codesandbox/sandpack-client@2.19.8";

let clientAtual = null;
let carregando = false;

async function montarArquivosNoServidor(files) {
  const res = await fetch('/api/sandbox-files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files, lang: document.documentElement.lang || 'pt' }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erro ao montar arquivos do sandbox');
  return data.files;
}

async function render(files) {
  const hint = document.getElementById('sandboxHint');
  const frame = document.getElementById('sandboxFrame');
  if (!frame) return;

  if (!files || !files.length) {
    if (hint) {
      hint.hidden = false;
      hint.textContent = 'Gere um app primeiro — depois volte nessa aba pra ver ele rodando num bundler de verdade.';
    }
    frame.hidden = true;
    return;
  }

  if (carregando) return;
  carregando = true;

  if (hint) {
    hint.hidden = false;
    hint.textContent = 'Montando o sandbox real (isso pode levar alguns segundos na primeira vez)...';
  }
  frame.hidden = true;

  try {
    const sandpackFiles = await montarArquivosNoServidor(files);

    if (!clientAtual) {
      clientAtual = await loadSandpackClient(
        frame,
        { files: sandpackFiles, template: 'create-react-app' },
        { showOpenInCodeSandbox: false, showErrorScreen: true, showLoadingScreen: true }
      );
    } else {
      await clientAtual.updateSandbox({ files: sandpackFiles, template: 'create-react-app' });
    }

    if (hint) hint.hidden = true;
    frame.hidden = false;
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
