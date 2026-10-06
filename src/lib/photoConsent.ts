export const PHOTO_SHARING_OPTIONS = [
  { value: 'all', label: 'Yes — you may share photos of everyone in this session' },
  { value: 'children_only', label: 'Children / baby only — please do not share photos showing adults' },
  { value: 'private', label: 'No — please keep all photos private' },
] as const;

export type PhotoSharingConsent = (typeof PHOTO_SHARING_OPTIONS)[number]['value'];

export function isPhotoSharingConsent(value: unknown): value is PhotoSharingConsent {
  return PHOTO_SHARING_OPTIONS.some(option => option.value === value);
}

export function photoSharingConsentLabel(value: string | null | undefined): string {
  if (value === 'all') return 'May publish everyone';
  if (value === 'children_only') return 'May publish children / baby only';
  if (value === 'private') return 'Private — do not publish anyone';
  return 'Not selected';
}
