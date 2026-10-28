'use client';
import { useState } from 'react';
import { officerApi } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { useOfficer, can } from '@/components/OfficerContext';
import { ErrorNotice, Field, Loading, PageHead, SuccessNotice, useAction, useData } from '@/components/ui';

export default function Settings() {
  const officer = useOfficer();
  const rules = useData(() => officerApi.get('/api/compliance/rules'));
  const unconfirmed = rules.data ? rules.data.filter((r) => !r.confirmed).length : 0;

  return (
    <div className="stack-lg">
      <PageHead title="Rules and settings" intro="The thresholds the rules and the readiness score use. They are settings, not code, so they change without a new release." />

      <section aria-labelledby="rules-h">
        <div className="panel-head">
          <h2 id="rules-h">Rule thresholds</h2>
          {unconfirmed > 0 && <span className="tag warning">{unconfirmed} not yet confirmed by TSC</span>}
        </div>
        <ErrorNotice error={rules.error} />
        {rules.loading && !rules.data && <Loading />}
        <div className="stack">
          {(rules.data || []).map((r) => (
            <RuleRow key={r.key} rule={r} editable={can(officer, 'editRules')} onSaved={rules.reload} />
          ))}
        </div>
      </section>

      {(can(officer, 'importTeachers') || can(officer, 'importAppraisals')) && <Imports officer={officer} />}

      <ChangePassword />
    </div>
  );
}

function RuleRow({ rule, editable, onSaved }) {
  const [text, setText] = useState(JSON.stringify(rule.value, null, 2));
  const [confirmed, setConfirmed] = useState(rule.confirmed);
  const [editing, setEditing] = useState(false);
  const { busy, error, success, run } = useAction();
  return (
    <article className="panel">
      <div className="spread">
        <div>
          <strong>{rule.key}</strong> {rule.confirmed ? <span className="tag ok">Confirmed</span> : <span className="tag warning">Placeholder</span>}
          <p className="small" style={{ marginTop: '0.25rem', maxWidth: '70ch' }}>
            {rule.description}
          </p>
        </div>
        {editable && !editing && (
          <button className="btn secondary small" onClick={() => setEditing(true)}>
            Edit
          </button>
        )}
      </div>
      {!editing && <pre className="small" style={{ margin: '0.75rem 0 0', whiteSpace: 'pre-wrap' }}>{JSON.stringify(rule.value)}</pre>}
      {editing && (
        <form
          className="stack"
          style={{ marginTop: '0.75rem' }}
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              let value;
              try {
                value = JSON.parse(text);
              } catch {
                throw new Error('That is not valid JSON. Check brackets, quotes and commas.');
              }
              await officerApi.put(`/api/compliance/rules/${rule.key}`, { value, confirmed });
              setEditing(false);
              onSaved();
            }, 'Saved');
          }}
        >
          <ErrorNotice error={error} />
          <SuccessNotice message={success} />
          <textarea aria-label={`Value for ${rule.key}`} value={text} onChange={(e) => setText(e.target.value)} style={{ fontFamily: 'ui-monospace, monospace', minHeight: '7rem' }} />
          <label className="checkbox">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> TSC has confirmed this value against current policy
          </label>
          <div className="row">
            <button className="btn small" disabled={busy}>
              Save setting
            </button>
            <button type="button" className="btn secondary small" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {rule.updatedById && <p className="small muted" style={{ marginTop: '0.5rem' }}>Last changed {fmtDateTime(rule.updatedAt)}</p>}
    </article>
  );
}

function Imports({ officer }) {
  const [kind, setKind] = useState(can(officer, 'importTeachers') ? 'teachers' : 'appraisals');
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const { busy, error, run } = useAction();
  const go = (dryRun) =>
    run(async () => {
      setResult(null);
      const text = await file.text();
      try {
        setResult(await officerApi.upload(`/api/integrations/import/${kind}${dryRun ? '?dryRun=true' : ''}`, text, 'text/csv'));
      } catch (e) {
        if (e.status === 422 && e.body) setResult({ applied: false, rows: e.body.rows, errors: e.body.errors || [] });
        else throw e;
      }
    });
  const columns = {
    teachers: 'tscNumber, nationalId, firstName, lastName, gender, registrationStatus, personnelFileComplete',
    appraisals: 'tscNumber, schoolCode, year, term, complete',
  };
  return (
    <section className="panel stack" aria-labelledby="imp-h">
      <h2 id="imp-h">Import from TSC systems</h2>
      <p className="small">Until the source systems are connected directly, upload their nightly CSV export. Check the file first; nothing is written unless every row is valid.</p>
      <div className="grid-2" style={{ gap: '0 1rem' }}>
        <Field label="What are you importing?" id="ik">
          <select id="ik" value={kind} onChange={(e) => { setKind(e.target.value); setResult(null); }}>
            {can(officer, 'importTeachers') && <option value="teachers">Teacher register</option>}
            {can(officer, 'importAppraisals') && <option value="appraisals">Appraisal returns</option>}
          </select>
        </Field>
        <Field label="CSV file" hint={`Columns: ${columns[kind]}`} id="if">
          <input id="if" type="file" accept=".csv,text/csv" onChange={(e) => { setFile(e.target.files[0] || null); setResult(null); }} />
        </Field>
      </div>
      <ErrorNotice error={error} />
      <div className="row">
        <button className="btn secondary" disabled={!file || busy} onClick={() => go(true)}>
          Check file
        </button>
        <button className="btn" disabled={!file || busy || !result || result.errors.length > 0 || result.applied} onClick={() => go(false)}>
          Import
        </button>
      </div>
      {result && result.errors.length > 0 && <ErrorNotice error={{ message: `${result.errors.length} row(s) need fixing before anything can be imported.`, details: result.errors }} />}
      {result && result.errors.length === 0 && !result.applied && <div className="notice success">All {result.rows} rows are valid. Select Import to apply them.</div>}
      {result && result.applied && (
        <div className="notice success">
          Imported {result.rows} rows{result.created !== undefined && ` (${result.created} new, ${result.updated} updated)`}.
        </div>
      )}
    </section>
  );
}

function ChangePassword() {
  const [f, setF] = useState({ currentPassword: '', newPassword: '' });
  const { busy, error, success, run } = useAction();
  return (
    <form
      className="panel"
      style={{ maxWidth: 480 }}
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => { await officerApi.post('/api/auth/officer/change-password', f); setF({ currentPassword: '', newPassword: '' }); }, 'Password changed');
      }}
    >
      <h2 style={{ marginBottom: '1rem' }}>Change your password</h2>
      <ErrorNotice error={error} />
      <SuccessNotice message={success} />
      <Field label="Current password" id="cp">
        <input id="cp" type="password" autoComplete="current-password" value={f.currentPassword} onChange={(e) => setF({ ...f, currentPassword: e.target.value })} required />
      </Field>
      <Field label="New password" hint="At least 10 characters" id="np">
        <input id="np" type="password" autoComplete="new-password" value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} minLength={10} required />
      </Field>
      <button className="btn" disabled={busy}>
        Change password
      </button>
    </form>
  );
}
