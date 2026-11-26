import {timeZone, isDayBoundary, localDateKey, localISO, shiftLocalDays} from './time.js?v=4';

export const DAY = 86_400_000;
export const MAX_ROWS = 50_000;
export const MODES = { campaign: 'Campaign', daily: 'Daily Bento', tower: 'Neko Tower' };
export const OUTCOMES = { verified: 'Verified', open: 'In progress', expired: 'Expired' };
export const REVIEW_STATES = { flagged: 'Needs review', resolved: 'Resolved' };
export const ID_PATTERN = /^[0-9a-f]{24}$/;
export const MAX_NOTE = 600;
const dayKey = ms => new Date(ms).toISOString().slice(0, 10);
const integerIn = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(value)) return NaN;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && dayKey(ms) === value.slice(0, 10) ? ms : NaN;
}

export function readSnapshot(input) {
  if (!isRecord(input) || input.version !== 1 || !Array.isArray(input.attempts)) {
    throw Error('Choose a version 1 Purrcels ranked snapshot.');
  }
  const asOf = timestamp(input.asOf);
  const start = timestamp(input.from);
  if (!Number.isFinite(asOf) || !Number.isFinite(start) || start > asOf ||
      !isDayBoundary(start,input.timeZone??'UTC')) {
    throw Error('The snapshot needs a valid reporting window.');
  }
  return {asOf, start, rows:readAttempts(input.attempts, start, asOf)};
}

function readAttempts(attempts, start, asOf) {
  if (attempts.length > MAX_ROWS) throw Error('Choose a snapshot with 50,000 attempts or fewer.');
  const ids = new Set();
  const rows = attempts.map((raw, i) => {
    const invalid = () => { throw Error('Invalid or duplicate attempt at row ' + (i + 1) + '.'); };
    if (!isRecord(raw) || typeof raw.id !== 'string' || !ID_PATTERN.test(raw.id) || ids.has(raw.id)) invalid();
    ids.add(raw.id);
    const {id, puzzle, mode, grid, difficulty, seconds, mistakes, stars} = raw;
    if (typeof puzzle !== 'string' || !/^[a-z0-9_]{1,150}$/.test(puzzle) ||
        typeof mode !== 'string' || !Object.hasOwn(MODES, mode) || !integerIn(grid, 4, 9)) invalid();
    if (mode === 'daily' ? !['easy', 'medium', 'hard'].includes(difficulty) : difficulty !== null) invalid();
    const started = timestamp(raw.startedAt);
    const expires = timestamp(raw.expiresAt);
    const completed = raw.completedAt === null ? null : timestamp(raw.completedAt);
    if (!Number.isFinite(started) || started < start || started > asOf || !Number.isFinite(expires) || expires <= started) invalid();
    if (completed !== null) {
      if (!Number.isFinite(completed) || completed < started || completed > asOf || completed > expires ||
          !integerIn(seconds, 1, 86400) || !integerIn(mistakes, 0, 3) || !integerIn(stars, 1, 3)) invalid();
    } else if (seconds !== null || mistakes !== null || stars !== null) invalid();
    const outcome = completed !== null ? 'verified' : (asOf > expires ? 'expired' : 'open');
    return {id, puzzle, mode, grid, difficulty, started, expires, completed, seconds, mistakes, stars, outcome};
  });
  rows.sort((a, b) => b.started - a.started || a.id.localeCompare(b.id));
  return rows;
}

export function readQueuePage(data) {
  const asOf=timestamp(data?.asOf);
  if (!Number.isFinite(asOf) || !integerIn(data.total,0,2147483647) || !integerIn(data.flagged,0,2147483647) ||
      !Array.isArray(data.attempts) || data.attempts.length>250 || data.attempts.length>data.total || !isRecord(data.reviews)) {
    throw Error('The game server returned an unreadable review queue.');
  }
  const rows=readAttempts(data.attempts,-Infinity,asOf), reviews={};
  for (const row of rows) reviews[row.id]=cleanReview(data.reviews[row.id]);
  return {rows,reviews,total:data.total,flagged:data.flagged,asOf:data.asOf};
}

export function selectPeriod(dataset, days, mode = 'all') {
  const start = shiftLocalDays(dataset.asOf,1-days,true);
  const previousStart = shiftLocalDays(dataset.asOf,1-2*days,true);
  const previousEnd = shiftLocalDays(dataset.asOf,-days);
  const inMode = row => mode === 'all' || row.mode === mode;
  const rows = dataset.rows.filter(row => row.started >= start && inMode(row));
  const priorRows = dataset.rows.filter(row => row.started >= previousStart && row.started <= previousEnd && inMode(row));
  const trend = Array.from({length: days}, (_, i) => {
    const date = shiftLocalDays(dataset.asOf,i+1-days,true);
    return {date, attempts: 0, verified: 0, covered: date >= dataset.start};
  });
  const byDate=new Map(trend.map(point=>[localDateKey(point.date),point]));
  for (const row of rows) {
    const point = byDate.get(localDateKey(row.started));
    point.attempts++;
    if (row.outcome === 'verified') point.verified++;
  }
  const hasHistory = previousStart >= dataset.start;
  return {rows, priorRows, trend, start, previousEnd, hasHistory, partial: start < dataset.start};
}

export function metrics(rows, cutoff = Infinity) {
  const solved = rows.filter(row => row.completed !== null && row.completed <= cutoff);
  const times = solved.map(row => row.seconds).sort((a, b) => a - b);
  const mid = Math.floor(times.length / 2);
  const median = times.length ? (times[mid] + times[(times.length - 1) >> 1]) / 2 : null;
  const modes = {campaign: 0, daily: 0, tower: 0};
  for (const row of solved) modes[row.mode]++;
  return {attempts: rows.length, verified: solved.length, rate: rows.length ? solved.length / rows.length * 100 : null, median, modes};
}

export function puzzleName(id) {
  if (id.startsWith('level_')) {
    const [, chapter, level] = id.split('_');
    return chapter.charAt(0).toUpperCase() + chapter.slice(1) + ' · Stage ' + level;
  }
  if (id.startsWith('tower_')) return 'Neko Tower · Floor ' + id.slice(6);
  if (id.startsWith('daily_')) return 'Daily Bento · ' + id.slice(6, 16).replaceAll('_', '-');
  return id;
}

export function formatTime(seconds) {
  if (seconds === null) return '—';
  const whole = Math.round(seconds);
  const hours = Math.floor(whole / 3600);
  const mins = Math.floor(whole / 60) % 60;
  return (hours ? hours + ':' + String(mins).padStart(2, '0') : mins) + ':' + String(whole % 60).padStart(2, '0');
}

export function filterResults(rows, filters, reviews) {
  const term = filters.search.trim().toLowerCase();
  return rows.filter(row =>
    (filters.outcome === 'all' || filters.outcome === row.outcome) &&
    (filters.difficulty === 'all' || filters.difficulty === row.difficulty) &&
    (filters.review === 'all' || filters.review === (reviews[row.id]?.state || 'unmarked')) &&
    (!term || [row.puzzle, puzzleName(row.puzzle), row.id, MODES[row.mode]].some(value => value.toLowerCase().includes(term)))
  );
}

export function cleanReview(value) {
  if (!isRecord(value) || typeof value.state !== 'string' || !Object.hasOwn(REVIEW_STATES, value.state) ||
      typeof value.note !== 'string' || value.note.length > MAX_NOTE ||
      !Number.isSafeInteger(value.revision) || value.revision < 1 ||
      !Number.isFinite(timestamp(value.updatedAt))) throw Error('Invalid review record.');
  return {state:value.state, note:value.note, revision:value.revision, updatedAt:value.updatedAt,
    reviewedBy: typeof value.reviewedBy === 'string' ? value.reviewedBy : ''};
}

export function resultsCsv(rows, reviews) {
  function cell(value) {
    let s = String(value ?? '');
    if (/^\s*[=+@-]/.test(s) || /^[\t\r\n]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  }
  const header = ['attempt_key','puzzle','mode','daily_difficulty','grid_size','started_utc','outcome','seconds','mistakes','stars','review_state','review_note','reviewed_by','review_updated_utc','started_local','review_updated_local','time_zone'];
  const lines = rows.map(row => [row.id, row.puzzle, row.mode, row.difficulty, row.grid,
    new Date(row.started).toISOString(), row.outcome, row.seconds, row.mistakes, row.stars,
    reviews[row.id]?.state, reviews[row.id]?.note, reviews[row.id]?.reviewedBy, reviews[row.id]?.updatedAt,
    localISO(row.started),localISO(reviews[row.id]?.updatedAt),timeZone]);
  return [header, ...lines].map(line => line.map(cell).join(',')).join('\r\n') + '\r\n';
}
