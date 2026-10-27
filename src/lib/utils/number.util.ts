export function parseNumber(value: string | null | undefined): number | null {
  if (value == null) return null;
  const number = Number(value);
  return Number.isNaN(number) ? null : number;
}
