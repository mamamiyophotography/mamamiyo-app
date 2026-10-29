import assert from 'node:assert/strict';
import { completeDepositConfirmation } from '../src/lib/confirmDeposit';
import { confirmDeposit, notifyDepositConfirmation } from '../src/lib/db/bookingService';
import { syncBookingToGoogleCalendar } from '../src/lib/googleCalendar';

// No production credentials, database or external delivery in these regression tests.
process.env.ANALYTICS_DB_ENABLED = 'false';
process.env.DRY_RUN_NOTIFICATIONS = 'true';
process.env.PHOTOGRAPHER_EMAIL = 'studio@example.com';
process.env.PHOTOGRAPHER_PHONE = '+6591234567';
process.env.WHAPI_TOKEN = 'test-token';
process.env.WHATSAPP_CLIENT_NOTIFICATIONS = 'false';
process.env.TWILIO_ACCOUNT_SID = '';
process.env.TWILIO_AUTH_TOKEN = '';
process.env.TWILIO_WHATSAPP_FROM = '';
for (const key of ['CLIENT_ID','CLIENT_SECRET','REFRESH_TOKEN','ID']) process.env[`GOOGLE_CALENDAR_${key}`] = 'test';

async function run() {
  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  const calls: string[] = [];
  let state: any = { id: 'test-booking', ref: 'MMY-TEST', clientName: 'Test Client', clientEmail: 'client@example.com', clientPhone: '+6591234567', sessionTypeId: 'newborn', sessionLabel: 'Newborn Photoshoot', location: 'home', address: 'Test address', date: '2027-01-01', startTime: '09:00', endTime: '11:00', notes: '', balanceDue: 488, total: 588, depositAmount: 100, status: 'pending', depositStatus: 'pending', addOns: {}, googleCalendarEventId: null };
  const db: any = {
    settings: { findUnique: async () => ({businessName:'Test Studio',weekendSurcharge:50}) },
    booking: { update: async ({data}: any) => { state = {...state,...data}; return state; } },
  };
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push(`${init?.method || 'GET'} ${url}`);
    if (url.includes('oauth2.googleapis.com')) return Response.json({access_token:'test-access'});
    if (url.includes('googleapis.com/calendar')) {
      if (init?.method === 'PUT' && !state.googleCalendarEventId) return Response.json({}, {status:404});
      return Response.json({id: state.googleCalendarEventId || 'm123',htmlLink:'https://example.com/event'});
    }
    if (url.includes('gate.whapi.cloud')) return Response.json({error:'Channel not found'}, {status:404});
    throw new Error(`Unexpected network request: ${url}`);
  };
  try {
    console.log = () => {};
    const result = await completeDepositConfirmation({
      confirm: () => confirmDeposit(db, state.id),
      syncCalendar: b => syncBookingToGoogleCalendar(db, b),
      notify: b => notifyDepositConfirmation(db, b),
    });
    console.log = originalLog;
    assert.equal(state.status, 'confirmed');
    assert.equal(state.depositStatus, 'paid');
    assert.equal(result.calendar.synced, true);
    assert.equal(state.googleCalendarEventId, 'm123');
    assert.equal(result.notification.sent, false);
    assert.match(result.notification.message || '', /Channel not found/);
    assert.ok(calls.findIndex(c=>c.includes('/calendar/')) < calls.findIndex(c=>c.includes('whapi')));
    originalLog('PASS: real service flow persists confirmation and calendar event despite WhatsApp 404');
    await syncBookingToGoogleCalendar(db, state);
    assert.equal(calls.filter(c=>c.startsWith('POST ')&&c.includes('/calendar/')).length, 1);
    originalLog('PASS: repeated calendar sync updates the linked event without creating another');

    let notified = false;
    const failedCalendar = await completeDepositConfirmation({
      confirm: async () => state,
      syncCalendar: async () => {throw new Error('Calendar unavailable');},
      notify: async () => {notified=true;},
    });
    assert.equal(failedCalendar.calendar.synced,false);
    assert.equal(failedCalendar.notification.sent,true);
    assert.equal(notified,true);
    originalLog('PASS: calendar failure does not block notification and is reported separately');

    const disconnected = await completeDepositConfirmation({confirm:async()=>state,syncCalendar:async()=>({configured:false,synced:false,message:'Not connected'}),notify:async()=>{throw new Error('Email unavailable');}});
    assert.equal(disconnected.calendar.configured,false);
    assert.equal(disconnected.notification.sent,false);
    originalLog('PASS: disconnected calendar and failed notification both remain visible');

    let sideEffects=0;
    await assert.rejects(completeDepositConfirmation({confirm:async()=>{throw new Error('Database failure');},syncCalendar:async()=>{sideEffects++;return {configured:true,synced:true};},notify:async()=>{sideEffects++;}}),/Database failure/);
    assert.equal(sideEffects,0);
    originalLog('PASS: failed confirmation prevents all external side effects');
  } finally {globalThis.fetch=originalFetch;console.log=originalLog;}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
