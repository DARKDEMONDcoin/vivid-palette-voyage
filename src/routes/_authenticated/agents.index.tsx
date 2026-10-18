import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bot, Plus } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AgentAvatar } from "@/components/agent-form";
import { supabase } from "@/integrations/external/client";
import { useWorkspace } from "@/lib/workspace";

export const Route = createFileRoute("/_authenticated/agents/")({
  head: () => ({ meta: [{ title: "Agents — Outreach AI" }, { name: "description", content: "Your AI SDRs and the brands they represent." }] }),
  component: AgentList,
});

export function StatusChip({ status }: { status: string }) {
  return status === "active"
    ? <span className="rounded-full bg-success/15 px-2.5 py-0.5 text-xs text-success">Active</span>
    : <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">Paused</span>;
}
export function MailboxChip({ status }: { status: string }) {
  if (status === "connected") return <span className="rounded-full bg-lavender px-2.5 py-0.5 text-xs text-primary">Mailbox connected</span>;
  if (status === "error") return <span className="rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs text-destructive">Mailbox error</span>;
  return <span className="rounded-full bg-warning/20 px-2.5 py-0.5 text-xs text-warning">Mailbox not connected</span>;
}

function AgentList() {
  const { current, isAdmin } = useWorkspace();
  const ws = current?.workspace_id;
  const q = useQuery({
    queryKey: ["agents", ws],
    enabled: !!ws,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agents")
        .select("id,name,avatar_path,status,mailbox_status,tone,target_markets,organization:organizations(name)")
        .eq("workspace_id", ws!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <div>
      <PageHeader
        title="Agents"
        description={isAdmin ? "All AI SDRs in this workspace and the brand each works for." : "AI SDRs you've created."}
        actions={current?.role !== "viewer" && <Button asChild><Link to="/agents/new"><Plus className="size-4" /> New agent</Link></Button>}
      />
      {q.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}</div>
      ) : q.error ? (
        <p className="text-destructive">{(q.error as Error).message}</p>
      ) : !q.data?.length ? (
        <div className="rounded-2xl border border-dashed bg-card p-12 text-center shadow-soft">
          <Bot className="mx-auto size-10 text-primary" />
          <h2 className="mt-4 text-lg font-semibold">No agents yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">Create an AI SDR, assign it a brand and set its targeting.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {q.data.map((a) => (
            <Link key={a.id} to="/agents/$agentId" params={{ agentId: a.id }}
              className="rounded-2xl bg-card p-5 shadow-soft transition hover:-translate-y-0.5 hover:ring-2 hover:ring-primary/30">
              <div className="flex items-center gap-3">
                <AgentAvatar path={a.avatar_path} name={a.name} className="size-12" />
                <div className="min-w-0">
                  <div className="truncate font-semibold">{a.name}</div>
                  <div className="truncate text-xs text-muted-foreground">for {(a.organization as { name: string } | null)?.name ?? "—"}</div>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <StatusChip status={a.status} />
                <MailboxChip status={a.mailbox_status} />
              </div>
              {a.target_markets.length > 0 && <p className="mt-3 truncate text-xs text-muted-foreground">{a.target_markets.join(" · ")}</p>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
