'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { officerApi } from '@/lib/api';
import { LEVEL, fmtDate, fullName, today } from '@/lib/format';
import { useOfficer, can } from '@/components/OfficerContext';
import ScoreBreakdown from '@/components/ScoreBreakdown';
import { ErrorNotice, Field, Loading, ReasonAction, SeverityTag, SuccessNotice, useAction, useData } from '@/components/ui';

function SchoolDetailInner() {
  const id = useSearchParams().get('id') || '';
  const officer = useOfficer();
  const school = useData(() => officerApi.get(`/api/schools/${id}`), [id]);
  const act = useAction();

  if (school.error) return <ErrorNotice error={school.error} />;
  if (!school.data) return <Loading />;
  const s = school.data;
  const substantive = s.postings.filter((p) => p.type === 'SUBSTANTIVE');
  const acting = s.postings.filter((p) => p.type === 'ACTING');
  const openVacancies = s.vacancies.filter((v) => !v.filledAt);

  return (
    <div className="stack-lg">
      <div>
        <p className="small">
          <Link href="/schools">Schools</Link>
        </p>
        <div className="page-head" style={{ marginBottom: 0 }}>
          <div>
            <h1>{s.name}</h1>
            <p>
              {s.code} · {LEVEL[s.level]} · {s.subCounty.name}, {s.subCounty.county.name} County
            </p>
          </div>
        </div>
      </div>

      <ErrorNotice error={act.error} />
      <SuccessNotice message={act.success} />

      <div className="grid-2">
        <section className="panel" aria-labelledby="score-h">
          <h2 id="score-h" style={{ marginBottom: '1rem' }}>
            Readiness
          </h2>
          <ScoreBreakdown score={s.score} />
        </section>

        <section className="panel" aria-labelledby="flags-h">
          <h2 id="flags-h" style={{ marginBottom: '1rem' }}>
            Open flags
          </h2>
          {s.flags.length === 0 && <p className="muted">No open flags for this school.</p>}
          <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {s.flags.map((f) => (
              <li key={f.id} className="stack" style={{ gap: '0.25rem' }}>
                <div className="row">
                  <SeverityTag severity={f.severity} />
                  <strong>{f.label}</strong>
                </div>
                <p className="small">{f.message}</p>
                {can(officer, 'overrideFlags') && (
                  <ReasonAction
                    label="Override"
                    confirmLabel="Record override"
                    onConfirm={(reason) => act.run(async () => { await officerApi.post(`/api/compliance/flags/${f.id}/override`, { reason }); school.reload(); }, 'Override recorded')}
                  />
                )}
              </li>
            ))}
          </ul>
          <dl className="facts" style={{ marginTop: '1.5rem' }}>
            <dt>Establishment</dt>
            <dd className="num">
              {s.establishment} posts{' '}
              {can(officer, 'createSchool') && <EstablishmentEdit school={s} onSaved={school.reload} act={act} />}
            </dd>
            <dt>Filled</dt>
            <dd className="num">{substantive.length} substantive, {acting.length} acting</dd>
            <dt>Curriculum Support</dt>
            <dd>{s.csoAssignments.length ? s.csoAssignments.map((c) => c.officer.name).join(', ') : 'None assigned'}</dd>
          </dl>
        </section>
      </div>

      <section aria-labelledby="staff-h">
        <div className="panel-head">
          <h2 id="staff-h">Teachers posted here</h2>
          <Link className="small" href={`/staffing?schoolId=${s.id}`}>
            Staffing history
          </Link>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Teacher</th>
                <th>Designation</th>
                <th>Since</th>
                <th>Registration</th>
                <th>File</th>
                {can(officer, 'postTeachers') && <th>Action</th>}
              </tr>
            </thead>
            <tbody>
              {s.postings.length === 0 && (
                <tr>
                  <td colSpan={6} className="empty">
                    No teachers are posted here yet.
                  </td>
                </tr>
              )}
              {s.postings.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/teachers/view?id=${p.teacher.id}`}>{fullName(p.teacher)}</Link>
                    <div className="small muted num">TSC {p.teacher.tscNumber}</div>
                  </td>
                  <td>
                    {p.designation} {p.type === 'ACTING' && <span className="tag warning">Acting</span>}
                  </td>
                  <td>{fmtDate(p.startDate)}</td>
                  <td>
                    <span className={`tag ${p.teacher.registrationStatus === 'ACTIVE' ? 'ok' : 'breach'}`}>{p.teacher.registrationStatus.toLowerCase()}</span>
                  </td>
                  <td>{p.teacher.personnelFileComplete ? 'Complete' : <span className="tag warning">Incomplete</span>}</td>
                  {can(officer, 'postTeachers') && (
                    <td>
                      <ReasonAction
                        label="End posting"
                        confirmLabel="End posting today"
                        minLength={3}
                        variant="danger"
                        placeholder="Reason, e.g. retirement, transfer out, end of acting term"
                        onConfirm={(reason) => act.run(async () => { await officerApi.post(`/api/postings/${p.id}/end`, { endDate: today(), reason }); school.reload(); }, 'Posting ended')}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid-2">
        <section className="panel" aria-labelledby="vac-h">
          <h2 id="vac-h" style={{ marginBottom: '0.75rem' }}>
            Vacancies
          </h2>
          {openVacancies.length === 0 && <p className="muted">No open vacancies.</p>}
          <ul style={{ paddingLeft: '1.1rem', margin: 0 }}>
            {openVacancies.map((v) => (
              <li key={v.id}>
                {v.designation} <span className="small muted">open since {fmtDate(v.openedAt)}</span>
              </li>
            ))}
          </ul>
          {can(officer, 'declareVacancy') && <DeclareVacancy schoolId={s.id} onDone={school.reload} act={act} />}
        </section>

        {can(officer, 'postTeachers') && <PostTeacher school={s} vacancies={openVacancies} onDone={school.reload} />}
      </div>
    </div>
  );
}

function EstablishmentEdit({ school, onSaved, act }) {
  const [value, setValue] = useState(school.establishment);
  return (
    <details className="inline" style={{ display: 'inline-block', marginLeft: '0.5rem' }}>
      <summary className="small">Change</summary>
      <ReasonActionInline value={value} setValue={setValue} onConfirm={(reason) => act.run(async () => { await officerApi.patch(`/api/schools/${school.id}/establishment`, { establishment: Number(value), reason }); onSaved(); }, 'Establishment updated')} />
    </details>
  );
}

function ReasonActionInline({ value, setValue, onConfirm }) {
  const [reason, setReason] = useState('');
  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); onConfirm(reason); }} style={{ minWidth: 240 }}>
      <input type="number" min={0} aria-label="New establishment" value={value} onChange={(e) => setValue(e.target.value)} />
      <input aria-label="Reason" placeholder="Reason for the change" value={reason} onChange={(e) => setReason(e.target.value)} minLength={5} required />
      <button className="btn small">Save establishment</button>
    </form>
  );
}

function DeclareVacancy({ schoolId, onDone, act }) {
  const [designation, setDesignation] = useState('');
  return (
    <form
      className="row"
      style={{ marginTop: '1rem', alignItems: 'flex-end' }}
      onSubmit={(e) => {
        e.preventDefault();
        act.run(async () => { await officerApi.post('/api/vacancies', { schoolId, designation }); setDesignation(''); onDone(); }, 'Vacancy declared');
      }}
    >
      <div style={{ flex: 1, minWidth: 200 }}>
        <label htmlFor="vdes">Declare a vacancy</label>
        <input id="vdes" placeholder="e.g. Teacher (Mathematics)" value={designation} onChange={(e) => setDesignation(e.target.value)} required minLength={2} />
      </div>
      <button className="btn secondary">Declare</button>
    </form>
  );
}

function PostTeacher({ school, vacancies, onDone }) {
  const [tsc, setTsc] = useState('');
  const [found, setFound] = useState(null);
  const [form, setForm] = useState({ type: 'SUBSTANTIVE', designation: 'Teacher', startDate: today(), vacancyId: '' });
  const [override, setOverride] = useState('');
  const look = useAction();
  const post = useAction();
  const blocked = post.error && post.error.details && post.error.details.rule === 'REGISTRATION_GATE';

  const submit = (withOverride) =>
    post.run(async () => {
      const body = { teacherId: found.id, schoolId: school.id, ...form, vacancyId: form.vacancyId || undefined };
      if (withOverride) body.override = { reason: override };
      if (found.holdsSubstantivePosting && form.type === 'SUBSTANTIVE') {
        await officerApi.post('/api/postings/transfer', { teacherId: found.id, toSchoolId: school.id, startDate: form.startDate, designation: form.designation, reason: 'Transfer recorded from school page', override: body.override });
      } else {
        await officerApi.post('/api/postings', body);
      }
      setFound(null);
      setTsc('');
      setOverride('');
      onDone();
    }, 'Posting recorded');

  return (
    <section className="panel" aria-labelledby="post-h">
      <h2 id="post-h" style={{ marginBottom: '0.75rem' }}>
        Post a teacher here
      </h2>
      <SuccessNotice message={post.success} />
      <form
        className="row"
        style={{ alignItems: 'flex-end' }}
        onSubmit={(e) => {
          e.preventDefault();
          look.run(async () => setFound(await officerApi.get(`/api/teachers/lookup?tscNumber=${encodeURIComponent(tsc.trim())}`)));
        }}
      >
        <div style={{ flex: 1, minWidth: 180 }}>
          <label htmlFor="ptsc">TSC number</label>
          <input id="ptsc" value={tsc} onChange={(e) => { setTsc(e.target.value); setFound(null); }} required />
        </div>
        <button className="btn secondary" disabled={look.busy}>
          Find
        </button>
      </form>
      <ErrorNotice error={look.error} />
      {found && (
        <form className="stack" style={{ marginTop: '1rem' }} onSubmit={(e) => { e.preventDefault(); submit(false); }}>
          <p>
            <strong>{fullName(found)}</strong> · registration{' '}
            <span className={`tag ${found.registrationStatus === 'ACTIVE' ? 'ok' : 'breach'}`}>{found.registrationStatus.toLowerCase()}</span>
            {found.holdsSubstantivePosting && <span className="small muted"> · already posted elsewhere: this will be recorded as a transfer</span>}
          </p>
          <div className="grid-2" style={{ gap: '0 1rem' }}>
            <Field label="Type" id="ptype">
              <select id="ptype" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="SUBSTANTIVE">Substantive</option>
                <option value="ACTING">Acting appointment</option>
              </select>
            </Field>
            <Field label="Designation" id="pdes">
              <input id="pdes" value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} required />
            </Field>
            <Field label="Start date" id="pstart">
              <input id="pstart" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required />
            </Field>
            <Field label="Fills vacancy" hint="Optional" id="pvac">
              <select id="pvac" value={form.vacancyId} onChange={(e) => setForm({ ...form, vacancyId: e.target.value })}>
                <option value="">None</option>
                {vacancies.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.designation}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {!blocked && <ErrorNotice error={post.error} />}
          {blocked ? (
            <div className="notice warning stack">
              <p>
                <strong>Blocked by the registration gate.</strong> {post.error.message}
              </p>
              <p className="small">You can record an override. It is logged against your name with your reason.</p>
              <textarea aria-label="Override reason" value={override} onChange={(e) => setOverride(e.target.value)} placeholder="Why this posting should go ahead" />
              <div className="row">
                <button type="button" className="btn danger" disabled={override.trim().length < 10 || post.busy} onClick={() => submit(true)}>
                  Override and post
                </button>
              </div>
            </div>
          ) : (
            <div>
              <button className="btn" disabled={post.busy}>
                Record posting
              </button>
            </div>
          )}
        </form>
      )}
    </section>
  );
}

// The record ID travels in the query string (?id=), so the page can be exported as a static file.
export default function SchoolDetail() {
  return (
    <Suspense fallback={<Loading />}>
      <SchoolDetailInner />
    </Suspense>
  );
}
