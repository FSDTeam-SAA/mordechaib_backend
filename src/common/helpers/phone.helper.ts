export function normalizePhoneNumber(phone: string): string {
  return phone.replace(/[\s()-]/g, '').trim();
}

export function isE164(phone: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(phone);
}
