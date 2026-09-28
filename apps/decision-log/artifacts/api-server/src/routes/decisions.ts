import { Router, type IRouter } from "express";
import { and, desc, eq, isNull } from "drizzle-orm";
import {
  AddReasonBody,
  AddReasonParams,
  AddReasonResponse,
  AskForReasonParams,
  AskForReasonResponse,
  AskWhyBody,
  AskWhyResponse,
  CreateDecisionBody,
  CreateDecisionResponse,
  DeleteDecisionParams,
  GetDecisionParams,
  GetDecisionResponse,
  ListDecisionsQueryParams,
  ListDecisionsResponse,
} from "@workspace/api-zod";
import {
  db,
  decisionsTable,
  peopleTable,
  reasonsTable,
} from "@workspace/db";
import {
  addActivity,
  bumpAskCount,
  ensureSeeded,
  getDecisions,
  getPeople,
  getReasonsForDecision,
  matchesDecision,
  personMap,
  toDecision,
} from "../lib/decision-log";

const router: IRouter = Router();

router.get("/decisions", async (req, res): Promise<void> => {
  await ensureSeeded();
  const parsed = ListDecisionsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [records, people] = await Promise.all([getDecisions(), getPeople()]);
  const peopleById = personMap(people);
  const filtered = [];
  for (const record of records) {
    const reasons = await getReasonsForDecision(record.id);
    const hasCurrentReason = reasons.some((reason) => reason.state === "current");
    const matchesStatus =
      parsed.data.status === "all" ||
      (parsed.data.status === "incomplete" && !hasCurrentReason) ||
      (parsed.data.status === "current" && record.status === "current") ||
      (parsed.data.status === "reversed" && record.status === "reversed");
    const matchesChannel =
      !parsed.data.channel ||
      record.channel.toLowerCase().includes(parsed.data.channel.toLowerCase());
    const matchesQuery =
      !parsed.data.query || matchesDecision(record, reasons, parsed.data.query);
    if (matchesStatus && matchesChannel && matchesQuery) {
      filtered.push(await toDecision(record, peopleById, records));
    }
  }

  res.json(ListDecisionsResponse.parse(filtered));
});

router.post("/decisions", async (req, res): Promise<void> => {
  await ensureSeeded();
  const parsed = CreateDecisionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [fallbackPerson] = await db.select().from(peopleTable).limit(1);
  const [decision] = await db
    .insert(decisionsTable)
    .values({
      title: parsed.data.title,
      text: parsed.data.text,
      channel: parsed.data.channel,
      channelType: parsed.data.channelType,
      permalink: parsed.data.permalink,
      decidedBy: parsed.data.decidedById || fallbackPerson?.id || "demo-user",
      loggedBy: parsed.data.loggedById || fallbackPerson?.id || "demo-user",
      decidedAt: new Date(),
      status: "current",
      sourceState: "active",
      participantCount: 1,
      askCount: 0,
    })
    .returning();

  await addActivity({
    type: "decision_logged",
    label: "Decision logged",
    detail: decision.title,
    personId: decision.loggedBy,
    decisionId: decision.id,
  });

  const people = personMap(await getPeople());
  const result = await toDecision(decision, people);
  res.status(201).json(CreateDecisionResponse.parse(result));
});

router.get("/decisions/:decisionId", async (req, res): Promise<void> => {
  await ensureSeeded();
  const params = GetDecisionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [decision] = await db
    .select()
    .from(decisionsTable)
    .where(and(eq(decisionsTable.id, params.data.decisionId), isNull(decisionsTable.slackChannelId)));
  if (!decision) {
    res.status(404).json({ error: "Decision not found" });
    return;
  }

  const result = await toDecision(decision, personMap(await getPeople()));
  res.json(GetDecisionResponse.parse(result));
});

router.delete("/decisions/:decisionId", async (req, res): Promise<void> => {
  await ensureSeeded();
  const params = DeleteDecisionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [decision] = await db
    .select()
    .from(decisionsTable)
    .where(and(eq(decisionsTable.id, params.data.decisionId), isNull(decisionsTable.slackChannelId)));
  if (!decision) {
    res.status(404).json({ error: "Decision not found" });
    return;
  }

  await addActivity({
    type: "source_deleted",
    label: "Decision deleted",
    detail: decision.title,
    personId: decision.loggedBy,
    decisionId: decision.id,
  });
  await db.delete(reasonsTable).where(eq(reasonsTable.decisionId, decision.id));
  await db.delete(decisionsTable).where(eq(decisionsTable.id, decision.id));
  res.sendStatus(204);
});

router.post("/decisions/:decisionId/reasons", async (req, res): Promise<void> => {
  await ensureSeeded();
  const params = AddReasonParams.safeParse(req.params);
  const parsed = AddReasonBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (parsed.data.text.trim().length < 20) {
    res.status(400).json({ error: "Reasons need at least 20 characters to be useful later." });
    return;
  }

  const [decision] = await db
    .select()
    .from(decisionsTable)
    .where(and(eq(decisionsTable.id, params.data.decisionId), isNull(decisionsTable.slackChannelId)));
  if (!decision) {
    res.status(404).json({ error: "Decision not found" });
    return;
  }

  const currentReasons = await getReasonsForDecision(decision.id);
  const previous = currentReasons.find((reason) => reason.state === "current");
  const [fallbackPerson] = await db.select().from(peopleTable).limit(1);

  const inserted = await db.transaction(async (tx) => {
    if (previous) {
      await tx
        .update(reasonsTable)
        .set({ state: "superseded" })
        .where(eq(reasonsTable.id, previous.id));
    }
    const [reason] = await tx
      .insert(reasonsTable)
      .values({
        decisionId: decision.id,
        text: parsed.data.text.trim(),
        author: parsed.data.authorId || fallbackPerson?.id || "demo-user",
        repeatability: parsed.data.repeatability,
        state: "current",
        permalink: `${decision.permalink}?thread=${Date.now()}`,
        supersedesId: previous?.id,
      })
      .returning();
    return reason;
  });

  await addActivity({
    type: previous ? "reason_replaced" : "reason_captured",
    label: previous ? "Reason replaced" : "Reason captured",
    detail: decision.title,
    personId: inserted.author,
    decisionId: decision.id,
  });

  const result = await toDecision(decision, personMap(await getPeople()));
  res.status(201).json(AddReasonResponse.parse(result));
});

router.post("/decisions/:decisionId/ask", async (req, res): Promise<void> => {
  await ensureSeeded();
  const params = AskForReasonParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const decision = await bumpAskCount(params.data.decisionId);
  if (!decision) {
    res.status(404).json({ error: "Decision not found" });
    return;
  }
  res.json(
    AskForReasonResponse.parse({
      success: true,
      message: "A quiet request was posted in the original thread.",
    }),
  );
});

router.post("/why", async (req, res): Promise<void> => {
  await ensureSeeded();
  const parsed = AskWhyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [records, people] = await Promise.all([getDecisions(), getPeople()]);
  const peopleById = personMap(people);
  const candidates = [];
  const tombstones = [];
  for (const record of records) {
    const reasons = await getReasonsForDecision(record.id);
    if (matchesDecision(record, reasons, parsed.data.query)) {
      if (record.sourceState === "active") {
        candidates.push(await toDecision(record, peopleById, records));
      } else {
        tombstones.push(record);
      }
    }
  }

  if (candidates.length === 0 && tombstones.length > 0) {
    res.json(
      AskWhyResponse.parse({
        kind: "tombstone",
        query: parsed.data.query,
        message: "A matching decision used to be logged, but its source message was deleted, so I can't verify or repeat it.",
        decision: null,
        matches: [],
        canAsk: false,
      }),
    );
    return;
  }

  if (candidates.length === 0) {
    res.json(
      AskWhyResponse.parse({
        kind: "no_match",
        query: parsed.data.query,
        message: "I don't have a logged decision about that. React to a message to log one.",
        decision: null,
        matches: [],
        canAsk: false,
      }),
    );
    return;
  }

  const [best, ...others] = candidates;
  const currentReason = best.reasons.find((reason) => reason.state === "current");
  const reasonCopy =
    !currentReason
      ? `No reason was recorded. ${best.loggedBy.name} logged this one.`
      : currentReason.repeatability === "safe"
        ? currentReason.text
        : "This one is sensitive — see the original message.";
  const historyCopy = best.replacementTitle
    ? `This decision replaced ${best.replacementTitle}.`
    : "";
  const message = [
    `${best.title} — ${best.status === "current" ? "still holds" : "reversed"}, decided by ${best.decidedBy.name}.`,
    reasonCopy,
    historyCopy,
  ]
    .filter(Boolean)
    .join(" ");

  res.json(
    AskWhyResponse.parse({
      kind: "answer",
      query: parsed.data.query,
      message,
      decision: best,
      matches: others.slice(0, 3),
      canAsk: !currentReason,
    }),
  );
});

export default router;