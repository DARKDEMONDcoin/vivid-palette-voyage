import { describe, it, expect } from "vitest";
import { phantomFor, isLinkedInAction, LINKEDIN_ACTION_META } from "@/lib/linkedin";

describe("LinkedIn actions", () => {
  it("uses the action's own phantom first", () => {
    expect(phantomFor({ phantom_connect: "111", phantom_id: "999" }, "connect")).toBe("111");
  });
  it("falls back to the general phantom", () => {
    expect(phantomFor({ phantom_id: "999" }, "visit")).toBe("999");
  });
  it("returns null when no phantom is set", () => {
    expect(phantomFor({}, "like")).toBeNull();
  });
  it("supports the six requested actions only", () => {
    for (const a of ["connect", "visit", "message", "like", "comment", "share"]) expect(isLinkedInAction(a)).toBe(true);
    expect(isLinkedInAction("endorse")).toBe(false);
  });
  it("requires text for comments and shares but not visits", () => {
    expect(LINKEDIN_ACTION_META.comment.needsText).toBe(true);
    expect(LINKEDIN_ACTION_META.share.needsText).toBe(true);
    expect(LINKEDIN_ACTION_META.visit.needsText).toBe(false);
  });
});
