import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Mail, Linkedin, Phone, Plus, Trash2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/external/client";
import { useWorkspace } from "@/lib/workspace";
import { saveSteps, generateCopy, launchCampaign, setCampaignStatus, runDueNow, logReply, type StepInput } from "@/lib/sequence.functions";
import type { Campaign } from "@/components/campaign-wizard";

const card = "rounded-2xl bg-card p-6 shadow-soft";
const sel = "h-9 rounded-md border border-input bg-background px-3 text-sm";
const CH = {
  email: { label: "Email", icon: Mail, cls: "bg-channel-email/10 text-channel-email" },
  linkedin: { label: "LinkedIn", icon: Linkedin, cls: "bg-channel-linkedin/15 text-channel-linkedin" },
  call: { label: "Call", icon: Phone, cls: "bg-channel-call/15 text-channel-call" },
} as const;
type Ch = keyof typeof CH;

export function ChannelChip({ ch }: { ch: string }) {
  const c = CH[(ch as Ch)] ?? CH.email; const I = c.icon;
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${c.cls}`}><I className="size-3" />{c.label}</span>;
}

function useSteps(id: string) {
  return useQuery({ queryKey: ["steps", id], queryFn: async () => {
    const { data, error } = await supabase.from("campaign_steps").select("*").eq("campaign_id", id).order("step_order");
    if (error) throw error; return data;
  } });
}
function useMessages(id: string) {
  return useQuery({ queryKey: ["messages", id], queryFn: async () => {
    const { data, error } = await supabase.from("messages").select("*, cl:campaign_leads(id,status,lead:leads(first_name,last_name,company,title,email))").eq("campaign_id", id).order("step_order");
    if (error) throw error;
    return data as unknown as (typeof data[number] & { cl: { id: string; status: string; lead: { first_name: string | null; last_name: string | null; company: string | null; title: string | null; email: string | null } } })[];
  } });
}
const name = (l: { first_name: string | null; last_name: string | null; email?: string | null }) => `${l.first_name ?? ""} ${l.last_name ?? ""}`.trim() || l.email || "Unnamed";

export function SequenceStep({ campaign, onNext }: { campaign: Campaign; onNext: () => void }) {
  const q = useSteps(campaign.id);
  const qc = useQueryClient();
  const save = useServerFn(saveSteps);
  const { current } = useWorkspace();
  const ro = current?.role === "viewer" || campaign.status !== "draft";
  const [steps, setSteps] = useState<StepInput[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!q.data) return;
    setSteps(q.data.length ? q.data.map((s) => ({ channel: s.channel as Ch, delay_days: s.delay_days, instructions: s.instructions ?? "" }))
      : [{ channel: "email", delay_days: 0, instructions: "" }, { channel: "linkedin", delay_days: 2, instructions: "" }, { channel: "email", delay_days: 3, instructions: "Short follow-up" }, { channel: "call", delay_days: 4, instructions: "" }]);
  }, [q.data]);
  const upd = (i: number, p: Partial<StepInput>) => setSteps((s) => s.map((x, j) => (j === i ? { ...x, ...p } : x)));
  async function submit() {
    setBusy(true);
    try { await save({ data: { campaignId: campaign.id, steps } }); await qc.invalidateQueries({ queryKey: ["steps", campaign.id] }); qc.invalidateQueries({ queryKey: ["campaign", campaign.id] }); toast.success("Sequence saved"); onNext(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); }
    setBusy(false);
  }
  return (
    <div className="space-y-3">
      {steps.map((s, i) => (
        <div key={i} className={`${card} flex flex-wrap items-end gap-3`}>
          <span className="font-display text-lg font-semibold text-muted-foreground">{i + 1}</span>
          <div className="space-y-1"><Label className="text-xs">Channel</Label>
            <select disabled={ro} className={sel} value={s.channel} onChange={(e) => upd(i, { channel: e.target.value as Ch })}>
              <option value="email">Email</option><option value="linkedin">LinkedIn</option><option value="call">Call</option></select></div>
          <div className="space-y-1"><Label className="text-xs">{i === 0 ? "Days after launch" : "Days after previous step"}</Label>
            <Input disabled={ro} type="number" min={0} max={60} className="w-28" value={s.delay_days} onChange={(e) => upd(i, { delay_days: Number(e.target.value) })} /></div>
          <div className="min-w-60 flex-1 space-y-1"><Label className="text-xs">Instructions for the AI (optional)</Label>
            <Input disabled={ro} value={s.instructions} placeholder="e.g. mention their Arabic site" onChange={(e) => upd(i, { instructions: e.target.value })} /></div>
          {!ro && <Button variant="ghost" size="icon" disabled={steps.length <= 1} onClick={() => setSteps(steps.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>}
        </div>
      ))}
      {!ro && <div className="flex gap-2">
        <Button variant="outline" disabled={steps.length >= 8} onClick={() => setSteps([...steps, { channel: "email", delay_days: 3, instructions: "" }])}><Plus className="size-4" /> Add step</Button>
        <Button className="ml-auto" disabled={busy} onClick={submit}>{busy && <Loader2 className="size-4 animate-spin" />}Save sequence</Button>
      </div>}
      {campaign.status !== "draft" && <p className="text-sm text-muted-foreground">The sequence is locked after launch.</p>}
    </div>
  );
}

export function CopyStep({ campaign, onNext }: { campaign: Campaign; onNext: () => void }) {
  const qc = useQueryClient();
  const gen = useServerFn(generateCopy);
  const { current } = useWorkspace();
  const steps = useSteps(campaign.id);
  const msgs = useMessages(campaign.id);
  const leads = useQuery({ queryKey: ["qualified", campaign.id], queryFn: async () => {
    const { data, error } = await supabase.from("campaign_leads").select("id,research_status").eq("campaign_id", campaign.id).eq("decision", "qualified");
    if (error) throw error; return data;
  } });
  const [prog, setProg] = useState<{ done: number; total: number } | null>(null);
  const withCopy = new Set((msgs.data ?? []).map((m) => m.campaign_lead_id));
  const todo = (leads.data ?? []).filter((l) => !withCopy.has(l.id));
  async function go(ids: string[]) {
    setProg({ done: 0, total: ids.length }); let failed = 0, last = "";
    for (let i = 0; i < ids.length; i += 3) {
      try { const r = await gen({ data: { campaignId: campaign.id, ids: ids.slice(i, i + 3) } }); for (const x of r.results) if (!x.ok) { failed++; last = x.error ?? ""; } }
      catch (e) { failed += Math.min(3, ids.length - i); last = e instanceof Error ? e.message : "Failed"; }
      setProg({ done: Math.min(ids.length, i + 3), total: ids.length }); qc.invalidateQueries({ queryKey: ["messages", campaign.id] });
    }
    failed ? toast.error(`${failed} leads failed: ${last}`) : toast.success("Copy written — review it in Approval");
    setProg(null);
  }
  if (!steps.data?.length) return <div className={`${card} text-sm text-muted-foreground`}>Save the sequence first.</div>;
  return (
    <div className="space-y-4">
      <div className={`${card} flex flex-wrap items-center gap-3`}>
        <span className="text-sm"><b>{withCopy.size}</b> of <b>{leads.data?.length ?? 0}</b> qualified leads have copy · {steps.data.length} steps each{campaign.ab_testing && " · A/B testing alternates leads between two angles"}</span>
        <div className="ml-auto flex items-center gap-2">
          {prog && <span className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />{prog.done}/{prog.total}</span>}
          {current?.role !== "viewer" && campaign.status === "draft" && <>
            <Button variant="outline" disabled={!!prog || !withCopy.size} onClick={() => go([...withCopy])}>Rewrite all</Button>
            <Button disabled={!!prog || !todo.length} onClick={() => go(todo.map((l) => l.id))}>Write copy for {todo.length} leads</Button></>}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Copy uses the approved brand summary, the agent's tone and signature, and each lead's research. Rewriting resets approval.</p>
      <Button variant="outline" onClick={onNext} disabled={!withCopy.size}>Review and approve →</Button>
    </div>
  );
}

export function ApprovalStep({ campaign, onNext }: { campaign: Campaign; onNext: () => void }) {
  const msgs = useMessages(campaign.id);
  const qc = useQueryClient();
  const { current, user } = useWorkspace();
  const ro = current?.role === "viewer" || campaign.status !== "draft";
  const [filter, setFilter] = useState("draft");
  const [edit, setEdit] = useState<Record<string, { subject: string; body: string }>>({});
  const list = (msgs.data ?? []).filter((m) => filter === "all" || m.status === filter);
  async function setStatus(ids: string[], status: "approved" | "rejected") {
    for (const id of ids) {
      const e = edit[id];
      const { error } = await supabase.from("messages").update({ status, ...(e ? { subject: e.subject, body: e.body } : {}), approved_at: status === "approved" ? new Date().toISOString() : null, approved_by: status === "approved" ? user.id : null }).eq("id", id);
      if (error) { toast.error(error.message); return; }
    }
    setEdit({}); qc.invalidateQueries({ queryKey: ["messages", campaign.id] });
  }
  const counts = (msgs.data ?? []).reduce<Record<string, number>>((a, m) => ({ ...a, [m.status]: (a[m.status] ?? 0) + 1 }), {});
  return (
    <div className="space-y-4">
      <div className={`${card} flex flex-wrap items-center gap-2`}>
        {["draft", "approved", "rejected", "all"].map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-3 py-1 text-sm ${filter === f ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
            {f === "draft" ? "To review" : f[0]!.toUpperCase() + f.slice(1)} {f !== "all" && `(${counts[f] ?? 0})`}</button>))}
        {!ro && filter === "draft" && list.length > 0 && <Button className="ml-auto" onClick={() => setStatus(list.map((m) => m.id), "approved")}><Check className="size-4" /> Approve all {list.length}</Button>}
        {(counts["approved"] ?? 0) > 0 && <Button variant="outline" onClick={onNext}>Go to launch →</Button>}
      </div>
      {!list.length && <p className="text-sm text-muted-foreground">Nothing here.</p>}
      {list.map((m) => {
        const e = edit[m.id] ?? { subject: m.subject ?? "", body: m.body };
        const canEdit = !ro && m.status !== "approved";
        return (
          <div key={m.id} className={card}>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
              <b>{name(m.cl.lead)}</b><span className="text-muted-foreground">· {m.cl.lead.company}</span>
              <span className="text-muted-foreground">· Step {m.step_order}</span><ChannelChip ch={m.channel} />
              {campaign.ab_testing && <span className="rounded-full bg-lavender px-2 py-0.5 text-xs">Variant {m.variant}</span>}
              <span className="ml-auto text-xs text-muted-foreground">{m.status}</span>
            </div>
            {m.channel === "email" && <Input disabled={!canEdit} className="mb-2" value={e.subject} onChange={(ev) => setEdit({ ...edit, [m.id]: { ...e, subject: ev.target.value } })} />}
            <Textarea disabled={!canEdit} rows={m.channel === "linkedin" ? 3 : 7} value={e.body} onChange={(ev) => setEdit({ ...edit, [m.id]: { ...e, body: ev.target.value } })} />
            {!ro && <div className="mt-3 flex gap-2">
              {m.status !== "approved" && <Button size="sm" onClick={() => setStatus([m.id], "approved")}><Check className="size-4" /> Approve</Button>}
              {m.status !== "rejected" && <Button size="sm" variant="ghost" onClick={() => setStatus([m.id], "rejected")}><X className="size-4" /> Reject</Button>}
            </div>}
          </div>
        );
      })}
    </div>
  );
}

export function LaunchStep({ campaign }: { campaign: Campaign }) {
  const qc = useQueryClient();
  const { current } = useWorkspace();
  const msgs = useMessages(campaign.id);
  const steps = useSteps(campaign.id);
  const launch = useServerFn(launchCampaign);
  const status = useServerFn(setCampaignStatus);
  const runNow = useServerFn(runDueNow);
  const reply = useServerFn(logReply);
  const replies = useQuery({ queryKey: ["replies", campaign.id], queryFn: async () => {
    const { data, error } = await supabase.from("replies").select("*").eq("campaign_id", campaign.id).order("created_at", { ascending: false });
    if (error) throw error; return data;
  } });
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [text, setText] = useState(""); const [ch, setCh] = useState("email");
  const ro = current?.role === "viewer";
  const refresh = () => { qc.invalidateQueries({ queryKey: ["messages", campaign.id] }); qc.invalidateQueries({ queryKey: ["campaign", campaign.id] }); qc.invalidateQueries({ queryKey: ["replies", campaign.id] }); };
  async function act(fn: () => Promise<unknown>, ok: string) {
    setBusy(true); try { const r = await fn(); toast.success(typeof r === "string" ? r : ok); refresh(); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } setBusy(false);
  }
  const all = msgs.data ?? [];
  const leads = new Map<string, (typeof all)[number]["cl"]>(); for (const m of all) leads.set(m.cl.id, m.cl);
  const ready = [...leads.keys()].filter((id) => (steps.data ?? []).every((s) => all.find((m) => m.campaign_lead_id === id && m.step_id === s.id)?.status === "approved"));
  const c = all.reduce<Record<string, number>>((a, m) => ({ ...a, [m.status]: (a[m.status] ?? 0) + 1 }), {});
  const waitingReasons = [...new Set(all.filter((m) => m.status === "waiting" || m.status === "failed").map((m) => m.error).filter(Boolean))];
  return (
    <div className="space-y-4">
      <div className={`${card} space-y-3`}>
        {campaign.status === "draft" ? <>
          <p className="text-sm"><b>{ready.length}</b> of <b>{leads.size}</b> leads have every step approved and will start. Others stay out until fully approved.</p>
          {!ro && <Button disabled={busy || !ready.length} onClick={() => act(async () => { const r = await launch({ data: { campaignId: campaign.id } }); return `Launched for ${r.launched} leads`; }, "")}>Launch campaign</Button>}
        </> : <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm">Campaign is <b>{campaign.status}</b>.</span>
          {!ro && campaign.status === "active" && <Button variant="outline" disabled={busy} onClick={() => act(() => status({ data: { campaignId: campaign.id, status: "paused" } }), "Paused")}>Pause</Button>}
          {!ro && campaign.status === "paused" && <Button disabled={busy} onClick={() => act(() => status({ data: { campaignId: campaign.id, status: "active" } }), "Resumed")}>Resume</Button>}
          {!ro && campaign.status !== "completed" && <Button variant="ghost" disabled={busy} onClick={() => act(() => status({ data: { campaignId: campaign.id, status: "completed" } }), "Completed")}>Mark completed</Button>}
          {!ro && campaign.status === "active" && <Button variant="outline" className="ml-auto" disabled={busy} onClick={() => act(async () => { const r = await runNow({ data: { campaignId: campaign.id } }); return `Sent ${r.sent} · waiting ${r.waiting} · failed ${r.failed} · outside send window/cap ${r.deferred}`; }, "")}>{busy && <Loader2 className="size-4 animate-spin" />}Send due steps now</Button>}
        </div>}
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
          {[["Scheduled", c["scheduled"]], ["Sent", c["sent"]], ["Waiting", c["waiting"]], ["Failed", c["failed"]], ["Replies", replies.data?.length]].map(([l, n]) => (
            <div key={l as string} className="rounded-xl bg-muted/50 p-3"><div className="text-xs text-muted-foreground">{l}</div><div className="font-display text-xl font-semibold">{n ?? 0}</div></div>))}
        </div>
        {waitingReasons.length > 0 && <div className="rounded-xl bg-warning/10 p-3 text-sm">{waitingReasons.map((r) => <div key={r}>• {r}</div>)}</div>}
        <p className="text-xs text-muted-foreground">Due steps are sent automatically every 10 minutes within the agent's sending days, hours and daily cap.</p>
      </div>
      {campaign.status !== "draft" && <div className={card}>
        <h3 className="mb-3 font-display font-semibold">Leads</h3>
        <div className="divide-y">
          {[...leads.values()].map((l) => (
            <div key={l.id} className="py-3">
              <div className="flex items-center gap-2 text-sm"><b>{name(l.lead)}</b><span className="text-muted-foreground">· {l.lead.company}</span>
                <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${l.status === "sql" ? "bg-warning/20" : "bg-muted"}`}>{l.status === "sql" ? "SQL" : l.status}</span>
                {!ro && <Button size="sm" variant="ghost" className="ml-auto" onClick={() => { setOpen(open === l.id ? null : l.id); setText(""); }}>Log reply</Button>}</div>
              {open === l.id && <div className="mt-2 space-y-2">
                <div className="flex gap-2"><select className={sel} value={ch} onChange={(e) => setCh(e.target.value)}><option value="email">Email</option><option value="linkedin">LinkedIn</option><option value="call">Call notes</option></select></div>
                <Textarea rows={4} placeholder="Paste the reply…" value={text} onChange={(e) => setText(e.target.value)} />
                <Button size="sm" disabled={busy || !text.trim()} onClick={() => act(async () => {
                  const r = await reply({ data: { campaignLeadId: l.id, body: text, channel: ch } }); setOpen(null);
                  return `Classified as ${r.classification.replace("_", " ")}${r.isSql ? r.crmError ? ` — SQL, but CRM push failed: ${r.crmError}` : " — SQL sent to Freshsales" : ""}`;
                }, "")}>{busy && <Loader2 className="size-4 animate-spin" />}Classify reply</Button>
              </div>}
            </div>))}
        </div>
      </div>}
      {!!replies.data?.length && <div className={card}>
        <h3 className="mb-3 font-display font-semibold">Replies</h3>
        {replies.data.map((r) => (
          <div key={r.id} className="border-b py-2 text-sm last:border-0">
            <div className="flex items-center gap-2"><ChannelChip ch={r.channel} /><b>{r.classification?.replace("_", " ")}</b>{r.is_sql && <span className="rounded-full bg-warning/20 px-2 text-xs">SQL</span>}
              <span className="ml-auto text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</span></div>
            <p className="text-muted-foreground">{r.summary}</p>
            {r.is_sql && <p className="text-xs">{r.freshsales_id ? `Freshsales contact #${r.freshsales_id}` : `Not in Freshsales: ${r.crm_error}`}</p>}
          </div>))}
      </div>}
    </div>
  );
}
