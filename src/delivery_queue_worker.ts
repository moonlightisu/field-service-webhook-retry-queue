import { infrai, type QueueMessage } from "./infrai_queue.js";
import { queuedDeliverySchema, type QueuedDelivery } from "./work_order_event.js";

export async function deliverMessage(
  message: QueueMessage,
  send: (delivery: QueuedDelivery) => Promise<boolean>,
  acknowledge: (messageId: string) => Promise<unknown>,
): Promise<"acknowledged" | "retry_pending"> {
  const delivery = queuedDeliverySchema.parse(message.payload);
  const accepted = await send(delivery);
  if (!accepted) return "retry_pending";
  await acknowledge(message.message_id);
  return "acknowledged";
}

async function sendWebhook(delivery: QueuedDelivery): Promise<boolean> {
  const target = process.env.FIELD_SERVICE_WEBHOOK_URL;
  if (!target) throw new Error("FIELD_SERVICE_WEBHOOK_URL is required");
  const response = await fetch(target, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": delivery.delivery_id,
    },
    body: JSON.stringify(delivery.event),
  });
  return response.status >= 200 && response.status < 300;
}

export async function runOnce(): Promise<void> {
  const batch = await infrai.queue.consume(10, 60);
  for (const message of batch.messages ?? []) {
    const state = await deliverMessage(message, sendWebhook, infrai.queue.ack);
    console.log(JSON.stringify({ message_id: message.message_id, state }));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runOnce().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
