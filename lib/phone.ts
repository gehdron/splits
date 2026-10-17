export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (raw.trim().startsWith("+") && /^\+[1-9]\d{9,14}$/.test(`+${digits}`)) return `+${digits}`;
  return null;
}
