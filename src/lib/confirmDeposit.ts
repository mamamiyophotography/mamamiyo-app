// Persist confirmation before attempting independent external side effects.
export async function completeDepositConfirmation<T>(operations: {
  confirm: () => Promise<T>;
  syncCalendar: (booking: T) => Promise<{ synced: boolean; configured: boolean; message?: string; booking?: T }>;
  notify: (booking: T) => Promise<unknown>;
}) {
  let booking: T = await operations.confirm();
  let calendar;
  try {
    calendar = await operations.syncCalendar(booking);
    if (calendar.booking) booking = calendar.booking;
  } catch (error) {
    calendar = { configured: true, synced: false, message: (error as Error).message };
  }
  let notification;
  try {
    await operations.notify(booking);
    notification = { sent: true };
  } catch (error) {
    notification = { sent: false, message: (error as Error).message };
  }
  return { booking, calendar, notification };
}
