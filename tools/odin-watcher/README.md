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

7. Test the daily operating rhythm write:

```powershell
node odin-watcher.mjs --brief=morning --briefs-only
```

8. Only after the dry-run recommendation looks right, set:

```text
ODIN_DRY_RUN=false
```

## Safety Rules

- Odin can read TOC snapshot data.
- Odin can route watcher output to the correct TOC destination endpoint.
- Direct Craig instructions use `toc-command.mjs`; Odin should not search local files, sessions, memory, or the repo when Craig says to log or create something in TOC.
- Odin uses the configured `OPENCLAW_SESSION_KEY` so watcher analysis has a stable memory thread.
- Odin confidence values can be returned as either `0.84` or `84`; the watcher normalises both to `84`.
- Duplicate recommendations are skipped when the same open title already exists inside the configured duplicate window.
- Daily operating briefs are generated once per Brisbane day/type using `.odin-brief-runs.json` as a local marker file. TOC also upserts by brief date/type/region, so a rerun updates the same database record rather than creating duplicates.
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

## Daily Operating Rhythm

When `ODIN_DRY_RUN=false` and `ODIN_DAILY_RHYTHM=true`, each normal watcher run also checks the Brisbane local time and creates the due National brief:

- `morning` between 5:00 AM and 10:00 AM
- `midday` between 11:00 AM and 2:00 PM
- `end_of_day` between 4:00 PM and 9:00 PM

The hourly watcher can therefore run at `xx:30` and still catch the correct operating window. Manual TOC generation remains available as a backup/control button.

Forced test commands:

```powershell
node odin-watcher.mjs --brief=morning --briefs-only
node odin-watcher.mjs --brief=midday --briefs-only
node odin-watcher.mjs --brief=end_of_day --briefs-only
```

## Mixed Routing Test

To verify Odin-authored briefs can route priorities into the correct TOC destinations, copy `test-brief-routing.mjs` to the AI PC watcher folder and run:

```powershell
node .\test-brief-routing.mjs
```

That prints the seeded payload only. To write the test brief and create/link follow-through records:

```powershell
node .\test-brief-routing.mjs --live
```

The live test creates uniquely named `Routing test ...` records so they can be found and cleaned up if needed.

## OpenClaw Gateway Requirement

The watcher calls:

```text
POST http://127.0.0.1:18789/v1/chat/completions
```

If that returns `404`, enable the OpenAI-compatible chat completions endpoint in OpenClaw Gateway and restart it.

## Production Rhythm Later

Once the manual run is proven, run the watcher every 5 to 15 minutes using Windows Task Scheduler on the Odin AI PC.

Keep the first scheduled version read-only or dry-run until Craig confirms the output quality.

## Direct Craig Commands

When Craig asks Odin to log an operational item in TOC, use the direct command client instead of searching the local workspace.

Normal conversation is advisory only. Odin must not write to TOC unless Craig clearly uses command wording such as "Log TOC", "create in TOC", "raise compliance", "create To Do", "send manager action", or "assign this to [region/manager]". If intent is unclear, Odin should ask: "Do you want me to log this in TOC?"

Example:

```powershell
node .\toc-command.mjs log "There has been a major complaint in Melbourne make sure Melbourne manager treats this as critical and fixes this compliance issue. Log TOC"
```

Expected behaviour:

- compliance/complaint/safety/critical language routes to `/api/odin/compliance`
- reminders/to-do/checklist language routes to `/api/odin/todos`
- equipment/repair/unit/trailer language routes to `/api/odin/equipment`
- stock/PPE/chemical/supply language routes to `/api/odin/stock-orders`
- everything else routes to `/api/odin/actions`

Useful explicit options:

```powershell
node .\toc-command.mjs compliance --region Melbourne --title "Critical Melbourne compliance complaint" --detail "Manager must treat as critical and close out in TOC." --severity red
node .\toc-command.mjs todos --region Brisbane --title "Pick up tyre shine bottles Thursday"
node .\toc-command.mjs log --dry-run "Test only, do not write"
```

Rule for Odin:

```text
If Craig says "log TOC", "create in TOC", "send manager action", "create To Do", or "raise compliance", run toc-command.mjs once with the instruction text. Do not inspect files first.
```
