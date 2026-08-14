import { createServer, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { infrai, InfraiError } from "./infrai_queue.js";
import { workOrderEventSchema } from "./work_order_event.js";

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/work-order-events") {
    json(response, 404, { error: "route_not_found" });
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const event = workOrderEventSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    const deliveryId = randomUUID();
    const payload = { delivery_id: deliveryId, event };
    await infrai.queue.publish(payload, deliveryId);
    json(response, 202, { delivery_id: deliveryId, state: "queued" });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      json(response, 400, { error: "invalid_work_order_event" });
      return;
    }
    if (error instanceof InfraiError) {
      json(response, error.status >= 400 && error.status < 500 ? error.status : 502, {
        error: error.code,
        message: error.message,
      });
      return;
    }
    json(response, 502, { error: "delivery_queue_unavailable" });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`work-order intake listening on http://localhost:${port}`));
