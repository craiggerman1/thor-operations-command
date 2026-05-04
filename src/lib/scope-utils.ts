import type { AccessRole } from "@/lib/access";
import type { ActionItem } from "@/lib/action-state";

export function isNationalScope(scope: string) {
  return scope === "National";
}

export function isActionVisibleForSession(item: ActionItem, scope: string, role?: AccessRole) {
  if (isNationalScope(scope)) return true;
  if (role === "director") return true;
  return item.region === scope;
}

export function getScopedActionItems(items: ActionItem[], scope: string, role?: AccessRole) {
  return items.filter((item) => isActionVisibleForSession(item, scope, role));
}
