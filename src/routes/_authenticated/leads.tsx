import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Ban, Download, Search } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/external/client";
import { useWorkspace } from "@/lib/workspace";
import { LeadTimeline } from "@/components/lead-timeline";

export const Route = createFileRoute("/_authenticated/leads")({
  head: () => ({ meta: [{ title: "Leads — Outreach AI" }, { name: "description", content: "Search, filter and manage every lead in your workspace." }] }),
  component: LeadsPage,
});

const sel = "h-9 rounded-md border border-input bg-background px-3 text-sm";
const PAGE = 50;

function LeadsPage() {
  const { current, user } = useWorkspace();
  const qc = useQueryClient();
  const ws = current?.workspace_id;
  const [search, setSearch] = useState("");
  const [campaign, setCampaign] = useState("");
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [page, setPage] = useState(0);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<{ id: string; name: string } | null>(null);
  const ro = current?.role === "viewer";

  const campaigns = useQuery({ queryKey: ["campaign-names", ws], enabled: !!ws, queryFn: async () => (await supabase.from("campaigns").select("id,name").eq("workspace_id", ws!).order("created_at", { ascending: false })).data ?? [] });
  const supp = useQuery({ queryKey: ["suppression", ws], enabled: !!ws, queryFn: async () => (await supabase.from("suppression_list").select("value,kind").eq("workspace_id", ws!)).data ?? [] });

  const leads = useQuery({
    queryKey: ["leads", ws, search, campaign, status, source, page],
    enabled: !!ws,
    queryFn: async () => {
      const inner = campaign || status;
      let q = supabase.from("leads").select(`id,email,first_name,last_name,title,company,country,source,created_at,cl:campaign_leads${inner ? "!inner" : ""}(id,status,decision,score,campaign_id)`, { count: "exact" })
        .eq("workspace_id", ws!).order("created_at", { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1);
      if (search.trim()) { const s = search.trim().replace(/[%,()]/g, ""); q = q.or(`email.ilike.%${s}%,first_name.ilike.%${s}%,last_name.ilike.%${s}%,company.ilike.%${s}%,title.ilike.%${s}%`); }
      if (source) q = q.eq("source", source);
      if (campaign) q = q.eq("campaign_leads.campaign_id", campaign);
      if (status === "qualified" || status === "not_qualified") q = q.eq("campaign_leads.decision", status);
      else if (status) q = q.eq("campaign_leads.status", status);
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: data as unknown as Row[], count: count ?? 0 };
    },
  });
  type Row = { id: string; email: string | null; first_name: string | null; last_name: string | null; title: string | null; company: string | null; country: string | null; source: string; created_at: string;
    cl: { id: string; status: string; decision: string; score: number | null; campaign_id: string }[] };

  const suppressed = useMemo(() => {
    const e = new Set((supp.data ?? []).filter((s) => s.kind === "email").map((s) => s.value)); const d = new Set((supp.data ?? []).filter((s) => s.kind === "domain").map((s) => s.value));
    return (email: string | null) => !!email && (e.has(email.toLowerCase()) || d.has(email.split("@")[1]?.toLowerCase() ?? ""));
  }, [supp.data]);
  const cname = new Map((campaigns.data ?? []).map((c) => [c.id, c.name]));
  const rows = leads.data?.rows ?? [];
  const name = (r: Row) => `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() || r.email || "Unnamed";

  async function suppress() {
    const chosen = rows.filter((r) => picked.has(r.id));
    const emails = chosen.map((r) => r.email?.toLowerCase()).filter((e): e is string => !!e && !suppressed(e));
    if (emails.length) {
      const { error } = await supabase.from("suppression_list").insert(emails.map((value) => ({ workspace_id: ws!, value, kind: "email", reason: "Added from Leads", created_by: user.id })));
      if (error) { toast.error(error.message); return; }
    }
    const clIds = chosen.flatMap((r) => r.cl.map((c) => c.id));
    if (clIds.length) {
      await supabase.from("messages").update({ status: "skipped", error: "Lead suppressed" }).in("campaign_lead_id", clIds).in("status", ["draft", "approved", "scheduled", "waiting"]);
      await supabase.from("campaign_leads").update({ status: "stopped" }).in("id", clIds).in("status", ["new", "active"]);
    }
    toast.success(`${emails.length} added to do-not-contact; their sequences stopped where you have access`);
    setPicked(new Set()); qc.invalidateQueries({ queryKey: ["leads"] }); qc.invalidateQueries({ queryKey: ["suppression"] });
  }

  function exportCsv() {
    const chosen = picked.size ? rows.filter((r) => picked.has(r.id)) : rows;
    const cols = ["first_name", "last_name", "email", "title", "company", "country", "source"] as const;
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [cols.join(","), ...chosen.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "leads.csv"; a.click();
    void supabase.from("audit_log").insert({ workspace_id: ws!, actor: user.id, action: "export", entity: "leads", details: { rows: chosen.length } });
  }

  const reset = () => setPage(0);
  const total = leads.data?.count ?? 0;
  return (
    <div>
      <PageHeader title="Leads" description="Every lead in your workspace, with where they are in each campaign." />
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl bg-card p-4 shadow-soft">
        <div className="relative min-w-60 flex-1"><Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Search name, email, company, title" value={search} onChange={(e) => { setSearch(e.target.value); reset(); }} /></div>
        <select className={sel} value={campaign} onChange={(e) => { setCampaign(e.target.value); reset(); }}><option value="">All campaigns</option>{campaigns.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select className={sel} value={status} onChange={(e) => { setStatus(e.target.value); reset(); }}>
          <option value="">Any status</option><option value="qualified">Qualified</option><option value="not_qualified">Not qualified</option>
          <option value="active">In sequence</option><option value="replied">Replied</option><option value="sql">SQL</option><option value="unsubscribed">Unsubscribed</option><option value="stopped">Stopped</option></select>
        <select className={sel} value={source} onChange={(e) => { setSource(e.target.value); reset(); }}><option value="">Any source</option><option value="file">File</option><option value="apollo">Apollo</option></select>
      </div>
      {picked.size > 0 && (
        <div className="mb-3 flex items-center gap-2 rounded-xl bg-lavender px-4 py-2 text-sm">
          <b>{picked.size} selected</b>
          {!ro && <Button size="sm" variant="outline" onClick={suppress}><Ban className="size-4" /> Do not contact</Button>}
          <Button size="sm" variant="outline" onClick={exportCsv}><Download className="size-4" /> Export CSV</Button>
          <Button size="sm" variant="ghost" onClick={() => setPicked(new Set())}>Clear</Button>
        </div>)}
      <div className="overflow-x-auto rounded-2xl bg-card shadow-soft">
        {leads.isLoading ? <Skeleton className="m-4 h-40" /> : !rows.length ? <p className="p-8 text-center text-sm text-muted-foreground">No leads match. Import leads from a campaign's "Lead source" step.</p> : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground"><tr className="border-b">
              <th className="p-3"><Checkbox checked={rows.every((r) => picked.has(r.id))} onCheckedChange={(v) => setPicked(v ? new Set(rows.map((r) => r.id)) : new Set())} /></th>
              <th className="p-3">Lead</th><th className="p-3">Company</th><th className="p-3">Country</th><th className="p-3">Campaigns</th><th className="p-3">Source</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="cursor-pointer border-b last:border-0 hover:bg-muted/40" onClick={() => setOpen({ id: r.id, name: name(r) })}>
                  <td className="p-3" onClick={(e) => e.stopPropagation()}><Checkbox checked={picked.has(r.id)} onCheckedChange={(v) => { const n = new Set(picked); v ? n.add(r.id) : n.delete(r.id); setPicked(n); }} /></td>
                  <td className="p-3"><div className="font-medium">{name(r)} {suppressed(r.email) && <span className="ml-1 rounded-full bg-destructive/10 px-2 text-xs text-destructive">Do not contact</span>}</div><div className="text-xs text-muted-foreground">{r.title} {r.email && `· ${r.email}`}</div></td>
                  <td className="p-3">{r.company ?? "—"}</td><td className="p-3">{r.country ?? "—"}</td>
                  <td className="p-3"><div className="flex flex-wrap gap-1">{r.cl.map((c) => (
                    <span key={c.id} className={`rounded-full px-2 py-0.5 text-xs ${c.status === "sql" ? "bg-warning/20" : "bg-muted"}`}>{cname.get(c.campaign_id) ?? "Campaign"}: {c.status === "sql" ? "SQL" : c.status === "new" ? c.decision.replace("_", " ") : c.status}</span>))}</div></td>
                  <td className="p-3 capitalize">{r.source}</td>
                </tr>))}
            </tbody>
          </table>)}
      </div>
      <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
        <span>{total} leads</span>
        <Button size="sm" variant="ghost" className="ml-auto" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
        <span>Page {page + 1} of {Math.max(1, Math.ceil(total / PAGE))}</span>
        <Button size="sm" variant="ghost" disabled={(page + 1) * PAGE >= total} onClick={() => setPage(page + 1)}>Next</Button>
      </div>
      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader><SheetTitle>{open?.name}</SheetTitle></SheetHeader>
          <div className="mt-4">{open && <LeadTimeline leadId={open.id} />}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
