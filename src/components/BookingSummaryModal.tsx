'use client';

import { useEffect, useState } from 'react';
import { fmtDatePretty, fmtTime12 } from '@/lib/format';
import { prepLinkFor } from '@/lib/constants';

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
  inspirationReferencePhotoUrls?: string[];
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

export function preparationGuideFor(booking: Pick<SummaryBooking, 'sessionTypeId' | 'sessionLabel' | 'bundleSessionNumber'>, hasSibling = false): PreparationGuide {
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
        ...(hasSibling ? ['If a sibling is joining, bring their favourite snacks to help them feel settled and cooperate.'] : []),
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
        ...(hasSibling ? ['If a sibling is joining, bring their favourite snacks or a quiet toy to help them feel settled and cooperate.'] : []),
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
      'Bring milk, water and your child’s favourite age-appropriate snacks to help them feel settled and cooperate.',
      'Bring favourite toys and anything that reliably makes baby smile.',
      'Choose plain or pastel family outfits without busy prints.',
      'Tell us about favourite games, songs or videos that get baby’s attention.',
    ],
    url: prep?.url || 'https://www.mamamiyo-photography.com/babyprep',
  };
}

function splitBookingNotes(notes: string) {
  let remaining = notes || '';
  const genderMatch = remaining.match(/Baby gender:\s*([^\n·]+)/i);
  const siblingMatch = remaining.match(/Sibling joining:\s*(yes|no)/i);
  const siblingCountMatch = remaining.match(/Number of siblings:\s*(\d+)/i);
  if (genderMatch) remaining = remaining.replace(genderMatch[0], ' ');
  if (siblingMatch) remaining = remaining.replace(siblingMatch[0], ' ');
  if (siblingCountMatch) remaining = remaining.replace(siblingCountMatch[0], ' ');
  const other = remaining.split(/\n+|·/).map(line => line.trim()).filter(Boolean).join(' · ').replace(/\s{2,}/g, ' ').trim();
  return {
    gender: genderMatch?.[1]?.trim() || '',
    sibling: siblingMatch?.[1] ? siblingMatch[1][0].toUpperCase() + siblingMatch[1].slice(1).toLowerCase() : '',
    siblingCount: siblingCountMatch?.[1] || '',
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
        ...(noteParts.gender ? [['Baby gender', noteParts.gender]] : []),
        ...(noteParts.sibling ? [['Sibling joining', noteParts.sibling]] : []),
        ...(noteParts.siblingCount ? [['Number of siblings', noteParts.siblingCount]] : []),
        ...(noteParts.other ? [['Notes', noteParts.other]] : []),
        [selectionLabel, String(booking.setupSelectionCount || 0)],
      ];
      const wrap = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
        const words = text.split(/\s+/); const lines: string[] = []; let line = '';
        words.forEach((word) => { const next = line ? `${line} ${word}` : word; if (ctx.measureText(next).width > maxWidth && line) { lines.push(line); line = word; } else line = next; });
        if (line) lines.push(line); return lines;
      };
      const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1500;
      let ctx = canvas.getContext('2d'); if (!ctx) return;
      ctx.font = '700 27px Arial';
      const preparedEntries = entries.map(([label, value]) => {
        const lines = wrap(ctx!, value, 520);
        return { label, lines, height: Math.max(52, lines.length * 34 + 16) };
      });
      const additionalLines = booking.setupChoiceNotes ? wrap(ctx, booking.setupChoiceNotes, 520) : [];
      const additionalHeight = additionalLines.length ? Math.max(52, additionalLines.length * 34 + 16) : 0;
      const setupPhotos = booking.referencePhotoUrls.slice(0, 3);
      const inspirationPhotos = (booking.inspirationReferencePhotoUrls || []).slice(0, 3);
      const photoBlockHeight = (photos: string[]) => 52 + (photos.length ? 218 : 0);
      const contentHeight = 210 + 28 + preparedEntries.reduce((sum, entry) => sum + entry.height, 0)
        + photoBlockHeight(setupPhotos) + photoBlockHeight(inspirationPhotos) + additionalHeight + 82;
      canvas.height = Math.max(1350, contentHeight + 56);
      ctx = canvas.getContext('2d'); if (!ctx) return;

      ctx.fillStyle = '#f5f0e8'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#8c6d3f'; ctx.lineWidth = 8; ctx.strokeRect(28, 28, canvas.width - 56, canvas.height - 56);
      ctx.fillStyle = '#2e2a22'; ctx.fillRect(54, 54, 972, 180);
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#c5a87c'; ctx.font = '700 28px Arial'; ctx.fillText('MAMAMIYO PHOTOGRAPHY', 540, 112);
      ctx.fillStyle = '#ffffff'; ctx.font = '700 62px Georgia'; ctx.fillText('Booking Summary', 540, 190);
      let y = 262;

      const drawRow = (label: string, lines: string[], height: number) => {
        const centre = y + height / 2;
        ctx!.textAlign = 'left'; ctx!.textBaseline = 'middle'; ctx!.fillStyle = '#6b6152'; ctx!.font = '26px Arial'; ctx!.fillText(label, 82, centre);
        ctx!.fillStyle = '#2e2a22'; ctx!.font = '700 27px Arial';
        const firstLine = centre - ((lines.length - 1) * 34) / 2;
        lines.forEach((line, index) => ctx!.fillText(line, 470, firstLine + index * 34));
        y += height; ctx!.strokeStyle = '#e0d7c9'; ctx!.lineWidth = 2; ctx!.beginPath(); ctx!.moveTo(82, y); ctx!.lineTo(998, y); ctx!.stroke();
      };
      preparedEntries.forEach((entry) => drawRow(entry.label, entry.lines, entry.height));

      const loadImage = async (url: string) => {
        try {
          const response = await fetch(url); if (!response.ok) return null;
          const objectUrl = URL.createObjectURL(await response.blob()); const image = new Image(); image.src = objectUrl;
          await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('Image failed to load')); });
          return { image, objectUrl };
        } catch { return null; }
      };
      const drawPhotoBlock = async (label: string, photos: string[]) => {
        drawRow(label, [String(photos.length)], 52);
        if (!photos.length) return;
        const loaded = await Promise.all(photos.map(loadImage)); const imageWidth = 270, imageHeight = 190, gap = 35;
        loaded.forEach((loadedImage, index) => {
          const x = 82 + index * (imageWidth + gap); const imageTop = y + 14;
          ctx!.fillStyle = '#ffffff'; ctx!.fillRect(x, imageTop, imageWidth, imageHeight);
          ctx!.strokeStyle = '#ded4c9'; ctx!.lineWidth = 2; ctx!.strokeRect(x, imageTop, imageWidth, imageHeight);
          if (loadedImage) {
            const scale = Math.min(imageWidth / loadedImage.image.naturalWidth, imageHeight / loadedImage.image.naturalHeight);
            const width = loadedImage.image.naturalWidth * scale, height = loadedImage.image.naturalHeight * scale;
            ctx!.drawImage(loadedImage.image, x + (imageWidth - width) / 2, imageTop + (imageHeight - height) / 2, width, height);
            URL.revokeObjectURL(loadedImage.objectUrl);
          }
        });
        y += 218;
      };
      await drawPhotoBlock('Setup Selection Photos', setupPhotos);
      await drawPhotoBlock('Inspirational Reference Photos', inspirationPhotos);
      if (additionalLines.length) drawRow('Additional notes', additionalLines, additionalHeight);
      if (booking.ref) { ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#8c6d3f'; ctx.font = '23px Arial'; ctx.fillText(`Booking reference: ${booking.ref}`, 540, canvas.height - 58); }
      if (!cancelled) setImageDataUrl(canvas.toDataURL('image/png'));
    }
    buildSummary();
    return () => { cancelled = true; };
  }, [booking, selectionLabel, noteParts.gender, noteParts.sibling, noteParts.siblingCount, noteParts.other]);

  useEffect(() => {
    let cancelled = false;
    async function buildPreparationImage() {
      const guide = preparationGuideFor(booking, noteParts.sibling === 'Yes');
      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 1450;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const roundedRect = (x: number, y: number, width: number, height: number, radius: number) => {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y); ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius); ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height); ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius); ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
      };
      const wrap = (text: string, maxWidth: number) => {
        const words = text.split(/\s+/); const lines: string[] = []; let line = '';
        words.forEach((word) => { const next = line ? `${line} ${word}` : word; if (ctx.measureText(next).width > maxWidth && line) { lines.push(line); line = word; } else line = next; });
        if (line) lines.push(line); return lines;
      };

      const contentHeight = 230 + 40 + 142 + 54 + guide.items.length * 128;
      const top = Math.max(54, Math.round((canvas.height - contentHeight) / 2));
      ctx.fillStyle = '#f5f0e8'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#2e2a22'; roundedRect(54, top, 972, 230, 34); ctx.fill();
      ctx.textAlign = 'center'; ctx.fillStyle = '#c5a87c'; ctx.font = '700 30px Arial'; ctx.fillText('MAMAMIYO PHOTOGRAPHY', 540, top + 76);
      ctx.fillStyle = '#b08d57'; ctx.font = '58px Georgia'; ctx.fillText('What to Prepare', 540, top + 162);

      const sessionTop = top + 270;
      ctx.fillStyle = '#6f8f84'; roundedRect(72, sessionTop, 936, 142, 28); ctx.fill();
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff'; ctx.font = '700 39px Arial'; ctx.fillText(guide.title, 540, sessionTop + 43);
      ctx.font = '27px Arial';
      const introLines = wrap(guide.intro, 820);
      const introCentre = sessionTop + 99;
      const introFirst = introCentre - ((introLines.length - 1) * 30) / 2;
      introLines.forEach((line, index) => ctx.fillText(line, 540, introFirst + index * 30));

      let y = sessionTop + 196;
      ctx.textAlign = 'left';
      guide.items.forEach((item, index) => {
        ctx.fillStyle = index % 2 === 0 ? '#ead9d0' : '#e3dccb'; roundedRect(72, y, 936, 112, 24); ctx.fill();
        ctx.fillStyle = '#8c6d3f'; ctx.beginPath(); ctx.arc(126, y + 56, 24, 0, Math.PI * 2); ctx.fill();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#ffffff'; ctx.font = '700 25px Arial'; ctx.fillText(String(index + 1), 126, y + 56);
        ctx.textAlign = 'left'; ctx.fillStyle = '#2e2a22'; ctx.font = '29px Arial';
        const lines = wrap(item, 790); const first = y + 56 - ((lines.length - 1) * 34) / 2;
        lines.forEach((line, lineIndex) => ctx.fillText(line, 174, first + lineIndex * 34));
        y += 128;
      });

      if (!cancelled) setPreparationImageDataUrl(canvas.toDataURL('image/png'));
    }
    buildPreparationImage().catch(() => { if (!cancelled) setPreparationImageDataUrl(''); });
    return () => { cancelled = true; };
  }, [booking, noteParts.sibling]);

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
        {imageDataUrl && <>
          <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginBottom: 8 }}>Share both images with the client through WhatsApp. If your device cannot share them together, use the separate buttons below.</div>
          <img className="invoice-image-preview" src={imageDataUrl} alt={`Booking summary for ${booking.clientName}`} />
          <div style={{ fontWeight: 700, fontSize: 14, margin: '16px 0 8px' }}>What to Prepare</div>
          {preparationImageDataUrl
            ? <img className="invoice-image-preview" src={preparationImageDataUrl} alt={`What to prepare for ${booking.sessionLabel}`} />
            : <div className="notice" role="status" style={{ marginTop: 0 }}>Preparing the session checklist…</div>}
          <button type="button" className="btn btn-primary" disabled={!preparationImageDataUrl} style={{ width: '100%', justifyContent: 'center', marginTop: 12 }} onClick={saveOrShare}>Share Booking Summary + What to Prepare</button>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
            <button type="button" className="btn btn-ghost" style={{ justifyContent: 'center', whiteSpace: 'normal' }} onClick={() => shareOne(imageDataUrl, `Mamamiyo-Booking-${(booking.ref || booking.clientName).replace(/[^A-Za-z0-9_-]+/g, '-')}.png`, 'Mamamiyo Booking Summary')}>Share Booking Summary</button>
            <button type="button" className="btn btn-ghost" disabled={!preparationImageDataUrl} style={{ justifyContent: 'center', whiteSpace: 'normal' }} onClick={() => shareOne(preparationImageDataUrl, `Mamamiyo-What-to-Prepare-${(booking.ref || booking.clientName).replace(/[^A-Za-z0-9_-]+/g, '-')}.png`, 'Mamamiyo What to Prepare')}>Share What to Prepare</button>
          </div>
          {saveMessage && <div role="status" style={{ fontSize: 12.5, color: 'var(--ink-soft)', lineHeight: 1.45, marginTop: 8 }}>{saveMessage}</div>}
        </>}
        <button className="btn btn-ghost" style={{ marginTop: 16, width: '100%' }} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
