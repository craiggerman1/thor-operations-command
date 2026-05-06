import type { Status } from "@/lib/toc-data";

export type OdinItemType = "alert" | "recommendation" | "brief" | "follow_up" | "draft_message" | "call_log" | "action_request";
export type OdinItemStatus = "pending" | "approved" | "done" | "dismissed" | "rejected";

export type OdinItem = {
  id: string;
  itemType: OdinItemType;
  title: string;
  summary: string;
  region: string;
  sourceType: string;
  sourceId: string | null;
  severity: Status;
  confidence: number;
  approvalRequired: boolean;
  status: OdinItemStatus;
  noticed: string;
  whyItMatters: string;
  recommendedAction: string;
  assignedTo: string;
  dueAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export const odinItemTypeLabels: Record<OdinItemType, string> = {
  alert: "Odin Alert",
  recommendation: "Recommendation",
  brief: "Brief",
  follow_up: "Follow-Up",
  draft_message: "Draft Message",
  call_log: "Call Log",
  action_request: "Action Request"
};

export const odinStatusLabels: Record<OdinItemStatus, string> = {
  pending: "Pending review",
  approved: "Approved",
  done: "Done",
  dismissed: "Dismissed",
  rejected: "Rejected"
};

export const odinCommandFeatures = [
  "Ask Odin about TOC records and operational risk.",
  "Review Odin Alerts, recommendations, daily briefs and follow-ups.",
  "Approve, reject, dismiss or close Odin action recommendations.",
  "Keep every Odin action visible and logged before sensitive work proceeds."
];

export const odinDefaultItems: OdinItem[] = [];

export function normaliseOdinItemType(value: unknown): OdinItemType {
  if (value === "recommendation" || value === "brief" || value === "follow_up" || value === "draft_message" || value === "call_log" || value === "action_request") return value;
  return "alert";
}

export function normaliseOdinStatus(value: unknown): OdinItemStatus {
  if (value === "approved" || value === "done" || value === "dismissed" || value === "rejected") return value;
  return "pending";
}

export function normaliseOdinSeverity(value: unknown): Status {
  if (value === "red" || value === "amber" || value === "green" || value === "blue") return value;
  return "blue";
}

