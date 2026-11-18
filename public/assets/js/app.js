(function () {
  let activeCampaigns = [];
  let cartItems = [];
  let selectedQuickAmount = 250;

  function loadCart() {
    try {
      const saved = localStorage.getItem('gaza_relief_cart');
      if (saved) cartItems = JSON.parse(saved);
    } catch (e) {
      cartItems = [];
    }
    updateCartUI();
  }

  function saveCart() {
    try {
      localStorage.setItem('gaza_relief_cart', JSON.stringify(cartItems));
    } catch (e) {}
    updateCartUI();
  }

  function updateCartUI() {
    const badge = document.getElementById('cartBadgeCount');
    const totalCount = cartItems.reduce((sum, item) => sum + (item.qty || 1), 0);
    if (badge) badge.textContent = String(totalCount);

    const list = document.getElementById('cartItemsList');
    const totalSumEl = document.getElementById('cartTotalSum');
    if (!list) return;

    if (cartItems.length === 0) {
      list.innerHTML = '<p style="text-align:center; color:var(--mk-text-muted); margin-top:40px;">سلة التبرعات فارغة حالياً</p>';
      if (totalSumEl) totalSumEl.textContent = '0 ج.م';
      return;
    }

    let total = 0;
    list.innerHTML = '';
    cartItems.forEach((item, idx) => {
      const lineTotal = item.amount * (item.qty || 1);
      total += lineTotal;

      const row = document.createElement('div');
      row.className = 'cart-item-row';
      row.innerHTML = `
        <div class="cart-item-info">
          <h4>${escapeHtml(item.title)}</h4>
          <p>${formatMoney(lineTotal)} (${item.qty} × ${formatMoney(item.amount)})</p>
        </div>
        <button class="cart-item-remove" onclick="removeCartItem(${idx})" title="حذف">&times;</button>
      `;
      list.appendChild(row);
    });

    if (totalSumEl) totalSumEl.textContent = formatMoney(total);
  }

  window.removeCartItem = function (index) {
    cartItems.splice(index, 1);
    saveCart();
  };

  window.addToCart = function (id, title, amount) {
    const existing = cartItems.find((i) => i.id === id);
    if (existing) {
      existing.qty = (existing.qty || 1) + 1;
    } else {
      cartItems.push({ id, title, amount: Number(amount), qty: 1 });
    }
    saveCart();
    openCartDrawer();
  };

  window.openCartDrawer = function () {
    const drawer = document.getElementById('cartDrawer');
    const overlay = document.getElementById('cartOverlay');
    if (drawer && overlay) {
      drawer.classList.add('open');
      overlay.classList.add('open');
    }
  };

  window.closeCartDrawer = function () {
    const drawer = document.getElementById('cartDrawer');
    const overlay = document.getElementById('cartOverlay');
    if (drawer && overlay) {
      drawer.classList.remove('open');
      overlay.classList.remove('open');
    }
  };

  window.openZakatModal = function () {
    const modal = document.getElementById('zakatModal');
    if (modal) modal.classList.add('open');
  };

  window.closeZakatModal = function () {
    const modal = document.getElementById('zakatModal');
    if (modal) modal.classList.remove('open');
  };

  window.calculateZakat = function () {
    const cash = parseFloat(document.getElementById('zakatCash')?.value || 0);
    const goldGrams = parseFloat(document.getElementById('zakatGold')?.value || 0);
    const trade = parseFloat(document.getElementById('zakatTrade')?.value || 0);

    const goldGramPrice = 3600;
    const goldTotal = goldGrams * goldGramPrice;
    const totalWealth = cash + goldTotal + trade;
    const nisabThreshold = 85 * goldGramPrice;

    const dueVal = totalWealth >= nisabThreshold ? Math.round(totalWealth * 0.025) : 0;
    const display = document.getElementById('zakatDueValue');
    if (display) {
      display.textContent = formatMoney(dueVal);
    }
  };

  window.donateCalculatedZakat = function () {
    const dueStr = document.getElementById('zakatDueValue')?.textContent || '0';
    const amount = parseInt(dueStr.replace(/[^\d]/g, ''), 10) || 500;
    closeZakatModal();
    initiateCheckout({
      campaignId: 'cmp_gaza_emergency',
      title: 'زكاة مال معتمدة لصالح متضرري غزة',
      amount: amount
    });
  };

  window.selectQuickAid = function (title, amount) {
    addToCart('aid_' + amount, title, amount);
  };

  function formatMoney(amount) {
    return Number(amount || 0).toLocaleString('en-US') + ' ج.م';
  }

  function formatMillions(amount) {
    if (amount >= 1000000) {
      return (amount / 1000000).toFixed(1) + 'M ج.م';
    }
    if (amount >= 1000) {
      return (amount / 1000).toFixed(1) + 'K ج.م';
    }
    return amount + ' ج.م';
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  async function initiateCheckout(payload) {
    try {
      const resp = await fetch('/api/donations/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId: payload.campaignId || 'cmp_gaza_emergency',
          title: payload.title || 'ساند أهل غزة — تبرع فوري',
          amount: Number(payload.amount),
          gateway: 'stripe',
          anonymous: true,
          donorName: 'فاعل خير'
        })
      });
      const data = await resp.json();
      if (resp.ok && data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        alert(data.error || 'تعذر بدء عملية الدفع');
      }
    } catch (err) {
      alert('حدث خطأ في الاتصال، يرجى المحاولة ثانية');
    }
  }

  window.checkoutCart = function () {
    if (cartItems.length === 0) {
      alert('يرجى اختيار عنصر تبرع أولاً');
      return;
    }
    const total = cartItems.reduce((sum, item) => sum + (item.amount * (item.qty || 1)), 0);
    const titles = cartItems.map((i) => i.title).join(' + ');
    initiateCheckout({
      campaignId: 'cmp_gaza_emergency',
      title: 'سلة تبرعات: ' + titles,
      amount: total
    });
  };

  async function fetchHomeData() {
    try {
      const resp = await fetch('/api/campaigns');
      if (!resp.ok) return;
      const data = await resp.json();
      activeCampaigns = data.campaigns || [];

      renderCampaigns(activeCampaigns);
      renderProducts(data.products || []);
    } catch (e) {
      console.error(e);
    }
  }

  function renderCampaigns(campaigns) {
    const container = document.getElementById('campaignsContainer');
    if (!container) return;
    container.innerHTML = '';

    campaigns.forEach((c) => {
      const pct = Math.min(100, Math.round((c.raisedAmount / c.targetAmount) * 100));
      const card = document.createElement('article');
      card.className = 'case-card';
      card.innerHTML = `
        <div class="case-img-wrap">
          <img src="${c.image}" alt="${escapeHtml(c.title)}" class="case-img" loading="lazy">
          <span class="case-badge-urgent">⚡ عاجل</span>
          <span class="case-category">${escapeHtml(c.category)}</span>
        </div>
        <div class="case-body">
          <h3 class="case-title">${escapeHtml(c.title)}</h3>
          <p class="case-summary">${escapeHtml(c.summary)}</p>
          <div class="case-progress-wrap">
            <div class="progress-labels">
              <span class="progress-raised">${formatMillions(c.raisedAmount)} تم جمعها</span>
              <span class="progress-target">الهدف: ${formatMillions(c.targetAmount)}</span>
            </div>
            <div class="progress-bar-track">
              <div class="progress-bar-fill" style="width: ${pct}%"></div>
            </div>
          </div>
          <div class="case-actions">
            <button class="btn-card-cart" onclick="addToCart('${c.id}', '${escapeHtml(c.title)}', 250)" title="أضف لسلة التبرع">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
            </button>
            <a href="/campaign.html?id=${encodeURIComponent(c.id)}" class="btn-card-donate">
              تبرع الآن
            </a>
          </div>
        </div>
      `;
      container.appendChild(card);
    });
  }

  function renderProducts(products) {
    const container = document.getElementById('productsContainer');
    if (!container) return;
    container.innerHTML = '';

    products.forEach((p) => {
      const card = document.createElement('div');
      card.className = 'product-card';
      card.innerHTML = `
        <div class="product-img-wrap">
          <img src="${p.image}" alt="${escapeHtml(p.title)}" class="product-img" loading="lazy">
        </div>
        <div class="product-price">${Number(p.amount).toLocaleString('en-US')} <span>ج.م</span></div>
        <h3 class="product-title">${escapeHtml(p.title)}</h3>
        <button class="btn-add-product" onclick="addToCart('${p.id}', '${escapeHtml(p.title)}', ${p.amount})">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
          أضف إلى السلة
        </button>
      `;
      container.appendChild(card);
    });
  }

  function setupQuickDonation() {
    const buttons = document.querySelectorAll('.quick-amounts-bar .quick-btn');
    const customInput = document.getElementById('quickCustomInput');
    const btnLabel = document.getElementById('quickDonateBtnLabel');
    const submitBtn = document.getElementById('quickDonateNowBtn');

    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        buttons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const amt = btn.dataset.amount;

        if (amt === 'custom') {
          if (customInput) {
            customInput.style.display = 'inline-block';
            customInput.focus();
          }
          selectedQuickAmount = parseFloat(customInput?.value || 0);
          if (btnLabel) btnLabel.textContent = selectedQuickAmount ? `تبرع بـ ${selectedQuickAmount} ج.م الآن` : 'تبرع الآن';
        } else {
          if (customInput) customInput.style.display = 'none';
          selectedQuickAmount = parseInt(amt, 10);
          if (btnLabel) btnLabel.textContent = `تبرع بـ ${selectedQuickAmount} ج.م الآن`;
        }
      });
    });

    if (customInput) {
      customInput.addEventListener('input', () => {
        selectedQuickAmount = parseFloat(customInput.value || 0);
        if (btnLabel) btnLabel.textContent = selectedQuickAmount ? `تبرع بـ ${selectedQuickAmount} ج.م الآن` : 'تبرع الآن';
      });
    }

    if (submitBtn) {
      submitBtn.addEventListener('click', () => {
        if (!selectedQuickAmount || selectedQuickAmount < 10) {
          alert('يرجى تحديد مبلغ تبرع مناسب');
          return;
        }
        initiateCheckout({
          campaignId: 'cmp_gaza_emergency',
          title: 'ساند أهل غزة — تبرع سريع',
          amount: selectedQuickAmount
        });
      });
    }
  }

  function setupNotifPopup() {
    const btn = document.getElementById('notifBtn');
    const popup = document.getElementById('notifPopup');
    if (!btn || !popup) return;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      popup.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
      if (!popup.contains(e.target) && e.target !== btn) {
        popup.classList.remove('open');
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    loadCart();
    fetchHomeData();
    setupQuickDonation();
    setupNotifPopup();

    const cartBtn = document.getElementById('cartBtn');
    if (cartBtn) {
      cartBtn.addEventListener('click', openCartDrawer);
    }
  });
})();
