// Turns the Dispatch & Return app's activity log (dispatch_activity_log, in
// the PO Tukang project) into clean per-SO dispatch numbers.
//
// The log is an event log, not a records table, so it has to be replayed:
//   kirim            first-time shipment               → sent     +qty
//   hapus            deleted shipment / return         → sent or returned −qty
//   pulihkan         restored shipment                 → sent     +qty, but ONLY
//                    when it undoes an earlier logged "hapus" of the same SO+qty
//                    (Nov 2026: SO-02601's 29 Oct shipment was "restored" from a
//                    Surat Jalan screenshot with no delete ever logged — the
//                    original "kirim" is still in the log, so counting the
//                    restore too would double it)
//   edit_kirim       edited shipment qty               → sent     +(new − old)
//   retur            pieces returned by the customer   → returned +qty
//   kirim_ulang      replacement for returned pieces   → resent   +qty
//   edit_kirim_ulang edited replacement qty            → resent   +(new − old)
//
// "sent" is what counts toward the order quantity. A kirim_ulang replaces a
// returned piece, so it is NOT new order quantity — it only reduces the
// outstanding returns: owedReturns = max(0, returned − resent).
// Exception: re-sends beyond everything ever returned (old July–Aug 2026
// data, e.g. SO-02237 shipped entirely as "kirim_ulang") can't be
// replacements, so that excess counts as sent.
//
// SO numbers are read out of whatever was typed: "SO-02601 SP-00867" → "SO-02601".

export const DISPATCH_ACTIONS = ["kirim", "kirim_ulang", "hapus", "pulihkan", "edit_kirim", "edit_kirim_ulang", "retur"];

// Sample / servis shipments typed against an SO ("SO-02426 New Sample",
// "SO-00000 Servisan") are not order quantity and are skipped.
export function normalizeSo(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (/sampl|servis/i.test(s)) return null;
  const m = s.match(/^SO[\s-]*(\d{4,5})\b/i);
  if (m) return `SO-${m[1].padStart(5, "0")}`;
  return s || null;
}

function qtyOf(r) {
  return Number(r.detail?.totalQty) || 0;
}

// Change in qty from an edit event: snapshot new/old totals, else parse "qty 28→27".
function editDelta(r) {
  const snap = r.detail?._snapshot;
  const n = Number(snap?.data?.totalQty);
  const o = Number(snap?.sebelum?.totalQty);
  if (Number.isFinite(n) && Number.isFinite(o) && snap?.data?.totalQty != null && snap?.sebelum?.totalQty != null) return n - o;
  const all = [...String(r.detail?.perubahan || "").matchAll(/(\d+)\s*(?:→|->)\s*(\d+)/g)];
  const last = all[all.length - 1];
  return last ? Number(last[2]) - Number(last[1]) : 0;
}

const day = (r) => (r.created_at || "").slice(0, 10);

// rows: dispatch_activity_log rows { action_type, detail, created_at }
// → { [soNumber]: { sent, returned, resent, owedReturns, lastSentDate, events: [{ qty, date }] } }
//   events = signed adjustments to "sent" (positive shipments, negative deletes/edits)
export function buildDispatchLedger(rows) {
  const bySo = {};
  const get = (so) => (bySo[so] = bySo[so] || { sent: 0, returned: 0, resent: 0, owedReturns: 0, lastSentDate: null, lastResentDate: null, events: [] });
  const pendingDeletes = {}; // so|qty → count of logged shipment deletes not yet restored

  const sorted = [...(rows || [])].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  sorted.forEach((r) => {
    const so = normalizeSo(r.detail?.so);
    if (!so) return;
    const jenis = String(r.detail?.jenis || "").toLowerCase();
    const isShipmentJenis = !jenis || jenis === "pengiriman" || jenis === "shipments";
    const e = get(so);
    const addSent = (q) => {
      if (!q) return;
      e.sent += q;
      e.events.push({ qty: q, date: day(r) });
      if (q > 0 && day(r) && (!e.lastSentDate || day(r) > e.lastSentDate)) e.lastSentDate = day(r);
    };

    switch (r.action_type) {
      case "kirim": addSent(qtyOf(r)); break;
      case "edit_kirim": addSent(editDelta(r)); break;
      case "hapus":
        if (jenis === "retur") e.returned -= qtyOf(r);
        else if (jenis === "kirim ulang" || jenis === "kirim_ulang") e.resent -= qtyOf(r);
        else if (isShipmentJenis) {
          addSent(-qtyOf(r));
          const k = `${so}|${qtyOf(r)}`;
          pendingDeletes[k] = (pendingDeletes[k] || 0) + 1;
        }
        break;
      case "pulihkan": {
        if (!isShipmentJenis) break;
        const k = `${so}|${qtyOf(r)}`;
        if (pendingDeletes[k] > 0) { pendingDeletes[k] -= 1; addSent(qtyOf(r)); }
        break;
      }
      case "retur": e.returned += qtyOf(r); break;
      case "kirim_ulang":
        e.resent += qtyOf(r);
        if (day(r) && (!e.lastResentDate || day(r) > e.lastResentDate)) e.lastResentDate = day(r);
        break;
      case "edit_kirim_ulang": e.resent += editDelta(r); break;
      default: break;
    }
  });

  Object.values(bySo).forEach((e) => {
    e.sent = Math.max(0, e.sent);
    e.returned = Math.max(0, e.returned);
    e.resent = Math.max(0, e.resent);
    const excess = Math.max(0, e.resent - e.returned);
    if (excess > 0) {
      e.sent += excess;
      e.events.push({ qty: excess, date: e.lastResentDate });
      if (e.lastResentDate && (!e.lastSentDate || e.lastResentDate > e.lastSentDate)) e.lastSentDate = e.lastResentDate;
    }
    e.owedReturns = Math.max(0, e.returned - e.resent);
  });
  return bySo;
}
