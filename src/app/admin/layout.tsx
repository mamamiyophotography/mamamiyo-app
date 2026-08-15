'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const TABS = [
  { href: '/admin/bookings', label: 'Bookings' },
  { href: '/admin/availability', label: 'Availability' },
  { href: '/admin/discounts', label: 'Discounts' },
  { href: '/admin/bundles', label: 'Bundles' },
  { href: '/admin/settings', label: 'Settings' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch('/api/admin/logout', { method: 'POST' });
    router.push('/admin/login');
  }

  // The login page lives under /admin/* (so it's a clean, memorable URL) but
  // shouldn't show the dashboard chrome — this layout wraps it too, so skip
  // the nav/logout here specifically.
  if (pathname === '/admin/login') return <>{children}</>;

  return (
    <div className="wrap" style={{ maxWidth: 860 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--gold-deep)', fontWeight: 600 }}>Studio dashboard</div>
          <h1 style={{ fontSize: 24 }}>Mamamiyo Photography</h1>
        </div>
        <button className="btn btn-ghost" onClick={logout}>Log out</button>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="btn"
            style={{
              background: pathname.startsWith(t.href) ? 'var(--ink)' : 'var(--paper)',
              color: pathname.startsWith(t.href) ? 'var(--cream)' : 'var(--ink-soft)',
              border: '1.5px solid var(--line)',
            }}
          >
            {t.label}
          </Link>
        ))}
      </div>
      {children}
    </div>
  );
}
