// Keep API timestamps in UTC and display calendar dates in the browser's time zone.
export const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const formatters = new Map();

function formatter(locale, options, zone) {
  const key = JSON.stringify([locale, options, zone]);
  if (!formatters.has(key)) {
    formatters.set(key, new Intl.DateTimeFormat(locale, {...options, timeZone: zone}));
  }
  return formatters.get(key);
}

export function zoneLabel(at = Date.now(), zone = timeZone) {
  if (zone === 'Asia/Kolkata' || zone === 'Asia/Calcutta') return 'IST';
  if (['UTC', 'Etc/UTC', 'Etc/GMT', 'GMT'].includes(zone)) return 'UTC';
  const parts = formatter('en-US', {timeZoneName: 'short'}, zone).formatToParts(at);
  return parts.find(part => part.type === 'timeZoneName')?.value || zone;
}

export function dateText(at, options = {month: 'short', day: 'numeric'}, zone = timeZone) {
  return formatter('en-GB', options, zone).format(at);
}

const twoDigits = value => String(value).padStart(2, '0');

export function localDateKey(at) {
  const date = new Date(at);
  return [date.getFullYear(), twoDigits(date.getMonth() + 1), twoDigits(date.getDate())].join('-');
}

export function localDateTime(at) {
  if (at == null || at === '') return '—';
  const date = new Date(at);
  if (!Number.isFinite(date.getTime())) return '—';
  return localDateKey(date) + ' ' + twoDigits(date.getHours()) + ':' + twoDigits(date.getMinutes()) + ' ' + zoneLabel(date);
}

export function localISO(at) {
  if (at == null || at === '') return '';
  const date = new Date(at);
  const offset = -date.getTimezoneOffset();
  if (!Number.isFinite(offset)) return '';
  const minutes = Math.abs(offset);
  const suffix = (offset < 0 ? '-' : '+') + twoDigits(Math.floor(minutes / 60)) + ':' + twoDigits(minutes % 60);
  return new Date(date.getTime() + offset * 60000).toISOString().replace('Z', suffix);
}

export function shiftLocalDays(at, days, midnight = false) {
  const date = new Date(at);
  date.setDate(date.getDate() + days);
  if (midnight) date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function isDayBoundary(at, zone = 'UTC') {
  if (zone === 'UTC') return at % 86400000 === 0;
  try {
    const format = formatter('en-GB', {year: 'numeric', month: '2-digit', day: '2-digit'}, zone);
    return format.format(at) !== format.format(at - 1);
  } catch {
    return false;
  }
}
