import { STAGES, STAGE_LABELS, stageWorkerCount } from "@/lib/scheduler";

const DOWNSTREAM = ["linking", "finishing", "steam", "label", "qc", "packing"];
const GAUGE_KEY = { "5": "machine_5g", "7": "machine_7g", "12": "machine_12g" };

// Why can't this sales order be forecast? Returns a list of plain-language problems,
// each naming the style/stage at fault so the user knows exactly what to fill in.
export function diagnoseOrder(so, { styles, resources, machines = [], blocks = [], boardMode = false }) {
  const problems = [];
  const lines = so.sales_order_lines || [];

  if (lines.length === 0) return [{ what: "No lines", fix: "This order has no style lines yet." }];

  // Group lines by style (one production stream per style).
  const byStyle = {};
  lines.forEach((l) => {
    if (!l.style_id) { problems.push({ what: "Line without a style", fix: "Pick or type a style on every line." }); return; }
    byStyle[l.style_id] = (byStyle[l.style_id] || 0) + (Number(l.quantity) || 0);
  });

  Object.keys(byStyle).forEach((styleId) => {
    const st = styles?.[styleId];
    const name = lines.find((l) => l.style_id === styleId)?.production_styles?.name || "This style";
    if (!st) { problems.push({ what: `${name}: style not found`, fix: "Re-pick the style on this line." }); return; }

    // --- Knitting ---
    if (st.method === "machine") {
      if (!st.gauge) {
        problems.push({ what: `${name}: gauge is empty`, fix: "Styles → set Gauge (5, 7 or 12) for this machine style." });
      } else {
        const activeOfGauge = machines.filter((m) => m.active && String(m.gauge) === String(st.gauge)).length;
        const poolCount = resources?.[GAUGE_KEY[st.gauge]] || 0;
        if (machines.length > 0 && activeOfGauge === 0) {
          problems.push({ what: `${name}: no working ${st.gauge}g machine`, fix: "Machine Board → mark a machine of this gauge as active." });
        } else if (machines.length === 0 && poolCount === 0) {
          problems.push({ what: `${name}: no ${st.gauge}g machine set up`, fix: "Resources → set the number of machines for this gauge." });
        }
        if (boardMode) {
          const ordered = byStyle[styleId] || 0;
          const placedQty = blocks
            .filter((b) => b.sales_order_id === so.id && b.style_id === styleId)
            .reduce((n, b) => n + (Number(b.qty) || 0), 0);
          if (placedQty === 0) {
            problems.push({ what: `${name}: not placed on any machine`, fix: "Machine Board → add it from “Unplaced orders”, or run Auto-fill." });
          } else if (placedQty < ordered) {
            problems.push({
              what: `${name}: only ${placedQty} of ${ordered} pcs placed on machines`,
              fix: `Machine Board → add the remaining ${ordered - placedQty} pcs (see “Unplaced orders”). Knitting can't finish until every piece is on a machine.`,
            });
          }
        }
      }
      if (!(st.knitting_machine > 0)) {
        problems.push({ what: `${name}: Knitting (machine) speed is 0`, fix: "Styles → fill in the machine knitting speed (pcs per machine per day)." });
      }
    } else {
      if (!(st.knitting_manual > 0)) {
        problems.push({ what: `${name}: Knitting (manual) speed is 0`, fix: "Styles → fill in the manual knitting speed (pcs per worker per day)." });
      }
      if (!((resources?.knitting_manual || 0) > 0)) {
        problems.push({ what: "No manual knitting workers", fix: "Resources → set the number of manual knitting workers." });
      }
    }

    // --- Downstream stages ---
    DOWNSTREAM.forEach((s) => {
      if (!(st[s] > 0)) problems.push({ what: `${name}: ${STAGE_LABELS[s]} speed is 0`, fix: `Styles → fill in the ${STAGE_LABELS[s]} speed.` });
    });
  });

  // --- Stage staffing (applies to the whole factory) ---
  DOWNSTREAM.forEach((s) => {
    if (stageWorkerCount(s, resources) <= 0) {
      problems.push({ what: `No workers at ${STAGE_LABELS[s]}`, fix: `Resources → set the number of ${STAGE_LABELS[s]} workers.` });
    }
  });

  // De-duplicate identical messages.
  const seen = new Set();
  return problems.filter((p) => { const k = p.what + p.fix; if (seen.has(k)) return false; seen.add(k); return true; });
}

export { STAGES };
