import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel, Tag } from "@/components/TocCards";
import { staffHeatMap } from "@/lib/toc-data";

const heatDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function StaffAvailabilityPage() {
  return (
    <TocShell>
      <PageIntro title="Staff Availability" detail="Heat map showing staff availability by day, designed to update from a staff-accessible Google Sheets file." />
      <FlowHeading eyebrow="Staff Availability" title="Read green, amber and red quickly so managers can cover gaps before rosters become urgent." />
      <section className="command-grid route-grid">
        <Panel wide eyebrow="Availability heat map" title="Staff coverage by day" pill="Google Sheets feed planned">
          <div className="availability-heatmap">
            <div className="heatmap-row header">
              <span>Staff / crew</span>
              {heatDays.map((day) => <strong key={day}>{day}</strong>)}
            </div>
            {staffHeatMap.map((staff) => (
              <div className="heatmap-row" key={staff.name}>
                <span><strong>{staff.name}</strong><small>{staff.region}</small></span>
                {staff.availability.map((status, index) => <i className={`heat-cell ${status}`} key={`${staff.name}-${heatDays[index]}`} />)}
              </div>
            ))}
          </div>
        </Panel>
        <Panel eyebrow="Visual key" title="Quick read">
          <div className="brief-stack">
            <div className="brief-item"><span className="brief-dot" /><div><strong><Tag tone="green">Green</Tag> Available.</strong><small>Staff or crew can be considered available for the day.</small></div></div>
            <div className="brief-item"><span className="brief-dot" /><div><strong><Tag tone="amber">Amber</Tag> Limited.</strong><small>May be available but needs confirmation or has conditions.</small></div></div>
            <div className="brief-item"><span className="brief-dot" /><div><strong><Tag tone="red">Red</Tag> Not available.</strong><small>Do not plan coverage without direct manager follow-up.</small></div></div>
          </div>
        </Panel>
        <Panel eyebrow="Data source" title="Google Sheets connection">
          <div className="brief-stack">
            <div className="brief-item"><span className="brief-dot" /><div><strong>Staff update one shared sheet.</strong><small>Staff-accessible Google Sheets file remains the source of truth for availability.</small></div></div>
            <div className="brief-item"><span className="brief-dot" /><div><strong>TOC turns sheet data into visual coverage.</strong><small>Managers can make a quick coverage call without reading rows of raw sheet data.</small></div></div>
          </div>
        </Panel>
      </section>
    </TocShell>
  );
}
