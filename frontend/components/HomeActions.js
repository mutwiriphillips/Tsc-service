'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getToken } from '@/lib/api';

// Signed-in visitors get a way back in; everyone else gets the two doors.
export default function HomeActions({ variant = 'hero' }) {
  const [who, setWho] = useState(null);
  useEffect(() => {
    try {
      setWho(getToken('officer') ? 'officer' : getToken('teacher') ? 'teacher' : null);
    } catch {
      setWho(null);
    }
  }, []);

  if (who) {
    const href = who === 'officer' ? '/dashboard' : '/portal';
    return (
      <div className="row">
        <Link className="btn lp-btn" href={href}>{who === 'officer' ? 'Continue to your dashboard' : 'Continue to your portal'}</Link>
      </div>
    );
  }
  return (
    <div className="row">
      <Link className="btn lp-btn" href="/login">Officer sign in</Link>
      <Link className={variant === 'hero' ? 'btn secondary lp-btn' : 'btn secondary lp-btn'} href="/portal/login">Teacher portal</Link>
    </div>
  );
}
