import { NavLink } from "react-router-dom";
import {
  LayoutDashboard, Users, Package, BarChart3, X,
  ClipboardList, Gauge, Shapes, Factory, CalendarDays, UsersRound, Cpu, Boxes, LayoutGrid, CloudDownload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import logoUrl from "@/assets/logo.png";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/projects", label: "Projects", icon: Package },
  { to: "/reports", label: "Reports", icon: BarChart3 },
];

const PLANNING_NAV = [
  { to: "/planning", label: "Planning", icon: ClipboardList },
  { to: "/planning/capacity", label: "Capacity", icon: Gauge },
  { to: "/planning/workers", label: "Worker Loading", icon: UsersRound },
  { to: "/planning/knitting", label: "Knitting Planning", icon: Cpu },
  { to: "/planning/board", label: "Machine Board", icon: LayoutGrid },
  { to: "/planning/styles", label: "Styles", icon: Shapes },
  { to: "/planning/yarns", label: "Yarns", icon: Boxes },
  { to: "/planning/materials", label: "Yarn Requirements", icon: Package },
  { to: "/planning/resources", label: "Resources", icon: Factory },
  { to: "/planning/calendar", label: "Calendar", icon: CalendarDays },
];

function Brand() {
  return (
    <div className="px-5 py-5">
      <img src={logoUrl} alt="Lualua Crochet & Knitting" className="h-10 w-auto" />
    </div>
  );
}

export default function Sidebar({ mobileOpen, onClose }) {
  const linkClass = ({ isActive }) =>
    cn(
      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
      isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
    );

  const content = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between">
        <Brand />
        <button onClick={onClose} className="mr-4 lg:hidden" aria-label="Close menu"><X className="h-5 w-5" /></button>
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {NAV.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={linkClass} onClick={onClose}>
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
        <p className="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">Production</p>
        {PLANNING_NAV.map((item) => (
          <NavLink key={item.to} to={item.to} end className={linkClass} onClick={onClose}>
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <p className="px-5 py-4 text-xs text-muted-foreground">Production CRM · v1.0</p>
    </div>
  );

  return (
    <>
      {/* Desktop */}
      <aside className="hidden w-60 shrink-0 border-r bg-card lg:block">{content}</aside>
      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={onClose} />
          <aside className="absolute left-0 top-0 h-full w-64 bg-card shadow-xl">{content}</aside>
        </div>
      )}
    </>
  );
}
