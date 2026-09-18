// On-time delivery report — historical performance, not forecast.
//
// An order counts as "completed" here only when it's fully dispatched
// (total shipped qty >= total ordered qty, same definition Planning.jsx
// already uses for its "Dispatched" badge). Its actual completion date is
// the LATEST shipping_date among its shipments — when everything finally
// went out, not when the first partial shipment left. Orders with no
// customer_deadline set, or not yet fully dispatched, are excluded
// entirely (this is a report on what actually happened, not a guess).
//
// Categories (calendar days, not working days — the customer doesn't
// care about our factory calendar):
//   onTime:   actual completion <= customer_deadline
//   late:     0 < (actual - deadline) <= 7 days
//   veryLate: (actual - deadline) > 7 days

// Maps Dispatch & Return activity-log rows (real shipment events, from
// dispatch_activity_log) into the { sales_order_id, qty, shipping_date }
// shape computeOnTimeReport expects. Only exact so_number matches against
// CRM's own sales_orders count — the log has some messy/non-SO reference
// numbers (SHP-xxxxx, INV-xxxxx, free-text) that don't correspond to a
// real CRM sales order; those are skipped rather than guessed at.
export function mapDispatchLogToShipments(logRows, salesOrders) {
  const soIdByNumber = {};
  (salesOrders || []).forEach((so) => { soIdByNumber[so.so_number] = so.id; });

  const out = [];
  (logRows || []).forEach((r) => {
    const soNumber = r.detail?.so;
    const soId = soNumber && soIdByNumber[soNumber];
    if (!soId) return;
    const qty = Number(r.detail?.totalQty) || 0;
    if (qty <= 0) return;
    const shippingDate = (r.created_at || "").slice(0, 10);
    if (!shippingDate) return;
    out.push({ sales_order_id: soId, qty, shipping_date: shippingDate });
  });
  return out;
}

function daysBetween(dateStr1, dateStr2) {
  // dateStr2 - dateStr1, in whole days (both "YYYY-MM-DD")
  const [y1, m1, d1] = dateStr1.split("-").map(Number);
  const [y2, m2, d2] = dateStr2.split("-").map(Number);
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.round((b - a) / 86400000);
}

// salesOrders: rows with { id, so_number, customer_deadline, sales_order_lines: [{quantity}], customers: {customer_name} }
// shipments: rows with { sales_order_id, qty, shipping_date }
// Returns { total, onTime, late, veryLate, pctOnTime, pctLate, pctVeryLate, rows: [...] }
export function computeOnTimeReport({ salesOrders, shipments }) {
  const shipmentsBySo = {};
  (shipments || []).forEach((s) => {
    (shipmentsBySo[s.sales_order_id] = shipmentsBySo[s.sales_order_id] || []).push(s);
  });

  const rows = [];
  (salesOrders || []).forEach((so) => {
    if (!so.customer_deadline) return;
    const totalQty = (so.sales_order_lines || []).reduce((n, l) => n + (Number(l.quantity) || 0), 0);
    if (totalQty <= 0) return;
    const soShipments = shipmentsBySo[so.id] || [];
    const dispatchedQty = soShipments.reduce((n, s) => n + (Number(s.qty) || 0), 0);
    if (dispatchedQty < totalQty) return; // not fully completed yet — excluded from historical report

    const datedShipments = soShipments.filter((s) => s.shipping_date);
    if (datedShipments.length === 0) return; // fully dispatched qty-wise but no date on record — can't judge timing
    const actualCompletionDate = datedShipments.map((s) => s.shipping_date).sort().slice(-1)[0];

    const daysLate = daysBetween(so.customer_deadline, actualCompletionDate);
    const category = daysLate <= 0 ? "onTime" : daysLate <= 7 ? "late" : "veryLate";

    rows.push({
      soId: so.id, soNumber: so.so_number, customerName: so.customers?.customer_name || null,
      customerDeadline: so.customer_deadline, actualCompletionDate, daysLate, category,
    });
  });

  const total = rows.length;
  const onTime = rows.filter((r) => r.category === "onTime").length;
  const late = rows.filter((r) => r.category === "late").length;
  const veryLate = rows.filter((r) => r.category === "veryLate").length;
  const pct = (n) => (total > 0 ? Math.round((n / total) * 1000) / 10 : 0);

  return { total, onTime, late, veryLate, pctOnTime: pct(onTime), pctLate: pct(late), pctVeryLate: pct(veryLate), rows };
}
