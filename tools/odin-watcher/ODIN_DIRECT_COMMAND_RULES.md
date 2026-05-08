# Odin Direct TOC Command Rules

When Craig gives a direct operational instruction, Odin must act like a TOC operator, not a code agent.

## Normal Conversation Is Advisory Only

Do not write to TOC during normal conversation.

Only write to TOC when Craig clearly gives an operational command using wording such as:

- "Log TOC"
- "create in TOC"
- "send manager action"
- "create To Do"
- "raise compliance"
- "assign this to [region/manager]"

If Craig is discussing, brainstorming, asking what Odin thinks, asking for advice, or describing a situation without a clear TOC command phrase, Odin must answer with advice only.

Never write to TOC from casual conversation, opinions, planning, testing, or memory notes unless Craig clearly asks Odin to log/create/update/close/delete something in TOC.

If intent is unclear, ask:

```text
Do you want me to log this in TOC?
```

## Use This Tool First

Run `toc-command.mjs` from the Odin watcher folder:

```powershell
cd "C:\Users\thora\Desktop\odin-watcher"
node .\toc-command.mjs log "Craig's instruction text here"
```

For lifecycle control, use item IDs from the TOC snapshot or the relevant TOC page:

```powershell
node .\toc-command.mjs close --id ACTION_ID
node .\toc-command.mjs update --id ACTION_ID --status blocked --note "Waiting on supplier confirmation"
node .\toc-command.mjs delete --id ACTION_ID
node .\toc-command.mjs delete-duplicates --exactTitle "Exact duplicated action title"
node .\toc-command.mjs complete --destination todos --id TODO_ID
```

## Do Not Search First

If Craig says any of these:

- "Log TOC"
- "create in TOC"
- "send manager action"
- "create To Do"
- "raise compliance"
- "assign this to [region/manager]"
- "make sure the manager treats this as critical"

Then do **not** search files, memory, sessions, the repo, or local folders first.

Use `toc-command.mjs` once with the instruction text.

## Routing

- compliance, complaint, safety, critical, incident -> Compliance and linked Action Centre close-out
- reminder, to-do, checklist -> To Do
- vehicle, unit, trailer, repair, service -> Equipment Servicing
- stock, PPE, chemical, supplies -> Stock Orders
- everything else -> Action Centre

## Lifecycle Rules

- `close`, `complete`, `clear`, `done` require `--id` or `--ids`.
- `delete` requires `--id` or `--ids`.
- `update` requires `--id` or `--ids`.
- `delete-duplicates` requires `--exactTitle` or `--title`.
- Do not try lifecycle changes by title unless using `delete-duplicates`.
- If no ID is available, read the TOC snapshot first and locate the item ID.

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
