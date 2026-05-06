# Odin Watcher

The Odin Watcher is the safe first step for autonomous Odin monitoring.

It runs on the Odin AI PC, calls TOC outbound, analyses the operational snapshot with local Odin/OpenClaw, and writes only pending recommendations back into TOC.

```text
Odin AI PC -> TOC snapshot API -> local Odin/OpenClaw -> TOC pending Odin item
```

This keeps the AI PC private. TOC does not call into the Odin PC.

## Setup On The AI PC

1. Copy this folder to the Odin AI PC.
2. Copy `.env.example` to `.env`.
3. Fill in:

```text
ODIN_API_KEY=<TOC-side Odin API key>
OPENCLAW_GATEWAY_TOKEN=<local OpenClaw token>
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
- Odin can create pending recommendations only.
- Duplicate recommendations are skipped when the same pending title already exists inside the configured duplicate window.
- Odin cannot approve, reject, dismiss, delete, close, reset passwords, change users, or send external messages from TOC.
- Telegram and Twilio alerts should be handled on the AI PC side after Odin decides an issue is important.
- Every recommendation written to TOC is logged and still needs human review.

## Production Rhythm Later

Once the manual run is proven, run the watcher every 5 to 15 minutes using Windows Task Scheduler on the Odin AI PC.

Keep the first scheduled version read-only or dry-run until Craig confirms the output quality.
