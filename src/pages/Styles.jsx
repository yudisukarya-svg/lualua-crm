import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Shapes, Search, X } from "lucide-react";
import { useStyles, deleteStyle } from "@/hooks/useStyles";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import StyleFormDialog from "@/components/StyleFormDialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const COLS = [
  ["knitting_manual", "Knit Man."], ["knitting_machine", "Knit Mac."], ["linking", "Link"],
  ["finishing", "Finish"], ["steam", "Steam"], ["label", "Label"], ["qc", "QC"], ["packing", "Pack"],
];

export default function Styles() {
  const { styles, loading, refetch } = useStyles();
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [dialog, setDialog] = useState({ open: false, style: null });
  const [q, setQ] = useState("");
  const [customer, setCustomer] = useState("");
  const [method, setMethod] = useState("");
  const [limit, setLimit] = useState(100);

  const customers = useMemo(() => [...new Set(styles.map((s) => s.customers?.customer_name).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b)), [styles]);

  // Every typed word must appear in the style name, customer or gauge (order doesn't matter)
  const filtered = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return styles.filter((s) => {
      if (customer && (s.customers?.customer_name || "") !== customer) return false;
      if (method && s.knitting_method !== method) return false;
      if (!words.length) return true;
      const hay = [s.name, s.customers?.customer_name, s.knitting_gauge && `${s.knitting_gauge}g gauge ${s.knitting_gauge}`,
        s.knitting_method === "machine" ? "machine mesin" : "manual"].filter(Boolean).join(" ").toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [styles, q, customer, method]);
  const shown = filtered.slice(0, limit);
  const resetLimit = () => setLimit(100);

  const remove = async (s) => {
    try { await deleteStyle(s.id); refetch(); toast({ title: "Style deleted" }); }
    catch (e) { toast({ variant: "destructive", title: "Delete failed", description: e.message }); }
  };

  return (
    <>
      <PageHeader title="Styles" subtitle="Production speed per stage for each style (pcs per worker/machine per day)">
        <Button onClick={() => setDialog({ open: true, style: null })}><Plus className="h-4 w-4" /> New style</Button>
      </PageHeader>

      {loading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
      ) : styles.length === 0 ? (
        <EmptyState icon={Shapes} title="No styles yet" description="Create your first style so the scheduler knows how fast each stage runs." />
      ) : (
        <>
        <Card className="mb-4 p-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input autoFocus className="pl-9 pr-9" aria-label="Cari style" placeholder="Cari style atau customer… (mis. rita skirt, cardigan maisxfrida, 12g)"
                value={q} onChange={(e) => { setQ(e.target.value); resetLimit(); }} />
              {q && <button type="button" aria-label="Hapus pencarian" onClick={() => { setQ(""); resetLimit(); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>}
            </div>
            <select aria-label="Filter customer" value={customer} onChange={(e) => { setCustomer(e.target.value); resetLimit(); }}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm md:w-56">
              <option value="">Semua customer</option>
              {customers.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select aria-label="Filter metode rajut" value={method} onChange={(e) => { setMethod(e.target.value); resetLimit(); }}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm md:w-40">
              <option value="">Mesin & manual</option>
              <option value="machine">Mesin</option>
              <option value="manual">Manual</option>
            </select>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {filtered.length === styles.length ? `${styles.length} style` : `${filtered.length} dari ${styles.length} style`}
            {filtered.length > shown.length ? ` · menampilkan ${shown.length} pertama` : ""}
          </p>
        </Card>
        {filtered.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Tidak ada style yang cocok.</p>
        ) : (
        <Card className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[160px]">Style</TableHead>
                <TableHead className="min-w-[120px]">Customer</TableHead>
                <TableHead>Knitting</TableHead>
                {COLS.map(([k, l]) => <TableHead key={k} className="text-center">{l}</TableHead>)}
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="text-muted-foreground">{s.customers?.customer_name || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {s.knitting_method === "machine" ? `Machine ${s.knitting_gauge ? s.knitting_gauge + "g" : ""}` : "Manual"}
                  </TableCell>
                  {COLS.map(([k]) => {
                    const skipped = Array.isArray(s.skip_stages) && s.skip_stages.includes(k);
                    return (
                      <TableCell key={k} className="text-center text-muted-foreground">
                        {skipped ? <span title="No process for this style">—</span> : Number(s[k]) || 0}
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDialog({ open: true, style: s })}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {isAdmin && (
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove(s)}>
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
        )}
        {filtered.length > shown.length && (
          <div className="mt-3 flex justify-center">
            <Button variant="outline" onClick={() => setLimit((n) => n + 200)}>Tampilkan lebih banyak ({filtered.length - shown.length} lagi)</Button>
          </div>
        )}
        </>
      )}

      <StyleFormDialog
        open={dialog.open}
        onOpenChange={(o) => setDialog((s) => ({ ...s, open: o }))}
        style={dialog.style}
        onSaved={refetch}
      />
    </>
  );
}
