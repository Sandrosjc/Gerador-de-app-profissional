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
    authEmail: document.getElementById('authEmail'),
    authCode: document.getElementById('authCode'),
    authError: document.getElementById('authError'),
    authSuccess: document.getElementById('authSuccess'),
    authSendCode: document.getElementById('authSendCode'),
    authVerifyCode: document.getElementById('authVerifyCode'),
    authCodeStep: document.getElementById('authCodeStep'),
    authEmailStep: document.getElementById('authEmailStep'),
    authResendCode: document.getElementById('authResendCode'),
    authCountdown: document.getElementById('authCountdown'),
    authReferral: document.getElementById('authReferral'),
    authLoginGoogle: document.getElementById('authLoginGoogle'),
    authBackEmail: document.getElementById('authBackEmail'),
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
  let countdownTimer = null;
  let user = null;

  function setAuthError(msg) {
    if (el.authError) {
      el.authError.textContent = msg;
      el.authError.hidden = !msg;
    }
  }

  function setAuthSuccess(msg) {
    if (el.authSuccess) {
      el.authSuccess.textContent = msg;
      el.authSuccess.hidden = !msg;
    }
  }

  function startCountdown(seconds) {
    if (el.authCountdown) {
      el.authCountdown.textContent = seconds;
      el.authCountdown.hidden = false;
    }
    if (el.authResendCode) el.authResendCode.disabled = true;

    if (countdownTimer) clearInterval(countdownTimer);
    let remaining = seconds;
    countdownTimer = setInterval(() => {
      remaining--;
      if (el.authCountdown) el.authCountdown.textContent = remaining;
      if (remaining <= 0) {
        clearInterval(countdownTimer);
        countdownTimer = null;
        if (el.authCountdown) el.authCountdown.hidden = true;
        if (el.authResendCode) el.authResendCode.disabled = false;
      }
    }, 1000);
  }

  async function requestVerificationCode(email, referralCode = '') {
    setAuthError('');
    setAuthSuccess('');

    try {
      const response = await fetch('/api/auth/email/request-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, referralCode }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Erro ao enviar código.');
      
      setAuthSuccess(data.message || 'Código enviado para seu e-mail.');
      if (el.authEmailStep) el.authEmailStep.hidden = true;
      if (el.authCodeStep) el.authCodeStep.hidden = false;
      if (el.authEmail) {
        const display = document.getElementById('authEmailDisplay');
        if (display) display.textContent = email;
      }
      startCountdown(60);
      return true;
    } catch (error) {
      setAuthError(error.message);
      return false;
    }
  }

  async function verifyCode(code) {
    setAuthError('');
    setAuthSuccess('');

    try {
      const email = el.authEmail ? el.authEmail.value : '';
      const response = await fetch('/api/auth/email/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Código inválido.');
      
      user = data.user;
      setAuthSuccess('Login realizado com sucesso!');
      renderAccountArea();
      closeAuthModal();
      return true;
    } catch (error) {
      setAuthError(error.message);
      return false;
    }
  }

  async function logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (err) {}
    user = null;
    renderAccountArea();
  }

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

  function openAuthModal() {
    if (!el.modalOverlay) return;
    if (el.authEmailStep) el.authEmailStep.hidden = false;
    if (el.authCodeStep) el.authCodeStep.hidden = true;
    if (el.authEmail) el.authEmail.value = '';
    if (el.authCode) el.authCode.value = '';
    if (el.authReferral) el.authReferral.value = '';
    setAuthError('');
    setAuthSuccess('');
    if (el.authCountdown) el.authCountdown.hidden = true;
    if (el.authResendCode) el.authResendCode.disabled = true;
    el.modalOverlay.hidden = false;
  }

  function closeAuthModal() {
    if (el.modalOverlay) el.modalOverlay.hidden = true;
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }

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

  async function refreshCredits() {
    try {
      const res = await fetch('/api/credits');
      if (!res.ok) return;
      const data = await res.json();
      currentCredits = data.credits;
      renderAccountArea();
    } catch {}
  }

  function openPlans() {
    if (!el.modalOverlay) return;
    el.modalOverlay.hidden = false;
  }

  function closePlans() {
    if (el.modalOverlay) el.modalOverlay.hidden = true;
  }

  function openCheckout(planName = selectedPlan) {
    selectedPlan = planName || 'mensal';
    renderCheckoutSummary();
    if (el.checkoutModalOverlay) el.checkoutModalOverlay.hidden = false;
  }

  function closeCheckout() {
    if (el.checkoutModalOverlay) el.checkoutModalOverlay.hidden = true;
  }

  el.authSendCode?.addEventListener('click', async () => {
    const email = el.authEmail?.value?.trim();
    const referral = el.authReferral?.value?.trim() || '';
    if (!email) {
      setAuthError('Informe seu e-mail.');
      return;
    }
    await requestVerificationCode(email, referral);
  });

  el.authVerifyCode?.addEventListener('click', async () => {
    const code = el.authCode?.value?.trim();
    if (!code || code.length !== 6) {
      setAuthError('Insira o código de 6 dígitos.');
      return;
    }
    await verifyCode(code);
  });

  el.authResendCode?.addEventListener('click', async () => {
    const email = el.authEmail?.value?.trim();
    if (!email) {
      setAuthError('Informe seu e-mail.');
      return;
    }
    await requestVerificationCode(email, el.authReferral?.value?.trim() || '');
  });

  el.authBackEmail?.addEventListener('click', () => {
    if (el.authEmailStep) el.authEmailStep.hidden = false;
    if (el.authCodeStep) el.authCodeStep.hidden = true;
    if (el.authCode) el.authCode.value = '';
    setAuthError('');
    setAuthSuccess('');
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
    if (el.authCountdown) el.authCountdown.hidden = true;
    if (el.authResendCode) el.authResendCode.disabled = true;
  });

  el.authEmail?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') el.authSendCode?.click();
  });

  el.authCode?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') el.authVerifyCode?.click();
  });

  el.authLoginGoogle?.addEventListener('click', () => {
    window.location.href = '/api/auth/github';
  });

  el.closeModal?.addEventListener('click', closeAuthModal);
  el.modalOverlay?.addEventListener('click', (e) => {
    if (e.target === el.modalOverlay) closeAuthModal();
  });

  el.closeCheckoutModal?.addEventListener('click', closeCheckout);
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

      if (planId === 'gratis') {
        if (el.planNote) el.planNote.textContent = 'Plano Grátis: 20 créditos por IP, ideal para testar e criar seu primeiro app.';
        closePlans();
        return;
      }

      if (el.planNote) el.planNote.textContent = `Plano ${planName}: pagamento temporariamente pausado enquanto reorganizamos o cadastro de contas.`;
    });
  });

  document.querySelectorAll('[data-checkout-plan]').forEach((button) => {
    button.addEventListener('click', () => {
      selectedPlan = button.dataset.checkoutPlan || 'mensal';
      renderCheckoutSummary();
    });
  });

  el.btnConfirmCheckout?.addEventListener('click', () => {
    if (el.planNote) el.planNote.textContent = 'Pagamento temporariamente pausado enquanto reorganizamos o cadastro de contas.';
    closeCheckout();
    openPlans();
  });

  window.chequettoCredits = { refresh: refreshCredits };

  renderCheckoutSummary();
  startOfferCountdown();
  refreshCredits();

  (async () => {
    try {
      const res = await fetch('/api/me');
      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          user = data.user;
          renderAccountArea();
        }
      }
    } catch {}
  })();
});
