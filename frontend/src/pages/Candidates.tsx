import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, download, type JD, type User } from "../api";
import { useAuth } from "../auth";
import { Badge, ErrorBox, ScorePill, Spinner } from "../components/ui";

type Row = {
  interview_id: string; name: string; email: string; role: string; interviewer: string | null; status: string;
  created_at: string; pre_match_percent: number | null; match_percent: number | null; overall_score: number | null;
  ai_recommendation: string | null; decision: string | null; overrides_ai: boolean | null;
};

const EMPTY = {
  q: "", jd_id: "", interviewer_id: "", status: "", decision: "", recommendation: "",
  min_score: "", max_score: "", min_match: "", max_match: "", date_from: "", date_to: "",
  skill: "", skill_min: "", disagreement: "",
};
type Filters = typeof EMPTY;

export default function Candidates() {
  const { user } = useAuth();
  const isSuper = user?.role === "super_user";
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [jds, setJds] = useState<JD[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [areas, setAreas] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && p.set(k, v));
    return p.toString();
  }, [filters]);

  useEffect(() => {
    api<JD[]>("/jds").then(setJds).catch(() => {});
    api<User[]>("/users").then(setUsers).catch(() => {});
    api("/rubric").then((r) => setAreas(Object.keys(r.areas))).catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setError(null);
      api<Row[]>(`/candidates?${qs}`).then(setRows).catch((e) => setError(e.message));
    }, 250);
    return () => clearTimeout(t);
  }, [qs]);

  const set = (k: keyof Filters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const t = e.target as HTMLInputElement;
    setFilters({ ...filters, [k]: t.type === "checkbox" ? (t.checked ? "true" : "") : t.value });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-semibold">Candidates</h1>
        <div className="flex gap-2">
          <button className="btn-secondary"
            onClick={() => download(`/candidates/export.csv?${qs}`, "l1-candidates.csv").catch((e) => setError(e.message))}>
            Export CSV (Excel)
          </button>
          {isSuper && <Link to="/candidates/new" className="btn-primary">Add candidate</Link>}
        </div>
      </div>

      <div className="card grid gap-3 grid-cols-2 md:grid-cols-4 lg:grid-cols-6">
        <input className="input col-span-2" placeholder="Search name or email" value={filters.q} onChange={set("q")} />
        <select className="input" value={filters.jd_id} onChange={set("jd_id")}>
          <option value="">All roles</option>
          {jds.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
        </select>
        {isSuper && (
          <select className="input" value={filters.interviewer_id} onChange={set("interviewer_id")}>
            <option value="">All interviewers</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        )}
        <select className="input" value={filters.status} onChange={set("status")}>
          <option value="">Any status</option>
          {["new", "prepared", "in_progress", "completed", "decided"].map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className="input" value={filters.decision} onChange={set("decision")}>
          <option value="">Any decision</option>
          <option>selected</option>
          <option>rejected</option>
        </select>
        <select className="input" value={filters.recommendation} onChange={set("recommendation")}>
          <option value="">Any AI rec.</option>
          <option value="next_round">next round</option>
          <option>hold</option>
          <option>reject</option>
        </select>
        <input className="input" type="number" step="0.1" min={1} max={5} placeholder="Min score" value={filters.min_score} onChange={set("min_score")} />
        <input className="input" type="number" step="0.1" min={1} max={5} placeholder="Max score" value={filters.max_score} onChange={set("max_score")} />
        <input className="input" type="number" min={0} max={100} placeholder="Min match %" value={filters.min_match} onChange={set("min_match")} />
        <input className="input" type="number" min={0} max={100} placeholder="Max match %" value={filters.max_match} onChange={set("max_match")} />
        <input className="input" type="date" title="From date" value={filters.date_from} onChange={set("date_from")} />
        <input className="input" type="date" title="To date" value={filters.date_to} onChange={set("date_to")} />
        <select className="input" value={filters.skill} onChange={set("skill")}>
          <option value="">Skill…</option>
          {areas.map((a) => <option key={a}>{a}</option>)}
        </select>
        <input className="input" type="number" min={1} max={5} placeholder="Skill score ≥" value={filters.skill_min} onChange={set("skill_min")} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!filters.disagreement} onChange={set("disagreement")} /> AI vs. human disagree
        </label>
        <button className="btn-secondary justify-center" onClick={() => setFilters(EMPTY)}>Clear filters</button>
      </div>

      <ErrorBox error={error} />
      <div className="card p-0 overflow-x-auto">
        {!rows ? (
          <div className="p-5"><Spinner label="Loading…" /></div>
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th>Candidate</th><th>Role</th><th>Interviewer</th><th>Date</th><th>Match</th>
                <th>Score</th><th>AI rec.</th><th>Decision</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const match = r.match_percent ?? r.pre_match_percent;
                return (
                  <tr key={r.interview_id} className="hover:bg-slate-50">
                    <td>
                      <Link className="font-medium text-accent hover:underline" to={`/interviews/${r.interview_id}`}>{r.name}</Link>
                      <div className="text-xs text-slate-500">{r.email}</div>
                    </td>
                    <td>{r.role}</td>
                    <td>{r.interviewer ?? <span className="text-amber-700">Unassigned</span>}</td>
                    <td>{new Date(r.created_at).toLocaleDateString()}</td>
                    <td>{match != null ? `${match}%` : "—"}</td>
                    <td><ScorePill score={r.overall_score != null ? Number(r.overall_score) : null} /></td>
                    <td><Badge value={r.ai_recommendation} /></td>
                    <td>
                      <Badge value={r.decision} />
                      {r.overrides_ai && <span className="ml-1 text-xs text-amber-700" title="Decision overrode the AI">⚑ override</span>}
                    </td>
                    <td><Badge value={r.status} /></td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={9} className="text-center text-slate-500 py-8">No candidates match.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
