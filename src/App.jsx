import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { ToastProvider } from "@/components/ui/use-toast";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppLayout from "@/components/layout/AppLayout";

import Login from "@/pages/Login";
import ResetPassword from "@/pages/ResetPassword";
import Dashboard from "@/pages/Dashboard";
import Customers from "@/pages/Customers";
import CustomerDetail from "@/pages/CustomerDetail";
import Projects from "@/pages/Projects";
import ProjectDetail from "@/pages/ProjectDetail";
import Reports from "@/pages/Reports";
import Planning from "@/pages/Planning";
import Capacity from "@/pages/Capacity";
import WorkerLoading from "@/pages/WorkerLoading";
import MachinePlanning from "@/pages/KnittingPlanning";
import Styles from "@/pages/Styles";
import Yarns from "@/pages/Yarns";
import Materials from "@/pages/Materials";
import MachineBoard from "@/pages/MachineBoard";
import Resources from "@/pages/Resources";
import PlanningCalendar from "@/pages/PlanningCalendar";
import NotFound from "@/pages/NotFound";

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<Login />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          {/* Protected app shell */}
          <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/customers/:id" element={<CustomerDetail />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/projects/:id" element={<ProjectDetail />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/planning" element={<Planning />} />
            <Route path="/planning/capacity" element={<Capacity />} />
            <Route path="/planning/workers" element={<WorkerLoading />} />
            <Route path="/planning/knitting" element={<MachinePlanning />} />
            <Route path="/planning/styles" element={<Styles />} />
            <Route path="/planning/yarns" element={<Yarns />} />
            <Route path="/planning/materials" element={<Materials />} />
            <Route path="/planning/board" element={<MachineBoard />} />
            <Route path="/planning/resources" element={<Resources />} />
            <Route path="/planning/calendar" element={<PlanningCalendar />} />
          </Route>

          <Route path="/404" element={<NotFound />} />
          <Route path="*" element={<Navigate to="/404" replace />} />
        </Routes>
      </AuthProvider>
    </ToastProvider>
  );
}
