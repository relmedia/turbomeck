export const MONTH_NAMES_SV = [
  "Januari",
  "Februari",
  "Mars",
  "April",
  "Maj",
  "Juni",
  "Juli",
  "Augusti",
  "September",
  "Oktober",
  "November",
  "December",
] as const;

/** Swedish month name for chart labels (0 = January). */
export function monthLabelSv(monthIndex: number): string {
  return MONTH_NAMES_SV[monthIndex] ?? "";
}
