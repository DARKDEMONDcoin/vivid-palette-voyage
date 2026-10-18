import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { AgentForm } from "@/components/agent-form";

export const Route = createFileRoute("/_authenticated/agents/new")({
  head: () => ({ meta: [{ title: "New agent — Outreach AI" }, { name: "description", content: "Create an AI SDR." }] }),
  component: NewAgent,
});

function NewAgent() {
  const navigate = useNavigate();
  return (
    <div>
      <Link to="/agents" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Agents</Link>
      <PageHeader title="New agent" />
      <AgentForm onSaved={(id) => navigate({ to: "/agents/$agentId", params: { agentId: id } })} />
    </div>
  );
}
