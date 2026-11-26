import {MODES, OUTCOMES, REVIEW_STATES, formatTime, metrics, puzzleName} from './model.js?v=4';
import {icon} from './icons.js?v=4';
import {dateText, localDateTime, zoneLabel} from './time.js?v=4';

export const escapeText = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const num = n => new Intl.NumberFormat('en-US').format(n);
const dateTime = localDateTime;
const cap = text => text ? text[0].toUpperCase() + text.slice(1) : '';
const modeColor = {campaign:'#824867',daily:'#80a999',tower:'#e3a36e'};
const labels = {overview:['Game overview','Ranked play across Campaign, Daily Bento and Neko Tower.'],results:['Game results','Inspect ranked attempts and their server-verified outcomes.'],reviews:['Review queue','Track follow-ups on individual puzzle attempts.'],sources:['Data sources','Game data available to your Studio account.']};
export const pageTitle = key => labels[key][0];

export function select(label, action, options, current, symbol = '') {
  return '<label class="select-wrap">' + (symbol ? icon(symbol) : '') + '<span class="sr">' + label + '</span><select data-filter="' + action + '" aria-label="' + label + '">' +
    Object.entries(options).map(([value, title]) => '<option value="' + value + '"' + (String(current) === value ? ' selected' : '') + '>' + title + '</option>').join('') +
    '</select>' + icon('down') + '</label>';
}
export function heading(view, options = '') {
  const [title, desc] = labels[view];
  return '<div class="page-head"><div><h1>' + title + '</h1><p>' + desc + '</p></div>' +
    (options ? '<div class="head-actions">' + options + '</div>' : '') + '</div>';
}
export const dateSelect = days => select('Reporting period','days',{7:'Last 7 days',14:'Last 14 days',28:'Last 28 days'},days,'calendar');
export const modeSelect = mode => select('Game mode','mode',{all:'All modes',...MODES},mode,'filter');
export const exportButton = '<button class="button" data-action="export">' + icon('download') + 'Export CSV</button>';
const textLink = (href, text) => '<a class="text-link" href="' + href + '">' + text + icon('right') + '</a>';

function delta(value, previous, label, options = {}) {
  const {inverse, points, time} = options;
  if (value == null || previous == null || (!points && !time && previous === 0)) return '<span class="comparison">No comparison available</span>';
  const diff = points || time ? value - previous : (value - previous) / previous * 100;
  if (Math.abs(diff) < .05) return '<span class="comparison">Unchanged ' + label + '</span>';
  const sign = diff > 0 ? '+' : '−';
  const trend = (diff > 0) !== !!inverse ? 'positive' : 'negative';
  const amount = time ? Math.abs(diff).toLocaleString('en-US',{maximumFractionDigits:1}) + 's' :
    Math.abs(diff).toFixed(1).replace(/\.0$/,'') + (points ? ' pp' : '%');
  return '<span class="delta ' + trend + '">' + icon(diff > 0 ? 'up' : 'fall') + sign + amount + '</span><span class="comparison">' + label + '</span>';
}

function puzzleArt() {
  const shape = '0001101111000223344233442';
  const cats = [0,7,14,16,23];
  const cells = [...shape].map((region, i) => '<span class="tile t' + region + '">' +
    (cats.includes(i) ? '<img src="../assets/cat.webp" alt="">' : '') + '</span>').join('');
  return '<div aria-hidden="true" class="hero-art"><span class="spark sp-one">✦</span><span class="spark sp-two">✧</span><span class="spark sp-three">✦</span><div class="art-board">' + cells + '</div></div>';
}

function kpi(title, value, iconName, tone, change) {
  return '<article class="kpi"><div class="kpi-top"><span class="kpi-label">' + title + '</span><span class="kpi-icon ' + tone + '">' + icon(iconName) + '</span></div><strong>' + value + '</strong><div class="change">' + change + '</div></article>';
}

function seriesPath(points) {
  // A monotone-in-y cubic between consecutive samples stays inside the observed range.
  return points.reduce((path, p, i) => {
    if (!i) return 'M' + p.x + ',' + p.y;
    const previous = points[i - 1], mid = (previous.x + p.x) / 2;
    return path + ' C' + mid + ',' + previous.y + ' ' + mid + ',' + p.y + ' ' + p.x + ',' + p.y;
  }, '');
}
function activity(trend) {
  const width = 620, height = 191, left = 38, right = 16, top = 14, bottom = 30;
  const plotH = height - top - bottom, plotW = width - left - right;
  const high = Math.max(1, ...trend.map(d => d.attempts));
  const unit = Math.pow(10, Math.floor(Math.log10(high / 3)));
  const step = Math.max(1, Math.ceil(high / 3 / unit) * unit), ymax = 3 * step;
  const x = i => left + i * plotW / (trend.length - 1);
  const y = value => top + plotH - value / ymax * plotH;
  let lines = '';
  for (let n = 0; n <= 3; n++) lines += '<line class="grid-line" x1="' + left + '" x2="' + (width - right) + '" y1="' + y(n * step) + '" y2="' + y(n * step) + '"/><text x="' + (left-8) + '" y="' + (y(n * step)+4) + '" text-anchor="end">' + n * step + '</text>';
  const ticks = new Set(Array.from({length:Math.min(7,trend.length)}, (_, i) => Math.round(i * (trend.length-1) / 6)));
  const covered = trend.map((row, i) => ({...row,x:x(i)})).filter(row => row.covered);
  const verified = seriesPath(covered.map(p => ({x:p.x, y:y(p.verified)})));
  const started = seriesPath(covered.map(p => ({x:p.x, y:y(p.attempts)})));
  const baseline = y(0);
  const area = verified ? verified + ' L' + covered.at(-1).x + ',' + baseline + ' L' + covered[0].x + ',' + baseline + ' Z' : '';
  for (const i of ticks) lines += '<text x="' + x(i) + '" y="' + (height-7) + '" text-anchor="' + (i === 0 ? 'start' : i === trend.length-1 ? 'end' : 'middle') + '">' + dateText(trend[i].date) + '</text>';
  const dots = covered.map((p,i) => '<circle cx="' + p.x + '" cy="' + y(p.verified) + '" r="' + (i === covered.length-1 ? 4 : 2.7) + '" fill="#814864" stroke="#fff" stroke-width="1.5"><title>' + dateText(p.date) + ' · ' + p.verified + ' verified of ' + p.attempts + '</title></circle>').join('');
  const tabular = trend.map(p => '<tr><td>' + dateText(p.date) + '</td><td>' + (p.covered ? p.attempts : '—') + '</td><td>' + (p.covered ? p.verified : '—') + '</td></tr>').join('');
  return '<section class="card activity"><div class="card-heading"><div><h2>Attempt activity</h2><p>Grouped by local start date · '+escapeText(zoneLabel())+'</p></div><div class="legend"><span><i class="dash-line"></i>Started</span><span><i class="solid-line"></i>Verified</span></div></div>' +
    '<svg class="chart" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Trend of attempts started and verified. Daily counts follow in the data table."><defs><linearGradient id="chart-shade" x1="0" x2="0" y1="0" y2="1" gradientUnits="objectBoundingBox"><stop stop-color="#c79bad" stop-opacity=".42"/><stop offset="1" stop-color="#c79bad" stop-opacity=".06"/></linearGradient></defs>' + lines + '<path d="' + area + '" fill="url(#chart-shade)"/><path d="' + started + '" fill="none" stroke="#82a99d" stroke-width="2.4" stroke-dasharray="5 5"/><path d="' + verified + '" fill="none" stroke="#824867" stroke-width="3"/>' + dots + '</svg>' +
    '<details class="chart-data"><summary>Daily counts</summary><table><thead><tr><th>Date</th><th>Started</th><th>Verified</th></tr></thead><tbody>' + tabular + '</tbody></table></details></section>';
}

function modeMix(counts, total) {
  let angle = 0;
  const arcs = Object.entries(counts).filter(([,n]) => n > 0).map(([mode,n]) => {
    const length = n / total * 100;
    const arc = '<circle cx="58" cy="58" r="47" pathLength="100" fill="none" stroke="' + modeColor[mode] + '" stroke-width="13" stroke-dasharray="' + Math.max(0.05,length - (length<100 ? Math.min(1,length*.12) : 0)) + ' 100" stroke-dashoffset="' + -angle + '"/>';
    angle += length;
    return arc;
  }).join('');
  const list = Object.entries(MODES).map(([mode,name]) => '<li><span class="mode-name"><i class="mode-dot ' + mode + '"></i>' + name + '</span><b title="' + counts[mode] + ' verified solves">' + (total ? Math.round(counts[mode]/total*100) + '%' : '—') + '</b></li>').join('');
  return '<section class="card mix"><div class="card-heading"><div><h2>Solves by mode</h2><p>Share of verified solves</p></div></div><div class="mix-body"><div class="donut"><svg viewBox="0 0 116 116" aria-hidden="true"><circle cx="58" cy="58" r="47" fill="none" stroke="#eee8eb" stroke-width="13"/><g transform="rotate(-90 58 58)">' + arcs + '</g></svg><div><strong>' + num(total) + '</strong><small>solves</small></div></div><ul class="mix-list">' + list + '</ul></div></section>';
}

export function outcomeBadge(name) {
  return '<span class="status ' + name + '"><i></i>' + OUTCOMES[name] + '</span>';
}
function empty(title, body) {
  return '<div class="empty"><span>' + icon('results') + '</span><strong>' + title + '</strong><p>' + body + '</p></div>';
}

export function resultTable(rows, reviews, reviewMode = false) {
  if (!rows.length) return empty(reviewMode ? 'No matching reviews' : 'No attempts in this view',
    reviewMode ? 'Flag an attempt in Game results or change the review filter.' : 'Try another period, mode or search term.');
  const body = rows.map(row => {
    const review = reviews[row.id];
    const status = review ? '<span class="review-pill ' + review.state + '">' + REVIEW_STATES[review.state] + '</span>' : '<span class="quiet">—</span>';
    const title = escapeText(puzzleName(row.puzzle));
    return '<tr><td><button data-id="' + row.id + '" class="row-title" aria-label="Inspect ' + title + '"><span class="row-icon ' + row.mode + '">' + icon(row.mode) + '</span><span><b>' + title + '</b><small>' + (row.difficulty ? cap(row.difficulty) + ' · ' : '') + row.grid + ' × ' + row.grid + '</small></span></button></td><td>' + MODES[row.mode] + '</td><td>' + outcomeBadge(row.outcome) + '</td><td class="tabular">' + formatTime(row.seconds) + '</td><td>' + (reviewMode ? status : localDateTime(row.started)) + '</td><td><button class="row-open" data-id="' + row.id + '" aria-label="Open attempt ' + row.id.slice(-8) + '">' + icon('chevron') + '</button></td></tr>';
  }).join('');
  return '<div class="table-scroll"><table class="results-table"><thead><tr><th>Puzzle</th><th>Mode</th><th>Outcome</th><th>Solve time</th><th>' + (reviewMode ? 'Review' : 'Started') + '</th><th><span class="sr">Inspect</span></th></tr></thead><tbody>' + body + '</tbody></table></div>';
}

export function overview(dataset, period, state) {
  const now = metrics(period.rows);
  const prev = period.hasHistory ? metrics(period.priorRows, period.previousEnd) : {};
  const compare = 'vs prior ' + state.days + ' days';
  const coverage = period.partial ? '<p class="coverage-line">' + icon('info') + 'Coverage starts ' + dateText(dataset.start) + '. Earlier dates are unavailable.</p>' : '';
  return heading('overview', dateSelect(state.days) + exportButton) + coverage +
    '<section class="hero"><div class="hero-content"><div class="hero-label">' + icon('shield') + 'Verified solves</div><strong class="hero-value">' + num(now.verified) + '</strong><div class="hero-change">' + delta(now.verified,prev.verified,compare) + '</div></div>' + puzzleArt() + '</section>' +
    '<div class="kpi-row">' + kpi('Ranked attempts',num(now.attempts),'layers','peach',delta(now.attempts,prev.attempts,compare)) +
    kpi('Completion rate',now.rate == null ? '—' : now.rate.toFixed(1) + '<small>%</small>','target','mint',delta(now.rate,prev.rate,compare,{points:true})) +
    kpi('Median solve time',formatTime(now.median),'timer','lilac',delta(now.median,prev.median,compare,{inverse:true,time:true})) + '</div>' +
    '<div class="analytics-row">' + activity(period.trend) + modeMix(now.modes,now.verified) + '</div>' +
    '<section class="card recent"><div class="card-heading"><div><h2>Recent attempts</h2><p>Latest ranked starts in this period</p></div>' + textLink('#results','View all') + '</div>' + resultTable(period.rows.slice(0,5),state.reviews) + '</section>';
}

export function resultsPanel(filtered, state, reviewMode, serverTotal) {
  const total=serverTotal ?? filtered.length;
  const pages = Math.max(1,Math.ceil(total / 12));
  const page = Math.max(1,Math.min(state.page,pages));
  const start = (page-1)*12;
  return '<div class="card-heading"><div><h2>' + (reviewMode ? 'Reviewed attempts' : 'Ranked attempts') + '</h2><p>' + num(total) + ' matching ' + (total === 1 ? 'attempt' : 'attempts') + '</p></div></div>' +
    resultTable(serverTotal==null?filtered.slice(start,start+12):filtered,state.reviews,reviewMode) + '<div class="pagination"><span>' +
    (total ? num(start+1) + '–' + num(Math.min(start+12,total)) + ' of ' + num(total) : '0 attempts') + '</span><div><button class="button small" data-action="prev"' + (page===1?' disabled':'') + '>Previous</button><button class="button small" data-action="next"' + (page===pages?' disabled':'') + '>Next</button></div></div>';
}

export function listView(filtered, state, reviewMode, queuePanel) {
  const f = state.filters;
  const controls = reviewMode ? exportButton : dateSelect(state.days) + exportButton;
  const reviewFilter = reviewMode ? select('Review state','review',{flagged:'Needs review',resolved:'Resolved',all:'All reviews'},f.review) : '';
  const scope=queuePanel!==undefined?'Reviews cover all dates.':'Reviews cover the loaded reporting window.';
  return heading(reviewMode?'reviews':'results', controls) + (reviewMode ? '<p class="scope-note">' + icon('info') + scope + ' Notes are shared with Studio operators.</p>' : '') +
    '<div class="toolbar"><label class="search">' + icon('search') + '<input id="find-results" type="search" maxlength="150" placeholder="Search puzzle or attempt" aria-label="Search puzzle or attempt" value="' + escapeText(f.search) + '"></label>' +
      modeSelect(state.mode) + select('Attempt outcome','outcome',{all:'All outcomes',...OUTCOMES},f.outcome) +
      select('Daily difficulty','difficulty',{all:'All difficulties',easy:'Easy',medium:'Medium',hard:'Hard'},f.difficulty) + reviewFilter + '</div>' +
    '<section class="card list-panel" id="list-panel">' + (queuePanel ?? resultsPanel(filtered,state,reviewMode)) + '</section>';
}

export function details(row, review) {
  const values = [['Mode',MODES[row.mode]],['Grid',row.grid + ' × ' + row.grid],['Started',dateTime(row.started)],['Completed',row.completed!==null ? dateTime(row.completed) : '—'],
    ['Solve time',formatTime(row.seconds)],['Mistakes',row.mistakes ?? '—'],['Stars',row.stars === null ? '—' : row.stars + ' / 3'],['Daily difficulty',row.difficulty ? cap(row.difficulty) : '—']];
  return '<div class="detail-head"><span class="kpi-icon lilac">' + icon(row.mode) + '</span><button class="square" data-action="close" aria-label="Close attempt">' + icon('close') + '</button></div><h2 id="detail-name">' + escapeText(puzzleName(row.puzzle)) + '</h2><p class="detail-id">Attempt ' + row.id + '</p>' + outcomeBadge(row.outcome) +
    '<dl class="detail-grid">' + values.map(([key,v]) => '<div><dt>' + key + '</dt><dd>' + v + '</dd></div>').join('') + '</dl><div class="review-heading"><h3>Operator review</h3>' +
    (review ? '<span class="review-pill ' + review.state + '">' + REVIEW_STATES[review.state] + '</span>' : '') + '</div><p class="field-help">' + (review?.reviewedBy ? 'Last saved by ' + escapeText(review.reviewedBy) + ' · ' + dateTime(Date.parse(review.updatedAt)) + '.' : 'Saved to the game server.') + ' Reviews leave the verified score intact.</p><label class="note-label" for="review-note">Review note</label><textarea id="review-note" rows="3" maxlength="600" placeholder="What should be checked?">' + escapeText(review?.note || '') + '</textarea><p id="review-error" class="field-error" role="alert"></p>' +
    '<div class="detail-actions">' + (review ? '<button class="button" data-review="' + review.state + '">Save note</button>' : '') +
    '<button class="button primary" data-review="' + (review?.state==='flagged'?'resolved':'flagged') + '">' +
    icon(review?.state==='flagged'?'check':'flag') + (review?.state==='flagged'?'Resolve review':review?'Reopen review':'Flag for review') + '</button></div>';
}
