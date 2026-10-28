'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getToken } from '@/lib/api';

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    if (getToken('officer')) router.replace('/dashboard');
    else if (getToken('teacher')) router.replace('/portal');
    else router.replace('/login');
  }, [router]);
  return null;
}
