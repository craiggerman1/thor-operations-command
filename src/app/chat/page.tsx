import { TocShell, PageIntro } from "@/components/TocShell";
import { FlowHeading, Panel, Tag } from "@/components/TocCards";

export default function ChatPage() {
  return (
    <TocShell>
      <FlowHeading step="7" eyebrow="Chat" title="Ensure healthy communication between management" />
      <PageIntro title="Chat" detail="Ensure healthy communication between management." />
      <section className="command-grid route-grid">
        <Panel wide eyebrow="Internal comms" title="Manager chat" pill="Database planned">
          <div className="chat-layout">
            <aside className="chat-channels"><button className="active">National Ops <span>2</span></button><button>Managers <span>1</span></button><button>Workshop <span>1</span></button></aside>
            <div className="chat-room">
              <div className="chat-room-head"><div><span className="eyebrow">Admin access</span><strong>National Ops</strong></div><Tag>Local prototype</Tag></div>
              <div className="chat-messages">
                <article className="chat-message"><div><strong>Admin User</strong><span>National Ops - 08:05</span></div><p>Keep Portal approvals tight today and flag anything that will hold invoicing.</p></article>
                <article className="chat-message own"><div><strong>National Ops</strong><span>National Ops - 08:18</span></div><p>Please keep Fleetio entries clean. Registration, wash type and site all matter.</p></article>
              </div>
              <form className="chat-form"><input placeholder="Message National Ops" /><button type="button">Send</button></form>
            </div>
          </div>
        </Panel>
      </section>
    </TocShell>
  );
}
