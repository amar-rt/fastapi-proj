import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, tokenStore, type User } from "./api";

type Ctx = { user: User | null; loading: boolean; signIn: (token: string, user: User) => void; signOut: () => void };
const AuthCtx = createContext<Ctx>(null!);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(!!tokenStore.get());

  useEffect(() => {
    if (!tokenStore.get()) return;
    api<User>("/auth/me").then(setUser).catch(() => tokenStore.clear()).finally(() => setLoading(false));
  }, []);

  const signIn = (token: string, u: User) => { tokenStore.set(token); setUser(u); };
  const signOut = () => { tokenStore.clear(); setUser(null); };
  return <AuthCtx.Provider value={{ user, loading, signIn, signOut }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
