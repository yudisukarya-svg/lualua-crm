import { useState, useMemo, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import { useProjects } from "@/hooks/useProjects";
import { useProjectActualProgress } from "@/hooks/useProjectActualProgress";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import ProjectFormDialog from "@/components/ProjectFormDialog";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { PROJECT_STATUSES, PRODUCT_CATEGORIES } from "@/lib/constants";
import { humanize, formatDate, formatMoney } from "@/lib/utils";

export default function Projects() {
  const { projects, loading, refetch } = useProjects();
  const { overallByProject } = useProjectActualProgress(projects);
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(params.get("status") || "all");
  const [category, setCategory] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => { setStatus(params.get("status") || "all"); }, [params]);

  const onStatusChange = (val) => {
    setStatus(val);
    if (val === "all") setParams({}); else setParams({ status: val });
  };

  const filtered = useMemo(() => projects.filter((p) => {
    const matchesSearch = !search ||
      [p.project_name, p.project_number, p.customers?.customer_name, p.collection_name]
        .filter(Boolean).some((v) => v.toLowerCase().includes(search.toLowerCase()));
    const matchesStatus = status === "all" || p.status === status;
    const matchesCat = category === "all" || p.product_category === category;
    return matchesSearch && matchesStatus && matchesCat;
  }), [projects, search, status, category]);

  return (
    <>
      <PageHeader title="Projects" subtitle={`${projects.length} total`}>
        <Button onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4" /> New project</Button>
      </PageHeader>

      <Card className="mb-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search by name, number, customer…"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={status} onValueChange={onStatusChange}>
            <SelectTrigger className="sm:w-48"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {PROJECT_STATUSES.map((s) => <SelectItem key={s} value={s}>{humanize(s)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="sm:w-44"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {PRODUCT_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{humanize(c)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {loading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <EmptyState title="No projects found"
          description="Adjust filters or create a project to begin tracking production."
          action={<Button onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4" /> New project</Button>} />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Target</TableHead>
                <TableHead className="w-36">Progress</TableHead>
                <TableHead>Ship date</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Link to={`/projects/${p.id}`} className="font-medium hover:text-primary">{p.project_name}</Link>
                    <p className="font-mono text-xs text-muted-foreground">{p.project_number}</p>
                  </TableCell>
                  <TableCell>{p.customers?.customer_name || "—"}</TableCell>
                  <TableCell>{humanize(p.product_category || "")}</TableCell>
                  <TableCell>{p.quantity ?? "—"}</TableCell>
                  <TableCell>{formatMoney(p.target_price, p.currency)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress value={overallByProject[p.id] ?? 0} className="h-1.5" />
                      <span className="w-8 text-right text-xs text-muted-foreground">{overallByProject[p.id] ?? 0}%</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(p.shipping_date)}</TableCell>
                  <TableCell><StatusBadge status={p.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <ProjectFormDialog open={dialogOpen} onOpenChange={setDialogOpen} onSaved={refetch} />
    </>
  );
}
