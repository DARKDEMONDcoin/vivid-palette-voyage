import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/external/client";
import { useWorkspace } from "@/lib/workspace";
import { gdprDelete } from "@/lib/settings.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const Card = ({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) => (
  <div className="mt-4 rounded-2xl bg-card p-6 shadow-soft">
    <h2 className="text-lg font-semibold">{title}</h2>{desc && <p className="text-sm text-muted-foreground">{desc}</p>}
    <div className="mt-4">{children}</div>
  </div>
);
const err = (e: unknown) => toast.error(e instanceof Error ? e.message : (e as { message?: string })?.message ?? "Something went wrong");
const randomToken = (n = 32) => Array.from(crypto.getRandomValues(new Uint8Array(n))).map((b) => b.toString(16).padStart(2, "0")).join("");
async function sha256(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

/* ---------------- Compliance & suppression ---------------- */
export function Compliance() {
  const { current, user, isAdmin } = useWorkspace();
  const ws = current!.workspace_id;
  const qc = useQueryClient();
  const [value, setValue] = useState(""), [kind, setKind] = useState("email"), [org, setOrg] = useState("all"), [filter, setFilter] = useState("");
  const [gdpr, setGdpr] = useState(""), [busy, setBusy] = useState(false);
  const orgs = useQuery({ queryKey: ["orgs-min", ws], queryFn: async () => (await supabase.from("organizations").select("id,name").eq("workspace_id", ws)).data ?? [] });
  const list = useQuery({ queryKey: ["suppression-full", ws], queryFn: async () => {
    const { data, error } = await supabase.from("suppression_list").select("id,value,kind,reason,organization_id,created_at").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(1000);
    if (error) throw error; return data ?? [];
  } });
  const orgName = new Map((orgs.data ?? []).map((o) => [o.id, o.name]));
  async function add() {
    const v = value.trim().toLowerCase().replace(/^@/, "");
    if (!v) return;
    if (kind === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return void toast.error("Enter a valid email");
    if (kind === "domain" && !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(v)) return void toast.error("Enter a domain like example.com");
    const { error } = await supabase.from("suppression_list").insert({ workspace_id: ws, value: v, kind, reason: "Added in Settings", created_by: user.id, organization_id: org === "all" ? null : org });
    if (error) return void err(error);
    setValue(""); toast.success("Added"); qc.invalidateQueries({ queryKey: ["suppression-full"] }); qc.invalidateQueries({ queryKey: ["suppression"] });
  }
  async function remove(id: string) {
    const { error } = await supabase.from("suppression_list").delete().eq("id", id);
    if (error) return void err(error);
    qc.invalidateQueries({ queryKey: ["suppression-full"] });
  }
  async function erase() {
    if (!confirm(`Permanently delete every record of ${gdpr}? This can't be undone.`)) return;
    setBusy(true);
    try { const r = await gdprDelete({ data: { workspaceId: ws, email: gdpr } }); toast.success(`Deleted ${r.deleted} lead record(s); email suppressed`); setGdpr(""); qc.invalidateQueries(); }
    catch (e) { err(e); } finally { setBusy(false); }
  }
  const rows = (list.data ?? []).filter((r) => !filter || r.value.includes(filter.toLowerCase()));
  return (<>
    <Card title="Suppression list" desc="Emails and domains here are never imported or contacted. Unsubscribe replies are added automatically.">
      {isAdmin && <div className="flex flex-wrap gap-2">
        <Select value={kind} onValueChange={setKind}><SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="email">Email</SelectItem><SelectItem value="domain">Domain</SelectItem></SelectContent></Select>
        <Input className="w-64" placeholder={kind === "email" ? "name@company.com" : "company.com"} value={value} onChange={(e) => setValue(e.target.value)} />
        <Select value={org} onValueChange={setOrg}><SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All organizations</SelectItem>{orgs.data?.map((o) => <SelectItem key={o.id} value={o.id}>{o.name} only</SelectItem>)}</SelectContent></Select>
        <Button onClick={add}>Add</Button>
      </div>}
      <Input className="mt-4 w-64" placeholder="Search…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      {list.isLoading ? <Skeleton className="mt-3 h-24" /> : !rows.length ? <p className="mt-3 text-sm text-muted-foreground">Nothing suppressed yet.</p> : (
        <Table className="mt-3"><TableHeader><TableRow><TableHead>Value</TableHead><TableHead>Type</TableHead><TableHead>Scope</TableHead><TableHead>Reason</TableHead><TableHead>Added</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>{rows.slice(0, 200).map((r) => (
            <TableRow key={r.id}><TableCell className="font-medium">{r.value}</TableCell><TableCell>{r.kind}</TableCell>
              <TableCell>{r.organization_id ? orgName.get(r.organization_id) ?? "Organization" : "Global"}</TableCell>
              <TableCell className="text-muted-foreground">{r.reason}</TableCell><TableCell className="text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</TableCell>
              <TableCell>{isAdmin && <Button size="icon" variant="ghost" aria-label="Remove" onClick={() => remove(r.id)}><Trash2 className="size-4" /></Button>}</TableCell></TableRow>))}
          </TableBody></Table>)}
    </Card>
    {isAdmin && <Card title="GDPR data deletion" desc="Erases a person's lead record, messages and replies from this workspace, then suppresses the email so they're never re-imported.">
      <div className="flex flex-wrap gap-2"><Input className="w-72" placeholder="person@company.com" value={gdpr} onChange={(e) => setGdpr(e.target.value)} />
        <Button variant="destructive" disabled={busy || !gdpr} onClick={erase}>{busy ? "Deleting…" : "Delete all data"}</Button></div>
    </Card>}
    <Card title="Not available yet">
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Automatic unsubscribe link, sender footer and bounce handling — need Gmail/Outlook sending to be connected.</li>
        <li>Per-country call-time windows — calls currently follow each agent's sending window.</li>
      </ul>
    </Card>
  </>);
}

/* ---------------- Usage ---------------- */
export function Usage() {
  const { current } = useWorkspace();
  const ws = current!.workspace_id;
  const q = useQuery({ queryKey: ["usage", ws], queryFn: async () => {
    const start = new Date(); start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0);
    const [m, camps, orgs, apollo] = await Promise.all([
      supabase.from("messages").select("campaign_id,channel").eq("workspace_id", ws).eq("status", "sent").gte("sent_at", start.toISOString()).limit(10000),
      supabase.from("campaigns").select("id,name,organization_id").eq("workspace_id", ws),
      supabase.from("organizations").select("id,name").eq("workspace_id", ws),
      supabase.from("leads").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("source", "apollo").gte("created_at", start.toISOString()),
    ]);
    const orgOf = new Map((camps.data ?? []).map((c) => [c.id, c.organization_id]));
    const z = () => ({ email: 0, linkedin: 0, call: 0 });
    const total = z(); const byOrg = new Map<string, ReturnType<typeof z>>(); const byCamp = new Map<string, ReturnType<typeof z>>();
    for (const x of m.data ?? []) {
      const ch = x.channel as keyof ReturnType<typeof z>; if (!(ch in total)) continue;
      total[ch]++;
      const o = orgOf.get(x.campaign_id) ?? "?"; if (!byOrg.has(o)) byOrg.set(o, z()); byOrg.get(o)![ch]++;
      if (!byCamp.has(x.campaign_id)) byCamp.set(x.campaign_id, z()); byCamp.get(x.campaign_id)![ch]++;
    }
    return { total, apollo: apollo.count ?? 0, byOrg, byCamp, orgs: orgs.data ?? [], camps: camps.data ?? [], month: start.toLocaleString(undefined, { month: "long", year: "numeric" }) };
  } });
  if (!q.data) return <Skeleton className="mt-4 h-48" />;
  const d = q.data;
  const rowsFor = (list: { id: string; name: string }[], m: Map<string, { email: number; linkedin: number; call: number }>) => list.filter((x) => m.has(x.id)).map((x) => ({ name: x.name, ...m.get(x.id)! }));
  const T = ({ rows }: { rows: { name: string; email: number; linkedin: number; call: number }[] }) => !rows.length ? <p className="text-sm text-muted-foreground">No usage this month.</p> : (
    <Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Emails</TableHead><TableHead>LinkedIn actions</TableHead><TableHead>Calls</TableHead></TableRow></TableHeader>
      <TableBody>{rows.map((r) => <TableRow key={r.name}><TableCell className="font-medium">{r.name}</TableCell><TableCell>{r.email}</TableCell><TableCell>{r.linkedin}</TableCell><TableCell>{r.call}</TableCell></TableRow>)}</TableBody></Table>);
  return (<>
    <Card title={`Usage — ${d.month}`}>
      <div className="grid gap-4 sm:grid-cols-4">
        {[["Emails sent", d.total.email], ["LinkedIn actions", d.total.linkedin], ["Calls placed", d.total.call], ["Apollo leads imported", d.apollo]].map(([l, v]) => (
          <div key={l} className="rounded-xl bg-secondary p-4"><p className="text-xs text-muted-foreground">{l}</p><p className="mt-1 font-display text-2xl font-semibold">{v}</p></div>))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">AI token use, call minutes and cost estimates aren't tracked yet. Payment and plan limits come later.</p>
    </Card>
    <Card title="By organization"><T rows={rowsFor(d.orgs, d.byOrg)} /></Card>
    <Card title="By campaign"><T rows={rowsFor(d.camps, d.byCamp)} /></Card>
  </>);
}

/* ---------------- Audit log ---------------- */
export function AuditLog() {
  const { current } = useWorkspace();
  const ws = current!.workspace_id;
  const [entity, setEntity] = useState("all");
  const q = useQuery({ queryKey: ["audit", ws, entity], queryFn: async () => {
    let r = supabase.from("audit_log").select("id,actor,action,entity,details,created_at").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(300);
    if (entity !== "all") r = r.eq("entity", entity);
    const { data, error } = await r; if (error) throw error;
    const ids = [...new Set((data ?? []).map((x) => x.actor).filter(Boolean))] as string[];
    const { data: ps } = ids.length ? await supabase.from("profiles").select("id,full_name,email").in("id", ids) : { data: [] };
    const who = new Map((ps ?? []).map((p) => [p.id, p.full_name || p.email]));
    return (data ?? []).map((x) => ({ ...x, who: x.actor ? who.get(x.actor) ?? "Member" : "System" }));
  } });
  const ents = ["agents", "campaigns", "messages", "integrations", "organizations", "workspace_members", "suppression_list", "api_keys", "webhooks", "leads"];
  return (
    <Card title="Audit log" desc="Who did what and when. Visible to Super Admins only.">
      <Select value={entity} onValueChange={setEntity}><SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="all">All activity</SelectItem>{ents.map((e) => <SelectItem key={e} value={e}>{e.replace("_", " ")}</SelectItem>)}</SelectContent></Select>
      {q.isLoading ? <Skeleton className="mt-3 h-32" /> : !q.data?.length ? <p className="mt-3 text-sm text-muted-foreground">No activity recorded yet.</p> : (
        <Table className="mt-3"><TableHeader><TableRow><TableHead>When</TableHead><TableHead>Who</TableHead><TableHead>Action</TableHead><TableHead>Details</TableHead></TableRow></TableHeader>
          <TableBody>{q.data.map((r) => {
            const d = r.details as Record<string, unknown>;
            return (<TableRow key={r.id}><TableCell className="whitespace-nowrap text-muted-foreground">{new Date(r.created_at).toLocaleString()}</TableCell><TableCell>{r.who}</TableCell>
              <TableCell><span className="font-medium">{r.entity.replace("_", " ")}</span> · {r.action}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{Object.entries(d).map(([k, v]) => `${k}: ${String(v)}`).join(" · ")}</TableCell></TableRow>);
          })}</TableBody></Table>)}
    </Card>
  );
}

/* ---------------- API & webhooks ---------------- */
export function ApiWebhooks() {
  const { current, user } = useWorkspace();
  const ws = current!.workspace_id;
  const qc = useQueryClient();
  const [keyName, setKeyName] = useState(""), [newKey, setNewKey] = useState<string | null>(null);
  const [url, setUrl] = useState(""), [events, setEvents] = useState<string[]>(["reply.received", "sql.created"]), [newSecret, setNewSecret] = useState<string | null>(null);
  const keys = useQuery({ queryKey: ["api-keys", ws], queryFn: async () => (await supabase.from("api_keys").select("*").eq("workspace_id", ws).order("created_at", { ascending: false })).data ?? [] });
  const hooks = useQuery({ queryKey: ["webhooks", ws], queryFn: async () => (await supabase.from("webhooks").select("id,url,events,active,last_status,last_error,last_sent_at").eq("workspace_id", ws).order("created_at")).data ?? [] });
  async function createKey() {
    if (!keyName.trim()) return void toast.error("Name the key");
    const raw = `oai_${randomToken(24)}`;
    const { error } = await supabase.from("api_keys").insert({ workspace_id: ws, name: keyName.trim(), prefix: raw.slice(0, 10), key_hash: await sha256(raw), created_by: user.id });
    if (error) return void err(error);
    setNewKey(raw); setKeyName(""); qc.invalidateQueries({ queryKey: ["api-keys"] });
  }
  async function revoke(id: string) { const { error } = await supabase.from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", id); if (error) return void err(error); qc.invalidateQueries({ queryKey: ["api-keys"] }); }
  async function addHook() {
    if (!/^https:\/\/.+/.test(url.trim())) return void toast.error("Use an https:// URL");
    if (!events.length) return void toast.error("Pick at least one event");
    const secret = `whsec_${randomToken(24)}`;
    const { error } = await supabase.from("webhooks").insert({ workspace_id: ws, url: url.trim(), events, secret, created_by: user.id });
    if (error) return void err(error);
    setNewSecret(secret); setUrl(""); qc.invalidateQueries({ queryKey: ["webhooks"] });
  }
  async function patchHook(id: string, patch: { active?: boolean }) { const { error } = await supabase.from("webhooks").update(patch).eq("id", id); if (error) return void err(error); qc.invalidateQueries({ queryKey: ["webhooks"] }); }
  async function delHook(id: string) { const { error } = await supabase.from("webhooks").delete().eq("id", id); if (error) return void err(error); qc.invalidateQueries({ queryKey: ["webhooks"] }); }
  const copy = (s: string) => { void navigator.clipboard.writeText(s); toast.success("Copied"); };
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return (<>
    <Card title="API keys" desc="Read your workspace's leads from other tools.">
      <div className="flex gap-2"><Input className="w-64" placeholder="Key name, e.g. Zapier" value={keyName} onChange={(e) => setKeyName(e.target.value)} /><Button onClick={createKey}>Create key</Button></div>
      {newKey && <div className="mt-3 rounded-xl border border-warning bg-warning/10 p-3 text-sm">Copy this key now — it won't be shown again.
        <div className="mt-2 flex items-center gap-2"><code className="break-all rounded bg-card px-2 py-1">{newKey}</code><Button size="icon" variant="ghost" aria-label="Copy" onClick={() => copy(newKey)}><Copy className="size-4" /></Button></div></div>}
      <p className="mt-3 text-xs text-muted-foreground">Usage: <code>GET {origin}/api/public/v1/leads?limit=100&amp;offset=0</code> with header <code>Authorization: Bearer &lt;key&gt;</code></p>
      {!!keys.data?.length && <Table className="mt-3"><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Key</TableHead><TableHead>Last used</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>{keys.data.map((k) => <TableRow key={k.id}><TableCell className="font-medium">{k.name}</TableCell><TableCell><code>{k.prefix}…</code></TableCell>
          <TableCell className="text-muted-foreground">{k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "Never"}</TableCell>
          <TableCell>{k.revoked_at ? "Revoked" : "Active"}</TableCell><TableCell>{!k.revoked_at && <Button size="sm" variant="ghost" onClick={() => revoke(k.id)}>Revoke</Button>}</TableCell></TableRow>)}</TableBody></Table>}
    </Card>
    <Card title="Webhooks" desc="We POST JSON to your URL when events happen, signed with an X-Signature: sha256=… HMAC of the body.">
      <div className="flex flex-wrap items-center gap-3"><Input className="w-80" placeholder="https://example.com/hooks/outreach" value={url} onChange={(e) => setUrl(e.target.value)} />
        {["reply.received", "sql.created"].map((ev) => <label key={ev} className="flex items-center gap-2 text-sm"><Switch checked={events.includes(ev)} onCheckedChange={(c) => setEvents((x) => c ? [...x, ev] : x.filter((y) => y !== ev))} />{ev}</label>)}
        <Button onClick={addHook}>Add webhook</Button></div>
      {newSecret && <div className="mt-3 rounded-xl border border-warning bg-warning/10 p-3 text-sm">Signing secret — copy it now.
        <div className="mt-2 flex items-center gap-2"><code className="break-all rounded bg-card px-2 py-1">{newSecret}</code><Button size="icon" variant="ghost" aria-label="Copy" onClick={() => copy(newSecret)}><Copy className="size-4" /></Button></div></div>}
      {!!hooks.data?.length && <Table className="mt-3"><TableHeader><TableRow><TableHead>URL</TableHead><TableHead>Events</TableHead><TableHead>Last delivery</TableHead><TableHead>On</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>{hooks.data.map((h) => <TableRow key={h.id}><TableCell className="max-w-64 truncate font-medium">{h.url}</TableCell><TableCell className="text-xs">{h.events.join(", ")}</TableCell>
          <TableCell className="text-xs text-muted-foreground">{h.last_sent_at ? `${h.last_status ?? "error"} · ${new Date(h.last_sent_at).toLocaleString()}${h.last_error ? ` · ${h.last_error}` : ""}` : "Not sent yet"}</TableCell>
          <TableCell><Switch checked={h.active} onCheckedChange={(c) => patchHook(h.id, { active: c })} /></TableCell>
          <TableCell><Button size="icon" variant="ghost" aria-label="Delete" onClick={() => delHook(h.id)}><Trash2 className="size-4" /></Button></TableCell></TableRow>)}</TableBody></Table>}
    </Card>
  </>);
}

/* ---------------- Notifications ---------------- */
const prefKeys = [["sql_found", "A new SQL is found"], ["mailbox_error", "An agent's mailbox has a problem"], ["campaign_finished", "A campaign finishes"], ["approvals_waiting", "Messages are waiting for approval"]] as const;
type PrefKey = (typeof prefKeys)[number][0] | "email_enabled";
export function Notifications() {
  const { current, user } = useWorkspace();
  const ws = current!.workspace_id;
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["notif-prefs", ws], queryFn: async () => (await supabase.from("notification_prefs").select("*").eq("workspace_id", ws).eq("user_id", user.id).maybeSingle()).data });
  const p = q.data ?? { sql_found: true, mailbox_error: true, campaign_finished: true, approvals_waiting: true, email_enabled: false };
  async function set(k: PrefKey, v: boolean) {
    const { error } = await supabase.from("notification_prefs").upsert({ ...p, user_id: user.id, workspace_id: ws, [k]: v });
    if (error) return void err(error);
    qc.invalidateQueries({ queryKey: ["notif-prefs"] });
  }
  if (q.isLoading) return <Skeleton className="mt-4 h-40" />;
  return (
    <Card title="Notifications" desc="Choose what shows in the bell at the top of the app.">
      <div className="space-y-3">
        {prefKeys.map(([k, l]) => <div key={k} className="flex items-center justify-between"><Label>{l}</Label><Switch checked={p[k]} onCheckedChange={(v) => set(k, v)} /></div>)}
        <div className="flex items-center justify-between border-t pt-3"><div><Label>Also send by email</Label><p className="text-xs text-muted-foreground">Saved for later — email delivery for notifications isn't set up yet.</p></div>
          <Switch checked={p.email_enabled} onCheckedChange={(v) => set("email_enabled", v)} /></div>
      </div>
    </Card>
  );
}
