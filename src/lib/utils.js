import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// Safe local-calendar-date helpers — deliberately never round-trip through
// toISOString()/UTC. `new Date(dateStr + "T00:00:00").toISOString()` silently
// shifts the date backward by one day for anyone in a timezone ahead of UTC
// (e.g. Bali, UTC+8) — local midnight of a date is still the PREVIOUS day in
// UTC, so toISOString() reports the wrong calendar date. These helpers stay
// entirely in local-calendar-component arithmetic (getFullYear/getMonth/
// getDate), so they're correct regardless of the browser's timezone.
export function toLocalDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function addDaysLocal(dateStr, n) {
  const [y, m, day] = dateStr.split("-").map(Number);
  return toLocalDateStr(new Date(y, m - 1, day + n));
}
export function todayLocalStr() {
  return toLocalDateStr(new Date());
}

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function formatDate(value, opts = { day: "2-digit", month: "short", year: "numeric" }) {
  if (!value) return "—";
  try { return new Date(value).toLocaleDateString("en-GB", opts); }
  catch { return "—"; }
}

export function formatDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function formatMoney(amount, currency = "USD") {
  if (amount === null || amount === undefined || amount === "") return "—";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(amount));
  } catch {
    return `${currency} ${amount}`;
  }
}

export function bytes(n) {
  if (!n && n !== 0) return "—";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0; let v = Number(n);
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}

export function initials(name = "") {
  return name.trim().split(/\s+/).slice(0, 2).map((s) => s[0]?.toUpperCase() || "").join("") || "?";
}

// Human label for an enum value: 'sample_revision' -> 'Sample Revision'
export function humanize(value = "") {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
