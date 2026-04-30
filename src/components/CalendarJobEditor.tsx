"use client";

import type { FormEvent } from "react";
import type { CalendarJob } from "@/lib/toc-data";

export type CalendarEditTarget = {
  daySlug: string;
  dayLabel: string;
  jobIndex: number;
  job: CalendarJob;
};

type CalendarJobEditorProps = {
  editTarget: CalendarEditTarget;
  onCancel: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onUpdate: (field: keyof CalendarJob, value: string | number | undefined) => void;
};

const recurrenceOptions = ["None", "Daily", "Weekly", "Fortnightly", "4 weekly", "Custom"];

export function CalendarJobEditor({ editTarget, onCancel, onSave, onUpdate }: CalendarJobEditorProps) {
  return (
    <form className="calendar-edit-form calendar-edit-form-inline" onSubmit={onSave}>
      <div className="calendar-edit-heading">
        <div>
          <span className="eyebrow">Editing job</span>
          <strong>{editTarget.dayLabel}</strong>
        </div>
        <span className="calendar-week-label">{formatRecurrence(editTarget.job)}</span>
      </div>
      <label><span>Time</span><input value={editTarget.job.time} onChange={(event) => onUpdate("time", event.target.value)} /></label>
      <label><span>Location</span><input value={editTarget.job.location} onChange={(event) => onUpdate("location", event.target.value)} /></label>
      <label><span>Site</span><input value={editTarget.job.site} onChange={(event) => onUpdate("site", event.target.value)} /></label>
      <label><span>Crew</span><input value={editTarget.job.crew} onChange={(event) => onUpdate("crew", event.target.value)} /></label>
      <label><span>Job</span><input value={editTarget.job.job} onChange={(event) => onUpdate("job", event.target.value)} /></label>
      <label><span>Status</span><input value={editTarget.job.status} onChange={(event) => onUpdate("status", event.target.value)} /></label>
      <label><span>Risk colour</span><select value={editTarget.job.severity} onChange={(event) => onUpdate("severity", event.target.value)}>
        <option value="green">Green</option>
        <option value="amber">Amber</option>
        <option value="red">Red</option>
      </select></label>
      <label><span>Recurring</span><select value={editTarget.job.recurrence || "None"} onChange={(event) => onUpdate("recurrence", event.target.value)}>
        {recurrenceOptions.map((option) => <option key={option} value={option}>{option}</option>)}
      </select></label>
      {editTarget.job.recurrence === "Custom" ? (
        <label className="calendar-edit-wide">
          <span>Custom repeat logic</span>
          <div className="calendar-custom-repeat">
            <strong>Every</strong>
            <input
              min="1"
              type="number"
              value={editTarget.job.recurrenceIntervalWeeks || 3}
              onChange={(event) => onUpdate("recurrenceIntervalWeeks", Number(event.target.value) || 1)}
            />
            <strong>weeks</strong>
          </div>
          <small className="calendar-field-help">Example: 3 weekly, 6 weekly or 8 weekly. Future matching dates in this schedule will update from this job.</small>
        </label>
      ) : null}
      <label className="calendar-edit-wide"><span>Notes</span><textarea value={editTarget.job.notes} onChange={(event) => onUpdate("notes", event.target.value)} /></label>
      <div className="calendar-edit-actions">
        <button type="submit">Save job</button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function formatRecurrence(job: CalendarJob) {
  if (job.recurrence === "Custom") return `Every ${job.recurrenceIntervalWeeks || 3} weeks`;
  return job.recurrence || "None";
}
