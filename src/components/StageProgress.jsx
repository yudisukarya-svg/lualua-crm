import { ACTUAL_STAGES, ACTUAL_STAGE_LABELS } from "@/lib/actualStages";

// 9 small segments (Rajut -> QC Final), each filled proportionally to its own
// % complete, based on confirmed tukang handovers (PO Tukang). No data yet
// for a project -> all segments render empty, rather than guessing.
export default function StageProgress({ data }) {
  return (
    <div className="flex items-center gap-0.5" title={ACTUAL_STAGES.map((s) => `${ACTUAL_STAGE_LABELS[s]}: ${data?.[s] ?? 0}%`).join(" · ")}>
      {ACTUAL_STAGES.map((s) => {
        const pct = Math.min(100, Math.max(0, data?.[s] ?? 0));
        return (
          <div key={s} className="h-2.5 w-3 overflow-hidden rounded-sm bg-secondary">
            <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
        );
      })}
    </div>
  );
}
