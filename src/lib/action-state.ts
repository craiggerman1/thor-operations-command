import { actionItems } from "@/lib/toc-data";

export type ActionItem = Omit<typeof actionItems[number], "status"> & { status: string };
export type ActionOverrideStatus = "Awaiting national review" | "Closed" | "Returned to manager";

export type ActionOverride = {
  status: ActionOverrideStatus;
  updatedAt: string;
};

export const actionStateKey = "toc.actionState";

export function readActionState() {
  if (typeof window === "undefined") return {} as Record<string, ActionOverride>;

  try {
    return JSON.parse(localStorage.getItem(actionStateKey) || "{}") as Record<string, ActionOverride>;
  } catch {
    return {} as Record<string, ActionOverride>;
  }
}

export function applyActionState(items: ActionItem[], overrides = readActionState()) {
  return items.map((item) => {
    const override = overrides[item.id];
    return override ? { ...item, status: override.status } : item;
  });
}

export function getOpenActionItems(items: ActionItem[] = actionItems as ActionItem[]) {
  return applyActionState(items).filter((item) => item.status !== "Closed");
}

export function setActionOverride(actionId: string, status: ActionOverrideStatus) {
  const overrides = readActionState();
  const nextOverrides = {
    ...overrides,
    [actionId]: {
      status,
      updatedAt: new Date().toISOString()
    }
  };

  localStorage.setItem(actionStateKey, JSON.stringify(nextOverrides));
  window.dispatchEvent(new Event("toc.actionState.updated"));
  return nextOverrides;
}
