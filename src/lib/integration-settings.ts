export type IntegrationPageSlug = "jobsheets" | "asset-tracking";

export type IntegrationSourceConfig = {
  slug: IntegrationPageSlug;
  sourceName: string;
  statusLabel: string;
  title: string;
  detail: string;
  connected: boolean;
};

export const integrationDefaults: Record<IntegrationPageSlug, IntegrationSourceConfig> = {
  jobsheets: {
    slug: "jobsheets",
    sourceName: "Thor Portal",
    statusLabel: "Source mapping",
    title: "Thor Portal jobsheet source",
    detail: "Approval flow, manager review items and admin blockers will land here from the Thor Portal jobsheet source.",
    connected: false
  },
  "asset-tracking": {
    slug: "asset-tracking",
    sourceName: "Unity GPS",
    statusLabel: "Source mapping",
    title: "Unity asset source",
    detail: "Vehicle GPS, crew location and asset status will land here from the Unity source.",
    connected: false
  }
};

export function isIntegrationSlug(value: string): value is IntegrationPageSlug {
  return value === "jobsheets" || value === "asset-tracking";
}

export function normaliseIntegrationConfig(slug: IntegrationPageSlug, value: Partial<IntegrationSourceConfig> | null | undefined): IntegrationSourceConfig {
  const fallback = integrationDefaults[slug];

  return {
    slug,
    sourceName: typeof value?.sourceName === "string" && value.sourceName.trim() ? value.sourceName.trim() : fallback.sourceName,
    statusLabel: typeof value?.statusLabel === "string" && value.statusLabel.trim() ? value.statusLabel.trim() : fallback.statusLabel,
    title: typeof value?.title === "string" && value.title.trim() ? value.title.trim() : fallback.title,
    detail: typeof value?.detail === "string" && value.detail.trim() ? value.detail.trim() : fallback.detail,
    connected: typeof value?.connected === "boolean" ? value.connected : fallback.connected
  };
}
