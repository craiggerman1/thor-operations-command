"use client";

import Link from "next/link";
import { useMemo } from "react";
import { getThorOperatingWeek } from "@/lib/operating-week";
import { metrics } from "@/lib/toc-data";

export function CommandMetricStrip() {
  const operatingWeek = useMemo(() => getThorOperatingWeek(), []);
  const commandMetrics = [
    {
      label: "Operating week",
      value: operatingWeek.name,
      detail: operatingWeek.detail,
      status: "green",
      href: "/overview"
    },
    ...metrics
  ];

  return (
    <section className="status-strip" aria-label="Business overview">
      {commandMetrics.map((metric) => (
        <Link className={`metric-card signal-${metric.status}`} href={metric.href} key={metric.label}>
          <span>{metric.label}</span>
          <strong>{metric.value}</strong>
          <small>{metric.detail}</small>
        </Link>
      ))}
    </section>
  );
}
