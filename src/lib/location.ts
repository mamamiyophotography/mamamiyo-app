export const BOOKING_LOCATIONS = [
  { value: 'studio', label: 'Home Studio @ K-Lodge' },
  { value: 'home', label: 'Client Home' },
  { value: 'confinement', label: 'Confinement Center' },
  { value: 'other', label: 'Other' },
] as const;

export const NEWBORN_BOOKING_LOCATIONS = BOOKING_LOCATIONS.filter((location) => location.value !== 'studio');

export type BookingLocation = (typeof BOOKING_LOCATIONS)[number]['value'];

export function isBookingLocation(value: unknown): value is BookingLocation {
  return BOOKING_LOCATIONS.some((location) => location.value === value);
}

export function bookingLocationLabel(value: string): string {
  return BOOKING_LOCATIONS.find((location) => location.value === value)?.label || 'Other location';
}

export function bookingLocationWithAddress(value: string, address?: string): string {
  const label = bookingLocationLabel(value);
  return value === 'studio' || !address ? label : `${label} — ${address}`;
}
