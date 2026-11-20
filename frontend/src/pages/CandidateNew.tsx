import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, type JD, type User } from "../api";
import { ErrorBox } from "../components/ui";

export default function CandidateNew() {
  const nav = useNavigate();
  const [jds, setJds] = useState<JD[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<JD[]>("/jds").then(setJds).catch((e) => setError(e.message));
    api<User[]>("/users").then((u) => setUsers(u.filter((x) => x.active))).catch(() => {});
  }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData(e.currentTarget);
      const file = fd.get("cv") as File;
      if (file.size > 4 * 1024 * 1024) throw new Error("CV must be under 4 MB");
      const r = await api("/candidates", { body: fd });
      nav(`/interviews/${r.interview_id}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">Add candidate</h1>
      <ErrorBox error={error} />
      {jds.length === 0 && <p className="text-sm text-amber-700">Create a job description first.</p>}
      <div className="grid sm:grid-cols-2 gap-4">
        <div><label className="label">Full name</label><input name="name" className="input" required /></div>
        <div><label className="label">Email</label><input name="email" type="email" className="input" required /></div>
        <div><label className="label">Phone</label><input name="phone" className="input" /></div>
        <div>
          <label className="label">Job description</label>
          <select name="jd_id" className="input" required>
            <option value="">Select…</option>
            {jds.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Interviewer</label>
          <select name="interviewer_id" className="input">
            <option value="">Assign later</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name} ({u.role === "super_user" ? "Super User" : "Interviewer"})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">CV (PDF, DOCX or TXT, max 4 MB)</label>
          <input name="cv" type="file" accept=".pdf,.docx,.txt" className="input" required />
        </div>
      </div>
      <button className="btn-primary" disabled={busy}>{busy ? "Uploading & parsing…" : "Add candidate"}</button>
    </form>
  );
}
