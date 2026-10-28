'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { publicApi, setToken } from '@/lib/api';
import { ErrorNotice, useAction } from '@/components/ui';

function PortalLoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [tscNumber, setTsc] = useState('');
  const [password, setPassword] = useState('');
  const { busy, error, run } = useAction();

  return (
    <div className="auth">
      <section className="auth-side">
        <div>
          <p className="small">Teachers Service Commission</p>
          <h1 style={{ marginTop: '0.75rem' }}>Your teaching record</h1>
          <p>See your postings, appraisal returns and the progress of any request. Ask for a transfer, or ask for a correction if something is wrong.</p>
        </div>
        <p className="small">
          TSC officer? <Link href="/login" style={{ color: '#fff' }}>Officer sign-in</Link>
        </p>
      </section>
      <section className="auth-form">
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const r = await publicApi.post('/api/auth/teacher/login', { tscNumber: tscNumber.trim(), password });
              setToken('officer', null);
              setToken('teacher', r.token);
              router.replace('/portal');
            });
          }}
        >
          <h2>Teacher sign-in</h2>
          {params.get('expired') && <div className="notice warning">Your session ended. Sign in again.</div>}
          <ErrorNotice error={error} />
          <div className="field">
            <label htmlFor="tsc">TSC number</label>
            <input id="tsc" inputMode="numeric" autoComplete="username" value={tscNumber} onChange={(e) => setTsc(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="pw">Password</label>
            <input id="pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <button className="btn" disabled={busy} style={{ width: '100%', justifyContent: 'center' }}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          <p className="small">
            First time here? <Link href="/portal/register">Set up your account</Link>
          </p>
        </form>
      </section>
    </div>
  );
}

export default function PortalLogin() {
  return (
    <Suspense fallback={null}>
      <PortalLoginInner />
    </Suspense>
  );
}
