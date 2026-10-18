import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, Plus } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/external/client";
import { useWorkspace } from "@/lib/workspace";
import { logReply } from "@/lib/sequence.functions";
import { ChannelChip } from "@/components/campaign-launch";
import { LeadTimeline } from "@/components/lead-timeline";

export const Route = createFileRoute("/_authenticated/inbox")({
  head: () => ({ meta: [{ title: "Inbox — Outreach AI" }, { name: "description", content: "Every reply across all agents, classified by AI." }] }),
  component: InboxPage,
});

const sel = "h-9 rounded-md border border-input bg-background px-3 text-sm";
const CLASSES = ["interested", "meeting_request", "question", "not_now", "not_interested", "unsubscribe", "out_of_office", "referral", "other"];
type Lead = { id: string; first_name: string | null; last_name: string | null; company: string | null; title: string | null; email: string | null };
const nm = (l: Lead | null | undefined) => (l ? `${l.first_name ?? ""} ${l.last_name ?? ""}`.trim() || l.email || "Unnamed" : "—");

function InboxPage() {
  const { current } = useWorkspace();
  const ws = current?.workspace_id;
  const qc = useQueryClient();
  const [view, setView] = useState<"open" | "sql" | "all">("open");
  const [cls, setCls] = useState("");
  const [sel_, setSel] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const ro = current?.role === "viewer";

  const q = useQuery({
    queryKey: ["inbox", ws, view, cls], enabled: !!ws,
    queryFn: async () => {
      let r = supabase.from("replies").select("*, campaign:campaigns(name), cl:campaign_leads(lead:leads(id,first_name,last_name,company,title,email))").eq("workspace_id", ws!).order("created_at", { ascending: false }).limit(200);
      if (view === "open") r = r.eq("handled", false);
      if (view === "sql") r = r.eq("is_sql", true);
      if (cls) r = r.eq("classification", cls);
      const { data, error } = await r;
      if (error) throw error;
      return data as unknown as (typeof data[number] & { campaign: { name: string } | null; cl: { lead: Lead } | null })[];
    },
  });
  const rows = q.data ?? [];
  const active = rows.find((r) => r.id === sel_) ?? rows[0];

  async function markHandled(id: string, handled: boolean) {
    const { error } = await supabase.from("replies").update({ handled }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["inbox"] });
  }

  return (
    <div>
      <PageHeader title="Inbox" description="Every reply across all agents, classified by AI."
        actions={!ro && <Button onClick={() => setLogOpen(true)}><Plus className="size-4" /> Log a reply</Button>} />
      <p className="mb-4 rounded-xl bg-warning/10 p-3 text-sm">Replies aren't captured automatically yet — agent mailboxes aren't connected. Paste replies with "Log a reply"; they're classified, stop the sequence, and SQLs go to Freshsales and Slack.</p>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(["open", "sql", "all"] as const).map((v) => (
          <button key={v} onClick={() => setView(v)} className={`rounded-full px-3 py-1 text-sm ${view === v ? "bg-primary text-primary-foreground" : "bg-card shadow-soft"}`}>{v === "open" ? "To handle" : v === "sql" ? "SQLs" : "All"}</button>))}
        <select className={`${sel} ml-auto`} value={cls} onChange={(e) => setCls(e.target.value)}><option value="">Any type</option>{CLASSES.map((c) => <option key={c} value={c}>{c.replace("_", " ")}</option>)}</select>
      </div>
      {q.isLoading ? <Skeleton className="h-64 rounded-2xl" /> : !rows.length ? (
        <div className="rounded-2xl bg-card p-10 text-center text-sm text-muted-foreground shadow-soft">No replies here.</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
          <div className="max-h-[70vh] space-y-2 overflow-y-auto">
            {rows.map((r) => (
              <button key={r.id} onClick={() => setSel(r.id)} className={`w-full rounded-2xl p-4 text-left shadow-soft transition ${active?.id === r.id ? "bg-lavender" : "bg-card hover:bg-muted/50"}`}>
                <div className="flex items-center gap-2 text-sm"><b className="truncate">{nm(r.cl?.lead)}</b>{r.is_sql && <span className="rounded-full bg-warning/20 px-2 text-xs">SQL</span>}
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</span></div>
                <div className="mt-1 flex items-center gap-2 text-xs"><ChannelChip ch={r.channel} /><span>{r.classification?.replace("_", " ")}</span>{r.handled && <Check className="size-3 text-success" />}</div>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{r.summary}</p>
              </button>))}
          </div>
          {active && (
            <div className="space-y-4 rounded-2xl bg-card p-6 shadow-soft">
              <div className="flex flex-wrap items-center gap-2">
                <div><h2 className="font-display text-lg font-semibold">{nm(active.cl?.lead)}</h2>
                  <p className="text-sm text-muted-foreground">{active.cl?.lead.title} · {active.cl?.lead.company} · {active.campaign?.name}</p></div>
                {!ro && <Button variant="outline" size="sm" className="ml-auto" onClick={() => markHandled(active.id, !active.handled)}>{active.handled ? "Reopen" : <><Check className="size-4" /> Mark handled</>}</Button>}
              </div>
              <div className="rounded-xl bg-muted/50 p-4">
                <div className="mb-1 text-xs text-muted-foreground">{active.classification?.replace("_", " ")} · {active.summary}</div>
                <p className="whitespace-pre-wrap text-sm">{active.body}</p>
                {active.is_sql && <p className="mt-2 text-xs">{active.freshsales_id ? `In Freshsales as contact #${active.freshsales_id}` : `Not in Freshsales: ${active.crm_error}`}</p>}
              </div>
              <h3 className="font-display font-semibold">History</h3>
              {active.cl?.lead && <LeadTimeline leadId={active.cl.lead.id} />}
            </div>)}
        </div>
      )}
      <LogReplyDialog open={logOpen} onClose={() => { setLogOpen(false); qc.invalidateQueries({ queryKey: ["inbox"] }); }} />
    </div>
  );
}

function LogReplyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { current } = useWorkspace();
  const reply = useServerFn(logReply);
  const [search, setSearch] = useState("");
  const [pick, setPick] = useState<string | null>(null);
  const [text, setText] = useState(""); const [ch, setCh] = useState("email"); const [busy, setBusy] = useState(false);
  const leads = useQuery({
    queryKey: ["reply-targets", current?.workspace_id, search], enabled: open && !!current,
    queryFn: async () => {
      let q = supabase.from("campaign_leads").select("id,status,campaign:campaigns!inner(name,status,workspace_id),lead:leads!inner(id,first_name,last_name,company,title,email)")
        .eq("campaign.workspace_id", current!.workspace_id).neq("campaign.status", "draft").limit(20);
      const s = search.trim().replace(/[%,()]/g, "");
      if (s) q = q.or(`email.ilike.%${s}%,first_name.ilike.%${s}%,last_name.ilike.%${s}%,company.ilike.%${s}%`, { referencedTable: "lead" });
      const { data, error } = await q; if (error) throw error;
      return data as unknown as { id: string; status: string; campaign: { name: string }; lead: Lead }[];
    },
  });
  async function submit() {
    setBusy(true);
    try {
      const r = await reply({ data: { campaignLeadId: pick!, body: text, channel: ch } });
      toast.success(`Classified as ${r.classification.replace("_", " ")}${r.isSql ? (r.crmError ? ` — SQL, CRM push failed: ${r.crmError}` : " — SQL sent to Freshsales") : ""}`);
      setText(""); setPick(null); onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    setBusy(false);
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Log a reply</DialogTitle></DialogHeader>
        <Input placeholder="Find the lead (launched campaigns only)" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="max-h-48 space-y-1 overflow-y-auto">
          {leads.data?.map((l) => (
            <button key={l.id} onClick={() => setPick(l.id)} className={`w-full rounded-lg px-3 py-2 text-left text-sm ${pick === l.id ? "bg-lavender" : "hover:bg-muted"}`}>
              <b>{nm(l.lead)}</b> <span className="text-muted-foreground">· {l.lead.company} · {l.campaign.name} · {l.status}</span></button>))}
          {leads.data && !leads.data.length && <p className="text-sm text-muted-foreground">No matching leads in launched campaigns.</p>}
        </div>
        <select className={sel} value={ch} onChange={(e) => setCh(e.target.value)}><option value="email">Email</option><option value="linkedin">LinkedIn</option><option value="call">Call notes</option></select>
        <Textarea rows={5} placeholder="Paste the reply…" value={text} onChange={(e) => setText(e.target.value)} />
        <Button disabled={!pick || !text.trim() || busy} onClick={submit}>{busy && <Loader2 className="size-4 animate-spin" />}Classify and save</Button>
      </DialogContent>
    </Dialog>
  );
}
