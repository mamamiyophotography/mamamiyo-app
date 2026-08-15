import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="wrap" style={{ textAlign: 'center', paddingTop: 80 }}>
      <div style={{ fontSize: 12, textTransform: 'uppercase', color: 'var(--gold-deep)', fontWeight: 600 }}>Mamamiyo Photography</div>
      <h1 style={{ fontSize: 32, marginTop: 8 }}>Book your session</h1>
      <p style={{ color: 'var(--ink-soft)' }}>Newborn, maternity, and family photography.</p>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 20 }}>
        <Link href="/book" className="btn btn-primary">Book a session</Link>
        <Link href="/lookup" className="btn btn-ghost">Look up my booking</Link>
      </div>
    </div>
  );
}
