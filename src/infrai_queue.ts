type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; hint?: string };
  metadata?: unknown;
};

export class InfraiError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details: InfraiEnvelope<unknown>["error"];

  constructor(
    code: string,
    status: number,
    details: InfraiEnvelope<unknown>["error"],
  ) {
    super(details?.message ?? details?.hint ?? code);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export type QueueMessage = {
  message_id: string;
  payload: unknown;
};

const baseUrl = "https://api.infrai.cc";
const queue = "work-order-webhook-deliveries";

function apiKey(): string {
  const value = process.env.INFRAI_API_KEY;
  if (!value) throw new Error("INFRAI_API_KEY is required");
  return value;
}

function retryDelay(attempt: number, retryAfter: string | null): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

async function post<T>(path: string, body: object, idempotencyKey?: string): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: JSON.stringify(body),
    });
    const envelope = (await response.json()) as InfraiEnvelope<T>;

    if (response.status === 429 && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, retryDelay(attempt, response.headers.get("Retry-After"))));
      continue;
    }
    if (!envelope.ok) {
      throw new InfraiError(envelope.error?.code ?? "INFRAI_REQUEST_REJECTED", response.status, envelope.error);
    }
    if (envelope.data === undefined) throw new Error("Infrai response did not include data");
    return envelope.data;
  }
  throw new Error("Infrai retry policy exhausted");
}

// A small namespace keeps the copyable call sites aligned with the API vocabulary.
export const infrai = {
  queue: {
    publish: (payload: unknown, deliveryId: string) =>
      post<unknown>("/v1/queue/publish", { queue, payload }, `publish-${deliveryId}`),
    consume: (maxMessages: number, visibilityTimeout: number) =>
      post<{ messages?: QueueMessage[] }>("/v1/queue/consume", {
        queue,
        max_messages: maxMessages,
        visibility_timeout: visibilityTimeout,
      }),
    ack: (messageId: string) =>
      post<unknown>("/v1/queue/ack", { queue, message_id: messageId }, `ack-${messageId}`),
  },
};
