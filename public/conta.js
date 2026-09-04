// conta.js — créditos por IP (sem login) + vitrine de planos.
// O checkout de pagamento (Asaas) dependia de contas de usuário; como o
// login foi removido, ele fica pausado por enquanto (ver aviso no clique
// de um plano pago) até decidirmos como identificar quem pagou sem conta.

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

  function renderAccountArea() {
    if (!el.accountArea) return;
    const creditsLabel = currentCredits ?? '...';
    el.accountArea.innerHTML = `
      <div class="account-chip account-chip--guest">
        <span class="account-chip__credits" title="Créditos grátis restantes">⚡ ${creditsLabel}</span>
        <button class="btn-secondary btn-secondary--small" id="btnVerPlanos">Planos</button>
      </div>
    `;
    document.getElementById('btnVerPlanos')?.addEventListener('click', openPlans);
  }

  async function refreshCredits() {
    try {
      const res = await fetch('/api/credits');
      if (!res.ok) return;
      const data = await res.json();
      currentCredits = data.credits;
      renderAccountArea();
    } catch {
      // silencioso — não é crítico pra experiência
    }
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

  window.chequettoCredits = { refresh: refreshCredits };

  el.closeModal?.addEventListener('click', closePlans);
  el.modalOverlay?.addEventListener('click', (e) => {
    if (e.target === el.modalOverlay) closePlans();
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

  renderCheckoutSummary();
  startOfferCountdown();
  refreshCredits();
});
