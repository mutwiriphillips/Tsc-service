'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { officerApi, qs } from '@/lib/api';
import { DOC_STATUS, DOC_TYPE, TIER_LABEL, docStatusTag, fmtDate, fullName } from '@/lib/format';
import { useOfficer, can } from '@/components/OfficerContext';
import { ErrorNotice, Field, Loading, PageHead, Pager, SuccessNotice, useAction, useData } from '@/components/ui';

function DocumentsInner() {
  const officer = useOfficer();
  const params = useSearchParams();
  const [view, setView] = useState(params.get('awaiting') === 'me' || can(officer, 'decideDocuments') ? 'mine' : 'all');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const list = useData(() => officerApi.get(`/api/documents${qs({ awaiting: view === 'mine' ? 'me' : '', status, page, pageSize: 25 })}`), [view, status, page]);

  return (
    <div>
      <PageHead title="Documents" intro="Appointment letters, transfer requests, promotion files and appraisal returns move through sub-county review, then county sign-off. Promotion files also need national approval.">
        {can(officer, 'submitDocuments') && (
          <button className="btn" onClick={() => setAdding(!adding)}>
            {adding ? 'Close' : 'Submit a document'}
          </button>
        )}
      </PageHead>
      {adding && <SubmitDocument onDone={() => { setAdding(false); list.reload(); }} />}

      <div className="toolbar">
        {can(officer, 'decideDocuments') && (
          <div className="field">
            <label htmlFor="dv">Show</label>
            <select id="dv" value={view} onChange={(e) => { setPage(1); setView(e.target.value); }}>
              <option value="mine">Waiting for my decision</option>
              <option value="all">All documents in my area</option>
            </select>
          </div>
        )}
        {view === 'all' && (
          <div className="field">
            <label htmlFor="ds">Status</label>
            <select id="ds" value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
              <option value="">Any status</option>
              {Object.entries(DOC_STATUS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <ErrorNotice error={list.error} />
      {list.loading && !list.data && <Loading />}
      {list.data && (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Document</th>
                  <th>School</th>
                  <th>Teacher</th>
                  <th>Status</th>
                  <th>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.length === 0 && (
                  <tr>
                    <td colSpan={5} className="empty">
                      {view === 'mine' ? 'Nothing is waiting for your decision.' : 'No documents yet.'}
                    </td>
                  </tr>
                )}
                {list.data.items.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <Link href={`/documents/view?id=${d.id}`}>{d.title}</Link>
                      <div className="small muted">
                        {DOC_TYPE[d.type]}
                        {d.submittedByTeacher && ' · from the teacher'}
                      </div>
                    </td>
                    <td>{d.school.name}</td>
                    <td>{fullName(d.teacher)}</td>
                    <td>
                      <span className={`tag ${docStatusTag(d.status)}`}>{DOC_STATUS[d.status]}</span>
                      {d.nextTier && <div className="small muted">Next: {TIER_LABEL[d.nextTier]}</div>}
                    </td>
                    <td>{fmtDate(d.submittedAt)}</td>
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

function SubmitDocument({ onDone }) {
  const schools = useData(() => officerApi.get('/api/schools?pageSize=200&withScore=false'));
  const [f, setF] = useState({ type: 'APPOINTMENT_LETTER', title: '', schoolId: '', teacherId: '' });
  const teachers = useData(() => (f.schoolId ? officerApi.get(`/api/teachers?schoolId=${f.schoolId}&pageSize=200`) : Promise.resolve(null)), [f.schoolId]);
  const [file, setFile] = useState(null);
  const { busy, error, success, run } = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  return (
    <form
      className="panel"
      style={{ marginBottom: '1.5rem' }}
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          const doc = await officerApi.post('/api/documents', { ...f, teacherId: f.teacherId || undefined });
          if (file) await officerApi.upload(`/api/documents/${doc.id}/file?fileName=${encodeURIComponent(file.name)}`, file, file.type, 'PUT');
          onDone();
        }, 'Document submitted');
      }}
    >
      <h2 style={{ marginBottom: '1rem' }}>Submit a document</h2>
      <ErrorNotice error={error} />
      <SuccessNotice message={success} />
      <div className="grid-2" style={{ gap: '0 1rem' }}>
        <Field label="Type" id="dt">
          <select id="dt" value={f.type} onChange={set('type')}>
            {Object.entries(DOC_TYPE).filter(([k]) => k !== 'TRANSFER_REQUEST').map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Title" id="dtt">
          <input id="dtt" value={f.title} onChange={set('title')} required minLength={3} />
        </Field>
        <Field label="School" id="dsc">
          <select id="dsc" value={f.schoolId} onChange={(e) => setF({ ...f, schoolId: e.target.value, teacherId: '' })} required>
            <option value="">Choose a school</option>
            {(schools.data ? schools.data.items : []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Teacher" hint="Optional" id="dte">
          <select id="dte" value={f.teacherId} onChange={set('teacherId')} disabled={!f.schoolId}>
            <option value="">Not about one teacher</option>
            {(teachers.data ? teachers.data.items : []).map((t) => (
              <option key={t.id} value={t.id}>
                {fullName(t)} (TSC {t.tscNumber})
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Scanned file" hint="PDF, JPEG or PNG, up to 10 MB" id="dfile">
        <input id="dfile" type="file" accept="application/pdf,image/jpeg,image/png" onChange={(e) => setFile(e.target.files[0] || null)} />
      </Field>
      <button className="btn" disabled={busy}>
        Submit for review
      </button>
    </form>
  );
}

export default function Documents() {
  return (
    <Suspense fallback={<Loading />}>
      <DocumentsInner />
    </Suspense>
  );
}
