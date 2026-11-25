import {cleanReview, filterResults, ID_PATTERN, readSnapshot, resultsCsv, selectPeriod} from './model.js';
import {sampleReviews, sampleSnapshot} from './sample.js';
import {icon} from './icons.js';
import {details, escapeText, listView, overview, pageTitle, resultsPanel} from './views.js';
import {competitors, dataSources} from './resources.js';

const $ = query => document.querySelector(query);
const content = $('#content'), dialog = $('#record-dialog');
const operator = $('meta[name="purrcels-runtime"]').content === 'operator';
const freshFilters = () => ({outcome:'all',difficulty:'all',review:'all',search:''});
const views = ['overview','results','reviews','competitors','sources'];
const viewNames = {overview:'Overview',results:'Game results',reviews:'Review queue',competitors:'Competitors',sources:'Data sources'};
const state = {source:operator?'operator':'sample', days:7, mode:'all', filters:freshFilters(), reviews:{}, page:1};
let dataset = null, currentView = '', activeId = null, openRevision = 0, loading = false, failure = '', noticeTimer, sourceGeneration = 0;
let sample;
for (const node of document.querySelectorAll('[data-icon]')) node.innerHTML = icon(node.dataset.icon);

function notify(message) {
  clearTimeout(noticeTimer);
  $('#notice').textContent = message;
  $('#notice').classList.add('visible');
  noticeTimer = setTimeout(() => $('#notice').classList.remove('visible'), 5500);
}
const viewFromHash = () => {
  const value = location.hash.slice(1);
  return views.includes(value) ? value : 'overview';
};
function reviewPrefix(source) { return 'purrcels.studio.review.v1.' + source + '.'; }
function browserReviews(source, data) {
  const reviews = source === 'sample' ? sampleReviews(data) : {};
  const ids = new Set(data.rows.map(row => row.id));
  const prefix = reviewPrefix(source);
  try {
    for (let n = 0; n < localStorage.length; n++) {
      const key = localStorage.key(n);
      if (!key?.startsWith(prefix)) continue;
      const id = key.slice(prefix.length);
      if (!ids.has(id)) continue;
      try { reviews[id] = cleanReview(JSON.parse(localStorage.getItem(key))); } catch { /* Invalid old record. */ }
    }
  } catch { /* Browsing still works with browser storage disabled. Saving reports the error. */ }
  return reviews;
}
function install(data, source, reviews) {
  dataset = data;
  state.source = source;
  state.reviews = reviews;
  state.page = 1; state.mode = 'all'; state.filters = freshFilters();
  if (viewFromHash() === 'reviews') state.filters.review = 'flagged';
  activeId = null; failure = ''; loading = false;
}
function showSample() {
  sourceGeneration++;
  sample ??= readSnapshot(sampleSnapshot());
  install(sample,'sample',browserReviews('sample',sample));
  render();
}
async function fetchLive() {
  const generation = ++sourceGeneration;
  loading = true; failure = ''; render();
  try {
    const res = await fetch('./api/workspace', {cache:'no-store'});
    const body = await res.json();
    if (!res.ok) throw Error(body.error || 'Operator data unavailable.');
    const data = readSnapshot(body.snapshot);
    const reviews = {};
    for (const [id,entry] of Object.entries(body.reviews)) if (ID_PATTERN.test(id)) reviews[id] = cleanReview(entry);
    if (generation !== sourceGeneration) return;
    install(data,'operator',reviews);
    render(); notify('Operator snapshot loaded.');
  } catch (err) {
    if (generation !== sourceGeneration) return;
    loading = false; failure = err.message; render(); notify('Could not load operator data.');
  }
}
function currentRows() {
  if (!dataset) return [];
  const base = currentView === 'reviews' ? dataset.rows.filter(row => state.reviews[row.id] && (state.mode==='all' || row.mode===state.mode)) :
    selectPeriod(dataset,state.days,currentView === 'overview' ? 'all' : state.mode).rows;
  return currentView === 'overview' ? base : filterResults(base,state.filters,state.reviews);
}
function render() {
  const nextView = viewFromHash();
  if (nextView !== currentView) {
    currentView = nextView;
    state.page = 1; state.mode = 'all'; state.filters = freshFilters();
    if (currentView === 'reviews') state.filters.review = 'flagged';
  }
  document.title = viewNames[currentView] + ' · Purrcels Studio';
  $('#crumb').textContent = viewNames[currentView];
  for (const link of document.querySelectorAll('[data-view]')) {
    if (link.dataset.view === currentView) link.setAttribute('aria-current','page');
    else link.removeAttribute('aria-current');
  }
  const sourceLabel = {sample:'Sample data',file:'Imported snapshot',operator:dataset?'Operator snapshot':'Operator offline'}[state.source];
  $('#source-label').textContent = loading && !dataset ? 'Connecting…' : sourceLabel;
  $('#source-chip').dataset.source = state.source;
  const count = Object.values(state.reviews).filter(r => r.state === 'flagged').length;
  $('#queue-count').hidden = !count; $('#queue-count').textContent = count;
  if (currentView === 'competitors') content.innerHTML = competitors();
  else if (currentView === 'sources') content.innerHTML = dataSources(dataset,state,operator);
  else if (!dataset) content.innerHTML = '<h1>' + pageTitle(currentView) + '</h1><section class="card unavailable"><h2>' + (loading?'Reading ranked attempts…':'Operator data unavailable') + '</h2><p>' + (loading?'Connecting to the local PostgreSQL service.':escapeText(failure || 'Choose a data source to begin.')) + '</p>' + (!loading?'<button class="button primary" data-action="live">Retry connection</button> <a class="button" href="#sources">Data sources</a>':'') + '</section>';
  else if (currentView === 'overview') content.innerHTML = overview(dataset,selectPeriod(dataset,state.days),state);
  else content.innerHTML = listView(currentRows(),state,currentView==='reviews');
  if (failure && (dataset || currentView==='sources')) {
    const message = document.createElement('p');
    message.className = 'scope-note warning';
    message.textContent = 'Refresh failed. ' + failure + (dataset ? ' Showing the previously loaded snapshot.' : '');
    content.prepend(message);
  }
  if (dataset && currentView !== 'competitors' && currentView !== 'sources') {
    const foot = document.createElement('footer'); foot.className = 'workspace-foot';
    foot.textContent = sourceLabel + ' · Snapshot ' + new Date(dataset.asOf).toISOString().slice(0,16).replace('T',' ') + ' UTC';
    content.append(foot);
  }
}
function navigate() {
  if (dialog.open) dialog.close();
  toggleNav(false);
  render(); window.scrollTo(0,0); content.focus({preventScroll:true});
}
function toggleNav(open) {
  document.body.classList.toggle('nav-open',open);
  $('#nav-scrim').hidden = !open;
  $('#open-nav').setAttribute('aria-expanded',String(open));
  if (open) $('#close-nav').focus();
}
$('.skip').onclick = e => { e.preventDefault(); content.focus(); content.scrollIntoView({block:'start'}); };
matchMedia('(min-width:761px)').addEventListener('change', e => { if (e.matches) toggleNav(false); });
$('#open-nav').onclick = () => toggleNav(true);
$('#nav-scrim').onclick = $('#close-nav').onclick = () => { toggleNav(false); $('#open-nav').focus(); };
$('#sidebar').addEventListener('click', e => { if (e.target.closest('a')) toggleNav(false); });
document.addEventListener('keydown', e => {
  if (!document.body.classList.contains('nav-open')) return;
  if (e.key === 'Escape') { toggleNav(false); $('#open-nav').focus(); }
  if (e.key === 'Tab') {
    const links = [...document.querySelectorAll('#sidebar a, #sidebar button')], first = links[0], last = links.at(-1);
    if (e.shiftKey && document.activeElement===first) { e.preventDefault(); last.focus(); }
    if (!e.shiftKey && document.activeElement===last) { e.preventDefault(); first.focus(); }
  }
});
function openDetail(id) {
  const row = dataset?.rows.find(r => r.id === id);
  if (!row) return;
  activeId = id; openRevision = state.reviews[id]?.revision || 0;
  $('#detail').innerHTML = details(row,state.reviews[id],state.source);
  if (!dialog.open) dialog.showModal();
  dialog.querySelector('[data-action="close"]').focus();
}
dialog.addEventListener('click', e => {
  if (e.target === dialog) {
    const box = dialog.getBoundingClientRect();
    if (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom) dialog.close();
  }
});
dialog.addEventListener('close',() => {
  const target = document.querySelector('[data-id="' + activeId + '"]');
  activeId = null;
  (target || content).focus({preventScroll:true});
});
async function saveReview(nextState) {
  const id = activeId, source = state.source, expectedRevision = openRevision;
  const note = $('#review-note').value.trim();
  const buttons = [...dialog.querySelectorAll('[data-review]')];
  buttons.forEach(button => button.disabled = true);
  try {
    let entry;
    if (source === 'operator') {
      const res = await fetch('./api/reviews/' + id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({state:nextState,note,expectedRevision})});
      const data = await res.json();
      if (!res.ok) throw Error(data.error || 'Could not save this review.');
      entry = cleanReview(data);
    } else {
      const key = reviewPrefix(source) + id;
      const write = () => {
        let stored;
        try { stored = localStorage.getItem(key); } catch { throw Error('Browser storage is unavailable. Enable it to save reviews.'); }
        const latest = stored ? cleanReview(JSON.parse(stored)) : state.reviews[id];
        if ((latest?.revision || 0) !== expectedRevision) throw Error('This review changed in another tab. Close and reopen it to see the latest note.');
        entry = cleanReview({state:nextState,note,revision:expectedRevision+1,updatedAt:new Date().toISOString()});
        try { localStorage.setItem(key,JSON.stringify(entry)); } catch { throw Error('Browser storage is unavailable or full. The review could not be saved.'); }
      };
      if (navigator.locks) await navigator.locks.request(key,write); else write();
    }
    if (state.source !== source) return;
    state.reviews[id] = entry; render();
    if (dialog.open && activeId===id) dialog.close();
    notify(nextState==='flagged'?'Review saved to the queue.':'Review resolved.');
  } catch (err) {
    if (dialog.open && activeId===id) $('#review-error').textContent = err.message;
    buttons.forEach(button => button.disabled = false);
  }
}
function exportRows() {
  const rows = currentRows();
  const blob = new Blob([resultsCsv(rows,state.reviews)],{type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href=url; a.download='purrcels-' + state.source + '-' + currentView + '-' + new Date(dataset.asOf).toISOString().slice(0,10) + '.csv';
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url),1000);
  notify('Exported ' + rows.length + ' attempts.');
}
document.addEventListener('click', e => {
  const target=e.target.closest('[data-id],[data-review],[data-action]');
  if (!target) return;
  if (target.dataset.id) return openDetail(target.dataset.id);
  if (target.dataset.review) return saveReview(target.dataset.review);
  switch (target.dataset.action) {
    case 'close': dialog.close(); break;
    case 'export': exportRows(); break;
    case 'prev': state.page=Math.max(1,state.page-1); render(); break;
    case 'next': state.page=Math.min(Math.ceil(currentRows().length/12),state.page+1); render(); break;
    case 'sample': showSample(); notify('Sample workspace loaded.'); break;
    case 'import': $('#import-file').click(); break;
    case 'live': if (operator) fetchLive(); break;
    case 'setup': e.preventDefault(); $('#operator-setup').open=true; $('#operator-setup summary').focus(); $('#operator-setup').scrollIntoView({block:'center'}); break;
  }
});
content.addEventListener('change',e => {
  const field=e.target.dataset.filter;
  if (!field) return;
  if (field==='days') state.days=Number(e.target.value);
  else if (field==='mode') state.mode=e.target.value;
  else state.filters[field]=e.target.value;
  state.page=1; render(); content.querySelector('[data-filter="' + field + '"]')?.focus({preventScroll:true});
});
content.addEventListener('input',e => {
  if (e.target.id==='find-results') {
    state.filters.search=e.target.value; state.page=1;
    $('#list-panel').innerHTML=resultsPanel(currentRows(),state,currentView==='reviews');
  }
});
$('#import-file').addEventListener('change',async e => {
  const file=e.target.files[0];
  e.target.value='';
  if (!file) return;
  const generation = ++sourceGeneration;
  try {
    if (file.size > 26*1024*1024) throw Error('Choose a snapshot smaller than 26 MB.');
    let raw; try { raw=JSON.parse(await file.text()); } catch { throw Error('Choose a valid JSON snapshot.'); }
    if (raw?.error==='too_many_attempts') throw Error('Export a shorter snapshot with at most 50,000 attempts.');
    const data=readSnapshot(raw);
    if (generation !== sourceGeneration) return;
    install(data,'file',browserReviews('file',data));
    if (location.hash!=='#overview') location.hash='overview'; else render();
    notify('Imported ' + data.rows.length + ' ranked attempts.');
  } catch (err) {
    if (generation!==sourceGeneration) return;
    loading=false; render(); notify(err.message);
  }
});
window.addEventListener('storage', e => {
  if (state.source!=='operator' && dataset && (!e.key || e.key.startsWith(reviewPrefix(state.source)))) {
    state.reviews=browserReviews(state.source,dataset); render();
  }
});
window.addEventListener('hashchange',navigate);
if (operator) fetchLive(); else showSample();
