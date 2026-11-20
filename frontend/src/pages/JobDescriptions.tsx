import { useEffect, useState, type FormEvent } from "react";
import { api, type JD } from "../api";
import { ErrorBox, Section } from "../components/ui";

type Draft = Omit<JD, "id" | "must_have" | "nice_to_have"> & { id?: string; must_have: string; nice_to_have: string };

export default function JobDescriptions() {
  const [jds, setJds] = useState<JD[]>([]);
  const [areas, setAreas] = useState<Record<string, string>>({});
  const [defaults, setDefaults] = useState<Record<string, number>>({});
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => api<JD[]>("/jds").then(setJds).catch((e) => setError(e.message));
  useEffect(() => {
    load();
    api("/rubric").then((r) => { setAreas(r.areas); setDefaults(r.default_weights); });
  }, []);

  const blank = (): Draft => ({ title: "", description: "", must_have: "", nice_to_have: "", skill_weights: { ...defaults }, pass_threshold: 3 });
  const edit = (j: JD): Draft => ({ ...j, must_have: j.must_have.join(", "), nice_to_have: j.nice_to_have.join(", "),
    skill_weights: { ...defaults, ...j.skill_weights }, pass_threshold: Number(j.pass_threshold) });

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setBusy(true);
    setError(null);
    const body = {
      ...draft,
      must_have: draft.must_have.split(",").map((s) => s.trim()).filter(Boolean),
      nice_to_have: draft.nice_to_have.split(",").map((s) => s.trim()).filter(Boolean),
    };
    try {
      await api(draft.id ? `/jds/${draft.id}` : "/jds", { method: draft.id ? "PUT" : "POST", body });
      setDraft(null);
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Job descriptions</h1>
        {!draft && <button className="btn-primary" onClick={() => setDraft(blank())}>New JD</button>}
      </div>
      <ErrorBox error={error} />

      {draft && (
        <form onSubmit={save} className="card space-y-4">
          <h2 className="font-semibold text-lg">{draft.id ? "Edit" : "New"} job description</h2>
          <div><label className="label">Title</label>
            <input className="input" required value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></div>
          <div><label className="label">Description</label>
            <textarea className="input min-h-40" required minLength={20} value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div><label className="label">Must-have skills (comma separated)</label>
              <input className="input" value={draft.must_have} onChange={(e) => setDraft({ ...draft, must_have: e.target.value })} /></div>
            <div><label className="label">Nice-to-have skills (comma separated)</label>
              <input className="input" value={draft.nice_to_have} onChange={(e) => setDraft({ ...draft, nice_to_have: e.target.value })} /></div>
          </div>
          <div>
            <label className="label">Skill area weights (0 = not scored)</label>
            <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {Object.entries(areas).map(([area, desc]) => (
                <div key={area} title={desc}>
                  <div className="text-xs text-slate-600 mb-1">{area}</div>
                  <input className="input" type="number" min={0} max={5} step={0.5} value={draft.skill_weights[area] ?? 0}
                    onChange={(e) => setDraft({ ...draft, skill_weights: { ...draft.skill_weights, [area]: Number(e.target.value) } })} />
                </div>
              ))}
            </div>
          </div>
          <div className="max-w-xs"><label className="label">Pass threshold (weighted score 1–5)</label>
            <input className="input" type="number" min={1} max={5} step={0.1} value={draft.pass_threshold}
              onChange={(e) => setDraft({ ...draft, pass_threshold: Number(e.target.value) })} /></div>
          <div className="flex gap-2">
            <button className="btn-primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
            <button type="button" className="btn-secondary" onClick={() => setDraft(null)}>Cancel</button>
          </div>
        </form>
      )}

      {jds.map((j) => (
        <Section key={j.id} title={j.title} actions={<button className="btn-secondary" onClick={() => setDraft(edit(j))}>Edit</button>}>
          <p className="text-sm text-slate-600 line-clamp-3 whitespace-pre-line">{j.description}</p>
          <div className="text-sm"><b>Must-have:</b> {j.must_have.join(", ") || "—"}</div>
          <div className="text-sm"><b>Nice-to-have:</b> {j.nice_to_have.join(", ") || "—"}</div>
          <div className="text-sm"><b>Pass threshold:</b> {Number(j.pass_threshold).toFixed(1)}</div>
        </Section>
      ))}
      {jds.length === 0 && !draft && <p className="text-slate-500">No job descriptions yet.</p>}
    </div>
  );
}
