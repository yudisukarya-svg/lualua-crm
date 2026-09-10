import { STAGES, STAGE_LABELS } from "@/lib/scheduler";
import { formatDate } from "@/lib/utils";

const ACCENT = [156, 66, 33];

async function newDoc() {
  const { default: jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  return { doc: new jsPDF(), autoTable };
}

// One sheet per order — a traveller card the floor follows, with per-style stage targets.
export async function printOrderPlan(soId, schedule, raw) {
  const { doc, autoTable } = await newDoc();
  const so = schedule.orders.find((o) => o.id === soId);
  const jobs = Object.entries(schedule.jobDetails || {}).filter(([, d]) => d.soId === soId);

  doc.setFontSize(16);
  doc.text(`Production Plan — ${so?.soNumber || ""}`, 14, 18);
  doc.setFontSize(10); doc.setTextColor(120);
  doc.text(`${so?.customerName || ""}   ·   due ${so?.dueDate ? formatDate(so.dueDate) : "—"}   ·   forecast finish ${so?.completionDate ? formatDate(so.completionDate) : "—"}${so?.delayRisk ? "  (LATE)" : ""}`, 14, 25);
  doc.setTextColor(0);

  let y = 34;
  jobs.forEach(([jobId, d]) => {
    const styleId = jobId.split(":")[1];
    const st = raw.styles[styleId] || {};
    const isMachine = st.method === "machine";
    doc.setFontSize(11);
    doc.text(`${d.styleName} — ${isMachine ? `machine ${st.gauge || ""}g` : "manual"}  ·  ${d.quantity} pcs`, 14, y);

    const body = STAGES.map((s) => {
      const use = d.stagePeak?.[s] || 0;
      const rate = Number(s === "knitting" ? (isMachine ? st.knitting_machine : st.knitting_manual) : st[s]) || 0;
      const unit = s === "knitting" && isMachine ? "machine(s)" : "worker(s)";
      const perDay = use && rate ? use * rate : 0;
      return [
        STAGE_LABELS[s],
        use ? `${use} ${unit}` : "—",
        rate ? `${rate} pcs` : "— (set rate!)",
        perDay ? `${perDay} pcs` : "—",
        d.stageStart?.[s] ? formatDate(d.stageStart[s]) : "—",
        d.stageFinish?.[s] ? formatDate(d.stageFinish[s]) : "—",
      ];
    });
    autoTable(doc, {
      startY: y + 3,
      head: [["Stage", "Use", "Target / unit / day", "Target / day", "Start", "Finish"]],
      body, headStyles: { fillColor: ACCENT }, styles: { fontSize: 8 },
    });
    y = doc.lastAutoTable.finalY + 10;
    if (y > 250) { doc.addPage(); y = 18; }
  });

  if (jobs.length === 0) doc.text("No knitting/production lines on this order.", 14, y);
  doc.save(`plan-${so?.soNumber || soId}.pdf`);
}

// One daily sheet — every stage's targets for a single day.
export async function printDailySheet(schedule, dateStr) {
  const { doc, autoTable } = await newDoc();
  const day = (schedule.daily || []).find((d) => d.date === dateStr);

  doc.setFontSize(16);
  doc.text("Daily Production Targets", 14, 18);
  doc.setFontSize(10); doc.setTextColor(120);
  doc.text(formatDate(dateStr), 14, 25);
  doc.setTextColor(0);

  if (!day) {
    doc.setFontSize(11);
    doc.text("No production scheduled for this day (non-working day or outside the plan).", 14, 36);
    doc.save(`daily-${dateStr}.pdf`);
    return;
  }

  let y = 32, any = false;
  STAGES.forEach((s) => {
    const alloc = day.util[s]?.alloc || [];
    if (!alloc.length) return;
    any = true;
    doc.setFontSize(11);
    doc.text(STAGE_LABELS[s], 14, y);
    const body = alloc.map((a) => [
      a.soNumber, a.styleName,
      `${a.count} ${a.unit === "machines" ? "machine(s)" : "worker(s)"}${a.pool && a.pool !== "-" && a.pool !== "Manual" ? ` (${a.pool})` : ""}`,
      `${a.pieces} pcs`,
    ]);
    autoTable(doc, {
      startY: y + 3, head: [["Order", "Style", "Use", "Target today"]], body,
      headStyles: { fillColor: ACCENT }, styles: { fontSize: 8 },
    });
    y = doc.lastAutoTable.finalY + 8;
    if (y > 250) { doc.addPage(); y = 18; }
  });
  if (!any) doc.text("Nothing scheduled to run on this day.", 14, 36);
  doc.save(`daily-${dateStr}.pdf`);
}

const INK_DARK = [55, 55, 58];
const INK_MED = [120, 120, 125];
const INK_LIGHT = [185, 185, 189];

function fitText(doc, text, maxWidth) {
  const t = String(text ?? "");
  if (!t) return "";
  if (doc.getTextWidth(t) <= maxWidth) return t;
  let s = t;
  while (s.length > 1 && doc.getTextWidth(s + "…") > maxWidth) s = s.slice(0, -1);
  return s + "…";
}

// A single knitting/reservation "chip" inside a machine card — mirrors the block cards on screen.
function drawChip(doc, x, y, w, h, accent, { line1Left, line1Right, line2, line3, line4 }) {
  doc.setFillColor(250, 250, 251);
  doc.setDrawColor(224, 224, 228);
  doc.roundedRect(x, y, w, h, 1.6, 1.6, "FD");
  doc.setFillColor(...accent);
  doc.roundedRect(x, y, 2.8, h, 1.6, 1.6, "F");

  const tx = x + 6.5;
  const maxW = w - 6.5 - 3;
  let ty = y + 6.4;

  doc.setFont(undefined, "bold"); doc.setFontSize(11.5); doc.setTextColor(28, 28, 30);
  doc.text(fitText(doc, line1Left, maxW - 26), tx, ty);
  doc.setFont(undefined, "normal"); doc.setFontSize(10); doc.setTextColor(95, 95, 100);
  doc.text(String(line1Right || ""), x + w - 3, ty, { align: "right" });

  ty += 5.2;
  doc.setFontSize(9.2); doc.setTextColor(122, 122, 128);
  doc.text(fitText(doc, line2, maxW), tx, ty);

  ty += 4.7;
  doc.setTextColor(80, 80, 85);
  doc.text(fitText(doc, line3, maxW), tx, ty);

  ty += 4.7;
  doc.setTextColor(...INK_DARK);
  doc.text(fitText(doc, line4, maxW), tx, ty);
  doc.setTextColor(0, 0, 0);
}

// Machine loading sheet — printed as a two-column card board (same shape as the on-screen
// Machine Board) rather than a plain table, with customer name shown on each order.
// Grayscale only — no color fills, so it prints cleanly on any printer.
export async function printMachineBoard({ machines, board, blocks, soById, styleNameFn, reservations = [], stylesMap = {} }) {
  const { doc } = await newDoc();
  const PAGE_W = 210, MARGIN = 14, GAP = 6, PAGE_BOTTOM = 283;
  const colWidth = (PAGE_W - 2 * MARGIN - GAP) / 2;
  const colX = [MARGIN, MARGIN + colWidth + GAP];
  const HEADER_H = 11.5, PAD = 3.2, CHIP_H = 25, CHIP_GAP = 2;

  const drawTitle = () => {
    doc.setFontSize(18); doc.setTextColor(0);
    doc.text("Machine Loading — Knitting", MARGIN, 19);
    doc.setFontSize(11); doc.setTextColor(120);
    doc.text(`Printed ${formatDate(new Date().toISOString().slice(0, 10))}`, MARGIN, 27);
    doc.setTextColor(0);
  };
  drawTitle();
  let colY = [37, 37];

  const datesByBlock = {}; (board || []).forEach((b) => { datesByBlock[b.blockId] = b; });
  const blocksByMachine = {}; (blocks || []).forEach((b) => { (blocksByMachine[b.machine_id] = blocksByMachine[b.machine_id] || []).push(b); });
  const gaugeLabel = { "5": "5G", "7": "7G", "12": "12G" };

  const sortedMachines = ["5", "7", "12"].flatMap((g) => (machines || []).filter((m) => m.gauge === g));

  sortedMachines.forEach((m) => {
    const q = (blocksByMachine[m.id] || []).sort((a, b) => a.seq - b.seq);
    const resv = (reservations || []).filter((r) => r.machine_id === m.id).sort((a, b) => a.date.localeCompare(b.date));
    const chipCount = q.length + resv.length;
    const cardH = HEADER_H + PAD + (chipCount > 0 ? chipCount * CHIP_H + (chipCount - 1) * CHIP_GAP : 8) + PAD;

    let col = colY[0] <= colY[1] ? 0 : 1;
    if (colY[col] + cardH > PAGE_BOTTOM) {
      doc.addPage(); colY = [37, 37]; col = 0;
    }
    const x = colX[col]; let y = colY[col];

    const headerFill = m.active ? INK_DARK : INK_LIGHT;
    doc.setFillColor(255, 255, 255); doc.setDrawColor(224, 224, 228);
    doc.roundedRect(x, y, colWidth, cardH, 2.2, 2.2, "FD");
    doc.setFillColor(...headerFill);
    doc.roundedRect(x, y, colWidth, HEADER_H, 2.2, 2.2, "F");
    doc.rect(x, y + HEADER_H - 2.2, colWidth, 2.2, "F"); // square off the bottom of the header bar
    doc.setFontSize(12.5); doc.setFont(undefined, "bold");
    doc.setTextColor(...(m.active ? [255, 255, 255] : [55, 55, 58]));
    doc.text(fitText(doc, `${m.name}  ·  ${gaugeLabel[m.gauge] || ""}${m.active ? "" : "  BROKEN"}`, colWidth - 7), x + 4.5, y + 7.8);
    doc.setFont(undefined, "normal"); doc.setTextColor(0, 0, 0);

    let cy = y + HEADER_H + PAD;
    if (chipCount === 0) {
      doc.setFontSize(10); doc.setTextColor(150, 150, 155);
      doc.text("Idle — no work", x + 5.5, cy + 4.5);
      doc.setTextColor(0, 0, 0);
    } else {
      q.forEach((b, i) => {
        const d = datesByBlock[b.id] || {};
        const so = soById[b.sales_order_id];
        const rate = stylesMap[b.style_id]?.knitting_machine || 0;
        let daySpan = null;
        if (d.start && d.finish) daySpan = Math.round((new Date(d.finish + "T00:00:00") - new Date(d.start + "T00:00:00")) / 86400000) + 1;
        const cap = rate > 0 ? `${rate} pcs/day${daySpan ? ` · ~${daySpan}d` : ""}` : "";
        drawChip(doc, x + 3, cy, colWidth - 6, CHIP_H, INK_DARK, {
          line1Left: `#${i + 1}  ${so?.so_number || "—"}`,
          line1Right: `${b.qty} pcs`,
          line2: so?.customers?.customer_name || "—",
          line3: `${styleNameFn(b.style_id)}${cap ? "  ·  " + cap : ""}`,
          line4: `${d.start ? formatDate(d.start) : "—"}  →  ${d.finish ? formatDate(d.finish) : "—"}`,
        });
        cy += CHIP_H + CHIP_GAP;
      });
      resv.forEach((r) => {
        drawChip(doc, x + 3, cy, colWidth - 6, CHIP_H, INK_MED, {
          line1Left: r.kind === "sample" ? "Sample" : (r.kind || "Reserved"),
          line1Right: `${r.hours}h`,
          line2: r.so_number || "—",
          line3: `${r.style_name || ""}${r.label ? "  ·  " + r.label : ""}`,
          line4: formatDate(r.date),
        });
        cy += CHIP_H + CHIP_GAP;
      });
    }

    colY[col] = y + cardH + GAP;
  });

  doc.save(`machine-loading-${new Date().toISOString().slice(0, 10)}.pdf`);
}
