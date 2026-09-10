import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import { useCustomers } from "@/hooks/useCustomers";
import { useAuth } from "@/context/AuthContext";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import CustomerFormDialog from "@/components/CustomerFormDialog";
import { CustomerTypeBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { CUSTOMER_TYPES } from "@/lib/constants";
import { humanize, formatDate } from "@/lib/utils";

export default function Customers() {
  const { customers, loading, refetch } = useCustomers();
  const { isAdmin } = useAuth();
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [country, setCountry] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);

  const countries = useMemo(
    () => [...new Set(customers.map((c) => c.country).filter(Boolean))].sort(),
    [customers]
  );

  const filtered = useMemo(() => {
    return customers.filter((c) => {
      const matchesSearch =
        !search ||
        [c.customer_name, c.company_name, c.contact_person, c.email, c.country]
          .filter(Boolean).some((v) => v.toLowerCase().includes(search.toLowerCase()));
      const matchesType = type === "all" || c.customer_type === type;
      const matchesCountry = country === "all" || c.country === country;
      return matchesSearch && matchesType && matchesCountry;
    });
  }, [customers, search, type, country]);

  return (
    <>
      <PageHeader title="Customers" subtitle={`${customers.length} total`}>
        <Button onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4" /> New customer</Button>
      </PageHeader>

      <Card className="mb-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search by name, company, contact…"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="sm:w-44"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {CUSTOMER_TYPES.map((t) => <SelectItem key={t} value={t}>{humanize(t)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={country} onValueChange={setCountry}>
            <SelectTrigger className="sm:w-44"><SelectValue placeholder="Country" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All countries</SelectItem>
              {countries.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {loading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <EmptyState title="No customers found"
          description="Adjust your filters, or add your first customer to get started."
          action={<Button onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4" /> New customer</Button>} />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-center">Projects</TableHead>
                <TableHead>Added</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => (
                <TableRow key={c.id} className="cursor-pointer">
                  <TableCell>
                    <Link to={`/customers/${c.id}`} className="font-medium hover:text-primary">{c.customer_name}</Link>
                    {c.company_name && <p className="text-xs text-muted-foreground">{c.company_name}</p>}
                  </TableCell>
                  <TableCell>{c.country || "—"}</TableCell>
                  <TableCell>
                    {c.contact_person || "—"}
                    {c.email && <p className="text-xs text-muted-foreground">{c.email}</p>}
                  </TableCell>
                  <TableCell><CustomerTypeBadge type={c.customer_type} /></TableCell>
                  <TableCell className="text-center">{c.projects?.[0]?.count ?? 0}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(c.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <CustomerFormDialog open={dialogOpen} onOpenChange={setDialogOpen} onSaved={refetch} />
    </>
  );
}
