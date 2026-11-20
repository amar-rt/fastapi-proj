import { useEffect, useState } from "react";
import { api } from "../api";
import { ErrorBox } from "../components/ui";

type Entry = { id: number; user_name: string | null; action: string; entity: string; entity_id: string | null; ip: string | null; created_at: string };

export default function AuditLog() {
  const [rows, setRows] = useState<Entry[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<Entry[]>("/audit").then(setRows).catch((e) => setError(e.message)); }, []);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Audit log</h1>
      <p className="text-sm text-slate-500">Who viewed, changed, exported or decided. Latest 500 entries.</p>
      <ErrorBox error={error} />
      <div className="card p-0 overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50"><tr><th>When</th><th>User</th><th>Action</th><th>Entity</th><th>ID</th><th>IP</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                <td>{r.user_name ?? "—"}</td><td>{r.action}</td><td>{r.entity}</td>
                <td className="font-mono text-xs">{r.entity_id}</td><td className="font-mono text-xs">{r.ip}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
