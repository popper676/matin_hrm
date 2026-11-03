export const getLocalYYYYMMDD = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Business timezone is Asia/Bangkok (see server/lib/dateUtils.js). Attendance timestamps are
// stored as UTC instants, so "today" and displayed times must be resolved in Bangkok, not UTC/browser tz.
const BKK_TZ = 'Asia/Bangkok';

export const toBkkDate = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: BKK_TZ }).format(d);
};

export const getBkkToday = () => toBkkDate(new Date());

export const formatBkkDateTime = (date) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: BKK_TZ, weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    }).formatToParts(date).map(x => [x.type, x.value])
  );
  return `${p.weekday}, ${p.month} ${p.day} ${p.hour}:${p.minute} ${p.dayPeriod}`;
};
