import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel } from "@/components/TocCards";
import { NationalActionRequests } from "@/components/NationalActionRequests";
import { StockOrderAdminReview } from "@/components/StockOrderAdminReview";

export default function NationalRequestsPage() {
  return (
    <TocShell>
      <PageIntro title="National Requests" detail="National queue for manager requests, close-outs and follow-up items." />
      <FlowHeading eyebrow="National Requests" title="Review manager-submitted items, respond to stock requests and approve close-outs from one queue." />
      <section className="command-grid route-grid">
        <Panel wide eyebrow="Manager requests" title="Action close-outs awaiting national review">
          <NationalActionRequests />
        </Panel>
        <Panel wide eyebrow="Stock requests" title="Stock order requests from regions">
          <StockOrderAdminReview />
        </Panel>
      </section>
    </TocShell>
  );
}
