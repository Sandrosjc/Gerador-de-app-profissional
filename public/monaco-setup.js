// monaco-setup.js — integra o Monaco Editor (o mesmo motor por trás do VS
// Code) na plataforma, carregado via CDN no formato AMD oficial. Não usa
// React nem bundler — o site inteiro é JS puro, então essa é a forma de
// embutir o Monaco sem precisar reconstruir a base do zero.
// Expõe window.chequettoMonaco.{abrir, atualizarConteudo, estaAberto}.

const MONACO_VERSAO = '0.52.0';
const MONACO_CDN_BASE = `https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/${MONACO_VERSAO}/min/vs`;

let editorInstance = null;
let carregandoPromise = null;
let sincronizando = false; // trava pra evitar loop: editor -> app -> editor -> ...

// Tema claro 2026: neutros quentes, sem branco puro (#fff) nem preto puro (#000).
function definirTemaClaro2026(monaco) {
  monaco.editor.defineTheme('chequetto-light-2026', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: '3B7A9E' },       // azul ardósia
      { token: 'keyword.html', foreground: '3B7A9E' },
      { token: 'string', foreground: '4A7C59' },         // verde sábia
      { token: 'number', foreground: 'B85B3A' },         // terracota
      { token: 'comment', foreground: '9A978F', fontStyle: 'italic' },
      { token: 'tag', foreground: '6B5B95' },            // roxo queimado
      { token: 'attribute.name', foreground: '3B7A9E' },
      { token: 'attribute.value', foreground: '4A7C59' },
      { token: 'delimiter', foreground: '2B2D31' },
      { token: 'delimiter.html', foreground: '2B2D31' },
      { token: 'identifier', foreground: '2B2D31' },
    ],
    colors: {
      'editor.background': '#F4F3EF',
      'editor.foreground': '#2B2D31',
      'editorLineNumber.foreground': '#9A978F',
      'editorLineNumber.activeForeground': '#2B2D31',
      'editorCursor.foreground': '#2B2D31',
      'editor.lineHighlightBackground': '#E8E6DF',
      'editor.selectionBackground': '#E8E6DF',
      'editorGutter.background': '#F4F3EF',
      'editorWidget.background': '#EFECE6',
      'editorWidget.border': '#E1DDD5',
      'editorSuggestWidget.background': '#EFECE6',
      'minimap.background': '#F4F3EF',
    },
  });
}

function carregarMonaco() {
  if (window.monaco) return Promise.resolve(window.monaco);
  if (carregandoPromise) return carregandoPromise;

  carregandoPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${MONACO_CDN_BASE}/loader.min.js`;
    script.onload = () => {
      window.require.config({ paths: { vs: MONACO_CDN_BASE } });
      window.require(['vs/editor/editor.main'], () => {
        definirTemaClaro2026(window.monaco);
        resolve(window.monaco);
      }, (erro) => reject(new Error('Não foi possível carregar os módulos do Monaco Editor.')));
    };
    script.onerror = () => reject(new Error('Não foi possível carregar o Monaco Editor do CDN (sem conexão ou bloqueado).'));
    document.head.appendChild(script);
  });

  return carregandoPromise;
}

// Abre (ou reaproveita) o editor, carregando o código atual. onChange(codigo)
// é chamado sempre que a pessoa edita manualmente dentro do Monaco.
async function abrir(codigoInicial, onChange) {
  const container = document.getElementById('monacoContainer');
  if (!container) return;

  try {
    const monaco = await carregarMonaco();

    if (!editorInstance) {
      editorInstance = monaco.editor.create(container, {
        value: codigoInicial || '',
        language: 'html',
        theme: 'chequetto-light-2026',
        fontSize: 14,
        lineNumbers: 'on',
        minimap: { enabled: true },
        automaticLayout: true,
      });
      editorInstance.onDidChangeModelContent(() => {
        if (sincronizando) return;
        onChange(editorInstance.getValue());
      });
    } else {
      sincronizando = true;
      editorInstance.setValue(codigoInicial || '');
      sincronizando = false;
    }
  } catch (error) {
    container.textContent = 'Não foi possível carregar o VS Code agora: ' + error.message;
  }
}

// Chamado pelo resto do app (geração, refino, chat do editor profissional)
// quando o código muda por fora — atualiza o Monaco sem disparar onChange
// de volta (evitaria um loop infinito de sincronização).
function atualizarConteudo(codigo) {
  if (!editorInstance) return;
  if (editorInstance.getValue() === codigo) return; // já está igual, evita mexer no cursor à toa
  const posicao = editorInstance.getPosition();
  sincronizando = true;
  editorInstance.setValue(codigo || '');
  sincronizando = false;
  if (posicao) {
    try { editorInstance.setPosition(posicao); } catch (e) { /* posição pode não existir mais no texto novo */ }
  }
}

function estaAberto() {
  return !!editorInstance;
}

window.chequettoMonaco = { abrir, atualizarConteudo, estaAberto };
