import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { ErrorBox } from "../components/ui";

export default function Login() {
  const { signIn } = useAuth();
  const nav = useNavigate();
  const [needsSetup, setNeedsSetup] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ needs_setup: boolean }>("/auth/status").then((r) => setNeedsSetup(r.needs_setup)).catch(() => {});
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api(needsSetup ? "/auth/bootstrap" : "/auth/login", { body: form });
      signIn(r.token, r.user);
      nav("/");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <div className="min-h-screen grid place-items-center bg-navy px-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4">
        <div>
          <h1 className="text-xl font-semibold">AI-Assisted L1 Interview</h1>
          <p className="text-sm text-slate-500">
            {needsSetup ? "First run: create the Super User account." : "Sign in to continue."}
          </p>
        </div>
        <ErrorBox error={error} />
        {needsSetup && (
          <div>
            <label className="label">Name</label>
            <input className="input" required value={form.name} onChange={set("name")} />
          </div>
        )}
        <div>
          <label className="label">Email</label>
          <input className="input" type="email" required value={form.email} onChange={set("email")} />
        </div>
        <div>
          <label className="label">Password</label>
          <input className="input" type="password" required minLength={needsSetup ? 8 : 1}
            value={form.password} onChange={set("password")} />
        </div>
        <button className="btn-primary w-full justify-center" disabled={busy}>
          {busy ? "Please wait…" : needsSetup ? "Create Super User" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
