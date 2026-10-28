'use client';
import { useState } from 'react';

// The official logo is supplied by TSC and placed in public/brand/ (see the README there).
// Tries tsc-logo.png, then tsc-logo.svg, then falls back to a plain lettermark.
const SOURCES = ['/brand/tsc-logo.png', '/brand/tsc-logo.svg'];

export default function Logo({ size = 56 }) {
  const [i, setI] = useState(0);
  if (i >= SOURCES.length) {
    return (
      <span className="lp-mark" style={{ width: size, height: size, fontSize: size * 0.34 }} aria-hidden="true">
        TSC
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={SOURCES[i]} alt="Teachers Service Commission logo" height={size} style={{ height: size, width: 'auto' }} onError={() => setI(i + 1)} />
  );
}
