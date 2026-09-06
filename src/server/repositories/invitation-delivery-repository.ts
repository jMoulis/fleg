import "server-only";

import type { Db } from "mongodb";
import * as z from "zod";

const invitationDeliveryWriteSchema = z.object({
  organizationId: z.string().min(1),
  invitationId: z.string().min(1),
  provider: z.literal("resend"),
  status: z.enum(["sent", "failed"]),
  providerMessageId: z.string().min(1).optional(),
  idempotencyKey: z.string().min(1).max(256),
  attemptedAt: z.date(),
});

export type InvitationDeliveryWrite = z.infer<
  typeof invitationDeliveryWriteSchema
>;

export class InvitationDeliveryRepository {
  constructor(private readonly db: Db) {}

  async record(rawDelivery: InvitationDeliveryWrite): Promise<void> {
    const delivery = invitationDeliveryWriteSchema.parse(rawDelivery);
    await this.db.collection("notificationDeliveries").updateOne(
      { idempotencyKey: delivery.idempotencyKey },
      {
        $set: {
          ...delivery,
          updatedAt: delivery.attemptedAt,
        },
        $setOnInsert: { createdAt: delivery.attemptedAt },
      },
      { upsert: true },
    );
  }

  async latestStatus(
    invitationId: string,
  ): Promise<"sent" | "failed" | null> {
    const delivery = await this.db.collection("notificationDeliveries").findOne(
      { invitationId },
      { projection: { status: 1 }, sort: { attemptedAt: -1 } },
    );
    const parsed = z
      .object({ status: z.enum(["sent", "failed"]) })
      .safeParse(delivery);
    return parsed.success ? parsed.data.status : null;
  }
}
