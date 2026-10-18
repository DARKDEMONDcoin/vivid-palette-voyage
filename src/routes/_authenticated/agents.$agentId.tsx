import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Pause, Play, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AgentAvatar, AgentForm, DAYS } from "@/components/agent-form";
import { MailboxChip, StatusChip } from "./agents.index";
import { supabase } from "@/integrations/external/client";
import { useWorkspace } from "@/lib/workspace";

export const Route = createFileRoute("/_authenticated/agents/$agentId")({
  head: () => ({ meta: [{ title: "Agent — Outreach AI" }, { name: "description", content: "Agent performance and settings." }, { property: "og:title", content: "Agent — Outreach AI" }, { property: "og:description", content: "Manage your agent and securely connect its mailbox." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: AgentDetail,
});

function AgentDetail() {
  const { agentId } = Route.useParams();
  const { current } = useWorkspace();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ["agent", agentId],
    queryFn: async () => {
      const { data, error } = await supabase.from("agents").select("*, organization:organizations(id,name)").eq("id", agentId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  if (q.isLoading) return <Skeleton className="h-64 rounded-2xl" />;
  if (!q.data) return <p className="text-muted-foreground">Agent not found or you don't have access.</p>;
  const a = q.data;
  const org = a.organization as { id: string; name: string } | null;
  const canEdit = current?.role !== "viewer";

  async function toggle() {
    const { error } = await supabase.from("agents").update({ status: a.status === "active" ? "paused" : "active" }).eq("id", a.id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["agent", agentId] });
    qc.invalidateQueries({ queryKey: ["agents"] });
  }
  async function del() {
    if (!confirm(`Delete agent ${a.name}?`)) return;
    const { error } = await supabase.from("agents").delete().eq("id", a.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Agent deleted");
    qc.invalidateQueries({ queryKey: ["agents"] });
    navigate({ to: "/agents" });
  }

  const kpis = ["Sent", "Reply rate", "Interest rate", "Bounce rate"];

  return (
    <div>
      <Link to="/agents" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Agents</Link>
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <AgentAvatar path={a.avatar_path} name={a.name} className="size-16" />
        <div className="flex-1">
          <PageHeader title={a.name} description={org ? `Works for ${org.name}` : ""} />
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={toggle}>{a.status === "active" ? <><Pause className="size-4" /> Pause</> : <><Play className="size-4" /> Activate</>}</Button>
            <Button variant="ghost" className="text-destructive" onClick={del}><Trash2 className="size-4" /></Button>
          </div>
        )}
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {canEdit && <TabsTrigger value="settings">Settings</TabsTrigger>}
        </TabsList>
        <TabsContent value="overview" className="space-y-6">
          <div className="flex flex-wrap gap-2 pt-2"><StatusChip status={a.status} /><MailboxChip status={a.mailbox_status} /></div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {kpis.map((k) => (
              <div key={k} className="rounded-2xl bg-card p-5 shadow-soft">
                <div className="text-sm text-muted-foreground">{k}</div>
                <div className="mt-2 font-display text-3xl font-semibold">—</div>
                <div className="text-xs text-muted-foreground">No sends yet</div>
              </div>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl bg-card p-6 shadow-soft">
              <h3 className="font-semibold">Mailbox health</h3>
              <dl className="mt-3 space-y-2 text-sm">
                <Row k="Provider" v={a.mailbox_provider === "gmail" ? "Gmail" : a.mailbox_provider === "outlook" ? "Outlook" : "Not chosen"} />
                <Row k="Status" v={a.mailbox_status === "connected" ? a.mailbox_email ?? "Connected" : "Not connected"} />
                <Row k="Daily cap" v={`${a.daily_send_cap} emails`} />
                <Row k="Window" v={`${a.send_days.map((d) => DAYS[d]).join(", ")} · ${a.send_start_hour}:00–${a.send_end_hour}:00 ${a.send_timezone}`} />
                <Row k="Warm-up" v={a.warmup_enabled ? `${a.warmup_start_cap}/day, +${a.warmup_increment} daily` : "Off"} />
              </dl>
            </div>
            <div className="rounded-2xl bg-card p-6 shadow-soft">
              <h3 className="font-semibold">Targeting</h3>
              <dl className="mt-3 space-y-2 text-sm">
                <Row k="Markets" v={a.target_markets.join(", ") || "—"} />
                <Row k="Industries" v={a.icp_industries.join(", ") || "—"} />
                <Row k="Sizes" v={a.icp_company_sizes.join(", ") || "—"} />
                <Row k="Titles" v={a.icp_titles.join(", ") || "—"} />
                <Row k="Seniority" v={a.icp_seniorities.join(", ") || "—"} />
              </dl>
            </div>
            <div className="rounded-2xl bg-card p-6 shadow-soft">
              <h3 className="font-semibold">Campaigns & activity</h3>
              <p className="mt-3 text-sm text-muted-foreground">This agent isn't running any campaigns yet.</p>
            </div>
          </div>
        </TabsContent>
        {canEdit && (
          <TabsContent value="settings" className="pt-2">
            <AgentForm initial={a} onSaved={() => { qc.invalidateQueries({ queryKey: ["agent", agentId] }); qc.invalidateQueries({ queryKey: ["agents"] }); }} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-4"><dt className="text-muted-foreground">{k}</dt><dd className="text-right">{v}</dd></div>;
}
