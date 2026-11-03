// =============================================================================
// stageCredit.js — real progress per stage, so the forecast only queues the
// work that is actually still left.
//
// Before this, the forecast knew real progress only for KNITTING (Machine
// Board + PO Tukang Rajut). Every later stage started at 0 for every open
// order — even orders already fully linked, finished or shipped — so the
// linking / finishing / steam / label / QC / packing queues were inflated and
// every forecast (and any quote for a new order) came out too late.
//
// Sources (all PO Tukang project, read-only):
//   po_stage_actuals (confirmed serah-terima per SO per work-order type)
//     Rajut → knitting, Linking → linking, Finishing → finishing,
//     Steam → steam, Labelling → label, QC Final → qc
//   dispatch_activity_log ("kirim" / "kirim_ulang" totalQty) → packing
//     (a piece that has been shipped has certainly been packed)
//
// PO Tukang tracks per SO, not per style, so an SO's totals are shared out
// across its style streams in proportion to each stream's qty.
// =============================================================================
import { STAGES } from "@/lib/scheduler";

export const TIPE_TO_SCHED_STAGE = {
  "Rajut": "knitting",
  "Linking": "linking",
  "Finishing": "finishing",
  "Steam": "steam",
  "Labelling": "label",
  "QC Final": "qc",
};

// rows: po_stage_actuals rows { so, tipe, aktual }
// dispatchRows: dispatch_activity_log rows { detail: { so, totalQty } }
// → { [soNumber]: { knitting, linking, ..., packing } }
export function sumStageActualsBySo(rows, dispatchRows) {
  const bySo = {};
  const get = (so) => (bySo[so] = bySo[so] || Object.fromEntries(STAGES.map((s) => [s, 0])));
  (rows || []).forEach((r) => {
    const stage = TIPE_TO_SCHED_STAGE[r.tipe];
    if (!stage || !r.so) return;
    get(r.so)[stage] += Number(r.aktual) || 0;
  });
  (dispatchRows || []).forEach((r) => {
    const so = r.detail?.so;
    if (!so) return;
    get(so).packing += Number(r.detail?.totalQty) || 0;
  });
  return bySo;
}

// jobs: from buildJobs (one per SO+style). → { [jobId]: { stage: qty } }
export function buildStageCredit(jobs, stageBySo) {
  const credit = {};
  if (!stageBySo) return credit;
  const soQty = {};
  (jobs || []).forEach((j) => { soQty[j.soNumber] = (soQty[j.soNumber] || 0) + (Number(j.quantity) || 0); });
  (jobs || []).forEach((j) => {
    const sums = stageBySo[j.soNumber];
    const total = soQty[j.soNumber];
    if (!sums || !total) return;
    const share = (Number(j.quantity) || 0) / total;
    const c = {};
    STAGES.forEach((s) => { c[s] = Math.min(j.quantity, Math.floor((sums[s] || 0) * share)); });
    credit[j.id] = c;
  });
  return credit;
}
