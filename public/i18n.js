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
    },
    de: {
      lang: 'Sprache', hero: 'Was bauen wir heute?', prompt: 'z. B. Erstelle eine Aufgabenliste mit Priorität und Frist...', generate: 'App erstellen', online: 'Server online', offline: 'Serverfehler', tips: 'KI-Tipps', history: 'Verlauf', preview: 'Vorschau', code: 'Code', copy: 'Code kopieren', download: '.html herunterladen', save: 'In Chequetto speichern', desktop: 'Desktop', tablet: 'Tablet', mobile: 'Mobil', empty: 'Noch keine App erstellt', emptySub: 'Beschreibe, was du erstellen möchtest, und klicke auf „App erstellen“.', refine: 'Änderung anwenden', refinePlaceholder: 'Bitte eine Änderung an der App eingeben...', login: 'Anmelden', signup: 'Konto erstellen', plans: 'TARIFE', monthly: 'Monatlich', quarterly: 'Vierteljährlich', yearly: 'Jährlich', lifetime: 'Lebenslang'
    },
    it: {
      lang: 'Lingua', hero: 'Cosa costruiamo oggi?', prompt: 'Es. crea una lista di attività con priorità e scadenza...', generate: 'Genera app', online: 'server online', offline: 'errore del server', tips: 'Suggerimenti IA', history: 'Cronologia', preview: 'Anteprima', code: 'Codice', copy: 'Copia codice', download: 'Scarica .html', save: 'Salva in Chequetto', desktop: 'Desktop', tablet: 'Tablet', mobile: 'Cellulare', empty: 'Nessuna app generata', emptySub: 'Descrivi cosa vuoi creare e fai clic su “Genera app”.', refine: 'Applica modifica', refinePlaceholder: 'Chiedi una modifica all’app generata...', login: 'Accedi', signup: 'Crea account', plans: 'PIANI', monthly: 'Mensile', quarterly: 'Trimestrale', yearly: 'Annuale', lifetime: 'A vita'
    },
    zh: {
      lang: '语言', hero: '今天我们要构建什么？', prompt: '例如：创建一个带有优先级和截止日期的任务列表...', generate: '生成应用', online: '服务器在线', offline: '服务器错误', tips: 'AI 提示', history: '历史记录', preview: '预览', code: '代码', copy: '复制代码', download: '下载 .html', save: '保存到 Chequetto', desktop: '桌面', tablet: '平板', mobile: '手机', empty: '尚未生成应用', emptySub: '描述你想创建的内容，然后点击“生成应用”。', refine: '应用修改', refinePlaceholder: '请求修改已生成的应用...', login: '登录', signup: '创建账户', plans: '套餐', monthly: '月付', quarterly: '季付', yearly: '年付', lifetime: '永久'
    },
    ko: {
      lang: '언어', hero: '오늘은 무엇을 만들어 볼까요?', prompt: '예: 우선순위와 마감일이 있는 할 일 목록을 만들어 주세요...', generate: '앱 생성', online: '서버 온라인', offline: '서버 오류', tips: 'AI 팁', history: '기록', preview: '미리보기', code: '코드', copy: '코드 복사', download: '.html 다운로드', save: 'Chequetto에 저장', desktop: '데스크톱', tablet: '태블릿', mobile: '모바일', empty: '아직 생성된 앱이 없습니다', emptySub: '만들고 싶은 것을 설명한 뒤 “앱 생성”을 클릭하세요.', refine: '변경 적용', refinePlaceholder: '생성된 앱의 변경 사항을 입력하세요...', login: '로그인', signup: '계정 만들기', plans: '요금제', monthly: '월간', quarterly: '분기', yearly: '연간', lifetime: '평생'
    },
    ru: {
      lang: 'Язык', hero: 'Что мы создадим сегодня?', prompt: 'Например: создайте список задач с приоритетом и сроком...', generate: 'Создать приложение', online: 'сервер онлайн', offline: 'ошибка сервера', tips: 'Советы ИИ', history: 'История', preview: 'Предпросмотр', code: 'Код', copy: 'Копировать код', download: 'Скачать .html', save: 'Сохранить в Chequetto', desktop: 'Компьютер', tablet: 'Планшет', mobile: 'Телефон', empty: 'Приложение ещё не создано', emptySub: 'Опишите, что нужно создать, и нажмите «Создать приложение».', refine: 'Применить изменение', refinePlaceholder: 'Запросите изменение созданного приложения...', login: 'Войти', signup: 'Создать аккаунт', plans: 'ТАРИФЫ', monthly: 'Ежемесячно', quarterly: 'Ежеквартально', yearly: 'Ежегодно', lifetime: 'Навсегда'
    },
    ar: {
      lang: 'اللغة', hero: 'ماذا سنبني اليوم؟', prompt: 'مثال: أنشئ قائمة مهام مع الأولوية والموعد النهائي...', generate: 'إنشاء التطبيق', online: 'الخادم متصل', offline: 'خطأ في الخادم', tips: 'نصائح الذكاء الاصطناعي', history: 'السجل', preview: 'معاينة', code: 'الشفرة', copy: 'نسخ الشفرة', download: 'تنزيل .html', save: 'حفظ في Chequetto', desktop: 'سطح المكتب', tablet: 'جهاز لوحي', mobile: 'هاتف', empty: 'لم يتم إنشاء تطبيق بعد', emptySub: 'صف ما تريد إنشاءه ثم اضغط على «إنشاء التطبيق».', refine: 'تطبيق التعديل', refinePlaceholder: 'اطلب تعديلاً على التطبيق...', login: 'تسجيل الدخول', signup: 'إنشاء حساب', plans: 'الخطط', monthly: 'شهري', quarterly: 'ربع سنوي', yearly: 'سنوي', lifetime: 'مدى الحياة'
    },
    hi: {
      lang: 'भाषा', hero: 'आज हम क्या बनाएँगे?', prompt: 'उदाहरण: प्राथमिकता और समय-सीमा वाली कार्य सूची बनाएँ...', generate: 'ऐप बनाएँ', online: 'सर्वर ऑनलाइन', offline: 'सर्वर त्रुटि', tips: 'AI सुझाव', history: 'इतिहास', preview: 'पूर्वावलोकन', code: 'कोड', copy: 'कोड कॉपी करें', download: '.html डाउनलोड करें', save: 'Chequetto में सहेजें', desktop: 'डेस्कटॉप', tablet: 'टैबलेट', mobile: 'मोबाइल', empty: 'अभी तक कोई ऐप नहीं बना', emptySub: 'बताएँ कि आप क्या बनाना चाहते हैं और “ऐप बनाएँ” पर क्लिक करें।', refine: 'बदलाव लागू करें', refinePlaceholder: 'बनाए गए ऐप में बदलाव का अनुरोध करें...', login: 'लॉग इन', signup: 'खाता बनाएँ', plans: 'प्लान', monthly: 'मासिक', quarterly: 'त्रैमासिक', yearly: 'वार्षिक', lifetime: 'आजीवन'
    }
  };

  const languageNames = { pt: 'Português', en: 'English', es: 'Español', fr: 'Français', de: 'Deutsch', it: 'Italiano', ja: '日本語', zh: '中文', ko: '한국어', ru: 'Русский', ar: 'العربية', hi: 'हिन्दी' };
  const offerTranslations = {
    pt: ['OFERTA ESPECIAL', 'Acesso vitalício por R$ 390,00', 'Condição promocional disponível por mais', 'Garantir acesso vitalício'],
    en: ['SPECIAL OFFER', 'Lifetime access for R$ 390.00', 'Promotional offer available for', 'Get lifetime access'],
    es: ['OFERTA ESPECIAL', 'Acceso vitalicio por R$ 390,00', 'Oferta promocional disponible durante', 'Garantizar acceso vitalicio'],
    fr: ['OFFRE SPÉCIALE', 'Accès à vie pour R$ 390,00', 'Offre promotionnelle disponible pendant', 'Garantir l’accès à vie'],
    de: ['SONDERANGEBOT', 'Lebenslanger Zugang für R$ 390,00', 'Dieses Angebot gilt noch', 'Lebenslangen Zugang sichern'],
    it: ['OFFERTA SPECIALE', 'Accesso a vita per R$ 390,00', 'Offerta promozionale disponibile per', 'Garantisci accesso a vita'],
    ja: ['特別オファー', '永久アクセス R$ 390,00', 'プロモーション期間の残り', '永久アクセスを確保'],
    zh: ['特别优惠', '永久访问 R$ 390,00', '促销优惠剩余', '获取永久访问'],
    ko: ['특별 혜택', '평생 이용권 R$ 390,00', '프로모션 혜택 남은 시간', '평생 이용권 받기'],
    ru: ['СПЕЦИАЛЬНОЕ ПРЕДЛОЖЕНИЕ', 'Пожизненный доступ за R$ 390,00', 'До конца предложения', 'Получить пожизненный доступ'],
    ar: ['عرض خاص', 'وصول مدى الحياة مقابل R$ 390,00', 'العرض الترويجي متاح لمدة', 'احصل على الوصول مدى الحياة'],
    hi: ['विशेष ऑफ़र', 'R$ 390,00 में आजीवन पहुँच', 'प्रचार ऑफ़र उपलब्ध है', 'आजीवन पहुँच पाएं']
  };
  const browserLanguage = (navigator.language || 'en').slice(0, 2);
  let currentLanguage = localStorage.getItem('chequetto_language') || (translations[browserLanguage] ? browserLanguage : 'en');

  function applyLanguage(language) {
    currentLanguage = translations[language] ? language : 'en';
    localStorage.setItem('chequetto_language', currentLanguage);
    const t = translations[currentLanguage];
    const offer = offerTranslations[currentLanguage];
    document.documentElement.lang = currentLanguage;
    document.querySelectorAll('[data-i18n]').forEach((element) => {
      const value = t[element.dataset.i18n];
      if (value) element.textContent = value;
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
      const value = t[element.dataset.i18nPlaceholder];
      if (value) element.placeholder = value;
    });
    ['offerTag', 'offerTitle', 'offerRemaining', 'offerButton'].forEach((id, index) => {
      const element = document.getElementById(id);
      if (element && offer[index]) element.textContent = offer[index];
    });
    const selector = document.getElementById('languageSelector');
    if (selector) selector.value = currentLanguage;
    document.querySelectorAll('[data-language]').forEach((button) => {
      const isActive = button.dataset.language === currentLanguage;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });
    window.dispatchEvent(new CustomEvent('chequetto:language-change', { detail: { language: currentLanguage } }));
  }

  window.chequettoI18n = { getLanguage: () => currentLanguage, applyLanguage, languageNames };
  document.addEventListener('DOMContentLoaded', () => {
    const selector = document.getElementById('languageSelector');
    selector?.addEventListener('change', () => applyLanguage(selector.value));
    document.querySelectorAll('[data-language]').forEach((button) => {
      button.addEventListener('click', () => applyLanguage(button.dataset.language));
    });
    applyLanguage(currentLanguage);
  });
}());
