import { productivitySites } from "@/lib/toc-data";

export type ProductivityTone = "red" | "amber" | "yellow" | "light-green" | "green";

export function getProductivitySiteSlug(site: string) {
  return site.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function getProductivitySiteBySlug(slug: string) {
  return productivitySites.find((site) => getProductivitySiteSlug(site.site) === slug);
}

export function getProductivityScore(site: { productivityScore?: number }) {
  if (typeof site.productivityScore === "number") return site.productivityScore;
  return 0;
}

export function getProductivityTone(score: number): ProductivityTone {
  if (score < 40) return "red";
  if (score < 50) return "amber";
  if (score < 70) return "yellow";
  if (score < 80) return "light-green";
  return "green";
}

export function getProductivityText(score: number) {
  if (score < 40) return "Critical productivity issue";
  if (score < 50) return "Productivity action required";
  if (score < 70) return "Efficiency needs refinement";
  if (score < 80) return "Near healthy productivity";
  return "Healthy productivity";
}

export function getProductivityTagTone(tone: ProductivityTone) {
  if (tone === "red") return "red";
  if (tone === "green") return "green";
  return "amber";
}

export function getRedactedGrossMarginTrend(score: number) {
  const offsets = [-4, -2, 1, -1, 3, 0];
  return ["Nov", "Dec", "Jan", "Feb", "Mar", "Apr"].map((month, index) => ({
    month,
    indexScore: Math.max(28, Math.min(96, score + offsets[index])),
    label: "Redacted"
  }));
}
