import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import Stripe from 'stripe'

const app = new Hono()

app.use('/*', cors())

const stripe =
  process.env.STRIPE_SECRET_KEY?.trim() &&
  !process.env.STRIPE_SECRET_KEY.includes('placeholder')
    ? new Stripe(process.env.STRIPE_SECRET_KEY)
    : null

app.get('/', (c) => {
  return c.text('Hello Hono!')
})

app.get('/stripe-config', (c) => {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? process.env.STRIPE_PUBLISHABLE_KEY
  if (!key?.trim() || key.includes('placeholder')) {
    return c.json({ error: 'Stripe publishable key not configured' }, 503)
  }
  return c.json({ publishableKey: key })
})

app.post('/create-payment-intent', async (c) => {
  if (!stripe) {
    return c.json(
      { error: 'Stripe is not configured. Add STRIPE_SECRET_KEY to .env' },
      503
    )
  }

  try {
    const body = await c.req.json<{ amount?: number }>().catch(() => ({}))
    const amountSek = parseFloat(String(body?.amount ?? 0)) || 0

    if (amountSek <= 0) {
      return c.json({ error: 'Amount must be greater than 0' }, 400)
    }

    const amountOre = Math.round(amountSek * 100)

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountOre,
      currency: 'sek',
      automatic_payment_methods: { enabled: true },
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
    return c.json({ receiptUrl })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stripe error'
    console.error('[stripe receipt-url]', err)
    return c.json({ error: message, receiptUrl: null }, 500)
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
