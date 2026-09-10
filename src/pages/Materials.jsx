import { useState, useEffect } from "react";
import { Package } from "lucide-react";
import { useSchedule } from "@/hooks/useSchedule";
import { getAllBoms } from "@/hooks/useYarns";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

// Yarn needed for one sales order: grams_per_pc × qty × (1 + wastage%), summed per yarn.
function requirementFor(so, styles, boms) {
  const byYarn = {};
  (so.sales_order_lines || []).forEach((l) => {
    const bom = boms[l.style_id] || [];
    const wastage = (styles[l.style_id]?.wastage || 0) / 100;
    const qty = Number(l.quantity) || 0;
    bom.forEach((b) => {
      const grams = (Number(b.grams_per_pc) || 0) * qty * (1 + wastage);
      const key = b.yarn_id;
      if (!byYarn[key]) byYarn[key] = { name: b.yarns?.name || "—", colour: b.yarns?.colour || "", unit: b.yarns?.unit || "kg", grams: 0 };
      byYarn[key].grams += grams;
    });
  });
  return Object.values(byYarn);
}

export default function Materials() {
  const { raw, loading } = useSchedule();
  const [boms, setBoms] = useState({});

  useEffect(() => { getAllBoms().then(setBoms); }, []);

  if (loading) return <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>;

  const orders = (raw?.salesOrders ?? []).filter((so) => so.status !== "cancelled" && so.status !== "done");
  const rows = orders.map((so) => ({ so, yarns: requirementFor(so, raw.styles, boms) }));
  const anyYarn = rows.some((r) => r.yarns.length > 0);

  return (
    <>
      <PageHeader title="Yarn requirements" subtitle="How much yarn each order needs (includes wastage). Check stock in YarnTrack." />

      {orders.length === 0 ? (
        <EmptyState icon={Package} title="No active orders" description="Sales orders appear here with their yarn needs once they have styles with a bill of materials." />
      ) : !anyYarn ? (
        <Card className="p-6 text-sm text-muted-foreground">
          No yarn requirements yet. Add yarns to your styles (Styles → edit → "Yarn (bill of materials)") to see how much each order needs.
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map(({ so, yarns }) => (
            <Card key={so.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">
                  {so.so_number} <span className="font-normal text-muted-foreground">· {so.customers?.customer_name || "—"}</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {yarns.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No yarn defined for this order's styles.</p>
                ) : (
                  <ul className="space-y-1.5 text-sm">
                    {yarns.map((y, i) => (
                      <li key={i} className="flex items-center justify-between">
                        <span>{y.name}{y.colour ? ` · ${y.colour}` : ""}</span>
                        <span className="font-medium">{(y.grams / 1000).toFixed(2)} {y.unit}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <p className="mt-3 text-xs text-muted-foreground">Amounts include each style's wastage %. Stock is checked manually in YarnTrack for now.</p>
    </>
  );
}
