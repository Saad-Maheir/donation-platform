const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function loadEnvFile() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) {
    return;
  }
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) {
      continue;
    }
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

loadEnvFile();

const defaultSessionSecret = crypto.randomBytes(32).toString('hex');

module.exports = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  baseUrl: (process.env.BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')).replace(/\/+$/, ''),
  sessionSecret: process.env.SESSION_SECRET || defaultSessionSecret,
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH || '',
  paymentMode: process.env.PAYMENT_MODE || 'sandbox',
  gateways: {
    stripe: {
      secretKey: process.env.STRIPE_SECRET_KEY || '',
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || ''
    },
    paypal: {
      clientId: process.env.PAYPAL_CLIENT_ID || '',
      clientSecret: process.env.PAYPAL_CLIENT_SECRET || '',
      webhookId: process.env.PAYPAL_WEBHOOK_ID || '',
      env: process.env.PAYPAL_ENV || 'sandbox'
    },
    tap: {
      secretKey: process.env.TAP_SECRET_KEY || '',
      webhookSecret: process.env.TAP_WEBHOOK_SECRET || ''
    },
    paymob: {
      apiKey: process.env.PAYMOB_API_KEY || '',
      integrationId: process.env.PAYMOB_INTEGRATION_ID || '',
      iframeId: process.env.PAYMOB_IFRAME_ID || '',
      hmacSecret: process.env.PAYMOB_HMAC_SECRET || ''
    }
  }
};
