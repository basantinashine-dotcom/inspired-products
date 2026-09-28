import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const slackEventsTable = pgTable("decision_log_slack_events", {
  id: text("id").primaryKey(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSlackEventSchema = createInsertSchema(slackEventsTable).omit({ processedAt: true });
export type InsertSlackEvent = z.infer<typeof insertSlackEventSchema>;