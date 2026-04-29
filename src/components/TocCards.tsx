import type { Status } from "@/lib/toc-data";
import type { ReactNode } from "react";

export function Panel({ children, wide = false, title, eyebrow, pill, className = "" }: { children: ReactNode; wide?: boolean; title: string; eyebrow: string; pill?: string; className?: string }) {
  return (
    <section className={`panel ${wide ? "wide-panel" : ""} ${className}`}>
      <div className="panel-head">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
        </div>
        {pill ? <span className="pill">{pill}</span> : null}
      </div>
      {children}
    </section>
  );
}

export function Tag({ children, tone = "blue" }: { children: ReactNode; tone?: Status | "blue" }) {
  return <span className={`tag ${tone}`}>{children}</span>;
}

export function FlowHeading({ step, eyebrow, title }: { step: string; eyebrow: string; title: string }) {
  return (
    <div className="flow-heading">
      <span className="flow-step">{step}</span>
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
      </div>
    </div>
  );
}
