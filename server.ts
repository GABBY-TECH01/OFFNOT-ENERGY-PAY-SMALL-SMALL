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

interface FirebaseAppletConfig {
  projectId?: string;
  firestoreDatabaseId?: string;
}

let firebaseConfig: FirebaseAppletConfig = {};
try {
  const rawCfg = fs.readFileSync(path.resolve(__dirname, 'firebase-applet-config.json'), 'utf8');
  firebaseConfig = JSON.parse(rawCfg) as FirebaseAppletConfig;
} catch {
  firebaseConfig = {};
}

const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID?.trim() || firebaseConfig.projectId || '';
const FIRESTORE_DATABASE_ID =
  process.env.FIRESTORE_DATABASE_ID?.trim() || firebaseConfig.firestoreDatabaseId || '(default)';

let cachedCerts: { certs: Record<string, string>; expiresAt: number } | null = null;

async function getFirebasePublicCerts(): Promise<Record<string, string>> {
  if (cachedCerts && Date.now() < cachedCerts.expiresAt) {
    return cachedCerts.certs;
  }
  const resp = await fetch(
    'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'
  );
  if (!resp.ok) {
    throw new Error('Failed to fetch Firebase public certificates.');
  }
  const cacheControl = resp.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const maxAgeSec = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;
  const certs = (await resp.json()) as Record<string, string>;
  cachedCerts = { certs, expiresAt: Date.now() + maxAgeSec * 1000 };
  return certs;
}

function decodeBase64UrlJson<T>(segment: string): T {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + '='.repeat(padLen);
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as T;
}

interface VerifiedFirebaseUser {
  uid: string;
  email: string;
  emailVerified: boolean;
}

async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedFirebaseUser> {
  if (!FIREBASE_PROJECT_ID) {
    throw new Error('Firebase projectId is not configured on the server.');
  }
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed Firebase ID token.');
  }
  const [headerB64, payloadB64, sigB64] = parts;
  const header = decodeBase64UrlJson<{ alg?: string; kid?: string }>(headerB64);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid) {
    throw new Error('Invalid Firebase ID token algorithm or key ID.');
  }

  const certs = await getFirebasePublicCerts();
  const certPem = certs[header.kid];
  if (!certPem) {
    throw new Error('Signing certificate not found for token.');
  }

  const normalizedSig = sigB64.replace(/-/g, '+').replace(/_/g, '/');
  const sigPad = (4 - (normalizedSig.length % 4)) % 4;
  const signature = Buffer.from(normalizedSig + '='.repeat(sigPad), 'base64');

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();
  if (!verifier.verify(certPem, signature)) {
    throw new Error('Invalid Firebase ID token signature.');
  }

  const payload = decodeBase64UrlJson<{
    aud?: string;
    iss?: string;
    sub?: string;
    exp?: number;
    iat?: number;
    email?: string;
    email_verified?: boolean;
  }>(payloadB64);

  const nowSec = Math.floor(Date.now() / 1000);
  if (payload.aud !== FIREBASE_PROJECT_ID) {
    throw new Error('Token audience mismatch.');
  }
  if (payload.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`) {
    throw new Error('Token issuer mismatch.');
  }
  if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 128) {
    throw new Error('Invalid token subject.');
  }
  if (typeof payload.exp !== 'number' || payload.exp <= nowSec) {
    throw new Error('Firebase ID token has expired.');
  }
  if (typeof payload.iat !== 'number' || payload.iat > nowSec + 300) {
    throw new Error('Token issued-at timestamp is invalid.');
  }

  return {
    uid: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : '',
    emailVerified: Boolean(payload.email_verified),
  };
}

async function verifyAuthorizedStaffFromRequest(
  req: Request
): Promise<{ uid: string; email: string; role: string }> {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    throw new Error('UNAUTHORIZED:Missing Bearer authentication token.');
  }
  const idToken = authHeader.slice(7).trim();
  if (!idToken) {
    throw new Error('UNAUTHORIZED:Empty authentication token.');
  }

  const verifiedUser = await verifyFirebaseIdToken(idToken);
  if (
    verifiedUser.email.toLowerCase() === 'francisgabriel932@gmail.com' &&
    verifiedUser.emailVerified
  ) {
    return { uid: verifiedUser.uid, email: verifiedUser.email, role: 'super_admin' };
  }

  // Verify active management/super_admin role directly from Firestore REST API using caller's token
  const docUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    FIREBASE_PROJECT_ID
  )}/databases/${encodeURIComponent(FIRESTORE_DATABASE_ID)}/documents/staff/${encodeURIComponent(
    verifiedUser.uid
  )}`;
  const staffRes = await fetch(docUrl, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!staffRes.ok) {
    throw new Error('FORBIDDEN:Authorized management or Super Admin account required.');
  }
  const staffDoc = (await staffRes.json()) as {
    fields?: {
      active?: { booleanValue?: boolean };
      role?: { stringValue?: string };
    };
  };
  const isActive = staffDoc.fields?.active?.booleanValue === true;
  const role = staffDoc.fields?.role?.stringValue || '';
  if (!isActive || !['super_admin', 'ceo', 'managing_director', 'manager'].includes(role)) {
    throw new Error('FORBIDDEN:Insufficient role permissions for bulk customer broadcasts.');
  }

  return { uid: verifiedUser.uid, email: verifiedUser.email, role };
}

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

      const safeCallbackUrl =
        typeof callbackUrl === 'string' && /^https?:\/\//i.test(callbackUrl)
          ? callbackUrl
          : undefined;

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
          callback_url: safeCallbackUrl,
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

  // Flutterwave Payment Initialization
  app.post('/api/payments/flutterwave/initialize', async (req: Request, res: Response) => {
    try {
      const { email, customerName, amountNgn, orderId, orderNumber, instalmentNumber, callbackUrl } =
        req.body ?? {};
      if (!isValidEmail(email)) {
        res.status(400).json({ error: 'INVALID_EMAIL', message: 'Valid customer email is required.' });
        return;
      }
      if (typeof amountNgn !== 'number' || !Number.isFinite(amountNgn) || amountNgn <= 0) {
        res
          .status(400)
          .json({ error: 'INVALID_AMOUNT', message: 'Payment amount must be greater than zero.' });
        return;
      }
      if (typeof orderId !== 'string' || !orderId.trim()) {
        res.status(400).json({ error: 'INVALID_ORDER', message: 'Order ID is required.' });
        return;
      }

      const secretKey = process.env.FLUTTERWAVE_SECRET_KEY?.trim();
      if (!secretKey) {
        res.status(503).json({
          error: 'FLUTTERWAVE_NOT_CONFIGURED',
          message:
            'Flutterwave secret credentials are not configured yet. Set FLUTTERWAVE_SECRET_KEY and VITE_FLUTTERWAVE_PUBLIC_KEY in environment secrets, or submit a Direct Bank Transfer reference.',
        });
        return;
      }

      const txRef = `OFFNOT-FLW-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      const safeRedirect =
        typeof callbackUrl === 'string' && /^https?:\/\//i.test(callbackUrl)
          ? callbackUrl
          : undefined;

      const response = await fetch('https://api.flutterwave.com/v3/payments', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tx_ref: txRef,
          amount: Math.round(amountNgn),
          currency: 'NGN',
          redirect_url: safeRedirect,
          customer: {
            email,
            name: typeof customerName === 'string' && customerName.trim() ? customerName.trim().slice(0, 120) : 'OFFNOT Customer',
          },
          meta: {
            orderId,
            orderNumber: typeof orderNumber === 'string' ? orderNumber : '',
            instalmentNumber: typeof instalmentNumber === 'number' ? instalmentNumber : 1,
            merchant: 'OFFNOT ENERGY',
          },
          customizations: {
            title: 'OFFNOT ENERGY',
            description: `Solar Order ${typeof orderNumber === 'string' ? orderNumber : orderId}`,
          },
        }),
      });

      const payload = (await response.json()) as {
        status?: string;
        message?: string;
        data?: { link?: string };
      };

      if (!response.ok || payload.status !== 'success' || !payload.data?.link) {
        res.status(502).json({
          error: 'FLUTTERWAVE_INIT_FAILED',
          message: payload.message || 'Unable to initialize Flutterwave transaction.',
        });
        return;
      }

      res.json({
        reference: txRef,
        authorizationUrl: payload.data.link,
      });
    } catch (error) {
      console.error('Flutterwave initialize error:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to initialize Flutterwave payment.' });
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

  // Authenticated Bulk Customer Broadcast (Happy New Month & New Product Announcements)
  app.post('/api/notifications/broadcast', async (req: Request, res: Response) => {
    try {
      try {
        await verifyAuthorizedStaffFromRequest(req);
      } catch (authErr) {
        const msg = authErr instanceof Error ? authErr.message : 'Unauthorized';
        if (msg.startsWith('FORBIDDEN:')) {
          res.status(403).json({ error: 'FORBIDDEN', message: msg.replace(/^FORBIDDEN:/, '') });
          return;
        }
        res.status(401).json({
          error: 'UNAUTHORIZED',
          message: msg.replace(/^UNAUTHORIZED:/, ''),
        });
        return;
      }

      const { subject, message, campaignType, recipients } = req.body ?? {};
      if (typeof subject !== 'string' || !subject.trim() || subject.trim().length > 160) {
        res.status(400).json({ error: 'INVALID_SUBJECT', message: 'Subject (1–160 chars) is required.' });
        return;
      }
      if (typeof message !== 'string' || !message.trim() || message.trim().length > 4000) {
        res.status(400).json({ error: 'INVALID_MESSAGE', message: 'Message body (1–4000 chars) is required.' });
        return;
      }
      const allowedTypes = ['happy_new_month', 'new_product', 'announcement'];
      const safeType =
        typeof campaignType === 'string' && allowedTypes.includes(campaignType)
          ? campaignType
          : 'announcement';

      if (!Array.isArray(recipients) || recipients.length === 0) {
        res.status(400).json({ error: 'NO_RECIPIENTS', message: 'At least one customer email recipient is required.' });
        return;
      }

      const seenEmails = new Set<string>();
      const validRecipients: { email: string; name: string }[] = [];
      for (const item of recipients.slice(0, 500)) {
        if (!item || typeof item !== 'object') continue;
        const rawEmail = (item as { email?: unknown }).email;
        const rawName = (item as { name?: unknown }).name;
        if (isValidEmail(rawEmail)) {
          const normalized = rawEmail.trim().toLowerCase();
          if (!seenEmails.has(normalized)) {
            seenEmails.add(normalized);
            validRecipients.push({
              email: rawEmail.trim(),
              name: typeof rawName === 'string' && rawName.trim() ? rawName.trim().slice(0, 120) : 'Valued Customer',
            });
          }
        }
      }

      if (validRecipients.length === 0) {
        res.status(400).json({ error: 'NO_VALID_EMAILS', message: 'No valid customer email addresses were provided.' });
        return;
      }

      const resendKey = process.env.RESEND_API_KEY?.trim();
      const fromEmail =
        process.env.NOTIFICATION_FROM_EMAIL?.trim() || 'OFFNOT ENERGY <onboarding@resend.dev>';

      if (!resendKey) {
        res.json({
          ok: true,
          emailConfigured: false,
          sentCount: 0,
          failedCount: 0,
          totalRecipients: validRecipients.length,
          note: 'RESEND_API_KEY is not configured yet; in-app notifications have been logged for customers.',
        });
        return;
      }

      const safeSubject = subject.trim().slice(0, 160);
      const badgeLabel =
        safeType === 'happy_new_month'
          ? 'HAPPY NEW MONTH'
          : safeType === 'new_product'
            ? 'NEW SOLAR ARRIVAL'
            : 'CUSTOMER ANNOUNCEMENT';

      let sentCount = 0;
      let failedCount = 0;
      let lastProviderError = '';

      // Send in Resend batch chunks of up to 100 emails
      for (let i = 0; i < validRecipients.length; i += 100) {
        const chunk = validRecipients.slice(i, i + 100);
        const batchPayload = chunk.map((recipient) => ({
          from: fromEmail,
          to: [recipient.email],
          subject: safeSubject,
          html: `<div style="font-family:sans-serif;max-width:620px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;">
            <div style="display:inline-block;padding:4px 10px;border-radius:6px;background:#ecfdf5;color:#15803d;font-size:11px;font-weight:700;letter-spacing:0.06em;margin-bottom:12px;">${badgeLabel}</div>
            <h2 style="color:#0f172a;margin:0 0 12px 0;">OFFNOT ENERGY</h2>
            <p style="color:#334155;font-size:14px;margin:0 0 12px 0;">Dear ${escapeHtml(recipient.name)},</p>
            <p style="color:#334155;font-size:15px;line-height:1.65;margin:0 0 16px 0;">${escapeHtml(message.trim()).replace(/\n/g, '<br/>')}</p>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;"/>
            <p style="color:#64748b;font-size:12px;margin:0;">Clean Energy, Stronger Tomorrow · Dugbe &amp; Dalute Branches, Ibadan, Oyo State<br/>Customer Service: 07047053453 · offnotenergy@gmail.com</p>
          </div>`,
        }));

        const batchRes = await fetch('https://api.resend.com/emails/batch', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(batchPayload),
        });

        if (batchRes.ok) {
          sentCount += chunk.length;
        } else {
          failedCount += chunk.length;
          try {
            const errJson = (await batchRes.json()) as { message?: string };
            if (errJson.message) lastProviderError = errJson.message;
          } catch {
            // ignore JSON parse failure
          }
        }
      }

      res.json({
        ok: true,
        emailConfigured: true,
        sentCount,
        failedCount,
        totalRecipients: validRecipients.length,
        ...(lastProviderError ? { note: lastProviderError } : {}),
      });
    } catch (error) {
      console.error('Broadcast dispatch error:', error);
      res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Bulk broadcast failed.' });
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
