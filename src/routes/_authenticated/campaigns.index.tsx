import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Megaphone, Plus } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/external/client";
import { useWorkspace } from "@/lib/workspace";

export const Route = createFileRoute("/_authenticated/campaigns/")({
  head: () => ({ meta: [{ title: "Campaigns — Outreach AI" }, { name: "description", content: "Multi-channel outreach campaigns run by your agents." }] }),
  component: CampaignList,
});

export function CampaignStatus({ status }: { status: string }) {
  const map: Record<string, string> = { draft: "bg-muted text-muted-foreground", active: "bg-success/15 text-success", paused: "bg-warning/20 text-warning", completed: "bg-lavender text-primary", archived: "bg-muted text-muted-foreground" };
  return <span className={`rounded-full px-2.5 py-0.5 text-xs capitalize ${map[status] ?? map["draft"]}`}>{status}</span>;
}

function CampaignList() {
  const { current, isAdmin } = useWorkspace();
  const ws = current?.workspace_id;
  const q = useQuery({
    queryKey: ["campaigns", ws],
    enabled: !!ws,
    queryFn: async () => {
      const { data, error } = await supabase.from("campaigns")
        .select("id,name,status,wizard_step,source_type,created_at,agent:agents(name),organization:organizations(name),campaign_leads(count)")
        .eq("workspace_id", ws!).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  return (
    <div>
      <PageHeader title="Campaigns" description={isAdmin ? "All campaigns in this workspace." : "Campaigns you've created."}
        actions={current?.role !== "viewer" && <Button asChild><Link to="/campaigns/new"><Plus className="size-4" /> New campaign</Link></Button>} />
      {q.isLoading ? <Skeleton className="h-40 rounded-2xl" /> : q.error ? <p className="text-destructive">{(q.error as Error).message}</p> : !q.data?.length ? (
        <div className="rounded-2xl border border-dashed bg-card p-12 text-center shadow-soft">
          <Megaphone className="mx-auto size-10 text-primary" />
          <h2 className="mt-4 text-lg font-semibold">No campaigns yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">Pick an agent, bring in leads, then qualify and research them.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-card shadow-soft">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-left text-xs uppercase text-muted-foreground">
              <tr><th className="p-3">Campaign</th><th className="p-3">Agent</th><th className="p-3">Brand</th><th className="p-3">Leads</th><th className="p-3">Status</th></tr>
            </thead>
            <tbody>
              {q.data.map((c) => (
                <tr key={c.id} className="border-t hover:bg-secondary/30">
                  <td className="p-3 font-medium"><Link to="/campaigns/$campaignId" params={{ campaignId: c.id }} className="hover:text-primary">{c.name}</Link></td>
                  <td className="p-3">{(c.agent as { name: string } | null)?.name ?? "—"}</td>
                  <td className="p-3">{(c.organization as { name: string } | null)?.name ?? "—"}</td>
                  <td className="p-3">{(c.campaign_leads as unknown as { count: number }[])?.[0]?.count ?? 0}</td>
                  <td className="p-3"><CampaignStatus status={c.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
