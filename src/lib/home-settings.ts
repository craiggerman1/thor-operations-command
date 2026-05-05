import type { Status } from "@/lib/toc-data";

export type HomeSignalKey = "operatingWeek" | "riskFlags" | "jobsheets" | "assetsOnline";

export type HomeSignalConfig = {
  key: HomeSignalKey;
  label: string;
  enabled: boolean;
};

export type HomeRoadmapItem = {
  step: string;
  title: string;
  status: string;
  severity: Status;
};

export type HomeSettingsConfig = {
  signals: HomeSignalConfig[];
  roadmap: HomeRoadmapItem[];
};

export const defaultHomeSettings: HomeSettingsConfig = {
  signals: [
    { key: "operatingWeek", label: "Operating week", enabled: true },
    { key: "riskFlags", label: "Risk flags", enabled: true },
    { key: "jobsheets", label: "Jobsheets", enabled: true },
    { key: "assetsOnline", label: "Assets online", enabled: true }
  ],
  roadmap: [
    { step: "01", title: "Determine page order and flow", status: "In progress", severity: "amber" },
    { step: "02", title: "Add required features to pages", status: "In progress", severity: "amber" },
    { step: "03", title: "Determine user access levels", status: "In progress", severity: "amber" },
    { step: "04", title: "Create database", status: "In progress", severity: "amber" },
    { step: "05", title: "Link database", status: "In progress", severity: "amber" },
    { step: "06", title: "Connect API and Webhook feeds", status: "Pending", severity: "blue" },
    { step: "07", title: "Add remaining feature requests", status: "Pending", severity: "blue" },
    { step: "08", title: "Test connections", status: "Pending", severity: "blue" },
    { step: "09", title: "Beta test TOC", status: "Pending", severity: "blue" },
    { step: "10", title: "Deploy live", status: "Pending", severity: "blue" }
  ]
};

const signalKeys = new Set(defaultHomeSettings.signals.map((signal) => signal.key));
const severities = new Set<Status>(["green", "amber", "red", "blue"]);

export function normaliseHomeSettings(value: Partial<HomeSettingsConfig> | null | undefined): HomeSettingsConfig {
  const incomingSignals = Array.isArray(value?.signals) ? value.signals : [];
  const signals = defaultHomeSettings.signals.map((defaultSignal) => {
    const incoming = incomingSignals.find((signal) => signalKeys.has(signal.key) && signal.key === defaultSignal.key);
    return {
      ...defaultSignal,
      label: typeof incoming?.label === "string" && incoming.label.trim() ? incoming.label.trim() : defaultSignal.label,
      enabled: typeof incoming?.enabled === "boolean" ? incoming.enabled : defaultSignal.enabled
    };
  });

  const incomingRoadmap = Array.isArray(value?.roadmap) ? value.roadmap : [];
  const roadmap = (incomingRoadmap.length ? incomingRoadmap : defaultHomeSettings.roadmap).map((item, index) => ({
    step: typeof item.step === "string" && item.step.trim() ? item.step.trim() : String(index + 1).padStart(2, "0"),
    title: typeof item.title === "string" && item.title.trim() ? item.title.trim() : defaultHomeSettings.roadmap[index]?.title || "Roadmap item",
    status: typeof item.status === "string" && item.status.trim() ? item.status.trim() : "Pending",
    severity: severities.has(item.severity) ? item.severity : "blue"
  }));

  return { signals, roadmap };
}
