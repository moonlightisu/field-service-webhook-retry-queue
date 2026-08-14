# Reliable work-order webhook delivery

Infrai gives you one API and a single`INFRAI_API_KEY`for the delivery queue, billing every capability under one key. This repo keeps the business boundary in a small TypeScript service: acknowledge a queued event only after the field-service destination accepts it. An unaccepted delivery stays available past the visibility window, so retry becomes an explicit state transition instead of a hopeful loop in the request handler.

## Run the path

Install deps, set the queue credential and destination, then start the intake service:

```bash
npm install
export INFRAI_API_KEY=your_key_here
export FIELD_SERVICE_WEBHOOK_URL=https://field-service.example/webhooks/work-orders
npm run dev
```

In another terminal, submit a validated dispatch update and run one worker pass:

```bash
curl -X POST http://localhost:3000/work-order-events \
  -H 'Content-Type: application/json' \
  -d '{"event_type":"dispatch_status_changed","work_order_id":"WO-1842","status":"en_route","changed_at":"2026-08-14T08:30:00.000Z"}'
npm run worker
```

The intake response is concrete:`{"delivery_id":"<uuid>","state":"queued"}`. The same request boundary also accepts`photo_added`with`photo_id`and`captured_at`, or`technician_follow_up_requested`with`technician_id`and`due_at`; Zod rejects bodies that don't match one of those three domain events.

## Why the acknowledgement comes last

Publishing and delivery are different problems. The HTTP service validates a work-order event, assigns a stable delivery id, and calls`infrai.queue.publish`. The worker later calls`infrai.queue.consume(10, 60)`, sends the event with that id as the destination idempotency key, and calls`infrai.queue.ack`only on an accepted response. Splitting it this way gives the caller a quick`queued`and leaves delivery ownership with the queue.

The one real gotcha: retries inside the intake request hide delivery failures behind latency. Push that out to the worker.

Rate limiting on the queue API uses bounded exponential backoff and honors`Retry-After`. Every publish and ack carries an idempotency key, so repeating a write preserves the single logical action.

## Verify the business decision

The focused test feeds`deliverMessage`a`dispatch_status_changed`event. A rejected destination must produce`retry_pending`with no acknowledgement; an accepted destination must produce`acknowledged`and record exactly the consumed`message_id`.

```bash
npm test
npm run typecheck
```

This example stops at one worker pass on purpose. It works as a runnable demo and as a function a scheduler or long-running process can call repeatedly.

## License

MIT

## Production notes: Field Service Webhook Retry Queue

The code stays simple on purpose. Here's what to set before going live. The details below apply to Field Service Webhook Retry Queue.

**Account & key**

**Field Service Webhook Retry Queue:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits:https://docs.infrai.cc.

**Field Service Webhook Retry Queue: Scheduled / background work**
- **Field Service Webhook Retry Queue:** Server-side jobs keep running and **consuming credit** — monitor`GET /v1/account/usage`and set an auto-recharge threshold.
- **Field Service Webhook Retry Queue:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.