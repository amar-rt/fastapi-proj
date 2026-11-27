import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth";

export default function Layout() {
  const { user, signOut } = useAuth();
  const link = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-1.5 rounded-lg text-sm font-medium transition ${
      isActive ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
    }`;
  const isSuper = user?.role === "super_user";
  const initials = (user?.name ?? "?").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-slate-200/80">
        <div className="mx-auto max-w-7xl px-4 h-16 flex items-center gap-6">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-xs font-bold text-white shadow-sm">
              L1
            </span>
            <span className="font-semibold text-slate-900 hidden sm:inline">Interview</span>
          </div>
          <nav className="flex gap-1 flex-wrap">
            <NavLink to="/" end className={link}>Candidates</NavLink>
            {isSuper && <NavLink to="/candidates/new" className={link}>Add candidate</NavLink>}
            {isSuper && <NavLink to="/jds" className={link}>Job descriptions</NavLink>}
            {isSuper && <NavLink to="/users" className={link}>Users</NavLink>}
            {isSuper && <NavLink to="/audit" className={link}>Audit log</NavLink>}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden md:block text-right leading-tight">
              <div className="text-sm font-medium text-slate-800">{user?.name}</div>
              <div className="text-xs text-slate-500">{isSuper ? "Super User" : "Interviewer"}</div>
            </div>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700">
              {initials}
            </span>
            <button className="btn-ghost px-2 py-1" onClick={signOut}>Sign out</button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
