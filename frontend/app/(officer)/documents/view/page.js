'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { officerApi } from '@/lib/api';
import { DOC_STATUS, DOC_TYPE, ROLE_LABEL, TIER_LABEL, docStatusTag, fmtDate, fmtDateTime, fullName } from '@/lib/format';
import { useOfficer } from '@/components/OfficerContext';
import { ErrorNotice, Loading, SuccessNotice, useAction, useData } from '@/components/ui';

const TIER_ROLE = { SUBCOUNTY: 'SUBCOUNTY_DIRECTOR', COUNTY: 'COUNTY_DIRECTOR', NATIONAL: 'NATIONAL_ADMIN' };

function DocumentDetailInner() {
  const id = useSearchParams().get('id') || '';
  const officer = useOfficer();
  const doc = useData(() => officerApi.get(`/api/documents/${id}`), [id]);
  const act = useAction();
  const [reason, setReason] = useState('');

  if (doc.error) return <ErrorNotice error={doc.error} />;
  if (!doc.data) return <Loading />;
  const d = doc.data;
  const tiers = d.type === 'PROMOTION_FILE' ? ['SUBCOUNTY', 'COUNTY', 'NATIONAL'] : ['SUBCOUNTY', 'COUNTY'];
  const myTurn = d.nextTier && TIER_ROLE[d.nextTier] === officer.role;
  const ownSubmission = d.submittedByOfficer && d.submittedByOfficer.id === officer.id;
  const eligibility = d.meta && d.meta.eligibility;

  const decide = (decision) =>
    act.run(async () => {
      await officerApi.post(`/api/documents/${d.id}/decide`, { decision, reason: reason.trim() || undefined });
      setReason('');
      doc.reload();
    }, decision === 'APPROVED' ? 'Approved' : 'Rejected');

  const download = () =>
    act.run(async () => {
      const blob = await officerApi.get(`/api/documents/${d.id}/file`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = d.fileName || 'document';
      a.click();
      URL.revokeObjectURL(url);
    });

  return (
    <div className="stack-lg">
      <div>
        <p className="small">
          <Link href="/documents">Documents</Link>
        </p>
        <h1>{d.title}</h1>
        <p className="muted">
          {DOC_TYPE[d.type]} · {d.school.name}
          {d.teacher && (
            <>
              {' '}
              · <Link href={`/teachers/view?id=${d.teacher.id}`}>{fullName(d.teacher)}</Link>
            </>
          )}
        </p>
      </div>
      <ErrorNotice error={act.error} />
      <SuccessNotice message={act.success} />

      <div className="grid-2">
        <section className="panel">
          <h2 style={{ marginBottom: '1rem' }}>Approval route</h2>
          <ol className="stack" style={{ paddingLeft: '1.2rem', margin: 0 }}>
            {tiers.map((tier) => {
              const a = d.approvals.find((x) => x.tier === tier);
              return (
                <li key={tier}>
                  <strong>{TIER_LABEL[tier]}</strong>
                  <div className="small">
                    {a ? (
                      <>
                        <span className={`tag ${a.decision === 'APPROVED' ? 'ok' : 'breach'}`}>{a.decision.toLowerCase()}</span> by {a.officer.name} ({ROLE_LABEL[a.officer.role]}), {fmtDateTime(a.at)}
                        {a.reason && <div className="muted">Reason: {a.reason}</div>}
                      </>
                    ) : d.status === 'REJECTED' ? (
                      <span className="muted">Not reached</span>
                    ) : d.nextTier === tier ? (
                      <span className="tag info">Waiting</span>
                    ) : (
                      <span className="muted">Later</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          <p style={{ marginTop: '1rem' }}>
            <span className={`tag ${docStatusTag(d.status)}`}>{DOC_STATUS[d.status]}</span>
          </p>
        </section>

        <section className="panel stack">
          <h2>Details</h2>
          <dl className="facts">
            <dt>Submitted</dt>
            <dd>
              {fmtDateTime(d.submittedAt)} by {d.submittedByTeacher ? 'the teacher, through the portal' : d.submittedByOfficer ? d.submittedByOfficer.name : '—'}
            </dd>
            {d.decidedAt && (
              <>
                <dt>Decided</dt>
                <dd>{fmtDate(d.decidedAt)}</dd>
              </>
            )}
            <dt>File</dt>
            <dd>
              {d.storageKey ? (
                <button className="btn secondary small" onClick={download}>
                  Download {d.fileName}
                </button>
              ) : (
                'No file attached'
              )}
            </dd>
          </dl>
          {d.meta && d.meta.reason && (
            <div>
              <h3>Teacher&rsquo;s reason</h3>
              <p style={{ whiteSpace: 'pre-wrap' }}>{d.meta.reason}</p>
            </div>
          )}
          {eligibility && (
            <div className={`notice ${eligibility.eligible ? 'success' : 'warning'}`}>
              {eligibility.eligible ? `Eligible: ${eligibility.yearsAtStation ?? 'enough'} years at current station.` : eligibility.warning}
            </div>
          )}
          {d.type === 'TRANSFER_REQUEST' && d.status === 'COUNTY_APPROVED' && (
            <p className="small muted">Approval records the decision only. Record the move itself from the destination school&rsquo;s page.</p>
          )}
        </section>
      </div>

      {myTurn && (
        <section className="panel stack" aria-labelledby="decide-h">
          <h2 id="decide-h">Your decision: {TIER_LABEL[d.nextTier]}</h2>
          {ownSubmission ? (
            <div className="notice warning">You submitted this document, so another officer must decide it.</div>
          ) : (
            <>
              <div className="field">
                <label htmlFor="reason">
                  Reason <span className="hint">Required to reject. Recorded in the audit trail.</span>
                </label>
                <textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
              <div className="row">
                <button className="btn" disabled={act.busy} onClick={() => decide('APPROVED')}>
                  Approve
                </button>
                <button className="btn danger" disabled={act.busy || reason.trim().length < 5} onClick={() => decide('REJECTED')}>
                  Reject
                </button>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}

// The record ID travels in the query string (?id=), so the page can be exported as a static file.
export default function DocumentDetail() {
  return (
    <Suspense fallback={<Loading />}>
      <DocumentDetailInner />
    </Suspense>
  );
}
