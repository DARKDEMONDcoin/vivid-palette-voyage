import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { BasicsForm } from "@/components/campaign-wizard";

export const Route = createFileRoute("/_authenticated/campaigns/new")({
  head: () => ({ meta: [{ title: "New campaign — Outreach AI" }, { name: "description", content: "Set up a new outreach campaign." }] }),
  component: NewCampaign,
});

function NewCampaign() {
  const navigate = useNavigate();
  return (
    <div>
      <Link to="/campaigns" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Campaigns</Link>
      <PageHeader title="New campaign" description="Step 1 of 8 — basics" />
      <BasicsForm onSaved={(id) => navigate({ to: "/campaigns/$campaignId", params: { campaignId: id } })} />
    </div>
  );
}
