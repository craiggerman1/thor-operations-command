# Thor Operations Command

Thor Operations Command, or TOC, is moving from a static prototype into a proper Vercel web app for Thor Mobile Truck Wash operations managers.

It is designed to later connect to:

- Thor Portal API or webhooks for job-sheet submissions, approvals, invoicing status, task escalation, and operational notices.
- Fleetio API asset and GPS feeds for wash plants, wash vehicles, maintenance state, and field readiness.
- Fleetio / Woolworths live wash data for site performance, wash counts, compliance risk, and productivity visibility.

## Current Build

The repository now contains the Vercel app and its public brand assets:

- `src/app` is the new Next.js App Router web app for Vercel.
- `public` contains shared Thor brand assets, fonts, and styling used by the Vercel app.

Current production home: Vercel, protected by the TOC private access gate.

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

## Odin Watcher

The safer production direction is outbound from the Odin AI PC into TOC:

```text
Odin AI PC -> TOC API / Supabase -> pending Odin recommendations in TOC
```

Server-only environment variables:

```text
ODIN_API_KEY=
```

Do not prefix `ODIN_API_KEY` with `NEXT_PUBLIC_`. This key lets the Odin watcher read a TOC snapshot and create pending Odin recommendations only.

Odin watcher read endpoint:

```text
GET /api/odin/snapshot
Header: x-odin-api-key: <ODIN_API_KEY>
```

Odin watcher safe write endpoint:

```text
POST /api/odin/items
Header: x-odin-api-key: <ODIN_API_KEY>
Body action: create
```

External Odin cannot approve, reject, dismiss, close, delete, change users, or perform sensitive actions. It can create pending recommendations for human review.
