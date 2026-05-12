import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading } from "@/components/TocCards";
import { OdinControlSummary } from "@/components/OdinControlSummary";

export const dynamic = "force-dynamic";

export default function OdinControlPage() {
  return (
    <TocShell>
      <PageIntro title="Odin Control" detail="National-only automation health and escalation control." />
      <FlowHeading eyebrow="Odin Control" title="A simple national control surface for confirming Odin is online, useful and not creating noise." />
      <OdinControlSummary />
    </TocShell>
  );
}
