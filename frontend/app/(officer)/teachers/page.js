'use client';
import { useState } from 'react';
import Link from 'next/link';
import { officerApi, qs } from '@/lib/api';
import { fullName } from '@/lib/format';
import { useOfficer, can } from '@/components/OfficerContext';
import { ErrorNotice, Field, Loading, PageHead, Pager, SuccessNotice, useAction, useData } from '@/components/ui';

export default function Teachers() {
  const officer = useOfficer();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const list = useData(() => officerApi.get(`/api/teachers${qs({ q, registrationStatus: status, page, pageSize: 25 })}`), [q, status, page]);

  return (
    <div>
      <PageHead title="Teachers" intro="Teachers currently posted in your jurisdiction.">
        {can(officer, 'createTeacher') && (
          <button className="btn" onClick={() => setAdding(!adding)}>
            {adding ? 'Close' : 'Register a teacher'}
          </button>
        )}
      </PageHead>
      {adding && <AddTeacher onDone={() => { setAdding(false); list.reload(); }} />}
      <div className="toolbar">
        <div className="field">
          <label htmlFor="tq">Search</label>
          <input id="tq" placeholder="TSC number or name" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} />
        </div>
        <div className="field">
          <label htmlFor="ts">Registration</label>
          <select id="ts" value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
            <option value="">Any status</option>
            <option value="ACTIVE">Active</option>
            <option value="PENDING">Pending</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="DEREGISTERED">Deregistered</option>
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
                  <th>Teacher</th>
                  <th>Posted at</th>
                  <th>Registration</th>
                  <th>Personnel file</th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.length === 0 && (
                  <tr>
                    <td colSpan={4} className="empty">
                      No teachers match.
                    </td>
                  </tr>
                )}
                {list.data.items.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <Link href={`/teachers/view?id=${t.id}`}>{fullName(t)}</Link>
                      <div className="small muted num">TSC {t.tscNumber}</div>
                    </td>
                    <td>
                      {t.postings.map((p) => (
                        <div key={p.id}>
                          {p.school.name}
                          {p.type === 'ACTING' && <span className="small muted"> · {p.designation}</span>}
                        </div>
                      ))}
                    </td>
                    <td>
                      <span className={`tag ${t.registrationStatus === 'ACTIVE' ? 'ok' : 'breach'}`}>{t.registrationStatus.toLowerCase()}</span>
                    </td>
                    <td>{t.personnelFileComplete ? 'Complete' : <span className="tag warning">Incomplete</span>}</td>
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

function AddTeacher({ onDone }) {
  const [f, setF] = useState({ tscNumber: '', nationalId: '', firstName: '', lastName: '', gender: '', registrationStatus: 'PENDING', personnelFileComplete: false });
  const { busy, error, success, run } = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  return (
    <form
      className="panel"
      style={{ marginBottom: '1.5rem' }}
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => { await officerApi.post('/api/teachers', { ...f, gender: f.gender || undefined }); onDone(); }, 'Teacher registered');
      }}
    >
      <h2 style={{ marginBottom: '0.5rem' }}>Register a teacher</h2>
      <p className="small muted" style={{ marginBottom: '1rem' }}>
        The national ID is used once to create a protected match key and is not stored in readable form.
      </p>
      <ErrorNotice error={error} />
      <SuccessNotice message={success} />
      <div className="grid-2" style={{ gap: '0 1rem' }}>
        <Field label="TSC number" id="nt">
          <input id="nt" value={f.tscNumber} onChange={set('tscNumber')} required />
        </Field>
        <Field label="National ID number" id="nid">
          <input id="nid" value={f.nationalId} onChange={set('nationalId')} required autoComplete="off" />
        </Field>
        <Field label="First name" id="nf">
          <input id="nf" value={f.firstName} onChange={set('firstName')} required />
        </Field>
        <Field label="Last name" id="nl">
          <input id="nl" value={f.lastName} onChange={set('lastName')} required />
        </Field>
        <Field label="Sex as recorded" hint="Used only in aggregate reports" id="ng">
          <select id="ng" value={f.gender} onChange={set('gender')}>
            <option value="">Not recorded</option>
            <option value="F">Female</option>
            <option value="M">Male</option>
          </select>
        </Field>
        <Field label="Registration status" id="nr">
          <select id="nr" value={f.registrationStatus} onChange={set('registrationStatus')}>
            <option value="PENDING">Pending</option>
            <option value="ACTIVE">Active</option>
          </select>
        </Field>
      </div>
      <label className="checkbox field">
        <input type="checkbox" checked={f.personnelFileComplete} onChange={set('personnelFileComplete')} /> Personnel file is complete
      </label>
      <button className="btn" disabled={busy}>
        Register teacher
      </button>
    </form>
  );
}
