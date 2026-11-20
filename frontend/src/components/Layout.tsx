import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth";

export default function Layout() {
  const { user, signOut } = useAuth();
  const link = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-1.5 rounded-md text-sm ${isActive ? "bg-white/15 text-white" : "text-slate-300 hover:text-white"}`;
  const isSuper = user?.role === "super_user";
  return (
    <div className="min-h-screen">
      <header className="bg-navy">
        <div className="mx-auto max-w-7xl px-4 h-14 flex items-center gap-4">
          <span className="font-semibold text-white mr-4">L1 Interview</span>
          <nav className="flex gap-1 flex-wrap">
            <NavLink to="/" end className={link}>Candidates</NavLink>
            {isSuper && <NavLink to="/candidates/new" className={link}>Add candidate</NavLink>}
            {isSuper && <NavLink to="/jds" className={link}>Job descriptions</NavLink>}
            {isSuper && <NavLink to="/users" className={link}>Users</NavLink>}
            {isSuper && <NavLink to="/audit" className={link}>Audit log</NavLink>}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm text-slate-300">
            <span className="hidden sm:inline">{user?.name} · {user?.role === "super_user" ? "Super User" : "Interviewer"}</span>
            <button className="text-white underline" onClick={signOut}>Sign out</button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
