<!-- Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com> · SPDX-License-Identifier: MIT -->
# ERP team-collab — how others do it, and our angle

> A "simple gather" (user ask) + the idea for our ERP Team overlay. Companion to [[ERP_CONTEXT.md]].
> Scope for the first demo: a **general group, READ-ONLY** — staff see what others are doing; role-scoped
> (intra org/dept, accounting-eligible see posting detail); social-media / WhatsApp-group feel. WhatsApp =
> a **conceptual stub** (batched ops exported as messages), not a focus. Focus stays on the ERP UI.

## How other players do team collab in/around ERP
| Player | Collab model | Shape |
|---|---|---|
| **Odoo** | **Discuss** chat + the **chatter** on every record (message thread + activity log + followers + @mention) | per-record thread + activity feed — closest to "chat == record log" |
| **Microsoft Dynamics 365** | deep **Microsoft Teams** embed (chat in records, share records to channels, M365 presence) | bolt the real Teams app onto the ERP |
| **Salesforce** | **Chatter** — enterprise social feed, follow records/people, groups, per-record feed | social network over the CRM |
| **SAP S/4HANA** | **Work Zone / Jam** social + **Situation Handling** (system flags an issue → notifies the responsible role) + Fiori **My Inbox** workflow | workflow inbox + social, alongside the data |
| **Oracle NetSuite / Fusion** | per-record Notes & Communication tab, role dashboards, SuiteApprovals routing | per-record comments + approval routing |
| **Zoho** | **Cliq** chat + per-module feeds | separate chat app + feeds |
| **QuickBooks / Xero** | per-transaction comments, "invite your accountant" (read/limited role), audit log | lightweight, role-gated read access |
| **Modern multiplayer** (Figma / Google Docs / Notion / Linear) | live presence cursors, who's-viewing avatars, activity feed, comments | real-time co-presence is the current bar |
| **Mobile / WhatsApp** | WhatsApp Business / Cloud API for transactional notices + reply-to-approve ("ChatOps") | async messaging as the approval/notify channel |

**The common pattern:** a per-record message thread **+** an org/role activity feed **+** a workflow inbox **+**
followers/@mention **+** (increasingly) live presence. Almost everyone **bolts a separate social/chat tool
alongside** the ERP data — two systems, two sources of truth, a sync problem.

## Our angle (the differentiator)
We don't bolt on a chat. **The chat IS the signed op-log** ([[ERP_CONTEXT.md]] §0): every activity line is a
*signed fact* (tamper-evident), not a side comment. One log drives the data, the feed, the dashboard, and the
mobile/WhatsApp bridge — no second system, no sync problem.
- **Role-scoped groups** = the partition axis (role / org). The first demo = the **general group**: everyone in
  the org sees the signed activity stream **read-only** (same read-only stance as today); accounting-eligible
  users (`isShowAcct`) additionally see posting amounts — others see them masked. Later: dept/role sub-groups.
- **Read-only general view first** — staff *see what others are doing* (created INV-001, submitted, approved,
  posted) as a WhatsApp-group-style thread + presence ("who's active"). Writing stays owner-gated (not in this demo).
- **No social server** — the facilitator (GH/OCI, already built) relays the signed ops. Collaboration falls out
  of the log "for free."
- **WhatsApp as just another transport** — since people chat on mobile, the op-log can be **batch-exported** as
  WhatsApp-group messages (deterministic render of verb+params). Conceptual stub now: outbound batched ops only,
  no live API; the "dumb post office" can be WhatsApp. Nothing overlandish — keep the focus on the ERP UI.

## First demo = these pieces (built next, witnessed)
1. `erp_scenario.js` — a signed ERP op-log (an org doing real doc work: AP creates+submits an invoice, approver
   approves, accountant posts, sales raises an order, a comment) — chained via the Teams connector (tamper-evident).
2. `erp_feed.js` — the **read-only, role-scoped general-group feed**: chat-is-log (ERP prose) + presence + a small
   dashboard (per-role activity, per-doc status). Acct detail gated by `isShowAcct`. NON-INVENT (every line = an op).
3. `whatsapp_bridge.js` — conceptual stub: batch-export the feed as WhatsApp-group messages; outbound-only, no API.
4. `erp_team.html` — the general-group read-only demo page (WhatsApp-group styled), reusing the Teams view shell.

## Workflow & process-mining (researched 2026-06-30) → see [[ERP_CONTEXT.md]] §5.1
- **iDempiere `AD_Workflow`** is a full engine (General / Document-Process / Document-Value / Manufacturing; per-node
  responsible user/group/org; approval hierarchy; **Workflow Activities** = a pending-task queue). [wiki: Workflow W113, Workflow Activities F117]
- **Modern ERPs:** SAP S/4HANA = AI/ML conditional automation + **My Inbox**; NetSuite **SuiteFlow** = no-code visual
  workflow + multi-step approvals; Odoo = **chatter + Activities + followers**; Dynamics = Copilot + Teams embed.
- **Process mining (Celonis / SAP Signavio / ServiceNow)** is the standout: discover the real process from an EVENT
  LOG, expose bottlenecks/variants, and **conformance-check** as-is vs to-be. Its prerequisite is an event log with
  `case · activity · actor · timestamp` — which **we already have in `kernel_ops`**. So we get a lightweight Flow
  lens for ~free; `AD_Workflow` is the to-be reference, not a daily BPMN tab.
- **Adopt:** the **Activities / work-inbox** ("waiting for me") + **followers/@mention** (Odoo/Salesforce). Defer:
  no-code workflow builder, AI/Copilot.
- **Decision:** Kanban stays operational; the **Dashboard "Flow" lens** = process-mining over the op-log;
  `AD_Workflow` = conformance reference. ([[ERP_CONTEXT.md]] §5.1)

**Sources:** iDempiere Workflow (Window 113) · iDempiere Workflow Activities (Form 117) ·
NetSuite SuiteFlow / ERP comparison (netsuite.com) · Celonis Process Mining + Conformance Checker (celonis.com) ·
ServiceNow×Celonis (diginomica.com) · Odoo Chatter (odoo.com/documentation).
