'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { officerApi, qs } from '@/lib/api';
import { RULE_LABEL, fmtDate } from '@/lib/format';
import { useOfficer, can } from '@/components/OfficerContext';
import { ErrorNotice, Loading, PageHead, Pager, ReasonAction, SeverityTag, SuccessNotice, useAction, useData } from '@/components/ui';

function ComplianceInner() {
  const officer = useOfficer();
  const params = useSearchParams();
  const [severity, setSeverity] = useState(params.get('severity') || '');
  const [rule, setRule] = useState('');
  const [status, setStatus] = useState('OPEN');
  const [page, setPage] = useState(1);
  const list = useData(() => officerApi.get(`/api/compliance/flags${qs({ severity, rule, status, page, pageSize: 50 })}`), [severity, rule, status, page]);
  const act = useAction();

  return (
    <div>
      <PageHead title="Compliance flags" intro="Raised automatically by the rules each night. A breach needs action; a warning is a limit coming up. Only a County Director or National Admin can override, with a reason.">
        {can(officer, 'runRules') && (
          <button className="btn secondary" disabled={act.busy} onClick={() => act.run(async () => { const r = await officerApi.post('/api/compliance/run'); list.reload(); return r; }, 'Rules checked against the latest records')}>
            {act.busy ? 'Checking…' : 'Check now'}
          </button>
        )}
      </PageHead>
      <ErrorNotice error={act.error} />
      <SuccessNotice message={act.success} />
      <div className="toolbar">
        <div className="field">
          <label htmlFor="fs">Status</label>
          <select id="fs" value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
            <option value="OPEN">Open</option>
            <option value="OVERRIDDEN">Overridden</option>
            <option value="RESOLVED">Resolved</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="fv">Severity</label>
          <select id="fv" value={severity} onChange={(e) => { setPage(1); setSeverity(e.target.value); }}>
            <option value="">Breaches and warnings</option>
            <option value="BREACH">Breaches</option>
            <option value="WARNING">Warnings</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="fr">Rule</label>
          <select id="fr" value={rule} onChange={(e) => { setPage(1); setRule(e.target.value); }}>
            <option value="">All rules</option>
            {Object.entries(RULE_LABEL)
              .filter(([k]) => k !== 'TRANSFER_ELIGIBILITY' && (k !== 'CASE_TIMELINES' || can(officer, 'seeSensitive')))
              .map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
          </select>
        </div>
      </div>
      <ErrorNotice error={list.error} />
      {list.loading && !list.data && <Loading />}
      {list.data && (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Flag</th>
                  <th>School</th>
                  <th>Raised</th>
                  <th>{status === 'OVERRIDDEN' ? 'Override' : 'Action'}</th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.length === 0 && (
                  <tr>
                    <td colSpan={4} className="empty">
                      No {status.toLowerCase()} flags match.
                    </td>
                  </tr>
                )}
                {list.data.items.map((f) => (
                  <tr key={f.id}>
                    <td style={{ maxWidth: '38rem' }}>
                      <div className="row" style={{ gap: '0.5rem' }}>
                        <SeverityTag severity={f.severity} />
                        <strong>{f.label}</strong>
                      </div>
                      <div className="small" style={{ marginTop: '0.25rem' }}>
                        {f.message}
                      </div>
                      <div className="small muted">{RULE_LABEL[f.rule]}</div>
                    </td>
                    <td>{f.school ? <Link href={`/schools/view?id=${f.school.id}`}>{f.school.name}</Link> : '—'}</td>
                    <td>{fmtDate(f.raisedAt)}</td>
                    <td>
                      {f.status === 'OVERRIDDEN' && (
                        <div className="small">
                          {f.overriddenBy && f.overriddenBy.name}: {f.overrideReason}
                        </div>
                      )}
                      {f.status === 'OPEN' && can(officer, 'overrideFlags') && (
                        <ReasonAction label="Override" confirmLabel="Record override" onConfirm={(reason) => act.run(async () => { await officerApi.post(`/api/compliance/flags/${f.id}/override`, { reason }); list.reload(); }, 'Override recorded')} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager data={list.data} page={page} setPage={setPage} />
        </>
      )}
    </div>
  );
}

export default function Compliance() {
  return (
    <Suspense fallback={<Loading />}>
      <ComplianceInner />
    </Suspense>
  );
}
