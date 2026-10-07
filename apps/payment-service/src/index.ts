import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { rateLimiter } from 'hono-rate-limiter'
import Stripe from 'stripe'

const app = new Hono()

// SECURITY (audit H12): default security headers on every response so that
// even if a misconfigured downstream forgets to add them, the service itself
// refuses framing, sniffing, and exposes a minimal referrer.
app.use('/*', secureHeaders())

// SECURITY (audit C4): lock CORS to known origins. The previous `cors()` call
// with no options reflected any Origin, so this service could be called from
// arbitrary attacker-controlled pages once a victim was logged in elsewhere.
const allowedOrigins = (
  process.env.PAYMENT_SERVICE_ALLOWED_ORIGINS ||
  'http://localhost:3000,http://localhost:3001'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

app.use(
  '/*',
  cors({
    origin: (origin) => (allowedOrigins.includes(origin) ? origin : null),
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    credentials: false,
  }),
)

// SECURITY (audit H12): per-IP rate limit. Stripe endpoints create real
// PaymentIntents and call Stripe APIs that cost money; an unauthenticated
// attacker could otherwise spin them in a loop. Numbers tuned for legitimate
// checkout flows (one customer = ~3-5 calls/min).
app.use(
  '/create-payment-intent',
  rateLimiter({
    windowMs: 60_000,
    limit: 30,
    standardHeaders: 'draft-6',
    keyGenerator: (c) =>
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
      c.req.header('x-real-ip') ||
      'unknown',
  }),
)
app.use(
  '/receipt-url',
  rateLimiter({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: 'draft-6',
    keyGenerator: (c) =>
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
      c.req.header('x-real-ip') ||
      'unknown',
  }),
)
app.use(
  '/payment-method-details',
  rateLimiter({
    windowMs: 60_000,
    limit: 60,
    standardHeaders: 'draft-6',
    keyGenerator: (c) =>
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
      c.req.header('x-real-ip') ||
      'unknown',
  }),
)

const stripe =
  process.env.STRIPE_SECRET_KEY?.trim() &&
  !process.env.STRIPE_SECRET_KEY.includes('placeholder')
    ? new Stripe(process.env.STRIPE_SECRET_KEY)
    : null

app.get('/', (c) => {
  return c.text('Hello Hono!')
})

/**
 * Stripe identity probe, to be compared with product-service's
 * `/api/health/stripe`. The two services must authenticate as the SAME Stripe
 * account in the SAME mode: this one creates PaymentIntents, the other reads
 * them back to verify orders. A mismatch fails every checkout with
 * "Could not verify payment with Stripe".
 *
 * Reachable on the loopback interface only (nginx does not proxy :8002).
 */
app.get('/health/stripe', async (c) => {
  const key = process.env.STRIPE_SECRET_KEY?.trim() ?? ''
  const mode = key.startsWith('sk_live_') || key.startsWith('rk_live_')
    ? 'live'
    : key.startsWith('sk_test_') || key.startsWith('rk_test_')
      ? 'test'
      : 'unknown'

  if (!stripe) {
    return c.json({ configured: false, service: 'payment-service', mode })
  }
  try {
    const account = await stripe.accounts.retrieve()
    return c.json({
      configured: true,
      service: 'payment-service',
      mode,
      accountId: account.id,
      accountName: account.settings?.dashboard?.display_name ?? null,
    })
  } catch (err) {
    const e = err as { message?: string; type?: string; code?: string }
    return c.json(
      {
        configured: true,
        service: 'payment-service',
        mode,
        error: e.message,
        type: e.type,
        code: e.code,
      },
      500,
    )
  }
})

app.get('/stripe-config', (c) => {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? process.env.STRIPE_PUBLISHABLE_KEY
  if (!key?.trim() || key.includes('placeholder')) {
    return c.json({ error: 'Stripe publishable key not configured' }, 503)
  }
  return c.json({ publishableKey: key })
})

/**
 * Stripe metadata limits: at most 50 keys, keys <= 40 chars, values <= 500
 * chars, strings only. Exceeding any of them fails the whole
 * paymentIntents.create call, so clamp instead of trusting the caller.
 *
 * This copy is provenance, not the authoritative snapshot — the full payload
 * lives in product-service's `checkout_intent` row. Having it on the
 * PaymentIntent means an order can be reconstructed from Stripe alone, and the
 * details are visible in the dashboard right next to the payment.
 */
function sanitizeStripeMetadata(
  raw: Record<string, unknown> | undefined,
): Record<string, string> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw)) {
    if (Object.keys(out).length >= 50) break
    if (value == null) continue
    const k = key.slice(0, 40)
    const v = typeof value === 'string' ? value : JSON.stringify(value)
    if (!v) continue
    out[k] = v.slice(0, 500)
  }
  return out
}

app.post('/create-payment-intent', async (c) => {
  if (!stripe) {
    return c.json(
      { error: 'Stripe is not configured. Add STRIPE_SECRET_KEY to .env' },
      503
    )
  }

  try {
    const body = await c.req
      .json<{
        amount?: number
        currency?: string
        metadata?: Record<string, unknown>
      }>()
      .catch(
        (): {
          amount?: number
          currency?: string
          metadata?: Record<string, unknown>
        } => ({}),
      )
    const amountSek = parseFloat(String(body.amount ?? 0)) || 0

    if (amountSek <= 0) {
      return c.json({ error: 'Amount must be greater than 0' }, 400)
    }

    // SECURITY (audit M7 / cost amplification): cap any single PaymentIntent
    // at 1,000,000 SEK. Legitimate orders are nowhere near this; a runaway
    // client supplying a huge amount could otherwise create a single Stripe
    // charge large enough to trigger card-network alerts or chargebacks.
    if (amountSek > 1_000_000) {
      return c.json({ error: 'Amount exceeds maximum allowed' }, 400)
    }

    const amountOre = Math.round(amountSek * 100)

    const metadata = sanitizeStripeMetadata(body.metadata)

    // Allowlisted, never free-form: the currency decides which local payment
    // methods Stripe offers (Klarna requires it to match the buyer's country),
    // and an unexpected value would create an uncharg eable intent. The caller
    // is product-service's quote, which derives it from the shipping country.
    const requested = (body.currency ?? 'sek').toLowerCase()
    const currency = requested === 'nok' ? 'nok' : 'sek'
    if (requested !== currency) {
      console.warn(`[stripe] unsupported currency "${requested}"; charging SEK`)
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountOre,
      currency,
      automatic_payment_methods: { enabled: true },
      ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
    })

    return c.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stripe error'
    console.error('[stripe create-payment-intent]', err)
    return c.json({ error: message }, 500)
  }
})

app.get('/receipt-url', async (c) => {
  if (!stripe) {
    return c.json(
      { error: 'Stripe is not configured' },
      503
    )
  }

  const paymentIntentId = c.req.query('paymentIntentId')
  if (!paymentIntentId?.startsWith('pi_')) {
    return c.json({ error: 'Invalid paymentIntentId' }, 400)
  }

  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ['latest_charge'],
    })
    const charge = pi.latest_charge
    const receiptUrl =
      charge &&
      typeof charge === 'object' &&
      'receipt_url' in charge &&
      charge.receipt_url
        ? String(charge.receipt_url)
        : null
    const receiptNumber =
      charge &&
      typeof charge === 'object' &&
      'receipt_number' in charge &&
      charge.receipt_number
        ? String(charge.receipt_number).replace(/^#/, '')
        : null
    return c.json({ receiptUrl, receiptNumber })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stripe error'
    console.error('[stripe receipt-url]', err)
    return c.json({ error: message, receiptUrl: null, receiptNumber: null }, 500)
  }
})

app.get('/payment-method-details', async (c) => {
  if (!stripe) {
    return c.json({ error: 'Stripe is not configured', last4: null }, 503)
  }

  const paymentIntentId = c.req.query('paymentIntentId')
  if (!paymentIntentId?.startsWith('pi_')) {
    return c.json({ error: 'Invalid paymentIntentId', last4: null }, 400)
  }

  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ['payment_method'],
    })
    const pm = pi.payment_method
    if (pm && typeof pm === 'object' && 'card' in pm && pm.card && typeof pm.card === 'object' && 'last4' in pm.card) {
      return c.json({ last4: String((pm.card as { last4: string }).last4) })
    }
    return c.json({ last4: null })
  } catch (err) {
    console.error('[stripe payment-method-details]', err)
    return c.json({ last4: null }, 500)
  }
})

const port = Number(process.env.PORT) || 8002

serve(
  {
    fetch: app.fetch,
    port,
  },
  (info) => {
    console.log(`Payment service running on http://localhost:${info.port}`)
  }
)
