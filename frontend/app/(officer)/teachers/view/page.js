'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { officerApi } from '@/lib/api';
import { DOC_TYPE, DOC_STATUS, docStatusTag, fmtDate, fmtDateTime, fullName } from '@/lib/format';
import { useOfficer, can } from '@/components/OfficerContext';
import { ErrorNotice, Field, Loading, ReasonAction, SuccessNotice, useAction, useData } from '@/components/ui';

const SENSITIVE_KIND = { HEALTH: 'Health', DISABILITY: 'Disability', DISCIPLINARY_NOTE: 'Disciplinary note' };

function TeacherDetailInner() {
  const id = useSearchParams().get('id') || '';
  const officer = useOfficer();
  const t = useData(() => officerApi.get(`/api/teachers/${id}`), [id]);
  const act = useAction();

  if (t.error) return <ErrorNotice error={t.error} />;
  if (!t.data) return <Loading />;
  const d = t.data;
  const current = d.postings.filter((p) => p.status === 'ACTIVE');

  return (
    <div className="stack-lg">
      <div>
        <p className="small">
          <Link href="/teachers">Teachers</Link>
        </p>
        <h1>{fullName(d)}</h1>
        <p className="muted num">TSC {d.tscNumber}</p>
      </div>
      <ErrorNotice error={act.error} />
      <SuccessNotice message={act.success} />

      <div className="grid-2">
        <section className="panel">
          <h2 style={{ marginBottom: '1rem' }}>Record</h2>
          <dl className="facts">
            <dt>Registration</dt>
            <dd>
              <span className={`tag ${d.registrationStatus === 'ACTIVE' ? 'ok' : 'breach'}`}>{d.registrationStatus.toLowerCase()}</span>
              {d.registeredAt && <span className="small muted"> since {fmtDate(d.registeredAt)}</span>}
            </dd>
            <dt>Personnel file</dt>
            <dd>{d.personnelFileComplete ? 'Complete' : 'Incomplete'}</dd>
            <dt>Posted at</dt>
            <dd>
              {current.length === 0 && 'Not currently posted'}
              {current.map((p) => (
                <div key={p.id}>
                  <Link href={`/schools/view?id=${p.school.id}`}>{p.school.name}</Link>
                  <span className="small muted"> · {p.designation}</span>
                </div>
              ))}
            </dd>
            <dt>Teacher portal</dt>
            <dd>{d.portalActivatedAt ? `Active since ${fmtDate(d.portalActivatedAt)}` : 'Not activated'}</dd>
          </dl>
          <div className="row" style={{ marginTop: '1.25rem' }}>
            {can(officer, 'updateFile') && (
              <button
                className="btn secondary small"
                onClick={() => act.run(async () => { await officerApi.patch(`/api/teachers/${d.id}/personnel-file`, { complete: !d.personnelFileComplete }); t.reload(); }, 'Personnel file updated')}
              >
                Mark file {d.personnelFileComplete ? 'incomplete' : 'complete'}
              </button>
            )}
            {can(officer, 'changeRegistration') && <RegistrationChange teacher={d} act={act} onDone={t.reload} />}
          </div>
        </section>

        <section className="panel">
          <h2 style={{ marginBottom: '1rem' }}>Appraisal returns</h2>
          {d.appraisals.length === 0 && <p className="muted">No appraisal returns recorded.</p>}
          {d.appraisals.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>Term</th>
                  <th>Status</th>
                  <th>Filed</th>
                </tr>
              </thead>
              <tbody>
                {d.appraisals.map((a) => (
                  <tr key={a.id}>
                    <td className="num">
                      {a.year} Term {a.term}
                    </td>
                    <td>{a.complete ? <span className="tag ok">Complete</span> : <span className="tag warning">Incomplete</span>}</td>
                    <td>
                      {fmtDate(a.submittedAt)} <span className="small muted">{a.source === 'import' ? '(imported)' : ''}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {can(officer, 'recordAppraisal') && current[0] && <RecordAppraisal teacherId={d.id} schoolId={current[0].school.id} act={act} onDone={t.reload} />}
        </section>
      </div>

      <section>
        <h2 style={{ marginBottom: '0.75rem' }}>Posting history</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>School</th>
                <th>Designation</th>
                <th>From</th>
                <th>To</th>
                <th>Ended because</th>
              </tr>
            </thead>
            <tbody>
              {d.postings.map((p) => (
                <tr key={p.id}>
                  <td>{p.school.name}</td>
                  <td>
                    {p.designation} {p.type === 'ACTING' && <span className="tag warning">Acting</span>}
                  </td>
                  <td>{fmtDate(p.startDate)}</td>
                  <td>{p.status === 'ACTIVE' ? <span className="tag ok">Current</span> : fmtDate(p.endDate)}</td>
                  <td className="small">{p.endReason || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {d.documents.length > 0 && (
        <section>
          <h2 style={{ marginBottom: '0.75rem' }}>Documents</h2>
          <div className="table-wrap">
            <table>
              <tbody>
                {d.documents.map((doc) => (
                  <tr key={doc.id}>
                    <td>
                      <Link href={`/documents/view?id=${doc.id}`}>{doc.title}</Link>
                      <div className="small muted">{DOC_TYPE[doc.type]}</div>
                    </td>
                    <td>
                      <span className={`tag ${docStatusTag(doc.status)}`}>{DOC_STATUS[doc.status]}</span>
                    </td>
                    <td>{fmtDate(doc.submittedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {d.correctionRequests.length > 0 && (
        <section className="panel">
          <h2 style={{ marginBottom: '0.75rem' }}>Correction requests from this teacher</h2>
          <ul style={{ paddingLeft: '1.1rem', margin: 0 }}>
            {d.correctionRequests.map((c) => (
              <li key={c.id}>
                <strong>{c.field}</strong>: {c.requested} <span className="tag">{c.status.toLowerCase()}</span>
                {c.response && <div className="small muted">Response: {c.response}</div>}
              </li>
            ))}
          </ul>
          <p className="small" style={{ marginTop: '0.75rem' }}>
            <Link href="/corrections">Respond in Correction requests</Link>
          </p>
        </section>
      )}

      {can(officer, 'seeSensitive') && <Sensitive teacher={d} />}
    </div>
  );
}

function RegistrationChange({ teacher, act, onDone }) {
  const [status, setStatus] = useState(teacher.registrationStatus);
  return (
    <details className="inline">
      <summary className="small">Change registration</summary>
      <div className="stack" style={{ minWidth: 260 }}>
        <select aria-label="New registration status" value={status} onChange={(e) => setStatus(e.target.value)}>
          {['ACTIVE', 'PENDING', 'SUSPENDED', 'DEREGISTERED'].map((s) => (
            <option key={s} value={s}>
              {s.toLowerCase()}
            </option>
          ))}
        </select>
        <ReasonAction
          label="Save registration status"
          minLength={5}
          onConfirm={(reason) => act.run(async () => { await officerApi.patch(`/api/teachers/${teacher.id}/registration`, { status, reason }); onDone(); }, 'Registration updated')}
        />
      </div>
    </details>
  );
}

function RecordAppraisal({ teacherId, schoolId, act, onDone }) {
  const now = new Date();
  const [f, setF] = useState({ year: now.getFullYear(), term: now.getMonth() < 4 ? 1 : now.getMonth() < 8 ? 2 : 3, complete: true });
  return (
    <form
      className="row"
      style={{ marginTop: '1rem', alignItems: 'flex-end' }}
      onSubmit={(e) => {
        e.preventDefault();
        act.run(async () => { await officerApi.post('/api/appraisals', { teacherId, schoolId, year: Number(f.year), term: Number(f.term), complete: f.complete }); onDone(); }, 'Appraisal return recorded');
      }}
    >
      <div style={{ width: '6rem' }}>
        <label htmlFor="ay">Year</label>
        <input id="ay" type="number" value={f.year} onChange={(e) => setF({ ...f, year: e.target.value })} />
      </div>
      <div style={{ width: '6rem' }}>
        <label htmlFor="at">Term</label>
        <select id="at" value={f.term} onChange={(e) => setF({ ...f, term: e.target.value })}>
          <option value={1}>1</option>
          <option value={2}>2</option>
          <option value={3}>3</option>
        </select>
      </div>
      <label className="checkbox" style={{ marginBottom: '0.6rem' }}>
        <input type="checkbox" checked={f.complete} onChange={(e) => setF({ ...f, complete: e.target.checked })} /> Complete
      </label>
      <button className="btn secondary">Record return</button>
    </form>
  );
}

function Sensitive({ teacher }) {
  const [records, setRecords] = useState(null);
  const [kind, setKind] = useState('HEALTH');
  const [content, setContent] = useState('');
  const act = useAction();
  return (
    <section className="panel" aria-labelledby="sens-h" style={{ borderColor: '#c9a6a3' }}>
      <div className="panel-head">
        <h2 id="sens-h">Sensitive records</h2>
        <span className="small muted">County Director and National Admin only. Every view is logged.</span>
      </div>
      <ErrorNotice error={act.error} />
      <SuccessNotice message={act.success} />
      <p>
        {teacher.sensitiveRecords.length === 0
          ? 'No sensitive records held.'
          : `${teacher.sensitiveRecords.length} record(s) held: ${[...new Set(teacher.sensitiveRecords.map((r) => SENSITIVE_KIND[r.kind]))].join(', ')}.`}
      </p>
      {teacher.cases && teacher.cases.length > 0 && (
        <p className="small" style={{ marginTop: '0.5rem' }}>
          Disciplinary cases: {teacher.cases.map((c) => `${c.caseType} (${c.status.toLowerCase()}, opened ${fmtDate(c.openedAt)})`).join('; ')}
        </p>
      )}
      {teacher.sensitiveRecords.length > 0 && !records && (
        <button className="btn secondary small" style={{ marginTop: '0.75rem' }} onClick={() => act.run(async () => setRecords(await officerApi.get(`/api/teachers/${teacher.id}/sensitive`)))}>
          Show content (logged)
        </button>
      )}
      {records && (
        <ul className="stack" style={{ listStyle: 'none', padding: 0, marginTop: '1rem' }}>
          {records.map((r) => (
            <li key={r.id}>
              <strong>{SENSITIVE_KIND[r.kind]}</strong> <span className="small muted">{fmtDateTime(r.createdAt)}</span>
              <p style={{ whiteSpace: 'pre-wrap' }}>{r.content}</p>
            </li>
          ))}
        </ul>
      )}
      <details className="inline" style={{ marginTop: '1rem' }}>
        <summary>Add a sensitive record</summary>
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            act.run(async () => { await officerApi.post(`/api/teachers/${teacher.id}/sensitive`, { kind, content }); setContent(''); setRecords(null); }, 'Record added and encrypted');
          }}
        >
          <Field label="Kind" id="sk">
            <select id="sk" value={kind} onChange={(e) => setKind(e.target.value)}>
              {Object.entries(SENSITIVE_KIND).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Content" hint="Stored encrypted. Record only what is necessary." id="sc">
            <textarea id="sc" value={content} onChange={(e) => setContent(e.target.value)} required />
          </Field>
          <button className="btn">Save record</button>
        </form>
      </details>
    </section>
  );
}

// The record ID travels in the query string (?id=), so the page can be exported as a static file.
export default function TeacherDetail() {
  return (
    <Suspense fallback={<Loading />}>
      <TeacherDetailInner />
    </Suspense>
  );
}
