import { createFileRoute } from "@tanstack/react-router";

async function sha256(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

// Workspace API: GET /api/public/v1/leads?limit=100&offset=0 with "Authorization: Bearer <workspace API key>".
export const Route = createFileRoute("/api/public/v1/leads")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const key = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
        if (!key) return Response.json({ error: "Missing API key" }, { status: 401 });
        const { supabaseAdmin: admin } = await import("@/integrations/external/client.server");
        const { data: k } = await admin.from("api_keys").select("id,workspace_id,revoked_at").eq("key_hash", await sha256(key)).maybeSingle();
        if (!k || k.revoked_at) return Response.json({ error: "Invalid API key" }, { status: 401 });
        await admin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", k.id);
        const u = new URL(request.url);
        const limit = Math.min(500, Math.max(1, Number(u.searchParams.get("limit")) || 100));
        const offset = Math.max(0, Number(u.searchParams.get("offset")) || 0);
        const { data, error } = await admin.from("leads")
          .select("id,email,first_name,last_name,title,company,company_domain,country,linkedin_url,source,created_at")
          .eq("workspace_id", k.workspace_id).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
        if (error) return Response.json({ error: "Query failed" }, { status: 500 });
        return Response.json({ data, limit, offset });
      },
    },
  },
});
