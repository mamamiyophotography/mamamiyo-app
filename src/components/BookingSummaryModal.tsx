'use client';

import { useEffect, useState } from 'react';
import { fmtDatePretty, fmtTime12 } from '@/lib/format';
import { prepLinkFor } from '@/lib/constants';
import QRCode from 'qrcode';

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
  setupSelectionCount?: number;
  notes: string;
  setupChoiceNotes?: string;
  ref?: string;
  sessionTypeId: string;
  bundleSessionNumber?: number | null;
};

type PreparationGuide = {
  title: string;
  intro: string;
  items: string[];
  url: string;
};

export function preparationGuideFor(booking: Pick<SummaryBooking, 'sessionTypeId' | 'sessionLabel' | 'bundleSessionNumber'>): PreparationGuide {
  const prep = prepLinkFor(booking);
  const type = booking.sessionTypeId === 'bundle'
    ? ((booking.bundleSessionNumber || 1) === 1 ? 'newborn' : 'baby')
    : booking.sessionTypeId;
  if (type === 'maternity') {
    return {
      title: 'Maternity Session',
      intro: 'A few simple preparations will help you feel comfortable and camera-ready.',
      items: [
        'Choose your preferred style and outfits before the session.',
        'Bring nude and black strapless underwear; heels are optional.',
        'Bring meaningful baby items, such as an ultrasound photo or tiny shoes.',
        'Partner and family outfits should be plain and colour-coordinated.',
      ],
      url: prep?.url || 'https://www.mamamiyo-photography.com/maternityprep',
    };
  }
  if (type === 'newborn' || type === 'fullmonth') {
    return {
      title: type === 'fullmonth' ? 'Full Month Baby Session' : 'Newborn Session',
      intro: 'Please bring these essentials so baby stays comfortable throughout the session.',
      items: [
        'Bring extra milk, diapers and a pacifier if baby uses one.',
        'Trim baby’s nails before the photoshoot.',
        'Bring meaningful keepsakes you would like photographed.',
        'Choose plain family outfits without busy prints.',
        'For siblings, bring a favourite snack or quiet toy.',
      ],
      url: prep?.url || 'https://www.mamamiyo-photography.com/newbornprep',
    };
  }
  return {
    title: booking.sessionTypeId === 'bundle'
      ? `Bundle Milestone ${booking.bundleSessionNumber || 1}`
      : 'Baby & Family Session',
    intro: 'A rested and comfortable baby makes the session smoother and more enjoyable.',
    items: [
      'Help baby rest or sleep well before the photoshoot.',
      'Bring milk, water and age-appropriate snacks.',
      'Bring favourite toys and anything that reliably makes baby smile.',
      'Choose plain or pastel family outfits without busy prints.',
      'Tell us about favourite games, songs or videos that get baby’s attention.',
    ],
    url: prep?.url || 'https://www.mamamiyo-photography.com/babyprep',
  };
}

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
  const [preparationImageDataUrl, setPreparationImageDataUrl] = useState('');
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
      [selectionLabel, String(booking.setupSelectionCount || 0)],
      ['Reference photos', String(booking.referencePhotoUrls.length)],
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

  useEffect(() => {
    let cancelled = false;
    async function buildPreparationImage() {
      const guide = preparationGuideFor(booking);
      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 1450;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const roundedRect = (x: number, y: number, width: number, height: number, radius: number) => {
        ctx.beginPath();
        ctx.roundRect(x, y, width, height, radius);
      };
      const wrap = (text: string, maxWidth: number) => {
        const words = text.split(/\s+/); const lines: string[] = []; let line = '';
        words.forEach((word) => { const next = line ? `${line} ${word}` : word; if (ctx.measureText(next).width > maxWidth && line) { lines.push(line); line = word; } else line = next; });
        if (line) lines.push(line); return lines;
      };

      ctx.fillStyle = '#f5f0e8'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#2e2a22'; roundedRect(54, 54, 972, 230, 34); ctx.fill();
      ctx.textAlign = 'center'; ctx.fillStyle = '#c5a87c'; ctx.font = '700 30px Arial'; ctx.fillText('MAMAMIYO PHOTOGRAPHY', 540, 130);
      ctx.fillStyle = '#b08d57'; ctx.font = '58px Georgia'; ctx.fillText('What to Prepare', 540, 216);

      ctx.fillStyle = '#6f8f84'; roundedRect(72, 324, 936, 142, 28); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.font = '700 39px Arial'; ctx.fillText(guide.title, 540, 382);
      ctx.font = '27px Arial';
      const introLines = wrap(guide.intro, 820);
      introLines.forEach((line, index) => ctx.fillText(line, 540, 425 + index * 32));

      let y = 520;
      ctx.textAlign = 'left';
      guide.items.forEach((item, index) => {
        ctx.fillStyle = index % 2 === 0 ? '#ead9d0' : '#e3dccb'; roundedRect(72, y, 936, 112, 24); ctx.fill();
        ctx.fillStyle = '#8c6d3f'; ctx.beginPath(); ctx.arc(126, y + 56, 24, 0, Math.PI * 2); ctx.fill();
        ctx.textAlign = 'center'; ctx.fillStyle = '#ffffff'; ctx.font = '700 25px Arial'; ctx.fillText(String(index + 1), 126, y + 65);
        ctx.textAlign = 'left'; ctx.fillStyle = '#2e2a22'; ctx.font = '29px Arial';
        const lines = wrap(item, 790); const first = y + 49 - ((lines.length - 1) * 34) / 2;
        lines.forEach((line, lineIndex) => ctx.fillText(line, 174, first + lineIndex * 34));
        y += 128;
      });

      const qrDataUrl = await QRCode.toDataURL(guide.url, { width: 190, margin: 1, color: { dark: '#2e2a22', light: '#ffffff' } });
      const qr = new Image(); qr.src = qrDataUrl;
      await new Promise<void>((resolve, reject) => { qr.onload = () => resolve(); qr.onerror = () => reject(new Error('QR code failed to load')); });
      const footerTop = Math.max(y + 12, 1170);
      ctx.fillStyle = '#ffffff'; roundedRect(72, footerTop, 936, 218, 28); ctx.fill();
      ctx.drawImage(qr, 100, footerTop + 14, 190, 190);
      ctx.textAlign = 'left'; ctx.fillStyle = '#8c6d3f'; ctx.font = '700 31px Arial'; ctx.fillText('View Full Preparation Guide', 326, footerTop + 70);
      ctx.fillStyle = '#6b6152'; ctx.font = '24px Arial';
      const urlLines = wrap(guide.url.replace(/^https?:\/\//, ''), 620);
      urlLines.forEach((line, index) => ctx.fillText(line, 326, footerTop + 113 + index * 30));
      ctx.fillStyle = '#8b7d72'; ctx.font = '22px Arial'; ctx.fillText('Scan the QR code or open the link above.', 326, footerTop + 174);
      if (!cancelled) setPreparationImageDataUrl(canvas.toDataURL('image/png'));
    }
    buildPreparationImage().catch(() => { if (!cancelled) setPreparationImageDataUrl(''); });
    return () => { cancelled = true; };
  }, [booking]);

  function imageFile(dataUrl: string, filename: string) {
    return fetch(dataUrl).then((response) => response.blob()).then((blob) => new File([blob], filename, { type: 'image/png' }));
  }

  async function shareOne(dataUrl: string, filename: string, title: string) {
    if (!dataUrl) return;
    setSaveMessage('Preparing image…');
    try {
      const file = await imageFile(dataUrl, filename);
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ title, files: [file] });
        setSaveMessage('Choose WhatsApp or another app from the share menu.');
        return;
      }
      const objectUrl = URL.createObjectURL(file);
      const link = document.createElement('a'); link.href = objectUrl; link.download = filename; link.target = '_blank'; link.rel = 'noopener';
      document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
      setSaveMessage('The image was opened or downloaded.');
    } catch (error) {
      setSaveMessage((error as Error).name === 'AbortError' ? 'Share cancelled.' : 'Could not open the share menu. Long-press the image and save it instead.');
    }
  }

  async function saveOrShare() {
    if (!imageDataUrl || !preparationImageDataUrl) return;
    setSaveMessage('Preparing images…');
    try {
      const safeRef = (booking.ref || booking.clientName).replace(/[^A-Za-z0-9_-]+/g, '-');
      const files = await Promise.all([
        imageFile(imageDataUrl, `Mamamiyo-Booking-${safeRef}.png`),
        imageFile(preparationImageDataUrl, `Mamamiyo-What-to-Prepare-${safeRef}.png`),
      ]);
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files }))) {
        await navigator.share({ title: 'Mamamiyo Booking Summary and What to Prepare', files });
        setSaveMessage('Choose WhatsApp or another app from the share menu.');
        return;
      }
      setSaveMessage('This device cannot share two images together. Please use the two separate Share buttons below.');
    } catch (error) {
      setSaveMessage((error as Error).name === 'AbortError' ? 'Share cancelled.' : 'Could not open the share menu. Please use the two separate Share buttons below.');
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
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 16 }}>Booking Summary + What to Prepare</div>
        {imageDataUrl && preparationImageDataUrl && <>
          <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginBottom: 8 }}>Share both images with the client through WhatsApp. If your device cannot share them together, use the separate buttons below.</div>
          <img className="invoice-image-preview" src={imageDataUrl} alt={`Booking summary for ${booking.clientName}`} />
          <div style={{ fontWeight: 700, fontSize: 14, margin: '16px 0 8px' }}>What to Prepare</div>
          <img className="invoice-image-preview" src={preparationImageDataUrl} alt={`What to prepare for ${booking.sessionLabel}`} />
          <button type="button" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }} onClick={saveOrShare}>Share Booking Summary + What to Prepare</button>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
            <button type="button" className="btn btn-ghost" style={{ justifyContent: 'center', whiteSpace: 'normal' }} onClick={() => shareOne(imageDataUrl, `Mamamiyo-Booking-${(booking.ref || booking.clientName).replace(/[^A-Za-z0-9_-]+/g, '-')}.png`, 'Mamamiyo Booking Summary')}>Share Booking Summary</button>
            <button type="button" className="btn btn-ghost" style={{ justifyContent: 'center', whiteSpace: 'normal' }} onClick={() => shareOne(preparationImageDataUrl, `Mamamiyo-What-to-Prepare-${(booking.ref || booking.clientName).replace(/[^A-Za-z0-9_-]+/g, '-')}.png`, 'Mamamiyo What to Prepare')}>Share What to Prepare</button>
          </div>
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
        <div className="ticket-row" style={{ alignItems: 'center' }}><span>{selectionLabel}</span><b>{booking.setupSelectionCount || 0}</b></div>

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
