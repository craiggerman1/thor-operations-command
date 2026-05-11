"use client";

import { FormEvent, useState } from "react";

const regions = ["Brisbane", "Sydney", "Melbourne", "Adelaide", "Perth", "Canberra", "Workshop"];
const inductionVersion = "thor-company-induction-v1";

type FormState = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  region: string;
  address: string;
  suburb: string;
  state: string;
  postcode: string;
  licenceType: string;
  hasTransport: boolean;
  availabilityNotes: string;
  workRightsConfirmed: boolean;
  safetyAcknowledged: boolean;
  privacyAcknowledged: boolean;
  companyWebsite: string;
};

const initialForm: FormState = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  region: "Brisbane",
  address: "",
  suburb: "",
  state: "",
  postcode: "",
  licenceType: "",
  hasTransport: false,
  availabilityNotes: "",
  workRightsConfirmed: false,
  safetyAcknowledged: false,
  privacyAcknowledged: false,
  companyWebsite: ""
};

export default function WorkerInductionPage() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  function updateForm(updates: Partial<FormState>) {
    setForm((current) => ({ ...current, ...updates }));
  }

  async function submitInduction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage("");

    try {
      const response = await fetch("/api/worker-inductions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, inductionVersion })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Induction could not be submitted.");

      setIsComplete(true);
      setMessage(`Induction complete. The ${payload.region} manager has been alerted in TOC.`);
      setForm(initialForm);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Induction could not be submitted.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="worker-induction-screen">
      <section className="worker-induction-card">
        <div className="worker-induction-brand">
          <img src="/assets/thor-logo-stacked-sidebar.png" alt="Thor Mobile Truck Wash" />
          <span>Company Induction</span>
        </div>
        <div className="worker-induction-heading">
          <span className="eyebrow">Thor Mobile Truck Wash</span>
          <h1>New Worker Company Induction</h1>
          <p>Complete this induction after you have read and understood the Thor company onboarding instructions supplied by your manager.</p>
        </div>

        {isComplete ? (
          <div className="worker-induction-complete">
            <strong>Induction submitted</strong>
            <p>{message}</p>
            <button type="button" onClick={() => { setIsComplete(false); setMessage(""); }}>Submit another induction</button>
          </div>
        ) : (
          <form className="worker-induction-form" onSubmit={submitInduction}>
            <input
              aria-hidden="true"
              className="worker-induction-honeypot"
              tabIndex={-1}
              autoComplete="off"
              value={form.companyWebsite}
              onChange={(event) => updateForm({ companyWebsite: event.target.value })}
            />
            <div className="worker-induction-grid">
              <label><span>First name</span><input required value={form.firstName} onChange={(event) => updateForm({ firstName: event.target.value })} /></label>
              <label><span>Last name</span><input required value={form.lastName} onChange={(event) => updateForm({ lastName: event.target.value })} /></label>
              <label><span>Email</span><input required type="email" value={form.email} onChange={(event) => updateForm({ email: event.target.value })} /></label>
              <label><span>Mobile phone</span><input required inputMode="tel" value={form.phone} onChange={(event) => updateForm({ phone: event.target.value })} /></label>
              <label><span>Preferred region</span><select value={form.region} onChange={(event) => updateForm({ region: event.target.value })}>{regions.map((region) => <option key={region}>{region}</option>)}</select></label>
              <label><span>Licence type</span><input value={form.licenceType} onChange={(event) => updateForm({ licenceType: event.target.value })} placeholder="Car, MR, HR, etc." /></label>
              <label><span>Address</span><input value={form.address} onChange={(event) => updateForm({ address: event.target.value })} /></label>
              <label><span>Suburb</span><input value={form.suburb} onChange={(event) => updateForm({ suburb: event.target.value })} /></label>
              <label><span>State</span><input value={form.state} onChange={(event) => updateForm({ state: event.target.value })} /></label>
              <label><span>Postcode</span><input inputMode="numeric" value={form.postcode} onChange={(event) => updateForm({ postcode: event.target.value })} /></label>
            </div>
            <label className="worker-induction-wide"><span>Availability notes</span><textarea value={form.availabilityNotes} onChange={(event) => updateForm({ availabilityNotes: event.target.value })} placeholder="Days, nights, restrictions, start date, or anything the manager should know." /></label>
            <div className="worker-induction-checks">
              <label><input type="checkbox" checked={form.hasTransport} onChange={(event) => updateForm({ hasTransport: event.target.checked })} /> I have reliable transport to attend work.</label>
              <label><input required type="checkbox" checked={form.workRightsConfirmed} onChange={(event) => updateForm({ workRightsConfirmed: event.target.checked })} /> I confirm I have the legal right to work in Australia.</label>
              <label><input required type="checkbox" checked={form.safetyAcknowledged} onChange={(event) => updateForm({ safetyAcknowledged: event.target.checked })} /> I have read and understood the Thor company induction and safety expectations.</label>
              <label><input required type="checkbox" checked={form.privacyAcknowledged} onChange={(event) => updateForm({ privacyAcknowledged: event.target.checked })} /> I understand Thor will use this information for onboarding and work-readiness administration.</label>
            </div>
            {message ? <div className="worker-induction-message">{message}</div> : null}
            <button type="submit" disabled={isSubmitting}>{isSubmitting ? "Submitting..." : "Complete induction"}</button>
          </form>
        )}
      </section>
    </main>
  );
}
