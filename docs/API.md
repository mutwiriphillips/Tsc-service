# API reference

Generated from the mounted routes (`npm run check`). Every route except `/api/auth/*` and `/api/health` requires a token. Role limits are enforced on the server; see each module's source for the exact roles.

All officer routes return only records inside the officer's jurisdiction. Out-of-scope records return 404. The same server also serves the web pages on every non-`/api` path.

## /api/auth

Identity: Public for sign-in and registration (rate-limited); officer token for /officer/me and change-password

| Method | Path |
| --- | --- |
| POST | `/api/auth/officer/login` |
| POST | `/api/auth/officer/mfa/setup` |
| POST | `/api/auth/officer/mfa/verify` |
| GET | `/api/auth/officer/me` |
| POST | `/api/auth/officer/change-password` |
| POST | `/api/auth/teacher/register` |
| POST | `/api/auth/teacher/login` |

## /api/geo

Identity: Officer token

| Method | Path |
| --- | --- |
| GET | `/api/geo/regions` |
| GET | `/api/geo/counties/:id/sub-counties` |
| POST | `/api/geo/counties/:id/sub-counties` |

## /api/officers

Identity: Officer token

| Method | Path |
| --- | --- |
| GET | `/api/officers` |
| POST | `/api/officers` |
| PUT | `/api/officers/:id/cso-schools` |
| POST | `/api/officers/:id/deactivate` |
| POST | `/api/officers/:id/reset-mfa` |

## /api/schools

Identity: Officer token

| Method | Path |
| --- | --- |
| GET | `/api/schools` |
| GET | `/api/schools/:id` |
| POST | `/api/schools` |
| PATCH | `/api/schools/:id/establishment` |

## /api/teachers

Identity: Officer token

| Method | Path |
| --- | --- |
| GET | `/api/teachers` |
| GET | `/api/teachers/lookup` |
| GET | `/api/teachers/corrections` |
| POST | `/api/teachers/corrections/:id/resolve` |
| GET | `/api/teachers/:id` |
| GET | `/api/teachers/:id/sensitive` |
| POST | `/api/teachers/:id/sensitive` |
| POST | `/api/teachers` |
| PATCH | `/api/teachers/:id/registration` |
| PATCH | `/api/teachers/:id/personnel-file` |

## /api/postings

Identity: Officer token

| Method | Path |
| --- | --- |
| GET | `/api/postings` |
| POST | `/api/postings` |
| POST | `/api/postings/:id/end` |
| POST | `/api/postings/transfer` |

## /api/vacancies

Identity: Officer token

| Method | Path |
| --- | --- |
| GET | `/api/vacancies` |
| POST | `/api/vacancies` |

## /api/documents

Identity: Officer token

| Method | Path |
| --- | --- |
| GET | `/api/documents` |
| GET | `/api/documents/:id` |
| POST | `/api/documents` |
| POST | `/api/documents/:id/decide` |
| PUT | `/api/documents/:id/file` |
| GET | `/api/documents/:id/file` |

## /api/visits

Identity: Officer token

| Method | Path |
| --- | --- |
| GET | `/api/visits` |
| POST | `/api/visits` |
| POST | `/api/visits/:id/approve` |
| POST | `/api/visits/:id/complete` |
| POST | `/api/visits/:id/cancel` |

## /api/compliance

Identity: Officer token

| Method | Path |
| --- | --- |
| GET | `/api/compliance/flags` |
| POST | `/api/compliance/flags/:id/override` |
| POST | `/api/compliance/run` |
| GET | `/api/compliance/rules` |
| PUT | `/api/compliance/rules/:key` |

## /api/appraisals

Identity: Officer token

| Method | Path |
| --- | --- |
| GET | `/api/appraisals` |
| POST | `/api/appraisals` |

## /api/cases

Identity: Officer token

| Method | Path |
| --- | --- |
| GET | `/api/cases` |
| POST | `/api/cases` |
| POST | `/api/cases/:id/close` |

## /api/reports

Identity: Officer token

| Method | Path |
| --- | --- |
| GET | `/api/reports/summary` |
| GET | `/api/reports/staffing` |

## /api/admin

Identity: Officer token

| Method | Path |
| --- | --- |
| GET | `/api/admin/audit` |
| GET | `/api/admin/audit/verify` |

## /api/integrations

Identity: Officer token

| Method | Path |
| --- | --- |
| GET | `/api/integrations/status` |
| POST | `/api/integrations/import/teachers` |
| POST | `/api/integrations/import/appraisals` |

## /api/portal

Identity: Teacher token

| Method | Path |
| --- | --- |
| GET | `/api/portal/me` |
| GET | `/api/portal/postings` |
| GET | `/api/portal/appraisals` |
| GET | `/api/portal/documents` |
| POST | `/api/portal/transfer-requests` |
| POST | `/api/portal/corrections` |
| GET | `/api/portal/corrections` |
| GET | `/api/portal/my-data` |
| POST | `/api/portal/change-password` |
