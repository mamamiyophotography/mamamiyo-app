'use client';

import { useEffect, useState, useCallback } from 'react';
import { fmtDatePretty, fmtTime12 } from '@/lib/format';
import { ADDONS, STATUS_LABELS } from '@/lib/constants';
import BookingSummaryModal from '@/components/BookingSummaryModal';
import EditBookingModal from '@/components/EditBookingModal';
import ManageGalleryModal from '@/components/ManageGalleryModal';
import { photoSharingConsentLabel } from '@/lib/photoConsent';
import { codexPhotoSelectionUrl } from '@/lib/codexPhotoSelection';

type Booking = {
  downloadFeedback?: {galleryId:string;downloadType:'basic'|'further'|'all';downloadedAt:string}[];
  basicRetouchProgress?: Record<string, boolean>;
  furtherRetouchProgress?: Record<string, boolean>;
  additionalOrders?: {id:string;galleryId:string;version:number;items:{name:string;quantity:number;amount:number;bonusRetouches:number}[];total:number;bonusRetouches:number;status:string;invoiceRef:string;createdAt:string;paidAt:string|null}[];
  gallerySelections?: {galleryId:string;clientUrl:string|null;version:number;submitted:boolean;locked:boolean;deliveredAt:string|null;emailSentAt:string|null}[];
  id: string; ref: string; sessionTypeId: string; sessionLabel: string; location: string;
  date: string; startTime: string; endTime: string; isWeekend: boolean; addOns: Record<string, number>;
  notes: string; setupChoiceNotes: string; address: string; discountCode: string | null; discountAmount: number;
  clientName: string; clientEmail: string; clientPhone: string;
  photoSharingConsent?: string;
  subtotal: number; total: number; depositAmount: number; balanceDue: number;
  extraLineItems: { description: string; amount: number }[]; invoiceRef: string | null;
  invoiceStale: boolean; version: number;
  status: string; depositStatus: string; balanceStatus: string;
  referencePhotoUrls: string[]; remindersSent: string[]; bundleSessionNumber: number | null;
  setupSelectionCount?: number; setupSelections?: {slot:number;referencePhotoUrls:string[];note?:string;outfitSource?:'mamamiyo'|'own'|null}[]; inspirationReferencePhotoUrls?:string[];
};

const STATUS_TABS = [
  { key: 'active', label: 'Active' },
  { key: 'pending', label: '1. Pending deposit' },
  { key: 'confirmed', label: '2. Booking confirmed' },
  { key: 'pending_balance', label: '3. Pending balance payment' },
  { key: 'basic_retouch', label: '4. Basic retouch' },
  { key: 'further_retouch', label: '5. Further retouch' },
  { key: 'order_product', label: '6. Order product' },
  { key: 'soft_copy_delivered', label: '7. Delivery' },
  { key: 'completed', label: '8. Photoshoot complete' },
  { key: 'cancelled', label: 'Cancelled' },
];

const STATUS_LABEL = STATUS_LABELS;

export default function AdminBookingsPage() {
  const [filter, setFilter] = useState('active');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedPhotos, setExpandedPhotos] = useState<string[]>([]);
  const [expandedSetups, setExpandedSetups] = useState<{slot:number;referencePhotoUrls:string[];note?:string}[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [lineDesc, setLineDesc] = useState('');
  const [lineAmount, setLineAmount] = useState('');
  const [discountInputs, setDiscountInputs] = useState<Record<string, string>>({});
  const [invoiceQr, setInvoiceQr] = useState<{ bookingId: string; qrDataUrl: string | null; imageDataUrl: string; due: number; emailed: boolean } | null>(null);
  const [actionError, setActionError] = useState<{ id: string; message: string } | null>(null);
  const [summaryBooking, setSummaryBooking] = useState<Booking | null>(null);
  const [editBooking, setEditBooking] = useState<Booking | null>(null);
  const [actionSuccess, setActionSuccess] = useState<{ id: string; message: string } | null>(null);
  const [invoiceGenerating, setInvoiceGenerating] = useState<{ id: string; sendEmail: boolean } | null>(null);
  const [manageGallery,setManageGallery]=useState<{bookingId:string;galleryId:string}|null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const url = filter === 'active'
      ? `/api/admin/bookings?active=1`
      : filter === 'basic_retouch'
        ? `/api/admin/bookings?statuses=pending_basic_retouch,basic_retouch`
        : `/api/admin/bookings?status=${filter}`;
    const res = await fetch(url);
    const data = await res.json();
    setBookings(data.bookings || []);
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  function showCodexPhotoSelectionLaunch(booking: Booking) {
    setActionSuccess({ id: booking.id, message: 'Codex 会打开新的选片聊天并带入客户资料。按“发送”开始宽松初选，完成后人工复核。' });
  }

  async function expandBooking(id: string) {
    if (expandedId === id) { setExpandedId(null); setExpandedPhotos([]); setExpandedSetups([]); return; }
    setExpandedId(id);
    setExpandedPhotos([]);
    const res = await fetch(`/api/admin/bookings/${id}`);
    const data = await res.json();
    setExpandedPhotos(data.booking?.referencePhotoUrls || []);
    setExpandedSetups(data.booking?.setupSelections || []);
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
    const res = await fetch(`/api/admin/bookings/${id}?t=${Date.now()}`, { cache: 'no-store' });
    const data = await res.json();
    if (data?.booking) setSummaryBooking(data.booking);
  }

  async function createInvoiceImage(booking: Booking, qrDataUrl: string | null, due: number) {
    const rows: { label: string; amount: string }[] = [];
    const addOnsTotal = Object.entries(booking.addOns || {}).filter(([, q]) => q > 0).reduce((sum, [id, q]) => sum + (ADDONS[id]?.price || 0) * q, 0);
    const weekendFee = booking.isWeekend ? 50 : 0;
    const basePrice = booking.total - addOnsTotal - weekendFee + booking.discountAmount;
    rows.push({ label: booking.sessionTypeId === 'bundle' ? `Session ${booking.bundleSessionNumber || 1} balance` : 'Package price', amount: `$${basePrice}` });
    Object.entries(booking.addOns || {}).filter(([, q]) => q > 0).forEach(([id, q]) => rows.push({ label: `${ADDONS[id]?.name || id} ×${q}`, amount: `+$${(ADDONS[id]?.price || 0) * q}` }));
    if (weekendFee) rows.push({ label: 'Weekend / PH surcharge', amount: `+$${weekendFee}` });
    if (booking.discountAmount) rows.push({ label: `Discount (${booking.discountCode || ''})`, amount: `−$${booking.discountAmount}` });
    booking.extraLineItems.forEach((item) => rows.push({ label: item.description, amount: item.amount < 0 ? `−$${Math.abs(item.amount)}` : `+$${item.amount}` }));
    const extraTotal = booking.extraLineItems.reduce((sum, item) => sum + item.amount, 0);
    const invoiceTotal = booking.total + extraTotal;
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
    const qrY = y + 90;
    if (qrDataUrl) {
      const qr = new Image(); qr.src = qrDataUrl; await new Promise<void>((resolve, reject) => { qr.onload = () => resolve(); qr.onerror = () => reject(new Error('Unable to render QR code.')); });
      ctx.drawImage(qr, 390, qrY, 300, 300);
      ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'center'; ctx.fillStyle = '#6b6152'; ctx.font = '24px Arial'; ctx.fillText('Scan with your banking app to pay', 540, qrY + 345);
    } else {
      ctx.textBaseline = 'middle'; ctx.textAlign = 'center'; ctx.fillStyle = '#f1e9dc'; roundedInvoiceBox(ctx, 250, qrY + 38, 580, 150, 22); ctx.fill();
      ctx.fillStyle = '#6b6152'; ctx.font = '700 30px Arial'; ctx.fillText(due === 0 ? 'No payment due' : 'PayNow QR unavailable', 540, qrY + 113);
    }
    return canvas.toDataURL('image/png');
  }

  function safeFolderPart(value: string) {
    return value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/g, '');
  }

  function jobFolderSessionName(booking: Booking) {
    if (booking.sessionTypeId === 'newborn') return 'Newborn';
    if (booking.sessionTypeId === 'fullmonth') return 'Full Month';
    if (booking.sessionTypeId === 'baby') return 'Baby Family';
    if (booking.sessionTypeId === 'maternity') return 'Maternity';
    if (booking.sessionTypeId === 'bundle') return `Baby Bundle ${booking.bundleSessionNumber || 1}`;
    return booking.sessionLabel.replace(/\s*Photoshoot\s*/i, ' ').trim();
  }

  function jobFolderName(booking: Booking) {
    const consentSuffix = booking.photoSharingConsent === 'all'
      ? 'SOCIAL APPROVED'
      : booking.photoSharingConsent === 'children_only'
        ? 'CHILDREN ONLY FOR SOCIAL'
        : booking.photoSharingConsent === 'private'
          ? 'PRIVATE — DO NOT POST'
          : 'SHARING PERMISSION NOT SELECTED';
    const compactDate = booking.date.replace(/-/g, '');
    const baseName = `${compactDate} ${booking.clientName} ${jobFolderSessionName(booking)}`;
    return safeFolderPart(consentSuffix ? `${baseName} — ${consentSuffix}` : baseName);
  }

  type PersistedDirectoryHandle = FileSystemDirectoryHandle & {
    queryPermission?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
    requestPermission?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
  };

  function savedDropboxRoot(action: 'get' | 'set', handle?: PersistedDirectoryHandle): Promise<PersistedDirectoryHandle | null> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('mamamiyo-booking-folders', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('handles');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction('handles', action === 'get' ? 'readonly' : 'readwrite');
        const store = transaction.objectStore('handles');
        const operation = action === 'get' ? store.get('dropbox-customer-photos') : store.put(handle, 'dropbox-customer-photos');
        operation.onsuccess = () => resolve(action === 'get' ? (operation.result || null) : (handle || null));
        operation.onerror = () => reject(operation.error);
        transaction.oncomplete = () => db.close();
      };
    });
  }

  async function getDropboxRoot(): Promise<PersistedDirectoryHandle | null> {
    let root = await savedDropboxRoot('get').catch(() => null);
    if (root) {
      const permission = await root.queryPermission?.({ mode: 'readwrite' });
      if (permission === 'granted' || await root.requestPermission?.({ mode: 'readwrite' }) === 'granted') return root;
    }
    const picker = (window as Window & {
      showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite'; id?: string; startIn?: 'documents' }) => Promise<PersistedDirectoryHandle>;
    }).showDirectoryPicker;
    if (!picker) return null;
    root = await picker({ mode: 'readwrite', id: 'mamamiyo-customer-photos', startIn: 'documents' });
    await savedDropboxRoot('set', root);
    return root;
  }

  async function createLocalJobFolder(booking: Booking) {
    if (!(window as Window & { showDirectoryPicker?: unknown }).showDirectoryPicker) {
      setActionError({ id: booking.id, message: 'Local folder creation requires Chrome or Edge on a desktop computer.' });
      return false;
    }
    try {
      const root = await getDropboxRoot();
      if (!root) throw new Error('Dropbox Customer Photos folder access is unavailable.');
      const folderName = jobFolderName(booking);
      const jobFolder = await root.getDirectoryHandle(folderName, { create: true });
      const socialFolder = booking.photoSharingConsent === 'all'
        ? '04 SOCIAL CANDIDATES'
        : booking.photoSharingConsent === 'children_only'
          ? '04 SOCIAL CANDIDATES — CHILDREN ONLY'
          : booking.photoSharingConsent === 'private'
            ? '04 DO NOT USE FOR SOCIAL MEDIA'
            : '04 SHARING PERMISSION NOT SELECTED';
      for (const name of ['01 BASIC EDIT', '02 CLEANED FOR GALLERY', '03 FURTHER RETOUCH', socialFolder, '05 CLIENT DELIVERY']) {
        await jobFolder.getDirectoryHandle(name, { create: true });
      }
      return true;
    } catch (error) {
      if ((error as DOMException).name !== 'AbortError') {
        setActionError({ id: booking.id, message: `Could not create the local job folder: ${(error as Error).message}` });
      }
      return false;
    }
  }

  function roundedInvoiceBox(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
    ctx.beginPath(); ctx.roundRect(x, y, width, height, radius);
  }

  function shortGalleryUrl(galleryId: string) {
    return `${window.location.origin}/g/${galleryId.slice(0,12)}?preview=2`;
  }

  async function shareClientGallery(bookingId: string, galleryId: string, kind: 'basic'|'further') {
    const galleryUrl = shortGalleryUrl(galleryId);
    try {
      const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 630;
      const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Could not create the Gallery image.');
      const roundedRect = (x:number,y:number,w:number,h:number,r:number) => {ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();};
      const gradient=ctx.createLinearGradient(0,0,1200,630);gradient.addColorStop(0,'#f7ded9');gradient.addColorStop(.34,'#f8e8bf');gradient.addColorStop(.68,'#d7ead8');gradient.addColorStop(1,'#d9d8f1');ctx.fillStyle=gradient;ctx.fillRect(0,0,1200,630);
      ctx.fillStyle='#fbfaf6';roundedRect(52,52,1096,526,38);ctx.fill();ctx.strokeStyle='#66877d';ctx.lineWidth=4;ctx.stroke();
      ctx.textAlign='center';ctx.fillStyle='#6d857b';ctx.font='700 30px Arial';ctx.fillText('MAMAMIYO PHOTOGRAPHY',600,150);
      ctx.fillStyle='#3a2e28';
      if(kind==='basic'){
        ctx.font='700 62px Georgia';ctx.fillText('Your Photos Are Ready',600,292);
        ctx.font='700 46px Georgia';ctx.fillText('View Your Photos with Basic Retouch',600,398);
      }else{
        ctx.font='700 47px Georgia';ctx.fillText('View Your Photos with Further Retouch',600,298);
        ctx.fillStyle='#6d857b';ctx.font='700 40px Arial';ctx.fillText('Download All the Photos',600,408);
      }
      ctx.fillStyle='#8c6d3f';ctx.font='24px Arial';ctx.fillText('Open your private Gallery to view and download',600,518);
      const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('Could not create the Gallery image.')),'image/png'));
      const file=new File([blob],`Mamamiyo-${kind==='basic'?'Basic':'Further'}-Retouch-${galleryId.slice(0,12)}.png`,{type:'image/png'});
      const shareText=galleryUrl;
      if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){
        await navigator.share({title:`MamaMiyo ${kind==='basic'?'Basic':'Further'} Retouch Gallery`,text:shareText,files:[file]});
        setActionSuccess({id:bookingId,message:`Choose WhatsApp and send the ${kind==='basic'?'Basic':'Further'} Retouch image to the client.`});return;
      }
      const objectUrl=URL.createObjectURL(file);const link=document.createElement('a');link.href=objectUrl;link.download=file.name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(objectUrl),30000);
      await navigator.clipboard.writeText(shareText);
      setActionSuccess({id:bookingId,message:`${kind==='basic'?'Basic':'Further'} Retouch image downloaded and Gallery link copied. Attach the image first, then paste the link below it.`});
    } catch (error) {
      if((error as Error).name==='AbortError'){setActionSuccess({id:bookingId,message:'Sharing cancelled.'});return;}
      setActionError({ id: bookingId, message: 'Could not open the share menu. Open Client Gallery, then copy the address from your browser.' });
    }
  }

  async function openEditBooking(id: string) {
    setBusyId(id); setActionError(null);
    try {
      const response = await fetch(`/api/admin/bookings/${id}`); const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load booking information.');
      setEditBooking(data.booking);
    } catch (error) { setActionError({ id, message: (error as Error).message }); }
    finally { setBusyId(null); }
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
    return `http://127.0.0.1:8766/restart?${params.toString()}`;
  }

  function photoSelectionCodexUrl(booking: Booking) {
    const folderName = jobFolderName(booking);
    return codexPhotoSelectionUrl({ ...booking, folderHint: folderName, dropboxFolderPath: `/Customer's Photos/${folderName}/01 BASIC EDIT` });
  }

  async function createEditingFolders(booking: Booking) {
    setBusyId(booking.id);
    setActionError(null);
    setActionSuccess(null);
    try {
      const created = await createLocalJobFolder(booking);
      if (!created) return;
      await runAction(booking.id, 'basic-retouch-step', { step: 'folders', completed: true });
      setActionSuccess({
        id: booking.id,
        message: `The Dropbox editing folders were created in Customer's Photos/${jobFolderName(booking)}. Export Lightroom photos into 01 BASIC EDIT.`,
      });
    } finally {
      setBusyId(null);
    }
  }

  async function setRetouchStep(booking: Booking, workflow: 'basic'|'further', step: string, completed: boolean) {
    const result = await runAction(booking.id, 'basic-retouch-step', { workflow, step, completed });
    if (result) setActionSuccess({ id: booking.id, message: completed ? `${workflow === 'basic' ? 'Basic' : 'Further'} Retouch progress updated.` : 'This step was reopened.' });
  }

  async function notifyRetouchReady(booking: Booking, kind: 'basic'|'further') {
    const result = await runAction(booking.id, 'retouch-notification', { kind });
    if (result) setActionSuccess({ id: booking.id, message: `${kind === 'basic' ? 'Basic' : 'Further'} Retouch email and WhatsApp image sent to the client.` });
  }

  function photoSelectGalleryActionUrl(booking: Booking, galleryId: string, action: 'update-basic'|'unlock-selection'|'upload-further') {
    const params = new URLSearchParams({ action, gallery: galleryId, booking: booking.ref });
    return `http://127.0.0.1:8766/restart?${params.toString()}`;
  }

  async function generateInvoice(booking: Booking, sendEmail: boolean) {
    setInvoiceGenerating({ id: booking.id, sendEmail });
    setActionError(null);
    try {
      const data = await runAction(booking.id, 'generate-invoice', { sendEmail });
      if (!data) return;
      const qrDataUrl = data.payNowPayload
        ? await (await import('qrcode')).default.toDataURL(data.payNowPayload, { margin: 1, width: 320 })
        : null;
      const imageDataUrl = await createInvoiceImage(booking, qrDataUrl, data.due);
      setInvoiceQr({ bookingId: booking.id, qrDataUrl, imageDataUrl, due: data.due, emailed: data.emailed });
    } catch (error) {
      setActionError({ id: booking.id, message: `Could not create the invoice image: ${(error as Error).message}` });
    } finally {
      setInvoiceGenerating(null);
    }
  }

  function renderBookingCard(b: Booking) {
        const isOpen = expandedId === b.id;
        const isBusy = busyId === b.id;
        const hasClientGallery = Boolean(b.gallerySelections?.some(g => g.clientUrl));
        const displayStatus = b.status;
        const statusStyle = STATUS_LABEL[displayStatus] || { label: displayStatus, color: '#3A2E28', bg: '#EDE6DC' };
        const isPostProcessing = ['pending_balance', 'pending_basic_retouch', 'basic_retouch', 'further_retouch', 'order_product', 'soft_copy_delivered', 'completed'].includes(displayStatus);
        const retouchProgress = b.basicRetouchProgress || {};
        const retouchDone = [Boolean(retouchProgress.folders), Boolean(retouchProgress.lightroom), Boolean(retouchProgress.codex), Boolean(retouchProgress.photoshop), hasClientGallery, Boolean(retouchProgress.notification)];
        const retouchCompletedCount = retouchDone.filter(Boolean).length;
        const retouchCurrentStep = retouchDone.findIndex(done => !done);
        const galleryState = b.gallerySelections?.find(g => g.clientUrl);
        const furtherProgress = b.furtherRetouchProgress || {};
        const furtherDone = [Boolean(galleryState?.submitted && galleryState?.locked), Boolean(furtherProgress.pixelcake), Boolean(furtherProgress.photoshop), Boolean(galleryState?.deliveredAt), Boolean(furtherProgress.notification)];
        const furtherCompletedCount = furtherDone.filter(Boolean).length;
        const furtherCurrentStep = furtherDone.findIndex(done => !done);

        return (
          <div key={b.id} className={`booking-card${isOpen ? ' open' : ''}${filter === 'active' ? ((b.status === 'pending' || b.status === 'confirmed') ? ' pre-shoot-card' : ' post-shoot-card') : ''}`}>
            {/* Row */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ flex: '0 0 68%', minWidth: 0 }}>
                <div style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 700, fontSize: 16, lineHeight: 1.25, color: '#3A2E28' }}>{b.clientName}</div>
                <div style={{ fontSize: 13, color: '#9A8C7F', marginTop: 4, lineHeight: 1.35 }}>{b.sessionLabel}</div>
                <div style={{ fontWeight: 600, fontSize: 12.5, color: '#3A2E28', marginTop: 4, lineHeight: 1.35 }}>{fmtDatePretty(b.date)} · {fmtTime12(b.startTime)}</div>
                {isOpen && b.gallerySelections?.map(g => <div key={g.galleryId} className="workflow-panel workflow-photo compact">
                  {(g.deliveredAt || g.locked || g.submitted) && <span style={{width:'100%'}}>{g.deliveredAt ? 'Further retouch finished' : g.locked ? 'Selection confirmed' : 'Client selection received'}</span>}
                  {g.clientUrl ? <div style={{display:'flex',flexDirection:'column',alignItems:'stretch',gap:8,width:'100%',maxWidth:320}}>
                    {b.downloadFeedback?.filter(item=>item.galleryId===g.galleryId).map((item,index)=><div key={`${item.downloadType}-${item.downloadedAt}-${index}`} style={{padding:'7px 9px',borderRadius:7,background:'#e5f0e9',color:'#3f6557',fontSize:12,fontWeight:700}}>Downloaded: {item.downloadType === 'basic' ? 'Basic Retouch' : item.downloadType === 'further' ? 'Further Retouch' : 'All photos'} · {new Intl.DateTimeFormat('en-SG',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Singapore'}).format(new Date(item.downloadedAt))}</div>)}
                    {!(g.submitted||g.locked||g.deliveredAt) && <button type="button" onClick={()=>setManageGallery({bookingId:b.id,galleryId:g.galleryId})} style={{border:'1px solid #557970',background:'#fff',padding:'7px 10px',borderRadius:6,color:'#354c47',fontWeight:700,cursor:'pointer',textAlign:'left'}}>Manage Gallery</button>}
                    <a href={`/g/${g.galleryId.slice(0,12)}`} target="_blank" rel="noopener noreferrer" style={{border:'1px solid #7d918b',background:'#f8fbfa',padding:'7px 10px',borderRadius:6,color:'#415e58',fontWeight:700,textDecoration:'none',textAlign:'left'}}>Open Client Gallery</a>
                    {(g.submitted||g.locked||g.deliveredAt)&&<details className="workflow-more compact"><summary>More Gallery options</summary><div className="workflow-actions"><a className="btn btn-ghost" href={photoSelectGalleryActionUrl(b,g.galleryId,'update-basic')} target="_blank" rel="noopener noreferrer">Update Basic Retouch</a>{g.submitted&&<a className="btn btn-ghost" href={photoSelectGalleryActionUrl(b,g.galleryId,'unlock-selection')} target="_blank" rel="noopener noreferrer">Allow Client to Change Selection</a>}{(g.submitted||g.locked)&&<a className="btn btn-ghost" href={photoSelectGalleryActionUrl(b,g.galleryId,'upload-further')} target="_blank" rel="noopener noreferrer">Upload Further Retouch</a>}{!g.deliveredAt&&<button className="btn btn-ghost" type="button" onClick={()=>shareClientGallery(b.id,g.galleryId,'basic')}>Create Basic Retouch WhatsApp Image</button>}{g.deliveredAt&&<button className="btn btn-ghost" type="button" onClick={()=>shareClientGallery(b.id,g.galleryId,'further')}>Create Further Retouch WhatsApp Image</button>}</div></details>}
                  </div> : <span style={{color:'#8b5b43'}}>Link this Gallery again in Photo Clean Up Agent to enable the mobile client link.</span>}
                </div>)}
                {isOpen && b.additionalOrders?.map(order=><div key={order.id} style={{marginTop:8,padding:'10px 12px',background:order.status==='paid'?'#e4eadf':'#fff0d8',borderRadius:7,fontSize:13}}><div style={{display:'flex',justifyContent:'space-between',gap:8,fontWeight:700}}><span>Additional Order · {order.status==='paid'?'Paid':'Payment pending'}</span><span>${order.total}</span></div><div style={{marginTop:5,color:'#6f6258'}}>{order.items.map(item=>`${item.name} ×${item.quantity}`).join(' · ')}</div><div style={{marginTop:4}}>Ref: {order.invoiceRef} · +{order.bonusRetouches} complimentary retouch{order.bonusRetouches===1?'':'es'}</div>{order.status!=='paid'&&<button className="btn btn-sm" style={{marginTop:8}} disabled={busyId===b.id} onClick={()=>runAction(b.id,'confirm-additional-order',{orderId:order.id})}>Payment received</button>}</div>)}
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
                <div className="ticket-row"><span>Photo sharing</span><b>{photoSharingConsentLabel(b.photoSharingConsent)}</b></div>
                {b.address && <div className="ticket-row"><span>Address</span><b>{b.address}</b></div>}
                <div className="ticket-row"><span>Add-ons</span><b>{Object.entries(b.addOns).filter(([, q]) => q > 0).map(([id, q]) => `${ADDONS[id]?.name} ×${q}`).join(', ') || '—'}</b></div>
                {b.isWeekend && <div className="ticket-row"><span>Weekend surcharge</span><b>+$50</b></div>}
                {b.discountCode && <div className="ticket-row"><span>Discount</span><b>−${b.discountAmount} ({b.discountCode})</b></div>}
                <div className="ticket-row"><span>Notes</span><b style={{ whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>{b.notes || '—'}</b></div>

                {(expandedSetups.length > 0 || expandedPhotos.length > 0) && (
                  <div style={{ marginTop: 10 }}>
                    {(expandedSetups.length ? expandedSetups : [{slot:1,referencePhotoUrls:expandedPhotos,note:''}]).map(group => <div key={group.slot} style={{marginBottom:12}}>
                    <div style={{ fontSize: 12, fontWeight:700, color: 'var(--ink-soft)', marginBottom: 6 }}>Setup {group.slot}{group.note ? ` · ${group.note}` : ''}</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {group.referencePhotoUrls.map((url) => (
                        <a key={url} href={url} target="_blank" rel="noopener" style={{ display: 'block', width: 64, height: 64, borderRadius: 8, overflow: 'hidden', border: '1.5px solid var(--line)' }}>
                          <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </a>
                      ))}
                    </div></div>)}
                  </div>
                )}

                {b.status === 'confirmed' && (
                  <div style={{ marginTop: 8, fontSize: 12 }}>Reminders sent: {b.remindersSent?.length ? b.remindersSent.join(', ') : 'none yet'}</div>
                )}

                {(!isPostProcessing || b.balanceStatus !== 'pending') && <section className="workflow-panel workflow-billing">
                  <div className="workflow-panel-title">Billing</div>
                  <div className="workflow-current">{b.balanceStatus === 'paid' ? 'Balance paid ✓' : b.status === 'pending' ? `Deposit pending · $${b.depositAmount}` : b.balanceStatus === 'n/a' ? 'No balance due' : `Balance: $${b.balanceDue}`}</div>
                </section>}

                {/* Final bill panel */}
                {isPostProcessing && b.balanceStatus === 'pending' && (() => {
                  const addOnsRecord = (b.addOns || {}) as Record<string, number>;
                  const addOnsTotal = Object.entries(addOnsRecord).filter(([,q]) => q > 0).reduce((s, [id, q]) => s + (ADDONS[id]?.price || 0) * q, 0);
                  const weekendFee = b.isWeekend ? 50 : 0;
                  const isBundle = b.sessionTypeId === 'bundle';
                  const basePrice = b.total - addOnsTotal - weekendFee + b.discountAmount;
                  const baseLabel = isBundle
                    ? `Session ${b.bundleSessionNumber || 1} balance`
                    : 'Package price';
                  const extraTotal = b.extraLineItems.reduce((s, i) => s + i.amount, 0);
                  const totalDue = Math.max(0, b.balanceDue + extraTotal);
                  return (
                  <div className="final-bill-panel">
                    <div className="workflow-panel-title">Billing · Final bill</div>
                    {b.invoiceStale && <div className="notice" style={{ marginBottom: 10 }}>Add-ons changed after invoice {b.invoiceRef}. Please generate and send a new invoice.</div>}

                    {/* Full breakdown */}
                    <div className="ticket-row"><span>{baseLabel}</span><b>${basePrice}</b></div>
                    {Object.entries(addOnsRecord).filter(([,q]) => q > 0).map(([id, q]) => (
                      <div className="ticket-row" key={id}><span>{ADDONS[id]?.name} ×{q}</span><b>+${(ADDONS[id]?.price || 0) * q}</b></div>
                    ))}
                    {weekendFee > 0 && <div className="ticket-row"><span>Weekend / PH surcharge</span><b>+${weekendFee}</b></div>}
                    {b.discountAmount > 0 && <div className="ticket-row" style={{ color: 'var(--sage)' }}><span>Discount ({b.discountCode})</span><b>−${b.discountAmount}</b></div>}

                    <div style={{ marginTop: 8, padding: '9px', border: '1px solid var(--line)', borderRadius: 8, background: '#fffdf9' }}>
                      <div style={{ fontSize: 11.5, fontWeight: 700, marginBottom: 6 }}>Promotion code</div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input
                          value={discountInputs[b.id] ?? b.discountCode ?? ''}
                          onChange={(e) => setDiscountInputs(current => ({ ...current, [b.id]: e.target.value.toUpperCase() }))}
                          placeholder="Enter code"
                          style={{ flex: 1, minWidth: 0, border: '1.5px solid var(--line)', borderRadius: 7, padding: '7px 9px', fontSize: 12.5 }}
                        />
                        <button className="btn btn-ghost" disabled={isBusy} onClick={async () => {
                          const code = (discountInputs[b.id] ?? b.discountCode ?? '').trim();
                          if (!code) return;
                          const result = await runAction(b.id, 'apply-discount', { code });
                          if (result) setActionSuccess({ id: b.id, message: `${result.booking.discountCode} applied. Balance due updated to $${result.booking.balanceDue}.` });
                        }}>Apply</button>
                      </div>
                      <div style={{ marginTop: 5, fontSize: 10.5, color: 'var(--ink-faint)' }}>Apply before generating the final invoice.</div>
                    </div>

                    {/* Extra line items added post-session */}
                    {b.extraLineItems.length > 0 && (
                      <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px dashed var(--line)' }}>
                        <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginBottom: 4 }}>Bill adjustments</div>
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
                      <div className="ticket-row"><span>Total</span><b>${b.total + extraTotal}</b></div>
                      {!isBundle && <div className="ticket-row"><span>Deposit paid</span><b>−${b.depositAmount}</b></div>}
                      <div className="ticket-total" style={{ marginTop: 6 }}>
                        <span style={{ fontWeight: 700 }}>Balance due</span>
                        <span className="amt">${totalDue}</span>
                      </div>
                    </div>

                    {/* Add extra line items */}
                    <div className="final-bill-add-charge">
                      <input placeholder="Charge or discount description" value={lineDesc} onChange={(e) => setLineDesc(e.target.value)} style={{ flex: 1, border: '1.5px solid var(--line)', borderRadius: 8, padding: '7px 10px', fontSize: 12.5 }} />
                      <input aria-label="Amount; use a negative number for a discount" title="Use a negative number for a discount, for example -30" placeholder="e.g. -30" type="number" value={lineAmount} onChange={(e) => setLineAmount(e.target.value)} style={{ width: 82, border: '1.5px solid var(--line)', borderRadius: 8, padding: '7px 10px', fontSize: 12.5 }} />
                      <button className="btn btn-ghost" onClick={async () => {
                        if (!lineDesc || !lineAmount) return;
                        await runAction(b.id, 'extra-line-item', { description: lineDesc, amount: Number(lineAmount) });
                        setLineDesc(''); setLineAmount('');
                      }}>Add</button>
                    </div>
                    <div style={{ marginTop: 5, fontSize: 10.5, color: 'var(--ink-faint)' }}>Use a positive amount for an extra charge or a negative amount for a one-off discount.</div>
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
                        Confirm Balance Payment Received
                      </button>
                    </div>
                    {invoiceQr?.bookingId === b.id && <div style={{ marginTop: 10 }}>
                      <div className="notice" style={{ marginTop: 0 }}>{invoiceQr.emailed ? `Invoice emailed to ${b.clientEmail}. The image below is ready to save.` : 'Invoice image ready. No email was sent.'}</div>
                      <img className="invoice-image-preview" src={invoiceQr.imageDataUrl} alt={`Invoice for ${b.clientName}`} />
                      <div className="invoice-image-actions">
                        <a className="btn btn-primary" href={invoiceQr.imageDataUrl} download={`Mamamiyo-Invoice-${b.ref}.png`}>Download invoice image</a>
                        {invoiceQr.qrDataUrl && <a className="btn btn-ghost" href={invoiceQr.qrDataUrl} download={`Mamamiyo-PayNow-QR-${b.ref}.png`}>Download QR code only</a>}
                      </div>
                    </div>}
                  </div>
                  );
                })()}


                {/* Photo processing */}
                <section className="workflow-panel workflow-photo">
                  <div className="workflow-panel-title">Photo Processing</div>
                  {b.status === 'confirmed' && <div className="workflow-actions"><button className="btn btn-ghost" onClick={() => openSummary(b.id)}>Generate booking summary</button></div>}
                  {['pending_balance','pending_basic_retouch','basic_retouch'].includes(b.status) && <>
                    <div className="retouch-progress-summary">Basic Retouch · {retouchCompletedCount} of 6 completed</div>
                    <div className="retouch-checklist">
                      <div className={`retouch-step${retouchDone[0]?' complete':''}${retouchCurrentStep===0?' current':''}`}><span className="retouch-step-number">{retouchDone[0]?'✓':'1'}</span><div><b>Create editing folders</b><p>Currently stored in Dropbox. Google One may be used later.</p><div className="workflow-actions"><button className="btn btn-ghost" disabled={isBusy} onClick={() => createEditingFolders(b)}>{retouchDone[0]?'Create folders again':'Create Editing Folders'}</button>{retouchDone[0]&&<button className="btn btn-ghost" disabled={isBusy} onClick={()=>setRetouchStep(b,'basic','folders',false)}>Reopen step</button>}</div></div></div>
                      <div className={`retouch-step${retouchDone[1]?' complete':''}${retouchCurrentStep===1?' current':''}`}><span className="retouch-step-number">{retouchDone[1]?'✓':'2'}</span><div><b>Lightroom editing</b><p>Import photos, edit them, then export to the editing folder from Step 1.</p><div className="workflow-actions"><button className="btn btn-ghost" disabled={isBusy} onClick={()=>setRetouchStep(b,'basic','lightroom',!retouchDone[1])}>{retouchDone[1]?'Mark as not done':'Mark Lightroom Editing Done'}</button></div></div></div>
                      <div className={`retouch-step${retouchDone[2]?' complete':''}${retouchCurrentStep===2?' current':''}`}><span className="retouch-step-number">{retouchDone[2]?'✓':'3'}</span><div><b>Screen photos with Codex</b><p>Check duplicates, blinking, focus and group-photo alternatives, then review the results.</p><div className="workflow-actions"><a className="btn btn-ghost" href={photoSelectionCodexUrl(b)} onClick={() => showCodexPhotoSelectionLaunch(b)}>Open Codex Photo Screening</a><button className="btn btn-ghost" disabled={isBusy} onClick={()=>setRetouchStep(b,'basic','codex',!retouchDone[2])}>{retouchDone[2]?'Mark as not done':'Mark Screening Done'}</button></div></div></div>
                      <div className={`retouch-step${retouchDone[3]?' complete':''}${retouchCurrentStep===3?' current':''}`}><span className="retouch-step-number">{retouchDone[3]?'✓':'4'}</span><div><b>Photoshop editing</b><p>Complete the required manual corrections in Photoshop.</p><div className="workflow-actions"><button className="btn btn-ghost" disabled={isBusy} onClick={()=>setRetouchStep(b,'basic','photoshop',!retouchDone[3])}>{retouchDone[3]?'Mark as not done':'Mark Photoshop Editing Done'}</button></div></div></div>
                      <div className={`retouch-step${retouchDone[4]?' complete':''}${retouchCurrentStep===4?' current':''}`}><span className="retouch-step-number">{retouchDone[4]?'✓':'5'}</span><div><b>Create &amp; upload photos to Gallery</b><p>{hasClientGallery?'Gallery connected successfully.':'Create the client Gallery after the edited photos are ready.'}</p>{!hasClientGallery&&<div className="workflow-actions"><a className="btn btn-ghost" href={photoSelectCreateUrl(b)} target="_blank" rel="noopener noreferrer">Open Photo Select Pro · Upload Gallery</a></div>}</div></div>
                      <div className={`retouch-step${retouchDone[5]?' complete':''}${retouchCurrentStep===5?' current':''}`}><span className="retouch-step-number">{retouchDone[5]?'✓':'6'}</span><div><b>Notify client</b><p>Send the Basic Retouch image, a short WhatsApp message, the private Gallery link and an email. The booking moves to Awaiting Client Selection only after both messages succeed.</p>{hasClientGallery&&!retouchDone[5]&&<div className="workflow-actions"><button className="btn btn-ghost" disabled={isBusy} onClick={()=>notifyRetouchReady(b,'basic')}>Send Basic Retouch Image + Gallery Link</button></div>}</div></div>
                    </div>
                  </>}
                  {['further_retouch','order_product','soft_copy_delivered','completed'].includes(b.status) && <>
                    <div className="retouch-progress-summary">Further Retouch · {furtherCompletedCount} of 5 completed</div>
                    <div className="retouch-checklist">
                      <div className={`retouch-step${furtherDone[0]?' complete':''}${furtherCurrentStep===0?' current':''}`}><span className="retouch-step-number">{furtherDone[0]?'✓':'1'}</span><div><b>Get client selection from Gallery</b><p>{furtherDone[0]?'Client selection received and confirmed.':'Wait for the client to submit and confirm the selected photos.'}</p></div></div>
                      <div className={`retouch-step${furtherDone[1]?' complete':''}${furtherCurrentStep===1?' current':''}`}><span className="retouch-step-number">{furtherDone[1]?'✓':'2'}</span><div><b>PixelCake initial retouch</b><p>Open PixelCake and complete the first retouch pass.</p><div className="workflow-actions"><button className="btn btn-ghost" disabled={isBusy} onClick={()=>setRetouchStep(b,'further','pixelcake',!furtherDone[1])}>{furtherDone[1]?'Mark as not done':'Mark PixelCake Retouch Done'}</button></div></div></div>
                      <div className={`retouch-step${furtherDone[2]?' complete':''}${furtherCurrentStep===2?' current':''}`}><span className="retouch-step-number">{furtherDone[2]?'✓':'3'}</span><div><b>Photoshop detail retouch</b><p>Open Photoshop and complete the remaining detailed corrections.</p><div className="workflow-actions"><button className="btn btn-ghost" disabled={isBusy} onClick={()=>setRetouchStep(b,'further','photoshop',!furtherDone[2])}>{furtherDone[2]?'Mark as not done':'Mark Photoshop Retouch Done'}</button></div></div></div>
                      <div className={`retouch-step${furtherDone[3]?' complete':''}${furtherCurrentStep===3?' current':''}`}><span className="retouch-step-number">{furtherDone[3]?'✓':'4'}</span><div><b>Upload Further Retouch to Gallery</b><p>{furtherDone[3]?'Further Retouch upload completed.':'Upload the completed photos through Photo Select Pro.'}</p>{galleryState&&!furtherDone[3]&&<div className="workflow-actions"><a className="btn btn-ghost" href={photoSelectGalleryActionUrl(b,galleryState.galleryId,'upload-further')} target="_blank" rel="noopener noreferrer">Upload Further Retouch</a></div>}</div></div>
                      <div className={`retouch-step${furtherDone[4]?' complete':''}${furtherCurrentStep===4?' current':''}`}><span className="retouch-step-number">{furtherDone[4]?'✓':'5'}</span><div><b>Notify client</b><p>Send the completed Gallery by email and WhatsApp with the Mamamiyo character image.</p>{furtherDone[3]&&!furtherDone[4]&&<div className="workflow-actions"><button className="btn btn-ghost" disabled={isBusy} onClick={()=>notifyRetouchReady(b,'further')}>Send Email + WhatsApp</button></div>}</div></div>
                    </div>
                  </>}
                </section>

                {/* Status controls */}
                <section className="workflow-panel workflow-status">
                  <div className="workflow-panel-title">Status</div>
                  <div className="workflow-current">Current: {statusStyle.label}</div>
                  <div className="workflow-actions">
                    {b.status === 'pending' && <button className="btn btn-primary" disabled={isBusy} onClick={() => runAction(b.id, 'confirm-deposit')}>Confirm deposit received</button>}
                    {b.status === 'confirmed' && <button className="btn btn-primary" disabled={isBusy} onClick={() => runAction(b.id, 'mark-completed')}>Confirm Photoshoot Done</button>}
                    {b.status === 'pending_basic_retouch' && <button className="btn btn-primary" disabled={isBusy} onClick={() => runAction(b.id, 'advance-stage')}>Basic Retouch Done</button>}
                    {b.status === 'order_product' && <button className="btn btn-primary" disabled={isBusy} onClick={() => runAction(b.id, 'advance-stage')}>Product Ordered · Move to Delivery</button>}
                    {b.status === 'soft_copy_delivered' && <button className="btn btn-primary" disabled={isBusy} onClick={() => runAction(b.id, 'advance-stage')}>Product Delivered · Complete Photoshoot</button>}
                    {(b.status === 'pending_basic_retouch' || b.status === 'basic_retouch' || b.status === 'further_retouch' || b.status === 'order_product' || b.status === 'soft_copy_delivered' || b.status === 'completed') && <button className="btn btn-ghost" disabled={isBusy} onClick={() => runAction(b.id, 'revert-stage')}>{b.status === 'completed' ? 'Go back to previous delivery stage' : b.status === 'soft_copy_delivered' ? 'Go back to order product' : b.status === 'order_product' ? 'Go back to further retouch' : b.status === 'further_retouch' ? 'Go back to client selection' : b.status === 'basic_retouch' ? 'Go back to pending basic retouch' : 'Go back to booking confirmed'}</button>}
                  </div>
                </section>

                <details className="workflow-more">
                  <summary>More options</summary>
                  <div className="workflow-actions">
                    {b.status !== 'cancelled' && b.balanceStatus !== 'paid' && <button className="btn btn-ghost" disabled={isBusy} onClick={() => openEditBooking(b.id)}>Edit booking</button>}
                    {b.status === 'basic_retouch' && <button className="btn btn-ghost" disabled={isBusy} onClick={() => { if (confirm('Skip further retouch and continue to the appropriate final stage?')) runAction(b.id, 'skip-further-retouch'); }}>Skip further retouch</button>}
                    {b.status === 'basic_retouch' && <button className="btn btn-ghost" disabled={isBusy} onClick={() => runAction(b.id, 'advance-stage')}>Manually move to Further Retouch</button>}
                    {isPostProcessing && b.balanceStatus === 'paid' && <button className="btn btn-ghost" disabled={isBusy} onClick={() => { if (confirm('Mark this balance as unpaid? The editing stage will stay the same and no customer message will be sent.')) runAction(b.id, 'reopen-balance'); }}>Mark balance as unpaid</button>}
                    {b.status !== 'cancelled' && <button className="btn btn-ghost" disabled={isBusy} onClick={() => { if (confirm('Cancel this booking?')) runAction(b.id, 'cancel'); }}>Cancel booking</button>}
                    <button className="btn btn-ghost" style={{ color: 'var(--rust)' }} disabled={isBusy} onClick={() => { if (confirm('Permanently DELETE this booking? Cannot be undone.')) runAction(b.id, 'delete'); }}>Delete booking</button>
                  </div>
                </details>

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
      {/* Status filter chips wrap into two clean rows so later stages remain visible. */}
      <div className="status-filter" style={{ flexWrap: 'wrap', overflowX: 'visible' }} aria-label="Filter bookings by status">
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
              <b>{bookings.filter((booking) => ['pending_balance', 'pending_basic_retouch', 'basic_retouch', 'further_retouch', 'order_product', 'soft_copy_delivered', 'completed'].includes(booking.status)).length}</b>
            </div>
            <div className="booking-list">
              {[...bookings]
                .filter((booking) => ['pending_balance', 'pending_basic_retouch', 'basic_retouch', 'further_retouch', 'order_product', 'soft_copy_delivered', 'completed'].includes(booking.status))
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
      {manageGallery&&<ManageGalleryModal bookingId={manageGallery.bookingId} galleryId={manageGallery.galleryId} onClose={()=>setManageGallery(null)} onChanged={load}/>}
    </div>
  );
}
