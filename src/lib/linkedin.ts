// Browser-safe LinkedIn action catalogue shared by the sequence editor, lead panel and server.
export const LINKEDIN_ACTIONS = ["connect", "visit", "message", "like", "comment", "share"] as const;
export type LinkedInAction = (typeof LINKEDIN_ACTIONS)[number];

export const LINKEDIN_ACTION_META: Record<LinkedInAction, { label: string; needsText: boolean; textLabel: string }> = {
  connect: { label: "Connection request", needsText: false, textLabel: "Note (optional, max 300)" },
  visit: { label: "Profile visit", needsText: false, textLabel: "" },
  message: { label: "Direct message", needsText: true, textLabel: "Message" },
  like: { label: "Like latest post", needsText: false, textLabel: "" },
  comment: { label: "Comment on latest post", needsText: true, textLabel: "Comment" },
  share: { label: "Share content", needsText: true, textLabel: "Post text or link to share" },
};

export function isLinkedInAction(v: unknown): v is LinkedInAction {
  return typeof v === "string" && (LINKEDIN_ACTIONS as readonly string[]).includes(v);
}

/** Phantombuster agent to run for an action: its own phantom, else the legacy single phantom. */
export function phantomFor(config: Record<string, string | undefined>, action: LinkedInAction): string | null {
  return config[`phantom_${action}`]?.trim() || config["phantom_id"]?.trim() || null;
}
