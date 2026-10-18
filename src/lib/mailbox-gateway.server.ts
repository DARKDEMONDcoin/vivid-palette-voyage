import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
export const GATEWAY = "https://connector-gateway.lovable.dev";
export const scopesFor = (connector: string) => connector === "google_mail"
  ? ["https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send"]
  : ["openid", "profile", "email", "offline_access", "User.Read", "Mail.Read", "Mail.Send"];
export function encryptKey(plaintext: string, secret: string) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", Buffer.from(secret, "base64"), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}
export function decryptKey(stored: string, secret: string) {
  const buf = Buffer.from(stored, "base64"), decipher = createDecipheriv("aes-256-gcm", Buffer.from(secret, "base64"), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}
export async function gatewayRequest(path: string, apiKey: string, key: string | null, init?: RequestInit, scopes?: string[], clientKey?: string) {
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${apiKey}`);
  if (key) headers.set("X-Connection-Api-Key", key);
  if (clientKey) headers.set("X-Client-Api-Key", clientKey);
  if (scopes?.length) headers.set("X-Lovable-Required-Scopes", scopes.join(" "));
  return fetch(`${GATEWAY}${path}`, { ...init, headers });
}
export async function checkedJson(response: Response): Promise<Record<string, any>> {
  if (!response.ok) {
    const text = await response.text();
    console.error(`Mailbox provider failed [${response.status}]: ${text}`);
    throw new Error(`Mailbox provider failed [${response.status}]: ${text}`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}
export async function mailboxProfile(connector: string, apiKey: string, key: string) {
  const profile = await checkedJson(await gatewayRequest(connector === "google_mail" ? "/google_mail/gmail/v1/users/me/profile" : "/microsoft_outlook/me?$select=mail,userPrincipalName", apiKey, key, undefined, scopesFor(connector)));
  const email = connector === "google_mail" ? profile['emailAddress'] : profile['mail'] || profile['userPrincipalName'];
  if (typeof email !== "string" || !email.includes("@")) throw new Error("Provider did not return a mailbox email");
  return email;
}
