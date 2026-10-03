# Ad Image Studio

Turn a plain product photo into ad images an advertiser can submit to Amazon.

A hosted app built one product decision at a time. Each step's decision, the
reason for it and how it is built are written up in [TUTORIAL.md](TUTORIAL.md).
The idea comes from Amazon's own
[AI image generator](https://advertising.amazon.com/blog/ai-image-generation),
which drops a product-on-white photo into a lifestyle scene.

**Built so far (Steps 1 to 3):** sign-in by emailed link; campaigns (called
projects in the app) that each hold several product photos and a brand logo;
ads for each photo with an optional headline, and an optional disclaimer per
product, all held to the limits of Amazon DSP's responsive eCommerce
creative. Each advertiser sees and changes only their own work. Image
editing, AI scenes and export come in later steps.

## Run it

You need Node.js 22.12 or later and a free [Supabase](https://supabase.com)
project. Supabase provides the sign-in, the database and the file storage.

1. In your Supabase project, open **SQL Editor** and run each file in
   `supabase/migrations/` in filename order: `…_projects.sql`,
   `…_products.sql`, then `…_dsp_ad_parts.sql`.
2. Under **Authentication > URL Configuration**, check that the Site URL is
   `http://localhost:3000` (the default for a new project).
3. Copy `frontend/env.example` to `frontend/.env.local` and fill in your
   project's URL and publishable (or anon) key from **Project Settings > API**.
4. From this folder:

   ```sh
   npm install
   npm run dev
   ```

5. Open http://localhost:3000 and sign in with your email.

To see the privacy rule work, sign in with a second email address in another
browser. Neither account can see the other's projects, photos or ads.

Supabase's built-in email sender only sends a few sign-in emails an hour. That
is enough to try the app; a real launch would connect your own email service.

## Test it

```sh
npm test          # photo and Amazon rules, as plain functions. Needs nothing.
npm run test:db   # the database's privacy rules
```

`npm run test:db` starts a throwaway Postgres on your machine (no Docker, no
Supabase account), applies the migrations and checks, as two advertisers, that
neither can see, add to, change, move or delete the other's campaigns,
products, photos, logos or ads; that an uploaded original cannot be
overwritten; that Amazon's limits on headlines, disclaimers and logos hold in
the database; and that signed-out visitors see nothing. It needs the Postgres server tools
(`initdb`, `pg_ctl`, `psql`). On a Mac: `brew install postgresql@16`.

## How it is built

```text
frontend/                      React app, built with Vite
  src/supabase.js              the one Supabase client
  src/App.jsx                  sign-in, project list or one project
  src/SignIn.jsx               email a sign-in link
  src/Projects.jsx             list, create and delete projects (campaigns)
  src/Project.jsx              one campaign: logo, product photos
  src/BrandLogo.jsx            the campaign's brand logo
  src/Product.jsx              one photo: ad shapes, disclaimer, ads
  src/amazonSpec.js            Amazon DSP responsive ad rules, in one place
  src/photos.js                photo rules: accepted types, size, storage path
supabase/
  migrations/                  database changes, applied in filename order
  tests/*.test.sql             the privacy rules, tested as two advertisers
  tests/supabase-stub.sql      the bits of Supabase the tests need locally
tests/*.test.mjs               unit tests for amazonSpec.js and photos.js
scripts/test-db.sh             runs the database tests on a temporary Postgres
```

The browser talks to Supabase directly with a key that is public by design.
That is safe only because the database enforces who may do what, using row
level security. Never put the secret `service_role` key in the frontend.

## Limitations

- Step 3 of 7. Ads have a headline but no image yet: cropping each ad's
  image to Amazon's three shapes is Step 4.
- Thumbnails download the full photo; Supabase's resized-image feature is a
  paid add-on. Their links expire after an hour; reload the page to renew.
- Deleting a photo, logo or campaign removes the database rows first, then
  the files. If the second part fails, an unseen file is left in storage.
- The logo belongs to a campaign, so a brand with several campaigns uploads
  it to each.
- Reloading the page returns to the project list.
- Only tested against a stubbed Supabase locally and a faked Supabase API in
  the browser, not a live Supabase project.
- The Amazon image rules this project will follow come from search summaries
  of Amazon's spec pages. Check them against
  [Amazon's ad specs](https://advertising.amazon.com/resources/ad-specs/ecommerce)
  before relying on them. Amazon does not sponsor or endorse this tool.

Return to the [project collection](../../README.md).
