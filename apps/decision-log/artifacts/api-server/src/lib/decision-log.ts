import {
  activityTable,
  db,
  decisionsTable,
  peopleTable,
  reasonsTable,
  type ActivityRecord,
  type DecisionRecord,
  type Person,
  type ReasonRecord,
} from "@workspace/db";
import { and, asc, desc, eq, isNull } from "drizzle-orm";

const seedPeople: Array<Person> = [
  { id: "priya", name: "Priya Shah", initials: "PS" },
  { id: "jordan", name: "Jordan Lee", initials: "JL" },
  { id: "marco", name: "Marco Ruiz", initials: "MR" },
  { id: "ana", name: "Ana Costa", initials: "AC" },
];

const seedDecisionIds = {
  guestCheckout: "4d8e2de1-4037-4f8e-9c5e-6f597f1f4d11",
  shipping: "8d7f7097-5e06-47d0-8ec1-bd772b7e1ec1",
  applePay: "c3a9fb9b-6c8a-45cc-9d6b-4c5a8b4dce73",
  legacy: "b6e21d20-58c4-4be8-a69b-67a82a9dbd91",
};

const seedReasonIds = {
  guestCheckout: "122a2f2b-9b3b-41cf-a160-0d7f7bc1b1a1",
  shipping: "5ed0e0f5-6a1c-4c5b-8e34-11fb7e84e8c2",
};

let seedPromise: Promise<void> | undefined;

function seedDate(daysAgo: number, minutesAgo = 0): Date {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setMinutes(date.getMinutes() - minutesAgo);
  return date;
}

export async function ensureSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = (async () => {
      const existing = await db.select({ id: decisionsTable.id }).from(decisionsTable).limit(1);
      if (existing.length > 0) return;

      await db.insert(peopleTable).values(seedPeople).onConflictDoNothing();

      await db.insert(decisionsTable).values([
        {
          id: seedDecisionIds.guestCheckout,
          title: "Keep guest checkout",
          text: "Keep guest checkout for first-time buyers.",
          channel: "#product",
          channelType: "public",
          status: "current",
          sourceState: "active",
          decidedBy: "priya",
          loggedBy: "priya",
          decidedAt: seedDate(19),
          permalink: "https://slack.com/archives/C01PRODUCT/p1725849600000000",
          participantCount: 3,
          askCount: 4,
        },
        {
          id: seedDecisionIds.shipping,
          title: "Hold shipping rollout at 10%",
          text: "Hold the new shipping calculator rollout at 10% until checkout ships.",
          channel: "#checkout",
          channelType: "private",
          status: "current",
          sourceState: "active",
          decidedBy: "jordan",
          loggedBy: "jordan",
          decidedAt: seedDate(7, 42),
          permalink: "https://slack.com/archives/G01CHECKOUT/p1726886400000000",
          participantCount: 2,
          askCount: 1,
        },
        {
          id: seedDecisionIds.applePay,
          title: "Keep Apple Pay in scope",
          text: "Apple Pay stays in scope for the checkout refresh.",
          channel: "#product",
          channelType: "public",
          status: "current",
          sourceState: "active",
          sourceEditedAt: seedDate(1),
          decidedBy: "marco",
          loggedBy: "ana",
          decidedAt: seedDate(3),
          permalink: "https://slack.com/archives/C01PRODUCT/p1727222400000000",
          participantCount: 2,
          askCount: 0,
        },
        {
          id: seedDecisionIds.legacy,
          title: "Remove guest checkout",
          text: "",
          channel: "#product",
          channelType: "public",
          status: "reversed",
          sourceState: "deleted",
          decidedBy: "jordan",
          loggedBy: "jordan",
          decidedAt: seedDate(26),
          permalink: "https://slack.com/archives/C01PRODUCT/p1725244800000000",
          participantCount: 2,
          askCount: 0,
        },
      ]).onConflictDoNothing();

      await db.insert(reasonsTable).values([
        {
          id: seedReasonIds.guestCheckout,
          decisionId: seedDecisionIds.guestCheckout,
          text: "41% of first-time buyers use guest checkout, so forcing sign-in would make abandonment worse.",
          author: "priya",
          createdAt: seedDate(19, -8),
          repeatability: "safe",
          state: "current",
          permalink: "https://slack.com/archives/C01PRODUCT/p1725849600000001",
        },
        {
          id: seedReasonIds.shipping,
          decisionId: seedDecisionIds.shipping,
          text: "We need checkout to settle before we expose a second pricing calculation to customers.",
          author: "jordan",
          createdAt: seedDate(7, -18),
          repeatability: "safe",
          state: "current",
          permalink: "https://slack.com/archives/G01CHECKOUT/p1726886400000001",
        },
      ]).onConflictDoNothing();

      await db.insert(activityTable).values([
        {
          type: "decision_logged",
          label: "Decision logged",
          detail: "Keep Apple Pay in scope",
          personId: "ana",
          decisionId: seedDecisionIds.applePay,
          createdAt: seedDate(3),
        },
        {
          type: "reason_captured",
          label: "Reason captured",
          detail: "Hold shipping rollout at 10%",
          personId: "jordan",
          decisionId: seedDecisionIds.shipping,
          createdAt: seedDate(7, -18),
        },
        {
          type: "source_edited",
          label: "Source edited",
          detail: "Keep Apple Pay in scope",
          personId: "marco",
          decisionId: seedDecisionIds.applePay,
          createdAt: seedDate(1),
        },
        {
          type: "source_deleted",
          label: "Source deleted",
          detail: "Remove guest checkout is now a tombstone",
          personId: "jordan",
          decisionId: seedDecisionIds.legacy,
          createdAt: seedDate(0, 140),
        },
      ]).onConflictDoNothing();
    })();
  }
  await seedPromise;
}

export function personMap(people: Person[]): Map<string, Person> {
  return new Map(people.map((person) => [person.id, person]));
}

export async function getPeople(): Promise<Person[]> {
  await ensureSeeded();
  return db.select().from(peopleTable);
}

export async function getDecisions(): Promise<DecisionRecord[]> {
  await ensureSeeded();
  // The demo web app has no Slack membership authentication. Never expose
  // private live-channel records through its public list and /why routes.
  return db.select().from(decisionsTable)
    .where(isNull(decisionsTable.slackChannelId))
    .orderBy(desc(decisionsTable.decidedAt));
}

export async function getReasonsForDecision(decisionId: string): Promise<ReasonRecord[]> {
  await ensureSeeded();
  return db
    .select()
    .from(reasonsTable)
    .where(eq(reasonsTable.decisionId, decisionId))
    .orderBy(asc(reasonsTable.createdAt));
}

export async function getActivity(limit: number): Promise<ActivityRecord[]> {
  await ensureSeeded();
  return db.select().from(activityTable).orderBy(desc(activityTable.createdAt)).limit(limit);
}

export function toPerson(id: string, people: Map<string, Person>): Person {
  return people.get(id) ?? { id, name: "Unknown teammate", initials: "??" };
}

export function toReason(reason: ReasonRecord, people: Map<string, Person>) {
  return {
    id: reason.id,
    text: reason.text,
    author: toPerson(reason.author, people),
    createdAt: reason.createdAt,
    repeatability: reason.repeatability as "safe" | "sensitive" | "unknown",
    state: reason.state as "current" | "superseded",
    permalink: reason.permalink,
  };
}

export async function toDecision(
  decision: DecisionRecord,
  people: Map<string, Person>,
  allDecisions?: DecisionRecord[],
) {
  const isTombstone = decision.sourceState === "deleted";
  const reasons = isTombstone ? [] : await getReasonsForDecision(decision.id);
  const replacementTitle = decision.replacesId
    ? (allDecisions ?? (await getDecisions())).find((item) => item.id === decision.replacesId)?.title ?? null
    : null;

  return {
    id: decision.id,
    title: isTombstone ? "Source deleted" : decision.title,
    text: isTombstone ? "" : decision.text,
    channel: decision.channel,
    channelType: decision.channelType as "public" | "private",
    status: decision.status as "current" | "reversed",
    sourceState: decision.sourceState as "active" | "deleted",
    sourceEditedAt: decision.sourceEditedAt,
    decidedBy: toPerson(decision.decidedBy, people),
    loggedBy: toPerson(decision.loggedBy, people),
    decidedAt: decision.decidedAt,
    permalink: decision.permalink,
    replacesId: decision.replacesId,
    replacementTitle,
    reasons: reasons.map((reason) => toReason(reason, people)),
    participantCount: decision.participantCount,
    askCount: decision.askCount,
  };
}

export async function toActivity(
  activity: ActivityRecord,
  people: Map<string, Person>,
) {
  return {
    id: activity.id,
    type: activity.type as
      | "decision_logged"
      | "reason_captured"
      | "reason_replaced"
      | "source_edited"
      | "source_deleted"
      | "ask_sent",
    label: activity.label,
    detail: activity.detail,
    createdAt: activity.createdAt,
    person: toPerson(activity.personId, people),
    decisionId: activity.decisionId,
  };
}

export function matchesDecision(
  decision: DecisionRecord,
  reasons: ReasonRecord[],
  query: string,
): boolean {
  const haystack = [
    decision.title,
    decision.text,
    decision.channel,
    ...reasons.map((reason) => reason.text),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.toLowerCase().trim());
}

export async function addActivity(input: {
  type: string;
  label: string;
  detail: string;
  personId: string;
  decisionId?: string;
}) {
  await db.insert(activityTable).values(input);
}

export async function bumpAskCount(decisionId: string, personId = "demo-user") {
  const [decision] = await db
    .select()
    .from(decisionsTable)
    .where(and(eq(decisionsTable.id, decisionId), isNull(decisionsTable.slackChannelId)));
  if (!decision) return null;
  await db
    .update(decisionsTable)
    .set({ askCount: decision.askCount + 1 })
    .where(eq(decisionsTable.id, decisionId));
  await addActivity({
    type: "ask_sent",
    label: "Reason requested",
    detail: decision.title,
    personId,
    decisionId,
  });
  return decision;
}