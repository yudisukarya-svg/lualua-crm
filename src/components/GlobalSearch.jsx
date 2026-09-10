import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Users, Package, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/StatusBadge";

export default function GlobalSearch() {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState({ customers: [], projects: [] });
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const onClick = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    if (term.trim().length < 2) { setResults({ customers: [], projects: [] }); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      const like = `%${term.trim()}%`;
      const [cust, proj] = await Promise.all([
        supabase
          .from("customers")
          .select("id, customer_name, company_name, country, contact_person")
          .or(`customer_name.ilike.${like},company_name.ilike.${like},country.ilike.${like},contact_person.ilike.${like}`)
          .limit(6),
        supabase
          .from("projects")
          .select("id, project_number, project_name, status, customers(customer_name)")
          .or(`project_name.ilike.${like},project_number.ilike.${like}`)
          .limit(6),
      ]);
      setResults({ customers: cust.data ?? [], projects: proj.data ?? [] });
      setLoading(false);
      setOpen(true);
    }, 200);
    return () => clearTimeout(t);
  }, [term]);

  const go = (path) => { setOpen(false); setTerm(""); navigate(path); };
  const hasResults = results.customers.length || results.projects.length;

  return (
    <div ref={boxRef} className="relative w-full max-w-md">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onFocus={() => term.trim().length >= 2 && setOpen(true)}
          placeholder="Search customers, projects, PO numbers…"
          className="pl-9"
          aria-label="Global search"
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>

      {open && term.trim().length >= 2 && (
        <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-lg border bg-popover shadow-lg">
          {!hasResults && !loading && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">No matches for “{term}”.</p>
          )}
          {results.customers.length > 0 && (
            <div className="border-b py-1">
              <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Customers</p>
              {results.customers.map((c) => (
                <button key={c.id} onClick={() => go(`/customers/${c.id}`)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-accent">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 truncate">{c.customer_name}{c.company_name ? ` · ${c.company_name}` : ""}</span>
                  <span className="text-xs text-muted-foreground">{c.country}</span>
                </button>
              ))}
            </div>
          )}
          {results.projects.length > 0 && (
            <div className="py-1">
              <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Projects</p>
              {results.projects.map((p) => (
                <button key={p.id} onClick={() => go(`/projects/${p.id}`)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-accent">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 truncate">
                    <span className="font-mono text-xs text-muted-foreground">{p.project_number}</span>{" "}{p.project_name}
                  </span>
                  <StatusBadge status={p.status} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
