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
  checks them. (Step 3 found they are Sponsored Display's. The slot chosen
  there has its own, below.)
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

## Step 2: upload and save product photos

**Decision: a project is a campaign holding many product photos**, and each
photo will get its own ads. The alternatives were one photo with many ad
variants, or one photo making one ad.

**Why it matters.** This decides the shape of the data, and changing it later
means moving every advertiser's saved work:

```text
projects        a campaign                      (Step 1)
  products      one row per product photo       (this step)
    variants    one row per ad made from it     (Step 4)
```

Variants wait until Step 4, when there is an edit recipe to store in them.

**What was built**

- A `products` table, one row per photo, recording where the file is and its
  size in pixels.
- A private storage bucket, `drafts`, for the original photos.
- A campaign screen: upload several photos at once, see thumbnails, remove a
  photo. Deleting a campaign removes its photos too.
- The project list shows how many photos each campaign holds.

### How it works

**Files live in storage, facts live in the database.** The photo itself goes
into the `drafts` bucket. The `products` row records where it is and how big
it is. Each file's path starts with its owner's id:

```text
<user id>/<project id>/<product id>/original.jpg
```

**Storage uses the same kind of rules as the database.** In Supabase every
uploaded file is also a row in a table, `storage.objects`, and row level
security applies to it. The rule is "the first folder of the path must be your
user id", so nobody can read, add or delete files outside their own folder.

**Ownership is inherited, not copied.** A product has no owner column. Its
policies ask "does the signed-in user own this product's project?". If
ownership were copied onto every product, the copies could disagree with the
project.

**Two checks on every new product.** The project must be yours, and the
photo path must sit inside your own folder for that project. The second stops
a product pointing at someone else's file, even one you can't open.

**Originals can't be overwritten.** Storage has rules for reading, uploading
and deleting, but deliberately none for updating. That makes non-destructive
editing a database rule rather than a promise in the code: edits will be a
recipe stored next to the photo.

**Limits are checked twice.** The browser checks the file type (JPEG, PNG,
WebP) and size (20 MB) to give a clear message straight away. The bucket
enforces the same limits itself, because the browser's checks can be
bypassed. Photos smaller than 1200×628 still upload, with a warning that ads
made from them may look blurry.

**Private photos are shown through signed URLs.** A private file has no
public address, so a plain `<img>` can't load it. The app asks storage for a
signed URL: a link valid for one hour, given only to someone the rules allow
to read that file. (Base44's scene generation failed partly because it relied
on a link like this after it had expired. Step 4 will draw photos on the
canvas a different way, by downloading the file into the page, which also
avoids the tainted-canvas problem.)

**Order matters when two systems must agree.** Storage and the database are
separate, so there is always a moment when one has changed and the other
hasn't. The order is chosen so a failure leaves an unseen file, never a
product whose photo is missing:

- Adding: upload the file, then create the row. If the row fails, delete the
  file again.
- Removing: delete the row, then the file.
- Deleting a campaign: first note which photo files it has, then delete the
  campaign (its products go with it), then the files.

### How we know it works

`npm run test:db` now runs 16 checks. Nine are new: Ana and Ben try to add
products to each other's campaigns, point a product at the other's photo,
move a product across, upload into the other's folder, overwrite an original,
and see, change or delete each other's products and photos. Signed-out
visitors see nothing, and deleting a campaign removes its products.

Five rules were weakened on purpose: no folder check on new products, no
campaign-owner check, everyone's products readable, uploads allowed anywhere
in the bucket, and originals made overwritable. Each made a test fail.

`npm test` checks the photo rules on their own: accepted types, the 20 MB
limit (exactly 20 MB is allowed), the size warning, storage paths and names
taken from file names.

In a real browser with Supabase faked, 20 checks passed. Uploading four files
stored the two valid ones at the right paths with their sizes read correctly;
the GIF and the 21 MB file were refused with reasons, and the small photo got
a warning. The thumbnails loaded through signed URLs. A failed save removed
its uploaded file. Removing a photo and deleting a campaign left no files
behind.

## Step 3: which Amazon ad slot?

**Decision: Amazon DSP's responsive eCommerce creative**, the spec page linked
at the start. The alternatives were Sponsored Brands (one wide image, a
400×400 logo), Sponsored Display (one wide image, a 1 MB cap), or all three
with rules per ad.

**Why it matters.** The slot sets every size and limit the editor, the
compliance check and the export must meet. In this slot an ad is not a
finished picture. Amazon assembles it in many sizes from parts:

| Part | Rule | Lives in |
| --- | --- | --- |
| Custom image | up to three shapes: square 1200×1200, tall 900×1600, wide 1200×628. No text, logos, calls to action, or white background | the ad (Step 4 makes it) |
| Headline | optional, up to 50 characters | the ad |
| Brand logo | at least 600×100 px, PNG or JPEG, up to 1 MB | the campaign |
| Disclaimer | optional, up to 60 characters, only for products that need one | the product |
| Exported image | JPG or PNG. Sources say 5 MB or 2 MB, so the stricter 2 MB | Step 7 |

These come from search summaries, because Amazon's pages were not reachable
from the build sandbox: the
[ecommerce specs](https://advertising.amazon.com/resources/ad-specs/ecommerce)
and the
[responsive eCommerce creative announcement](https://advertising.amazon.com/resources/whats-new/responsive-ecommerce-creative).
Check them there.

**What was built**

- `amazonSpec.js`: every rule above in one file, as data and small
  functions, with unit tests.
- The ads table (`variants`) arrives a step early, because the headline
  belongs to an ad. Step 4 adds the image to it.
- A brand logo per campaign, with its own storage bucket.
- An optional disclaimer per product.
- A product page: which shapes the photo can fill sharply, the disclaimer,
  and the list of ads with their headlines.
- The upload note from Step 2 now names the shapes a small photo will blur,
  instead of comparing it with one size.

### How it works

**The rules live in two places on purpose.** `amazonSpec.js` drives the page:
counters, disabled Save buttons and messages that say exactly what is wrong.
The migration repeats the same limits as database checks (headline 50,
disclaimer 60, logo 600×100) and as storage limits (logos 1,000,000 bytes,
PNG or JPEG). The page is for being helpful; the database is for being sure.

**Text is never drawn on the image.** Amazon refuses custom images that
contain text or logos, and lays out the headline, logo and disclaimer itself.
So they are stored as fields, and the image stays a clean photo. This is the
biggest change from the Base44 build, which drew them onto the picture.

**"Sharp" is a small calculation.** To fill a shape, the photo is cropped to
that shape's proportions. It stays sharp only if the crop still has at least
the shape's pixels. That comes down to one line: the smaller of
photo width ÷ shape width and photo height ÷ shape height must be at least 1.
A 1600×900 photo fills wide (1.33) but not square (0.75) or tall (0.56).

**Counting characters is harder than it looks.** JavaScript's `.length`
counts an emoji as 2; Postgres's `char_length` counts it as 1. If the page
and the database disagreed, the page could allow a headline the database
refuses. The page counts with `[...text].length`, which matches Postgres,
and both count the trimmed text, because that is what is saved.

**A SQL check passes when a value is missing.** The logo check says "at least
600 wide". If the width were missing, the comparison gives "unknown", and a
check that gives "unknown" counts as passed. So the check also demands that
path, width and height are all present or all absent. A test proved the
weaker version lets a size-less logo through.

**Ownership is still inherited.** An ad belongs to whoever owns its
product's campaign, so its rules look through product to campaign. Nothing
copies an owner onto the ad.

**Replacing a logo follows the same safe order as Step 2.** Upload the new
file under a new name (files are never overwritten), point the campaign at
it, and only then delete the old file.

**"1 MB" is read the strict way.** It could mean 1,000,000 or 1,048,576
bytes. The app uses 1,000,000 so the logo passes whichever Amazon means.
The file-size cap for exported images got the same treatment: when sources
disagree, take the stricter one.

### How we know it works

`npm run test:db` now runs 26 checks. The 10 new ones cover the logo bucket's
settings, logo size and folder rules, the disclaimer and headline limits
(including 50 emoji fitting in 50 characters), ads that can't be added to or
moved onto another advertiser's product, and the usual "Ben can't see or
change Ana's work" and "signed-out visitors see nothing".

Seven rules were weakened on purpose: the logo check without its "all
present" guard, logos pointing anywhere, headline and disclaimer limits
raised by one, ads addable to any product, everyone's ads readable, and a
2 MB logo bucket. Each made a test fail.

`npm test` runs 11 unit tests, including the sharpness calculation for every
shape and the emoji counting.

In a real browser with Supabase faked, 25 checks passed: logos that are too
small or too heavy are refused before upload; a good logo is stored in the
owner's folder and shown; replacing it deletes the old file only after the
new one is saved; the photo note names the blurry shapes; the product page
shows sharp and blurry shapes; over-limit headlines and disclaimers can't be
saved and saved text is trimmed; ad counts update; deleting a campaign
removes its photos and logo.

**Next: Step 4, the manual editing tools.**
