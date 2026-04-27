# Thor Operations Command

Thor Operations Command, or TOC, is a static-first command dashboard scaffold for Thor Mobile Truck Wash operations managers.

It is designed to later connect to:

- Thor Portal API or webhooks for job-sheet submissions, approvals, invoicing status, task escalation, and operational notices.
- Fleetio API asset and GPS feeds for wash plants, wash vehicles, maintenance state, and field readiness.
- Fleetio / Woolworths live wash data for site performance, wash counts, compliance risk, and productivity visibility.

## Current Build

This first version is a deployable static app using local mock data and browser storage. It includes:

- National and regional command overview.
- Thor ABCD operating week calculation.
- Portal approval queue.
- Fleetio asset readiness.
- Woolworths wash performance by site.
- Local manager action tiles.
- National operations action tiles.
- Manager to-do list with local browser persistence.
- Integration status panel showing the future API/webhook feed points.

## Deployment

The app is Vercel-friendly and uses `public` as the output directory.

No package install is required for this version.

## Future API Shape

Recommended live feed endpoints:

- `POST /api/events/job-sheet-submitted`
- `POST /api/events/job-sheet-approved`
- `POST /api/events/task-raised`
- `GET /api/operations/live-summary?region=brisbane`
- `GET /api/fleet/assets/live`
- `GET /api/woolworths/wash-performance?site=all`

Never commit production API keys or Fleetio tokens. Store them in Vercel environment variables once backend endpoints are added.
