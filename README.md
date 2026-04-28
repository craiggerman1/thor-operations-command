# Thor Operations Command

Thor Operations Command, or TOC, is moving from a static prototype into a proper Vercel web app for Thor Mobile Truck Wash operations managers.

It is designed to later connect to:

- Thor Portal API or webhooks for job-sheet submissions, approvals, invoicing status, task escalation, and operational notices.
- Fleetio API asset and GPS feeds for wash plants, wash vehicles, maintenance state, and field readiness.
- Fleetio / Woolworths live wash data for site performance, wash counts, compliance risk, and productivity visibility.

## Current Build

The repository now contains two layers:

- `src/app` is the new Next.js App Router web app for Vercel.
- `public` still contains the legacy static prototype and Thor brand assets.

The new Next.js app includes proper route pages for:

- National and regional command overview.
- Action Centre.
- Operations.
- Director overview.
- Admin user-access controls.
- Portal approval queue.
- Fleetio asset readiness.
- Compliance.
- Stock Orders.
- Chat.
- Tasks.
- To Do.

## Deployment

The production direction is Vercel:

1. GitHub stores the code.
2. Vercel imports the repository.
3. Vercel detects Next.js and builds the `src/app` web app.
4. Each sidebar item has a real URL such as `/overview`, `/admin`, `/fleet`, and `/stock-orders`.

When local Node/npm tooling is available:

```bash
npm install
npm run dev
npm run build
```

## Future API Shape

Recommended live feed endpoints:

- `POST /api/events/job-sheet-submitted`
- `POST /api/events/job-sheet-approved`
- `POST /api/events/task-raised`
- `GET /api/operations/live-summary?region=brisbane`
- `GET /api/fleet/assets/live`
- `GET /api/woolworths/wash-performance?site=all`

Never commit production API keys or Fleetio tokens. Store them in Vercel environment variables once backend endpoints are added.

This public build must not contain real employee emails, private credentials, API keys, or sensitive internal identifiers.
