import type { AccessRole } from "@/lib/access";
import type { ActionItem } from "@/lib/action-state";

const systemDataPattern = /\b(system|data|database|schema|source|feed|api|integration|sync|mapping|profile table|staff profile|visibility|rls|permission|auth|configuration|config|watcher|heartbeat|cron)\b/i;

export function isNationalScope(scope: string) {
  return scope === "National";
}

export function isSystemDataActionItem(item: Pick<ActionItem, "source" | "title" | "detail">) {
  const source = item.source || "";
  const text = `${source} ${item.title || ""} ${item.detail || ""}`;
  return source === "Admin Settings" || systemDataPattern.test(text);
}

export function isActionVisibleForSession(item: ActionItem, scope: string, role?: AccessRole) {
  if (isNationalScope(scope)) return true;
  if (role === "director") return true;
  if (isSystemDataActionItem(item)) return false;
  return item.region === scope;
}

export function getScopedActionItems<T extends ActionItem>(items: T[], scope: string, role?: AccessRole) {
  return items.filter((item) => isActionVisibleForSession(item, scope, role));
}
