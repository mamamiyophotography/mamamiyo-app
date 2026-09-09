'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const TABS = [
  { href: '/admin/bookings', label: 'Bookings' },
  { href: '/admin/availability', label: 'Availability' },
  { href: '/admin/discounts', label: 'Discounts' },
  { href: '/admin/bundles', label: 'Bundles' },
  { href: '/admin/import', label: '📥 Import' },
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
    <div style={{ minHeight: '100vh', background: '#E5BFA8' }}>
      <div className="wrap" style={{ maxWidth: 860 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, textTransform: 'uppercase', color: '#7A4D45', fontWeight: 600, fontFamily: "'Inter', sans-serif" }}>Studio dashboard</div>
            <h1 style={{ fontSize: 24, fontFamily: "'Quicksand', sans-serif", color: '#3A2E28' }}>Mamamiyo Photography</h1>
          </div>
          <button className="btn btn-ghost" onClick={logout}>Log out</button>
        </div>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', flexWrap: 'nowrap', marginBottom: 20, paddingBottom: 4 }}>
          {TABS.map((t) => {
            const active = pathname.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                style={{
                  flex: '0 0 auto',
                  whiteSpace: 'nowrap',
                  fontFamily: "'Quicksand', sans-serif",
                  fontWeight: 600,
                  fontSize: 14.5,
                  padding: '10px 18px',
                  borderRadius: 14,
                  textDecoration: 'none',
                  background: active ? '#9D84B7' : '#D0C4DD',
                  color: active ? '#FFFFFF' : '#5A4B7A',
                }}
              >
                {t.label}
              </Link>
            );
          })}
        </div>
        {children}
      </div>
    </div>
  );
}
