const crypto = require('crypto');
const config = require('./config');

function getAvailableGateways() {
  const list = [
    {
      id: 'stripe',
      name: 'بطاقة ائتمانية (Visa / Mastercard)',
      provider: 'Stripe',
      configured: Boolean(config.gateways.stripe.secretKey),
      mode: config.gateways.stripe.secretKey ? 'live' : 'sandbox'
    },
    {
      id: 'paypal',
      name: 'PayPal',
      provider: 'PayPal Checkout',
      configured: Boolean(config.gateways.paypal.clientId && config.gateways.paypal.clientSecret),
      mode: config.gateways.paypal.clientId ? config.gateways.paypal.env : 'sandbox'
    },
    {
      id: 'tap',
      name: 'مدى / فيزا / أبل باي (الخليج)',
      provider: 'Tap Payments',
      configured: Boolean(config.gateways.tap.secretKey),
      mode: config.gateways.tap.secretKey ? 'live' : 'sandbox'
    },
    {
      id: 'paymob',
      name: 'بطاقات بنكية ومحافظ (مصر)',
      provider: 'Paymob',
      configured: Boolean(config.gateways.paymob.apiKey && config.gateways.paymob.integrationId),
      mode: config.gateways.paymob.apiKey ? 'live' : 'sandbox'
    }
  ];
  return list;
}

async function createStripeSession(tx) {
  const params = new URLSearchParams();
  params.append('mode', tx.frequency === 'monthly' ? 'subscription' : 'payment');
  params.append('success_url', `${config.baseUrl}/receipt.html?id=${encodeURIComponent(tx.id)}&token=${encodeURIComponent(tx.receiptToken)}&gateway=stripe`);
  params.append('cancel_url', `${config.baseUrl}/campaign.html?id=${encodeURIComponent(tx.campaignId)}&cancelled=1`);
  params.append('client_reference_id', tx.id);
  params.append('line_items[0][quantity]', '1');
  params.append('line_items[0][price_data][currency]', tx.currency.toLowerCase());
  params.append('line_items[0][price_data][unit_amount]', String(Math.round(tx.amount * 100)));
  params.append('line_items[0][price_data][product_data][name]', tx.campaignTitle);
  if (tx.frequency === 'monthly') {
    params.append('line_items[0][price_data][recurring][interval]', 'month');
  }
  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.gateways.stripe.secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });
  const data = await response.json();
  if (!response.ok || !data.url) {
    throw new Error(data.error?.message || 'Stripe checkout session failed');
  }
  return {
    checkoutUrl: data.url,
    gatewayRef: data.id,
    mode: 'live'
  };
}

async function createTapCharge(tx) {
  const response = await fetch('https://api.tap.company/v2/charges/', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.gateways.tap.secretKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      amount: tx.amount,
      currency: tx.currency,
      customer_initiated: true,
      threeDSecure: true,
      save_card: false,
      description: tx.campaignTitle,
      metadata: { transactionId: tx.id, campaignId: tx.campaignId },
      reference: { transaction: tx.id },
      customer: {
        first_name: tx.anonymous ? 'Donor' : (tx.donorName || 'Donor'),
        email: tx.donorEmail || 'donor@example.com'
      },
      source: { id: 'src_all' },
      redirect: {
        url: `${config.baseUrl}/receipt.html?id=${encodeURIComponent(tx.id)}&token=${encodeURIComponent(tx.receiptToken)}&gateway=tap`
      }
    })
  });
  const data = await response.json();
  if (!response.ok || !data.transaction?.url) {
    throw new Error(data.errors?.[0]?.description || 'Tap charge creation failed');
  }
  return {
    checkoutUrl: data.transaction.url,
    gatewayRef: data.id,
    mode: 'live'
  };
}

async function createCheckoutSession(tx) {
  if (tx.gateway === 'stripe' && config.gateways.stripe.secretKey) {
    return createStripeSession(tx);
  }
  if (tx.gateway === 'tap' && config.gateways.tap.secretKey) {
    return createTapCharge(tx);
  }
  return {
    checkoutUrl: `/checkout-secure.html?id=${encodeURIComponent(tx.id)}&token=${encodeURIComponent(tx.receiptToken)}`,
    gatewayRef: `SBX-${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
    mode: 'sandbox'
  };
}

function verifyStripeWebhook(rawBody, sigHeader) {
  const secret = config.gateways.stripe.webhookSecret;
  if (!secret || !sigHeader) {
    return false;
  }
  const parts = Object.fromEntries(
    sigHeader.split(',').map((item) => {
      const [k, v] = item.split('=');
      return [k, v];
    })
  );
  if (!parts.t || !parts.v1) {
    return false;
  }
  const signedPayload = `${parts.t}.${rawBody}`;
  const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
  const a = Buffer.from(parts.v1);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = {
  getAvailableGateways,
  createCheckoutSession,
  verifyStripeWebhook
};
