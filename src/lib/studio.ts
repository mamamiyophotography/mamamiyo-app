import { STUDIO_INFO } from './constants';

export function studioAddressText(): string {
  return `${STUDIO_INFO.name} — ${STUDIO_INFO.addressLines.join(', ')}. ${STUDIO_INFO.access}. ${STUDIO_INFO.parkingOk}; ${STUDIO_INFO.parkingWarn}.`;
}
