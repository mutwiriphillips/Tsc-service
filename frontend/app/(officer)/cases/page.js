'use client';
import { useState } from 'react';
import Link from 'next/link';
import { officerApi } from '@/lib/api';
import { fmtDate, fullName } from '@/lib/format';
import { useOfficer, can } from '@/components/OfficerContext';
import { ErrorNotice, Field, Loading, PageHead, ReasonAction, SuccessNotice, useAction, useData } from '@/components/ui';

export default function Cases() {
  const officer = useOfficer();
  const [status, setStatus] = useState('OPEN');
  const list = useData(() => officerApi.get(`/api/cases?status=${status}`), [status]);
  const rules = useData(() => officerApi.get('/api/compliance/rules'));
  const act = useAction();
  const windowDays = rules.data ? (rules.data.find((r) => r.key === 'case.windowDays') || {}).value : null;

  if (!can(officer, 'seeSensitive')) return <ErrorNotice error={{ message: 'Disciplinary cases are visible to County Directors and the National Admin only.' }} />;

  return (
    <div className="stack-lg">
      <PageHead title="Disciplinary cases" intro={`Sensitive. Every time this list opens it is logged. Cases open longer than ${windowDays ?? '…'} days are escalated automatically.`} />
      <ErrorNotice error={act.error} />
      <SuccessNotice message={act.success} />
      <OpenCase act={act} onDone={list.reload} />
      <div>
        <div className="toolbar">
          <div className="field">
            <label htmlFor="cs">Status</label>
            <select id="cs" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="OPEN">Open</option>
              <option value="CLOSED">Closed</option>
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
                  <th>Teacher</th>
                  <th>Case</th>
                  <th>Opened</th>
                  <th className="num">Days open</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {list.data.length === 0 && (
                  <tr>
                    <td colSpan={5} className="empty">
                      No {status.toLowerCase()} cases.
                    </td>
                  </tr>
                )}
                {list.data.map((c) => {
                  const days = Math.floor(((c.closedAt ? new Date(c.closedAt) : new Date()) - new Date(c.openedAt)) / 86400000);
                  return (
                    <tr key={c.id}>
                      <td>
                        <Link href={`/teachers/view?id=${c.teacher.id}`}>{fullName(c.teacher)}</Link>
                        <div className="small muted num">TSC {c.teacher.tscNumber}</div>
                      </td>
                      <td>{c.caseType}</td>
                      <td>{fmtDate(c.openedAt)}</td>
                      <td className="num">{windowDays && days > windowDays && c.status === 'OPEN' ? <span className="tag breach">{days}</span> : days}</td>
                      <td>
                        {c.status === 'OPEN' && (
                          <ReasonAction label="Close case" confirmLabel="Close with this outcome" minLength={3} placeholder="Outcome" onConfirm={(outcome) => act.run(async () => { await officerApi.post(`/api/cases/${c.id}/close`, { outcome }); list.reload(); }, 'Case closed')} />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function OpenCase({ act, onDone }) {
  const [tsc, setTsc] = useState('');
  const [teacher, setTeacher] = useState(null);
  const [caseType, setCaseType] = useState('');
  const look = useAction();
  return (
    <details className="panel inline">
      <summary>Open a case</summary>
      <form
        className="row"
        style={{ alignItems: 'flex-end' }}
        onSubmit={(e) => {
          e.preventDefault();
          look.run(async () => {
            const r = await officerApi.get(`/api/teachers?q=${encodeURIComponent(tsc.trim())}&pageSize=5`);
            const match = r.items.find((t) => t.tscNumber === tsc.trim());
            if (!match) throw new Error('No teacher with that TSC number is posted in your area');
            setTeacher(match);
          });
        }}
      >
        <div style={{ minWidth: 200 }}>
          <label htmlFor="ctsc">TSC number</label>
          <input id="ctsc" value={tsc} onChange={(e) => { setTsc(e.target.value); setTeacher(null); }} required />
        </div>
        <button className="btn secondary">Find</button>
      </form>
      <ErrorNotice error={look.error} />
      {teacher && (
        <form
          className="stack"
          style={{ marginTop: '1rem' }}
          onSubmit={(e) => {
            e.preventDefault();
            act.run(async () => { await officerApi.post('/api/cases', { teacherId: teacher.id, schoolId: teacher.postings[0].school.id, caseType }); setTeacher(null); setTsc(''); setCaseType(''); onDone(); }, 'Case opened');
          }}
        >
          <p>
            <strong>{fullName(teacher)}</strong> at {teacher.postings[0] && teacher.postings[0].school.name}
          </p>
          <Field label="Case type" id="ctype">
            <input id="ctype" value={caseType} onChange={(e) => setCaseType(e.target.value)} required minLength={3} placeholder="e.g. Absenteeism" />
          </Field>
          <button className="btn">Open case</button>
        </form>
      )}
    </details>
  );
}
