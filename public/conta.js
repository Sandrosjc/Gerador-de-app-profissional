// conta.js — controla login, cadastro, seleção de plano e pagamento

document.addEventListener('DOMContentLoaded', () => {
  const el = {
    accountArea: document.getElementById('accountArea'),
    modalOverlay: document.getElementById('authModalOverlay'),
    modal: document.getElementById('authModal'),
    authTitle: document.getElementById('authTitle'),
    authLead: document.getElementById('authLead'),
    btnGithubAuth: document.getElementById('btnGithubAuth'),
    formEmailRequest: document.getElementById('formEmailRequest'),
    authEmail: document.getElementById('authEmail'),
    authReferralCode: document.getElementById('authReferralCode'),
    emailRequestError: document.getElementById('emailRequestError'),
    formEmailVerify: document.getElementById('formEmailVerify'),
    authVerificationCode: document.getElementById('authVerificationCode'),
    emailVerifyError: document.getElementById('emailVerifyError'),
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

  let currentUser = null;
  let authRequestVersion = 0;
  let authLoading = true;
  let resolveAuthReady;
  const authReady = new Promise((resolve) => {
    resolveAuthReady = resolve;
  });
  let pendingAction = null;
  let selectedPlan = 'mensal';

  function startOfferCountdown() {
    const countdown = document.getElementById('offerCountdown');
    if (!countdown) return;
    const endsAt = Date.parse('2026-09-01T00:00:00.000Z');
    const offerTitle = document.getElementById('offerTitle');
    const offerRemaining = document.getElementById('offerRemaining');
    const offerButton = document.getElementById('offerButton');
    const update = () => {
      const remaining = Math.max(0, endsAt - Date.now());
      const days = Math.floor(remaining / 86400000);
      const hours = Math.floor((remaining % 86400000) / 3600000);
      const minutes = Math.floor((remaining % 3600000) / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      countdown.textContent = `${days}d ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      if (!remaining) {
        if (offerTitle) offerTitle.textContent = 'Acesso vitalício por R$ 980,00';
        if (offerRemaining) offerRemaining.textContent = 'Preço regular';
        if (offerButton) offerButton.textContent = 'Garantir acesso vitalício';
      }
    };
    update();
    setInterval(update, 1000);
  }

  function renderCheckoutSummary() {
    const details = { ...(planCatalog[selectedPlan] || planCatalog.mensal) };
    if (el.checkoutPlanName) el.checkoutPlanName.textContent = details.name;
    if (el.checkoutPlanValue) el.checkoutPlanValue.textContent = details.value;
    if (el.checkoutPlanFrequency) el.checkoutPlanFrequency.textContent = details.frequency;
    document.querySelectorAll('[data-checkout-plan]').forEach((button) => {
      button.classList.toggle('is-selected', button.dataset.checkoutPlan === selectedPlan);
    });
  }

  function continuePendingAction() {
    if (!pendingAction) return;
    const next = pendingAction;
    pendingAction = null;
    next();
  }

  function renderAccountArea() {
    if (!el.accountArea) return;

    if (currentUser) {
      const creditsLabel = currentUser.unlimited ? '∞' : (currentUser.credits ?? 0);
      el.accountArea.innerHTML = `
        <div class="account-chip">
          <span class="account-chip__credits" title="Créditos disponíveis">⚡ ${creditsLabel}</span>
          <span class="account-chip__email">${currentUser.email}</span>
          <button class="btn-ghost btn-ghost--small" id="btnInvite" title="Compartilhar convite">+20</button>
          <button class="btn-ghost btn-ghost--small" id="btnLogout">Sair</button>
        </div>
      `;
      document.getElementById('btnInvite')?.addEventListener('click', () => {
        const link = `${window.location.origin}/?convite=${encodeURIComponent(currentUser.referralCode)}`;
        const text = encodeURIComponent(`Crie seu aplicativo grátis no Chequetto e ganhe 20 créditos: ${link}`);
        window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener,noreferrer');
      });
      document.getElementById('btnLogout')?.addEventListener('click', async () => {
        try {
          await fetch('/api/auth/logout', { method: 'POST' });
        } finally {
          currentUser = null;
          window.dispatchEvent(new CustomEvent('chequetto:logged-out'));
          renderAccountArea();
        }
      });
    } else {
      el.accountArea.innerHTML = `
        <div class="account-chip account-chip--guest">
          <span class="account-chip__credits" title="Créditos grátis">⚡ 20</span>
          <button class="btn-secondary btn-secondary--small" id="btnAbrirLogin">Entrar</button>
        </div>
      `;
      document.getElementById('btnAbrirLogin')?.addEventListener('click', openModal);
    }
  }

  function openModal() {
    if (!el.modalOverlay) return;
    el.modalOverlay.hidden = false;
    resetAuthForms();
  }

  function closeModal() {
    if (el.modalOverlay) el.modalOverlay.hidden = true;
    if (el.emailRequestError) el.emailRequestError.textContent = '';
    if (el.emailVerifyError) el.emailVerifyError.textContent = '';
  }

  function openCheckout(planName = selectedPlan) {
    selectedPlan = planName || 'mensal';
    renderCheckoutSummary();
    if (el.checkoutModalOverlay) el.checkoutModalOverlay.hidden = false;
  }

  function closeCheckout() {
    if (el.checkoutModalOverlay) el.checkoutModalOverlay.hidden = true;
  }

  function resetAuthForms() {
    if (el.formEmailRequest) el.formEmailRequest.hidden = false;
    if (el.formEmailVerify) el.formEmailVerify.hidden = true;
    if (el.emailRequestError) el.emailRequestError.textContent = '';
    if (el.emailVerifyError) el.emailVerifyError.textContent = '';
  }

  function requireAuth(nextAction) {
    if (currentUser) {
      nextAction?.();
      return true;
    }
    pendingAction = nextAction || null;
    openModal();
    return false;
  }

  window.chequettoAuth = {
    isAuthenticated: () => !!currentUser,
    isLoading: () => authLoading,
    whenReady: () => authReady,
    openLogin: () => openModal(),
    requireAuth,
    openCheckout,
    refresh: fetchMe,
    getReferralLink: () => currentUser ? `${window.location.origin}/?convite=${encodeURIComponent(currentUser.referralCode)}` : window.location.origin,
  };

  async function fetchMe() {
    const requestVersion = authRequestVersion;
    try {
      const authError = new URLSearchParams(window.location.search).get('auth_error');
      if (authError) {
        if (el.emailRequestError) el.emailRequestError.textContent = authError || '';
        openModal();
        window.history.replaceState({}, document.title, window.location.pathname);
      }
      const res = await fetch('/api/me');
      if (requestVersion !== authRequestVersion) return;
      if (!res.ok) {
        currentUser = null;
        renderAccountArea();
        return;
      }
      const data = await res.json();
      if (requestVersion !== authRequestVersion) return;
      currentUser = data.user;
      renderAccountArea();
      window.dispatchEvent(new CustomEvent('chequetto:authenticated', { detail: { user: currentUser } }));
    } catch {
      if (requestVersion !== authRequestVersion) return;
      currentUser = null;
      renderAccountArea();
    } finally {
      if (authLoading) {
        authLoading = false;
        resolveAuthReady();
      }
    }
  }

  el.closeModal?.addEventListener('click', () => {
    closeModal();
    if (!currentUser && pendingAction) pendingAction = null;
  });
  el.modalOverlay?.addEventListener('click', (e) => {
    if (e.target === el.modalOverlay) {
      closeModal();
      if (!currentUser && pendingAction) pendingAction = null;
    }
  });

  el.closeCheckoutModal?.addEventListener('click', () => closeCheckout());
  el.checkoutModalOverlay?.addEventListener('click', (e) => {
    if (e.target === el.checkoutModalOverlay) closeCheckout();
  });

  document.querySelectorAll('[data-plan]').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('[data-plan]').forEach((plan) => plan.classList.remove('is-selected'));
      button.classList.add('is-selected');
      const planId = button.dataset.plan || 'mensal';
      selectedPlan = planId;
      const planName = planCatalog[planId]?.name || 'Mensal';
      const freeText = planId === 'gratis'
        ? 'Plano Grátis: 20 créditos, ideal para testar e criar até 1 app completo.'
        : `Plano ${planName} selecionado. ${currentUser ? 'Continue para o pagamento.' : 'Crie sua conta para continuar.'}`;
      el.planNote.textContent = freeText;

      if (planId === 'gratis') {
        pendingAction = () => openCheckout(planId);
        openModal();
        return;
      }

      if (!currentUser) {
        pendingAction = () => openCheckout(planId);
        openModal();
        return;
      }

      openCheckout(planId);
    });
  });

  document.querySelectorAll('[data-checkout-plan]').forEach((button) => {
    button.addEventListener('click', () => {
      selectedPlan = button.dataset.checkoutPlan || 'mensal';
      renderCheckoutSummary();
    });
  });

  el.btnConfirmCheckout?.addEventListener('click', async () => {
    if (!currentUser) {
      closeCheckout();
      openModal();
      return;
    }

    el.btnConfirmCheckout.disabled = true;
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: selectedPlan }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Não foi possível iniciar o pagamento.');
      if (!data.checkoutUrl) throw new Error('O Asaas não retornou o link de pagamento.');
      closeCheckout();
      window.location.assign(data.checkoutUrl);
      if (el.planNote) el.planNote.textContent = 'Checkout Asaas aberto. Seu acesso será liberado após a confirmação do pagamento.';
    } catch (err) {
      if (el.planNote) el.planNote.textContent = err.message;
    } finally {
      el.btnConfirmCheckout.disabled = false;
    }
  });

  el.btnGithubAuth?.addEventListener('click', () => {
    const params = new URLSearchParams(window.location.search);
    const referralCode = params.get('convite') || '';
    window.location.assign(`/api/auth/github?convite=${encodeURIComponent(referralCode)}`);
  });

  el.formEmailRequest?.addEventListener('submit', async (e) => {
    e.preventDefault();
    el.emailRequestError.textContent = '';
    try {
      const params = new URLSearchParams(window.location.search);
      const referralCode = params.get('convite') || undefined;
      if (el.authReferralCode) el.authReferralCode.value = referralCode || '';

      const res = await fetch('/api/auth/email/request-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email: el.authEmail.value.trim().toLowerCase(), referralCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erro ao enviar código');
      el.formEmailRequest.hidden = true;
      el.formEmailVerify.hidden = false;
      el.authVerificationCode.focus();
      el.emailVerifyError.textContent = data.message || '';
    } catch (err) {
      el.emailRequestError.textContent = err.message;
    }
  });

  el.formEmailVerify?.addEventListener('submit', async (e) => {
    e.preventDefault();
    el.emailVerifyError.textContent = '';
    try {
      const res = await fetch('/api/auth/email/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email: el.authEmail.value.trim().toLowerCase(), code: el.authVerificationCode.value.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Código inválido');
      authRequestVersion += 1;
      await fetchMe();
      if (!currentUser) throw new Error('A sessão não pôde ser confirmada. Tente novamente.');
      closeModal();
      continuePendingAction();
    } catch (err) {
      el.emailVerifyError.textContent = err.message;
    }
  });

  renderCheckoutSummary();
  startOfferCountdown();
  fetchMe();
});
