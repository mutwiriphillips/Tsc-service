'use client';
import { useState } from 'react';
import Link from 'next/link';
import { officerApi, qs } from '@/lib/api';
import { fmtDate } from '@/lib/format';
import { useOfficer, can } from '@/components/OfficerContext';
import { ErrorNotice, Field, Loading, PageHead, ReasonAction, SuccessNotice, useAction, useData } from '@/components/ui';

const STATUS = { PLANNED: ['Awaiting sign-off', 'info'], APPROVED: ['Signed off', 'ok'], COMPLETED: ['Report filed', 'ok'], CANCELLED: ['Cancelled', ''] };

export default function Visits() {
  const officer = useOfficer();
  const [status, setStatus] = useState('');
  const list = useData(() => officerApi.get(`/api/visits${qs({ status })}`), [status]);
  const act = useAction();

  return (
    <div className="stack-lg">
      <PageHead title="Field visits" intro="Curriculum Support Officers plan visits, a supervisor signs them off, and the officer files a report afterwards." />
      <ErrorNotice error={act.error} />
      <SuccessNotice message={act.success} />
      {can(officer, 'planVisits') && <PlanVisit onDone={list.reload} />}

      <div>
        <div className="toolbar">
          <div className="field">
            <label htmlFor="vs">Status</label>
            <select id="vs" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All visits</option>
              {Object.entries(STATUS).map(([k, [v]]) => (
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
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>School</th>
                  <th>Purpose</th>
                  <th>Officer</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {list.data.length === 0 && (
                  <tr>
                    <td colSpan={6} className="empty">
                      No visits yet.
                    </td>
                  </tr>
                )}
                {list.data.map((v) => (
                  <tr key={v.id}>
                    <td>{fmtDate(v.plannedDate)}</td>
                    <td>
                      <Link href={`/schools/view?id=${v.school.id}`}>{v.school.name}</Link>
                    </td>
                    <td style={{ maxWidth: '22rem' }}>
                      {v.purpose}
                      {v.report && (
                        <details className="inline small">
                          <summary>Report</summary>
                          <p style={{ whiteSpace: 'pre-wrap' }}>{v.report}</p>
                        </details>
                      )}
                    </td>
                    <td>
                      {v.cso.name}
                      {v.approvedBy && <div className="small muted">Signed off by {v.approvedBy.name}</div>}
                    </td>
                    <td>
                      <span className={`tag ${STATUS[v.status][1]}`}>{STATUS[v.status][0]}</span>
                    </td>
                    <td>
                      <div className="stack" style={{ gap: '0.5rem' }}>
                        {v.status === 'PLANNED' && can(officer, 'approveVisits') && (
                          <button className="btn small" onClick={() => act.run(async () => { await officerApi.post(`/api/visits/${v.id}/approve`); list.reload(); }, 'Visit signed off')}>
                            Sign off
                          </button>
                        )}
                        {v.status === 'APPROVED' && v.cso.id === officer.id && <FileReport visit={v} act={act} onDone={list.reload} />}
                        {(v.status === 'PLANNED' || v.status === 'APPROVED') && (v.cso.id === officer.id || can(officer, 'approveVisits')) && (
                          <ReasonAction label="Cancel" confirmLabel="Cancel visit" minLength={3} variant="danger" onConfirm={(reason) => act.run(async () => { await officerApi.post(`/api/visits/${v.id}/cancel`, { reason }); list.reload(); }, 'Visit cancelled')} />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function PlanVisit({ onDone }) {
  const schools = useData(() => officerApi.get('/api/schools?pageSize=200&withScore=false'));
  const [f, setF] = useState({ schoolId: '', plannedDate: '', purpose: '' });
  const { busy, error, success, run } = useAction();
  return (
    <form
      className="panel"
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => { await officerApi.post('/api/visits', f); setF({ schoolId: '', plannedDate: '', purpose: '' }); onDone(); }, 'Visit planned and sent for sign-off');
      }}
    >
      <h2 style={{ marginBottom: '1rem' }}>Plan a visit</h2>
      <ErrorNotice error={error} />
      <SuccessNotice message={success} />
      <div className="grid-2" style={{ gap: '0 1rem' }}>
        <Field label="School" id="vsch">
          <select id="vsch" value={f.schoolId} onChange={(e) => setF({ ...f, schoolId: e.target.value })} required>
            <option value="">Choose one of your schools</option>
            {(schools.data ? schools.data.items : []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date" id="vdate">
          <input id="vdate" type="date" value={f.plannedDate} onChange={(e) => setF({ ...f, plannedDate: e.target.value })} required />
        </Field>
      </div>
      <Field label="Purpose" id="vpur">
        <input id="vpur" value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} required minLength={5} placeholder="e.g. Lesson observation, Grade 7 Mathematics" />
      </Field>
      <button className="btn" disabled={busy}>
        Send for sign-off
      </button>
    </form>
  );
}

function FileReport({ visit, act, onDone }) {
  const [report, setReport] = useState('');
  return (
    <details className="inline">
      <summary className="small">File report</summary>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          act.run(async () => { await officerApi.post(`/api/visits/${visit.id}/complete`, { report }); onDone(); }, 'Report filed');
        }}
      >
        <textarea aria-label="Visit report" value={report} onChange={(e) => setReport(e.target.value)} minLength={20} required placeholder="What you observed and what was agreed" />
        <button className="btn small">File report</button>
      </form>
    </details>
  );
}
