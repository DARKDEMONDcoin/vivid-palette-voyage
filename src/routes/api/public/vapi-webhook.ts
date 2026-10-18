import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

// Receives Vapi end-of-call reports for outbound calls placed by the sequence engine.
// Each call is created with a per-call server URL + secret (X-Vapi-Secret header).
const payloadSchema = z.object({
  message: z.object({
    type: z.string(),
    call: z.object({ id: z.string().optional(), metadata: z.record(z.string(), z.unknown()).optional() }).passthrough().optional(),
    transcript: z.string().optional(),
    summary: z.string().optional(),
    recordingUrl: z.string().optional(),
    endedReason: z.string().optional(),
    artifact: z.object({ transcript: z.string().optional(), recordingUrl: z.string().optional() }).passthrough().optional(),
    analysis: z.object({ summary: z.string().optional() }).passthrough().optional(),
  }).passthrough(),
});

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export const Route = createFileRoute("/api/public/vapi-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env["VAPI_WEBHOOK_SECRET"];
        const got = request.headers.get("x-vapi-secret") ?? "";
        if (!expected || !safeEqual(got, expected)) return new Response("Unauthorized", { status: 401 });

        const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response("Bad payload", { status: 400 });
        const msg = parsed.data.message;
        if (msg.type !== "end-of-call-report") return Response.json({ ok: true, ignored: msg.type });

        const meta = (msg.call?.metadata ?? {}) as Record<string, unknown>;
        const clId = typeof meta["campaign_lead_id"] === "string" ? meta["campaign_lead_id"] : null;
        const messageId = typeof meta["message_id"] === "string" ? meta["message_id"] : null;
        if (!clId || !z.string().uuid().safeParse(clId).success) return Response.json({ ok: true, ignored: "no lead" });

        const transcript = (msg.artifact?.transcript ?? msg.transcript ?? "").trim();
        const summary = (msg.analysis?.summary ?? msg.summary ?? "").trim();
        const recording = msg.artifact?.recordingUrl ?? msg.recordingUrl ?? "";
        const { supabaseAdmin } = await import("@/integrations/external/client.server");

        // Record the call outcome on the outbound message.
        if (messageId && z.string().uuid().safeParse(messageId).success)
          await supabaseAdmin.from("messages").update({ error: msg.endedReason ? `Call ended: ${msg.endedReason}` : null }).eq("id", messageId);

        // Only treat it as a reply when the prospect actually spoke.
        const prospectSpoke = /(^|\n)\s*(user|customer)\s*:/i.test(transcript);
        if (!prospectSpoke) return Response.json({ ok: true, ignored: "no answer" });

        const body = [
          summary && `Call summary: ${summary}`,
          recording && `Recording: ${recording}`,
          `Transcript:\n${transcript}`,
        ].filter(Boolean).join("\n\n").slice(0, 8000);

        try {
          const { processReply } = await import("@/lib/sequence.server");
          const r = await processReply(supabaseAdmin, { campaignLeadId: clId, body, channel: "call", createdBy: null });
          return Response.json({ ok: true, classification: r.classification, sql: r.isSql });
        } catch (e) {
          console.error("vapi-webhook", e);
          return new Response("Processing failed", { status: 500 });
        }
      },
    },
  },
});
