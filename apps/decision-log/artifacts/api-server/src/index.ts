import app from "./app";
import { logger } from "./lib/logger";
import { verifyBotWorkspace } from "./lib/slack-pilot";
import { startSlackSocket } from "./lib/slack-socket";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  if (process.env.SLACK_SOCKET_MODE_ENABLED === "true") {
    // Only the published server may consume events from the shared Slack app.
    if (process.env.NODE_ENV !== "production") {
      logger.error("Slack Socket Mode must only be enabled in production");
      process.exit(1);
    }
    void startSlackSocket()
      .then((socket) => {
        process.once("SIGTERM", () => { void socket.disconnect(); });
      })
      .catch((error: unknown) => {
        logger.error({ err: error }, "Slack Socket Mode could not start");
        process.exit(1);
      });
  } else if (process.env.SLACK_BOT_TOKEN) {
    void verifyBotWorkspace()
      .then(() => logger.info("Slack pilot bot authenticated for the selected workspace"))
      .catch((error: unknown) => logger.error({ err: error }, "Slack pilot bot authentication failed"));
  }
});
