# Odin Watcher Setup

The safe integration model is outbound from the Odin AI PC into TOC.

```text
Odin AI PC -> TOC API -> Supabase -> TOC dashboard
```

This keeps the AI PC private. TOC does not need to open a connection into the Odin PC.

## Required TOC Environment Variable

Set this in Vercel as a server-only variable:

```text
ODIN_API_KEY=<long random token>
```

Do not use `NEXT_PUBLIC_`. Do not commit the token.

## Odin Read Endpoint

```http
GET https://thor-operations-command-app.vercel.app/api/odin/snapshot
x-odin-api-key: <ODIN_API_KEY>
```

This returns a read-only operations snapshot for Odin to analyse.

## Odin Write Endpoint

```http
POST https://thor-operations-command-app.vercel.app/api/odin/items
x-odin-api-key: <ODIN_API_KEY>
content-type: application/json
```

Body:

```json
{
  "action": "create",
  "itemType": "recommendation",
  "title": "Odin recommendation title",
  "summary": "Short operational summary.",
  "region": "National",
  "severity": "amber",
  "confidence": 80,
  "noticed": "What Odin noticed.",
  "whyItMatters": "Why it matters operationally.",
  "recommendedAction": "Recommended next action for Craig or national.",
  "sourceType": "toc_snapshot"
}
```

## Odin Proposed Action Items

Odin can create a pending action request. This does not create manager Action Centre work until an Admin or National user explicitly approves it inside Odin Command.

```json
{
  "action": "create",
  "itemType": "action_request",
  "title": "Confirm site PPE stock levels",
  "summary": "Craig asked Odin to prepare a manager action item.",
  "region": "National",
  "severity": "amber",
  "confidence": 90,
  "noticed": "Craig gave express instruction via Odin.",
  "whyItMatters": "Managers need to confirm stock before work is blocked.",
  "recommendedAction": "Confirm all site PPE is stocked and report any gaps.",
  "targetRegions": ["all"],
  "directiveType": "National Ops Directive",
  "priority": "high",
  "sourcePage": "Action Centre",
  "dueDate": "2026-05-08"
}
```

Approval behavior:

- Pending `action_request` appears in Odin Command.
- Admin/National clicks `Approve + Create Action`.
- TOC creates real Action Centre items for the target regions.
- Odin cannot approve its own action request.

## Security Rules

- Odin can create pending recommendations and proposed action requests only.
- Proposed action requests become real manager Action Centre items only after Admin/National approval.
- Odin cannot approve, reject, dismiss, close, delete, change users, reset passwords, send messages, or perform sensitive external actions.
- Human approval remains required for operational changes.
- Rotate `ODIN_API_KEY` if it is ever pasted somewhere unsafe.

## AI PC Watcher Scaffold

The manual watcher scaffold lives at:

```text
tools/odin-watcher
```

This is intended to be copied to the Odin AI PC and run there. It reads TOC, asks local Odin/OpenClaw on that same AI PC, and writes back only pending recommendations.

Start with:

```text
ODIN_DRY_RUN=true
```

Test TOC access before connecting Odin/OpenClaw:

```text
node odin-watcher.mjs --snapshot-only
```

Only change to `ODIN_DRY_RUN=false` once the output looks correct.

The watcher sends `x-openclaw-session-key: toc:watcher` by default so OpenClaw can keep watcher memory in one stable thread.

Odin can return confidence as `0.84` or `84`; the watcher normalises both to `84`.
