export type SlackObject = Record<string, unknown>;

export function isObject(value: unknown): value is SlackObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isRelevantSlackEvent(event: SlackObject): boolean {
  if (event.type === "reaction_added") {
    return event.reaction === "bulb" && isObject(event.item) && event.item.type === "message";
  }
  if (event.type === "app_mention") return true;
  if (event.type !== "message") return false;
  if (event.subtype === "message_deleted" || event.subtype === "message_changed") return true;
  if (event.subtype || typeof event.text !== "string") return false;
  return typeof event.thread_ts === "string" &&
    /^reason \((shareable|reference only)\):/i.test(event.text.trim());
}

export function slackEventChannel(event: SlackObject): unknown {
  return event.type === "reaction_added" && isObject(event.item)
    ? event.item.channel
    : event.channel;
}