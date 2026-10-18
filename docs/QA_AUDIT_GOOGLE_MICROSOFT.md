# QA Audit — Google & Microsoft Integrations (External Database)

Date: 2026-10-18 · Tester: automated end-to-end (Playwright) · Account: test user (Super Admin, "My workspace")

## Results

| # | Flow | Result |
|---|------|--------|
| 1 | Email/password sign-in | ✅ Pass — lands on /dashboard |
| 2 | Google sign-in (account creation) | ✅ Config verified — button redirects to Google with the workspace's own Client ID and the correct callback. Full completion not automatable: Google blocks headless browsers (anti-bot). Needs one manual click by the user. |
| 3 | Microsoft sign-in | ⚠️ Same code path as Google (verified pattern); not clicked through — no Microsoft test account available. Needs one manual click by the user. |
| 4 | Agent creation | ✅ Pass — "E2E Test Agent" created under Test Brand Co (id f68f63c5-6b99-499d-8c69-83e708d0160a), no console errors |
| 5 | Mailbox UI on agent Settings tab | ✅ Pass — "Connect Gmail" / "Connect Outlook" buttons enabled, status "Not connected" |
| 6 | Gmail mailbox consent | ❌ Blocked by Google app config — `redirect_uri_mismatch`. The OAuth client is missing the gateway callback (see Fix required below) |
| 7 | Outlook mailbox consent | ⚠️ Not attempted — same redirect-URI registration needed in Azure; no Microsoft test account |
| 8 | Campaign execution (QA Test Campaign) | ✅ Pass — campaign Active, 8 messages scheduled, "Send due steps now" runs without errors; 0 sent because no mailbox is connected (correct behavior — nothing sends silently) |
| 9 | Reply capture + AI classification | ✅ Pass — logged reply classified "meeting request", lead marked SQL, visible in campaign Replies and Inbox; Freshsales sync correctly skipped ("not connected") |
| 10 | Console errors across all pages | ✅ None |

## Fix required (user action, one time)

Google rejected the mailbox consent with `redirect_uri_mismatch`. Add this exact address as an Authorized redirect URI:

- **Google Cloud** → APIs & Services → Credentials → your OAuth client → Authorized redirect URIs:
  `https://connector-gateway.lovable.dev/api/v1/app-users/oauth2/callback`
- **Azure** → App registration → Authentication → Web → Redirect URIs: same address.

This is separate from the sign-in callback (`.../auth/v1/callback`) already configured — both are needed: one for sign-in, one for mailbox linking.

## After the fix

1. Open the agent → Settings → Connect Gmail → approve consent → status should show the connected email.
2. Repeat for Connect Outlook with a Microsoft account.
3. Campaign emails will then send through the linked mailbox on the next scheduled run.

## Notes

- No code bugs found in this round; the only failure is the missing redirect URI in the user's own Google/Azure app registrations.
- Test data left in workspace: agent "E2E Test Agent", campaign "QA Test Campaign" (active, 8 scheduled).
