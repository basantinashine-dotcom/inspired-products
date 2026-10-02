# Building Ad Image Studio, one decision at a time

Each step starts with a product decision, then builds only what that decision
needs and explains how it works. The first version of this app was sketched in
Base44, a hosted app builder. Step 0 records what carried over from that
attempt and what did not.

## Step 0: what carried over from the Base44 attempt

**Kept**

- **One studio: manual tools plus an AI scene button.** Advertisers want both.
- **Non-destructive editing.** Store the original photo and a "recipe" (crop,
  colour values), and redraw from them every time. The original is never
  overwritten.
- **A canvas at the exact output size**, with colour tweaks from the browser's
  built-in `ctx.filter`.
- **The tainted canvas lesson.** A browser refuses to export a canvas that has
  drawn an image from another site, unless that site allows it (CORS). Images
  have to be served in a way the page is allowed to read.
- **Preset scene chips**, with the prompt built from the chosen preset plus
  fixed wording ("no text, no watermark") so results are consistent.
- **A history of generations**, so an advertiser can compare variants.
- **A file-size readout against the 1 MB limit**, and a 50-character counter on
  the headline.
- **Private drafts, public finished images.**

**Dropped**

- **Base44's own plumbing** (its entities, `GenerateImage`, signed URLs and
  access settings). None of it works outside Base44.
- **Text and logos inside the image.** Amazon's custom images may not contain
  text, logos or calls to action. The headline, logo and disclaimer are
  separate fields that Amazon lays out itself.
- **Banner sizes as crop targets** (300×250, 728×90 and so on). Amazon builds
  those from one custom image. What it asks for is roughly 1200×628 (at least
  600×314), under 1 MB, not on a white background, with the product filling
  about 40% of the frame. These numbers come from search summaries; Step 3
  checks them.
- **Regenerating the whole photo from a reference image.** That redraws the
  product, so labels and shapes can come out wrong, and Amazon rejects
  warped text. Keeping the product's own pixels and replacing only the
  background is safer. Step 5 decides how.
- **Public links for AI results.** They break the private-drafts rule.
- **The unfinished debugging.** "It is not generating the scene" was never
  fixed. Two lessons carried over: call the image service from a server, and
  always show the real error.

**Roadmap:** 1 where it runs, 2 upload and save, 3 which Amazon ad slot,
4 manual tools, 5 AI scene, 6 compliance check, 7 export and publish.

## Step 1: where does it run?

**Decision: hosted and multi-user.** Several advertisers sign in, each with
their own saved projects, on a deployed website.

**Why it matters.** Base44 quietly provided hosting, sign-in, a database, file
storage and a server to call the AI. Choosing "hosted" means providing all
five. The alternatives were a local app like Decision Log (one user, files on
disk) or a browser-only page like Campaign Lab (no safe place for an AI key,
so no AI scenes).

**What was built**

- A `projects` table in Supabase (a hosted Postgres database with sign-in and
  file storage).
- Sign-in by emailed link, so there are no passwords to store or reset.
- A project list: create, list, delete.
- Tests that prove one advertiser cannot reach another's projects.

### How it works

**The browser talks to the database directly.** There is no server code of
our own yet. The Supabase client in `frontend/src/supabase.js` sends each
request with two things: the project's publishable key, which is public and
only says which project this is, and the signed-in user's session token,
which says who is asking.

**So the database must be the gatekeeper.** Anyone can open the browser's
developer tools and send their own requests with that public key. Nothing in
the React code can be trusted to hide data. The protection lives in the
migration, `supabase/migrations/20261002000000_projects.sql`, in two layers:

1. **Grants: which roles may touch the table at all.** Signed-out visitors
   (`anon`) get nothing. Signed-in users (`authenticated`) may select, insert,
   update and delete, subject to layer 2.
2. **Row level security: which rows.** Every policy compares the row's
   `owner_id` with `auth.uid()`, the user id inside the session token. A
   query for "all projects" quietly returns only yours. Inserting or updating
   a row so that it belongs to someone else is refused.

**The page never says who the owner is.** `owner_id` defaults to
`auth.uid()`, and `Projects.jsx` neither filters by owner nor sends one. If
the frontend did either, a bug or a tampered request could get it wrong. The
database already knows who is signed in, so it decides.

**What happened to "admins see everything"?** Base44 added an admin rule.
Supabase does not need one: the dashboard and the secret `service_role` key
bypass row level security. That secret key must never reach the browser.

### How we know it works

`npm run test:db` plays two advertisers, Ana and Ben, against a real Postgres
and checks seven things: a new project belongs to its creator, nobody can
create a project in someone else's name or hand one over, a blank name is
refused, Ben cannot see, rename or delete Ana's project, and signed-out
visitors cannot read the table.

A test only counts if it fails when the rule breaks. Each rule was weakened
on purpose (row level security switched off, every project made readable, a
project allowed to change owner, signed-out reads allowed) and in each case
a test failed with a plain-English message. One weakening changed nothing:
removing `with check` from the update policy is harmless, because Postgres
then reuses the `using` condition. The migration keeps it anyway so the rule
is visible.

The screens were checked in a real browser against a faked Supabase. That
check confirmed the sign-in link request, the project list, create (name
trimmed, no owner sent), delete (only that project), and that a database
refusal is shown to the user rather than swallowed.

**Next: Step 2, upload and save.**
