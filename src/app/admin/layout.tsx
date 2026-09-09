'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const TABS = [
  { href: '/admin/bookings', label: 'Bookings' },
  { href: '/admin/availability', label: 'Availability' },
  { href: '/admin/discounts', label: 'Discounts' },
  { href: '/admin/bundles', label: 'Bundles' },
  { href: '/admin/import', label: 'Import' },
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
    <div className="admin-shell">
      <div className="admin-frame">
        <header className="admin-header">
          <div className="admin-brand">
            <img src="/icon.svg" alt="" className="admin-brand-mark" />
            <div>
              <div className="admin-eyebrow">Studio dashboard</div>
              <h1>Mamamiyo</h1>
            </div>
          </div>
          <button className="admin-logout" onClick={logout}>Log out</button>
        </header>
        <nav className="admin-nav" aria-label="Admin sections">
          {TABS.map((t) => {
            const active = pathname.startsWith(t.href);
            return (
              <Link key={t.href} href={t.href} className={`admin-nav-link${active ? ' active' : ''}`}>
                {t.label}
              </Link>
            );
          })}
        </nav>
        <main className="admin-content">{children}</main>
      </div>
    </div>
  );
}
