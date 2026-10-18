import { decryptKey, gatewayRequest, checkedJson, scopesFor } from "./mailbox-gateway.server";
import { rawEmail } from "./mailbox-rules";
type Admin = (typeof import("@/integrations/external/client.server"))["supabaseAdmin"];
export async function sendAgentEmail(admin: Admin, input: { workspaceId: string; agentId: string; to: string; subject: string; body: string }) {
  const { data: binding, error } = await admin.from("agent_mailboxes").select("connection:app_user_connections(id,workspace_id,user_id,connector_id,connection_key_ciphertext,reconnect_required)").eq("agent_id", input.agentId).eq("workspace_id", input.workspaceId).maybeSingle();
  if (error) throw error;
  const connection = binding?.connection;
  if (!connection || connection.workspace_id !== input.workspaceId) return { waiting: true, error: "Agent mailbox not connected" };
  if (connection.reconnect_required) return { waiting: true, error: "Mailbox access needs to be renewed" };
  const { data: member, error: memberError } = await admin.from("workspace_members").select("role").eq("workspace_id", input.workspaceId).eq("user_id", connection.user_id).eq("active", true).maybeSingle();
  if (memberError) throw memberError;
  if (!member || member.role === "viewer") return { waiting: true, error: "Mailbox owner no longer has sending access" };
  const apiKey = process.env['LOVABLE_API_KEY'], secret = process.env['APP_USER_CONNECTION_KEY_SECRET'];
  if (!apiKey || !secret) return { waiting: true, error: "Mailbox provider is not configured" };
  const key = decryptKey(connection.connection_key_ciphertext, secret);
  const gmail = connection.connector_id === "google_mail";
  const response = await gatewayRequest(gmail ? "/google_mail/gmail/v1/users/me/messages/send" : "/microsoft_outlook/me/sendMail", apiKey, key, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(gmail ? { raw: rawEmail(input.to, input.subject, input.body) } : { message: { subject: input.subject, body: { contentType: "Text", content: input.body }, toRecipients: [{ emailAddress: { address: input.to } }] }, saveToSentItems: true }) }, scopesFor(connection.connector_id));
  if (response.status === 401) {
    const errorBody = await response.clone().json().catch(() => null);
    if (typeof errorBody?.type === "string" && errorBody.type.startsWith("credential_")) {
      const { error: updateError } = await admin.from("app_user_connections").update({ reconnect_required: true }).eq("id", connection.id).eq("workspace_id", input.workspaceId);
      if (updateError) throw updateError;
      return { waiting: true, error: "Mailbox access needs to be renewed" };
    }
  }
  await checkedJson(response);
  return { waiting: false, error: null };
}
