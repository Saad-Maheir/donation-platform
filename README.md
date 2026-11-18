# منصة العطاء للتبرعات الإلكترونية

منصة تبرعات متكاملة مبنية بـ Node.js (بدون تبعيات خارجية) مع عزل كامل لبيانات كل متبرع ومنافذ جاهزة لربط بوابات الدفع الرسمية.

## التشغيل السريع
```bash
cp .env.example .env
node server.js
```
يعمل الموقع افتراضياً على: `http://localhost:3000`
- بيانات دخول الإدارة الافتراضية للتجربة: `admin` / `Admin@2026!` (يُنصح بتوليد Hash جديد ووضعه في `ADMIN_PASSWORD_HASH` داخل `.env` قبل النشر).

## ربط بوابات الدفع الحقيقية
ضع مفاتيح التاجر الرسمية في ملف `.env` وسيتم التحويل تلقائياً من الوضع التجريبي (Sandbox) إلى الدفع المباشر (Live):
- **Stripe (Visa / Mastercard):** `STRIPE_SECRET_KEY` و `STRIPE_WEBHOOK_SECRET` (رابط الويب هوك: `/api/webhooks/stripe`).
- **PayPal:** `PAYPAL_CLIENT_ID` و `PAYPAL_CLIENT_SECRET`.
- **Tap Payments (الخليج):** `TAP_SECRET_KEY` و `TAP_WEBHOOK_SECRET`.
- **Paymob (مصر):** `PAYMOB_API_KEY` و `PAYMOB_INTEGRATION_ID` و `PAYMOB_IFRAME_ID` و `PAYMOB_HMAC_SECRET`.
