import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/external/auth-middleware";
import { canManageMailbox, connectorFor } from "./mailbox-rules";
const agentInput = z.object({ agentId: z.string().uuid(), workspaceId: z.string().uuid() });

type UserClient = (typeof import("@/integrations/external/client"))["supabase"];
async function authorizeAgent(client: UserClient, userId: string, data: { agentId: string; workspaceId: string }) {
  const { data: member, error: memberError } = await client.from("workspace_members").select("role").eq("workspace_id", data.workspaceId).eq("user_id", userId).eq("active", true).maybeSingle();
  const { data: agent, error } = await client.from("agents").select("id,created_by,workspace_id,mailbox_email,mailbox_provider,mailbox_status").eq("id", data.agentId).eq("workspace_id", data.workspaceId).maybeSingle();
  if (memberError || error || !agent || !canManageMailbox(member?.role, userId, agent.created_by)) throw new Error("You cannot manage this agent's mailbox");
  return agent;
}
export const getMailboxStatus = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(input => agentInput.parse(input)).handler(async ({ data, context }) => {
  const agent = await authorizeAgent(context.supabase, context.userId, data);
  const { supabaseAdmin: admin } = await import("@/integrations/external/client.server");
  const { data: binding, error } = await admin.from("agent_mailboxes").select("connection:app_user_connections(user_id,reconnect_required)").eq("agent_id", data.agentId).eq("workspace_id", data.workspaceId).maybeSingle();
  if (error) throw error;
  return { email: agent.mailbox_email, provider: agent.mailbox_provider, connected: !!binding && agent.mailbox_status === "connected", reconnectRequired: binding?.connection?.reconnect_required ?? false, ownedByYou: binding?.connection?.user_id === context.userId,
    googleReady: !!process.env['GOOGLE_MAIL_APP_USER_CONNECTOR_CLIENT_API_KEY'], microsoftReady: !!process.env['MICROSOFT_OUTLOOK_APP_USER_CONNECTOR_CLIENT_API_KEY'] };
});
export const startMailboxConnect = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(input => agentInput.extend({ provider: z.enum(["gmail", "outlook"]) }).parse(input)).handler(async ({ data, context }) => {
  await authorizeAgent(context.supabase, context.userId, data);
  const apiKey = process.env['LOVABLE_API_KEY'], cryptoSecret = process.env['APP_USER_CONNECTION_KEY_SECRET'];
  const clientKey = data.provider === "gmail" ? process.env['GOOGLE_MAIL_APP_USER_CONNECTOR_CLIENT_API_KEY'] : process.env['MICROSOFT_OUTLOOK_APP_USER_CONNECTOR_CLIENT_API_KEY'];
  if (!apiKey || !cryptoSecret || !clientKey) throw new Error("Mailbox provider is not configured for this app yet");
  const { supabaseAdmin: admin } = await import("@/integrations/external/client.server");
  const { gatewayRequest, checkedJson, decryptKey, scopesFor } = await import("./mailbox-gateway.server");
  const connector = connectorFor(data.provider);
  const { data: old, error: oldError } = await admin.from("app_user_connections").select("connection_key_ciphertext").eq("workspace_id", data.workspaceId).eq("user_id", context.userId).eq("connector_id", connector).maybeSingle();
  if (oldError) throw oldError;
  const { data: attempt, error } = await admin.from("mailbox_oauth_attempts").insert({ workspace_id: data.workspaceId, agent_id: data.agentId, user_id: context.userId, connector_id: connector }).select("id").single();
  if (error) throw error;
  const request = getRequest(), url = new URL(request.url);
  const host = url.hostname === "localhost" ? request.headers.get("x-forwarded-host") : null;
  const returnUrl = new URL("/api/public/mailbox-return", host ? `https://${host}` : url.origin);
  returnUrl.searchParams.set("attempt", attempt.id);
  const result = await checkedJson(await gatewayRequest("/api/v1/app-users/oauth2/authorize", apiKey, old ? decryptKey(old.connection_key_ciphertext, cryptoSecret) : null, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ connector_id: connector, app_user_id: context.userId, return_url: returnUrl.toString(), credentials_configuration: { scopes: scopesFor(connector), ...(data.provider === "outlook" ? { domain_hint: "none", prompt: "select_account" } : {}) } }) }, undefined, clientKey));
  if (typeof result['authorization_url'] !== "string") throw new Error("Provider did not return an authorization address");
  return { authorizationUrl: result['authorization_url'] as string, attemptId: attempt.id, connectorId: connector };
});
export const completeMailboxConnect = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(input => agentInput.extend({ attemptId: z.string().uuid(), code: z.string().min(1).max(4096) }).parse(input)).handler(async ({ data, context }) => {
  await authorizeAgent(context.supabase, context.userId, data);
  const apiKey = process.env['LOVABLE_API_KEY'], secret = process.env['APP_USER_CONNECTION_KEY_SECRET'];
  if (!apiKey || !secret) throw new Error("Mailbox provider is not configured");
  const { supabaseAdmin: admin } = await import("@/integrations/external/client.server");
  const { data: attempt, error } = await admin.from("mailbox_oauth_attempts").delete().eq("id", data.attemptId).eq("user_id", context.userId).eq("workspace_id", data.workspaceId).eq("agent_id", data.agentId).gt("expires_at", new Date().toISOString()).select("connector_id").maybeSingle();
  if (error || !attempt) throw new Error("Mailbox consent expired; please reconnect");
  const { gatewayRequest, checkedJson, encryptKey, mailboxProfile } = await import("./mailbox-gateway.server");
  const result = await checkedJson(await gatewayRequest("/api/v1/app-users/oauth2/exchange", apiKey, null, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: data.code }) }));
  if (result['connector_id'] !== attempt.connector_id || typeof result['api_key'] !== "string") throw new Error("Mailbox consent returned an unexpected provider");
  const email = await mailboxProfile(attempt.connector_id, apiKey, result['api_key']);
  const { data: connection, error: saveError } = await admin.from("app_user_connections").upsert({ workspace_id: data.workspaceId, user_id: context.userId, connector_id: attempt.connector_id, email, connection_key_ciphertext: encryptKey(result['api_key'], secret), reconnect_required: false, updated_at: new Date().toISOString() }, { onConflict: "workspace_id,user_id,connector_id" }).select("id").single();
  if (saveError) throw saveError;
  const { error: bindError } = await admin.from("agent_mailboxes").upsert({ agent_id: data.agentId, workspace_id: data.workspaceId, connection_id: connection.id });
  if (bindError) throw bindError;
  const { data: bindings, error: bindingsError } = await admin.from("agent_mailboxes").select("agent_id").eq("workspace_id", data.workspaceId).eq("connection_id", connection.id);
  if (bindingsError) throw bindingsError;
  const { error: updateError } = await admin.from("agents").update({ mailbox_email: email, mailbox_provider: attempt.connector_id === "google_mail" ? "gmail" : "outlook", mailbox_status: "connected", mailbox_last_tested_at: new Date().toISOString() }).eq("workspace_id", data.workspaceId).in("id", (bindings ?? []).map(x => x.agent_id));
  if (updateError) throw updateError;
  return { email };
});
export const disconnectAgentMailbox = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(input => agentInput.parse(input)).handler(async ({ data, context }) => {
  await authorizeAgent(context.supabase, context.userId, data);
  const { supabaseAdmin: admin } = await import("@/integrations/external/client.server");
  const { error } = await admin.from("agent_mailboxes").delete().eq("workspace_id", data.workspaceId).eq("agent_id", data.agentId);
  if (error) throw error;
  const { error: updateError } = await admin.from("agents").update({ mailbox_status: "not_connected", mailbox_email: null, mailbox_provider: null }).eq("id", data.agentId).eq("workspace_id", data.workspaceId);
  if (updateError) throw updateError;
  return { ok: true };
});
