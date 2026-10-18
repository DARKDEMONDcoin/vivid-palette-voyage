import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { AgentMailbox } from "@/components/agent-mailbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/external/client";
import { useWorkspace } from "@/lib/workspace";
import type { Database } from "@/integrations/supabase/types";

export type AgentRow = Database["public"]["Tables"]["agents"]["Row"];
type AgentInsert = Database["public"]["Tables"]["agents"]["Insert"];

export const TONES = ["professional", "consultative", "friendly", "concise"] as const;
export const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const TIMEZONES = ["Asia/Dubai", "Asia/Riyadh", "Africa/Cairo", "Europe/London", "Europe/Berlin", "America/New_York", "America/Los_Angeles", "Asia/Singapore", "UTC"];

const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
const join = (a: string[] | null | undefined) => (a ?? []).join(", ");

export function useAvatarUrl(path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) { setUrl(null); return; }
    supabase.storage.from("org-files").createSignedUrl(path, 3600).then(({ data }) => setUrl(data?.signedUrl ?? null));
  }, [path]);
  return url;
}

export function AgentAvatar({ path, name, className = "size-10" }: { path: string | null | undefined; name: string; className?: string }) {
  const url = useAvatarUrl(path);
  return (
    <Avatar className={className}>
      {url && <AvatarImage src={url} alt={name} className="object-cover" />}
      <AvatarFallback className="bg-lavender font-display text-primary">{name.slice(0, 2).toUpperCase()}</AvatarFallback>
    </Avatar>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-card p-6 shadow-soft">
      <h2 className="text-lg font-semibold">{title}</h2>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
      <div className="mt-4 grid gap-4">{children}</div>
    </section>
  );
}

export function AgentForm({ initial, onSaved }: { initial?: AgentRow; onSaved: (id: string) => void }) {
  const { current, user } = useWorkspace();
  const ws = current?.workspace_id ?? "";
  const orgs = useQuery({
    queryKey: ["orgs-min", ws],
    queryFn: async () => {
      const { data, error } = await supabase.from("organizations").select("id,name,signature").eq("workspace_id", ws).order("name");
      if (error) throw error;
      return data;
    },
  });

  const [f, setF] = useState({
    name: initial?.name ?? "",
    organization_id: initial?.organization_id ?? "",
    bio: initial?.bio ?? "",
    tone: initial?.tone ?? "professional",
    signature: initial?.signature ?? "",
    status: initial?.status ?? "paused",
    avatar_path: initial?.avatar_path ?? null as string | null,
    target_markets: join(initial?.target_markets),
    icp_industries: join(initial?.icp_industries),
    icp_company_sizes: join(initial?.icp_company_sizes),
    icp_titles: join(initial?.icp_titles),
    icp_seniorities: join(initial?.icp_seniorities),
    mailbox_provider: initial?.mailbox_provider ?? "",
    daily_send_cap: initial?.daily_send_cap ?? 40,
    send_days: initial?.send_days ?? [1, 2, 3, 4, 5],
    send_start_hour: initial?.send_start_hour ?? 9,
    send_end_hour: initial?.send_end_hour ?? 17,
    send_timezone: initial?.send_timezone ?? "Asia/Dubai",
    min_delay_seconds: initial?.min_delay_seconds ?? 120,
    warmup_enabled: initial?.warmup_enabled ?? true,
    warmup_start_cap: initial?.warmup_start_cap ?? 10,
    warmup_increment: initial?.warmup_increment ?? 5,
  });
  const [busy, setBusy] = useState(false);
  const avatarUrl = useAvatarUrl(f.avatar_path);
  const upd = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const txt = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => upd(k, e.target.value as never);
  const num = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => upd(k, Number(e.target.value) as never);

  async function uploadAvatar(file: File | undefined) {
    if (!file) return;
    if (!f.organization_id) { toast.error("Choose the organization first"); return; }
    if (!file.type.startsWith("image/")) { toast.error("Please choose an image"); return; }
    const path = `${f.organization_id}/agent-avatars/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
    const { error } = await supabase.storage.from("org-files").upload(path, file, { contentType: file.type });
    if (error) { toast.error(error.message); return; }
    upd("avatar_path", path);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.organization_id) { toast.error("Assign an organization"); return; }
    if (f.send_days.length === 0) { toast.error("Pick at least one sending day"); return; }
    setBusy(true);
    const row: AgentInsert = {
      workspace_id: ws,
      organization_id: f.organization_id,
      name: f.name.trim(),
      avatar_path: f.avatar_path,
      bio: f.bio || null,
      tone: f.tone,
      signature: f.signature || null,
      status: f.status,
      target_markets: list(f.target_markets),
      icp_industries: list(f.icp_industries),
      icp_company_sizes: list(f.icp_company_sizes),
      icp_titles: list(f.icp_titles),
      icp_seniorities: list(f.icp_seniorities),
      ...(initial ? {} : { mailbox_provider: f.mailbox_provider || null }),
      daily_send_cap: f.daily_send_cap,
      send_days: [...f.send_days].sort(),
      send_start_hour: f.send_start_hour,
      send_end_hour: f.send_end_hour,
      send_timezone: f.send_timezone,
      min_delay_seconds: f.min_delay_seconds,
      warmup_enabled: f.warmup_enabled,
      warmup_start_cap: f.warmup_start_cap,
      warmup_increment: f.warmup_increment,
    };
    const res = initial
      ? await supabase.from("agents").update(row).eq("id", initial.id).select("id").single()
      : await supabase.from("agents").insert({ ...row, created_by: user.id }).select("id").single();
    setBusy(false);
    if (res.error) { toast.error(res.error.message); return; }
    toast.success(initial ? "Agent saved" : "Agent created");
    onSaved(res.data.id);
  }

  const noOrgs = orgs.data && orgs.data.length === 0;

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-2">
      <Section title="Identity" description="Who this AI SDR is and how they sound.">
        <div className="flex items-center gap-4">
          <Avatar className="size-16">
            {avatarUrl && <AvatarImage src={avatarUrl} className="object-cover" />}
            <AvatarFallback className="bg-lavender font-display text-lg text-primary">{(f.name || "AI").slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-secondary">
            <Upload className="size-4" /> Profile picture
            <input type="file" accept="image/*" className="hidden" onChange={(e) => uploadAvatar(e.target.files?.[0])} />
          </label>
        </div>
        <div className="space-y-1.5"><Label>Name</Label><Input required value={f.name} onChange={txt("name")} placeholder="e.g. Sara" /></div>
        <div className="space-y-1.5">
          <Label>Assigned organization</Label>
          <Select value={f.organization_id} onValueChange={(v) => {
            const org = orgs.data?.find((o) => o.id === v);
            setF((p) => ({ ...p, organization_id: v, signature: p.signature || org?.signature || "" }));
          }}>
            <SelectTrigger><SelectValue placeholder={noOrgs ? "Create an organization first" : "Select a brand"} /></SelectTrigger>
            <SelectContent>{orgs.data?.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>Short bio / persona</Label><Textarea rows={3} value={f.bio} onChange={txt("bio")} placeholder="Business development manager focused on GCC enterprises…" /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Tone of voice</Label>
            <Select value={f.tone} onValueChange={(v) => upd("tone", v)}>
              <SelectTrigger className="capitalize"><SelectValue /></SelectTrigger>
              <SelectContent>{TONES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <div className="flex h-9 items-center gap-2">
              <Switch checked={f.status === "active"} onCheckedChange={(c) => upd("status", c ? "active" : "paused")} />
              <span className="text-sm">{f.status === "active" ? "Active" : "Paused"}</span>
            </div>
          </div>
        </div>
        <div className="space-y-1.5"><Label>Signature</Label><Textarea rows={3} value={f.signature} onChange={txt("signature")} /></div>
      </Section>

      <Section title="Targeting defaults" description="Pre-filled into every new campaign this agent runs. Comma separated.">
        <div className="space-y-1.5"><Label>Target markets</Label><Input value={f.target_markets} onChange={txt("target_markets")} placeholder="UAE, Saudi Arabia, Qatar" /></div>
        <div className="space-y-1.5"><Label>Industries</Label><Input value={f.icp_industries} onChange={txt("icp_industries")} placeholder="Legal, Healthcare, Government" /></div>
        <div className="space-y-1.5"><Label>Company sizes</Label><Input value={f.icp_company_sizes} onChange={txt("icp_company_sizes")} placeholder="51-200, 201-500, 501-1000" /></div>
        <div className="space-y-1.5"><Label>Job titles</Label><Input value={f.icp_titles} onChange={txt("icp_titles")} placeholder="Marketing Director, Head of Communications" /></div>
        <div className="space-y-1.5"><Label>Seniorities</Label><Input value={f.icp_seniorities} onChange={txt("icp_seniorities")} placeholder="Director, VP, C-level" /></div>
      </Section>

      <Section title="Mailbox" description="The inbox this agent sends from.">
        <AgentMailbox agentId={initial?.id} workspaceId={ws} />
      </Section>

      <Section title="Sending rules" description="Protect deliverability and respect working hours.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Daily send cap</Label><Input type="number" min={1} value={f.daily_send_cap} onChange={num("daily_send_cap")} /></div>
          <div className="space-y-1.5"><Label>Min. delay between sends (sec)</Label><Input type="number" min={0} value={f.min_delay_seconds} onChange={num("min_delay_seconds")} /></div>
        </div>
        <div className="space-y-1.5">
          <Label>Sending days</Label>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((d, i) => {
              const on = f.send_days.includes(i);
              return (
                <button type="button" key={d} onClick={() => upd("send_days", on ? f.send_days.filter((x) => x !== i) : [...f.send_days, i])}
                  className={`rounded-full px-3 py-1 text-sm transition ${on ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>{d}</button>
              );
            })}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5"><Label>From (hour)</Label><Input type="number" min={0} max={23} value={f.send_start_hour} onChange={num("send_start_hour")} /></div>
          <div className="space-y-1.5"><Label>To (hour)</Label><Input type="number" min={1} max={24} value={f.send_end_hour} onChange={num("send_end_hour")} /></div>
          <div className="space-y-1.5">
            <Label>Timezone</Label>
            <Select value={f.send_timezone} onValueChange={(v) => upd("send_timezone", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TIMEZONES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="flex items-center gap-2">
            <Switch checked={f.warmup_enabled} onCheckedChange={(c) => upd("warmup_enabled", c)} />
            <span className="text-sm font-medium">Ramp-up / warm-up</span>
          </div>
          {f.warmup_enabled && (
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Start at (emails/day)</Label><Input type="number" min={1} value={f.warmup_start_cap} onChange={num("warmup_start_cap")} /></div>
              <div className="space-y-1.5"><Label>Increase per day by</Label><Input type="number" min={1} value={f.warmup_increment} onChange={num("warmup_increment")} /></div>
              <p className="text-xs text-muted-foreground sm:col-span-2">
                Reaches the daily cap of {f.daily_send_cap} in about {Math.max(0, Math.ceil((f.daily_send_cap - f.warmup_start_cap) / Math.max(1, f.warmup_increment)))} days.
              </p>
            </div>
          )}
        </div>
      </Section>

      <div className="flex justify-end gap-2 lg:col-span-2">
        <Button type="submit" disabled={busy || noOrgs}>{busy ? "Saving…" : initial ? "Save agent" : "Create agent"}</Button>
      </div>
    </form>
  );
}
