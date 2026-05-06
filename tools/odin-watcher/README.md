# Odin Watcher

The Odin Watcher is the safe first step for autonomous Odin monitoring.

It runs on the Odin AI PC, calls TOC outbound, analyses the operational snapshot with local Odin/OpenClaw, and writes operational items back into the correct TOC destination.

```text
Odin AI PC -> TOC snapshot API -> local Odin/OpenClaw -> TOC destination API
```

This keeps the AI PC private. TOC does not call into the Odin PC.

## Setup On The AI PC

1. Copy this folder to the Odin AI PC.
2. Copy `.env.example` to `.env`.
3. Fill in:

```text
ODIN_API_KEY=<TOC-side Odin API key>
OPENCLAW_GATEWAY_TOKEN=<local OpenClaw token>
OPENCLAW_SESSION_KEY=toc:watcher
```

4. Keep `ODIN_DRY_RUN=true` for the first test.
5. Test TOC access first:

```powershell
node odin-watcher.mjs --snapshot-only
```

6. Then test Odin analysis in dry-run mode:

```powershell
node odin-watcher.mjs
```

7. Only after the dry-run recommendation looks right, set:

```text
ODIN_DRY_RUN=false
```

## Safety Rules

- Odin can read TOC snapshot data.
- Odin can route watcher output to the correct TOC destination endpoint.
- Odin uses the configured `OPENCLAW_SESSION_KEY` so watcher analysis has a stable memory thread.
- Odin confidence values can be returned as either `0.84` or `84`; the watcher normalises both to `84`.
- Duplicate recommendations are skipped when the same open title already exists inside the configured duplicate window.
- Odin cannot approve, reject, dismiss, reset passwords, change users, change admin settings, or send external messages from TOC.
- Telegram and Twilio alerts should be handled on the AI PC side after Odin decides an issue is important.
- Every watcher write uses `ODIN_API_KEY` and is audited server-side by TOC.

## Destination Routing

The watcher asks Odin to return a `destination` field:

```text
actions, todos, compliance, equipment, stock_orders, notes
```

Routing rules:

- `compliance` -> `/api/odin/compliance`
- `equipment` -> `/api/odin/equipment`
- `stock_orders` -> `/api/odin/stock-orders`
- `todos` -> `/api/odin/todos`
- `actions` -> `/api/odin/actions`
- `notes` -> `/api/odin/notes`

If Odin omits `destination`, the watcher infers it from the title, summary and recommended action.

The watcher also creates a small non-overlap lock file before running. If a scheduled run is still active, the next run exits instead of double-writing TOC items.

## OpenClaw Gateway Requirement

The watcher calls:

```text
POST http://127.0.0.1:18789/v1/chat/completions
```

If that returns `404`, enable the OpenAI-compatible chat completions endpoint in OpenClaw Gateway and restart it.

## Production Rhythm Later

Once the manual run is proven, run the watcher every 5 to 15 minutes using Windows Task Scheduler on the Odin AI PC.

Keep the first scheduled version read-only or dry-run until Craig confirms the output quality.
