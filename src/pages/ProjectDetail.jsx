import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft, Pencil, Trash2, Plus, Loader2, Truck, FileText, Package,
} from "lucide-react";
import { getProject, deleteProject } from "@/hooks/useProjects";
import { useActivities } from "@/hooks/useActivities";
import { usePurchaseOrders, deletePurchaseOrder } from "@/hooks/usePurchaseOrders";
import { useShipments, deleteShipment } from "@/hooks/useShipments";
import { useActualProgress, overallActualPercent, aggregateStageSums, toStagePercents } from "@/hooks/useActualProgress";
import { ACTUAL_STAGES, ACTUAL_STAGE_LABELS } from "@/lib/actualStages";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import ProjectFormDialog from "@/components/ProjectFormDialog";
import ProductionPanel from "@/components/ProductionPanel";
import FileManager from "@/components/FileManager";
import PhotoGallery from "@/components/PhotoGallery";
import NotesPanel from "@/components/NotesPanel";
import Timeline from "@/components/Timeline";
import PurchaseOrderDialog from "@/components/PurchaseOrderDialog";
import ShipmentDialog from "@/components/ShipmentDialog";
import EmptyState from "@/components/EmptyState";
import { StatusBadge, POBadge, ShipmentBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { formatDate, formatMoney, humanize } from "@/lib/utils";

function Stat({ label, value }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium">{value ?? "—"}</p>
    </div>
  );
}

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { toast } = useToast();

  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [poDialog, setPoDialog] = useState({ open: false, order: null });
  const [shipDialog, setShipDialog] = useState({ open: false, shipment: null });

  const { activities, loading: actLoading, refetch: refetchActs } = useActivities({ projectId: id });
  const { orders, refetch: refetchPOs } = usePurchaseOrders({ projectId: id });
  const { shipments, refetch: refetchShipments } = useShipments({ projectId: id });
  const [linkedSOs, setLinkedSOs] = useState([]);

  useEffect(() => {
    import("@/lib/supabase").then(({ supabase }) => {
      supabase.from("sales_orders").select("id, so_number, sales_order_lines(quantity)").eq("project_id", id)
        .then(({ data }) => setLinkedSOs(data ?? []));
    });
  }, [id]);

  const { bySo: actualBySo } = useActualProgress(linkedSOs.map((so) => so.so_number));

  // "% actual" now comes from confirmed tukang handovers (PO Tukang), not
  // manual entry — real ground truth, not a typed-in estimate.
  const soActualPercent = (so) => {
    const qty = (so.sales_order_lines || []).reduce((n, l) => n + (l.quantity || 0), 0);
    return overallActualPercent(actualBySo[so.so_number], qty);
  };

  // Aggregated across every linked SO, relative to the project's total qty —
  // used for the detailed per-stage breakdown below.
  const aggregatedSums = aggregateStageSums(actualBySo, linkedSOs.map((so) => so.so_number));
  const stagePercents = toStagePercents(aggregatedSums, project?.quantity);
  const overallPercent = overallActualPercent(aggregatedSums, project?.quantity);

  const load = useCallback(async () => {
    setLoading(true);
    try { setProject(await getProject(id)); }
    catch (e) { toast({ variant: "destructive", title: "Project not found", description: e.message }); }
    finally { setLoading(false); }
  }, [id, toast]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteProject(id);
      toast({ title: "Project deleted" });
      navigate("/projects");
    } catch (e) {
      toast({ variant: "destructive", title: "Delete failed", description: e.message });
      setDeleting(false);
    }
  };

  const removePO = async (po) => {
    try { await deletePurchaseOrder(po.id); refetchPOs(); toast({ title: "PO deleted" }); }
    catch (e) { toast({ variant: "destructive", title: "Delete failed", description: e.message }); }
  };
  const removeShipment = async (s) => {
    try { await deleteShipment(s.id); refetchShipments(); toast({ title: "Shipment deleted" }); }
    catch (e) { toast({ variant: "destructive", title: "Delete failed", description: e.message }); }
  };

  const afterProductionSave = () => { load(); refetchActs(); };

  if (loading) return <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>;
  if (!project) return null;

  return (
    <>
      <Link to="/projects" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to projects
      </Link>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{project.project_name}</h1>
            <StatusBadge status={project.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {project.project_number || "—"} ·{" "}
            <Link to={`/customers/${project.customer_id}`} className="hover:text-primary">
              {project.customers?.customer_name}
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setEditOpen(true)}><Pencil className="h-4 w-4" /> Edit</Button>
          {isAdmin && (
            <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => setConfirmOpen(true)}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex w-full flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="specs">Specifications</TabsTrigger>
          <TabsTrigger value="photos">Photos</TabsTrigger>
          <TabsTrigger value="files">Files</TabsTrigger>
          <TabsTrigger value="production">Production</TabsTrigger>
          <TabsTrigger value="shipping">Shipping</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview">
          {linkedSOs.length > 0 && (
            <Card className="mb-4 p-6">
              <h3 className="mb-3 text-sm font-semibold">Linked sales orders (production planning)</h3>
              <ul className="divide-y">
                {linkedSOs.map((so) => (
                  <li key={so.id} className="flex items-center justify-between py-2 text-sm">
                    <Link to="/planning" className="font-medium hover:text-primary">{so.so_number}</Link>
                    <span className="text-muted-foreground">{soActualPercent(so)}% actual</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">Progress entered in Planning updates this project automatically.</p>
            </Card>
          )}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="p-6 lg:col-span-1">
              <h3 className="mb-4 text-sm font-semibold">Project details</h3>
              <div className="grid gap-5">
                <Stat label="Product category" value={project.product_category ? humanize(project.product_category) : "—"} />
                <Stat label="Collection" value={project.collection_name} />
                <Stat label="Quantity" value={project.quantity} />
                <Stat label="Target price" value={project.target_price ? formatMoney(project.target_price, project.currency) : "—"} />
                <Stat label="Sampling date" value={formatDate(project.sampling_date)} />
                <Stat label="Production date" value={formatDate(project.production_date)} />
                <Stat label="Shipping date" value={formatDate(project.shipping_date)} />
                <Stat label="Created" value={formatDate(project.created_at)} />
              </div>
            </Card>
            <Card className="p-6 lg:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Progress — confirmed by tukang handover (PO Tukang)</h3>
                <span className="text-lg font-semibold text-primary">{overallPercent}%</span>
              </div>
              <Progress value={overallPercent} className="mb-5" />
              <div className="space-y-2.5">
                {ACTUAL_STAGES.map((stage) => (
                  <div key={stage} className="flex items-center gap-3">
                    <span className="w-28 shrink-0 text-xs text-muted-foreground">{ACTUAL_STAGE_LABELS[stage]}</span>
                    <Progress value={stagePercents[stage]} className="h-1.5" />
                    <span className="w-10 shrink-0 text-right text-xs font-medium">{stagePercents[stage]}%</span>
                  </div>
                ))}
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2 border-t pt-4 text-sm">
                <Stat label="Machine type" value={project.machine_type} />
                <Stat label="Yarn type" value={project.yarn_type} />
              </div>
            </Card>
          </div>
        </TabsContent>

        {/* SPECIFICATIONS */}
        <TabsContent value="specs">
          <Card className="p-6">
            <h3 className="mb-4 text-sm font-semibold">Specifications</h3>
            <div className="grid gap-5 sm:grid-cols-2">
              <Stat label="Product category" value={project.product_category ? humanize(project.product_category) : "—"} />
              <Stat label="Collection name" value={project.collection_name} />
              <Stat label="Quantity" value={project.quantity} />
              <Stat label="Target price" value={project.target_price ? formatMoney(project.target_price, project.currency) : "—"} />
              <Stat label="Yarn type" value={project.yarn_type} />
              <Stat label="Yarn supplier" value={project.yarn_supplier} />
              <Stat label="Gauge" value={project.gauge} />
              <Stat label="Machine type" value={project.machine_type} />
            </div>
            <p className="mt-6 text-xs text-muted-foreground">
              Detailed tech packs and measurement sheets can be uploaded in the Files tab (Tech Packs folder).
            </p>
          </Card>
        </TabsContent>

        {/* PHOTOS */}
        <TabsContent value="photos">
          <Card className="p-6"><PhotoGallery projectId={id} /></Card>
        </TabsContent>

        {/* FILES */}
        <TabsContent value="files">
          <Card className="p-6"><FileManager projectId={id} /></Card>
        </TabsContent>

        {/* PRODUCTION */}
        <TabsContent value="production">
          <Card className="p-6"><ProductionPanel project={project} onSaved={afterProductionSave} /></Card>
        </TabsContent>

        {/* SHIPPING */}
        <TabsContent value="shipping">
          <div className="space-y-6">
            <Card className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Purchase orders</h3>
                <Button size="sm" onClick={() => setPoDialog({ open: true, order: null })}>
                  <Plus className="h-4 w-4" /> Add PO
                </Button>
              </div>
              {orders.length === 0 ? (
                <EmptyState icon={FileText} title="No purchase orders" description="Record customer POs against this project." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>PO Number</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((po) => (
                      <TableRow key={po.id}>
                        <TableCell className="font-medium">{po.po_number || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{formatDate(po.po_date)}</TableCell>
                        <TableCell>{po.quantity ?? "—"}</TableCell>
                        <TableCell>{po.total_amount ? formatMoney(po.total_amount, po.currency) : "—"}</TableCell>
                        <TableCell><POBadge status={po.status} /></TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setPoDialog({ open: true, order: po })}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {isAdmin && (
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removePO(po)}>
                              <Trash2 className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>

            <Card className="p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Shipments</h3>
                <Button size="sm" onClick={() => setShipDialog({ open: true, shipment: null })}>
                  <Plus className="h-4 w-4" /> Add shipment
                </Button>
              </div>
              {shipments.length === 0 ? (
                <EmptyState icon={Truck} title="No shipments" description="Track couriers, tracking numbers and delivery status here." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Courier</TableHead>
                      <TableHead>Tracking</TableHead>
                      <TableHead>Destination</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shipments.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="text-muted-foreground">{formatDate(s.shipping_date)}</TableCell>
                        <TableCell>{s.courier || "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{s.tracking_number || "—"}</TableCell>
                        <TableCell>{s.destination_country || "—"}</TableCell>
                        <TableCell><ShipmentBadge status={s.status} /></TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShipDialog({ open: true, shipment: s })}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {isAdmin && (
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeShipment(s)}>
                              <Trash2 className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          </div>
        </TabsContent>

        {/* NOTES */}
        <TabsContent value="notes">
          <Card className="p-6"><NotesPanel projectId={id} /></Card>
        </TabsContent>

        {/* TIMELINE */}
        <TabsContent value="timeline">
          <Card className="p-6"><Timeline activities={activities} loading={actLoading} /></Card>
        </TabsContent>
      </Tabs>

      <ProjectFormDialog open={editOpen} onOpenChange={setEditOpen} project={project} onSaved={load} />
      <PurchaseOrderDialog
        open={poDialog.open}
        onOpenChange={(o) => setPoDialog((s) => ({ ...s, open: o }))}
        order={poDialog.order}
        projectId={id}
        customerId={project.customer_id}
        onSaved={() => { refetchPOs(); refetchActs(); }}
      />
      <ShipmentDialog
        open={shipDialog.open}
        onOpenChange={(o) => setShipDialog((s) => ({ ...s, open: o }))}
        shipment={shipDialog.shipment}
        projectId={id}
        customerId={project.customer_id}
        defaultCountry={project.customers?.country}
        onSaved={() => { refetchShipments(); refetchActs(); }}
      />

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete project?</DialogTitle>
            <DialogDescription>
              This permanently removes {project.project_name} and all its files, POs, shipments, notes and history. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />} Delete project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
