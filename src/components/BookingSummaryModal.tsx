'use client';

import { useEffect, useState } from 'react';
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
  setupChoiceNotes?: string;
  ref?: string;
};

function splitBookingNotes(notes: string) {
  let remaining = notes || '';
  const genderMatch = remaining.match(/Baby gender:\s*([^\n]+?)(?=\s+(?:Sibling joining:|Baby name(?:\s+is|:))|$)/i);
  const siblingMatch = remaining.match(/Sibling joining:\s*(yes|no)/i);
  if (genderMatch) remaining = remaining.replace(genderMatch[0], ' ');
  if (siblingMatch) remaining = remaining.replace(siblingMatch[0], ' ');
  const other = remaining.split(/\n+/).map(line => line.trim()).filter(Boolean).join(' · ').replace(/\s{2,}/g, ' ').trim();
  return {
    gender: genderMatch?.[1]?.trim() || '',
    sibling: siblingMatch?.[1] ? siblingMatch[1][0].toUpperCase() + siblingMatch[1].slice(1).toLowerCase() : '',
    other,
  };
}

export default function BookingSummaryModal({ booking, onClose }: { booking: SummaryBooking; onClose: () => void }) {
  const [imageDataUrl, setImageDataUrl] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const selectionLabel = /maternity/i.test(booking.sessionLabel) ? 'Outfit selections' : 'Setup selections';
  const noteParts = splitBookingNotes(booking.notes);

  useEffect(() => {
    let cancelled = false;
    async function buildSummary() {
    const entries = [
      ['Client', booking.clientName],
      ['Session', booking.sessionLabel],
      ['Date', fmtDatePretty(booking.date)],
      ['Time', fmtTime12(booking.startTime)],
      ['Location', booking.location === 'home' ? "Client's home" : 'Studio'],
      ['Email', booking.clientEmail],
      ['Phone', booking.clientPhone],
      ...(booking.address ? [['Address', booking.address]] : []),
      ...(noteParts.gender ? [["Baby's gender", noteParts.gender]] : []),
      ...(noteParts.sibling ? [['Sibling joining', noteParts.sibling]] : []),
      ...(noteParts.other ? [['Other notes', noteParts.other]] : []),
      ...(booking.setupChoiceNotes ? [[`${/maternity/i.test(booking.sessionLabel) ? 'Outfit' : 'Setup'} notes`, booking.setupChoiceNotes]] : []),
      [selectionLabel, String(booking.referencePhotoUrls.length)],
    ];
    const wrap = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
      const words = text.split(/\s+/); const lines: string[] = []; let line = '';
      words.forEach((word) => { const next = line ? `${line} ${word}` : word; if (ctx.measureText(next).width > maxWidth && line) { lines.push(line); line = word; } else line = next; });
      if (line) lines.push(line); return lines;
    };
    const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1800;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.font = '700 31px Arial';
    const preparedEntries = entries.map(([label, value]) => {
      const lines = wrap(ctx, value, 600);
      return { label, lines, height: Math.max(68, lines.length * 42 + 22) };
    });
    const photoRows = booking.referencePhotoUrls.length > 0
      ? Math.ceil(Math.min(6, booking.referencePhotoUrls.length) / 3)
      : 0;
    const contentHeight = 230 + 66
      + preparedEntries.reduce((total, entry) => total + entry.height, 0)
      + (photoRows ? 28 + photoRows * 338 : 0)
      + (booking.ref ? 72 : 24);
    const top = Math.max(54, Math.round((canvas.height - contentHeight) / 2));
    ctx.fillStyle = '#f5f0e8'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#2e2a22'; ctx.fillRect(54, top, 972, 230);
    ctx.textAlign = 'center'; ctx.fillStyle = '#c5a87c'; ctx.font = '700 30px Arial'; ctx.fillText('MAMAMIYO PHOTOGRAPHY', 540, top + 76);
    ctx.fillStyle = '#b08d57'; ctx.font = '58px Georgia'; ctx.fillText('Booking Summary', 540, top + 158);
    let y = top + 296;
    preparedEntries.forEach(({ label, lines, height }) => {
      const centre = y + height / 2;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#6b6152'; ctx.font = '29px Arial'; ctx.fillText(label, 100, centre);
      ctx.fillStyle = '#2e2a22'; ctx.font = '700 31px Arial';
      const firstLine = centre - ((lines.length - 1) * 42) / 2; lines.forEach((line, index) => ctx.fillText(line, 370, firstLine + index * 42));
      y += height; ctx.strokeStyle = '#e6decb'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(100, y); ctx.lineTo(980, y); ctx.stroke();
    });
    ctx.textBaseline = 'alphabetic';
    if (booking.referencePhotoUrls.length > 0) {
      // The table row immediately above already names the selection type and
      // shows its count, so the photo grid does not need a second heading.
      y += 28;
      const imageWidth = 270, imageHeight = 310, gap = 35;
      const loadImage = async (url: string) => {
        try {
          const response = await fetch(url); if (!response.ok) return null;
          const objectUrl = URL.createObjectURL(await response.blob());
          const image = new Image(); image.src = objectUrl;
          await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('Image failed to load')); });
          return { image, objectUrl };
        } catch { return null; }
      };
      const loaded = await Promise.all(booking.referencePhotoUrls.slice(0, 6).map(loadImage));
      loaded.forEach((loadedImage, index) => {
        const column = index % 3, row = Math.floor(index / 3); const x = 100 + column * (imageWidth + gap); const top = y + row * (imageHeight + 28);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(x, top, imageWidth, imageHeight);
        ctx.strokeStyle = '#ded4c9'; ctx.lineWidth = 2; ctx.strokeRect(x, top, imageWidth, imageHeight);
        if (loadedImage) {
          const scale = Math.min(imageWidth / loadedImage.image.naturalWidth, imageHeight / loadedImage.image.naturalHeight);
          const width = loadedImage.image.naturalWidth * scale, height = loadedImage.image.naturalHeight * scale;
          ctx.drawImage(loadedImage.image, x + (imageWidth - width) / 2, top + (imageHeight - height) / 2, width, height);
          URL.revokeObjectURL(loadedImage.objectUrl);
        } else {
          ctx.fillStyle = '#8b7d72'; ctx.font = '22px Arial'; ctx.textAlign = 'center'; ctx.fillText(`Selection ${index + 1}`, x + imageWidth / 2, top + imageHeight / 2);
        }
      });
      y += Math.ceil(Math.min(6, booking.referencePhotoUrls.length) / 3) * (imageHeight + 28);
    }
    if (booking.ref) { ctx.textAlign = 'center'; ctx.fillStyle = '#8c6d3f'; ctx.font = '23px Arial'; ctx.fillText(`Booking reference: ${booking.ref}`, 540, Math.min(canvas.height - 70, y + 45)); }
    if (!cancelled) setImageDataUrl(canvas.toDataURL('image/png'));
    }
    buildSummary();
    return () => { cancelled = true; };
  }, [booking, selectionLabel, noteParts.gender, noteParts.sibling, noteParts.other]);

  async function saveOrShare() {
    if (!imageDataUrl) return;
    setSaveMessage('Preparing image…');
    try {
      const blob = await (await fetch(imageDataUrl)).blob();
      const safeRef = (booking.ref || booking.clientName).replace(/[^A-Za-z0-9_-]+/g, '-');
      const filename = `Mamamiyo-Booking-${safeRef}.png`;
      const file = new File([blob], filename, { type: 'image/png' });
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ title: 'Mamamiyo Booking Summary', files: [file] });
        setSaveMessage('Choose Save Image, Save to Files, WhatsApp, or another app from the share menu.');
        return;
      }
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = objectUrl; link.download = filename; link.target = '_blank'; link.rel = 'noopener';
      document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
      setSaveMessage('The image was opened or downloaded. On iPhone, long-press it and choose Save to Photos.');
    } catch (error) {
      if ((error as Error).name !== 'AbortError') setSaveMessage('Could not open the save menu. Long-press the summary image above and choose Save to Photos.');
      else setSaveMessage('Save cancelled.');
    }
  }

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
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 16 }}>Booking Summary</div>
        {imageDataUrl && <>
          <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginBottom: 8 }}>Tap Save / Share below. You can save it to Photos or Files, or send it through WhatsApp.</div>
          <img className="invoice-image-preview" src={imageDataUrl} alt={`Booking summary for ${booking.clientName}`} />
          <button type="button" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 10 }} onClick={saveOrShare}>Save / Share booking summary</button>
          {saveMessage && <div role="status" style={{ fontSize: 12.5, color: 'var(--ink-soft)', lineHeight: 1.45, marginTop: 8 }}>{saveMessage}</div>}
        </>}
        <div style={{ fontWeight: 700, fontSize: 13, margin: '20px 0 8px' }}>Details</div>
        <div className="ticket-row"><span>Client</span><b>{booking.clientName}</b></div>
        <div className="ticket-row"><span>Session</span><b>{booking.sessionLabel}</b></div>
        <div className="ticket-row"><span>Date</span><b>{fmtDatePretty(booking.date)}</b></div>
        <div className="ticket-row"><span>Time</span><b>{fmtTime12(booking.startTime)}</b></div>
        <div className="ticket-row"><span>Location</span><b>{booking.location === 'home' ? "Client's home" : 'Studio'}</b></div>
        <div className="ticket-row"><span>Email</span><b>{booking.clientEmail}</b></div>
        <div className="ticket-row"><span>Phone</span><b>{booking.clientPhone}</b></div>
        {booking.address && <div className="ticket-row"><span>Address</span><b>{booking.address}</b></div>}
        {noteParts.gender && <div className="ticket-row" style={{ alignItems: 'center' }}><span>Baby&apos;s gender</span><b>{noteParts.gender}</b></div>}
        {noteParts.sibling && <div className="ticket-row" style={{ alignItems: 'center' }}><span>Sibling joining</span><b>{noteParts.sibling}</b></div>}
        {noteParts.other && <div className="ticket-row" style={{ alignItems: 'center' }}><span>Other notes</span><b style={{ overflowWrap: 'anywhere' }}>{noteParts.other}</b></div>}
        {booking.setupChoiceNotes && <div className="ticket-row" style={{ alignItems: 'center' }}><span>{/maternity/i.test(booking.sessionLabel) ? 'Outfit' : 'Setup'} notes</span><b style={{ overflowWrap: 'anywhere' }}>{booking.setupChoiceNotes}</b></div>}

        {booking.referencePhotoUrls.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginBottom: 6 }}>{selectionLabel} ({booking.referencePhotoUrls.length})</div>
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
