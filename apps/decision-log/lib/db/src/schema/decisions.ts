import { pgTable, text, timestamp, uuid, integer, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const decisionsTable = pgTable("decision_log_decisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  text: text("text").notNull(),
  channel: text("channel").notNull(),
  channelType: text("channel_type").notNull(),
  status: text("status").notNull().default("current"),
  sourceState: text("source_state").notNull().default("active"),
  sourceEditedAt: timestamp("source_edited_at", { withTimezone: true }),
  decidedBy: text("decided_by").notNull(),
  loggedBy: text("logged_by").notNull(),
  decidedAt: timestamp("decided_at", { withTimezone: true }).notNull(),
  permalink: text("permalink").notNull(),
  slackChannelId: text("slack_channel_id"),
  slackMessageTs: text("slack_message_ts"),
  replacesId: uuid("replaces_id"),
  participantCount: integer("participant_count").notNull().default(1),
  askCount: integer("ask_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("decision_log_slack_source_unique").on(table.slackChannelId, table.slackMessageTs),
]);

export const insertDecisionSchema = createInsertSchema(decisionsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertDecision = z.infer<typeof insertDecisionSchema>;
export type DecisionRecord = typeof decisionsTable.$inferSelect;