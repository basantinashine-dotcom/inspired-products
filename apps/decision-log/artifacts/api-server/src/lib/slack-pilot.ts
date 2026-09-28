import { and, eq, ne } from "drizzle-orm";
import { db, decisionsTable, peopleTable, reasonsTable } from "@workspace/db";
import {
  getReasonsForDecision,
  toDecision,
  personMap,
  getPeople,
} from "./decision-log";
import { isObject, slackEventChannel, type SlackObject } from "./slack-event-filter";
import { logger } from "./logger";

export function pilotTeamId(): string {
  const id = process.env.SLACK_PILOT_TEAM_ID;
  if (!id) throw new Error("SLACK_PILOT_TEAM_ID is not configured");
  return id;
}

function pilotChannels(): Record<string, string> {
  const raw = process.env.SLACK_PILOT_CHANNELS;
  if (!raw) throw new Error("SLACK_PILOT_CHANNELS is not configured");
  const parsed: unknown = JSON.parse(raw);
  if (!isObject(parsed) || Object.keys(parsed).length !== 2 ||
      !Object.entries(parsed).every(([id, name]) =>
        /^[CG][A-Z0-9]+$/.test(id) && typeof name === "string" && /^[a-z0-9_-]+$/.test(name))) {
    throw new Error("SLACK_PILOT_CHANNELS must contain exactly two channel IDs and names");
  }
  return parsed as Record<string, string>;
}

export function isPilotChannel(channel: unknown): channel is string {
  return typeof channel === "string" && Object.hasOwn(pilotChannels(), channel);
}

function value(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function escapeSlack(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

async function slackApi(method: string, input: SlackObject): Promise<SlackObject> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) throw new Error("SLACK_BOT_TOKEN is not configured");
  const isRead = new Set(["bots.info", "conversations.info", "conversations.replies", "reactions.get", "users.info", "chat.getPermalink"]).has(method);
  const url = new URL(`https://slack.com/api/${method}`);
  if (isRead) {
    for (const [key, field] of Object.entries(input)) {
      if (typeof field !== "string" && typeof field !== "number" && typeof field !== "boolean") {
        throw new Error(`Slack ${method} received an invalid ${key} parameter`);
      }
      url.searchParams.set(key, String(field));
    }
  }
  const response = await fetch(url, isRead
    ? { headers: { authorization: `Bearer ${token}` } }
    : {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(input),
    });
  const body: unknown = await response.json();
  if (!response.ok || !isObject(body) || body.ok !== true) {
    const error = isObject(body) ? value(body.error) : "invalid_response";
    throw new Error(`Slack ${method} failed: ${error || response.status}`);
  }
  if (method === "auth.test") {
    const scopes = response.headers.get("x-oauth-scopes");
    const granted = scopes?.split(",").map((scope) => scope.trim()) ?? [];
    logger.info({
      scopeHeaderPresent: scopes !== null,
      reactionScopeGranted: granted.includes("reactions:read"),
      privateChannelScopeGranted: granted.includes("groups:read"),
    }, "Slack bot reaction permission check");
  }
  return body;
}

export async function verifyBotWorkspace(): Promise<string> {
  const result = await slackApi("auth.test", {});
  if (result.team_id !== pilotTeamId()) {
    throw new Error("Installed Slack bot belongs to a different workspace than the pilot channel");
  }
  const botInfo = await slackApi("bots.info", { bot: value(result.bot_id) });
  const appId = isObject(botInfo.bot) ? value(botInfo.bot.app_id) : "";
  if (!/^A[A-Z0-9]+$/.test(appId)) {
    throw new Error("Slack did not identify the bot's app");
  }
  for (const [channelId, channelName] of Object.entries(pilotChannels())) {
    try {
      const info = await slackApi("conversations.info", { channel: channelId });
      logger.info({
        pilotChannel: channelName,
        botIsMember: isObject(info.channel) && info.channel.is_member === true,
      }, "Slack pilot channel membership check");
    } catch (error) {
      logger.warn({ pilotChannel: channelName, err: error }, "Slack bot cannot access pilot channel");
    }
  }
  return appId;
}

export async function publishAppHome(userId: string): Promise<void> {
  if (!/^[UW][A-Z0-9]+$/.test(userId)) throw new Error("Invalid Slack App Home user ID");
  await slackApi("views.publish", {
    user_id: userId,
    view: {
      type: "home",
      blocks: [
        {
          type: "header",
          text: { type: "plain_text", text: "How to use Decision Log", emoji: true },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "*1. Log a decision*\nIn an approved channel, use *Add reaction → :bulb:* on the original message. Don't type :bulb: into the message text. Or choose *⋮ → Connect to apps → Log as decision*.",
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "*2. Add a reason*\nWait for the bot's *Decision logged* thread reply. In that thread, write `reason (shareable): ...` if the bot may repeat your reason, or `reason (reference only): ...` if it should only link to it. Write at least 20 characters after the colon.",
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "*3. Find it later*\nIn the same channel, type `/why` and a few keywords from the decision—for example, `/why guest checkout`.",
          },
        },
        {
          type: "context",
          elements: [{ type: "mrkdwn", text: "Only top-level teammate text messages in approved private channels can be logged. Answers stay within the channel where you ask." }],
        },
      ],
    },
  });
}

async function permalink(channel: string, ts: string): Promise<string> {
  const result = await slackApi("chat.getPermalink", { channel, message_ts: ts });
  const link = value(result.permalink);
  if (!link.startsWith("https://")) throw new Error("Slack did not return a source permalink");
  return link;
}

async function upsertPerson(userId: string): Promise<void> {
  if (!/^U[A-Z0-9]+$/.test(userId) && !/^W[A-Z0-9]+$/.test(userId)) {
    throw new Error("Invalid Slack user ID");
  }
  const result = await slackApi("users.info", { user: userId });
  const user = isObject(result.user) ? result.user : {};
  const profile = isObject(user.profile) ? user.profile : {};
  const name = value(profile.display_name) || value(user.real_name) || value(user.name);
  if (!name) throw new Error("Slack user has no display name");
  const initials = name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  await db.insert(peopleTable).values({ id: userId, name, initials }).onConflictDoUpdate({
    target: peopleTable.id,
    set: { name, initials },
  });
}

function fromSlackTs(ts: string): Date {
  const seconds = Number(ts);
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error("Invalid Slack timestamp");
  return new Date(seconds * 1000);
}

type CaptureResult = "logged" | "already_logged" | "unsupported_message" | "thread_reply_failed";
async function captureDecision(channel: string, message: SlackObject, loggedBy: string): Promise<CaptureResult> {
  const ts = value(message.ts);
  const text = value(message.text).trim();
  const author = value(message.user);
  if (!/^\d+\.\d+$/.test(ts) || !/^[UW][A-Z0-9]+$/.test(author) ||
      !/^[UW][A-Z0-9]+$/.test(loggedBy) || !text || text.length > 10000 ||
      value(message.bot_id) || (value(message.thread_ts) && message.thread_ts !== ts)) {
    return "unsupported_message";
  }
  const existing = await db.select({ id: decisionsTable.id }).from(decisionsTable).where(and(
    eq(decisionsTable.slackChannelId, channel),
    eq(decisionsTable.slackMessageTs, ts),
  )).limit(1);
  if (existing.length) return "already_logged";
  await Promise.all([upsertPerson(author), loggedBy === author ? Promise.resolve() : upsertPerson(loggedBy)]);
  const source = await permalink(channel, ts);
  const title = text.split("\n").find((line) => line.trim())?.trim().slice(0, 120) || "Logged decision";
  const [decision] = await db.insert(decisionsTable).values({
    title,
    text,
    channel: `#${pilotChannels()[channel]}`,
    channelType: "private",
    status: "current",
    sourceState: "active",
    decidedBy: author,
    loggedBy,
    decidedAt: fromSlackTs(ts),
    permalink: source,
    slackChannelId: channel,
    slackMessageTs: ts,
    participantCount: 1,
    askCount: 0,
  }).onConflictDoNothing().returning();
  if (!decision) return "already_logged";
  try {
    await slackApi("chat.postMessage", {
      channel,
      thread_ts: ts,
      text: "Decision logged. To add a reason, reply here with `reason (shareable): ...` if the text may appear in /why answers, or `reason (reference only): ...` to keep answers linked to this thread without repeating the text. Use at least 20 characters.",
    });
  } catch {
    logger.warn("Decision saved but Slack thread guidance could not be posted");
    return "thread_reply_failed";
  }
  return "logged";
}

export async function captureShortcut(payload: SlackObject): Promise<CaptureResult | "unsupported_channel"> {
  const channel = isObject(payload.channel) ? value(payload.channel.id) : "";
  if (!isPilotChannel(channel)) return "unsupported_channel";
  const message = isObject(payload.message) ? payload.message : {};
  const loggedBy = isObject(payload.user) ? value(payload.user.id) : "";
  return captureDecision(channel, message, loggedBy);
}

export async function notifyShortcutUser(channel: string, user: string, text: string): Promise<void> {
  await slackApi("chat.postEphemeral", { channel, user, text });
}

async function captureReaction(event: SlackObject): Promise<void> {
  const item = isObject(event.item) ? event.item : {};
  const channel = value(item.channel);
  const ts = value(item.ts);
  const loggedBy = value(event.user);
  if (!isPilotChannel(channel) || event.reaction !== "bulb" || item.type !== "message" ||
      !/^\d+\.\d+$/.test(ts) || !/^[UW][A-Z0-9]+$/.test(loggedBy) || value(event.bot_id)) {
    logger.warn({
      validTimestamp: /^\d+\.\d+$/.test(ts),
      validActor: /^[UW][A-Z0-9]+$/.test(loggedBy),
      fromBot: Boolean(value(event.bot_id)),
    }, "Slack bulb reaction ignored due to invalid metadata");
    return;
  }
  const existing = await db.select({ id: decisionsTable.id }).from(decisionsTable).where(and(
    eq(decisionsTable.slackChannelId, channel),
    eq(decisionsTable.slackMessageTs, ts),
  )).limit(1);
  if (existing.length) {
    logger.info("Slack bulb reaction matched an existing decision");
    return;
  }
  const result = await slackApi("reactions.get", { channel, timestamp: ts, full: true });
  if (result.type !== "message" || result.channel !== channel ||
      !isObject(result.message) || result.message.ts !== ts) {
    throw new Error("Slack did not return the reacted-to message");
  }
  const message = result.message;
  if (value(message.thread_ts) && message.thread_ts !== ts) {
    logger.info("Slack bulb reaction was on a thread reply");
    await notifyShortcutUser(channel, loggedBy,
      "Please add :bulb: to a top-level message. Replies inside a thread cannot be logged as separate decisions yet.");
    return;
  }
  const text = value(message.text).trim();
  if (!text || text.length > 10000 || value(message.bot_id) || !value(message.user)) {
    logger.info("Slack bulb reaction was on an unsupported message");
    await notifyShortcutUser(channel, loggedBy,
      "Only text messages from teammates (up to 10,000 characters) can be logged as decisions.");
    return;
  }
  logger.info("Slack bulb reaction is capturing a top-level message");
  await captureDecision(channel, message, loggedBy);
  logger.info("Slack bulb reaction captured a decision");
}

async function captureReason(channel: string, event: SlackObject): Promise<void> {
  const ts = value(event.ts);
  const threadTs = value(event.thread_ts);
  const author = value(event.user);
  const text = value(event.text).trim();
  const match = /^reason \((shareable|reference only)\):\s*([\s\S]+)$/i.exec(text);
  if (!match || !threadTs || threadTs === ts || !author || value(event.bot_id)) return;
  const reasonText = match[2].trim();
  if (reasonText.length < 20 || reasonText.length > 10000) return;
  const [decision] = await db.select().from(decisionsTable).where(and(
    eq(decisionsTable.slackChannelId, channel),
    eq(decisionsTable.slackMessageTs, threadTs),
    eq(decisionsTable.sourceState, "active"),
  )).limit(1);
  if (!decision) return;
  const duplicates = await db.select({ id: reasonsTable.id }).from(reasonsTable).where(and(
    eq(reasonsTable.decisionId, decision.id),
    eq(reasonsTable.slackMessageTs, ts),
  )).limit(1);
  if (duplicates.length) return;
  await upsertPerson(author);
  const link = await permalink(channel, ts);
  const [inserted] = await db.transaction(async (tx) => {
    const [previous] = await tx.select().from(reasonsTable).where(and(
      eq(reasonsTable.decisionId, decision.id),
      eq(reasonsTable.state, "current"),
    )).limit(1);
    const [reason] = await tx.insert(reasonsTable).values({
      decisionId: decision.id,
      text: reasonText,
      author,
      repeatability: match[1].toLowerCase() === "shareable" ? "safe" : "unknown",
      state: "current",
      permalink: link,
      slackMessageTs: ts,
      supersedesId: previous?.id,
    }).onConflictDoNothing().returning();
    if (reason && previous) {
      await tx.update(reasonsTable).set({ state: "superseded" }).where(eq(reasonsTable.id, previous.id));
    }
    return [reason, previous] as const;
  });
  if (!inserted) return;
  await slackApi("chat.postMessage", {
    channel,
    thread_ts: threadTs,
    text: match[1].toLowerCase() === "shareable"
      ? "Reason saved. I can include this text in a /why answer for this channel."
      : "Reason saved as reference-only. /why will link to its source without repeating the text.",
  });
}

async function recoverMissedReasons(channel: string, sourceTs: string): Promise<void> {
  let cursor = "";
  do {
    const result = await slackApi("conversations.replies", {
      channel,
      ts: sourceTs,
      limit: 100,
      ...(cursor ? { cursor } : {}),
    });
    if (!Array.isArray(result.messages)) {
      throw new Error("Slack did not return the source thread");
    }
    for (const message of result.messages) {
      if (isObject(message) && message.ts !== sourceTs && isRelevantReasonReply(message)) {
        await captureReason(channel, message);
      }
    }
    const nextCursor = isObject(result.response_metadata) ? value(result.response_metadata.next_cursor) : "";
    if (result.has_more === true && !nextCursor) {
      throw new Error("Slack source thread has more replies but no pagination cursor");
    }
    cursor = result.has_more === true ? nextCursor : "";
  } while (cursor);
}

function isRelevantReasonReply(message: SlackObject): boolean {
  return typeof message.text === "string" &&
    /^reason \((shareable|reference only)\):/i.test(message.text.trim());
}

export async function handleSlackEvent(event: SlackObject): Promise<void> {
  const channel = value(slackEventChannel(event));
  if (!isPilotChannel(channel)) return;
  const subtype = value(event.subtype);
  if (event.type === "reaction_added") {
    await captureReaction(event);
    return;
  }
  if (event.type === "app_mention") {
    const query = value(event.text).replace(/^<@[^>]+>\s*/, "").replace(/^why\b[?:\s]*/i, "").trim();
    if (!query) return;
    await slackApi("chat.postMessage", {
      channel,
      thread_ts: value(event.thread_ts) || value(event.ts),
      text: await answerWhy(query, channel),
    });
    return;
  }
  if (event.type !== "message") return;
  if (subtype === "message_deleted") {
    const ts = value(event.deleted_ts);
    await db.update(decisionsTable).set({ sourceState: "deleted" }).where(and(
      eq(decisionsTable.slackChannelId, channel),
      eq(decisionsTable.slackMessageTs, ts),
      eq(decisionsTable.sourceState, "active"),
    )).returning();
    return;
  }
  if (subtype === "message_changed" && isObject(event.message)) {
    const edited = event.message;
    const text = value(edited.text).trim();
    const ts = value(edited.ts);
    if (!text || !ts) return;
    await db.update(decisionsTable).set({
      text,
      title: text.split("\n")[0].slice(0, 120),
      sourceEditedAt: new Date(),
    }).where(and(
      eq(decisionsTable.slackChannelId, channel),
      eq(decisionsTable.slackMessageTs, ts),
      eq(decisionsTable.sourceState, "active"),
      ne(decisionsTable.text, text),
    )).returning();
    return;
  }
  if (!subtype) await captureReason(channel, event);
}

const stopWords = new Set(["why", "was", "were", "did", "do", "does", "the", "we", "a", "an", "to", "for", "is", "it", "this", "that", "decide", "decided", "decision", "take", "taken", "on", "about"]);

export async function answerWhy(query: string, channel: string): Promise<string> {
  if (!isPilotChannel(channel)) throw new Error("Channel is not in the pilot allowlist");
  const tokens = [...new Set(query.toLowerCase().match(/[a-z0-9]+/g)?.filter((word) => word.length > 2 && !stopWords.has(word)) ?? [])];
  if (!tokens.length) return "Please include a few words from the decision, for example `/why guest checkout`.";
  const records = await db.select().from(decisionsTable).where(eq(decisionsTable.slackChannelId, channel));
  const ranked = records.map((record) => {
    const haystack = `${record.title} ${record.text}`.toLowerCase();
    return { record, score: tokens.filter((token) => haystack.includes(token)).length };
  }).filter(({ score }) => score === tokens.length).sort((a, b) =>
    b.score - a.score || b.record.decidedAt.getTime() - a.record.decidedAt.getTime()
  );
  if (!ranked.length) return "I don't have a logged decision matching that yet. Add :bulb: to a top-level source message or use the “Log as decision” shortcut first.";
  if (ranked.length > 1) {
    return `I found more than one matching decision. Please be more specific:\n${ranked.slice(0, 3).map(({ record }) =>
      `• ${record.sourceState === "deleted" ? "Source deleted" : escapeSlack(record.title)}`
    ).join("\n")}`;
  }
  const decision = ranked[0].record;
  if (decision.sourceState === "deleted") {
    return "A matching decision was logged, but its source was deleted. I can't verify or repeat it.";
  }
  let reasons = await getReasonsForDecision(decision.id);
  if (!reasons.some((item) => item.state === "current") && decision.slackMessageTs) {
    await recoverMissedReasons(channel, decision.slackMessageTs);
    reasons = await getReasonsForDecision(decision.id);
  }
  const reason = reasons.find((item) => item.state === "current");
  const people = personMap(await getPeople());
  const safeDecision = await toDecision(decision, people);
  const why = !reason
    ? "No reason has been recorded yet."
    : reason.repeatability === "safe"
      ? escapeSlack(reason.text)
      : "The reason is reference-only; see the source thread.";
  const reasonLink = reason ? ` <${reason.permalink}|Reason source>` : "";
  return `*${escapeSlack(safeDecision.title)}* — ${decision.status === "current" ? "still holds" : "reversed"}; decided by ${escapeSlack(safeDecision.decidedBy.name)}.\n${why}\n<${decision.permalink}|Decision source>${reasonLink}`;
}
