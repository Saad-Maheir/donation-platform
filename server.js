const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const config = require('./src/config');
const db = require('./src/db');
const security = require('./src/security');
const gateways = require('./src/gateways');

const publicDir = path.join(__dirname, 'public');

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; script-src 'self'; connect-src 'self';"
  );
  if (config.nodeEnv === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
}

function sendJson(res, statusCode, payload) {
  setSecurityHeaders(res);
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function readRequestBody(req, maxBytes = 65536) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function parseJsonObject(raw) {
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid JSON payload');
  }
  return parsed;
}

function escapeCsvCell(value) {
  let str = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

function getAuthenticatedAdmin(req) {
  const cookies = security.parseCookies(req.headers.cookie);
  const token = cookies.admin_session;
  if (!token) {
    return null;
  }
  const verified = security.verifyToken(token);
  if (!verified || verified.role !== 'admin') {
    return null;
  }
  return verified;
}

function isSameOriginMutation(req) {
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (!origin || !host) {
    return true;
  }
  try {
    const originHost = new URL(origin).host;
    return originHost === host;
  } catch {
    return false;
  }
}

function completeTransaction(txId) {
  const store = db.readDb();
  const tx = store.transactions.find((item) => item.id === txId);
  if (!tx) {
    return null;
  }
  if (tx.status === 'completed') {
    return tx;
  }
  tx.status = 'completed';
  tx.completedAt = new Date().toISOString();
  const campaign = store.campaigns.find((c) => c.id === tx.campaignId);
  if (campaign) {
    campaign.raisedAmount = Number((campaign.raisedAmount + tx.amount).toFixed(2));
    campaign.donorsCount += 1;
  }
  db.writeDb(store);
  return tx;
}

function serveStatic(res, pathname) {
  const safePath = path.normalize(pathname === '/' ? '/index.html' : pathname).replace(/^(\.\.[/\\])+/, '');
  const fullPath = path.join(publicDir, safePath);
  if (fullPath !== publicDir && !fullPath.startsWith(publicDir + path.sep)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(fullPath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }
    const ext = path.extname(fullPath).toLowerCase();
    setSecurityHeaders(res);
    if (ext === '.css' || ext === '.js' || ext === '.svg') {
      res.setHeader('Cache-Control', 'public, max-age=3600');
    } else {
      res.setHeader('Cache-Control', 'no-store');
    }
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

async function handleApi(req, res, parsedUrl) {
  const rawIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'local';
  const ip = typeof rawIp === 'string' ? rawIp.split(',')[0].trim() : 'local';
  const pathname = parsedUrl.pathname;

  if (!security.checkRateLimit(ip, 'api', 120, 60000)) {
    return sendJson(res, 429, { error: 'تم تجاوز الحد المسموح من الطلبات، يرجى الانتظار قليلاً' });
  }

  if (req.method === 'GET' && pathname === '/api/health') {
    return sendJson(res, 200, { status: 'ok', timestamp: new Date().toISOString() });
  }

  if (req.method === 'GET' && pathname === '/api/campaigns') {
    const store = db.readDb();
    const active = store.campaigns.filter((c) => c.status === 'active');
    const totals = active.reduce(
      (acc, c) => {
        acc.totalRaised += c.raisedAmount;
        acc.totalDonors += c.donorsCount;
        return acc;
      },
      { totalRaised: 0, totalDonors: 0, activeCampaigns: active.length }
    );
    return sendJson(res, 200, {
      campaigns: active,
      products: store.products || [],
      stats: totals,
      gateways: gateways.getAvailableGateways()
    });
  }

  if (req.method === 'GET' && pathname === '/api/products') {
    const store = db.readDb();
    return sendJson(res, 200, { products: store.products || [] });
  }

  if (req.method === 'GET' && pathname.startsWith('/api/campaigns/')) {
    const id = pathname.split('/').pop();
    const store = db.readDb();
    const campaign = store.campaigns.find((c) => c.id === id && c.status === 'active');
    if (!campaign) {
      return sendJson(res, 404, { error: 'الحملة غير موجودة' });
    }
    return sendJson(res, 200, {
      campaign,
      gateways: gateways.getAvailableGateways()
    });
  }

  if (req.method === 'POST' && pathname === '/api/donations/checkout') {
    try {
      const body = parseJsonObject(await readRequestBody(req));
      const store = db.readDb();
      let campaign = store.campaigns.find((c) => c.id === String(body.campaignId || '') && c.status === 'active');
      if (!campaign) {
        campaign = store.campaigns[0] || { id: 'cmp_gaza_emergency', title: 'ساند أهل غزة — تبرع عام', currency: 'EGP' };
      }
      const campaignTitle = security.sanitizeText(String(body.title || campaign.title), 120);
      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount < 1 || amount > 10000000) {
        return sendJson(res, 400, { error: 'يرجى إدخال مبلغ تبرع صالح' });
      }
      const allowedGateways = ['stripe', 'paypal', 'tap', 'paymob'];
      const gateway = allowedGateways.includes(body.gateway) ? body.gateway : 'stripe';
      const frequency = body.frequency === 'monthly' ? 'monthly' : 'once';
      const anonymous = Boolean(body.anonymous);
      const donorName = anonymous ? 'فاعل خير' : security.sanitizeText(String(body.donorName || 'فاعل خير'), 80);
      const donorEmail = security.sanitizeText(String(body.donorEmail || 'donor@sand-gaza.org'), 160);
      if (donorEmail && !security.isValidEmail(donorEmail)) {
        return sendJson(res, 400, { error: 'صيغة البريد الإلكتروني غير صحيحة' });
      }

      const tx = {
        id: security.generateId('tx'),
        receiptToken: security.generateReceiptToken(),
        campaignId: campaign.id,
        campaignTitle: campaignTitle,
        amount: Number(amount.toFixed(2)),
        currency: campaign.currency || 'EGP',
        frequency,
        gateway,
        gatewayRef: '',
        donorName,
        donorEmail,
        anonymous,
        status: 'pending',
        createdAt: new Date().toISOString(),
        completedAt: null
      };

      const session = await gateways.createCheckoutSession(tx);
      tx.gatewayRef = session.gatewayRef;
      store.transactions.unshift(tx);
      db.writeDb(store);

      return sendJson(res, 201, {
        transactionId: tx.id,
        receiptToken: tx.receiptToken,
        checkoutUrl: session.checkoutUrl,
        mode: session.mode
      });
    } catch (err) {
      return sendJson(res, 400, { error: err.message || 'تعذر بدء عملية الدفع' });
    }
  }

  if (req.method === 'GET' && pathname === '/api/donations/receipt') {
    const id = parsedUrl.query.id;
    const token = parsedUrl.query.token;
    if (!id || !token) {
      return sendJson(res, 400, { error: 'بيانات التحقق من الإيصال مفقودة' });
    }
    const store = db.readDb();
    const tx = store.transactions.find((t) => t.id === id);
    if (!tx || !security.safeEqual(tx.receiptToken, String(token))) {
      return sendJson(res, 403, { error: 'غير مصرح بالوصول لهذا الإيصال' });
    }
    return sendJson(res, 200, {
      receipt: {
        id: tx.id,
        campaignTitle: tx.campaignTitle,
        amount: tx.amount,
        currency: tx.currency,
        frequency: tx.frequency,
        gateway: tx.gateway,
        gatewayRef: tx.gatewayRef,
        donorName: tx.anonymous ? 'فاعل خير' : tx.donorName,
        status: tx.status,
        createdAt: tx.createdAt,
        completedAt: tx.completedAt
      }
    });
  }

  if (req.method === 'POST' && pathname === '/api/donations/sandbox-confirm') {
    try {
      const body = parseJsonObject(await readRequestBody(req));
      const store = db.readDb();
      const tx = store.transactions.find((t) => t.id === String(body.transactionId || ''));
      if (!tx || !security.safeEqual(tx.receiptToken, String(body.receiptToken || ''))) {
        return sendJson(res, 403, { error: 'رمز العملية غير صالح' });
      }
      if (body.action === 'cancel') {
        tx.status = 'cancelled';
        db.writeDb(store);
        return sendJson(res, 200, { status: 'cancelled' });
      }
      const completed = completeTransaction(tx.id);
      return sendJson(res, 200, {
        status: completed.status,
        redirectUrl: `/receipt.html?id=${encodeURIComponent(completed.id)}&token=${encodeURIComponent(completed.receiptToken)}`
      });
    } catch {
      return sendJson(res, 400, { error: 'طلب غير صالح' });
    }
  }

  if (req.method === 'POST' && pathname === '/api/webhooks/stripe') {
    try {
      const rawBody = await readRequestBody(req, 131072);
      const sig = req.headers['stripe-signature'];
      if (!gateways.verifyStripeWebhook(rawBody, sig)) {
        return sendJson(res, 400, { error: 'Invalid signature' });
      }
      const event = parseJsonObject(rawBody);
      if (event.type === 'checkout.session.completed' && event.data?.object?.client_reference_id) {
        completeTransaction(String(event.data.object.client_reference_id));
      }
      return sendJson(res, 200, { received: true });
    } catch {
      return sendJson(res, 400, { error: 'Invalid webhook payload' });
    }
  }

  if (req.method === 'POST' && pathname === '/api/contact') {
    try {
      const body = parseJsonObject(await readRequestBody(req));
      const name = security.sanitizeText(String(body.name || ''), 80);
      const email = security.sanitizeText(String(body.email || ''), 160);
      const message = security.sanitizeText(String(body.message || ''), 1000);
      if (!name || !email || !message || !security.isValidEmail(email)) {
        return sendJson(res, 400, { error: 'يرجى إكمال جميع الحقول بشكل صحيح' });
      }
      const store = db.readDb();
      store.messages.unshift({
        id: security.generateId('msg'),
        name,
        email,
        message,
        createdAt: new Date().toISOString()
      });
      db.writeDb(store);
      return sendJson(res, 201, { ok: true });
    } catch {
      return sendJson(res, 400, { error: 'تعذر إرسال الرسالة' });
    }
  }

  if (req.method === 'POST' && pathname === '/api/admin/login') {
    if (!security.checkRateLimit(ip, 'admin_login', 10, 300000)) {
      return sendJson(res, 429, { error: 'تم حظر المحاولات مؤقتاً، يرجى الانتظار 5 دقائق' });
    }
    try {
      const body = parseJsonObject(await readRequestBody(req));
      const store = db.readDb();
      const validUser = security.safeEqual(String(body.username || ''), store.admin.username);
      const validPass = security.verifyPassword(String(body.password || ''), store.admin.passwordHash);
      if (!validUser || !validPass) {
        return sendJson(res, 401, { error: 'بيانات الدخول غير صحيحة' });
      }
      const token = security.signToken({ role: 'admin', username: store.admin.username }, 14400);
      const secureFlag = config.nodeEnv === 'production' && config.baseUrl.startsWith('https') ? '; Secure' : '';
      res.setHeader('Set-Cookie', `admin_session=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=14400; SameSite=Strict${secureFlag}`);
      return sendJson(res, 200, { ok: true });
    } catch {
      return sendJson(res, 400, { error: 'بيانات غير صالحة' });
    }
  }

  if (req.method === 'POST' && pathname === '/api/admin/logout') {
    if (!isSameOriginMutation(req)) {
      return sendJson(res, 403, { error: 'طلب مرفوض' });
    }
    res.setHeader('Set-Cookie', 'admin_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict');
    return sendJson(res, 200, { ok: true });
  }

  if (pathname.startsWith('/api/admin/')) {
    if ((req.method === 'POST' || req.method === 'PATCH') && !isSameOriginMutation(req)) {
      return sendJson(res, 403, { error: 'طلب غير مصرح به' });
    }
    const admin = getAuthenticatedAdmin(req);
    if (!admin) {
      return sendJson(res, 401, { error: 'انتهت الجلسة، يرجى تسجيل الدخول' });
    }
    const store = db.readDb();

    if (req.method === 'GET' && pathname === '/api/admin/overview') {
      const completedTx = store.transactions.filter((t) => t.status === 'completed');
      const totalAmount = completedTx.reduce((sum, t) => sum + t.amount, 0);
      return sendJson(res, 200, {
        stats: {
          totalAmount: Number(totalAmount.toFixed(2)),
          completedCount: completedTx.length,
          pendingCount: store.transactions.filter((t) => t.status === 'pending').length,
          campaignsCount: store.campaigns.length
        },
        campaigns: store.campaigns,
        transactions: store.transactions.slice(0, 100),
        gateways: gateways.getAvailableGateways(),
        messagesCount: store.messages.length
      });
    }

    if (req.method === 'POST' && pathname === '/api/admin/campaigns') {
      try {
        const body = parseJsonObject(await readRequestBody(req));
        const title = security.sanitizeText(String(body.title || ''), 120);
        const summary = security.sanitizeText(String(body.summary || ''), 240);
        const description = security.sanitizeText(String(body.description || summary), 1500);
        const category = security.sanitizeText(String(body.category || 'عمل خيري'), 50);
        const targetAmount = Number(body.targetAmount);
        if (!title || !summary || !Number.isFinite(targetAmount) || targetAmount < 10) {
          return sendJson(res, 400, { error: 'يرجى إدخال عنوان ووصف ومبلغ مستهدف صحيح' });
        }
        const campaign = {
          id: security.generateId('cmp'),
          title,
          summary,
          description,
          targetAmount: Number(targetAmount.toFixed(2)),
          raisedAmount: 0,
          donorsCount: 0,
          currency: 'USD',
          category,
          status: 'active',
          image: '/assets/img/campaign-water.svg',
          createdAt: new Date().toISOString()
        };
        store.campaigns.unshift(campaign);
        db.writeDb(store);
        return sendJson(res, 201, { campaign });
      } catch {
        return sendJson(res, 400, { error: 'بيانات الحملة غير صالحة' });
      }
    }

    if (req.method === 'PATCH' && pathname.startsWith('/api/admin/campaigns/')) {
      const id = pathname.split('/').pop();
      const campaign = store.campaigns.find((c) => c.id === id);
      if (!campaign) {
        return sendJson(res, 404, { error: 'الحملة غير موجودة' });
      }
      try {
        const body = parseJsonObject(await readRequestBody(req));
        if (body.status === 'active' || body.status === 'paused') {
          campaign.status = body.status;
        }
        if (body.title) {
          campaign.title = security.sanitizeText(String(body.title), 120);
        }
        if (body.targetAmount && Number(body.targetAmount) >= 10) {
          campaign.targetAmount = Number(Number(body.targetAmount).toFixed(2));
        }
        db.writeDb(store);
        return sendJson(res, 200, { campaign });
      } catch {
        return sendJson(res, 400, { error: 'تعذر تحديث الحملة' });
      }
    }

    if (req.method === 'GET' && pathname === '/api/admin/export-csv') {
      const rows = [
        ['ID', 'Campaign', 'Amount', 'Currency', 'Frequency', 'Gateway', 'Donor', 'Status', 'CreatedAt'].join(',')
      ];
      for (const tx of store.transactions) {
        const line = [
          escapeCsvCell(tx.id),
          escapeCsvCell(tx.campaignTitle),
          tx.amount,
          escapeCsvCell(tx.currency),
          escapeCsvCell(tx.frequency),
          escapeCsvCell(tx.gateway),
          escapeCsvCell(tx.donorName),
          escapeCsvCell(tx.status),
          escapeCsvCell(tx.createdAt)
        ].join(',');
        rows.push(line);
      }
      setSecurityHeaders(res);
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="donations-report.csv"'
      });
      res.end('\uFEFF' + rows.join('\n'));
      return;
    }
  }

  return sendJson(res, 404, { error: 'Endpoint not found' });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  if (parsedUrl.pathname.startsWith('/api/')) {
    await handleApi(req, res, parsedUrl);
    return;
  }
  serveStatic(res, parsedUrl.pathname);
});

if (require.main === module) {
  server.listen(config.port, () => {
    console.log(`Server listening on port ${config.port}`);
  });
}

server.handleApi = handleApi;

module.exports = server;
