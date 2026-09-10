// The 9 real production checkpoints, in production order, as confirmed by
// tukang handover (serah terima) records in PO Tukang. This is ground-truth
// actual data — distinct from the 7-stage capacity/forecast model in
// scheduler.js, which is a planning projection and goes further (includes
// Packing, which PO Tukang does not track).
export const ACTUAL_STAGES = [
  "knitting", "qc_rajut", "linking", "qc_linking",
  "finishing", "qc_finishing", "steam", "labelling", "qc_final",
];

export const ACTUAL_STAGE_LABELS = {
  knitting: "Rajut (Knitting)",
  qc_rajut: "QC Rajut",
  linking: "Linking",
  qc_linking: "QC Linking",
  finishing: "Finishing",
  qc_finishing: "QC Finishing",
  steam: "Steam",
  labelling: "Labelling",
  qc_final: "QC Final",
};

// Maps a PO Tukang work-order "tipe" to one of the stage keys above.
// "Aksesories" / "Aksesories - Plaket" are intentionally excluded (not part
// of the tracked sequence, per Yudi's instruction).
export const TIPE_TO_STAGE = {
  "Rajut": "knitting",
  "QC Rajut": "qc_rajut",
  "Linking": "linking",
  "QC Linking": "qc_linking",
  "Finishing": "finishing",
  "QC Finishing": "qc_finishing",
  "Steam": "steam",
  "Labelling": "labelling",
  "QC Final": "qc_final",
};
