import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import Layout from "./components/Layout";
import { Spinner } from "./components/ui";
import AuditLog from "./pages/AuditLog";
import CandidateNew from "./pages/CandidateNew";
import Candidates from "./pages/Candidates";
import InterviewDetail from "./pages/InterviewDetail";
import InterviewRun from "./pages/InterviewRun";
import JobDescriptions from "./pages/JobDescriptions";
import Login from "./pages/Login";
import Users from "./pages/Users";

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-10"><Spinner label="Loading…" /></div>;
  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }
  const isSuper = user.role === "super_user";
  return (
    <Routes>
      <Route path="/interviews/:id/run" element={<InterviewRun />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Candidates />} />
        <Route path="/interviews/:id" element={<InterviewDetail />} />
        {isSuper && <Route path="/candidates/new" element={<CandidateNew />} />}
        {isSuper && <Route path="/jds" element={<JobDescriptions />} />}
        {isSuper && <Route path="/users" element={<Users />} />}
        {isSuper && <Route path="/audit" element={<AuditLog />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
