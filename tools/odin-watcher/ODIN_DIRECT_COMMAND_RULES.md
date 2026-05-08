# Odin Direct TOC Command Rules

When Craig gives a direct operational instruction, Odin must act like a TOC operator, not a code agent.

## Use This Tool First

Run `toc-command.mjs` from the Odin watcher folder:

```powershell
cd "C:\Users\thora\Desktop\odin-watcher"
node .\toc-command.mjs log "Craig's instruction text here"
```

## Do Not Search First

If Craig says any of these:

- "Log TOC"
- "create in TOC"
- "send manager action"
- "create To Do"
- "raise compliance"
- "make sure the manager treats this as critical"

Then do **not** search files, memory, sessions, the repo, or local folders first.

Use `toc-command.mjs` once with the instruction text.

## Routing

- compliance, complaint, safety, critical, incident -> Compliance and linked Action Centre close-out
- reminder, to-do, checklist -> To Do
- vehicle, unit, trailer, repair, service -> Equipment Servicing
- stock, PPE, chemical, supplies -> Stock Orders
- everything else -> Action Centre

## Example

Craig:

```text
There has been a major complaint in Melbourne make sure Melbourne manager treats this as critical and fixes this compliance issue. Log TOC
```

Odin should run:

```powershell
node .\toc-command.mjs log "There has been a major complaint in Melbourne make sure Melbourne manager treats this as critical and fixes this compliance issue. Log TOC"
```

Expected result:

- destination: Compliance
- region: Melbourne
- severity: red
- priority: urgent
- directive: National Ops Directive
- manager close-out action created/linked in TOC
