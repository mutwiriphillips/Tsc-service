'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import QRCode from 'qrcode';
import { publicApi, setToken } from '@/lib/api';
import { ErrorNotice, useAction } from '@/components/ui';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [step, setStep] = useState('password'); // password | mfa | enrol
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(null);
  const [enrol, setEnrol] = useState(null);
  const [qr, setQr] = useState(null);
  const { busy, error, run } = useAction();

  useEffect(() => {
    if (enrol) QRCode.toDataURL(enrol.otpauthUri, { margin: 1, width: 200 }).then(setQr).catch(() => setQr(null));
  }, [enrol]);

  const finish = (res) => {
    setToken('teacher', null);
    setToken('officer', res.token);
    router.replace('/dashboard');
  };

  const submitPassword = (e) => {
    e.preventDefault();
    run(async () => {
      const res = await publicApi.post('/api/auth/officer/login', { email: email.trim(), password });
      if (res.token) return finish(res);
      setPending(res.pendingToken);
      if (res.mfaRequired) setStep('mfa');
      if (res.mfaSetupRequired) {
        const setup = await publicApi.post('/api/auth/officer/mfa/setup', { pendingToken: res.pendingToken });
        setEnrol(setup);
        setStep('enrol');
      }
    });
  };

  const submitCode = (e) => {
    e.preventDefault();
    run(async () => finish(await publicApi.post('/api/auth/officer/mfa/verify', { pendingToken: pending, code: code.trim() })));
  };

  return (
    <div className="auth">
      <section className="auth-side">
        <div>
          <p className="small">Teachers Service Commission</p>
          <h1 style={{ marginTop: '0.75rem' }}>Teacher Management &amp; Governance System</h1>
          <p>One verified record of every teacher, school and staffing action in your jurisdiction. The system reports; officers decide.</p>
        </div>
        <p className="small">
          Teacher? <Link href="/portal/login" style={{ color: '#fff' }}>Go to the teacher portal</Link>
        </p>
      </section>
      <section className="auth-form">
        {step === 'password' && (
          <form onSubmit={submitPassword} className="stack" aria-labelledby="signin-h">
            <h2 id="signin-h">Officer sign-in</h2>
            {params.get('expired') && <div className="notice warning">Your session ended. Sign in again.</div>}
            <ErrorNotice error={error} />
            <div className="field">
              <label htmlFor="email">Work email</label>
              <input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <button className="btn" disabled={busy} style={{ width: '100%', justifyContent: 'center' }}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        )}

        {step === 'mfa' && (
          <form onSubmit={submitCode} className="stack">
            <h2>Enter your sign-in code</h2>
            <p className="muted">Open your authenticator app and enter the 6-digit code for TSC TMGS.</p>
            <ErrorNotice error={error} />
            <div className="field">
              <label htmlFor="code">6-digit code</label>
              <input id="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} required autoFocus />
            </div>
            <button className="btn" disabled={busy} style={{ width: '100%', justifyContent: 'center' }}>
              {busy ? 'Checking…' : 'Verify and sign in'}
            </button>
          </form>
        )}

        {step === 'enrol' && enrol && (
          <form onSubmit={submitCode} className="stack">
            <h2>Set up two-step sign-in</h2>
            <p className="muted">Officer accounts hold teachers&rsquo; personal data, so every sign-in needs a code from an authenticator app (Google Authenticator, Microsoft Authenticator or similar).</p>
            <ol className="small" style={{ paddingLeft: '1.2rem', margin: 0 }}>
              <li>In your authenticator app, add an account and scan this code.</li>
              <li>Enter the 6-digit code the app shows.</li>
            </ol>
            {qr && <img src={qr} alt="QR code for your authenticator app" width={200} height={200} />}
            <details className="inline">
              <summary>Can&rsquo;t scan? Enter the key instead</summary>
              <code style={{ wordBreak: 'break-all' }}>{enrol.secret}</code>
            </details>
            <ErrorNotice error={error} />
            <div className="field">
              <label htmlFor="code2">6-digit code</label>
              <input id="code2" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} required />
            </div>
            <button className="btn" disabled={busy} style={{ width: '100%', justifyContent: 'center' }}>
              {busy ? 'Checking…' : 'Turn on and sign in'}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
