'use client';
import { useState } from 'react';
import { officerApi, qs } from '@/lib/api';
import { ROLE_LABEL } from '@/lib/format';
import { useOfficer } from '@/components/OfficerContext';
import { ErrorNotice, Field, Loading, PageHead, Pager, ReasonAction, SuccessNotice, useAction, useData } from '@/components/ui';

const COUNTY_ROLES = ['SUBCOUNTY_DIRECTOR', 'CSO', 'HEAD_OF_INSTITUTION'];

export default function Officers() {
  const officer = useOfficer();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const list = useData(() => officerApi.get(`/api/officers${qs({ q, page, pageSize: 25 })}`), [q, page]);
  const act = useAction();
  const where = (o) => (o.school && o.school.name) || (o.subCounty && `${o.subCounty.name} Sub-County`) || (o.county && `${o.county.name} County`) || (o.region && `${o.region.name} region`) || (o.role === 'NATIONAL_ADMIN' ? 'National' : o.role === 'CSO' ? 'Assigned schools' : '—');

  return (
    <div>
      <PageHead title="Officers" intro={officer.role === 'NATIONAL_ADMIN' ? 'Every officer account. Each officer sees only their own jurisdiction.' : 'Sub-County Directors, CSOs and Heads in your county.'}>
        <button className="btn" onClick={() => setAdding(!adding)}>
          {adding ? 'Close' : 'Add an officer'}
        </button>
      </PageHead>
      <ErrorNotice error={act.error} />
      <SuccessNotice message={act.success} />
      {adding && <AddOfficer me={officer} onDone={() => { setAdding(false); list.reload(); }} />}
      <div className="toolbar">
        <div className="field">
          <label htmlFor="oq">Search</label>
          <input id="oq" placeholder="Name, email or staff number" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} />
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
                  <th>Officer</th>
                  <th>Role</th>
                  <th>Jurisdiction</th>
                  <th>Two-step sign-in</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((o) => (
                  <tr key={o.id}>
                    <td>
                      {o.name}
                      <div className="small muted">
                        {o.email} · {o.staffNumber}
                      </div>
                    </td>
                    <td>{ROLE_LABEL[o.role]}</td>
                    <td>{where(o)}</td>
                    <td>{o.mfaEnabled ? <span className="tag ok">On</span> : <span className="tag warning">Not set up</span>}</td>
                    <td>{o.active ? 'Active' : <span className="tag">Deactivated</span>}</td>
                    <td>
                      <div className="row" style={{ gap: '0.5rem' }}>
                        {o.active && o.id !== officer.id && (
                          <ReasonAction label="Deactivate" confirmLabel="Deactivate account" minLength={3} variant="danger" onConfirm={(reason) => act.run(async () => { await officerApi.post(`/api/officers/${o.id}/deactivate`, { reason }); list.reload(); }, `${o.name} deactivated`)} />
                        )}
                        {officer.role === 'NATIONAL_ADMIN' && o.mfaEnabled && (
                          <button className="btn secondary small" onClick={() => act.run(async () => { await officerApi.post(`/api/officers/${o.id}/reset-mfa`); list.reload(); }, 'Two-step sign-in reset; the officer sets it up again at next sign-in')}>
                            Reset two-step
                          </button>
                        )}
                      </div>
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

function AddOfficer({ me, onDone }) {
  const roles = me.role === 'NATIONAL_ADMIN' ? Object.keys(ROLE_LABEL) : COUNTY_ROLES;
  const [f, setF] = useState({ staffNumber: '', name: '', email: '', password: '', role: roles[0], regionId: '', countyId: me.countyId || '', subCountyId: '', schoolId: '', csoSchoolIds: [] });
  const geo = useData(() => officerApi.get('/api/geo/regions'));
  const subs = useData(() => (f.countyId ? officerApi.get(`/api/geo/counties/${f.countyId}/sub-counties`) : Promise.resolve([])), [f.countyId]);
  const schools = useData(() => officerApi.get(`/api/schools${qs({ countyId: f.countyId, pageSize: 200, withScore: 'false' })}`), [f.countyId]);
  const { busy, error, success, run } = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const needs = { REGIONAL_DIRECTOR: 'region', COUNTY_DIRECTOR: 'county', SUBCOUNTY_DIRECTOR: 'subCounty', HEAD_OF_INSTITUTION: 'school', CSO: 'csoSchools' }[f.role];

  const submit = (e) => {
    e.preventDefault();
    const body = { staffNumber: f.staffNumber, name: f.name, email: f.email, password: f.password, role: f.role };
    if (needs === 'region') body.regionId = f.regionId;
    if (needs === 'county') body.countyId = f.countyId;
    if (needs === 'subCounty') body.subCountyId = f.subCountyId;
    if (needs === 'school') body.schoolId = f.schoolId;
    if (needs === 'csoSchools') body.csoSchoolIds = f.csoSchoolIds;
    run(async () => { await officerApi.post('/api/officers', body); onDone(); }, 'Officer added');
  };

  return (
    <form className="panel" style={{ marginBottom: '1.5rem' }} onSubmit={submit}>
      <h2 style={{ marginBottom: '0.5rem' }}>Add an officer</h2>
      <p className="small muted" style={{ marginBottom: '1rem' }}>
        Give the officer a temporary password. They set up two-step sign-in the first time they sign in.
      </p>
      <ErrorNotice error={error} />
      <SuccessNotice message={success} />
      <div className="grid-2" style={{ gap: '0 1rem' }}>
        <Field label="Full name" id="on">
          <input id="on" value={f.name} onChange={set('name')} required />
        </Field>
        <Field label="Staff number" id="os">
          <input id="os" value={f.staffNumber} onChange={set('staffNumber')} required />
        </Field>
        <Field label="Work email" id="oe">
          <input id="oe" type="email" value={f.email} onChange={set('email')} required />
        </Field>
        <Field label="Temporary password" hint="At least 10 characters" id="op">
          <input id="op" type="text" autoComplete="new-password" value={f.password} onChange={set('password')} minLength={10} required />
        </Field>
        <Field label="Role" id="or">
          <select id="or" value={f.role} onChange={set('role')}>
            {roles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </Field>
        {needs === 'region' && (
          <Field label="Region" id="oreg">
            <select id="oreg" value={f.regionId} onChange={set('regionId')} required>
              <option value="">Choose a region</option>
              {(geo.data || []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        {needs && needs !== 'region' && me.role === 'NATIONAL_ADMIN' && (
          <Field label="County" id="ocou">
            <select id="ocou" value={f.countyId} onChange={(e) => setF({ ...f, countyId: e.target.value, subCountyId: '', schoolId: '', csoSchoolIds: [] })} required>
              <option value="">Choose a county</option>
              {(geo.data || []).flatMap((r) => r.counties).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} {c.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        {needs === 'subCounty' && (
          <Field label="Sub-county" id="osub">
            <select id="osub" value={f.subCountyId} onChange={set('subCountyId')} required>
              <option value="">Choose a sub-county</option>
              {(subs.data || []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        {needs === 'school' && (
          <Field label="School" id="osch">
            <select id="osch" value={f.schoolId} onChange={set('schoolId')} required>
              <option value="">Choose a school</option>
              {(schools.data ? schools.data.items : []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      {needs === 'csoSchools' && (
        <fieldset className="field" style={{ border: '1px solid var(--rule)', borderRadius: 6 }}>
          <legend style={{ fontWeight: 700 }}>Assigned schools</legend>
          {(schools.data ? schools.data.items : []).map((s) => (
            <label key={s.id} className="checkbox">
              <input
                type="checkbox"
                checked={f.csoSchoolIds.includes(s.id)}
                onChange={(e) => setF({ ...f, csoSchoolIds: e.target.checked ? [...f.csoSchoolIds, s.id] : f.csoSchoolIds.filter((x) => x !== s.id) })}
              />{' '}
              {s.name}
            </label>
          ))}
        </fieldset>
      )}
      <button className="btn" disabled={busy}>
        Add officer
      </button>
    </form>
  );
}
