import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bot, Building2, CheckCircle2, Circle, FileUp, Mail, Megaphone } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/external/client";
import { useWorkspace } from "@/lib/workspace";
import { pct, useAnalytics } from "@/lib/analytics";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Outreach AI" }, { name: "description", content: "Your outbound overview." }] }),
  component: Dashboard,
});

function Dashboard() {
  const { user, current } = useWorkspace();
  const ws = current?.workspace_id;
  const name = (user.user_metadata?.["full_name"] as string | undefined)?.split(" ")[0];
  const a = useAnalytics(ws, 30);
  const setup = useQuery({
    enabled: !!ws, queryKey: ["setup", ws],
    queryFn: async () => {
      const c = (t: "organizations" | "documents" | "agents" | "campaigns", f?: [string, string]) => {
        let q = supabase.from(t).select("id", { count: "exact", head: true }).eq("workspace_id", ws!);
        if (f) q = q.eq(f[0], f[1]);
        return q.then((r) => r.count ?? 0);
      };
      const [o, d, ag, mb, cp, unhandled] = await Promise.all([c("organizations"), c("documents", ["status", "indexed"]), c("agents"), c("agents", ["mailbox_status", "connected"]), c("campaigns", ["status", "active"]),
        supabase.from("replies").select("id", { count: "exact", head: true }).eq("workspace_id", ws!).eq("handled", false).then((r) => r.count ?? 0)]);
      return { done: [o > 0, d > 0, ag > 0, mb > 0, cp > 0], unhandled, active: cp };
    },
  });
  const t = a.data?.total;
  const kpis = [
    { label: "Touches sent", v: t?.sent ?? "—", tone: "bg-lavender text-primary" },
    { label: "Reply rate", v: t ? pct(t.replies, t.sent) : "—", tone: "bg-sky text-info" },
    { label: "Interested", v: t?.interested ?? "—", tone: "bg-success/15 text-success" },
    { label: "SQLs", v: t?.sqls ?? "—", tone: "bg-warning/20 text-warning" },
  ];
  const steps = [
    { label: "Create an organization", icon: Building2, to: "/organizations" },
    { label: "Upload brand documents", icon: FileUp, to: "/organizations" },
    { label: "Create an agent", icon: Bot, to: "/agents" },
    { label: "Connect a mailbox", icon: Mail, to: "/agents" },
    { label: "Launch a campaign", icon: Megaphone, to: "/campaigns" },
  ] as const;
  const done = setup.data?.done ?? [];
  const top = a.data ? a.data.campaigns.map((c) => ({ c, s: a.data!.byCampaign.get(c.id) })).filter((x) => x.s).sort((x, y) => y.s!.sqls - x.s!.sqls || y.s!.replies - x.s!.replies).slice(0, 5) : [];
  return (
    <div className="space-y-6">
      <PageHeader title={`Welcome${name ? `, ${name}` : ""}`} description={current ? `Workspace: ${current.workspace.name} · last 30 days` : ""}
        actions={<div className="flex gap-2"><Button variant="outline" asChild><Link to="/agents">New agent</Link></Button><Button asChild><Link to="/campaigns">New campaign</Link></Button></div>} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-2xl bg-card p-5 shadow-soft">
            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${k.tone}`}>{k.label}</span>
            <div className="mt-3 font-display text-3xl font-semibold">{k.v}</div>
          </div>))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl bg-card p-6 shadow-soft">
          <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Top campaigns</h2><Button variant="ghost" size="sm" asChild><Link to="/analytics">Analytics</Link></Button></div>
          {!top.length ? <p className="mt-3 text-sm text-muted-foreground">No campaign activity yet.</p> : (
            <ul className="mt-3 divide-y">{top.map(({ c, s }) => (
              <li key={c.id} className="flex items-center gap-3 py-2 text-sm">
                <Link to="/campaigns/$campaignId" params={{ campaignId: c.id }} className="flex-1 truncate font-medium hover:underline">{c.name}</Link>
                <span className="text-muted-foreground">{s!.sent} sent · {pct(s!.replies, s!.sent)} reply</span><b className="text-warning">{s!.sqls} SQL</b>
              </li>))}</ul>)}
          {!!setup.data?.unhandled && <Button className="mt-4" variant="outline" asChild><Link to="/inbox">{setup.data.unhandled} replies waiting in Inbox</Link></Button>}
        </div>
        <div className="rounded-2xl bg-card p-6 shadow-soft">
          <h2 className="text-lg font-semibold">Get started</h2>
          <p className="text-sm text-muted-foreground">Five steps to your first AI-run campaign.</p>
          <ul className="mt-4 divide-y">
            {steps.map((s, i) => (
              <li key={s.label} className="flex items-center gap-3 py-3">
                {done[i] ? <CheckCircle2 className="size-5 text-success" /> : <Circle className="size-5 text-muted-foreground" />}
                <s.icon className="size-4 text-primary" /><span className="flex-1">{s.label}</span>
                <Button variant="ghost" size="sm" asChild><Link to={s.to}>Open</Link></Button>
              </li>))}
          </ul>
        </div>
      </div>
    </div>
  );
}
