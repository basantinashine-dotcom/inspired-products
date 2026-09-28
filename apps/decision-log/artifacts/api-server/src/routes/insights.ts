import { Router, type IRouter } from "express";
import {
  GetSummaryResponse,
  ListActivityQueryParams,
  ListActivityResponse,
} from "@workspace/api-zod";
import {
  activityTable,
  db,
  decisionsTable,
  peopleTable,
  reasonsTable,
} from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import {
  ensureSeeded,
  getActivity,
  getDecisions,
  getPeople,
  getReasonsForDecision,
  personMap,
  toActivity,
} from "../lib/decision-log";

const router: IRouter = Router();

router.get("/summary", async (_req, res): Promise<void> => {
  await ensureSeeded();
  const decisions = await getDecisions();
  let withReasons = 0;
  let totalMinutes = 0;

  for (const decision of decisions) {
    const reasons = await getReasonsForDecision(decision.id);
    const current = reasons.find((reason) => reason.state === "current");
    if (current) {
      withReasons += 1;
      totalMinutes += Math.max(
        0,
        (current.createdAt.getTime() - decision.decidedAt.getTime()) / 60000,
      );
    }
  }

  const channels = new Set(
    decisions.filter((decision) => decision.sourceState === "active").map((decision) => decision.channel),
  );
  res.json(
    GetSummaryResponse.parse({
      totalDecisions: decisions.length,
      withReasons,
      missingReasons: decisions.length - withReasons,
      currentDecisions: decisions.filter((decision) => decision.status === "current").length,
      captureRate: decisions.length === 0 ? 0 : Math.round((withReasons / decisions.length) * 100),
      averageTimeToReasonMinutes: withReasons === 0 ? 0 : Math.round(totalMinutes / withReasons),
      activeChannels: channels.size,
    }),
  );
});

router.get("/activity", async (req, res): Promise<void> => {
  await ensureSeeded();
  const parsed = ListActivityQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const people = personMap(await getPeople());
  const activity = await getActivity(parsed.data.limit);
  const result = await Promise.all(activity.map((item) => toActivity(item, people)));
  res.json(ListActivityResponse.parse(result));
});

export default router;