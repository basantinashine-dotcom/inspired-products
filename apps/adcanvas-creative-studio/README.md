# AdCanvas Creative Studio

An AI advertising image studio for uploading product photos, generating scene variations, comparing results with the original, and approving images before download.

## Features

- Private product uploads and image library
- Editable scene prompts, four themes, aspect ratios, and variations
- OpenAI image generation and automated visual quality review
- Side-by-side review, version-specific approvals, and approval audit history
- Server-enforced downloads for approved images

## Local setup

Requires Node.js 22.13 or later.

1. Run `npm ci`.
2. Copy `.env.example` to `.env` and set `OPENAI_API_KEY` locally. Never commit your key.
3. Run `npm run build` to generate the Worker configuration.
4. Apply each SQL migration in `drizzle/` in filename order using:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/<migration>.sql
```

5. Run `npm run dev` and open the printed localhost URL. Local development simulates sign-in through `/signin-with-chatgpt?return_to=/`.

## Architecture

React and TypeScript run through Vinext. Cloudflare D1 stores metadata and R2 stores private images. OpenAI requests run on the server; the browser never receives the API key. Background generation and quality review are refreshed while the app is open.

Production expects OpenAI Sites authentication and D1/R2 bindings. A GitHub repository stores the source; it does not automatically host this backend. Configure production authentication, storage, migrations, and server secrets before deployment.

## Status and limitations

This is a working pilot. Automated quality findings require human review. There is no Amazon integration, shared team administration, calibrated quality benchmark, or dollar-based spending cap. API use is billed separately by OpenAI.

TypeScript checks, a production build, backend isolation/approval checks, and a live product-image generation were completed during development.

## Security

`.env`, local databases, uploaded/generated images, dependencies, and build outputs are excluded from Git. Use `.env.example` only as an empty configuration template. Do not add real credentials or customer images to commits.
