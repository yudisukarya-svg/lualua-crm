import { useState } from "react";
import { Plus, Pencil, Trash2, Shapes } from "lucide-react";
import { useStyles, deleteStyle } from "@/hooks/useStyles";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import StyleFormDialog from "@/components/StyleFormDialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
              {styles.map((s) => (
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

      <StyleFormDialog
        open={dialog.open}
        onOpenChange={(o) => setDialog((s) => ({ ...s, open: o }))}
        style={dialog.style}
        onSaved={refetch}
      />
    </>
  );
}
