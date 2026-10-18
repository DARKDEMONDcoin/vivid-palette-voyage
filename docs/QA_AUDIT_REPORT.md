# Outreach AI — QA Audit Report

Date: 2026-10-15 · Tester account: workspace "My workspace" (Super Admin) · Method: scripted browser tests against the live preview + direct database checks.

## 1. Executive summary

Every module across the 9 phases was exercised end to end with real input. **5 bugs were found and fixed**, including the organization-creation failure you reported. The core flow now works: create a brand → upload documents → approve the AI summary → create an agent → connect AI → build a campaign (import, qualify, research, sequence, copy, approve) → launch → log replies → SQL detection → inbox → analytics → settings/compliance.

What cannot work yet is anything that needs an outside account that isn't connected: **email sending (Gmail/Outlook), Freshsales, Google Sheets**. These show "Not connected" rather than fake data.

## 2. The organization-creation bug (your report)

- **Symptom:** clicking Create did nothing / showed an error; no brand appeared.
- **Cause:** the save succeeded, but the security rule that decides who may *see* a brand checked access in a way that didn't yet include the brand just created, so the app couldn't read it back and treated it as a failure.
- **Fix:** the read rule now also allows the creator and Super Admins directly. Same fix applied to campaigns (same pattern).
- **Verified:** created "Audit Test Brand" through the UI; it appears in the list and opens.

## 3. Feature-by-feature results

| Area | Feature | Result |
|---|---|---|
| Auth | Sign in, sign out, session persistence | Pass |
| Auth | Sign up / password reset pages load | Pass (email delivery not tested) |
| Organizations | Create, edit profile, languages, signature | Pass (after fix) |
| Organizations | Upload documents (TXT/PDF/DOCX/XLSX/CSV), indexing | Pass |
| Organizations | AI knowledge summary, approve | Pass |
| Organizations | Grant/revoke user access | Pass (UI) — needs a 2nd user in the workspace to fully verify |
| Organizations | Logo upload | Not built (no button) |
| Agents | Create/edit, tone, targeting, sending rules, warm-up | Pass |
| Agents | Pause / activate / delete | Pass |
| Agents | Connect Gmail/Outlook mailbox | Stub — shows "Not connected" |
| Integrations | Built-in AI model, connection test | Pass |
| Integrations | Apollo / Phantombuster / Vapi / Slack / Freshsales forms + key-hiding | Pass (forms); live tests need your keys |
| Integrations | Google Sheets, Gmail/Outlook OAuth | Not connected (needs Google/Microsoft app setup) |
| Campaigns | Wizard basics (name, agent, language, A/B) | Pass |
| Campaigns | CSV/Excel import + column mapping + de-dup + suppression | Pass (after fix to size ranges like "1-10" becoming dates) |
| Campaigns | Apollo search/import | Unverified — no Apollo key |
| Campaigns | AI qualification + threshold + manual override | Pass (scores 10/8/4) |
| Campaigns | Company research with cited URLs | Pass |
| Campaigns | Sequence builder (email/LinkedIn/call steps) | Pass |
| Campaigns | AI copy, edit, approve/reject, bulk approve | Pass |
| Campaigns | Launch, pause, resume, run now | Pass (after fix — launch previously looked like it did nothing) |
| Campaigns | Actual sending | Blocked — email needs mailbox; LinkedIn/calls need Phantombuster/Vapi keys |
| Inbox | List, filters (To handle / SQLs / All), detail + history | Pass |
| Inbox | Log a reply → AI classification → stops sequence | Pass |
| Inbox | Mark handled / reopen | Pass |
| Inbox | Unsubscribe reply adds to suppression | Pass |
| Inbox | SQL → Freshsales push | Fails gracefully: "Freshsales not connected" |
| Leads | Search, filters, pagination, timeline, CSV export | Pass |
| Leads | Bulk do-not-contact | Pass |
| Leads | Saved views, 90-day cooldown, one-active-campaign rule | Not built / not enforced |
| Analytics | KPIs, funnel, daily chart, agent/campaign/A-B tables | Pass — matches database counts (after fix) |
| Dashboard | KPIs, top campaigns, Get-started checklist | Pass |
| Settings | Profile, Workspace, Team tabs load and save | Pass |
| Settings | Team invitations | Pass (record created; no invite email sent) |
| Settings | Compliance: suppression (email/domain, per brand), GDPR erase | Pass |
| Settings | Usage & billing | Pass (counts only; no cost figures) |
| Settings | Audit log | Pass |
| Settings | API keys + public leads API | Pass (401 bad key, 200 good key) |
| Settings | Webhooks | Pass — delivered with status 200 |
| Settings | Notifications preferences + bell | Pass |
| Background | 10-minute sequence scheduler | Pass (rejects unauthorised calls) |

## 4. Bugs found and fixed

| # | Severity | Bug | Fix |
|---|---|---|---|
| 1 | Critical | Creating an organization failed | Read rule allows creator/Super Admin |
| 2 | High | Creating a campaign could fail the same way | Same fix for campaigns |
| 3 | High | Launch/pause silently failed; campaign stayed "Draft" | Errors now surfaced; status saves correctly |
| 4 | High | Notification trigger crashed on some tables, blocking saves | Trigger reads each table's fields safely |
| 5 | Medium | Company sizes like "1-10" imported as dates | Import reads cells as plain text |
| 6 | Medium | A lead replying twice was counted as 2 SQLs and pushed to Freshsales/webhooks twice; a later neutral reply downgraded an SQL to "replied" | SQLs/interested counted once per lead; repeat SQL replies are not re-pushed; SQL status kept |

## 5. Security / data isolation

Tested with your real session against the database API directly:
- Your account sees only its own workspace; the second workspace in the system (another user) is invisible across all 17 tables checked.
- Signed-out requests see **zero rows** in every table.
- Inserting into another workspace is rejected; stored integration secrets can't be read or written from the app.
- Not verified: Standard User and Viewer permissions inside the same workspace — this needs a second account invited to your workspace.

## 6. Open issues / not yet built

1. Gmail/Outlook connection — no email sending, automatic reply capture, unsubscribe links or bounce handling.
2. Freshsales not connected (needs API key, domain, field mapping).
3. Google Sheets import not connected.
4. Leads: saved views, 90-day cooldown, "one active campaign per lead" rule.
5. Per-country call-time rules; cost per SQL / AI usage metering; plan limits.
6. Invitation and notification emails are not sent.
7. Brand logo upload; OCR for scanned PDFs.
8. Background actions appear as "System" in the audit log.

## 7. Test data left in your workspace

Brand "Audit Test Brand", agent "Sara Audit", campaign "QA-Audit Campaign UAE" (active, 2 leads, 3 logged replies), one test API key, one test webhook (httpbin.org), 5 suppression entries. Left in place so you can inspect them; ask and they'll be removed.

## 8. Recommended next steps

1. Connect Freshsales and Apollo keys, then re-test those paths.
2. Set up Google/Microsoft sign-in apps to enable mailboxes and Sheets.
3. Invite a second user as Standard and as Viewer to confirm role limits.
4. Build the missing Leads rules (cooldown, one active campaign).
5. Change the password you shared in chat.
