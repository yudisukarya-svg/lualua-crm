import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Plus, Copy, Check, Download, Printer, Pencil, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import MediaGrid, { openMedia } from "@/components/archive/MediaGrid";
import { EntryDialog, SpecDialog, DocDialog, ProgramDialog, NoteDialog } from "@/components/archive/Dialogs";
import {
  fetchStylePage, fmtDate, formatBytes, costRange, costTotal, labelOf, ENTRY_KINDS, LABEL_ITEMS, stageList, programUrl,
} from "@/lib/archive";
import { cn } from "@/lib/utils";

export default function ArchiveStyle() {
  const { id } = useParams();
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [order, setOrder] = useState("new");
  const [dlg, setDlg] = useState(null); // "entry" | {entry} | "spec" | "sheet" | "file" | "program" | "note"
  const [copied, setCopied] = useState(false);
  const load = useCallback(() => fetchStylePage(id).then(setData).catch((e) => setError(e.message)), [id]);
  useEffect(() => { load(); }, [load]);

  const entries = useMemo(() => {
    const e = data?.entries ?? [];
    return order === "new" ? e : [...e].reverse();
  }, [data, order]);

  if (error) return <EmptyState title="Gagal memuat" description={error} />;
  if (!data) return <p className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Memuat…</p>;
  if (!data.style) return <EmptyState title="Style tidak ditemukan" />;

  const s = data.style, cust = data.customer;
  const latestSheet = data.spec_sheets[0];
  const latestProgram = data.programs.find((p) => p.is_latest) ?? data.programs[0];
  const labelMerged = LABEL_ITEMS.map((def) => ({
    def,
    row: data.label_exceptions.find((r) => r.item === def.value) ?? data.label_standard.find((r) => r.item === def.value),
    isException: !!data.label_exceptions.find((r) => r.item === def.value),
  }));
  const hasPhotos = data.entries.some((e) => e.media.length);
  const openNotes = data.notes.filter((n) => n.status === "open");
  const readiness = [
    { ok: data.specs.length > 0 || !!latestSheet, label: latestSheet ? `Spek & spec sheet v${latestSheet.version}` : "Spek / spec sheet" },
    { ok: data.programs.length > 0 || s.knitting_method === "manual", label: latestProgram ? `Program mesin REV ${latestProgram.revision || "—"}` : s.knitting_method === "manual" ? "Rajut manual (tanpa program)" : "Program mesin" },
    { ok: hasPhotos, label: "Foto sample / produksi" },
    { ok: labelMerged.some((x) => x.row), label: "Label & packing" },
    ...(data.can_see_cost ? [{ ok: !!costTotal(data.current_costs), label: "Biaya per proses (PO Tukang)" }] : []),
    { ok: data.notes.length > 0, label: "Screenshot persetujuan customer", warnOnly: true },
  ];

  async function copySummary() {
    const lines = [
      `*${s.name}* — ${cust.customer_name}`,
      ...data.specs.map((sp) => `${sp.label}: ${sp.value ?? "-"}`),
      ...labelMerged.filter((x) => x.row).map((x) => `${x.def.label}: ${Object.values(x.row.details || {}).filter(Boolean).join(", ")}`),
    ];
    const text = lines.join("\n");
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { toast({ title: "Salin manual", description: text }); }
  }

  return (
    <>
      <Link to={`/archive/customer/${cust.id}`} className="mb-3 inline-flex items-center gap-1 text-sm text-primary hover:underline"><ArrowLeft className="h-4 w-4" /> {cust.customer_name}</Link>
      <PageHeader title={s.name}
        subtitle={[cust.customer_name, s.knitting_method === "machine" ? "Rajut mesin" : s.knitting_method === "manual" ? "Rajut manual" : null, s.knitting_gauge && `gauge ${s.knitting_gauge}`, `${data.entries.length} entri riwayat`].filter(Boolean).join(" · ")}>
        <Button variant="outline" onClick={copySummary}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} Salin ringkasan WA</Button>
        <Button onClick={() => setDlg("entry")}><Plus className="h-4 w-4" /> Entri baru</Button>
      </PageHeader>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* ---------- Riwayat ---------- */}
        <section aria-label="Riwayat" className="min-w-0 flex-[3] space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Riwayat</h2>
            <div role="group" aria-label="Urutkan" className="flex overflow-hidden rounded-md border">
              {[["new", "Terbaru dulu"], ["old", "Terlama dulu"]].map(([v, l]) => (
                <button key={v} aria-pressed={order === v} onClick={() => setOrder(v)}
                  className={cn("px-3 py-1.5 text-sm", order === v ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}>{l}</button>
              ))}
            </div>
          </div>
          {entries.length === 0 ? (
            <EmptyState title="Belum ada entri" description="Setiap sample, revisi, produksi atau re-order dicatat sebagai entri bertanggal, lengkap dengan foto."
              action={<Button onClick={() => setDlg("entry")}><Plus className="h-4 w-4" /> Entri pertama</Button>} />
          ) : entries.map((e, i) => {
            const total = costTotal(e.costs);
            const isCurrent = e.id === data.entries[0].id;
            return (
              <article key={e.id} className="flex gap-3">
                <div className="flex w-3 flex-col items-center pt-2">
                  <span className={cn("h-3 w-3 rounded-full", isCurrent ? "bg-primary" : "bg-border")} />
                  {i < entries.length - 1 && <span className="mt-1 w-0.5 flex-1 bg-border" />}
                </div>
                <Card className="mb-1 min-w-0 flex-1 space-y-3 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{fmtDate(e.entry_date)}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{labelOf(ENTRY_KINDS, e.kind)}</span>
                      {isCurrent && <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-900">Terbaru</span>}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {e.by && <span>diinput {e.by}</span>}
                      <Button size="sm" variant="ghost" aria-label="Ubah entri" onClick={() => setDlg({ entry: e })}><Pencil className="h-4 w-4" /></Button>
                    </div>
                  </div>
                  <MediaGrid media={e.media} size="md" empty={<p className="text-sm text-muted-foreground">Belum ada foto untuk entri ini.</p>} />
                  <div className="flex flex-wrap gap-3">
                    <div className="min-w-[120px] rounded-md bg-primary/10 px-3 py-2">
                      <p className="text-xs text-muted-foreground">MOQ</p>
                      <p className="text-lg font-bold text-primary">{e.moq ? `${e.moq} pcs` : "—"}</p>
                    </div>
                    {data.can_see_cost && (
                      <div className="min-w-[280px] flex-1">
                        {e.costs ? (
                          <div className="flex flex-wrap gap-1.5 text-sm">
                            {stageList(e.costs).map((st) => (
                              <span key={st} className="rounded-md border bg-background px-2 py-1">
                                <span className="text-xs text-muted-foreground">{st}</span>{" "}
                                <span className="font-medium">{st === "Rajut" && Number(e.costs[st].max) === 0 ? "mesin" : costRange(e.costs[st])}</span>
                              </span>
                            ))}
                            <span className="rounded-md bg-primary/10 px-2 py-1 font-semibold text-primary">Total {costRange(total)}</span>
                          </div>
                        ) : <p className="text-sm text-muted-foreground">—</p>}
                        <p className="mt-1.5 text-xs text-green-800">
                          {e.costs ? `Ongkos tukang per pcs dari PO Tukang yang berlaku ${fmtDate(e.entry_date)}` : "Belum ada PO Tukang sebelum tanggal ini."}
                        </p>
                      </div>
                    )}
                  </div>
                  {e.notes && <p className="text-sm">{e.notes}</p>}
                </Card>
              </article>
            );
          })}
        </section>

        {/* ---------- Samping ---------- */}
        <aside className="flex min-w-0 flex-[2] flex-col gap-4">
          {data.can_see_cost && (
            <Card className="p-4">
              <h2 className="mb-1 font-semibold">Ongkos tukang per pcs (terkini)</h2>
              <p className="mb-2 text-xs text-muted-foreground">Dari PO Tukang, ongkos terakhir per proses. Hanya terlihat oleh admin & sales.</p>
              {!data.current_costs ? <p className="text-sm text-muted-foreground">Belum ada PO Tukang untuk style ini.</p> : (
                <table className="w-full text-sm">
                  <tbody>
                    {stageList(data.current_costs).map((st) => (
                      <tr key={st} className="border-b last:border-0">
                        <td className="py-1.5 pr-2 text-muted-foreground">{st}</td>
                        <td className="py-1.5 pr-2 text-right font-medium">{st === "Rajut" && Number(data.current_costs[st].max) === 0 ? "mesin" : costRange(data.current_costs[st])}</td>
                        <td className="whitespace-nowrap py-1.5 text-right text-xs text-muted-foreground">{data.current_costs[st].so} · {fmtDate(data.current_costs[st].date)}</td>
                      </tr>
                    ))}
                    <tr><td className="pt-2 font-semibold">Total</td><td className="pt-2 text-right font-semibold text-primary">{costRange(costTotal(data.current_costs))}</td><td /></tr>
                  </tbody>
                </table>
              )}
            </Card>
          )}
          <Card className="border-green-200 bg-green-50/70 p-4">
            <h2 className="mb-2 font-semibold text-green-900">Kesiapan re-order</h2>
            <ul className="space-y-1.5 text-sm">
              {readiness.map((r) => (
                <li key={r.label} className={cn("flex items-center gap-2", r.ok ? "text-green-900" : "text-amber-900")}>
                  {r.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}{r.label}{!r.ok && " — belum ada"}
                </li>
              ))}
            </ul>
            <Button asChild className="mt-3 w-full"><Link to={`/archive/style/${s.id}/print`}><Printer className="h-4 w-4" /> Cetak paket re-order</Link></Button>
          </Card>

          <Card className="space-y-2 p-4">
            <div className="flex items-center justify-between"><h2 className="font-semibold">Program mesin</h2>
              <Button size="sm" variant="outline" onClick={() => setDlg("program")}><Plus className="h-4 w-4" /> Tautkan</Button></div>
            {data.programs.length === 0 ? <p className="text-sm text-muted-foreground">{s.knitting_method === "manual" ? "Style rajut manual." : "Belum ada program tertaut."}</p> : (
              <ul className="divide-y text-sm">
                {data.programs.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                    <span className="min-w-0">
                      <span className="font-medium">REV {p.revision || "—"}</span>{p.is_latest && <span className="ml-1 rounded-full bg-green-100 px-1.5 text-xs text-green-900">terbaru</span>}
                      <span className="block truncate text-xs text-muted-foreground">{p.name} · order {p.order_no || "—"} · {fmtDate(p.date)} · {formatBytes(p.size)}</span>
                    </span>
                    <Button size="sm" variant="outline" asChild><a href={programUrl(p.path)} download><Download className="h-4 w-4" /> Unduh</a></Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="space-y-1 p-4">
            <div className="mb-1 flex items-center justify-between"><h2 className="font-semibold">Spek</h2>
              <Button size="sm" variant="outline" onClick={() => setDlg("spec")}>{data.specs.length ? "Ubah" : "Isi spek"}</Button></div>
            {data.specs.length === 0 ? <p className="text-sm text-muted-foreground">Belum diisi.</p> : (
              <dl className="divide-y text-sm">
                {data.specs.map((sp) => (
                  <div key={sp.id} className="flex justify-between gap-3 py-1.5"><dt className="text-muted-foreground">{sp.label}</dt><dd className="text-right font-medium">{sp.value || "—"}</dd></div>
                ))}
              </dl>
            )}
          </Card>

          <Card className="space-y-2 p-4">
            <div className="flex items-center justify-between"><h2 className="font-semibold">Spec sheet</h2>
              <Button size="sm" variant="outline" onClick={() => setDlg("sheet")}><Plus className="h-4 w-4" /> Upload versi baru</Button></div>
            {data.spec_sheets.length === 0 ? <p className="text-sm text-muted-foreground">Belum ada spec sheet.</p> : (
              <ul className="divide-y text-sm">
                {data.spec_sheets.map((m, i) => (
                  <li key={m.id} className="flex items-center justify-between gap-2 py-2">
                    <button className="min-w-0 truncate text-left hover:underline" onClick={() => openMedia(m)}><b>v{m.version}</b> · {m.name}</button>
                    <span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-xs", i === 0 ? "bg-green-100 text-green-900" : "text-muted-foreground")}>{i === 0 ? "Terbaru · " : ""}{fmtDate(m.date)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="space-y-2 border-amber-200 bg-amber-50/60 p-4">
            <div className="flex items-center justify-between"><h2 className="font-semibold">Label & packing</h2>
              <Link to={`/archive/customer/${cust.id}?tab=label`} className="text-sm text-primary hover:underline">Foto & detail</Link></div>
            {labelMerged.every((x) => !x.row) ? <p className="text-sm text-muted-foreground">Belum ada standar label & packing untuk customer ini.</p> : (
              <ul className="space-y-1 text-sm">
                {labelMerged.filter((x) => x.row).map((x) => (
                  <li key={x.def.value}><span className="font-medium">{x.def.label}</span>{x.isException && <span className="ml-1 rounded-full bg-amber-200 px-1.5 text-xs">pengecualian</span>}
                    <span className="block text-muted-foreground">{Object.values(x.row.details || {}).filter(Boolean).join(" · ") || x.row.notes || "—"}</span></li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="space-y-2 p-4">
            <div className="flex items-center justify-between"><h2 className="font-semibold">Percakapan & catatan</h2>
              <Button size="sm" variant="outline" onClick={() => setDlg("note")}><Plus className="h-4 w-4" /> Simpan</Button></div>
            {data.notes.length === 0 ? <p className="text-sm text-muted-foreground">Belum ada.</p> : (
              <ul className="divide-y text-sm">
                {data.notes.map((n) => (
                  <li key={n.id} className="space-y-1 py-2">
                    <p><span className="text-muted-foreground">{fmtDate(n.note_date)} · </span>{n.title}
                      {n.status === "open" && <span className="ml-1 rounded-full bg-amber-100 px-1.5 text-xs text-amber-900">aktif</span>}</p>
                    {(n.body || n.summary) && <p className="line-clamp-3 whitespace-pre-wrap break-words text-muted-foreground">{n.body || n.summary}</p>}
                    {n.links?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {n.links.map((l, i) => (
                          <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" title={l.url}
                            className="max-w-full truncate rounded-full border px-2 py-0.5 text-xs text-primary hover:bg-muted">
                            {l.label || (() => { try { return new URL(l.url).hostname.replace(/^www\./, ""); } catch { return l.url; } })()} ↗</a>
                        ))}
                      </div>
                    )}
                    <MediaGrid media={n.media} size="sm" />
                  </li>
                ))}
              </ul>
            )}
            {openNotes.length > 0 && <p className="text-xs text-amber-900">{openNotes.length} catatan masih relevan.</p>}
          </Card>

          <Card className="space-y-2 p-4">
            <div className="flex items-center justify-between"><h2 className="font-semibold">SO dari Zoho</h2>
              <Button size="sm" variant="outline" onClick={() => setDlg("file")}><Plus className="h-4 w-4" /> File lain</Button></div>
            {data.sos.length === 0 ? <p className="text-sm text-muted-foreground">Belum ada SO dengan nama item ini.</p> : (
              <ul className="space-y-1 text-sm">{data.sos.map((o) => <li key={o.so_number}>{o.so_number} · {o.status} · {fmtDate(o.so_date)}</li>)}</ul>
            )}
            {data.files.length > 0 && <MediaGrid media={data.files} size="sm" />}
          </Card>
        </aside>
      </div>

      <EntryDialog open={dlg === "entry" || !!dlg?.entry} onOpenChange={(v) => !v && setDlg(null)} style={s} customerId={cust.id} entry={dlg?.entry} onSaved={load} />
      <SpecDialog open={dlg === "spec"} onOpenChange={(v) => !v && setDlg(null)} style={s} specs={data.specs} onSaved={load} />
      <DocDialog open={dlg === "sheet"} onOpenChange={(v) => !v && setDlg(null)} customerId={cust.id} styleId={s.id} section="spec_sheet" title={`Spec sheet · ${s.name}`} onSaved={load} />
      <DocDialog open={dlg === "file"} onOpenChange={(v) => !v && setDlg(null)} customerId={cust.id} styleId={s.id} section="file" title={`File lain · ${s.name}`} onSaved={load} />
      <ProgramDialog open={dlg === "program"} onOpenChange={(v) => !v && setDlg(null)} style={s} customerName={cust.customer_name} suggestions={data.program_suggestions} onSaved={load} />
      <NoteDialog mode="catatan" open={dlg === "note"} onOpenChange={(v) => !v && setDlg(null)} customerId={cust.id} styles={[{ id: s.id, name: s.name }]} defaultStyleId={s.id} onSaved={load} />
    </>
  );
}
