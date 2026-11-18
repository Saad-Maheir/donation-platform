(function () {
  let cachedTransactions = [];

  function formatMoney(amount) {
    return Number(amount || 0).toLocaleString('en-US') + ' ج.م';
  }

  function createCell(text) {
    const td = document.createElement('td');
    td.textContent = text;
    return td;
  }

  function initLogin() {
    const form = document.getElementById('adminLoginForm');
    if (!form) return;

    const errBox = document.getElementById('loginError');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errBox.style.display = 'none';
      const resp = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: document.getElementById('adminUser').value,
          password: document.getElementById('adminPass').value
        })
      });
      const data = await resp.json();
      if (resp.ok) {
        window.location.href = '/admin.html';
      } else {
        errBox.textContent = data.error || 'فشل تسجيل الدخول';
        errBox.style.display = 'block';
      }
    });
  }

  function renderTransactions(filterStatus) {
    const tbody = document.getElementById('adminTxBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const items = filterStatus === 'all'
      ? cachedTransactions
      : cachedTransactions.filter((t) => t.status === filterStatus);

    for (const tx of items) {
      const tr = document.createElement('tr');
      tr.appendChild(createCell(tx.id));
      tr.appendChild(createCell(tx.campaignTitle));
      tr.appendChild(createCell(tx.donorName));
      tr.appendChild(createCell(formatMoney(tx.amount)));
      tr.appendChild(createCell(tx.gateway.toUpperCase()));

      const statusTd = document.createElement('td');
      const badge = document.createElement('span');
      if (tx.status === 'completed') {
        badge.className = 'badge badge-success';
        badge.textContent = 'مكتملة';
      } else if (tx.status === 'pending') {
        badge.className = 'badge badge-warn';
        badge.textContent = 'قيد الانتظار';
      } else {
        badge.className = 'badge badge-danger';
        badge.textContent = 'ملغاة';
      }
      statusTd.appendChild(badge);
      tr.appendChild(statusTd);
      tr.appendChild(createCell(new Date(tx.createdAt).toLocaleDateString('ar-EG')));
      tbody.appendChild(tr);
    }
  }

  async function loadDashboard() {
    const kpiTotal = document.getElementById('kpiTotal');
    if (!kpiTotal) return;

    const resp = await fetch('/api/admin/overview');
    if (resp.status === 401) {
      window.location.href = '/admin-login.html';
      return;
    }
    const data = await resp.json();

    kpiTotal.textContent = formatMoney(data.stats.totalAmount);
    document.getElementById('kpiCompleted').textContent = String(data.stats.completedCount);
    document.getElementById('kpiPending').textContent = String(data.stats.pendingCount);
    document.getElementById('kpiCampaigns').textContent = String(data.stats.campaignsCount);

    const gwBox = document.getElementById('gatewaysStatus');
    gwBox.innerHTML = '';
    for (const gw of data.gateways) {
      const card = document.createElement('div');
      card.className = 'trust-item';
      const title = document.createElement('h3');
      title.textContent = gw.provider;
      const desc = document.createElement('p');
      desc.textContent = gw.name;
      const badge = document.createElement('span');
      badge.className = gw.configured ? 'badge badge-success' : 'badge badge-warn';
      badge.style.marginTop = '8px';
      badge.textContent = gw.configured ? 'مربوط وجاهز (Live)' : 'بانتظار مفاتيح الربط في .env';
      card.append(title, desc, badge);
      gwBox.appendChild(card);
    }

    const cmpBody = document.getElementById('adminCampaignsBody');
    cmpBody.innerHTML = '';
    for (const c of data.campaigns) {
      const tr = document.createElement('tr');
      tr.appendChild(createCell(c.title));
      tr.appendChild(createCell(c.category));
      tr.appendChild(createCell(formatMoney(c.raisedAmount)));
      tr.appendChild(createCell(formatMoney(c.targetAmount)));
      tr.appendChild(createCell(String(c.donorsCount)));

      const stTd = document.createElement('td');
      const stBadge = document.createElement('span');
      stBadge.className = c.status === 'active' ? 'badge badge-success' : 'badge badge-warn';
      stBadge.textContent = c.status === 'active' ? 'نشطة' : 'متوقفة';
      stTd.appendChild(stBadge);
      tr.appendChild(stTd);

      const actTd = document.createElement('td');
      const toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.className = 'btn btn-outline btn-sm';
      toggleBtn.textContent = c.status === 'active' ? 'إيقاف مؤقت' : 'تفعيل';
      toggleBtn.addEventListener('click', async () => {
        await fetch('/api/admin/campaigns/' + encodeURIComponent(c.id), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: c.status === 'active' ? 'paused' : 'active' })
        });
        loadDashboard();
      });
      actTd.appendChild(toggleBtn);
      tr.appendChild(actTd);
      cmpBody.appendChild(tr);
    }

    cachedTransactions = data.transactions;
    renderTransactions(document.getElementById('txFilter').value);
  }

  function initDashboardEvents() {
    const newCmpForm = document.getElementById('newCampaignForm');
    if (!newCmpForm) return;

    newCmpForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const resp = await fetch('/api/admin/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: document.getElementById('newCmpTitle').value,
          category: document.getElementById('newCmpCategory').value,
          targetAmount: Number(document.getElementById('newCmpTarget').value),
          summary: document.getElementById('newCmpSummary').value
        })
      });
      if (resp.ok) {
        newCmpForm.reset();
        loadDashboard();
      }
    });

    document.getElementById('txFilter').addEventListener('change', (e) => {
      renderTransactions(e.target.value);
    });

    document.getElementById('logoutBtn').addEventListener('click', async () => {
      await fetch('/api/admin/logout', { method: 'POST' });
      window.location.href = '/admin-login.html';
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initLogin();
    loadDashboard();
    initDashboardEvents();
  });
})();
