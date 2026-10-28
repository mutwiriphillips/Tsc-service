'use client';
import { useState } from 'react';
import { officerApi, qs } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { ErrorNotice, Loading, PageHead, Pager, useAction, useData } from '@/components/ui';

export default function Audit() {
  const [action, setAction] = useState('');
  const [entityId, setEntityId] = useState('');
  const [page, setPage] = useState(1);
  const list = useData(() => officerApi.get(`/api/admin/audit${qs({ action, entityId, page, pageSize: 50 })}`), [action, entityId, page]);
  const verify = useAction();
  const [result, setResult] = useState(null);

  return (
    <div>
      <PageHead title="Audit trail" intro="Every approval, override, change and sensitive read, in order. Entries cannot be edited or deleted, and each one is chained to the one before it.">
        <button className="btn secondary" disabled={verify.busy} onClick={() => verify.run(async () => setResult(await officerApi.get('/api/admin/audit/verify')))}>
          {verify.busy ? 'Checking…' : 'Check integrity'}
        </button>
      </PageHead>
      <ErrorNotice error={verify.error} />
      {result && (
        <div className={`notice ${result.valid ? 'success' : 'error'}`} style={{ marginBottom: '1rem' }}>
          {result.valid ? `Intact: all ${result.checked} entries verified against the chain.` : `Broken at entry ${result.brokenAt}, after ${result.checked} verified entries. Escalate to ICT security.`}
        </div>
      )}
      <div className="toolbar">
        <div className="field">
          <label htmlFor="aa">Action</label>
          <input id="aa" placeholder="e.g. RULE_OVERRIDE" value={action} onChange={(e) => { setPage(1); setAction(e.target.value.toUpperCase()); }} />
        </div>
        <div className="field">
          <label htmlFor="ae">Record ID</label>
          <input id="ae" value={entityId} onChange={(e) => { setPage(1); setEntityId(e.target.value.trim()); }} />
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
                  <th className="num">#</th>
                  <th>When</th>
                  <th>Who</th>
                  <th>Action</th>
                  <th>Record</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((e) => (
                  <tr key={e.id}>
                    <td className="num">{e.id}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(e.at)}</td>
                    <td className="small">
                      {e.actorType.toLowerCase()}
                      {e.actorId && <div className="muted">{e.actorId}</div>}
                    </td>
                    <td>
                      <strong>{e.action}</strong>
                    </td>
                    <td className="small">
                      {e.entityType}
                      {e.entityId && <div className="muted">{e.entityId}</div>}
                    </td>
                    <td className="small" style={{ maxWidth: '24rem', wordBreak: 'break-word' }}>
                      {e.detail ? JSON.stringify(e.detail) : ''}
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
