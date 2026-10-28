'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, setToken, teacherApi } from '@/lib/api';
import { DOC_STATUS, DOC_TYPE, TIER_LABEL, docStatusTag, fmtDate, fullName } from '@/lib/format';
import { ErrorNotice, Field, Loading, SuccessNotice, useAction, useData } from '@/components/ui';

export default function Portal() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!getToken('teacher')) router.replace('/portal/login');
    else setReady(true);
  }, [router]);
  if (!ready) return null;
  return <PortalHome onSignOut={() => { setToken('teacher', null); router.replace('/portal/login'); }} />;
}

function PortalHome({ onSignOut }) {
  const me = useData(() => teacherApi.get('/api/portal/me'));
  const postings = useData(() => teacherApi.get('/api/portal/postings'));
  const appraisals = useData(() => teacherApi.get('/api/portal/appraisals'));
  const docs = useData(() => teacherApi.get('/api/portal/documents'));
  const corrections = useData(() => teacherApi.get('/api/portal/corrections'));
  const exp = useAction();

  if (me.error) return <div className="main"><ErrorNotice error={me.error} /></div>;
  if (!me.data) return <div className="main"><Loading /></div>;
  const t = me.data;

  const download = () =>
    exp.run(async () => {
      const data = await teacherApi.get('/api/portal/my-data');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `my-tsc-record-${t.tscNumber}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }, 'Your record has been downloaded');

  return (
    <div>
      <header style={{ background: 'var(--slate)', color: 'var(--slate-text)' }}>
        <div className="main spread" style={{ paddingTop: '1rem', paddingBottom: '1rem' }}>
          <div>
            <strong style={{ color: '#fff' }}>TSC teacher portal</strong>
          </div>
          <button className="btn quiet small" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </header>
      <main className="main stack-lg" id="main">
        <div>
          <h1>{fullName(t)}</h1>
          <p className="muted num">TSC {t.tscNumber}</p>
        </div>

        <div className="grid-2">
          <section className="panel">
            <h2 style={{ marginBottom: '1rem' }}>Where you are posted</h2>
            {t.postings.length === 0 && <p className="muted">You have no active posting on record. If this is wrong, request a correction below.</p>}
            {t.postings.map((p) => (
              <div key={p.id} className="stack" style={{ gap: '0.25rem', marginBottom: '1rem' }}>
                <strong style={{ display: 'block' }}>{p.school}</strong>
                <span className="small" style={{ display: 'block' }}>
                  {p.designation} · {p.subCounty}, {p.county} County · since {fmtDate(p.startDate)}
                </span>
                {p.actingEndsOn && <span className="small muted" style={{ display: 'block' }}>Acting appointment due to end {fmtDate(p.actingEndsOn)}</span>}
              </div>
            ))}
            <dl className="facts" style={{ marginTop: '0.5rem' }}>
              <dt>Registration</dt>
              <dd>
                <span className={`tag ${t.registrationStatus === 'ACTIVE' ? 'ok' : 'warning'}`}>{t.registrationStatus.toLowerCase()}</span>
              </dd>
              <dt>Personnel file</dt>
              <dd>{t.personnelFileComplete ? 'Complete' : 'Incomplete: your Sub-County office will contact you'}</dd>
            </dl>
          </section>

          <section className="panel">
            <h2 style={{ marginBottom: '1rem' }}>Appraisal returns</h2>
            {appraisals.data && appraisals.data.length === 0 && <p className="muted">None recorded yet.</p>}
            <ul style={{ paddingLeft: '1.1rem', margin: 0 }}>
              {(appraisals.data || []).slice(0, 6).map((a) => (
                <li key={a.id}>
                  {a.year} Term {a.term}: {a.complete ? 'complete' : 'incomplete'} <span className="small muted">({fmtDate(a.submittedAt)})</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <section>
          <h2 style={{ marginBottom: '0.75rem' }}>Your requests and documents</h2>
          {docs.data && docs.data.length === 0 && <p className="muted">Nothing yet.</p>}
          {docs.data && docs.data.length > 0 && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Status</th>
                    <th>Progress</th>
                    <th>Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {docs.data.map((d) => (
                    <tr key={d.id}>
                      <td>
                        {d.title}
                        <div className="small muted">{DOC_TYPE[d.type]}</div>
                      </td>
                      <td>
                        <span className={`tag ${docStatusTag(d.status)}`}>{DOC_STATUS[d.status]}</span>
                      </td>
                      <td className="small">
                        {d.approvals.map((a) => (
                          <div key={a.tier}>
                            {TIER_LABEL[a.tier]}: {a.decision.toLowerCase()} {fmtDate(a.at)}
                            {a.reason && <span className="muted"> ({a.reason})</span>}
                          </div>
                        ))}
                        {d.approvals.length === 0 && <span className="muted">Not reviewed yet</span>}
                      </td>
                      <td>{fmtDate(d.submittedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="grid-2">
          <TransferRequest onDone={docs.reload} />
          <Correction onDone={corrections.reload} list={corrections.data} />
        </div>

        <section className="panel stack">
          <h2>Your data</h2>
          <p className="small" style={{ maxWidth: '70ch' }}>
            Under the Data Protection Act, 2019 you can see the personal data TSC holds about you and ask for it to be corrected. Download a copy of everything this system holds about you.
          </p>
          <ErrorNotice error={exp.error} />
          <SuccessNotice message={exp.success} />
          <div>
            <button className="btn secondary" onClick={download} disabled={exp.busy}>
              Download my record
            </button>
          </div>
        </section>

        <PortalPassword />
        <p className="small muted">{postings.data ? `${postings.data.length} posting(s) in your history.` : ''}</p>
      </main>
    </div>
  );
}

function TransferRequest({ onDone }) {
  const [reason, setReason] = useState('');
  const { busy, error, run } = useAction();
  const [result, setResult] = useState(null);
  return (
    <form
      className="panel stack"
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          const r = await teacherApi.post('/api/portal/transfer-requests', { reason });
          setResult(r);
          setReason('');
          onDone();
        });
      }}
    >
      <h2>Ask for a transfer</h2>
      <p className="small">Your request goes to your Sub-County Director, then your County Director. You can follow it above.</p>
      <ErrorNotice error={error} />
      {result && (
        <div className={`notice ${result.eligibility.eligible ? 'success' : 'warning'}`}>
          Request sent.{result.eligibility.warning ? ` ${result.eligibility.warning}` : ''}
        </div>
      )}
      <Field label="Why are you asking?" hint="For example family, health or a preferred county" id="tr">
        <textarea id="tr" value={reason} onChange={(e) => setReason(e.target.value)} minLength={10} required />
      </Field>
      <div>
        <button className="btn" disabled={busy}>
          Send transfer request
        </button>
      </div>
    </form>
  );
}

function Correction({ onDone, list }) {
  const [f, setF] = useState({ field: '', requested: '' });
  const { busy, error, success, run } = useAction();
  return (
    <section className="panel stack">
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => { await teacherApi.post('/api/portal/corrections', f); setF({ field: '', requested: '' }); onDone(); }, 'Correction request sent');
        }}
      >
        <h2>Something wrong in your record?</h2>
        <ErrorNotice error={error} />
        <SuccessNotice message={success} />
        <Field label="What is wrong?" hint="For example: name spelling, posting date" id="cf">
          <input id="cf" value={f.field} onChange={(e) => setF({ ...f, field: e.target.value })} required minLength={2} />
        </Field>
        <Field label="What should it say?" id="cv">
          <textarea id="cv" value={f.requested} onChange={(e) => setF({ ...f, requested: e.target.value })} required minLength={2} style={{ minHeight: '4rem' }} />
        </Field>
        <div>
          <button className="btn secondary" disabled={busy}>
            Request correction
          </button>
        </div>
      </form>
      {list && list.length > 0 && (
        <ul className="small" style={{ paddingLeft: '1.1rem', margin: 0 }}>
          {list.map((c) => (
            <li key={c.id}>
              {c.field}: {c.status.toLowerCase()}
              {c.response && <span className="muted"> ({c.response})</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PortalPassword() {
  const [f, setF] = useState({ currentPassword: '', newPassword: '' });
  const { busy, error, success, run } = useAction();
  return (
    <details className="panel inline">
      <summary>Change your password</summary>
      <form
        className="stack"
        style={{ maxWidth: 420 }}
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => { await teacherApi.post('/api/portal/change-password', f); setF({ currentPassword: '', newPassword: '' }); }, 'Password changed');
        }}
      >
        <ErrorNotice error={error} />
        <SuccessNotice message={success} />
        <Field label="Current password" id="pcp">
          <input id="pcp" type="password" value={f.currentPassword} onChange={(e) => setF({ ...f, currentPassword: e.target.value })} required />
        </Field>
        <Field label="New password" hint="At least 10 characters" id="pnp">
          <input id="pnp" type="password" minLength={10} value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} required />
        </Field>
        <div>
          <button className="btn" disabled={busy}>
            Change password
          </button>
        </div>
      </form>
    </details>
  );
}
