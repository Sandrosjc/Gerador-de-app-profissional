// conta.js — créditos por IP + autenticação completa (email/senha + Google)

document.addEventListener('DOMContentLoaded', () => {
  const el = {
    accountArea: document.getElementById('accountArea'),
    modalOverlay: document.getElementById('authModalOverlay'),
    modal: document.getElementById('authModal'),
    planNote: document.getElementById('planNote'),
    closeModal: document.getElementById('closeAuthModal'),
    checkoutModalOverlay: document.getElementById('checkoutModalOverlay'),
    checkoutPlanName: document.getElementById('checkoutPlanName'),
    checkoutPlanValue: document.getElementById('checkoutPlanValue'),
    checkoutPlanFrequency: document.getElementById('checkoutPlanFrequency'),
    closeCheckoutModal: document.getElementById('closeCheckoutModal'),
    btnConfirmCheckout: document.getElementById('btnConfirmCheckout'),
  };

  const planCatalog = {
    gratis: { name: 'Grátis', value: 'R$ 0', frequency: 'sempre' },
    mensal: { name: 'Mensal', value: 'R$ 29,90', frequency: 'por mês' },
    trimestral: { name: 'Trimestral', value: 'R$ 79,90', frequency: 'por trimestre' },
    anual: { name: 'Anual', value: 'R$ 299,90', frequency: 'por ano' },
    vitalicio_promo: { name: 'Acesso Vitalício (Oferta Especial)', value: 'R$ 390,00', frequency: 'pagamento único' },
    vitalicio_regular: { name: 'Vitalício (Padrão)', value: 'R$ 980,00', frequency: 'pagamento único' },
  };

  let currentCredits = null;
  let selectedPlan = 'mensal';
  let user = null;

  // ============================================================
  // FUNÇÕES DE AUTENTICAÇÃO
  // ============================================================

  function setAuthError(msg) {
    const el1 = document.getElementById('authError');
    const el2 = document.getElementById('authSignupError');
    if (el1) { el1.textContent = msg; el1.hidden = !msg; }
    if (el2) { el2.textContent = msg; el2.hidden = !msg; }
  }

  function setAuthSuccess(msg) {
    const el1 = document.getElementById('authSuccess');
    const el2 = document.getElementById('authSignupSuccess');
    if (el1) { el1.textContent = msg; el1.hidden = !msg; }
    if (el2) { el2.textContent = msg; el2.hidden = !msg; }
  }

  // TABS: Login / Cadastro
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('is-active'));
      tab.classList.add('is-active');
      const target = tab.dataset.tab;
      document.getElementById('authLoginForm').hidden = target !== 'login';
      document.getElementById('authSignupForm').hidden = target !== 'signup';
      setAuthError('');
      setAuthSuccess('');
    });
  });

  // ============================================================
  // LOGIN
  // ============================================================
  document.getElementById('authLoginBtn')?.addEventListener('click', async () => {
    const email = document.getElementById('authEmail')?.value?.trim();
    const password = document.getElementById('authPassword')?.value?.trim();

    if (!email || !password) {
      setAuthError('Preencha todos os campos.');
      return;
    }
    setAuthError('');
    setAuthSuccess('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Erro ao fazer login.');
      
      user = data.user;
      setAuthSuccess('Login realizado com sucesso!');
      renderAccountArea();
      closeAuthModal();
    } catch (error) {
      setAuthError(error.message);
    }
  });

  // ============================================================
  // CADASTRO
  // ============================================================
  document.getElementById('authSignupBtn')?.addEventListener('click', async () => {
    const name = document.getElementById('authSignupName')?.value?.trim();
    const email = document.getElementById('authSignupEmail')?.value?.trim();
    const password = document.getElementById('authSignupPassword')?.value?.trim();
    const referralCode = document.getElementById('authSignupReferral')?.value?.trim() || '';

    if (!email || !password) {
      setAuthError('Preencha todos os campos obrigatórios.');
      return;
    }
    if (password.length < 6) {
      setAuthError('A senha deve ter no mínimo 6 caracteres.');
      return;
    }
    setAuthError('');
    setAuthSuccess('');

    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, referralCode }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Erro ao criar conta.');
      
      user = data.user;
      setAuthSuccess('Conta criada com sucesso!');
      renderAccountArea();
      closeAuthModal();
    } catch (error) {
      setAuthError(error.message);
    }
  });

  // ============================================================
  // LOGIN COM GOOGLE
  // ============================================================
  document.getElementById('authLoginGoogle')?.addEventListener('click', () => {
    window.location.href = '/api/auth/github';
  });

  // ============================================================
  // ENTER PARA ENVIAR
  // ============================================================
  document.getElementById('authEmail')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('authLoginBtn')?.click();
  });
  document.getElementById('authPassword')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('authLoginBtn')?.click();
  });
  document.getElementById('authSignupName')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('authSignupBtn')?.click();
  });
  document.getElementById('authSignupEmail')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('authSignupBtn')?.click();
  });
  document.getElementById('authSignupPassword')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('authSignupBtn')?.click();
  });

  // ============================================================
  // LOGOUT
  // ============================================================
  async function logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (err) {}
    user = null;
    renderAccountArea();
  }

  // ============================================================
  // RENDER ÁREA DA CONTA
  // ============================================================
  function renderAccountArea() {
    if (!el.accountArea) return;

    if (user) {
      const name = user.name || user.email.split('@')[0];
      const credits = user.credits || 0;
      const isUnlimited = user.unlimited || false;

      el.accountArea.innerHTML = `
        <div class="account-chip account-chip--user">
          <span class="account-chip__credits" title="Créditos disponíveis">
            ${isUnlimited ? '∞' : credits}
          </span>
          <span class="account-chip__name">${name}</span>
          <button class="btn-secondary btn-secondary--small" id="btnLogout">Sair</button>
          <button class="btn-secondary btn-secondary--small" id="btnVerPlanos">Planos</button>
        </div>
      `;
      document.getElementById('btnLogout')?.addEventListener('click', logout);
      document.getElementById('btnVerPlanos')?.addEventListener('click', openPlans);
    } else {
      el.accountArea.innerHTML = `
        <div class="account-chip account-chip--guest">
          <span class="account-chip__credits" title="Créditos grátis restantes">⚡ ${currentCredits ?? '...'}</span>
          <button class="btn-secondary btn-secondary--small" id="btnLogin">Entrar</button>
          <button class="btn-secondary btn-secondary--small" id="btnVerPlanos">Planos</button>
        </div>
      `;
      document.getElementById('btnLogin')?.addEventListener('click', openAuthModal);
      document.getElementById('btnVerPlanos')?.addEventListener('click', openPlans);
    }
  }

  // ============================================================
  // MODAL
  // ============================================================
  function openAuthModal() {
    if (!el.modalOverlay) return;
    document.getElementById('authLoginForm').
