(function () {
  const translations = {
    pt: {
      lang: 'Idioma', hero: 'O que vamos construir hoje?', prompt: 'Ex: crie uma lista de tarefas com prioridade e prazo...', generate: 'Gerar App', online: 'servidor online', offline: 'erro no servidor', tips: 'Dicas da IA', history: 'Histórico', preview: 'Prévia', code: 'Código', copy: 'Copiar código', download: 'Baixar .html', save: 'Salvar na Oficina', desktop: 'Desktop', tablet: 'Tablet', mobile: 'Celular', empty: 'Nenhum aplicativo gerado ainda', emptySub: 'Descreva o que você quer criar na bancada ao lado e clique em "Gerar aplicativo".', refine: 'Aplicar alteração', refinePlaceholder: 'Peça uma alteração no app gerado...', login: 'Entrar', signup: 'Criar conta', plans: 'PLANOS', monthly: 'Mensal', quarterly: 'Trimestral', yearly: 'Anual', lifetime: 'Vitalício'
    },
    en: {
      lang: 'Language', hero: 'What shall we build today?', prompt: 'E.g. create a task list with priority and deadline...', generate: 'Generate App', online: 'server online', offline: 'server error', tips: 'AI Tips', history: 'History', preview: 'Preview', code: 'Code', copy: 'Copy code', download: 'Download .html', save: 'Save to Chequetto', desktop: 'Desktop', tablet: 'Tablet', mobile: 'Mobile', empty: 'No app generated yet', emptySub: 'Describe what you want to build and click "Generate app".', refine: 'Apply change', refinePlaceholder: 'Ask for a change to the generated app...', login: 'Log in', signup: 'Create account', plans: 'PLANS', monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly', lifetime: 'Lifetime'
    },
    es: {
      lang: 'Idioma', hero: '¿Qué construiremos hoy?', prompt: 'Ej.: crea una lista de tareas con prioridad y fecha límite...', generate: 'Generar app', online: 'servidor en línea', offline: 'error del servidor', tips: 'Consejos de IA', history: 'Historial', preview: 'Vista previa', code: 'Código', copy: 'Copiar código', download: 'Descargar .html', save: 'Guardar en Chequetto', desktop: 'Escritorio', tablet: 'Tableta', mobile: 'Móvil', empty: 'Aún no se generó ninguna app', emptySub: 'Describe lo que quieres crear y haz clic en "Generar app".', refine: 'Aplicar cambio', refinePlaceholder: 'Pide un cambio en la app generada...', login: 'Entrar', signup: 'Crear cuenta', plans: 'PLANES', monthly: 'Mensual', quarterly: 'Trimestral', yearly: 'Anual', lifetime: 'Vitalicio'
    },
    ja: {
      lang: '言語', hero: '今日は何を作りましょうか？', prompt: '例：優先度と期限付きのタスク管理アプリを作成...', generate: 'アプリを生成', online: 'サーバー接続中', offline: 'サーバーエラー', tips: 'AIのヒント', history: '履歴', preview: 'プレビュー', code: 'コード', copy: 'コードをコピー', download: '.htmlをダウンロード', save: 'Chequettoに保存', desktop: 'デスクトップ', tablet: 'タブレット', mobile: 'スマートフォン', empty: 'アプリはまだ生成されていません', emptySub: '作りたいものを説明して「アプリを生成」をクリックしてください。', refine: '変更を適用', refinePlaceholder: '生成したアプリへの変更を入力...', login: 'ログイン', signup: 'アカウント作成', plans: 'プラン', monthly: '月額', quarterly: '3か月', yearly: '年額', lifetime: '永久'
    },
    fr: {
      lang: 'Langue', hero: 'Que allons-nous construire aujourd’hui ?', prompt: 'Ex. créez une liste de tâches avec priorité et échéance...', generate: 'Générer l’application', online: 'serveur en ligne', offline: 'erreur du serveur', tips: 'Conseils IA', history: 'Historique', preview: 'Aperçu', code: 'Code', copy: 'Copier le code', download: 'Télécharger .html', save: 'Enregistrer dans Chequetto', desktop: 'Ordinateur', tablet: 'Tablette', mobile: 'Mobile', empty: 'Aucune application générée', emptySub: 'Décrivez ce que vous voulez créer puis cliquez sur « Générer l’application ».', refine: 'Appliquer la modification', refinePlaceholder: 'Demandez une modification de l’application...', login: 'Connexion', signup: 'Créer un compte', plans: 'ABONNEMENTS', monthly: 'Mensuel', quarterly: 'Trimestriel', yearly: 'Annuel', lifetime: 'À vie'
    }
  };

  let currentLang = localStorage.getItem('chequetto_lang') || 'pt';

  function setLanguage(lang) {
    if (!translations[lang]) lang = 'pt';
    currentLang = lang;
    localStorage.setItem('chequetto_lang', lang);
    applyTranslations();
  }

  function getLanguage() {
    return currentLang;
  }

  function applyTranslations() {
    const dict = translations[currentLang] || translations.pt;
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (dict[key]) el.textContent = dict[key];
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (dict[key]) el.setAttribute('placeholder', dict[key]);
    });
    const selector = document.getElementById('languageSelector');
    if (selector) selector.value = currentLang;
  }

  document.addEventListener('DOMContentLoaded', () => {
    applyTranslations();
    const selector = document.getElementById('languageSelector');
    if (selector) {
      selector.addEventListener('change', (e) => setLanguage(e.target.value));
    }
    document.querySelectorAll('.language-picker__flag').forEach((btn) => {
      btn.addEventListener('click', () => setLanguage(btn.dataset.language));
    });
  });

  window.chequettoI18n = {
    getLanguage,
    setLanguage,
    applyTranslations
  };
})();
