"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import type { PublicJob } from "@/lib/pawarna/types";
import { jobDiagnostics } from "@/lib/pawarna/diagnostics";

export function JobDiagnostics({ job, deployment }: { job: PublicJob; deployment: "local" | "cloud" }) {
  const [notice, setNotice] = useState("");
  const [expanded, setExpanded] = useState(false);
  const report = jobDiagnostics(job, deployment);
  async function copy() {
    try {
      await navigator.clipboard.writeText(report);
      setNotice("Info job disalin. Paste dalam chat ini untuk semakan.");
    } catch {
      setExpanded(true);
      setNotice("Salinan automatik tak tersedia. Tekan lama teks di bawah dan pilih Salin, atau hantar screenshot.");
    }
  }
  return <div className="pf-job-info">
    <div className="pf-job-info-heading"><span>Info untuk semakan</span><button type="button" onClick={() => void copy()}>{notice.startsWith("Info job disalin") ? <Check size={16}/> : <Copy size={16}/>} Salin info job</button></div>
    <p>ID job: <code>{job.id}</code></p>
    <p>ID rujukan: <code>{job.external_job_id || "Belum dihantar"}</code></p>
    <p>Kemas kini terakhir: <time dateTime={new Date(job.updated_at).toISOString()}>{new Date(job.updated_at).toLocaleString("ms-MY", { dateStyle: "short", timeStyle: "medium" })}</time></p>
    {notice && <p className="pf-job-info-notice" role="status">{notice}</p>}
    <details open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}><summary>Lihat teks info job</summary><textarea aria-label="Info job untuk disalin" readOnly value={report} rows={11} onFocus={event => event.currentTarget.select()}/></details>
  </div>;
}
