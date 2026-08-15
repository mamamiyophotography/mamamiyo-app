'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || 'Login failed');
      return;
    }
    router.push(params.get('next') || '/admin/bookings');
    router.refresh();
  }

  return (
    <div className="wrap" style={{ maxWidth: 380, paddingTop: 80 }}>
      <div style={{ fontSize: 12, textTransform: 'uppercase', color: 'var(--gold-deep)', fontWeight: 600, textAlign: 'center' }}>Mamamiyo Photography</div>
      <h1 style={{ fontSize: 24, textAlign: 'center', marginTop: 6 }}>Studio dashboard</h1>
      <form onSubmit={submit} className="card">
        <div className="field"><label>Email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus /></div>
        <div className="field"><label>Password</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        {error && <div className="error-text">{error}</div>}
        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
