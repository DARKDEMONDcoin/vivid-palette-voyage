import { describe, it, expect } from "vitest";
import { canManageMailbox, connectorFor, rawEmail, safeAuthDestination } from "@/lib/mailbox-rules";
import { encryptKey, decryptKey, checkedJson } from "@/lib/mailbox-gateway.server";
describe("mailbox permissions", () => {
  it("permits workspace administrators", () => expect(canManageMailbox("super_admin", "user", "other")).toBe(true));
  it("permits a standard user only for their own agent", () => {
    expect(canManageMailbox("standard", "owner", "owner")).toBe(true);
    expect(canManageMailbox("standard", "other", "owner")).toBe(false);
  });
  it("denies viewers even when they created the agent", () => expect(canManageMailbox("viewer", "owner", "owner")).toBe(false));
  it("denies nonmembers", () => expect(canManageMailbox(undefined, "owner", "owner")).toBe(false));
});
describe("mailbox credentials and transport", () => {
  it("routes each provider separately", () => { expect(connectorFor("gmail")).toBe("google_mail"); expect(connectorFor("outlook")).toBe("microsoft_outlook"); });
  it("encrypts connection keys with authenticated encryption", () => {
    const secret = Buffer.alloc(32, 7).toString("base64"), plaintext = "test-credential";
    const stored = encryptKey(plaintext, secret);
    expect(stored).not.toContain(plaintext);
    expect(decryptKey(stored, secret)).toBe(plaintext);
    expect(encryptKey(plaintext, secret)).not.toBe(stored);
    expect(() => decryptKey(stored, Buffer.alloc(32, 8).toString("base64"))).toThrow();
  });
  it("handles Outlook's empty accepted response", async () => expect(await checkedJson(new Response(null, { status: 202 }))).toEqual({}));
  it("preserves provider errors", async () => expect(checkedJson(new Response("missing scope", { status: 403 }))).rejects.toThrow("[403]: missing scope"));
  it("supports Arabic email bodies and MIME subjects", () => {
    const raw = rawEmail("recipient@example.com", "مرحبا", "رسالة اختبار");
    const decoded = Buffer.from(raw, "base64url").toString("utf8");
    expect(decoded).toContain("رسالة اختبار");
    const match = decoded.match(/Subject: =\?UTF-8\?B\?([^?]+)\?=/);
    expect(Buffer.from(match?.[1] ?? "", "base64").toString("utf8")).toBe("مرحبا");
  });
  it("rejects injected recipient headers", () => expect(() => rawEmail("a@example.com\r\nBcc: b@example.com", "Hi", "body")).toThrow());
});
describe("social auth return", () => {
  it("retains a local agent destination", () => expect(safeAuthDestination("/agents/abc", "https://app.example")).toBe("/agents/abc"));
  it("rejects external redirects", () => expect(safeAuthDestination("//evil.example", "https://app.example")).toBe("/dashboard"));
  it("does not return to sign-in or API endpoints", () => { expect(safeAuthDestination("/auth", "https://app.example")).toBe("/dashboard"); expect(safeAuthDestination("/api/public/foo", "https://app.example")).toBe("/dashboard"); });
});
