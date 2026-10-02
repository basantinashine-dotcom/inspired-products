# Ad Image Studio

Turn a plain product photo into ad images an advertiser can submit to Amazon.

A hosted app built one product decision at a time. Each step's decision, the
reason for it and how it is built are written up in [TUTORIAL.md](TUTORIAL.md).
The idea comes from Amazon's own
[AI image generator](https://advertising.amazon.com/blog/ai-image-generation),
which drops a product-on-white photo into a lifestyle scene.

**Built so far (Step 1):** sign-in by emailed link, and a project list where
each advertiser sees and changes only their own projects. Upload, editing,
AI scenes and export come in later steps.

## Run it

You need Node.js 22.12 or later and a free [Supabase](https://supabase.com)
project. Supabase provides the sign-in, the database and, later, the file
storage.

1. In your Supabase project, open **SQL Editor**, paste the contents of
   `supabase/migrations/20261002000000_projects.sql` and run it.
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
browser. Neither account can see the other's projects.

Supabase's built-in email sender only sends a few sign-in emails an hour. That
is enough to try the app; a real launch would connect your own email service.

## Test it

```sh
npm run test:db
```

This starts a throwaway Postgres on your machine (no Docker, no Supabase
account), applies the migrations and checks that one advertiser cannot see,
create, rename, hand over or delete another's projects, and that signed-out
visitors cannot read anything. It needs the Postgres server tools (`initdb`,
`pg_ctl`, `psql`) installed. On a Mac: `brew install postgresql@16`.

## How it is built

```text
frontend/                      React app, built with Vite
  src/supabase.js              the one Supabase client
  src/App.jsx                  signed in? show projects : show sign-in
  src/SignIn.jsx               email a sign-in link
  src/Projects.jsx             list, create and delete projects
supabase/
  migrations/                  database changes, applied in filename order
  tests/projects.test.sql      the privacy rules, tested as two advertisers
  tests/supabase-stub.sql      the bits of Supabase the tests need locally
scripts/test-db.sh             runs the database tests on a temporary Postgres
```

The browser talks to Supabase directly with a key that is public by design.
That is safe only because the database enforces who may do what, using row
level security. Never put the secret `service_role` key in the frontend.

## Limitations

- Step 1 of 7. Projects have a name and nothing else yet.
- Only tested against a stubbed Supabase locally and a faked Supabase API in
  the browser, not a live Supabase project.
- The Amazon image rules this project will follow come from search summaries
  of Amazon's spec pages. Check them against
  [Amazon's ad specs](https://advertising.amazon.com/resources/ad-specs/ecommerce)
  before relying on them. Amazon does not sponsor or endorse this tool.

Return to the [project collection](../../README.md).
