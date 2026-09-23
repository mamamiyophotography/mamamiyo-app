'use client';

import { useEffect, useState, useCallback } from 'react';
import { fmtDatePretty, fmtTime12 } from '@/lib/format';
import { ADDONS, STATUS_LABELS } from '@/lib/constants';
import BookingSummaryModal from '@/components/BookingSummaryModal';
import EditBookingModal from '@/components/EditBookingModal';
import EditAddOnsModal from '@/components/EditAddOnsModal';
import SetupChoiceModal from '@/components/SetupChoiceModal';

type Booking = {
  additionalOrders?: {id:string;galleryId:string;version:number;items:{name:string;quantity:number;amount:number;bonusRetouches:number}[];total:number;bonusRetouches:number;status:string;invoiceRef:string;createdAt:string;paidAt:string|null}[];
  gallerySelections?: {galleryId:string;clientUrl:string|null;version:number;submitted:boolean;locked:boolean;deliveredAt:string|null;emailSentAt:string|null}[];
  id: string; ref: string; sessionTypeId: string; sessionLabel: string; location: string;
  date: string; startTime: string; endTime: string; isWeekend: boolean; addOns: Record<string, number>;
  notes: string; setupChoiceNotes: string; address: string; discountCode: string | null; discountAmount: number;
  clientName: string; clientEmail: string; clientPhone: string;
  subtotal: number; total: number; depositAmount: number; balanceDue: number;
  extraLineItems: { description: string; amount: number }[]; invoiceRef: string | null;
  invoiceStale: boolean; version: number;
  status: string; depositStatus: string; balanceStatus: string;
  referencePhotoUrls: string[]; remindersSent: string[]; bundleSessionNumber: number | null;
};

const STATUS_TABS = [
  { key: 'active', label: 'Active' },
  { key: 'pending', label: '1. Pending deposit' },
  { key: 'confirmed', label: '2. Booking confirmed' },
  { key: 'basic_retouch', label: '3. Basic retouch' },
  { key: 'further_retouch', label: '4. Further retouch' },
  { key: 'completed', label: '5. Photoshoot complete' },
  { key: 'cancelled', label: 'Cancelled' },
];

const STATUS_LABEL = STATUS_LABELS;

export default function AdminBookingsPage() {
  const [filter, setFilter] = useState('active');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedPhotos, setExpandedPhotos] = useState<string[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [lineDesc, setLineDesc] = useState('');
  const [lineAmount, setLineAmount] = useState('');
  const [invoiceQr, setInvoiceQr] = useState<{ bookingId: string; qrDataUrl: string; imageDataUrl: string; due: number; emailed: boolean } | null>(null);
  const [actionError, setActionError] = useState<{ id: string; message: string } | null>(null);
  const [summaryBooking, setSummaryBooking] = useState<Booking | null>(null);
  const [editBooking, setEditBooking] = useState<Booking | null>(null);
  const [editAddOnsBooking, setEditAddOnsBooking] = useState<Booking | null>(null);
  const [setupChoiceBooking, setSetupChoiceBooking] = useState<Booking | null>(null);
  const [actionSuccess, setActionSuccess] = useState<{ id: string; message: string } | null>(null);
  const [invoiceGenerating, setInvoiceGenerating] = useState<{ id: string; sendEmail: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const url = filter === 'active'
      ? `/api/admin/bookings?active=1`
      : `/api/admin/bookings?status=${filter}`;
    const res = await fetch(url);
    const data = await res.json();
    setBookings(data.bookings || []);
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  async function expandBooking(id: string) {
    if (expandedId === id) { setExpandedId(null); setExpandedPhotos([]); return; }
    setExpandedId(id);
    setExpandedPhotos([]);
    const res = await fetch(`/api/admin/bookings/${id}`);
    const data = await res.json();
    setExpandedPhotos(data.booking?.referencePhotoUrls || []);
  }

  async function runAction(id: string, path: string, body?: unknown) {
    setBusyId(id);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await fetch(`/api/admin/bookings/${id}/${path}`, {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok) { setActionError({ id, message: data.error || 'Action failed' }); return null; }
      await load();
      return data;
    } finally {
      setBusyId(null);
    }
  }

  async function openSummary(id: string) {
    const res = await fetch(`/api/admin/bookings/${id}`);
    const data = await res.json();
    if (data?.booking) setSummaryBooking(data.booking);
  }

  async function createInvoiceImage(booking: Booking, qrDataUrl: string, due: number) {
    const rows: { label: string; amount: string }[] = [];
    const addOnsTotal = Object.entries(booking.addOns || {}).filter(([, q]) => q > 0).reduce((sum, [id, q]) => sum + (ADDONS[id]?.price || 0) * q, 0);
    const weekendFee = booking.isWeekend ? 50 : 0;
    const basePrice = booking.sessionTypeId === 'bundle' ? booking.balanceDue - addOnsTotal - weekendFee : booking.total - addOnsTotal - weekendFee + booking.discountAmount;
    rows.push({ label: booking.sessionTypeId === 'bundle' ? `Session ${booking.bundleSessionNumber || 1} balance` : 'Package price', amount: `$${basePrice}` });
    Object.entries(booking.addOns || {}).filter(([, q]) => q > 0).forEach(([id, q]) => rows.push({ label: `${ADDONS[id]?.name || id} ×${q}`, amount: `+$${(ADDONS[id]?.price || 0) * q}` }));
    if (weekendFee) rows.push({ label: 'Weekend / PH surcharge', amount: `+$${weekendFee}` });
    if (booking.discountAmount) rows.push({ label: `Discount (${booking.discountCode || ''})`, amount: `−$${booking.discountAmount}` });
    booking.extraLineItems.forEach((item) => rows.push({ label: item.description, amount: `+$${item.amount}` }));
    const extraTotal = booking.extraLineItems.reduce((sum, item) => sum + item.amount, 0);
    const invoiceTotal = (booking.sessionTypeId === 'bundle' ? booking.balanceDue : booking.total) + extraTotal;
    rows.push({ label: 'Total', amount: `$${invoiceTotal}` });
    if (booking.sessionTypeId !== 'bundle' && booking.depositAmount > 0) {
      rows.push({ label: 'Deposit paid', amount: `−$${booking.depositAmount}` });
    }

    const rowHeight = (label: string) => 48 + (label.split('\n').length - 1) * 34;
    const rowsHeight = rows.reduce((sum, row) => sum + rowHeight(row.label), 0);
    const contentHeight = 970 + rowsHeight;
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = Math.max(1450, contentHeight + 108);
    const verticalOffset = (canvas.height - contentHeight) / 2 - 54;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Unable to create invoice image.');
    ctx.fillStyle = '#f5f0e8'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#2e2a22'; ctx.fillRect(54, 54 + verticalOffset, 972, 230);
    ctx.textAlign = 'center'; ctx.fillStyle = '#c5a87c'; ctx.font = '700 26px Arial'; ctx.fillText('MAMAMIYO PHOTOGRAPHY', 540, 125 + verticalOffset);
    ctx.fillStyle = '#b08d57'; ctx.font = '52px Georgia'; ctx.fillText('Invoice', 540, 205 + verticalOffset);
    ctx.textAlign = 'left'; ctx.fillStyle = '#2e2a22'; ctx.font = '700 34px Arial'; ctx.fillText(booking.clientName, 100, 350 + verticalOffset);
    ctx.font = '25px Arial'; ctx.fillStyle = '#6b6152'; ctx.fillText(`${booking.sessionLabel} · ${fmtDatePretty(booking.date)} at ${fmtTime12(booking.startTime)}`, 100, 400 + verticalOffset);
    let y = 525 + verticalOffset;
    ctx.strokeStyle = '#2e2a22'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(100, y); ctx.lineTo(980, y); ctx.stroke(); y += 54;
    for (const row of rows) {
      const lines = row.label.split('\n');
      const height = rowHeight(row.label);
      const centerY = y + (height - 44) / 2;
      const firstLineY = centerY - ((lines.length - 1) * 34) / 2;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left'; ctx.fillStyle = '#6b6152'; ctx.font = '27px Arial';
      lines.forEach((line, index) => ctx.fillText(line, 100, firstLineY + index * 34));
      ctx.textAlign = 'right'; ctx.fillStyle = '#2e2a22'; ctx.font = '700 29px Arial'; ctx.fillText(row.amount, 980, centerY);
      y += height;
      ctx.strokeStyle = '#e6decb'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(100, y - 20); ctx.lineTo(980, y - 20); ctx.stroke();
    }
    y += 10;
    const balanceCenterY = y + 24;
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillStyle = '#2e2a22'; ctx.font = '700 36px Arial'; ctx.fillText('Balance due', 100, balanceCenterY);
    ctx.textAlign = 'right'; ctx.fillStyle = '#8c6d3f'; ctx.font = '60px Georgia'; ctx.fillText(`$${due}`, 980, balanceCenterY);
    const qr = new Image(); qr.src = qrDataUrl; await new Promise<void>((resolve, reject) => { qr.onload = () => resolve(); qr.onerror = () => reject(new Error('Unable to render QR code.')); });
    const qrY = y + 90; ctx.drawImage(qr, 390, qrY, 300, 300);
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'center'; ctx.fillStyle = '#6b6152'; ctx.font = '24px Arial'; ctx.fillText('Scan with your banking app to pay', 540, qrY + 345);
    return canvas.toDataURL('image/png');
  }

  function shortGalleryUrl(galleryId: string) {
    return `${window.location.origin}/g/${galleryId.slice(0,12)}?preview=gallery`;
  }

  async function copyClientGalleryLink(bookingId: string, galleryId: string) {
    try {
      await navigator.clipboard.writeText(`Thanks for your purchase! Your photos with Basic Retouch are ready. Tap below to view and download them:\n\n${shortGalleryUrl(galleryId)}`);
      setActionSuccess({ id: bookingId, message: 'WhatsApp Gallery message copied with a short link.' });
    } catch {
      setActionError({ id: bookingId, message: 'Could not copy automatically. Open Client Gallery, then copy the address from your browser.' });
    }
  }

  async function openSetupChoice(id: string) {
    setBusyId(id); setActionError(null);
    try {
      const response = await fetch(`/api/admin/bookings/${id}`); const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load Setup choice.');
      setSetupChoiceBooking(data.booking);
    } catch (error) { setActionError({ id, message: (error as Error).message }); }
    finally { setBusyId(null); }
  }

  async function finishBasicRetouch(booking: Booking) {
    const photoSelect = window.open('about:blank', '_blank');
    const data = await runAction(booking.id, 'advance-stage');
    if (!data) { photoSelect?.close(); return; }
    const url = photoSelectCreateUrl(booking);
    if (photoSelect) photoSelect.location.href = url;
    else window.location.href = url;
  }

  function photoSelectCreateUrl(booking: Booking) {
    const selectionEnabled = !(booking.sessionTypeId === 'bundle' && (booking.bundleSessionNumber || 1) < 3);
    const params = new URLSearchParams({
      action: 'create',
      booking: booking.ref,
      client: booking.clientName,
      session: booking.sessionLabel,
      date: booking.date,
      selection: selectionEnabled ? '1' : '0',
    });
    return `http://127.0.0.1:8766/?${params.toString()}`;
  }

  async function generateInvoice(booking: Booking, sendEmail: boolean) {
    setInvoiceGenerating({ id: booking.id, sendEmail });
    try {
      const data = await runAction(booking.id, 'generate-invoice', { sendEmail });
      if (data?.payNowPayload) {
        const QRCode = (await import('qrcode')).default;
        const qrDataUrl = await QRCode.toDataURL(data.payNowPayload, { margin: 1, width: 320 });
        const imageDataUrl = await createInvoiceImage(booking, qrDataUrl, data.due);
        setInvoiceQr({ bookingId: booking.id, qrDataUrl, imageDataUrl, due: data.due, emailed: data.emailed });
      }
    } finally {
      setInvoiceGenerating(null);
    }
  }

  function renderBookingCard(b: Booking) {
        const isOpen = expandedId === b.id;
        const isBusy = busyId === b.id;
        const statusStyle = STATUS_LABEL[b.status] || { label: b.status, color: '#3A2E28', bg: '#EDE6DC' };
        const isPostProcessing = ['pending_balance', 'pending_basic_retouch', 'basic_retouch', 'further_retouch', 'completed'].includes(b.status);

        return (
          <div key={b.id} className={`booking-card${isOpen ? ' open' : ''}${filter === 'active' ? ((b.status === 'pending' || b.status === 'confirmed') ? ' pre-shoot-card' : ' post-shoot-card') : ''}`}>
            {/* Row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: '0 0 68%', minWidth: 0 }}>
                <div style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 16, lineHeight: 1.25, color: '#3A2E28' }}>{b.clientName}</div>
                {(b.status === 'pending_basic_retouch' || b.status === 'basic_retouch' || b.status === 'pending_balance') && <a href={photoSelectCreateUrl(b)} target="_blank" rel="noopener noreferrer" title="Create a Gallery in PhotoSelect Pro on your studio computer" style={{display:'inline-block',marginTop:8,padding:'8px 12px',background:'#657e76',color:'#fff',borderRadius:7,textDecoration:'none',fontSize:13,fontWeight:600}}>Open PhotoSelect Pro · Create Gallery</a>}
                {b.gallerySelections?.map(g => <div key={g.galleryId} style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,flexWrap:'wrap',marginTop:8,padding:'8px 10px',background:'#e3eee9',borderRadius:6,fontSize:13}}>
                  <span>{g.deliveredAt ? 'Further retouch finished' : g.locked ? 'Selection confirmed' : g.submitted ? 'Client selection received' : 'Awaiting client selection'}</span>
                  {g.clientUrl ? <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><a href={`/g/${g.galleryId.slice(0,12)}`} target="_blank" rel="noopener noreferrer" style={{color:'#415e58',fontWeight:700,whiteSpace:'nowrap'}}>Open Client Gallery</a><button type="button" onClick={()=>copyClientGalleryLink(b.id,g.galleryId)} style={{border:0,background:'transparent',padding:0,color:'#415e58',fontWeight:700,textDecoration:'underline',cursor:'pointer'}}>Copy WhatsApp Gallery Message</button></div> : <span style={{color:'#8b5b43'}}>Link this Gallery again in PhotoSelect Pro to enable the mobile client link.</span>}
                </div>)}
                {b.additionalOrders?.map(order=><div key={order.id} style={{marginTop:8,padding:'10px 12px',background:order.status==='paid'?'#e4eadf':'#fff0d8',borderRadius:7,fontSize:13}}><div style={{display:'flex',justifyContent:'space-between',gap:8,fontWeight:700}}><span>Additional Order · {order.status==='paid'?'Paid':'Payment pending'}</span><span>${order.total}</span></div><div style={{marginTop:5,color:'#6f6258'}}>{order.items.map(item=>`${item.name} ×${item.quantity}`).join(' · ')}</div><div style={{marginTop:4}}>Ref: {order.invoiceRef} · +{order.bonusRetouches} complimentary retouch{order.bonusRetouches===1?'':'es'}</div>{order.status!=='paid'&&<button className="btn btn-sm" style={{marginTop:8}} disabled={busyId===b.id} onClick={()=>runAction(b.id,'confirm-additional-order',{orderId:order.id})}>Payment received</button>}</div>)}
                <div style={{ fontSize: 13, color: '#9A8C7F', marginTop: 4, lineHeight: 1.35 }}>{b.sessionLabel}</div>
                <div style={{ fontWeight: 600, fontSize: 12.5, color: '#3A2E28', marginTop: 4, lineHeight: 1.35 }}>{fmtDatePretty(b.date)} · {fmtTime12(b.startTime)}</div>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, minWidth: 92 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, padding: '5px 10px', borderRadius: 999, background: statusStyle.bg, color: statusStyle.color, whiteSpace: 'nowrap' }}>
                  {statusStyle.label}
                </span>
                {isPostProcessing && b.balanceStatus !== 'n/a' && (
                  <span style={{ fontSize: 10.5, fontWeight: 700, padding: '4px 9px', borderRadius: 999, background: b.balanceStatus === 'paid' ? '#E4E9DD' : '#F4E4C1', color: b.balanceStatus === 'paid' ? '#4B5940' : '#7A5F2F', whiteSpace: 'nowrap' }}>
                    {b.balanceStatus !== 'paid' ? 'Balance pending' : 'Balance paid'}
                  </span>
                )}
                <button onClick={() => expandBooking(b.id)} className="booking-open-button">
                  {isOpen ? 'Close' : 'Open'}
                </button>
              </div>
            </div>

            {/* Expanded detail */}
            {isOpen && (
              <div className="booking-detail">
                {actionError?.id === b.id && <div className="notice warn" style={{ marginTop: 0, marginBottom: 12 }}>{actionError.message}</div>}

                <div className="ticket-row"><span>Reference</span><b style={{ fontFamily: 'monospace' }}>{b.ref}</b></div>
                <div className="ticket-row"><span>Location</span><b>{b.location === 'home' ? "Client's home" : 'Studio'}</b></div>
                <div className="ticket-row"><span>Email</span><b>{b.clientEmail}</b></div>
                <div className="ticket-row"><span>Phone</span><b>{b.clientPhone}</b></div>
                {b.address && <div className="ticket-row"><span>Address</span><b>{b.address}</b></div>}
                <div className="ticket-row"><span>Add-ons</span><b>{Object.entries(b.addOns).filter(([, q]) => q > 0).map(([id, q]) => `${ADDONS[id]?.name} ×${q}`).join(', ') || '—'}</b></div>
                {b.isWeekend && <div className="ticket-row"><span>Weekend surcharge</span><b>+$50</b></div>}
                {b.discountCode && <div className="ticket-row"><span>Discount</span><b>−${b.discountAmount} ({b.discountCode})</b></div>}
                <div className="ticket-row"><span>Notes</span><b style={{ whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>{b.notes || '—'}</b></div>

                {expandedPhotos.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginBottom: 6 }}>Reference photos ({expandedPhotos.length})</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {expandedPhotos.map((url) => (
                        <a key={url} href={url} target="_blank" rel="noopener" style={{ display: 'block', width: 64, height: 64, borderRadius: 8, overflow: 'hidden', border: '1.5px solid var(--line)' }}>
                          <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {b.status === 'confirmed' && (
                  <div style={{ marginTop: 8, fontSize: 12 }}>Reminders sent: {b.remindersSent?.length ? b.remindersSent.join(', ') : 'none yet'}</div>
                )}

                {/* Final bill panel */}
                {isPostProcessing && b.balanceStatus === 'pending' && (() => {
                  const addOnsRecord = (b.addOns || {}) as Record<string, number>;
                  const addOnsTotal = Object.entries(addOnsRecord).filter(([,q]) => q > 0).reduce((s, [id, q]) => s + (ADDONS[id]?.price || 0) * q, 0);
                  const weekendFee = b.isWeekend ? 50 : 0;
                  const isBundle = b.sessionTypeId === 'bundle';
                  const basePrice = isBundle
                    ? b.balanceDue - addOnsTotal - weekendFee  // session balance only (e.g. $330)
                    : b.total - addOnsTotal - weekendFee + b.discountAmount;
                  const baseLabel = isBundle
                    ? `Session ${b.bundleSessionNumber || 1} balance`
                    : 'Package price';
                  const extraTotal = b.extraLineItems.reduce((s, i) => s + i.amount, 0);
                  const totalDue = b.balanceDue + extraTotal;
                  return (
                  <div className="final-bill-panel">
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>Final bill</div>
                    <button className="btn btn-ghost" style={{ marginBottom: 10 }} disabled={isBusy} onClick={() => setEditAddOnsBooking(b)}>Edit Add-ons</button>
                    {b.invoiceStale && <div className="notice" style={{ marginBottom: 10 }}>Add-ons changed after invoice {b.invoiceRef}. Please generate and send a new invoice.</div>}

                    {/* Full breakdown */}
                    <div className="ticket-row"><span>{baseLabel}</span><b>${basePrice}</b></div>
                    {Object.entries(addOnsRecord).filter(([,q]) => q > 0).map(([id, q]) => (
                      <div className="ticket-row" key={id}><span>{ADDONS[id]?.name} ×{q}</span><b>+${(ADDONS[id]?.price || 0) * q}</b></div>
                    ))}
                    {weekendFee > 0 && <div className="ticket-row"><span>Weekend / PH surcharge</span><b>+${weekendFee}</b></div>}
                    {b.discountAmount > 0 && <div className="ticket-row" style={{ color: 'var(--sage)' }}><span>Discount ({b.discountCode})</span><b>−${b.discountAmount}</b></div>}

                    {/* Extra line items added post-session */}
                    {b.extraLineItems.length > 0 && (
                      <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px dashed var(--line)' }}>
                        <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginBottom: 4 }}>Additional charges</div>
                        {b.extraLineItems.map((item, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', borderBottom: '1px dashed var(--line)' }}>
                            <input
                              defaultValue={item.description}
                              onBlur={async (e) => {
                                if (e.target.value === item.description) return;
                                const updated = [...b.extraLineItems];
                                updated[i] = { ...item, description: e.target.value };
                                await runAction(b.id, 'extra-line-item', { replace: updated });
                              }}
                              style={{ flex: 1, border: '1.5px solid var(--line)', borderRadius: 6, padding: '4px 8px', fontSize: 12.5 }}
                            />
                            <input
                              defaultValue={item.amount}
                              type="number"
                              onBlur={async (e) => {
                                const val = Number(e.target.value);
                                if (val === item.amount) return;
                                const updated = [...b.extraLineItems];
                                updated[i] = { ...item, amount: val };
                                await runAction(b.id, 'extra-line-item', { replace: updated });
                              }}
                              style={{ width: 60, border: '1.5px solid var(--line)', borderRadius: 6, padding: '4px 8px', fontSize: 12.5 }}
                            />
                            <button
                              type="button"
                              onClick={async () => {
                                if (!confirm(`Delete "${item.description}"?`)) return;
                                const updated = b.extraLineItems.filter((_: unknown, j: number) => j !== i);
                                await runAction(b.id, 'extra-line-item', { replace: updated });
                              }}
                              style={{ width: 24, height: 24, borderRadius: 6, border: '1.5px solid var(--rust-pale)', background: 'var(--rust-pale)', color: 'var(--rust)', fontSize: 14, cursor: 'pointer' }}
                            >×</button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{ borderTop: '1.5px solid var(--ink)', margin: '8px 0 6px', paddingTop: 6 }}>
                      <div className="ticket-row"><span>Total</span><b>${(isBundle ? b.balanceDue : b.total) + extraTotal}</b></div>
                      {!isBundle && <div className="ticket-row"><span>Deposit paid</span><b>−${b.depositAmount}</b></div>}
                      <div className="ticket-total" style={{ marginTop: 6 }}>
                        <span style={{ fontWeight: 700 }}>Balance due</span>
                        <span className="amt">${totalDue}</span>
                      </div>
                    </div>

                    {/* Add extra line items */}
                    <div className="final-bill-add-charge">
                      <input placeholder="Description" value={lineDesc} onChange={(e) => setLineDesc(e.target.value)} style={{ flex: 1, border: '1.5px solid var(--line)', borderRadius: 8, padding: '7px 10px', fontSize: 12.5 }} />
                      <input placeholder="$" type="number" value={lineAmount} onChange={(e) => setLineAmount(e.target.value)} style={{ width: 70, border: '1.5px solid var(--line)', borderRadius: 8, padding: '7px 10px', fontSize: 12.5 }} />
                      <button className="btn btn-ghost" onClick={async () => {
                        if (!lineDesc || !lineAmount) return;
                        await runAction(b.id, 'extra-line-item', { description: lineDesc, amount: Number(lineAmount) });
                        setLineDesc(''); setLineAmount('');
                      }}>Add</button>
                    </div>
                    <div className="final-bill-actions">
                      <button className="btn btn-primary" disabled={isBusy || invoiceGenerating?.id === b.id} onClick={() => generateInvoice(b, true)}>
                        Send invoice by email
                      </button>
                      <button className="btn btn-ghost" disabled={isBusy || invoiceGenerating?.id === b.id} onClick={() => generateInvoice(b, false)} aria-live="polite">
                        {invoiceGenerating?.id === b.id && !invoiceGenerating.sendEmail
                          ? <span className="invoice-generating">Creating image <span className="loading-dots" aria-label="Please wait"><i></i><i></i><i></i></span></span>
                          : 'Create image for WhatsApp'}
                      </button>
                      <button className="btn btn-ghost" disabled={isBusy} onClick={() => {
                        if (confirm('Confirm that the balance payment has been received? A payment receipt will be emailed to the client.')) {
                          runAction(b.id, 'confirm-balance');
                        }
                      }}>
                        Payment Received
                      </button>
                    </div>
                    {invoiceQr?.bookingId === b.id && <div style={{ marginTop: 10 }}>
                      <div className="notice" style={{ marginTop: 0 }}>{invoiceQr.emailed ? `Invoice emailed to ${b.clientEmail}. The image below is ready to save.` : 'Invoice image ready. No email was sent.'}</div>
                      <img className="invoice-image-preview" src={invoiceQr.imageDataUrl} alt={`Invoice for ${b.clientName}`} />
                      <div className="invoice-image-actions">
                        <a className="btn btn-primary" href={invoiceQr.imageDataUrl} download={`Mamamiyo-Invoice-${b.ref}.png`}>Download invoice image</a>
                        <a className="btn btn-ghost" href={invoiceQr.qrDataUrl} download={`Mamamiyo-PayNow-QR-${b.ref}.png`}>Download QR code only</a>
                      </div>
                    </div>}
                  </div>
                  );
                })()}

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                  {(b.status === 'pending' || b.status === 'confirmed') && (
                    <button className="btn btn-ghost" disabled={isBusy} onClick={() => setEditBooking(b)}>Edit booking</button>
                  )}
                  {(b.status === 'pending' || b.status === 'confirmed') && (
                    <button className="btn btn-ghost" disabled={isBusy} onClick={() => openSetupChoice(b.id)}>
                      {/maternity/i.test(b.sessionLabel) ? 'Add / Edit Outfit choice' : 'Add / Edit Setup choice'}
                    </button>
                  )}
                  {b.status !== 'cancelled' && b.balanceStatus !== 'paid' && (
                    <button className="btn btn-ghost" disabled={isBusy} onClick={() => setEditAddOnsBooking(b)}>Edit Add-ons</button>
                  )}
                  {b.status === 'pending' && (
                    <button className="btn btn-primary" disabled={isBusy} onClick={() => runAction(b.id, 'confirm-deposit')}>Confirm deposit received</button>
                  )}
                  {b.status === 'confirmed' && (
                    <button className="btn btn-primary" disabled={isBusy} onClick={() => runAction(b.id, 'mark-completed')}>Mark session done</button>
                  )}
                  {b.status === 'confirmed' && (
                    <button className="btn btn-ghost" onClick={() => openSummary(b.id)}>Generate booking summary</button>
                  )}
                  {(b.status === 'pending_balance' || b.status === 'pending_basic_retouch') && (
                    <button className="btn btn-primary" disabled={isBusy} onClick={() => finishBasicRetouch(b)}>
                      {b.sessionTypeId === 'bundle' && (b.bundleSessionNumber || 1) < 3
                        ? 'Basic Retouch Done · Create Download Gallery'
                        : 'Basic Retouch Done · Create Gallery'}
                    </button>
                  )}
                  {b.status === 'basic_retouch' && (
                    <button className="btn btn-primary" disabled={isBusy} onClick={() => runAction(b.id, 'advance-stage')}>
                      Move to further retouch
                    </button>
                  )}
                  {b.status === 'further_retouch' && (
                    <button className="btn btn-primary" disabled={isBusy} onClick={() => runAction(b.id, 'advance-stage')}>
                      Mark photoshoot complete
                    </button>
                  )}
                  {b.status === 'basic_retouch' && (
                    <button className="btn btn-ghost" disabled={isBusy} onClick={() => {
                      if (confirm('Skip further retouch and mark this photoshoot complete?')) {
                        runAction(b.id, 'skip-further-retouch');
                      }
                    }}>
                      Skip further retouch &amp; complete
                    </button>
                  )}
                  {(b.status === 'pending_basic_retouch' || b.status === 'basic_retouch' || b.status === 'further_retouch' || b.status === 'completed') && (
                    <button className="btn btn-ghost" disabled={isBusy} onClick={() => runAction(b.id, 'revert-stage')}>
                      {b.status === 'completed'
                        ? 'Go back to further retouch'
                        : b.status === 'further_retouch'
                          ? 'Go back to client selection'
                          : b.status === 'basic_retouch'
                            ? 'Go back to pending basic retouch'
                            : 'Go back to booking confirmed'}
                    </button>
                  )}
                  {isPostProcessing && b.balanceStatus === 'paid' && (
                    <button className="btn btn-ghost" disabled={isBusy} onClick={() => {
                      if (confirm('Mark this balance as unpaid? The editing stage will stay the same and no customer message will be sent.')) {
                        runAction(b.id, 'reopen-balance');
                      }
                    }}>
                      Mark balance as unpaid
                    </button>
                  )}
                  {b.status !== 'cancelled' && (
                    <button className="btn btn-ghost" disabled={isBusy} onClick={() => { if (confirm('Cancel this booking?')) runAction(b.id, 'cancel'); }}>Cancel</button>
                  )}
                  <button className="btn btn-ghost" style={{ color: 'var(--rust)' }} disabled={isBusy} onClick={() => { if (confirm('Permanently DELETE this booking? Cannot be undone.')) runAction(b.id, 'delete'); }}>Delete</button>
                </div>
                {actionSuccess?.id === b.id && <div className="notice" style={{ marginTop: 10 }}>{actionSuccess.message}</div>}
              </div>
            )}
          </div>
        );
  }

  return (
    <div className="bookings-view">
      <div className="bookings-heading">
        <div>
          <div className="bookings-kicker">Booking management</div>
          <h2>Sessions</h2>
        </div>
        <div className="bookings-count">{loading ? '—' : bookings.length}</div>
      </div>
      {/* Status filter chips — single scrollable row, equal height, no wrap */}
      <div className="status-filter" aria-label="Filter bookings by status">
        {STATUS_TABS.map((t) => (
          <button key={t.key} onClick={() => setFilter(t.key)} className={`status-filter-button${filter === t.key ? ' active' : ''}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading && <div style={{ color: 'var(--ink-faint)', fontSize: 13 }}>Loading…</div>}
      {!loading && bookings.length === 0 && <div className="notice">No bookings in this category.</div>}

      {/* Column header */}
      {!loading && bookings.length > 0 && filter !== 'active' && (
        <div className="booking-column-head">
          <div style={{ flex: '0 0 68%' }}>Session</div>
          <div style={{ flex: 1, textAlign: 'right' }}>Status</div>
        </div>
      )}

      {filter === 'active' ? (
        <div className="booking-active-groups">
          <section className="booking-group">
            <div className="booking-group-heading pre-shoot-heading">
              <span>Before photoshoot</span>
              <b>{bookings.filter((booking) => booking.status === 'pending' || booking.status === 'confirmed').length}</b>
            </div>
            <div className="booking-list">
              {[...bookings]
                .filter((booking) => booking.status === 'pending' || booking.status === 'confirmed')
                .sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`))
                .map(renderBookingCard)}
            </div>
          </section>
          <section className="booking-group">
            <div className="booking-group-heading post-shoot-heading">
              <span>Photoshoot done · Post-processing</span>
              <b>{bookings.filter((booking) => ['pending_balance', 'pending_basic_retouch', 'basic_retouch', 'further_retouch', 'completed'].includes(booking.status)).length}</b>
            </div>
            <div className="booking-list">
              {[...bookings]
                .filter((booking) => ['pending_balance', 'pending_basic_retouch', 'basic_retouch', 'further_retouch', 'completed'].includes(booking.status))
                .sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`))
                .map(renderBookingCard)}
            </div>
          </section>
        </div>
      ) : (
        <div className="booking-list">
          {[...bookings]
            .sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`))
            .map(renderBookingCard)}
        </div>
      )}

      {summaryBooking && (
        <BookingSummaryModal booking={summaryBooking} onClose={() => setSummaryBooking(null)} />
      )}
      {editBooking && (
        <EditBookingModal
          booking={editBooking}
          onClose={() => setEditBooking(null)}
          onSaved={async () => {
            setEditBooking(null);
            await load();
          }}
        />
      )}
      {editAddOnsBooking && (
        <EditAddOnsModal
          booking={editAddOnsBooking}
          onClose={() => setEditAddOnsBooking(null)}
          onSaved={async (invoiceNeedsRegeneration) => {
            const id = editAddOnsBooking.id;
            setEditAddOnsBooking(null);
            setInvoiceQr((current) => current?.bookingId === id ? null : current);
            setActionSuccess({ id, message: invoiceNeedsRegeneration ? 'Changes saved. Please generate and send a new invoice.' : 'Changes saved.' });
            await load();
          }}
        />
      )}
      {setupChoiceBooking && (
        <SetupChoiceModal
          booking={setupChoiceBooking}
          onClose={() => setSetupChoiceBooking(null)}
          onSaved={async () => {
            const id = setupChoiceBooking.id;
            setSetupChoiceBooking(null);
            setActionSuccess({ id, message: 'Setup / Outfit choice saved.' });
            await load();
          }}
        />
      )}
    </div>
  );
}
