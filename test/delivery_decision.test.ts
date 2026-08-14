import assert from "node:assert/strict";
import test from "node:test";
import { deliverMessage } from "../src/delivery_queue_worker.js";

const message = {
  message_id: "message-42",
  payload: {
    delivery_id: "0b1d40c9-2a35-46a9-bbb5-6f155ab801e9",
    event: {
      event_type: "dispatch_status_changed",
      work_order_id: "WO-1842",
      status: "en_route",
      changed_at: "2026-08-14T08:30:00.000Z",
    },
  },
};

test("keeps an unaccepted webhook visible for a later delivery attempt", async () => {
  const acknowledged: string[] = [];
  const state = await deliverMessage(message, async () => false, async (id) => acknowledged.push(id));
  assert.equal(state, "retry_pending");
  assert.deepEqual(acknowledged, []);
});

test("acknowledges only after the destination accepts the webhook", async () => {
  const acknowledged: string[] = [];
  const state = await deliverMessage(message, async () => true, async (id) => acknowledged.push(id));
  assert.equal(state, "acknowledged");
  assert.deepEqual(acknowledged, ["message-42"]);
});
