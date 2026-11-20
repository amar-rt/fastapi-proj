const TOKEN_KEY = "l1_token";

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (opts.body instanceof FormData) body = opts.body;
  else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(`/api${path}`, { method: opts.method ?? (body ? "POST" : "GET"), headers, body });
  if (res.status === 401 && token) {
    tokenStore.clear();
    window.location.href = "/login";
  }
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      msg = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
    } catch {}
    throw new ApiError(res.status, msg);
  }
  return res.headers.get("content-type")?.includes("json") ? res.json() : (res as any);
}

export async function download(path: string, filename: string) {
  const res = await fetch(`/api${path}`, { headers: { Authorization: `Bearer ${tokenStore.get()}` } });
  if (!res.ok) throw new ApiError(res.status, "Export failed");
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

export type User = { id: string; name: string; email: string; role: "super_user" | "interviewer"; active?: boolean };
export type JD = {
  id: string; title: string; description: string; must_have: string[]; nice_to_have: string[];
  skill_weights: Record<string, number>; pass_threshold: number;
};
