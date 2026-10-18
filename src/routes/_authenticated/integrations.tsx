import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Database, Briefcase, MessageSquare, Mail, Linkedin, Phone, Loader2, Sparkles, Sheet } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/external/client";
import { useWorkspace } from "@/lib/workspace";
import { saveIntegration, disconnectIntegration, type Provider } from "@/lib/integrations.functions";

export const Route = createFileRoute("/_authenticated/integrations")({
  head: () => ({ meta: [{ title: "Integrations — Outreach AI" }, { name: "description", content: "Connect Apollo, mailboxes, LinkedIn, calls, CRM and Slack." }, { property: "og:title", content: "Integrations — Outreach AI" }, { property: "og:description", content: "Manage your workspace connections and agent mailboxes." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: IntegrationsPage,
});

type Field = { key: string; label: string; placeholder: string; options?: { value: string; label: string }[] | undefined };
const LLM_MODELS: Record<string, { value: string; label: string }[]> = {
  lovable: [
    { value: "openai/gpt-6-astra", label: "GPT-6 Astra (strongest)" },
    { value: "anthropic/claude-opus-5", label: "Claude Opus 5" },
    { value: "google/gemini-3.1-pro-preview", label: "Gemini 3.1 Pro" },
    { value: "openai/gpt-6-luna", label: "GPT-6 Luna (cheap)" },
    { value: "anthropic/claude-haiku-4-5", label: "Claude Haiku 4.5 (cheap)" },
    { value: "google/gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite (cheap)" },
  ],
  openai: [{ value: "gpt-5.5", label: "GPT-5.5" }, { value: "gpt-5.4-mini", label: "GPT-5.4 mini (cheap)" }],
  anthropic: [{ value: "claude-opus-5", label: "Claude Opus 5" }, { value: "claude-haiku-4-5", label: "Claude Haiku 4.5 (cheap)" }],
  gemini: [{ value: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro" }, { value: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite (cheap)" }],
};
const defs: { id: Provider; name: string; desc: string; icon: typeof Database; secretLabel: string; fields?: Field[] }[] = [
  { id: "llm", name: "AI model", desc: "Models used for research, copywriting and lead scoring.", icon: Sparkles, secretLabel: "API key (only for your own provider)",
    fields: [
      { key: "provider", label: "Provider", placeholder: "", options: [
        { value: "lovable", label: "Built-in (no key needed)" }, { value: "openai", label: "OpenAI — own key" },
        { value: "anthropic", label: "Claude — own key" }, { value: "gemini", label: "Gemini — own key" }] },
      { key: "research_model", label: "Research & copywriting model (stronger)", placeholder: "" },
      { key: "scoring_model", label: "Qualification scoring model (cheaper)", placeholder: "" },
    ] },
  { id: "apollo", name: "Apollo", desc: "Find leads and enrich contacts.", icon: Database, secretLabel: "API key" },
  { id: "freshsales", name: "Freshsales CRM", desc: "Push sales-qualified leads to your CRM.", icon: Briefcase, secretLabel: "API key",
    fields: [{ key: "domain", label: "Freshsales domain", placeholder: "yourcompany.myfreshworks.com" },
      { key: "map_owner_id", label: "Field mapping — owner ID for new contacts", placeholder: "optional" },
      { key: "map_lead_source", label: "Field mapping — lead source value", placeholder: "Outreach AI" },
      { key: "map_lifecycle_stage", label: "Field mapping — lifecycle stage for SQLs", placeholder: "Sales Qualified Lead" },
      { key: "map_custom_fields", label: "Field mapping — custom fields (ours=theirs, comma separated)", placeholder: "agent=cf_agent,brand=cf_brand" }] },
  { id: "phantombuster", name: "Phantombuster (LinkedIn)", desc: "Runs LinkedIn connection requests and messages.", icon: Linkedin, secretLabel: "API key",
    fields: [{ key: "phantom_id", label: "LinkedIn automation phantom ID", placeholder: "e.g. 1234567890123456" }] },
  { id: "vapi", name: "Vapi (Calls)", desc: "AI voice calls in English and Arabic.", icon: Phone, secretLabel: "API key",
    fields: [
      { key: "assistant_en", label: "English assistant ID", placeholder: "" },
      { key: "assistant_ar", label: "Arabic assistant ID", placeholder: "" },
      { key: "phone_number_id", label: "Phone number ID", placeholder: "" },
    ] },
  { id: "slack", name: "Slack", desc: "Get alerts for replies and qualified leads.", icon: MessageSquare, secretLabel: "Incoming webhook URL" },
];

type Row = { provider: string; status: string; config: Record<string, string>; last_tested_at: string | null; last_error: string | null };

function IntegrationsPage() {
  const { current, isAdmin } = useWorkspace();
  const ws = current?.workspace_id;
  const q = useQuery({
    queryKey: ["integrations", ws],
    enabled: !!ws,
    queryFn: async () => {
      if (!ws) return [];
      const { data, error } = await supabase.from("integrations").select("provider,status,config,last_tested_at,last_error").eq("workspace_id", ws);
      if (error) throw error;
      return data as unknown as Row[];
    },
  });
  if (!ws) return null;
  return (
    <div>
      <PageHeader title="Integrations" description="Connect Apollo, mailboxes, LinkedIn, calls, CRM and Slack." />
      {!isAdmin && <p className="mb-4 text-sm text-muted-foreground">Only Super Admins can change integrations.</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        {defs.map((d) => <IntegrationCard key={d.id} def={d} ws={ws} row={q.data?.find((r) => r.provider === d.id)} canEdit={isAdmin} />)}
        <StaticCard icon={Mail} name="Mailboxes (Gmail / Outlook)" desc="Each agent sends from its own mailbox.">
          <Link to="/agents" className="text-primary underline">Manage agent mailboxes</Link>
        </StaticCard>
        <StaticCard icon={Sheet} name="Google Sheets" desc="Import leads from and export reports to Sheets.">Not connected — Google sign-in needs a Google app set up for your workspace (same one used for Gmail).</StaticCard>
      </div>
    </div>
  );
}

function Status({ status }: { status?: string | undefined }) {
  const map: Record<string, [string, string]> = {
    connected: ["Connected", "bg-success/15 text-success"],
    error: ["Error", "bg-destructive/15 text-destructive"],
  };
  const [label, cls] = map[status ?? ""] ?? ["Not connected", "bg-muted text-muted-foreground"];
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}

function Shell({ icon: Icon, name, desc, status, children }: { icon: typeof Database; name: string; desc: string; status?: string | undefined; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-card p-6 shadow-soft">
      <div className="flex items-start gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-lavender text-primary"><Icon className="size-5" /></div>
        <div className="flex-1"><h3 className="font-semibold">{name}</h3><p className="text-sm text-muted-foreground">{desc}</p></div>
        <Status status={status} />
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function StaticCard(p: { icon: typeof Database; name: string; desc: string; children: React.ReactNode }) {
  return <Shell {...p}><p className="text-sm text-muted-foreground">{p.children}</p></Shell>;
}

function IntegrationCard({ def, ws, row, canEdit }: { def: (typeof defs)[number]; ws: string; row?: Row | undefined; canEdit: boolean }) {
  const qc = useQueryClient();
  const save = useServerFn(saveIntegration);
  const disconnect = useServerFn(disconnectIntegration);
  const [secret, setSecret] = useState("");
  const [config, setConfig] = useState<Record<string, string>>(row?.config ?? {});
  const [busy, setBusy] = useState(false);
  const llmProvider = config["provider"] ?? row?.config?.["provider"] ?? "lovable";

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try { await fn(); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    setBusy(false);
    qc.invalidateQueries({ queryKey: ["integrations", ws] });
  }
  const test = () => run(async () => {
    const r = await save({ data: { workspaceId: ws, provider: def.id, secret: secret || undefined, config: { ...(def.id === "llm" ? { provider: "lovable" } : {}), ...row?.config, ...config } } });
    r.ok ? toast.success(`${def.name} connected`) : toast.error(r.error ?? "Test failed");
    setSecret("");
  });

  return (
    <Shell icon={def.icon} name={def.name} desc={def.desc} status={row?.status}>
      {canEdit && (
        <div className="space-y-3">
          {def.fields?.map((f) => {
            const val = config[f.key] ?? row?.config?.[f.key] ?? (f.key === "provider" ? "lovable" : "");
            const opts = f.options ?? (def.id === "llm" && f.key !== "provider" ? LLM_MODELS[llmProvider] : undefined);
            return (
              <div key={f.key} className="space-y-1.5"><Label>{f.label}</Label>
                {opts ? (
                  <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={val}
                    onChange={(e) => setConfig(f.key === "provider" ? { ...config, provider: e.target.value, research_model: "", scoring_model: "" } : { ...config, [f.key]: e.target.value })}>
                    <option value="">Select…</option>
                    {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : (
                  <Input value={val} placeholder={f.placeholder} onChange={(e) => setConfig({ ...config, [f.key]: e.target.value })} />
                )}
              </div>
            );
          })}
          {!(def.id === "llm" && llmProvider === "lovable") && <div className="space-y-1.5"><Label>{def.secretLabel}</Label>
            <Input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={row ? "Saved — enter a new one to replace" : ""} /></div>}
        </div>
      )}
      {row?.last_error && <p className="mt-3 break-words text-sm text-destructive">{row.last_error}</p>}
      {row?.last_tested_at && <p className="mt-2 text-xs text-muted-foreground">Last tested {new Date(row.last_tested_at).toLocaleString()}</p>}
      {canEdit && (
        <div className="mt-4 flex gap-2">
          <Button onClick={test} disabled={busy || (!secret && !row && def.id !== "vapi" && !(def.id === "llm" && llmProvider === "lovable"))}>{busy && <Loader2 className="size-4 animate-spin" />}{row ? "Save & test" : "Connect"}</Button>
          {row && <Button variant="ghost" disabled={busy} onClick={() => run(() => disconnect({ data: { workspaceId: ws, provider: def.id } }))}>Disconnect</Button>}
        </div>
      )}
    </Shell>
  );
}
