# Decision Log — Slack app source snapshot

This is the web dashboard and Socket Mode bot built to capture top-level Slack decisions and their thread reasons. The existing offline Decision Log learning exercise remains at ../../agents/decision-log/.

## Privacy boundary

This is a clean copy of application source, not an export of the private Replit project or its Git history. It contains no live tokens, real channel IDs, uploaded screenshots, database records, or workspace notes. The UI uses fictional sample data; real Slack channel records are not exposed on the unauthenticated demo dashboard. Never commit an .env file, real Slack IDs, private messages, or secrets.

## Components

- artifacts/decision-log: React dashboard, generic Slack manifest and setup guide.
- artifacts/api-server: Express API and Slack Socket Mode consumer.
- lib: API contract, generated types, and PostgreSQL schema.

## Run in your own environment

This is a Replit multi-artifact source snapshot, not a turnkey standalone deployment. Register the web service at / and the API server at /api, provide PORT and BASE_PATH=/ to the web build, provision a PostgreSQL database, and install with pnpm. See artifacts/decision-log/SLACK_SETUP.md for the Slack app setup.

Required private values: DATABASE_URL, SLACK_BOT_TOKEN and SLACK_APP_TOKEN. Configure SLACK_PILOT_TEAM_ID and SLACK_PILOT_CHANNELS (JSON mapping of exactly two channel IDs to names) only in your own environment. In a private always-on production deployment set SLACK_SOCKET_MODE_ENABLED=true; keep it false in development. Never run both consumers simultaneously.

This public snapshot does not include the private deployment configuration or publish the live bot.
