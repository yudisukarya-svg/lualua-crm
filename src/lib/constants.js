// Shared option lists kept in one place so forms, filters and badges agree.

export const PROJECT_STATUSES = [
  "inquiry", "quotation", "sampling", "sample_revision", "waiting_po",
  "production", "quality_control", "ready_shipment", "shipped",
  "completed", "cancelled",
];

export const CUSTOMER_TYPES = ["new_lead", "active", "inactive"];

export const PRODUCT_CATEGORIES = ["knitwear", "crochet", "accessories"];

export const PO_STATUSES = ["draft", "received", "confirmed", "completed"];

export const SHIPMENT_STATUSES = ["pending", "in_transit", "delivered"];

export const FILE_FOLDERS = [
  "design_files", "photos", "tech_packs", "po",
  "invoices", "shipping_documents", "sample_photos", "qc_reports",
];

// Tailwind classes per project status badge
export const STATUS_STYLES = {
  inquiry: "bg-slate-100 text-slate-700",
  quotation: "bg-sky-100 text-sky-700",
  sampling: "bg-amber-100 text-amber-700",
  sample_revision: "bg-orange-100 text-orange-700",
  waiting_po: "bg-violet-100 text-violet-700",
  production: "bg-blue-100 text-blue-700",
  quality_control: "bg-fuchsia-100 text-fuchsia-700",
  ready_shipment: "bg-teal-100 text-teal-700",
  shipped: "bg-cyan-100 text-cyan-700",
  completed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-rose-100 text-rose-700",
};

export const CUSTOMER_TYPE_STYLES = {
  new_lead: "bg-amber-100 text-amber-700",
  active: "bg-emerald-100 text-emerald-700",
  inactive: "bg-slate-100 text-slate-600",
};
