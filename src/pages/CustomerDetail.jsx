import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft, Pencil, Trash2, Plus, Mail, Phone, Globe, MapPin, MessageCircle, Loader2,
} from "lucide-react";
import { getCustomer, deleteCustomer } from "@/hooks/useCustomers";
import { useProjects } from "@/hooks/useProjects";
import { useActivities } from "@/hooks/useActivities";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import CustomerFormDialog from "@/components/CustomerFormDialog";
import ProjectFormDialog from "@/components/ProjectFormDialog";
import FileManager from "@/components/FileManager";
import NotesPanel from "@/components/NotesPanel";
import Timeline from "@/components/Timeline";
import EmptyState from "@/components/EmptyState";
import { CustomerTypeBadge, StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { formatDate } from "@/lib/utils";

function Field({ icon: Icon, label, value, href }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="break-words text-sm text-primary hover:underline">{value}</a>
        ) : (
          <p className="break-words text-sm">{value}</p>
        )}
      </div>
    </div>
  );
}

export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { toast } = useToast();

  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { projects, refetch: refetchProjects } = useProjects({ customerId: id });
  const { activities, loading: actLoading } = useActivities({ customerId: id });

  const load = useCallback(async () => {
    setLoading(true);
    try { setCustomer(await getCustomer(id)); }
    catch (e) { toast({ variant: "destructive", title: "Customer not found", description: e.message }); }
    finally { setLoading(false); }
  }, [id, toast]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteCustomer(id);
      toast({ title: "Customer deleted" });
      navigate("/customers");
    } catch (e) {
      toast({ variant: "destructive", title: "Delete failed", description: e.message });
      setDeleting(false);
    }
  };

  if (loading) return <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>;
  if (!customer) return null;

  return (
    <>
      <Link to="/customers" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to customers
      </Link>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{customer.customer_name}</h1>
            <CustomerTypeBadge type={customer.customer_type} />
          </div>
          {customer.company_name && <p className="mt-1 text-sm text-muted-foreground">{customer.company_name}</p>}
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

      <Tabs defaultValue="profile">
        <TabsList className="flex w-full flex-wrap">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="projects">Projects</TabsTrigger>
          <TabsTrigger value="files">Files</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="notes">Internal Notes</TabsTrigger>
          <TabsTrigger value="comms">Communication</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card className="p-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field icon={MapPin} label="Country" value={customer.country} />
              <Field icon={Mail} label="Contact person" value={customer.contact_person} />
              <Field icon={Mail} label="Email" value={customer.email} href={customer.email ? `mailto:${customer.email}` : undefined} />
              <Field icon={Phone} label="Phone" value={customer.phone} href={customer.phone ? `tel:${customer.phone}` : undefined} />
              <Field icon={MessageCircle} label="WhatsApp" value={customer.whatsapp} href={customer.whatsapp ? `https://wa.me/${customer.whatsapp.replace(/\D/g, "")}` : undefined} />
              <Field icon={Globe} label="Website" value={customer.website} href={customer.website?.startsWith("http") ? customer.website : `https://${customer.website}`} />
            </div>
            {customer.notes && (
              <div className="mt-6 border-t pt-4">
                <p className="mb-1 text-xs text-muted-foreground">Notes</p>
                <p className="whitespace-pre-wrap text-sm">{customer.notes}</p>
              </div>
            )}
            <p className="mt-6 text-xs text-muted-foreground">Added {formatDate(customer.created_at)}</p>
          </Card>
        </TabsContent>

        <TabsContent value="projects">
          <div className="mb-3 flex justify-end">
            <Button onClick={() => setProjectOpen(true)}><Plus className="h-4 w-4" /> New project</Button>
          </div>
          {projects.length === 0 ? (
            <EmptyState title="No projects yet" description="Create the first project for this customer." />
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Project</TableHead>
                    <TableHead>Number</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ship date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projects.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <Link to={`/projects/${p.id}`} className="font-medium hover:text-primary">{p.project_name}</Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{p.project_number || "—"}</TableCell>
                      <TableCell><StatusBadge status={p.status} /></TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(p.shipping_date)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="files">
          <Card className="p-6"><FileManager customerId={id} /></Card>
        </TabsContent>

        <TabsContent value="timeline">
          <Card className="p-6"><Timeline activities={activities} loading={actLoading} /></Card>
        </TabsContent>

        <TabsContent value="notes">
          <Card className="p-6"><NotesPanel customerId={id} /></Card>
        </TabsContent>

        <TabsContent value="comms">
          <Card className="p-6">
            <p className="mb-4 text-sm text-muted-foreground">
              Quick contact channels for this customer. A full message log can be kept in Internal Notes.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {customer.email && <Button variant="outline" asChild><a href={`mailto:${customer.email}`}><Mail className="h-4 w-4" /> Send email</a></Button>}
              {customer.whatsapp && <Button variant="outline" asChild><a href={`https://wa.me/${customer.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-4 w-4" /> WhatsApp</a></Button>}
              {customer.phone && <Button variant="outline" asChild><a href={`tel:${customer.phone}`}><Phone className="h-4 w-4" /> Call</a></Button>}
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <CustomerFormDialog open={editOpen} onOpenChange={setEditOpen} customer={customer} onSaved={load} />
      <ProjectFormDialog open={projectOpen} onOpenChange={setProjectOpen} fixedCustomerId={id} onSaved={refetchProjects} />

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete customer?</DialogTitle>
            <DialogDescription>
              This permanently removes {customer.customer_name} and all related projects, files, notes and history. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="h-4 w-4 animate-spin" />} Delete customer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
