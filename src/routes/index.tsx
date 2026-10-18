import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
  head: () => ({
    meta: [
      { title: "Outreach AI — AI SDR platform" },
      { name: "description", content: "AI SDR agents that source, qualify, research and reach out across email, LinkedIn and calls." },
      { property: "og:title", content: "Outreach AI — AI SDR platform" },
      { property: "og:description", content: "AI SDR agents for multi-brand B2B outbound." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});
