import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/public/mailbox-return")({ server: { handlers: { GET: ({ request }) => {
  const url = new URL(request.url);
  const result = { type: "agentMailboxComplete", attemptId: url.searchParams.get("attempt"), connectorId: url.searchParams.get("connector_id"), success: url.searchParams.get("success") === "true", offlineDisabled: url.searchParams.get("offline_access_allowed") === "false", code: url.searchParams.get("code") };
  // Public relay only: the authenticated opener exchanges the one-time code.
  // Provider sign-in pages may sever window.opener, so also report via same-origin BroadcastChannel and storage.
  const json = JSON.stringify(result).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
  const script = `var m=${json};var p=document.querySelector('p');
try{var c=new BroadcastChannel('agent-mailbox-consent');c.postMessage(m);c.close();}catch(e){}
try{if(m.attemptId)localStorage.setItem('agent-mailbox-consent:'+m.attemptId,JSON.stringify(m));}catch(e){}
try{if(window.opener&&window.opener!==window)window.opener.postMessage(m,window.location.origin);}catch(e){}
p.textContent=m.success?'Mailbox connected. You can close this window.':'Mailbox connection was not completed. You can close this window.';
setTimeout(function(){window.close();},800);`;
  return new Response(`<!doctype html><html><head><title>Mailbox connection — Outreach AI</title></head><body style="font-family:system-ui;padding:24px"><p>Finishing mailbox connection…</p><script>${script}</script></body></html>`, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" } });
} } } });
