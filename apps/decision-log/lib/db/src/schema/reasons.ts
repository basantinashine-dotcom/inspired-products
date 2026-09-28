import { pgTable, text, timestamp, uuid, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const reasonsTable = pgTable("decision_log_reasons", {
  id: uuid("id").primaryKey().defaultRandom(),
  decisionId: uuid("decision_id").notNull(),
  text: text("text").notNull(),
  author: text("author").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  repeatability: text("repeatability").notNull().default("unknown"),
  state: text("state").notNull().default("current"),
  permalink: text("permalink").notNull(),
  slackMessageTs: text("slack_message_ts"),
  supersedesId: uuid("supersedes_id"),
}, (table) => [
  uniqueIndex("decision_log_slack_reason_unique").on(table.decisionId, table.slackMessageTs),
]);

export const insertReasonSchema = createInsertSchema(reasonsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertReason = z.infer<typeof insertReasonSchema>;
export type ReasonRecord = typeof reasonsTable.$inferSelect;