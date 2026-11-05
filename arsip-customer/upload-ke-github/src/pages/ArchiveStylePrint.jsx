import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Printer, ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchStylePage, getSignedUrls, fmtDate, costRange, costTotal, labelOf, ENTRY_KINDS, LABEL_ITEMS, STAGES, isImage } from "@/lib/archive";

// One printable page for production: specs, program, latest photos, label & packing, approvals.
export default function ArchiveStylePrint() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [urls, setUrls] = useState({});

  useEffect(() => {
    fetchStylePage(id).then(async (d) => {
      setData(d);
      const latest = d.entries[0];
      const labelRows = [...d.label_exceptions, ...d.label_standard];
      const paths = [
        ...(latest?.media ?? []).filter((m) => isImage(m.mime)).slice(0, 6).map((m) => m.path),
        ...labelRows.flatMap((r) => r.media.filter((m) => isImage(m.mime)).slice(0, 3).map((m) => m.path)),
      ];
      setUrls(await getSignedUrls(paths));
    });
  }, [id]);

  if (!data) return <p className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Menyiapkan…</p>;
  const s = data.style, latest = data.entries[0];
  const program = data.programs.find((p) => p.is_latest) ?? data.programs[0];
  const labels = LABEL_ITEMS.map((def) => ({ def, row: data.label_exceptions.find((r) => r.item === def.value) ?? data.label_standard.find((r) => r.item === def.value) })).filter((x) => x.row);
  const total = costTotal(data.current_costs);

  return (
    <div className="mx-auto max-w-4xl bg-white p-6 text-[13px] text-black print:p-0">
      <style>{"@media print { @page { size: A4; margin: 12mm } .no-print { display: none !important } }"}</style>
      <div className="no-print mb-4 flex gap-2">
        <Button variant="outline" asChild><Link to={`/archive/style/${id}`}><ArrowLeft className="h-4 w-4" /> Kembali</Link></Button>
        <Button onClick={() => window.print()}><Printer className="h-4 w-4" /> Cetak / simpan PDF</Button>
      </div>

      <header className="mb-4 border-b pb-3">
        <p className="text-xs uppercase tracking-wide text-neutral-500">Paket re-order · dicetak {fmtDate(new Date().toISOString())}</p>
        <h1 className="text-2xl font-bold">{s.name}</h1>
        <p>{data.customer.customer_name} · {s.knitting_method === "machine" ? "Rajut mesin" : "Rajut manual"}{s.knitting_gauge ? ` · gauge ${s.knitting_gauge}` : ""}
          {latest ? ` · entri terakhir ${fmtDate(latest.entry_date)} (${labelOf(ENTRY_KINDS, latest.kind)}${latest.moq ? `, MOQ ${latest.moq}` : ""})` : ""}</p>
      </header>

      <section className="mb-4 grid grid-cols-2 gap-6">
        <div>
          <h2 className="mb-1 font-bold">Spek</h2>
          <table className="w-full"><tbody>{data.specs.map((sp) => <tr key={sp.id} className="border-b"><td className="py-1 pr-2 text-neutral-500">{sp.label}</td><td className="py-1 font-medium">{sp.value}</td></tr>)}</tbody></table>
          {data.spec_sheets[0] && <p className="mt-1">Spec sheet: v{data.spec_sheets[0].version} · {data.spec_sheets[0].name} ({fmtDate(data.spec_sheets[0].date)})</p>}
        </div>
        <div>
          <h2 className="mb-1 font-bold">Program mesin</h2>
          <p>{program ? `REV ${program.revision || "—"} · ${program.name} · order ${program.order_no || "—"} · ${fmtDate(program.date)}` : s.knitting_method === "manual" ? "Rajut manual" : "BELUM ADA PROGRAM"}</p>
          {data.can_see_cost && (
            <>
              <h2 className="mb-1 mt-3 font-bold">Biaya per pcs (PO Tukang, terbaru)</h2>
              <p>{STAGES.map((st) => `${st}: ${costRange(data.current_costs?.[st])}`).join(" · ")}</p>
              <p className="font-medium">Total: {total ? costRange(total) : "—"}</p>
            </>
          )}
        </div>
      </section>

      {latest && (
        <section className="mb-4">
          <h2 className="mb-1 font-bold">Foto entri terakhir ({fmtDate(latest.entry_date)})</h2>
          <div className="grid grid-cols-3 gap-2">
            {latest.media.filter((m) => urls[m.path]).slice(0, 6).map((m) => <img key={m.id} src={urls[m.path]} alt={m.category || ""} className="h-48 w-full rounded object-cover" />)}
          </div>
          {latest.notes && <p className="mt-1">{latest.notes}</p>}
        </section>
      )}

      <section className="mb-4 break-inside-avoid">
        <h2 className="mb-1 font-bold">Label, tag & packing</h2>
        {labels.length === 0 ? <p>Belum ada data.</p> : labels.map(({ def, row }) => (
          <div key={def.value} className="mb-2 flex gap-3 border-b pb-2">
            <div className="w-1/3"><p className="font-medium">{def.label}{row.style_id ? " (khusus style ini)" : ""}</p>
              <p className="text-neutral-600">{Object.entries(row.details || {}).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(" · ")}</p>
              {row.notes && <p className="text-neutral-600">{row.notes}</p>}</div>
            <div className="flex flex-1 gap-2">{row.media.filter((m) => urls[m.path]).slice(0, 3).map((m) => <img key={m.id} src={urls[m.path]} alt={m.caption || ""} className="h-28 w-28 rounded object-cover" />)}</div>
          </div>
        ))}
      </section>

      {data.notes.length > 0 && (
        <section className="break-inside-avoid">
          <h2 className="mb-1 font-bold">Persetujuan / catatan customer</h2>
          <ul className="list-disc pl-5">{data.notes.map((n) => <li key={n.id}>{fmtDate(n.note_date)} — {n.title}{n.summary ? `: ${n.summary}` : ""}</li>)}</ul>
        </section>
      )}
    </div>
  );
}
