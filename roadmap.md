# Roadmap

- [x] Fix mailbox Invalid key length — 16 mailbox tests pass, legacy ciphertext compatibility verified, valid existing 32-byte project encryption setting restored on Vercel, production redeployment READY.
- [ ] Restore previously registered mailbox grants — live Gmail/Outlook retest now reports a missing stored reconnect credential; encrypted handles cannot be recovered with the current key. Requires provider grant reset or the original encryption setting; completed consent/sending remain unverified.

- [x] Post-import audit — all signed-in pages, details, settings tabs, org create/delete pass; server database key fixed
- [x] Mailbox encryption key regenerated — user re-links mailboxes
- [x] Full interactive E2E audit — all modules pass; fixed approval-edit loss, header search, Help menu, "out of_office" labels
- [x] Gmail / Outlook clients linked; connect buttons open Google/Microsoft sign-in (old saved links need reconnect)

- [x] Phase 1 — Auth, workspaces, roles, layout, design
- [x] Phase 2 — Organizations, documents, RAG, brand summary
- [x] Phase 3 — Agents (form, list, detail, sending rules)
- [x] Phase 3b — Google/Microsoft clients linked; secure user mailbox consent and agent assignment implemented
- [ ] Verify completed Google/Microsoft account creation and mailbox linking — blocked: account owner must complete provider consent; available test workspace has no organization or agent
- [x] Phase 4 — Integrations page (Apollo, Freshsales, Slack tests)
- [ ] Phase 4b — LinkedIn and calling providers — blocked: provider not chosen
- [x] Phase 5 — Campaign wizard steps 1–4 (basics, sources, qualification, research)
- [ ] Phase 5b — Google Sheet lead source — blocked: workspace Google OAuth app not configured
- [x] Phase 6 — Wizard steps 5–8, sequence engine (10-min sender), approvals, reply classification, SQL → Freshsales + Slack
- [x] Phase 6b — Automatic email sending implemented through agent-owned Gmail/Outlook connections
- [ ] Phase 6c — Automatic email reply capture (not implemented; replies logged by hand meanwhile)
- [x] Phase 7 — Inbox and Leads database
- [x] Phase 8 — Analytics and Dashboard (cost per SQL not tracked)
- [x] Phase 9 — Settings modules (unsubscribe links, bounces, token/cost metering, email notifications wait on mailbox sending)
- [ ] Later — brand logo upload, OCR for scanned PDFs, dark theme, 2FA, demo workspace

- [x] Relink Gmail + Outlook mailbox clients after workspace move
- [x] LinkedIn automation via Phantombuster (campaign steps + lead buttons)
- [x] Re-audit after LinkedIn: fixed Approval/Launch tabs staying locked
- [x] Vercel mailbox configuration — validated the database credential, added missing production database and gateway keys, preserved existing connector/encryption keys, and redeployed successfully
- [x] Reproduce mailbox failure on Vercel with the demo account — both connection buttons fail at OAuth start with HTTP 404 `app-user connector client_not_found`; neither reaches provider consent
- [x] Restore Gmail and Outlook clients in the current workspace and sync client keys plus matching workspace authorization to Vercel; production redeployment READY
- [x] Retest Vercel mailbox connection starts — Gmail opens Google sign-in and Outlook opens Microsoft sign-in without the previous 404
- [ ] Verify completed mailbox consent, saved binding, and sending on Vercel — blocked: mailbox owner must sign into Google/Microsoft and grant consent; demo app credentials do not authorize provider access
