import { Badge } from "@/components/ui/badge";
import { STATUS_STYLES, CUSTOMER_TYPE_STYLES } from "@/lib/constants";
import { humanize, cn } from "@/lib/utils";

export function StatusBadge({ status }) {
  return <Badge className={cn(STATUS_STYLES[status] || "bg-slate-100 text-slate-700")}>{humanize(status)}</Badge>;
}

export function CustomerTypeBadge({ type }) {
  return <Badge className={cn(CUSTOMER_TYPE_STYLES[type] || "bg-slate-100 text-slate-700")}>{humanize(type)}</Badge>;
}

const SHIP_STYLES = { pending: "bg-slate-100 text-slate-700", in_transit: "bg-blue-100 text-blue-700", delivered: "bg-emerald-100 text-emerald-700" };
export function ShipmentBadge({ status }) {
  return <Badge className={cn(SHIP_STYLES[status] || "bg-slate-100 text-slate-700")}>{humanize(status)}</Badge>;
}

const PO_STYLES = { draft: "bg-slate-100 text-slate-700", received: "bg-amber-100 text-amber-700", confirmed: "bg-blue-100 text-blue-700", completed: "bg-emerald-100 text-emerald-700" };
export function POBadge({ status }) {
  return <Badge className={cn(PO_STYLES[status] || "bg-slate-100 text-slate-700")}>{humanize(status)}</Badge>;
}
