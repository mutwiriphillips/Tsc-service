# Data protection: design notes for the impact assessment

These notes describe what the system does. They are inputs to TSC's data protection impact assessment under section 31 of the Data Protection Act, 2019, not a substitute for it. Statements about the law should be confirmed against the current text by TSC's Data Protection Officer.

## Roles

- **Data controller:** Teachers Service Commission.
- **Data processor:** the operator hosting and maintaining the system, under a written processing agreement.
- Both register with the Office of the Data Protection Commissioner.

## What is held

| Data | Where | Who can see it | Protection |
| --- | --- | --- | --- |
| TSC number, name, sex as recorded | `Teacher` | Officers whose jurisdiction includes the teacher's school; the teacher | Jurisdiction scoping on every query |
| National ID | `Teacher.nationalIdHash` | Nobody | Keyed hash (HMAC-SHA256) only; used to verify portal registration |
| Postings, appraisals, documents | Ledger tables | Officers in scope; the teacher | Scoping; uploaded files stored in the database with a SHA-256 checksum; every file download logged |
| Health, disability, disciplinary notes | `SensitiveRecord` | County Director and National Admin, in scope | AES-256-GCM encryption; every read logged; content never written to the audit trail |
| Disciplinary cases | `DisciplinaryCase` | County Director and National Admin | Case-timeline flags hidden from lower roles; listing the register is logged |
| Officer accounts | `Officer` | National Admin; County Director for their county's officers | Passwords bcrypt-hashed; two-step secrets encrypted |
| Activity | `AuditEvent` | National Admin | Append-only (database trigger), hash-chained |

## Design choices that serve the Act

- **Minimisation.** The national ID is never stored in readable form. Sex is recorded only for aggregate reporting.
- **No solely automated decisions about people (section 35).** The readiness score rates schools. Rules raise flags; a named officer acts on them. An override always carries the officer's name and reason.
- **Purpose limitation and least privilege.** Every officer is scoped to one jurisdiction in the data layer. Out-of-scope records return "not found", so their existence is not disclosed.
- **Right of access.** The portal's "Download my record" exports everything held about the teacher. Sensitive content is listed by type and available on written request.
- **Right to correction.** Teachers raise correction requests in the portal; officers in scope answer them; the teacher sees the response.
- **No sample data.** The product contains no invented records. The test suite's fictional data cannot be loaded into a production environment.
- **Security.** TLS; two-step sign-in for officers; separate token types for officers and teachers; rate-limited sign-in; no third-party requests from the web app (the typeface is self-hosted); strict security headers.
- **Accountability.** The audit trail records approvals, overrides, rule-setting changes, imports, sensitive reads and data exports, and can be checked for tampering from the Audit page.
- **Localisation.** Designed for Kenya-based hosting (see DEPLOYMENT.md). The Render trial (RENDER.md) hosts outside Kenya and is for test data only.

## For TSC to decide

- Lawful basis for each category, in particular sensitive data.
- Retention periods for exited teachers, closed cases and audit entries. The system keeps everything until a schedule is agreed; deletion jobs are a Phase 2 item once the schedule exists.
- Breach-notification runbook and the named contacts for it.
- Whether teachers should be able to read sensitive content directly in the portal.
