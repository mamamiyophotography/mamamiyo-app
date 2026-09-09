'use client';

import { fmtDatePretty, fmtTime12 } from '@/lib/format';

type SummaryBooking = {
  clientName: string;
  sessionLabel: string;
  date: string;
  startTime: string;
  location: string;
  address?: string;
  clientEmail: string;
  clientPhone: string;
  referencePhotoUrls: string[];
  notes: string;
};

export default function BookingSummaryModal({ booking, onClose }: { booking: SummaryBooking; onClose: () => void }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(46,42,34,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ maxWidth: 420, width: '100%', maxHeight: '85vh', overflowY: 'auto', padding: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Booking Summary</div>
        <div className="ticket-row"><span>Client</span><b>{booking.clientName}</b></div>
        <div className="ticket-row"><span>Session</span><b>{booking.sessionLabel}</b></div>
        <div className="ticket-row"><span>Date</span><b>{fmtDatePretty(booking.date)}</b></div>
        <div className="ticket-row"><span>Time</span><b>{fmtTime12(booking.startTime)}</b></div>
        <div className="ticket-row"><span>Location</span><b>{booking.location === 'home' ? "Client's home" : 'Studio'}</b></div>
        <div className="ticket-row"><span>Email</span><b>{booking.clientEmail}</b></div>
        <div className="ticket-row"><span>Phone</span><b>{booking.clientPhone}</b></div>
        {booking.address && <div className="ticket-row"><span>Address</span><b>{booking.address}</b></div>}
        <div className="ticket-row"><span>Notes</span><b>{booking.notes || '—'}</b></div>

        {booking.referencePhotoUrls.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginBottom: 6 }}>Reference photos ({booking.referencePhotoUrls.length})</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {booking.referencePhotoUrls.map((url) => (
                <a key={url} href={url} target="_blank" rel="noopener" style={{ display: 'block', width: 64, height: 64, borderRadius: 8, overflow: 'hidden', border: '1.5px solid var(--line)' }}>
                  <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </a>
              ))}
            </div>
          </div>
        )}

        <button className="btn btn-ghost" style={{ marginTop: 16, width: '100%' }} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
