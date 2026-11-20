import { useEffect, useState, type FormEvent } from "react";
import { api, type User } from "../api";
import { ErrorBox, Section } from "../components/ui";

export default function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "interviewer" });
  const [error, setError] = useState<string | null>(null);

  const load = () => api<User[]>("/users").then(setUsers).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  async function add(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api("/users", { body: form });
      setForm({ name: "", email: "", password: "", role: "interviewer" });
      load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function toggle(u: User) {
    await api(`/users/${u.id}`, { method: "PATCH", body: { active: !u.active } }).catch((e) => setError(e.message));
    load();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Users</h1>
      <ErrorBox error={error} />
      <Section title="Add user">
        <form onSubmit={add} className="grid sm:grid-cols-5 gap-3 items-end">
          <div><label className="label">Name</label><input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><label className="label">Email</label><input className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div><label className="label">Temporary password</label><input className="input" type="text" minLength={8} required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
          <div><label className="label">Role</label>
            <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="interviewer">Interviewer</option>
              <option value="super_user">Super User</option>
            </select>
          </div>
          <button className="btn-primary justify-center">Add</button>
        </form>
      </Section>
      <div className="card p-0 overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50"><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th /></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>{u.role === "super_user" ? "Super User" : "Interviewer"}</td>
                <td>{u.active ? "Active" : <span className="text-red-700">Disabled</span>}</td>
                <td className="text-right"><button className="btn-secondary" onClick={() => toggle(u)}>{u.active ? "Disable" : "Enable"}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
