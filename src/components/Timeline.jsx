import {
  Activity, Upload, RefreshCw, FileText, StickyNote, Truck, PackagePlus,
} from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import EmptyState from "@/components/EmptyState";

const ICONS = {
  uploaded_file: Upload,
  updated_status: RefreshCw,
  updated_progress: RefreshCw,
  created_project: PackagePlus,
  created_note: StickyNote,
  created_shipment: Truck,
  updated_shipment: Truck,
  created_po: FileText,
};

export default function Timeline({ activities = [], loading }) {
  if (loading) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Loading timeline…</p>;
  }
  if (!activities.length) {
    return (
      <EmptyState
        icon={Activity}
        title="No activity yet"
        description="Updates to projects, files, notes and shipments will appear here automatically."
      />
    );
  }

  return (
    <ol className="relative space-y-5 pl-6">
      <span className="absolute left-[11px] top-1 h-[calc(100%-0.5rem)] w-px bg-border" aria-hidden />
      {activities.map((a) => {
        const Icon = ICONS[a.action] || Activity;
        return (
          <li key={a.id} className="relative">
            <span className="absolute -left-6 flex h-6 w-6 items-center justify-center rounded-full border bg-background">
              <Icon className="h-3.5 w-3.5 text-primary" />
            </span>
            <p className="text-sm leading-snug">{a.description}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {a.actor?.full_name ? `${a.actor.full_name} · ` : ""}{formatDateTime(a.created_at)}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
