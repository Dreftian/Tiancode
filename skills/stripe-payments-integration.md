---
name: stripe-payments-integration
description: Secure, production-ready Stripe integration patterns: Checkout Sessions, PaymentIntents, Webhook signature verification, Customer Portal, idempotency keys, and subscription lifecycle.
tags: ["stripe", "payments", "billing", "subscriptions", "webhooks"]
---

# Stripe Payments & Billing Best Practices

Production architectural standards for implementing payments, subscription billing, and webhooks with Stripe.

## 1. Webhook Signature Verification (Critical)

Never process incoming webhooks without verifying the cryptographic signature against the raw body:

```typescript
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-02-24.acacia',
})

export async function handleStripeWebhook(req: Request): Promise<Response> {
  const sig = req.headers.get('stripe-signature')
  if (!sig) return new Response('Missing signature', { status: 400 })

  const rawBody = await req.text()
  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Invalid signature'
    return new Response(`Webhook Error: ${message}`, { status: 400 })
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      await fulfillOrder(session)
      break
    }
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription
      await syncSubscriptionStatus(subscription)
      break
    }
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 })
}
```

---

## 2. Idempotency & Concurrency

- **Idempotency Keys**: Always provide `idempotencyKey` when creating charges, PaymentIntents, or refunds to prevent duplicate debits on network retries:
  ```typescript
  const paymentIntent = await stripe.paymentIntents.create(
    {
      amount: 2000,
      currency: 'usd',
      customer: customerId,
    },
    { idempotencyKey: `order_${orderId}_attempt_${attempt}` }
  )
  ```
- **Webhook Deduplication**: Store processed `event.id` in your database within a transaction. If `event.id` already exists, acknowledge with 200 OK immediately without re-executing side effects.

---

## 3. Subscriptions & Customer Portal

- Use Stripe Checkout for subscription sign-ups and Stripe Customer Portal for user self-service billing management (upgrades, downgrades, cancellations, payment method updates):
  ```typescript
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${process.env.APP_URL}/settings/billing`,
  })
  // Redirect user to portalSession.url
  ```
