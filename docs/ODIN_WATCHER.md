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

## Security Rules

- Odin can create pending recommendations only.
- Odin cannot approve, reject, dismiss, close, delete, change users, reset passwords, send messages, or perform sensitive external actions.
- Human approval remains required for operational changes.
- Rotate `ODIN_API_KEY` if it is ever pasted somewhere unsafe.
