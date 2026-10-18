import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/public/mailbox-return")({ server: { handlers: { GET: ({ request }) => {
  const url = new URL(request.url);
  const result = { type: "agentMailboxComplete", attemptId: url.searchParams.get("attempt"), connectorId: url.searchParams.get("connector_id"), success: url.searchParams.get("success") === "true", offlineDisabled: url.searchParams.get("offline_access_allowed") === "false", code: url.searchParams.get("code") };
  // Public relay only: the authenticated opener exchanges the one-time code.
  const json = JSON.stringify(result).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
  return new Response(`<!doctype html><html><head><title>Mailbox connection — Outreach AI</title></head><body><p>Finishing mailbox connection…</p><script>if(window.opener){window.opener.postMessage(${json},window.location.origin);window.close();}else{document.querySelector('p').textContent='Return to your agent and reconnect the mailbox.';}</script></body></html>`, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" } });
} } } });
