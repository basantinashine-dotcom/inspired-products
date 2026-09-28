import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const activityTable = pgTable("decision_log_activity", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: text("type").notNull(),
  label: text("label").notNull(),
  detail: text("detail").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  personId: text("person_id").notNull(),
  decisionId: uuid("decision_id"),
});

export const insertActivitySchema = createInsertSchema(activityTable).omit({
  id: true,
  createdAt: true,
});
export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type ActivityRecord = typeof activityTable.$inferSelect;