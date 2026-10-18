export type MailProvider = "gmail" | "outlook";
export const connectorFor = (provider: MailProvider) => provider === "gmail" ? "google_mail" : "microsoft_outlook";
export function canManageMailbox(role: string | undefined, userId: string, creatorId: string | null) {
  return role === "super_admin" || (role === "standard" && userId === creatorId);
}
export function safeAuthDestination(path: string | null | undefined, origin: string) {
  if (!path) return "/dashboard";
  try {
    const url = new URL(path, origin);
    if (url.origin !== origin || ["/auth", "/reset-password"].includes(url.pathname) || url.pathname.startsWith("/api/")) return "/dashboard";
    return url.pathname + url.search + url.hash;
  } catch { return "/dashboard"; }
}
export function rawEmail(to: string, subject: string, body: string) {
  if (/[\r\n]/.test(to) || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(to)) throw new Error("Invalid recipient email");
  const b64 = (s: string) => btoa(Array.from(new TextEncoder().encode(s), b => String.fromCharCode(b)).join(""));
  const header = `=?UTF-8?B?${b64(subject.replace(/[\r\n]/g, " "))}?=`;
  return b64([`To: ${to}`, `Subject: ${header}`, "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "", body].join("\r\n")).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
