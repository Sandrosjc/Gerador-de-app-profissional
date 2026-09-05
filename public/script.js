document.addEventListener('DOMContentLoaded', () => {
  const WORKSPACE_STORAGE_KEY = 'chequetto_workspace_state_v1';
  const SAVED_PROJECTS_STORAGE_KEY = 'chequetto_saved_projects_v1';
  const el = {
    prompt: document.getElementById('prompt'),
    btnGerar: document.getElementById('btnGerar'),
    btnGerarLabel: document.getElementById('btnGerarLabel'),
    spinner: document.getElementById('spinner'),
    status: document.getElementById('status'),
    historyList: document.getElementById('historyList'),
    apiStatus: document.getElementById('apiStatus'),
    previewFrame: document.getElementById('previewFrame'),
    codeViewText: document.getElementById('codeViewText'),
    codeView: document.getElementById('codeView'),
    emptyState: document.getElementById('emptyState'),
    btnCopiar: document.getElementById('btnCopiar'),
    btnBaixar: document.getElementById('btnBaixar'),
    btnSalvar: document.getElementById('btnSalvar'),
    refineInput: document.getElementById('refineInput'),
    btnRefinar: document.getElementById('btnRefinar'),
    btnMeusProjetos: document.getElementById('btnMeusProjetos'),
    examples: document.getElementById('examples'),
    tabs: document.querySelectorAll('.tab'),
    devices: document.querySelectorAll('.device'),
    frameWrap: document.getElementById('frameWrap'),
    stageBar: document.getElementById('stageBar'),
    stagePlanejar: document.getElementById('stagePlanejar'),
    stageCriar: document.getElementById('stageCriar'),
    planoList: document.getElementById('planoList'),
    btnMic: document.getElementById('btnMic'),
    micHint: document.getElementById('micHint'),
    fileAttach: document.getElementById('fileAttach'),
    attachedFiles: document.getElementById('attachedFiles'),
    modeSwitch: document.getElementById('modeSwitch'),
    modeHint: document.getElementById('modeHint'),
    discussaoLog: document.getElementById('discussaoLog'),
    sugestoesChips: document.getElementById('sugestoesChips'),
  };

  let modoAtual = 'construir';
  let discussaoHistorico = [];

  let state = {
    codigoAtual: '',
    promptAtual: '',
    promptDraft: '',
    planoAtual: [],
    historico: [],
    attachedFiles: [],
    filesAtual: []
  };

  function storageKey(baseKey) {
    return baseKey;
  }

  function clearWorkspace() {
    state = { codigoAtual: '', promptAtual: '', promptDraft: '', planoAtual: [], historico: [], attachedFiles: [] };
    if (el.prompt) el.prompt.value = '';
    if (el.codeViewText) el.codeViewText.textContent = '';
    if (el.previewFrame) {
      el.previewFrame.hidden = true;
      el.previewFrame.src = 'about:blank';
    }
    if (el.emptyState) el.emptyState.hidden = false;
    if (el.planoList) {
      el.planoList.innerHTML = '';
      el.planoList.hidden = true;
    }
    if (el.historyList) el.historyList.innerHTML = '';
    if (el.btnCopiar) el.btnCopiar.disabled = true;
    if (el.btnBaixar) el.btnBaixar.disabled = true;
    if (el.btnSalvar) el.btnSalvar.disabled = true;
    renderAttachedFiles();
  }

  function persistWorkspace() {
    try {
      localStorage.setItem(storageKey(WORKSPACE_STORAGE_KEY), JSON.stringify({
        codigoAtual: state.codigoAtual,
        promptAtual: state.promptAtual,
        promptDraft: el.prompt?.value || state.promptDraft,
        planoAtual: state.planoAtual,
        historico: state.historico.slice(-30),
      }));
    } catch (error) {
      console.warn('Não foi possível salvar o workspace localmente.', error);
    }
  }

  function persistSavedProject(project) {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey(SAVED_PROJECTS_STORAGE_KEY)) || '[]');
      const next = saved.filter((item) => item.id !== project.id);
      next.unshift(project);
      localStorage.setItem(storageKey(SAVED_PROJECTS_STORAGE_KEY), JSON.stringify(next.slice(0, 30)));
    } catch (error) {
      console.warn('Não foi possível guardar o projeto localmente.', error);
    }
  }

  function restoreWorkspace() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey(WORKSPACE_STORAGE_KEY)) || 'null');
      if (!saved) return;
      state = {
        ...state,
        ...saved,
        historico: Array.isArray(saved.historico) ? saved.historico : [],
        planoAtual: Array.isArray(saved.planoAtual) ? saved.planoAtual : [],
      };
      if (el.prompt) el.prompt.value = state.promptDraft || '';
      if (state.codigoAtual) showGeneratedCode(state.codigoAtual, state.promptAtual);
      renderPlano(state.planoAtual);
      renderHistory();
    } catch (error) {
      console.warn('Não foi possível restaurar o workspace local.', error);
    }
  }

  function renderAttachedFiles() {
    if (!el.attachedFiles) return;
    el.attachedFiles.innerHTML = '';
    state.attachedFiles.forEach((file, index) => {
      const item = document.createElement('span');
      item.className = 'attached-file';
      const icon = document.createElement('span');
      icon.textContent = '📎';
      icon.setAttribute('aria-hidden', 'true');
      const name = document.createElement('span');
      name.textContent = file.name;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.title = 'Remover anexo';
      remove.setAttribute('aria-label', `Remover ${file.name}`);
      remove.textContent = '×';
      item.append(icon, name, remove);
      remove.addEventListener('click', () => {
        state.attachedFiles.splice(index, 1);
        renderAttachedFiles();
      });
      el.attachedFiles.appendChild(item);
    });
    el.attachedFiles.hidden = state.attachedFiles.length === 0;
  }

  function addAttachedFiles(files) {
    const newFiles = Array.from(files || []).filter((file) => {
      const alreadyAttached = state.attachedFiles.some((attached) =>
        attached.name === file.name && attached.size === file.size && attached.lastModified === file.lastModified
      );
      return !alreadyAttached;
    });
    if (!newFiles.length) return;
    state.attachedFiles.push(...newFiles);
    renderAttachedFiles();
  }

  function showGeneratedCode(html, promptText = state.promptAtual) {
    state.codigoAtual = html;
    const blob = new Blob([html], { type: 'text/html' });
    if (el.previewFrame) {
      el.previewFrame.hidden = false;
      el.previewFrame.src = URL.createObjectURL(blob);
    }
    if (el.codeViewText) el.codeViewText.textContent = html;
    if (el.emptyState) el.emptyState.hidden = true;
    if (el.btnCopiar) el.btnCopiar.disabled = false;
    if (el.btnBaixar) el.btnBaixar.disabled = false;
    if (el.btnSalvar) el.btnSalvar.disabled = false;
    if (el.btnRefinar) el.btnRefinar.disabled = false;
    state.promptAtual = promptText;
    persistWorkspace();
  }

  const rotatingKeywords = ['ideias em aplicativos', 'processos em automações', 'problemas em soluções', 'planos em produtos reais', 'descrições em interfaces prontas'];
  let rotatingKeywordIndex = 0;
  const rotatingKeyword = document.getElementById('rotatingKeyword');
  const buildPromise = document.getElementById('buildPromise');
  const carouselTitle = document.getElementById('carouselTitle');
  const carouselDescription = document.getElementById('carouselDescription');
  const carouselBenefit = document.getElementById('carouselBenefit');
  const carouselDots = document.getElementById('carouselDots');
  const carouselCta = document.getElementById('carouselCta');
  const carouselSlides = [
    {
      title: 'Transforme uma ideia em um app funcional',
      description: 'Descreva seu objetivo e a IA monta telas, componentes e interações para você testar agora.',
      benefit: 'Comece grátis com 20 créditos e refine o resultado conversando.',
    },
    {
      title: 'Crie com clareza, mesmo sem programar',
      description: 'Explique público, telas, regras e estilo. Quanto mais contexto você enviar, mais preciso será o primeiro resultado.',
      benefit: 'Anexe PDFs, planilhas ou código para a IA entender seu projeto.',
    },
    {
      title: 'Teste, ajuste e salve sua evolução',
      description: 'Veja a prévia em desktop, tablet ou celular e peça alterações sem começar tudo de novo.',
      benefit: 'Seu histórico fica disponível para retomar ideias e comparar versões.',
    },
  ];
  let carouselIndex = 0;
  function renderCarousel() {
    const slide = carouselSlides[carouselIndex];
    if (carouselTitle) carouselTitle.textContent = slide.title;
    if (carouselDescription) carouselDescription.textContent = slide.description;
    if (carouselBenefit) carouselBenefit.textContent = slide.benefit;
    if (carouselDots) {
      carouselDots.innerHTML = carouselSlides.map((_, index) => `<span class="carousel-dot${index === carouselIndex ? ' is-active' : ''}"></span>`).join('');
    }
  }
  renderCarousel();
  if (carouselTitle) {
    setInterval(() => {
      carouselIndex = (carouselIndex + 1) % carouselSlides.length;
      renderCarousel();
    }, 4200);
  }
  carouselCta?.addEventListener('click', () => el.prompt?.focus());
  if (rotatingKeyword) {
    setInterval(() => {
      rotatingKeywordIndex = (rotatingKeywordIndex + 1) % rotatingKeywords.length;
      rotatingKeyword.textContent = rotatingKeywords[rotatingKeywordIndex];
    }, 2600);
  }

  restoreWorkspace();

  // ---------- Modo Planejamento / Construção ----------

  function aplicarModo(modo) {
    modoAtual = modo;
    el.modeSwitch?.querySelectorAll('[data-mode]').forEach((btn) => {
      const ativo = btn.dataset.mode === modo;
      btn.classList.toggle('is-active', ativo);
      btn.setAttribute('aria-selected', String(ativo));
    });
    if (el.discussaoLog) el.discussaoLog.hidden = false;
    if (modo === 'planejar') {
      if (el.modeHint) el.modeHint.textContent = 'Modo Planejamento: converse com a IA sobre o app antes de construir. Não gasta crédito.';
      if (el.btnGerarLabel) el.btnGerarLabel.textContent = 'Perguntar';
    } else {
      if (el.modeHint) el.modeHint.textContent = 'Modo Construção: cada geração usa 1 crédito. Descreva o app e clique em Gerar — a IA conversa com você a cada passo.';
      if (el.btnGerarLabel) el.btnGerarLabel.textContent = 'Gerar App';
    }
  }

  el.modeSwitch?.querySelectorAll('[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => aplicarModo(btn.dataset.mode));
  });

  function addDiscussaoMsg(texto, autor, { loading = false } = {}) {
    if (!el.discussaoLog) return null;
    const bubble = document.createElement('div');
    bubble.className = `discussao-msg discussao-msg--${autor === 'user' ? 'user' : 'ia'}${loading ? ' discussao-msg--loading' : ''}`;
    bubble.textContent = texto;
    el.discussaoLog.appendChild(bubble);
    el.discussaoLog.scrollTop = el.discussaoLog.scrollHeight;
    return bubble;
  }

  async function enviarDiscussao() {
    const mensagem = el.prompt ? el.prompt.value.trim() : '';
    if (!mensagem) return;
    if (el.prompt) el.prompt.value = '';
    addDiscussaoMsg(mensagem, 'user');
    discussaoHistorico.push({ autor: 'user', texto: mensagem });
    const bubbleCarregando = addDiscussaoMsg('Pensando...', 'ia', { loading: true });

    try {
      const res = await fetch('/api/chat/discutir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensagem, historico: discussaoHistorico.slice(-10) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao conversar com a IA');
      bubbleCarregando?.remove();
      addDiscussaoMsg(data.resposta, 'ia');
      discussaoHistorico.push({ autor: 'ia', texto: data.resposta });
    } catch (error) {
      bubbleCarregando?.remove();
      addDiscussaoMsg('Erro: ' + error.message, 'ia');
    }
  }

  // ---------- Sugestões automáticas da IA (chips clicáveis) ----------

  async function buscarSugestoes(files) {
    if (!el.sugestoesChips || !files || !files.length) return;
    try {
      const res = await fetch('/api/sugestoes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files }),
      });
      const data = await res.json();
      const sugestoes = Array.isArray(data.sugestoes) ? data.sugestoes : [];
      el.sugestoesChips.querySelectorAll('.sugestao-chip').forEach((chip) => chip.remove());
      if (!sugestoes.length) {
        el.sugestoesChips.hidden = true;
        return;
      }
      sugestoes.forEach((sugestao) => {
        const chip = document.createElement('button');
        chip.className = 'chip sugestao-chip';
        chip.type = 'button';
        chip.textContent = sugestao;
        chip.addEventListener('click', () => {
          if (el.refineInput) {
            el.refineInput.value = sugestao;
            el.btnRefinar?.click();
          }
        });
        el.sugestoesChips.appendChild(chip);
      });
      el.sugestoesChips.hidden = false;
    } catch {
      el.sugestoesChips.hidden = true;
    }
  }

  el.prompt?.addEventListener('input', () => {
    state.promptDraft = el.prompt.value;
    persistWorkspace();
  });

  fetch('/api/health')
    .then(res => res.json())
    .then(() => {
      if (el.apiStatus) el.apiStatus.textContent = 'servidor online';
    })
    .catch(() => {
      if (el.apiStatus) el.apiStatus.textContent = 'erro no servidor';
    });

  if (el.examples) {
    el.examples.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (chip && el.prompt) {
        el.prompt.value = chip.getAttribute('data-example');
      }
    });
  }

  document.getElementById('aiTips')?.addEventListener('click', (event) => {
    const tip = event.target.closest('[data-tip]')?.getAttribute('data-tip');
    if (!tip || !el.prompt) return;
    el.prompt.value = el.prompt.value.trim()
      ? `${el.prompt.value.trim()}\n${tip}`
      : tip;
    el.prompt.focus();
  });

  el.fileAttach?.addEventListener('change', () => {
    addAttachedFiles(el.fileAttach.files);
    el.fileAttach.value = '';
  });

  el.prompt?.addEventListener('paste', (event) => {
    const pastedFiles = Array.from(event.clipboardData?.files || []);
    if (!pastedFiles.length) return;
    event.preventDefault();
    addAttachedFiles(pastedFiles);
    if (el.micHint) el.micHint.textContent = `${pastedFiles.length} arquivo(s) colado(s). Clique em Gerar App para ler.`;
  });

  el.prompt?.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      el.btnGerar?.click();
    }
  });

  // ===================== MICROFONE (falar em vez de digitar) =====================
  (function setupMic() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      if (el.btnMic) {
        el.btnMic.disabled = true;
        el.btnMic.title = 'Seu navegador não suporta reconhecimento de voz. Tente pelo Chrome.';
        el.btnMic.style.opacity = '0.35';
      }
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'pt-BR';
    recognition.continuous = false;
    recognition.interimResults = false;

    let gravando = false;

    recognition.onresult = (event) => {
      const texto = event.results[0][0].transcript;
      if (el.prompt) {
        el.prompt.value = el.prompt.value ? el.prompt.value + ' ' + texto : texto;
      }
    };

    recognition.onerror = () => {
      if (el.micHint) el.micHint.textContent = 'Não consegui te ouvir, tenta de novo.';
    };

    recognition.onend = () => {
      gravando = false;
      if (el.btnMic) el.btnMic.classList.remove('is-recording');
      if (el.micHint) el.micHint.textContent = 'Quanto mais detalhes, melhor o resultado.';
    };

    if (el.btnMic) {
      el.btnMic.addEventListener('click', () => {
        if (gravando) {
          recognition.stop();
          return;
        }
        gravando = true;
        el.btnMic.classList.add('is-recording');
        if (el.micHint) el.micHint.textContent = 'Ouvindo... fale o que você quer criar.';
        recognition.start();
      });
    }
  })();

  function setStage(stage) {
    if (!el.stageBar) return;
    el.stageBar.hidden = false;
    el.stagePlanejar.classList.toggle('is-active', stage === 'planejando');
    el.stagePlanejar.classList.toggle('is-done', stage === 'criando' || stage === 'concluido');
    el.stageCriar.classList.toggle('is-active', stage === 'criando');
    el.stageCriar.classList.toggle('is-done', stage === 'concluido');
  }

  function renderPlano(plano) {
    if (!el.planoList || !plano) return;
    el.planoList.innerHTML = '';
    plano.forEach((item) => {
      const li = document.createElement('li');
      li.textContent = item;
      el.planoList.appendChild(li);
    });
    el.planoList.hidden = false;
  }

  async function extractAttachedFiles() {
    if (!state.attachedFiles.length) return '';
    const formData = new FormData();
    state.attachedFiles.forEach((file) => formData.append('files', file));
    const response = await fetch('/api/files/extract', { method: 'POST', body: formData });
    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error(`O servidor respondeu com um formato inesperado (HTTP ${response.status}). Verifique se o arquivo tem até 50 MB.`);
    }
    if (!response.ok) throw new Error(data.error || 'Não foi possível ler os anexos.');
    return (data.documents || []).map((document) => {
      if (!document.readable) return `Arquivo anexado: ${document.name} (${document.message})`;
      return `Arquivo: ${document.name}\nConteúdo:\n${document.text || '[arquivo sem texto]'}`;
    }).join('\n\n');
  }

  if (el.btnGerar) {
    el.btnGerar.addEventListener('click', async () => {
      if (modoAtual === 'planejar') {
        enviarDiscussao();
        return;
      }

      const basePrompt = el.prompt ? el.prompt.value.trim() : '';
      if (!basePrompt && !state.attachedFiles.length) {
        alert('Por favor, descreva o aplicativo que você quer criar.');
        return;
      }

      setLoading(true);
      if (el.status) el.status.textContent = state.attachedFiles.length ? 'Lendo seus arquivos...' : 'Preparando o pedido...';
      let filesContext = '';
      try {
        filesContext = await extractAttachedFiles();
      } catch (error) {
        if (el.status) el.status.textContent = 'Erro: ' + error.message;
        setLoading(false);
        return;
      }
      const promptText = [basePrompt, filesContext].filter(Boolean).join('\n\n');
      state.promptAtual = promptText;
      if (el.planoList) { el.planoList.innerHTML = ''; el.planoList.hidden = true; }
      setStage('planejando');
      addDiscussaoMsg(basePrompt || 'Gerar a partir dos arquivos anexados', 'user');
      if (el.prompt) el.prompt.value = '';
      const bubbleConstrucao = addDiscussaoMsg('Analisando seu pedido...', 'ia', { loading: true });

      const language = window.chequettoI18n?.getLanguage?.() || 'pt';
      const source = new EventSource('/generate/stream?prompt=' + encodeURIComponent(promptText) + '&lang=' + encodeURIComponent(language));

      source.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.stage === 'planejando' && data.plano) {
          renderPlano(data.plano);
          state.planoAtual = data.plano;
          bubbleConstrucao.textContent = 'Aqui está meu plano:\n' + data.plano.map((item) => '• ' + item).join('\n') + '\n\nEscrevendo o código agora...';
        }
        if (data.stage === 'criando') {
          setStage('criando');
          if (el.status) el.status.textContent = data.message;
        }
        if (data.stage === 'revisando') {
          if (el.status) el.status.textContent = data.message;
          if (bubbleConstrucao) bubbleConstrucao.textContent = 'Revisando o código antes de te entregar...';
        }
        if (data.stage === 'planejando' && !data.plano) {
          if (el.status) el.status.textContent = data.message;
        }

        if (data.stage === 'salvo_temp') {
          showGeneratedCode(data.html, promptText);
          state.filesAtual = data.files || [];

          state.historico.push({ prompt: promptText, code: data.html, plano: state.planoAtual });
          renderHistory();
          persistWorkspace();
          window.chequettoCredits?.refresh?.();
          buscarSugestoes(data.files);

          bubbleConstrucao.classList.remove('discussao-msg--loading');
          bubbleConstrucao.textContent = 'Pronto! Seu app está na aba Prévia. Quer que eu ajuste alguma coisa? É só me contar.';
          if (el.status) el.status.textContent = 'Aplicativo gerado com sucesso!';
          setLoading(false);
          source.close();
        }

        if (data.stage === 'erro') {
          bubbleConstrucao.classList.remove('discussao-msg--loading');
          bubbleConstrucao.textContent = 'Deu erro ao gerar: ' + data.message;
          if (el.status) el.status.textContent = 'Erro: ' + data.message;
          setLoading(false);
          source.close();
        }
      };

      source.onerror = () => {
        if (el.status) el.status.textContent = 'Erro de conexão ao gerar o aplicativo.';
        setLoading(false);
        source.close();
      };
    });
  }

  function setLoading(loading) {
    if (el.btnGerar) el.btnGerar.disabled = loading;
    if (el.spinner) el.spinner.hidden = !loading;
    if (el.btnGerarLabel) el.btnGerarLabel.textContent = loading ? 'Gerando...' : 'Gerar aplicativo';
    if (loading && el.status) el.status.textContent = 'A Inteligência Artificial está montando o app...';
    if (buildPromise) {
      buildPromise.textContent = loading
        ? 'Enquanto você espera, estamos transformando sua ideia em uma experiência que pode ser testada e ajustada agora.'
        : 'Sua ideia vira um aplicativo funcional, pronto para testar e refinar.';
      buildPromise.classList.toggle('is-loading', loading);
    }
    if (!loading && el.stageBar) {
      setTimeout(() => { el.stageBar.hidden = true; }, 1200);
    }
  }

  function renderHistory() {
    if (!el.historyList) return;
    el.historyList.innerHTML = '';
    state.historico.forEach((item) => {
      const li = document.createElement('li');
      li.textContent = item.prompt;
      li.addEventListener('click', () => {
        state.planoAtual = item.plano || [];
        showGeneratedCode(item.code, item.prompt);
      });
      el.historyList.appendChild(li);
    });
  }

  async function carregarProjetosSalvos() {
    if (!el.btnMeusProjetos) return;
    const original = el.btnMeusProjetos.innerHTML;
    el.btnMeusProjetos.disabled = true;
    el.btnMeusProjetos.innerHTML = '<span>...</span> Carregando projetos';
    try {
      const projetos = JSON.parse(localStorage.getItem(storageKey(SAVED_PROJECTS_STORAGE_KEY)) || '[]');
      if (!projetos.length) {
        if (el.status) el.status.textContent = 'Nenhum projeto salvo ainda.';
        return;
      }
      projetos.forEach((projeto) => {
        state.historico.push({
          id: projeto.id,
          prompt: projeto.nome || projeto.prompt,
          code: projeto.html,
          plano: Array.isArray(projeto.plano) ? projeto.plano : [],
        });
      });
      renderHistory();
      if (el.status) el.status.textContent = `${projetos.length} projeto(s) carregado(s).`;
    } catch {
      if (el.status) el.status.textContent = 'Não foi possível carregar seus projetos.';
    } finally {
      el.btnMeusProjetos.disabled = false;
      el.btnMeusProjetos.innerHTML = original;
    }
  }

  el.btnMeusProjetos?.addEventListener('click', carregarProjetosSalvos);

  el.btnRefinar?.addEventListener('click', async () => {
    const pedido = el.refineInput?.value.trim();
    if (!pedido) return;
    if (!state.codigoAtual) {
      if (el.status) el.status.textContent = 'Gere um aplicativo antes de pedir uma alteração.';
      return;
    }
    el.btnRefinar.disabled = true;
    el.btnRefinar.textContent = 'Aplicando...';
    if (el.status) el.status.textContent = 'A IA está atualizando seu aplicativo...';
    addDiscussaoMsg(pedido, 'user');
    const bubbleRefino = addDiscussaoMsg('Aplicando o ajuste...', 'ia', { loading: true });
    try {
      const res = await fetch('/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: state.codigoAtual, pedido }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao refinar');
      showGeneratedCode(data.code, state.promptAtual + ' / ' + pedido);
      state.filesAtual = data.files || [];
      state.historico.push({ prompt: 'Ajuste: ' + pedido, code: data.code, plano: state.planoAtual });
      renderHistory();
      persistWorkspace();
      buscarSugestoes(data.files);
      if (el.refineInput) el.refineInput.value = '';
      bubbleRefino.classList.remove('discussao-msg--loading');
      bubbleRefino.textContent = 'Pronto, apliquei essa alteração! Dá uma olhada na Prévia.';
      if (el.status) el.status.textContent = 'Alteração aplicada com sucesso!';
    } catch (error) {
      bubbleRefino.classList.remove('discussao-msg--loading');
      bubbleRefino.textContent = 'Não consegui aplicar: ' + error.message;
      if (el.status) el.status.textContent = 'Erro: ' + error.message;
    } finally {
      el.btnRefinar.disabled = false;
      el.btnRefinar.textContent = 'Aplicar alteração';
    }
  });

  el.refineInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') el.btnRefinar?.click();
  });

  if (el.btnCopiar) {
    el.btnCopiar.addEventListener('click', async () => {
      if (!state.codigoAtual) return;
      await navigator.clipboard.writeText(state.codigoAtual);
      const original = el.btnCopiar.textContent;
      el.btnCopiar.textContent = 'Copiado!';
      setTimeout(() => (el.btnCopiar.textContent = original), 1500);
    });
  }

  if (el.btnBaixar) {
    el.btnBaixar.addEventListener('click', () => {
      if (!state.codigoAtual) return;
      const blob = new Blob([state.codigoAtual], { type: 'text/html' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'meu-aplicativo.html';
      a.click();
    });
  }

  if (el.btnSalvar) {
    el.btnSalvar.addEventListener('click', async () => {
      if (!state.codigoAtual) return;
      el.btnSalvar.disabled = true;
      const original = el.btnSalvar.textContent;
      el.btnSalvar.textContent = 'Salvando...';
      try {
        const res = await fetch('/api/projects/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: state.promptAtual, plano: state.planoAtual, html: state.codigoAtual }),
        });
        const data = await res.json();
        if (res.status === 401) throw new Error('Não autenticado');
        if (!res.ok) throw new Error(data.error || 'Falha ao salvar');
        const savedProject = {
          id: data.project?.id,
          prompt: state.promptAtual,
          nome: data.project?.nome || state.promptAtual.slice(0, 60),
          html: state.codigoAtual,
          plano: state.planoAtual,
        };
        persistSavedProject(savedProject);
        state.historico = state.historico.filter((item) => item.id !== savedProject.id);
        state.historico.unshift({ id: savedProject.id, prompt: savedProject.nome, code: savedProject.html, plano: savedProject.plano });
        renderHistory();
        persistWorkspace();
        el.btnSalvar.textContent = 'Salvo ✓';
        setTimeout(() => { el.btnSalvar.textContent = original; el.btnSalvar.disabled = false; }, 1800);
      } catch (error) {
        el.btnSalvar.textContent = 'Erro ao salvar';
        setTimeout(() => { el.btnSalvar.textContent = original; el.btnSalvar.disabled = false; }, 1800);
      }
    });
  }

  const btnShareWhatsapp = document.getElementById('btnShareWhatsapp');
  btnShareWhatsapp?.addEventListener('click', () => {
    const link = window.location.origin;
    const text = encodeURIComponent(`Crie seu aplicativo grátis no Chequetto: ${link}`);
    const url = `https://wa.me/?text=${text}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  });

  if (el.tabs) {
    el.tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        el.tabs.forEach(t => t.classList.remove('is-active'));
        tab.classList.add('is-active');
        const view = tab.getAttribute('data-view');
        if (el.previewFrame) el.previewFrame.hidden = view !== 'preview';
        if (el.codeView) el.codeView.hidden = view !== 'code';
        const sandboxView = document.getElementById('sandboxView');
        if (sandboxView) sandboxView.hidden = view !== 'sandbox';
        if (view === 'sandbox') {
          window.chequettoSandbox?.render(state.filesAtual || []);
        }
      });
    });
  }

  if (el.devices) {
    el.devices.forEach(dev => {
      dev.addEventListener('click', () => {
        el.devices.forEach(d => d.classList.remove('is-active'));
        dev.classList.add('is-active');
        const w = dev.getAttribute('data-width');
        if (el.frameWrap) el.frameWrap.style.width = w;
      });
    });
  }
});
