'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

/** Load data from an async function; re-run when deps change. */
export function useData(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fnRef.current();
      setState({ data, error: null, loading: false });
    } catch (error) {
      setState({ data: null, error, loading: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    load();
  }, [load]);
  return { ...state, reload: load };
}

/** Run an action with busy/error/success state. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const run = useCallback(async (fn, okMessage) => {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const out = await fn();
      if (okMessage) setSuccess(okMessage);
      return out;
    } catch (e) {
      setError(e);
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, success, run, setError, setSuccess };
}

export function ErrorNotice({ error }) {
  if (!error) return null;
  return (
    <div className="notice error" role="alert">
      {error.message}
      {Array.isArray(error.details) && (
        <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.2rem' }}>
          {error.details.map((d, i) => (
            <li key={i}>{typeof d === 'string' ? d : `${d.path ? `${d.path}: ` : ''}${d.message || (d.issues || []).join(', ')}${d.line ? ` (line ${d.line})` : ''}`}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SuccessNotice({ message }) {
  if (!message) return null;
  return (
    <div className="notice success" role="status">
      {message}
    </div>
  );
}

export function Loading({ label = 'Loading' }) {
  return (
    <p className="muted" role="status">
      {label}…
    </p>
  );
}

export function Stamp({ band, large }) {
  if (!band) return <span className={`stamp none${large ? ' large' : ''}`}>No data</span>;
  return (
    <span className={`stamp ${band}${large ? ' large' : ''}`} aria-label={`Readiness band ${band}`}>
      {band}
    </span>
  );
}

export function SeverityTag({ severity }) {
  return <span className={`tag ${severity === 'BREACH' ? 'breach' : 'warning'}`}>{severity === 'BREACH' ? 'Breach' : 'Warning'}</span>;
}

export function PageHead({ title, intro, children }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {intro && <p>{intro}</p>}
      </div>
      {children && <div className="row">{children}</div>}
    </div>
  );
}

export function Pager({ data, page, setPage }) {
  if (!data || data.pages <= 1) return null;
  return (
    <nav className="pager" aria-label="Pages">
      <span className="small muted">
        Page {data.page} of {data.pages} · {data.total} total
      </span>
      <button className="btn secondary small" disabled={page <= 1} onClick={() => setPage(page - 1)}>
        Previous
      </button>
      <button className="btn secondary small" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>
        Next
      </button>
    </nav>
  );
}

export function Field({ label, hint, children, id }) {
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {hint && <span className="hint">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

/** A small inline form that asks for a reason before an irreversible action. */
export function ReasonAction({ label, confirmLabel, minLength = 10, onConfirm, variant = 'secondary', placeholder }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  if (!open) {
    return (
      <button className={`btn ${variant === 'danger' ? 'secondary' : variant} small`} onClick={() => setOpen(true)}>
        {label}
      </button>
    );
  }
  return (
    <form
      className="stack"
      style={{ minWidth: 260 }}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const ok = await onConfirm(reason.trim());
        setBusy(false);
        if (ok !== false) {
          setOpen(false);
          setReason('');
        }
      }}
    >
      <textarea aria-label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={placeholder || 'Reason (recorded in the audit trail)'} required minLength={minLength} style={{ minHeight: '4rem' }} />
      <div className="row">
        <button className={`btn ${variant === 'danger' ? 'danger' : ''} small`} disabled={busy || reason.trim().length < minLength}>
          {confirmLabel || label}
        </button>
        <button type="button" className="btn secondary small" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
