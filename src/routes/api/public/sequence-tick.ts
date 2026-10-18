import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/sequence-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        const { supabaseAdmin } = await import("@/integrations/external/client.server");
        const { runDue } = await import("@/lib/sequence.server");
        const r = await runDue(supabaseAdmin);
        return Response.json(r);
      },
    },
  },
});
