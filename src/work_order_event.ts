import { z } from "zod";

export const workOrderEventSchema = z.discriminatedUnion("event_type", [
  z.object({
    event_type: z.literal("photo_added"),
    work_order_id: z.string().min(1),
    photo_id: z.string().min(1),
    captured_at: z.string().datetime(),
  }),
  z.object({
    event_type: z.literal("dispatch_status_changed"),
    work_order_id: z.string().min(1),
    status: z.enum(["assigned", "en_route", "on_site", "completed"]),
    changed_at: z.string().datetime(),
  }),
  z.object({
    event_type: z.literal("technician_follow_up_requested"),
    work_order_id: z.string().min(1),
    technician_id: z.string().min(1),
    due_at: z.string().datetime(),
  }),
]);

export type WorkOrderEvent = z.infer<typeof workOrderEventSchema>;

export const queuedDeliverySchema = z.object({
  delivery_id: z.string().uuid(),
  event: workOrderEventSchema,
});

export type QueuedDelivery = z.infer<typeof queuedDeliverySchema>;
