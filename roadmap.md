# Roadmap

- [ ] Current audit — signed-in navigation, organization/document CRUD, agent settings, campaign workflow, leads, inbox, analytics, integrations and settings; fix reproduced defects and run regression tests

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
