import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileSpreadsheet, Database, Sheet, Loader2, Upload, ChevronDown, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/external/client";
import { useWorkspace } from "@/lib/workspace";
import { importLeads, apolloPreview, apolloImport, qualifyLeads, researchLeads, LEAD_FIELDS, type LeadInput, type ApolloFilters, type ResearchProfile } from "@/lib/campaigns.functions";

export const STEPS = ["Basics", "Lead source", "Qualification", "Research", "Sequence", "Copy", "Approval", "Launch"];

export type Campaign = {
  id: string; workspace_id: string; organization_id: string; agent_id: string; name: string; language: string; ab_testing: boolean;
  source_type: string | null; source_config: Record<string, unknown>; qualification_weights: { size: number; fit: number; multilingual: number };
  qualification_threshold: number; status: string; wizard_step: number;
};

const card = "rounded-2xl bg-card p-6 shadow-soft";
const sel = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

function useAgents() {
  const { current } = useWorkspace();
  return useQuery({
    queryKey: ["agents-min", current?.workspace_id],
    enabled: !!current,
    queryFn: async () => {
      const { data, error } = await supabase.from("agents").select("id,name,organization_id,target_markets,icp_industries,icp_company_sizes,icp_titles,icp_seniorities,organization:organizations(name)").eq("workspace_id", current!.workspace_id);
      if (error) throw error;
      return data;
    },
  });
}

async function bumpStep(c: Campaign, n: number) {
  if (c.wizard_step < n) await supabase.from("campaigns").update({ wizard_step: n, updated_at: new Date().toISOString() }).eq("id", c.id);
}

// ---------- Step 1 ----------
export function BasicsForm({ campaign, onSaved }: { campaign?: Campaign | undefined; onSaved: (id: string) => void }) {
  const { current } = useWorkspace();
  const qc = useQueryClient();
  const agents = useAgents();
  const [name, setName] = useState(campaign?.name ?? "");
  const [agentId, setAgentId] = useState(campaign?.agent_id ?? "");
  const [language, setLanguage] = useState(campaign?.language ?? "en");
  const [ab, setAb] = useState(campaign?.ab_testing ?? false);
  const [busy, setBusy] = useState(false);
  const agent = agents.data?.find((a) => a.id === agentId);
  const readOnly = current?.role === "viewer";

  async function save() {
    if (!name.trim() || !agent) { toast.error("Enter a name and choose an agent"); return; }
    setBusy(true);
    const row = { name: name.trim(), agent_id: agent.id, organization_id: agent.organization_id, language, ab_testing: ab, updated_at: new Date().toISOString() };
    const res = campaign
      ? await supabase.from("campaigns").update({ ...row, wizard_step: Math.max(campaign.wizard_step, 2) }).eq("id", campaign.id).select("id").single()
      : await supabase.from("campaigns").insert({ ...row, workspace_id: current!.workspace_id, wizard_step: 2 }).select("id").single();
    setBusy(false);
    if (res.error) { toast.error(res.error.message); return; }
    qc.invalidateQueries({ queryKey: ["campaign", res.data.id] });
    qc.invalidateQueries({ queryKey: ["campaigns"] });
    onSaved(res.data.id);
  }

  return (
    <div className={`${card} max-w-2xl space-y-4`}>
      <div className="space-y-1.5"><Label>Campaign name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. UAE legal firms — Q4" disabled={readOnly} /></div>
      <div className="space-y-1.5"><Label>Agent</Label>
        <select className={sel} value={agentId} onChange={(e) => setAgentId(e.target.value)} disabled={readOnly}>
          <option value="">Choose an agent…</option>
          {agents.data?.map((a) => <option key={a.id} value={a.id}>{a.name} — {(a.organization as { name: string } | null)?.name}</option>)}
        </select>
        {agents.data?.length === 0 && <p className="text-xs text-muted-foreground">Create an agent first.</p>}
        {agent && <p className="text-xs text-muted-foreground">Targeting defaults from this agent: {[...agent.target_markets, ...agent.icp_industries, ...agent.icp_titles].join(" · ") || "none set"}</p>}
      </div>
      <div className="space-y-1.5"><Label>Primary language</Label>
        <select className={sel} value={language} onChange={(e) => setLanguage(e.target.value)} disabled={readOnly}>
          <option value="en">English</option><option value="ar">Arabic</option><option value="auto">Auto (from each lead's language)</option>
        </select>
      </div>
      <div className="flex items-center justify-between rounded-xl bg-secondary/50 p-3">
        <div><div className="text-sm font-medium">A/B testing</div><div className="text-xs text-muted-foreground">Write two variants (A and B) of each message.</div></div>
        <Switch checked={ab} onCheckedChange={setAb} disabled={readOnly} />
      </div>
      {!readOnly && <Button onClick={save} disabled={busy}>{busy && <Loader2 className="size-4 animate-spin" />}Save & continue</Button>}
    </div>
  );
}

// ---------- Campaign leads ----------
type CLRow = {
  id: string; score: number | null; reasoning: string | null; signals: string[]; decision: string; decision_overridden: boolean; qualify_error: string | null;
  research: ResearchProfile | null; research_status: string; research_error: string | null;
  lead: { first_name: string | null; last_name: string | null; email: string | null; title: string | null; company: string | null; website: string | null; company_domain: string | null; country: string | null; linkedin_url: string | null };
};
function useCampaignLeads(id: string) {
  return useQuery({
    queryKey: ["campaign-leads", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("campaign_leads")
        .select("id,score,reasoning,signals,decision,decision_overridden,qualify_error,research,research_status,research_error,lead:leads(first_name,last_name,email,title,company,website,company_domain,country,linkedin_url)")
        .eq("campaign_id", id).order("created_at").limit(5000);
      if (error) throw error;
      return data as unknown as CLRow[];
    },
  });
}
const leadName = (l: CLRow["lead"]) => [l.first_name, l.last_name].filter(Boolean).join(" ") || l.email || "—";

// ---------- Step 2 ----------
export function SourceStep({ campaign, onNext }: { campaign: Campaign; onNext: () => void }) {
  const qc = useQueryClient();
  const leads = useCampaignLeads(campaign.id);
  const [source, setSource] = useState(campaign.source_type ?? "file");
  const integ = useQuery({
    queryKey: ["integrations", campaign.workspace_id],
    queryFn: async () => (await supabase.from("integrations").select("provider,status,config,last_tested_at,last_error").eq("workspace_id", campaign.workspace_id)).data ?? [],
  });
  const apolloOk = integ.data?.some((i) => i.provider === "apollo" && i.status === "connected");
  async function choose(s: string) {
    setSource(s);
    await supabase.from("campaigns").update({ source_type: s }).eq("id", campaign.id);
    qc.invalidateQueries({ queryKey: ["campaign", campaign.id] });
  }
  const done = () => { qc.invalidateQueries({ queryKey: ["campaign-leads", campaign.id] }); qc.invalidateQueries({ queryKey: ["campaigns"] }); };
  const opts = [
    { id: "sheet", label: "Google Sheet", icon: Sheet, note: "Not connected" },
    { id: "file", label: "Excel / CSV", icon: FileSpreadsheet, note: "Upload a file" },
    { id: "apollo", label: "Apollo", icon: Database, note: apolloOk ? "Connected" : "Not connected" },
  ];
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {opts.map((o) => (
          <button key={o.id} onClick={() => choose(o.id)} className={`${card} flex items-center gap-3 text-left transition ${source === o.id ? "ring-2 ring-primary" : "hover:ring-1 hover:ring-primary/30"}`}>
            <div className="flex size-10 items-center justify-center rounded-xl bg-lavender text-primary"><o.icon className="size-5" /></div>
            <div><div className="font-semibold">{o.label}</div><div className="text-xs text-muted-foreground">{o.note}</div></div>
          </button>
        ))}
      </div>
      {source === "sheet" && <div className={card}><p className="text-sm text-muted-foreground">Google Sheets is not connected yet — it needs a Google sign-in app set up for your workspace. Export the sheet as CSV and use Excel / CSV for now.</p></div>}
      {source === "file" && <FileImport campaign={campaign} onDone={done} />}
      {source === "apollo" && (apolloOk ? <ApolloImport campaign={campaign} onDone={done} /> : <div className={card}><p className="text-sm text-muted-foreground">Apollo is not connected. A Super Admin can connect it on the Integrations page.</p></div>)}
      <div className={`${card} flex items-center justify-between`}>
        <div className="text-sm"><span className="font-semibold">{leads.data?.length ?? 0}</span> leads in this campaign</div>
        <Button disabled={!leads.data?.length} onClick={async () => { await bumpStep(campaign, 3); qc.invalidateQueries({ queryKey: ["campaign", campaign.id] }); onNext(); }}>Continue to qualification</Button>
      </div>
    </div>
  );
}

const FIELD_LABELS: Record<string, string> = { email: "Email", first_name: "First name", last_name: "Last name", title: "Job title", seniority: "Seniority", company: "Company", company_domain: "Company domain", website: "Website", company_size: "Company size", industry: "Industry", country: "Country", city: "City", language: "Language", linkedin_url: "LinkedIn URL", phone: "Phone" };
const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
const GUESS: Record<string, string[]> = { email: ["email", "emailaddress", "mail"], first_name: ["firstname", "first", "givenname"], last_name: ["lastname", "last", "surname", "familyname"], title: ["title", "jobtitle", "position", "role"], seniority: ["seniority", "level"], company: ["company", "companyname", "organization", "organisation", "account"], company_domain: ["domain", "companydomain"], website: ["website", "url", "companywebsite", "site"], company_size: ["companysize", "size", "employees", "headcount", "numberofemployees"], industry: ["industry", "sector"], country: ["country"], city: ["city", "location"], language: ["language", "lang"], linkedin_url: ["linkedin", "linkedinurl", "personlinkedinurl"], phone: ["phone", "mobile", "phonenumber"] };

function FileImport({ campaign, onDone }: { campaign: Campaign; onDone: () => void }) {
  const run = useServerFn(importLeads);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [map, setMap] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState("");

  async function onFile(f: File) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await f.arrayBuffer(), { type: "array", raw: /\.csv$/i.test(f.name), cellDates: false });
    const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]!]!, { defval: "", raw: false });
    if (!data.length) { toast.error("No rows found in this file"); return; }
    const hs = Object.keys(data[0]!);
    const m: Record<string, string> = {};
    for (const f2 of LEAD_FIELDS) { const h = hs.find((h) => GUESS[f2]?.includes(norm(h))); if (h) m[f2] = h; }
    setFileName(f.name); setRows(data); setHeaders(hs); setMap(m);
  }
  async function doImport() {
    if (!map["email"] && !map["linkedin_url"]) { toast.error("Map at least the Email or LinkedIn column"); return; }
    setBusy(true);
    try {
      let tot = { added: 0, duplicates: 0, suppressed: 0, invalid: 0 };
      for (let i = 0; i < rows.length; i += 2000) {
        const batch: LeadInput[] = rows.slice(i, i + 2000).map((r) => { const o: LeadInput = {}; for (const [f, h] of Object.entries(map)) if (h) o[f as keyof LeadInput] = String(r[h] ?? ""); return o; });
        const res = await run({ data: { campaignId: campaign.id, rows: batch } });
        tot = { added: tot.added + res.added, duplicates: tot.duplicates + res.duplicates, suppressed: tot.suppressed + res.suppressed, invalid: tot.invalid + res.invalid };
      }
      await supabase.from("campaigns").update({ source_config: { file: fileName, mapping: map } }).eq("id", campaign.id);
      toast.success(`Added ${tot.added} leads · skipped ${tot.duplicates} duplicates, ${tot.suppressed} suppressed, ${tot.invalid} invalid`);
      setRows([]); onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Import failed"); }
    setBusy(false);
  }
  return (
    <div className={`${card} space-y-4`}>
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed p-6 text-sm text-muted-foreground hover:bg-secondary/40">
        <Upload className="size-4" /> {fileName || "Choose an .xlsx, .xls or .csv file"}
        <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      </label>
      {rows.length > 0 && (
        <>
          <p className="text-sm"><b>{rows.length}</b> rows found. Match your columns:</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {LEAD_FIELDS.map((f) => (
              <div key={f} className="space-y-1"><Label className="text-xs">{FIELD_LABELS[f]}</Label>
                <select className={sel} value={map[f] ?? ""} onChange={(e) => setMap({ ...map, [f]: e.target.value })}>
                  <option value="">— not in file —</option>{headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select></div>
            ))}
          </div>
          <Button onClick={doImport} disabled={busy}>{busy && <Loader2 className="size-4 animate-spin" />}Import {rows.length} rows</Button>
        </>
      )}
    </div>
  );
}

const SENIORITIES = ["owner", "founder", "c_suite", "partner", "vp", "head", "director", "manager", "senior", "entry"];
const SIZES = ["1,10", "11,50", "51,200", "201,500", "501,1000", "1001,5000", "5001,10000", "10001,"];
const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

function ApolloImport({ campaign, onDone }: { campaign: Campaign; onDone: () => void }) {
  const agents = useAgents();
  const preview = useServerFn(apolloPreview);
  const run = useServerFn(apolloImport);
  const saved = (campaign.source_config["apollo"] as (ApolloFilters & { limit: number }) | undefined) ?? null;
  const [f, setF] = useState({ titles: "", seniorities: [] as string[], industries: "", locations: "", sizes: [] as string[], keywords: "" });
  const [limit, setLimit] = useState(saved?.limit ?? 25);
  const [total, setTotal] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const a = agents.data?.find((x) => x.id === campaign.agent_id);
    const src = saved ?? (a ? { titles: a.icp_titles, seniorities: a.icp_seniorities, industries: a.icp_industries, locations: a.target_markets, sizes: [], keywords: "" } : null);
    if (src) setF({ titles: src.titles.join(", "), seniorities: src.seniorities.filter((s) => SENIORITIES.includes(s)), industries: src.industries.join(", "), locations: src.locations.join(", "), sizes: src.sizes, keywords: src.keywords });
  }, [agents.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const filters: ApolloFilters = { titles: list(f.titles), seniorities: f.seniorities, industries: list(f.industries), locations: list(f.locations), sizes: f.sizes, keywords: f.keywords };
  const toggle = (k: "seniorities" | "sizes", v: string) => setF({ ...f, [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v] });

  async function doPreview() {
    setBusy(true);
    try { setTotal((await preview({ data: { campaignId: campaign.id, filters } })).total); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    setBusy(false);
  }
  async function doImport() {
    setBusy(true);
    try {
      const r = await run({ data: { campaignId: campaign.id, filters, limit } });
      await supabase.from("campaigns").update({ source_config: { apollo: { ...filters, limit } } }).eq("id", campaign.id);
      toast.success(`Added ${r.added} leads (${r.credits} Apollo credits) · skipped ${r.duplicates} duplicates, ${r.suppressed} suppressed, ${r.invalid + r.unmatched} without contact details`);
      onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    setBusy(false);
  }
  return (
    <div className={`${card} space-y-4`}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1"><Label>Job titles</Label><Input value={f.titles} onChange={(e) => setF({ ...f, titles: e.target.value })} placeholder="Head of Legal, General Counsel" /></div>
        <div className="space-y-1"><Label>Industries</Label><Input value={f.industries} onChange={(e) => setF({ ...f, industries: e.target.value })} placeholder="legal services, healthcare" /></div>
        <div className="space-y-1"><Label>Locations</Label><Input value={f.locations} onChange={(e) => setF({ ...f, locations: e.target.value })} placeholder="United Arab Emirates, Saudi Arabia" /></div>
        <div className="space-y-1"><Label>Keywords</Label><Input value={f.keywords} onChange={(e) => setF({ ...f, keywords: e.target.value })} placeholder="translation, localization" /></div>
      </div>
      <div><Label>Seniority</Label><div className="mt-1.5 flex flex-wrap gap-1.5">{SENIORITIES.map((s) => <Chip key={s} on={f.seniorities.includes(s)} onClick={() => toggle("seniorities", s)}>{s.replace("_", "-")}</Chip>)}</div></div>
      <div><Label>Company size (employees)</Label><div className="mt-1.5 flex flex-wrap gap-1.5">{SIZES.map((s) => <Chip key={s} on={f.sizes.includes(s)} onClick={() => toggle("sizes", s)}>{s.endsWith(",") ? `${s.slice(0, -1)}+` : s.replace(",", "–")}</Chip>)}</div></div>
      <div className="flex flex-wrap items-end gap-3 rounded-xl bg-secondary/50 p-4">
        <Button variant="outline" onClick={doPreview} disabled={busy}>Preview match count</Button>
        {total !== null && <span className="text-sm"><b>{total.toLocaleString()}</b> people match</span>}
        <div className="ml-auto space-y-1"><Label className="text-xs">Leads to import (max 100 per run)</Label><Input type="number" min={1} max={100} value={limit} onChange={(e) => setLimit(Math.min(100, Math.max(1, Number(e.target.value) || 1)))} className="w-32" /></div>
        <Button onClick={doImport} disabled={busy}>{busy && <Loader2 className="size-4 animate-spin" />}Import</Button>
      </div>
      <p className="text-xs text-muted-foreground">Estimated cost: about <b>{limit}</b> Apollo credits (one per contact revealed). The search preview is free. Leads already in your database or on the suppression list are skipped.</p>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={`rounded-full px-3 py-1 text-xs capitalize ${on ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-lavender"}`}>{children}</button>;
}

// ---------- Batch runner ----------
async function runBatches(ids: string[], size: number, fn: (b: string[]) => Promise<{ results: { ok: boolean; error?: string }[] }>, onProgress: (n: number) => void) {
  let done = 0, failed = 0; let lastError = "";
  for (let i = 0; i < ids.length; i += size) {
    const r = await fn(ids.slice(i, i + size));
    for (const x of r.results) if (!x.ok) { failed++; lastError = x.error ?? ""; }
    done += Math.min(size, ids.length - i);
    onProgress(done);
    if (/credits|\[40[23]\]/i.test(lastError)) break;
  }
  return { failed, lastError };
}

// ---------- Step 3 ----------
export function QualificationStep({ campaign, onNext }: { campaign: Campaign; onNext: () => void }) {
  const qc = useQueryClient();
  const { current } = useWorkspace();
  const leads = useCampaignLeads(campaign.id);
  const qualify = useServerFn(qualifyLeads);
  const [w, setW] = useState(campaign.qualification_weights);
  const [threshold, setThreshold] = useState(campaign.qualification_threshold);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const readOnly = current?.role === "viewer";
  const pending = leads.data?.filter((l) => l.score === null) ?? [];
  const counts = useMemo(() => ({ q: leads.data?.filter((l) => l.decision === "qualified").length ?? 0, n: leads.data?.filter((l) => l.decision === "not_qualified").length ?? 0 }), [leads.data]);

  async function saveSettings() {
    const { error } = await supabase.from("campaigns").update({ qualification_weights: w, qualification_threshold: threshold }).eq("id", campaign.id);
    if (error) { toast.error(error.message); return; }
    // re-apply threshold to scored, non-overridden leads
    const scored = leads.data?.filter((l) => l.score !== null && !l.decision_overridden) ?? [];
    const up = scored.filter((l) => l.score! >= threshold && l.decision !== "qualified").map((l) => l.id);
    const down = scored.filter((l) => l.score! < threshold && l.decision !== "not_qualified").map((l) => l.id);
    if (up.length) await supabase.from("campaign_leads").update({ decision: "qualified" }).in("id", up);
    if (down.length) await supabase.from("campaign_leads").update({ decision: "not_qualified" }).in("id", down);
    toast.success("Qualification settings saved");
    qc.invalidateQueries({ queryKey: ["campaign", campaign.id] });
    qc.invalidateQueries({ queryKey: ["campaign-leads", campaign.id] });
  }
  async function score(ids: string[]) {
    await supabase.from("campaigns").update({ qualification_weights: w, qualification_threshold: threshold }).eq("id", campaign.id);
    setProgress({ done: 0, total: ids.length });
    try {
      const r = await runBatches(ids, 5, (b) => qualify({ data: { campaignId: campaign.id, ids: b } }), (n) => { setProgress({ done: n, total: ids.length }); qc.invalidateQueries({ queryKey: ["campaign-leads", campaign.id] }); });
      r.failed ? toast.error(`${r.failed} leads couldn't be scored: ${r.lastError}`) : toast.success("Scoring finished");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Scoring failed"); }
    setProgress(null);
  }
  async function override(id: string, decision: string) {
    const { error } = await supabase.from("campaign_leads").update({ decision, decision_overridden: true }).eq("id", id);
    if (error) toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["campaign-leads", campaign.id] });
  }
  const weightRow = (k: keyof typeof w, label: string) => (
    <div className="space-y-2"><div className="flex justify-between text-sm"><span>{label}</span><span className="text-muted-foreground">{w[k]}%</span></div>
      <Slider value={[w[k]]} min={0} max={100} step={5} disabled={readOnly} onValueChange={([v]) => setW({ ...w, [k]: v ?? 0 })} /></div>
  );
  return (
    <div className="space-y-4">
      <div className={`${card} grid gap-6 lg:grid-cols-2`}>
        <div className="space-y-4">
          <h3 className="font-semibold">Scoring criteria weights</h3>
          {weightRow("size", "Company size")}
          {weightRow("fit", "Business fit with the brand's offering")}
          {weightRow("multilingual", "Multilingual signals (languages, offices)")}
        </div>
        <div className="space-y-4">
          <h3 className="font-semibold">Qualification threshold</h3>
          <div className="flex items-center gap-4"><Slider value={[threshold]} min={1} max={10} step={1} disabled={readOnly} onValueChange={([v]) => setThreshold(v ?? 5)} /><span className="w-8 text-2xl font-semibold text-primary">{threshold}</span></div>
          <p className="text-xs text-muted-foreground">Leads scoring below {threshold} are marked Not Qualified and stop here.</p>
          {!readOnly && <Button variant="outline" onClick={saveSettings}>Save settings</Button>}
        </div>
      </div>
      <div className={`${card} flex flex-wrap items-center gap-3`}>
        <span className="text-sm"><b className="text-success">{counts.q}</b> qualified · <b className="text-destructive">{counts.n}</b> not qualified · <b>{pending.length}</b> not scored</span>
        <div className="ml-auto flex gap-2">
          {progress && <span className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />{progress.done}/{progress.total}</span>}
          {!readOnly && <Button disabled={!!progress || !pending.length} onClick={() => score(pending.map((l) => l.id))}>Score {pending.length} leads</Button>}
          {!readOnly && !!leads.data?.length && <Button variant="ghost" disabled={!!progress} onClick={() => score(leads.data!.filter((l) => !l.decision_overridden).map((l) => l.id))}>Re-score all</Button>}
          <Button variant="outline" disabled={!counts.q} onClick={async () => { await bumpStep(campaign, 4); qc.invalidateQueries({ queryKey: ["campaign", campaign.id] }); onNext(); }}>Continue to research</Button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-2xl bg-card shadow-soft">
        <table className="w-full text-sm">
          <thead className="bg-secondary/60 text-left text-xs uppercase text-muted-foreground"><tr><th className="p-3">Lead</th><th className="p-3">Company</th><th className="p-3">Score</th><th className="p-3">Why</th><th className="p-3">Decision</th></tr></thead>
          <tbody>
            {leads.data?.map((l) => (
              <tr key={l.id} className="border-t align-top">
                <td className="p-3"><div className="font-medium">{leadName(l.lead)}</div><div className="text-xs text-muted-foreground">{l.lead.title}</div></td>
                <td className="p-3">{l.lead.company ?? "—"}<div className="text-xs text-muted-foreground">{l.lead.country}</div></td>
                <td className="p-3">{l.score !== null ? <span className={`font-semibold ${l.score >= threshold ? "text-success" : "text-destructive"}`}>{l.score}/10</span> : "—"}</td>
                <td className="max-w-md p-3 text-xs">{l.qualify_error ? <span className="text-destructive">{l.qualify_error}</span> : l.reasoning ?? <span className="text-muted-foreground">Not scored yet</span>}
                  {l.signals?.length > 0 && <ul className="mt-1 list-disc pl-4 text-muted-foreground">{l.signals.map((s, i) => <li key={i}>{s}</li>)}</ul>}</td>
                <td className="p-3">
                  <select className={`${sel} w-40`} value={l.decision} disabled={readOnly} onChange={(e) => override(l.id, e.target.value)}>
                    <option value="pending">Pending</option><option value="qualified">Qualified</option><option value="not_qualified">Not qualified</option>
                  </select>
                  {l.decision_overridden && <div className="mt-1 text-xs text-warning">Manually set</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------- Step 4 ----------
export function ResearchStep({ campaign, onNext }: { campaign: Campaign; onNext?: () => void }) {
  const qc = useQueryClient();
  const { current } = useWorkspace();
  const leads = useCampaignLeads(campaign.id);
  const research = useServerFn(researchLeads);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const readOnly = current?.role === "viewer";
  const qualified = leads.data?.filter((l) => l.decision === "qualified") ?? [];
  const todo = qualified.filter((l) => l.research_status !== "done");

  async function go(ids: string[]) {
    setProgress({ done: 0, total: ids.length });
    try {
      const r = await runBatches(ids, 3, (b) => research({ data: { campaignId: campaign.id, ids: b } }), (n) => { setProgress({ done: n, total: ids.length }); qc.invalidateQueries({ queryKey: ["campaign-leads", campaign.id] }); });
      r.failed ? toast.error(`${r.failed} leads couldn't be researched: ${r.lastError}`) : toast.success("Research finished");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Research failed"); }
    setProgress(null);
  }
  return (
    <div className="space-y-4">
      <div className={`${card} flex flex-wrap items-center gap-3`}>
        <span className="text-sm"><b>{qualified.length - todo.length}</b> of <b>{qualified.length}</b> qualified leads researched</span>
        <div className="ml-auto flex gap-2">
          {progress && <span className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />{progress.done}/{progress.total}</span>}
          {!readOnly && <Button disabled={!!progress || !todo.length} onClick={() => go(todo.map((l) => l.id))}>Research {todo.length} leads</Button>}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Research reads each company's website (home, about and news pages) and the lead's details. Only facts found there are used, with links to the pages.</p>
      <div className="space-y-2">
        {qualified.map((l) => (
          <div key={l.id} className="rounded-2xl bg-card shadow-soft">
            <button className="flex w-full items-center gap-3 p-4 text-left" onClick={() => setOpen(open === l.id ? null : l.id)}>
              <div className="flex-1"><div className="font-medium">{leadName(l.lead)} <span className="font-normal text-muted-foreground">· {l.lead.title} at {l.lead.company}</span></div></div>
              <span className={`rounded-full px-2.5 py-0.5 text-xs ${l.research_status === "done" ? "bg-success/15 text-success" : l.research_status === "failed" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}>
                {l.research_status === "done" ? "Researched" : l.research_status === "failed" ? "Failed" : "Not researched"}</span>
              <ChevronDown className={`size-4 transition ${open === l.id ? "rotate-180" : ""}`} />
            </button>
            {open === l.id && (
              <div className="border-t p-4 text-sm">
                {l.research_error && <p className="mb-2 text-destructive">{l.research_error}</p>}
                {l.research ? <Profile r={l.research} /> : <p className="text-muted-foreground">No research yet.</p>}
                {!readOnly && l.research && <Button size="sm" variant="ghost" className="mt-3" disabled={!!progress} onClick={() => go([l.id])}>Re-run research</Button>}
              </div>
            )}
          </div>
        ))}
      </div>
      {onNext && <Button variant="outline" onClick={async () => { await bumpStep(campaign, 5); qc.invalidateQueries({ queryKey: ["campaign", campaign.id] }); onNext(); }}>Continue to sequence →</Button>}
    </div>
  );
}

function Profile({ r }: { r: ResearchProfile }) {
  const L = ({ t, items }: { t: string; items: string[] }) => items.length ? <div><div className="text-xs font-semibold uppercase text-muted-foreground">{t}</div><ul className="mt-1 list-disc pl-5">{items.map((x, i) => <li key={i}>{x}</li>)}</ul></div> : null;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="md:col-span-2"><div className="text-xs font-semibold uppercase text-muted-foreground">Company</div><p className="mt-1">{r.company_overview}</p></div>
      <L t="Products & services" items={r.products_services} />
      <L t="Markets" items={r.markets} />
      <div><div className="text-xs font-semibold uppercase text-muted-foreground">Contact's role</div><p className="mt-1">{r.contact_role}</p></div>
      <L t="Likely responsibilities" items={r.likely_responsibilities} />
      <L t="Personalization angles" items={r.personalization_hooks} />
      <div><div className="text-xs font-semibold uppercase text-muted-foreground">Recent news</div>
        {r.recent_news.length ? <ul className="mt-1 list-disc pl-5">{r.recent_news.map((n, i) => <li key={i}><a href={n.url} target="_blank" rel="noreferrer" className="text-primary underline">{n.headline}</a></li>)}</ul> : <p className="mt-1 text-muted-foreground">None found on the website.</p>}</div>
      <div className="md:col-span-2"><div className="text-xs font-semibold uppercase text-muted-foreground">Sources</div>
        <div className="mt-1 flex flex-wrap gap-2">{r.sources.map((s) => <a key={s} href={s} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-xs hover:bg-lavender">{s.replace(/^https?:\/\//, "").slice(0, 50)}<ExternalLink className="size-3" /></a>)}</div></div>
    </div>
  );
}
