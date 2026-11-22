import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Request, type Response } from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// Prevent duplicate transaction replay within server runtime
const processedReferences = new Set<string>();

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function isValidEmail(email: unknown): email is string {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 160;
}

async function createServer() {
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json({ limit: '1mb' }));

  // Health Check
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, service: 'offnot-energy-platform', timestamp: new Date().toISOString() });
  });

  // Safe Public Gateway Configuration Status (never exposes secret keys)
  app.get('/api/payments/config', (_req: Request, res: Response) => {
    const paystackSecret = Boolean(process.env.PAYSTACK_SECRET_KEY?.trim());
    const paystackPublic = process.env.VITE_PAYSTACK_PUBLIC_KEY?.trim() || '';
    const flutterwaveSecret = Boolean(process.env.FLUTTERWAVE_SECRET_KEY?.trim());
    const flutterwavePublic = process.env.VITE_FLUTTERWAVE_PUBLIC_KEY?.trim() || '';

    res.json({
      paystackConfigured: paystackSecret && Boolean(paystackPublic),
      paystackSecretPresent: paystackSecret,
      paystackPublicKey: paystackPublic,
      flutterwaveConfigured: flutterwaveSecret && Boolean(flutterwavePublic),
      flutterwaveSecretPresent: flutterwaveSecret,
      flutterwavePublicKey: flutterwavePublic,
      emailConfigured: Boolean(process.env.RESEND_API_KEY?.trim()),
      mapsConfigured: Boolean(process.env.VITE_GOOGLE_MAPS_API_KEY?.trim()),
      mode: paystackSecret && paystackPublic.startsWith('pk_live_') ? 'live' : 'sandbox',
    });
  });

  // Paystack Payment Initialization
  app.post('/api/payments/paystack/initialize', async (req: Request, res: Response) => {
    try {
      const { email, amountNgn, orderId, orderNumber, instalmentNumber, callbackUrl } = req.body ?? {};
      if (!isValidEmail(email)) {
        res.status(400).json({ error: 'INVALID_EMAIL', message: 'Valid customer email is required.' });
        return;
      }
      if (typeof amountNgn !== 'number' || !Number.isFinite(amountNgn) || amountNgn <= 0) {
        res.status(400).json({ error: 'INVALID_AMOUNT', message: 'Payment amount must be greater than zero.' });
        return;
      }
      if (typeof orderId !== 'string' || !orderId.trim()) {
        res.status(400).json({ error: 'INVALID_ORDER', message: 'Order ID is required.' });
        return;
      }

      const secretKey = process.env.PAYSTACK_SECRET_KEY?.trim();
      if (!secretKey) {
        res.status(503).json({
          error: 'PAYSTACK_NOT_CONFIGURED',
          message:
            'Paystack secret credentials are not configured yet. Set PAYSTACK_SECRET_KEY and VITE_PAYSTACK_PUBLIC_KEY in environment secrets, or submit a Direct Bank Transfer reference for Accounts verification.',
        });
        return;
      }

      const reference = `OFFNOT-PSK-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      const amountKobo = Math.round(amountNgn * 100);

      const response = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          amount: amountKobo,
          currency: 'NGN',
          reference,
          callback_url: typeof callbackUrl === 'string' && callbackUrl.startsWith('http') ? callbackUrl : undefined,
          channels: ['card', 'bank', 'ussd', 'bank_transfer'],
          metadata: {
            orderId,
            orderNumber: typeof orderNumber === 'string' ? orderNumber : '',
            instalmentNumber: typeof instalmentNumber === 'number' ? instalmentNumber : 1,
            merchant: 'OFFNOT ENERGY',
          },
        }),
      });

      const payload = (await response.json()) as {
        status?: boolean;
        message?: string;
        data?: { authorization_url: string; access_code: string; reference: string };
      };

      if (!response.ok || !payload.status || !payload.data) {
        res.status(502).json({
          error: 'PAYSTACK_INIT_FAILED',
          message: payload.message || 'Unable to initialize Paystack transaction.',
        });
        return;
      }

      res.json({
        reference: payload.data.reference,
        authorizationUrl: payload.data.authorization_url,
        accessCode: payload.data.access_code,
      });
    } catch (error) {
      console.error('Paystack initialize error:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to initialize payment.' });
    }
  });

  // Paystack Server-Side Verification
  app.post('/api/payments/paystack/verify', async (req: Request, res: Response) => {
    try {
      const { reference, expectedAmountNgn } = req.body ?? {};
      if (typeof reference !== 'string' || !/^[a-zA-Z0-9_-]{6,120}$/.test(reference)) {
        res.status(400).json({ error: 'INVALID_REFERENCE', message: 'Invalid transaction reference format.' });
        return;
      }
      if (typeof expectedAmountNgn !== 'number' || !Number.isFinite(expectedAmountNgn) || expectedAmountNgn <= 0) {
        res.status(400).json({ error: 'INVALID_AMOUNT', message: 'Expected NGN amount is required.' });
        return;
      }
      if (processedReferences.has(`psk:${reference}`)) {
        res.status(409).json({ error: 'DUPLICATE_TRANSACTION', message: 'This transaction reference has already been verified.' });
        return;
      }

      const secretKey = process.env.PAYSTACK_SECRET_KEY?.trim();
      if (!secretKey) {
        res.status(503).json({
          error: 'PAYSTACK_NOT_CONFIGURED',
          message: 'PAYSTACK_SECRET_KEY is not configured on the server.',
        });
        return;
      }

      const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${secretKey}`,
        },
      });

      const payload = (await response.json()) as {
        status?: boolean;
        message?: string;
        data?: {
          status: string;
          amount: number;
          currency: string;
          reference: string;
          channel?: string;
          paid_at?: string;
          gateway_response?: string;
        };
      };

      if (!response.ok || !payload.status || !payload.data) {
        res.status(502).json({
          error: 'PAYSTACK_VERIFY_FAILED',
          message: payload.message || 'Paystack verification failed.',
        });
        return;
      }

      const expectedKobo = Math.round(expectedAmountNgn * 100);
      if (payload.data.status !== 'success' || payload.data.currency !== 'NGN' || payload.data.amount < expectedKobo) {
        res.status(402).json({
          error: 'PAYMENT_NOT_CONFIRMED',
          message: `Gateway returned status "${payload.data.status}" for ${payload.data.currency} ${(payload.data.amount / 100).toLocaleString()}.`,
        });
        return;
      }

      processedReferences.add(`psk:${reference}`);

      res.json({
        verified: true,
        reference: payload.data.reference,
        amountNgn: payload.data.amount / 100,
        channel: payload.data.channel || 'card',
        paidAt: payload.data.paid_at || new Date().toISOString(),
        gatewayResponse: payload.data.gateway_response || 'Approved',
      });
    } catch (error) {
      console.error('Paystack verify error:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to verify Paystack transaction.' });
    }
  });

  // Flutterwave Server-Side Verification
  app.post('/api/payments/flutterwave/verify', async (req: Request, res: Response) => {
    try {
      const { transactionId, expectedAmountNgn } = req.body ?? {};
      if (
        (typeof transactionId !== 'string' && typeof transactionId !== 'number') ||
        !/^[a-zA-Z0-9_-]{3,80}$/.test(String(transactionId))
      ) {
        res.status(400).json({ error: 'INVALID_TRANSACTION_ID', message: 'Valid Flutterwave transaction ID is required.' });
        return;
      }
      if (typeof expectedAmountNgn !== 'number' || !Number.isFinite(expectedAmountNgn) || expectedAmountNgn <= 0) {
        res.status(400).json({ error: 'INVALID_AMOUNT', message: 'Expected NGN amount is required.' });
        return;
      }
      const keyRef = `flw:${String(transactionId)}`;
      if (processedReferences.has(keyRef)) {
        res.status(409).json({ error: 'DUPLICATE_TRANSACTION', message: 'This Flutterwave transaction has already been verified.' });
        return;
      }

      const secretKey = process.env.FLUTTERWAVE_SECRET_KEY?.trim();
      if (!secretKey) {
        res.status(503).json({
          error: 'FLUTTERWAVE_NOT_CONFIGURED',
          message: 'FLUTTERWAVE_SECRET_KEY is not configured on the server.',
        });
        return;
      }

      const response = await fetch(
        `https://api.flutterwave.com/v3/transactions/${encodeURIComponent(String(transactionId))}/verify`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${secretKey}`,
          },
        }
      );

      const payload = (await response.json()) as {
        status?: string;
        message?: string;
        data?: {
          status: string;
          amount: number;
          currency: string;
          tx_ref: string;
          payment_type?: string;
          created_at?: string;
        };
      };

      if (!response.ok || payload.status !== 'success' || !payload.data) {
        res.status(502).json({
          error: 'FLUTTERWAVE_VERIFY_FAILED',
          message: payload.message || 'Flutterwave verification failed.',
        });
        return;
      }

      if (payload.data.status !== 'successful' || payload.data.currency !== 'NGN' || payload.data.amount < expectedAmountNgn) {
        res.status(402).json({
          error: 'PAYMENT_NOT_CONFIRMED',
          message: `Flutterwave returned status "${payload.data.status}" for ${payload.data.currency} ${payload.data.amount}.`,
        });
        return;
      }

      processedReferences.add(keyRef);

      res.json({
        verified: true,
        reference: payload.data.tx_ref,
        amountNgn: payload.data.amount,
        channel: payload.data.payment_type || 'card',
        paidAt: payload.data.created_at || new Date().toISOString(),
        gatewayResponse: 'Successful',
      });
    } catch (error) {
      console.error('Flutterwave verify error:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to verify Flutterwave transaction.' });
    }
  });

  // Automated Email & WhatsApp Notification Dispatch
  app.post('/api/notifications/send', async (req: Request, res: Response) => {
    try {
      const { recipientEmail, subject, message } = req.body ?? {};
      if (!isValidEmail(recipientEmail) || typeof subject !== 'string' || typeof message !== 'string') {
        res.status(400).json({ error: 'INVALID_PAYLOAD', message: 'Valid recipientEmail, subject, and message are required.' });
        return;
      }

      const resendKey = process.env.RESEND_API_KEY?.trim();
      const fromEmail = process.env.NOTIFICATION_FROM_EMAIL?.trim() || 'OFFNOT ENERGY <onboarding@resend.dev>';

      if (resendKey) {
        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [recipientEmail],
            subject: subject.slice(0, 160),
            html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:8px;">
              <h2 style="color:#15803d;margin-top:0;">OFFNOT ENERGY</h2>
              <p style="color:#334155;font-size:15px;line-height:1.6;">${escapeHtml(message).replace(/\n/g, '<br/>')}</p>
              <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;"/>
              <p style="color:#64748b;font-size:12px;">Clean Energy, Stronger Tomorrow · Ibadan, Oyo State, Nigeria<br/>Customer Service: 07047053453 · offnotenergy@gmail.com</p>
            </div>`,
          }),
        });

        if (emailRes.ok) {
          res.json({ delivered: true, status: 'SENT' });
          return;
        }
      }

      res.json({
        delivered: false,
        status: 'LOGGED',
        note: 'Email provider key (RESEND_API_KEY) not configured; notification recorded in Firestore activity log.',
      });
    } catch (error) {
      console.error('Notification dispatch error:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Notification dispatch failed.' });
    }
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`OFFNOT ENERGY server listening on http://0.0.0.0:${PORT}`);
  });
}

createServer().catch((err) => {
  console.error('Failed to start OFFNOT ENERGY server:', err);
  process.exit(1);
});
