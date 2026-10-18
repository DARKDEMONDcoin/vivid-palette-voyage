# QA Audit — External Database (post-migration)

Date: 2026-10-18 · Tester: automated end-to-end run as `abdallamohamed55xx@gmail.com` (Super Admin)
Backend: user-owned external Supabase project (`lhfjgpffizxlwmxsxvuc`) — app fully switched over.

## Result: all main flows PASS

| # | Flow | Result |
|---|------|--------|
| 1 | Sign in with email/password on external auth | ✅ Lands on /dashboard |
| 2 | Workspace auto-creation on first sign-in | ✅ "My workspace" created, role = Super Admin |
| 3 | Dashboard KPIs, setup checklist, empty states | ✅ Renders, no console errors |
| 4 | Create organization ("Test Brand Co") | ✅ Saved and listed |
| 5 | Create agent ("QA Agent Sara", assigned to brand) | ✅ Saved, redirects to agent detail |
| 6 | Campaign wizard step 1 — basics ("QA Test Campaign") | ✅ Created as Draft |
| 7 | Step 2 — CSV lead import (3 rows, column auto-mapping) | ✅ All 3 mapped and imported; visible on Leads page |
| 8 | Step 3 — AI qualification scoring | ✅ All 3 scored via LLM (correctly below threshold on fake data); manual override to Qualified works |
| 9 | Step 4 — AI research | ✅ 3/3 leads researched |
| 10 | Step 5 — sequence builder (4 steps: Email, LinkedIn, Email, Call) | ✅ Saved |
| 11 | Step 6 — AI copywriting | ✅ 12/12 messages drafted (4 steps × 3 leads) |
| 12 | Step 7 — approval | ✅ "Approve all 12" works |
| 13 | Step 8 — launch | ✅ Campaign Active, 12 messages Scheduled |
| 14 | Inbox — "Log a reply" + AI classification | ✅ Classified as "meeting request", marked SQL, sequence stopped for that lead, timeline updated |
| 15 | Freshsales push on SQL | ✅ Correctly reported "Freshsales not connected" (no fake success) |
| 16 | Settings, Integrations, Organizations, Analytics pages | ✅ All load without errors |

## Notes / minor issues

1. **Campaign "leads in this campaign" counter** on the Lead source step showed 0 right after import until the page was reloaded — a stale-cache display issue only; the leads were imported correctly.
2. **Agent form**: clicking "Create agent" with the organization select opened but unchosen fails silently (toast only). Consider inline validation message.
3. Replies are not captured automatically yet — expected, since no agent mailbox is connected (Google/Microsoft connector consent still pending).
4. Scheduled messages will stay "Scheduled" until the sequence tick runs and a mailbox/Phantombuster/Vapi path is available for each channel.

## Test data left in the workspace

- Organization: Test Brand Co
- Agent: QA Agent Sara (paused)
- Campaign: QA Test Campaign (Active, 12 scheduled messages)
- Leads: qa.lead1/2/3@testbrand.example.com (Omar Hassan is SQL, sequence stopped)
- 1 reply in Inbox (meeting request, unhandled)

Delete these when done testing, or keep them as demo data.
