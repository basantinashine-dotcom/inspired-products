import { SocketModeClient } from "@slack/socket-mode";
import { db, slackEventsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { isObject, isRelevantSlackEvent, slackEventChannel } from "./slack-event-filter";
import {
  answerWhy,
  captureShortcut,
  handleSlackEvent,
  isPilotChannel,
  notifyShortcutUser,
  pilotTeamId,
  publishAppHome,
  verifyBotWorkspace,
} from "./slack-pilot";

type SocketPayload = {
  type: string;
  body: unknown;
  ack: (response?: Record<string, unknown>) => Promise<void>;
};

function value(input: unknown): string {
  return typeof input === "string" ? input : "";
}

async function handleCommand(body: Record<string, unknown>, ack: SocketPayload["ack"]): Promise<void> {
  if (body.command !== "/why") {
    await ack({ response_type: "ephemeral", text: "Unknown command." });
    return;
  }
  const channel = value(body.channel_id);
  if (body.team_id !== pilotTeamId() || !isPilotChannel(channel)) {
    await ack({ response_type: "ephemeral", text: "Decision Log is only enabled in the two selected pilot channels." });
    return;
  }
  const query = value(body.text).trim();
  if (query.length > 500) {
    await ack({ response_type: "ephemeral", text: "Please use a shorter question." });
    return;
  }
  try {
    logger.info({ channel }, "Slack why command received");
    const answer = await answerWhy(query, channel);
    await ack({ response_type: "ephemeral", text: answer });
    logger.info({ channel, hasRecordedReason: !answer.includes("No reason has been recorded yet.") }, "Slack why command answered");
  } catch (error) {
    logger.error({ err: error }, "Slack why command failed");
    await ack({ response_type: "ephemeral", text: "I couldn't look that up right now." });
  }
}

async function handleInteraction(body: Record<string, unknown>, ack: SocketPayload["ack"]): Promise<void> {
  if (body.type !== "message_action" || body.callback_id !== "decision_log_capture") {
    await ack();
    return;
  }
  await ack();
  void (async () => {
    let text: string;
    if (!isObject(body.team) || body.team.id !== pilotTeamId()) {
      text = "Decision Log is only enabled in the selected workspace and pilot channels.";
    } else {
      try {
        const result = await captureShortcut(body);
        switch (result) {
          case "logged":
            text = "Decision logged. You can add a reason in the message thread.";
            break;
          case "already_logged":
            text = "This message is already logged as a decision. No duplicate was created.";
            break;
          case "unsupported_message":
            text = "That message was not logged. Select a top-level text message from a teammate (up to 10,000 characters); thread replies and bot messages are not supported.";
            break;
          case "unsupported_channel":
            text = "That message was not logged. Decision Log is only enabled in the two selected pilot channels.";
            break;
          case "thread_reply_failed":
            text = "Decision saved, but I couldn't post the reason instructions in its thread. You can still reply with `reason (shareable): ...` or `reason (reference only): ...` (at least 20 characters).";
            break;
        }
      } catch {
        logger.error("Slack decision capture failed");
        text = "I couldn't confirm that this message was logged. Please try the shortcut again; if it was saved, I'll tell you it's already logged.";
      }
    }
    await respondToShortcut(body, text);
  })().catch(() => {
    logger.error("Slack decision shortcut feedback failed");
  });
}

async function respondToShortcut(body: Record<string, unknown>, text: string): Promise<void> {
  const responseUrl = value(body.response_url);
  // Response URLs are bearer capabilities. Never send message data to an untrusted URL.
  let url: URL | undefined;
  try {
    url = new URL(responseUrl);
  } catch {
    // Older or malformed payloads may have no response URL.
  }
  if (url?.protocol === "https:" && url.hostname === "hooks.slack.com" &&
      url.port === "" && url.username === "" && url.password === "" &&
      /^\/(?:app-)?actions\//.test(url.pathname)) {
    try {
      const response = await fetch(responseUrl, {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ response_type: "ephemeral", text }),
      });
      if (!response.ok) throw new Error(`Slack shortcut response failed: ${response.status}`);
      return;
    } catch {
      logger.warn("Slack shortcut response URL failed; trying private message");
    }
  }
  const channel = isObject(body.channel) ? value(body.channel.id) : "";
  const user = isObject(body.user) ? value(body.user.id) : "";
  if (!/^[CG][A-Z0-9]+$/.test(channel) || !/^[UW][A-Z0-9]+$/.test(user)) {
    throw new Error("Slack shortcut has no valid response URL or recipient");
  }
  await notifyShortcutUser(channel, user, text);
}
async function handleEvent(body: Record<string, unknown>, ack: SocketPayload["ack"]): Promise<void> {
  if (body.team_id === pilotTeamId() && isObject(body.event) &&
      body.event.type === "app_home_opened") {
    const userId = value(body.event.user);
    await ack();
    if (body.event.tab === "home" && /^[UW][A-Z0-9]+$/.test(userId)) {
      void publishAppHome(userId).catch((error: unknown) => {
        logger.error({ err: error }, "Slack App Home publish failed");
      });
    }
    return;
  }
  if (body.team_id !== pilotTeamId() || !isObject(body.event) ||
      !isPilotChannel(slackEventChannel(body.event)) || !isRelevantSlackEvent(body.event)) {
    await ack();
    return;
  }
  const eventId = value(body.event_id);
  if (!eventId) {
    await ack();
    return;
  }
  const [receipt] = await db.insert(slackEventsTable).values({ id: eventId }).onConflictDoNothing().returning();
  if (!receipt) {
    await ack();
    return;
  }
  try {
    await handleSlackEvent(body.event);
    await ack();
  } catch (error) {
    await db.delete(slackEventsTable).where(eq(slackEventsTable.id, receipt.id));
    logger.error({ err: error }, "Slack event failed; leaving it unacknowledged for retry");
  }
}

export async function startSlackSocket(): Promise<SocketModeClient> {
  const appToken = process.env.SLACK_APP_TOKEN;
  if (!appToken) throw new Error("SLACK_APP_TOKEN is required when Socket Mode is enabled");
  const botAppId = await verifyBotWorkspace();
  const socket = new SocketModeClient({ appToken, autoReconnectEnabled: true });
  socket.on("slack_event", (payload: SocketPayload) => {
    void (async () => {
      if (!isObject(payload.body)) {
        await payload.ack();
        return;
      }
      if (typeof payload.body.api_app_id === "string" && payload.body.api_app_id !== botAppId) {
        logger.error("Slack Socket Mode and bot tokens belong to different apps; event ignored");
        await payload.ack();
        return;
      }
      switch (payload.type) {
        case "slash_commands":
          await handleCommand(payload.body, payload.ack);
          break;
        case "interactive":
          await handleInteraction(payload.body, payload.ack);
          break;
        case "events_api":
          await handleEvent(payload.body, payload.ack);
          break;
        default:
          await payload.ack();
      }
    })().catch((error: unknown) => logger.error({ err: error }, "Slack Socket Mode request failed"));
  });
  socket.on("error", (error: unknown) => logger.error({ err: error }, "Slack Socket Mode connection error"));
  await socket.start();
  logger.info("Slack Socket Mode connected for the selected workspace");
  return socket;
}
