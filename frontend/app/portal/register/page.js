'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { publicApi, setToken } from '@/lib/api';
import { ErrorNotice, useAction } from '@/components/ui';

export default function PortalRegister() {
  const router = useRouter();
  const [f, setF] = useState({ tscNumber: '', nationalId: '', password: '', confirm: '' });
  const { busy, error, run, setError } = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  return (
    <div className="auth">
      <section className="auth-side">
        <div>
          <p className="small">Teachers Service Commission</p>
          <h1 style={{ marginTop: '0.75rem' }}>Set up your portal account</h1>
          <p>We match your TSC number and national ID against the TSC register. Your national ID is checked, not stored in readable form.</p>
        </div>
      </section>
      <section className="auth-form">
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (f.password !== f.confirm) {
              setError(new Error('The two passwords do not match.'));
              return;
            }
            run(async () => {
              const r = await publicApi.post('/api/auth/teacher/register', { tscNumber: f.tscNumber.trim(), nationalId: f.nationalId.trim(), password: f.password });
              setToken('teacher', r.token);
              router.replace('/portal');
            });
          }}
        >
          <h2>Your details</h2>
          <ErrorNotice error={error} />
          <div className="field">
            <label htmlFor="rt">TSC number</label>
            <input id="rt" inputMode="numeric" value={f.tscNumber} onChange={set('tscNumber')} required />
          </div>
          <div className="field">
            <label htmlFor="rn">National ID number</label>
            <input id="rn" inputMode="numeric" autoComplete="off" value={f.nationalId} onChange={set('nationalId')} required />
          </div>
          <div className="field">
            <label htmlFor="rp">
              Choose a password <span className="hint">At least 10 characters</span>
            </label>
            <input id="rp" type="password" autoComplete="new-password" minLength={10} value={f.password} onChange={set('password')} required />
          </div>
          <div className="field">
            <label htmlFor="rc">Type it again</label>
            <input id="rc" type="password" autoComplete="new-password" minLength={10} value={f.confirm} onChange={set('confirm')} required />
          </div>
          <button className="btn" disabled={busy} style={{ width: '100%', justifyContent: 'center' }}>
            {busy ? 'Checking…' : 'Create account'}
          </button>
          <p className="small">
            Already set up? <Link href="/portal/login">Sign in</Link>
          </p>
        </form>
      </section>
    </div>
  );
}
