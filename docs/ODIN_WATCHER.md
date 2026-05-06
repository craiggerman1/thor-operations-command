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

## Odin Recommendation Memory Endpoint

```http
POST https://thor-operations-command-app.vercel.app/api/odin/items
x-odin-api-key: <ODIN_API_KEY>
content-type: application/json
```

Use this endpoint for non-action recommendations, briefs and Odin memory only. If Odin sends a red or amber `alert`, `recommendation`, `follow_up`, or `action_request`, TOC will promote it into a real Action Centre item so managers can see and close it out.

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

## Odin Direct Action Items

Odin can directly create, update, close and delete manager Action Centre items when Craig/Admin gives express instruction. This is intended for Telegram/Hermes/OpenClaw commands from trusted users.

```http
POST https://thor-operations-command-app.vercel.app/api/odin/actions
x-odin-api-key: <ODIN_API_KEY>
content-type: application/json
```

```json
{
  "action": "create",
  "title": "Confirm site PPE stock levels",
  "detail": "Confirm all site PPE is stocked and report any gaps.",
  "targetRegions": ["all"],
  "directiveType": "National Ops Directive",
  "priority": "high",
  "severity": "amber",
  "confidence": 90,
  "noticed": "Craig gave express instruction via Odin.",
  "whyItMatters": "Managers need to confirm stock before work is blocked.",
  "sourcePage": "Action Centre",
  "dueDate": "2026-05-08"
}
```

Cleanup and close-out operations must use Action Centre item IDs from the TOC snapshot. If Odin does not supply an `id` or `ids`, TOC rejects the request rather than creating a new item.

```json
{
  "action": "delete",
  "ids": ["action-id-1", "action-id-2"]
}
```

Response:

```json
{
  "connected": true,
  "action": "delete",
  "deletedIds": ["action-id-1", "action-id-2"],
  "count": 2
}
```

```json
{
  "action": "close",
  "id": "action-id-1"
}
```

Response:

```json
{
  "connected": true,
  "action": "close",
  "closedIds": ["action-id-1"],
  "count": 1
}
```

```json
{
  "action": "update",
  "id": "action-id-1",
  "updates": {
    "title": "Updated manager action title",
    "detail": "Updated manager close-out instructions.",
    "priority": "high",
    "dueDate": "2026-05-08"
  }
}
```

Response:

```json
{
  "connected": true,
  "action": "update",
  "updatedIds": ["action-id-1"],
  "count": 1
}
```

For accidental duplicate cleanup, Odin can use an exact-title cleanup. TOC keeps the oldest open matching item per region by default and deletes the rest.

```json
{
  "action": "delete_duplicates",
  "exactTitle": "Reminder: pick up new batteries for pony Thursday",
  "keepPerRegion": 1
}
```

Response:

```json
{
  "connected": true,
  "action": "delete_duplicates",
  "deletedIds": ["duplicate-action-id-1"],
  "count": 1
}
```

Direct issue behavior:

- TOC creates real Action Centre items for the target regions immediately.
- Region names map to the assigned manager region. `Brisbane`, `Brisbane Manager`, or `Brisbane region` all target the Brisbane manager Action Centre.
- `targetRegions: ["National"]` creates a National action item. `targetRegions: ["all"]` creates one item for every active manager region except National.
- `action: "close"`, `complete`, `clear` and `done` close the supplied Action Centre item IDs.
- `action: "delete"` deletes the supplied Action Centre item IDs.
- `action: "delete_duplicates"` deletes duplicate open items by exact title while keeping the oldest item per region.
- TOC records the action in Admin Settings audit trail and stores Odin memory against the issued work.
- Odin still cannot change users, reset passwords, change roles or modify Admin Settings.

Do not use `/api/odin/items` for manager tasks. If Odin accidentally sends `itemType: "action_request"` to `/api/odin/items`, TOC will now create the Action Centre item directly instead of sending it to an approval page.

## Odin Shared To Do Reminders

Odin can directly create, update, complete and delete shared To Do reminders for selected manager scopes when Craig/Admin gives express instruction.

```http
POST https://thor-operations-command-app.vercel.app/api/odin/todos
x-odin-api-key: <ODIN_API_KEY>
content-type: application/json
```

```json
{
  "action": "create",
  "itemType": "todo",
  "title": "Must pickup new batteries for pony Thursday",
  "targetRegions": ["National", "Brisbane"],
  "important": true,
  "dueDate": "2026-05-07"
}
```

To Do behavior:

- `National` targets National Ops / National Manager visibility.
- `Brisbane` targets the Brisbane Manager visibility.
- Admin users viewing the same scope also see the shared reminder.
- `/api/odin/todos` supports `action: "create"`, `update`, `complete`, `close`, `clear`, `done` and `delete`.
- `/api/odin/actions` also routes `itemType: "todo"` into the To Do system. This prevents Odin from accidentally creating Action Centre work when Craig asks for a To Do reminder.
- Non-create To Do operations require `id`, `ids`, `todoIds` or `createdTodoIds`.
- Use `/api/odin/actions` with `itemType: "action"` or no `itemType` when the instruction needs an Action Centre close-out workflow.

```json
{
  "action": "complete",
  "itemType": "todo",
  "ids": ["todo-id-1", "todo-id-2"]
}
```

```json
{
  "action": "update",
  "itemType": "todo",
  "id": "todo-id-1",
  "updates": {
    "title": "Updated To Do reminder",
    "important": true
  }
}
```

```json
{
  "action": "delete",
  "itemType": "todo",
  "id": "todo-id-1"
}
```

## Odin Destination API Contract

Use the specific destination route whenever possible. Every write requires `x-odin-api-key`, runs server-side only, and writes an audit entry.

| Destination | Endpoint | Lifecycle |
| --- | --- | --- |
| Action Centre | `/api/odin/actions` | `create`, `update`, `close`, `complete`, `clear`, `done`, `delete`, `delete_duplicates` |
| To Do | `/api/odin/todos` | `create`, `update`, `complete`, `close`, `clear`, `done`, `delete` |
| Compliance | `/api/odin/compliance` | `create`, `update`, `complete`, `close`, `clear`, `done`, `delete` |
| Equipment servicing | `/api/odin/equipment` | `create`, `update`, `complete`, `close`, `clear`, `done`, `delete` |
| Stock orders | `/api/odin/stock-orders` | `create`, `update`, `complete`, `close`, `clear`, `done`, `delete` |
| Operational notes | `/api/odin/notes` | `create`, `update`, `delete` |
| Entity context | `/api/odin/context/:entityType/:id` | `GET` only |

For entity context, supported `entityType` values include:

```text
action, compliance, equipment, stock_order, todo, national_request, calendar_job, productivity_site
```

Use this before writing if Odin needs reliable context for a specific TOC record.

## Security Rules

- Odin can create recommendations and direct Action Centre items when explicitly instructed.
- Odin can update, close and delete Action Centre items when explicitly instructed and when item IDs are supplied.
- Odin can create, update, complete and delete direct shared To Do reminders when explicitly instructed and when item IDs are supplied for non-create operations.
- Odin cannot change users, reset passwords, change roles or modify Admin Settings.
- Human approval remains required for destructive, admin, account, pricing, payroll, external-message or client-sensitive actions.
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

The watcher now asks Odin for a `destination` field and writes to the matching TOC endpoint:

```text
action -> /api/odin/actions
todo -> /api/odin/todos
compliance -> /api/odin/compliance
equipment -> /api/odin/equipment
stock_order -> /api/odin/stock-orders
note -> /api/odin/notes
recommendation -> /api/odin/items
```

If Odin omits `destination`, the watcher infers the route from the returned title, summary and recommended action.
