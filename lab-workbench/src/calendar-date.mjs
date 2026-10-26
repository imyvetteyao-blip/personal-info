// Civil dates only: no local-midnight arithmetic, UTC conversion or DST offsets.
export function calendarDateInfo(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ""));
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) return null;
  const dayOfYear = days.slice(0, month - 1).reduce((sum, n) => sum + n, day);
  return { date: value, year, dayOfYear, label: `Day ${dayOfYear} of ${year}` };
}
