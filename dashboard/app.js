import {cleanReview, filterResults, ID_PATTERN, readSnapshot, resultsCsv, selectPeriod} from './model.js';
import {request} from './session.js';
import {icon} from './icons.js';
import {details, listView, overview, pageTitle, resultsPanel} from './views.js?v=2';
import {competitors, dataSources} from './resources.js?v=2';

const $ = query => document.querySelector(query);
const content = $('#content'), dialog = $('#record-dialog');
const freshFilters = () => ({outcome:'all',difficulty:'all',review:'all',search:''});
const viewNames = {overview:'Overview',results:'Game results',reviews:'Review queue',competitors:'Competitors',sources:'Data sources'};
const state = {days:7,mode:'all',filters:freshFilters(),reviews:{},page:1};
const viewFromHash = () => Object.hasOwn(viewNames,location.hash.slice(1)) ? location.hash.slice(1) : 'overview';
const channel = typeof BroadcastChannel==='function' ? new BroadcastChannel('purrcels.studio.session') : null;
const pendingKey = 'purrcels.studio.logout-pending';
let identity=null, dataset=null, inventory=null, currentView='', activeId=null, openRevision=0;
let generation=0, listVersion=0, sessionTimer, noticeTimer, failure='', logoutPending=false;
try { logoutPending=sessionStorage.getItem(pendingKey)==='1'; } catch {}
for (const node of document.querySelectorAll('[data-icon]')) node.innerHTML=icon(node.dataset.icon);

function notify(message) {
  clearTimeout(noticeTimer);
  $('#notice').textContent=message; $('#notice').classList.add('visible');
  noticeTimer=setTimeout(()=>$('#notice').classList.remove('visible'),5500);
}
function formState(message, enabled=false, retry=false) {
  $('#login-status').textContent=message;
  $('#sign-in').disabled=!enabled;
  $('#retry-login').hidden=!retry;
  $('#retry-login').textContent=logoutPending ? 'Retry sign-out' : 'Retry connection';
}
function pending(value) {
  logoutPending=value;
  try { if (value) sessionStorage.setItem(pendingKey,'1'); else sessionStorage.removeItem(pendingKey); } catch {}
}
function lock(message,enabled=false,retry=false) {
  generation++; listVersion++; clearTimeout(sessionTimer); clearTimeout(noticeTimer);
  identity=null; dataset=null; inventory=null; failure=''; currentView=''; activeId=null;
  Object.assign(state,{days:7,mode:'all',filters:freshFilters(),reviews:{},page:1});
  if (dialog.open) dialog.close();
  $('#detail').replaceChildren(); content.replaceChildren(); $('#notice').replaceChildren(); $('#notice').classList.remove('visible');
  toggleNav(false); $('#studio-shell').hidden=true; $('#login-screen').hidden=false;
  $('#password').value=''; $('#password').type='password'; $('#show-password').textContent='Show';
  $('#show-password').setAttribute('aria-pressed','false'); $('#show-password').setAttribute('aria-label','Show password');
  document.title='Operator sign-in · Purrcels Studio';
  formState(message,enabled,retry);
}
function activate(user) {
  const expiry=Date.parse(user.expiresAt);
  if (typeof user.username!=='string' || !Number.isFinite(expiry) || expiry<=Date.now()) {
    lock('Your session has expired. Sign in again.',true); return;
  }
  if (identity?.username!==user.username) lock('');
  identity={username:user.username,expiresAt:expiry};
  clearTimeout(sessionTimer);
  sessionTimer=setTimeout(()=>lock('Your session has expired. Sign in again.',true),expiry-Date.now());
  $('#login-screen').hidden=true; $('#studio-shell').hidden=false; $('#password').value='';
  render(); fetchWorkspace();
}
async function checkSession() {
  if (logoutPending) return signOut();
  const epoch=generation;
  if (!identity) formState('Connecting to the game server…');
  try {
    const user=await request('session');
    if (epoch!==generation) return;
    if (user.authenticated===true) activate(user);
    else if (user.authenticated===false) lock('',true);
    else throw Error('The game server returned an unreadable session.');
  } catch (err) {
    if (epoch===generation) lock(err.message,false,true);
  }
}
$('#login-form').addEventListener('submit',async e=>{
  e.preventDefault();
  if ($('#sign-in').disabled || logoutPending) return;
  const epoch=generation, password=$('#password').value;
  formState('Signing in…');
  try {
    const user=await request('login',{username:$('#username').value.trim(),password});
    if (epoch!==generation) return;
    if (user.authenticated!==true) throw Error('Sign-in did not complete.');
    activate(user);
    if (identity) channel?.postMessage('account-changed');
  } catch (err) {
    if (epoch===generation) {
      $('#password').value='';
      formState(err.status===401?'Check your username and password.':err.message,true);
      $('#password').focus();
    }
  }
});
$('#show-password').onclick=()=>{
  const show=$('#password').type==='password';
  $('#password').type=show?'text':'password'; $('#show-password').textContent=show?'Hide':'Show';
  $('#show-password').setAttribute('aria-pressed',String(show)); $('#show-password').setAttribute('aria-label',show?'Hide password':'Show password');
};
async function signOut() {
  pending(true); lock('Signing out…'); const epoch=generation;
  try {
    await request('logout',{});
    if (epoch!==generation) return;
    pending(false); lock('Signed out.',true); channel?.postMessage('signed-out'); $('#username').focus();
  } catch {
    if (epoch===generation) formState('This tab is locked. Retry sign-out to end the session on the game server.',false,true);
  }
}
$('#sign-out').onclick=signOut;
$('#retry-login').onclick=checkSession;
if (channel) channel.onmessage=({data})=>{
  if (data==='signed-out') { pending(false); lock('Signed out.',true); }
  if (data==='account-changed') { lock('Checking your session…'); checkSession(); }
};

async function fetchWorkspace() {
  if (!identity) return;
  const epoch=generation, version=++listVersion;
  try {
    const data=await request('workspace');
    if (epoch!==generation || version!==listVersion) return;
    if (data.operator!==identity.username) { lock('Checking your session…'); return checkSession(); }
    const fresh=readSnapshot(data.snapshot);
    const reviews={};
    for (const [id,value] of Object.entries(data.reviews)) if (ID_PATTERN.test(id)) reviews[id]=cleanReview(value);
    dataset=fresh; inventory=data.inventory; state.reviews=reviews; failure=''; render();
  } catch (err) {
    if (epoch!==generation || version!==listVersion) return;
    if (err.status===401 || err.status===403) return lock('Sign in again to view game results.',true);
    failure=err.message; render();
  }
}
function currentRows() {
  if (!dataset) return [];
  const base = currentView === 'reviews' ? dataset.rows.filter(row => state.reviews[row.id] && (state.mode==='all' || row.mode===state.mode)) :
    selectPeriod(dataset,state.days,currentView === 'overview' ? 'all' : state.mode).rows;
  return currentView === 'overview' ? base : filterResults(base,state.filters,state.reviews);
}
function render() {
  if (!identity) return;
  const next=viewFromHash();
  if (next!==currentView) {
    currentView=next; state.page=1; state.mode='all'; state.filters=freshFilters();
    if (next==='reviews') state.filters.review='flagged';
  }
  document.title=viewNames[currentView]+' · Purrcels Studio'; $('#crumb').textContent=viewNames[currentView];
  for (const link of document.querySelectorAll('[data-view]')) {
    if (link.dataset.view===currentView) link.setAttribute('aria-current','page'); else link.removeAttribute('aria-current');
  }
  $('#source-label').textContent=failure?'Refresh unavailable':'Game server';
  $('#source-chip').dataset.source=failure?'offline':'operator';
  const count=Object.values(state.reviews).filter(r=>r.state==='flagged').length;
  $('#queue-count').hidden=!count; $('#queue-count').textContent=count;
  if (currentView==='competitors') content.innerHTML=competitors();
  else if (currentView==='sources') content.innerHTML=dataSources(dataset,inventory,identity.username);
  else if (!dataset) content.innerHTML='<h1>'+pageTitle(currentView)+'</h1><section class="card unavailable"><h2>'+(failure?'Game results unavailable':'Reading ranked attempts…')+'</h2>'+(failure?'<button class="button" data-action="live">Retry</button>':'')+'</section>';
  else if (currentView==='overview') content.innerHTML=overview(dataset,selectPeriod(dataset,state.days),state);
  else content.innerHTML=listView(currentRows(),state,currentView==='reviews');
  if (failure && currentView!=='competitors') {
    const warning=document.createElement('p'); warning.className='scope-note warning';
    warning.textContent=failure+(dataset?' Showing the last successful refresh.':''); content.prepend(warning);
  }
  if (dataset && !['competitors','sources'].includes(currentView)) {
    const footer=document.createElement('footer'); footer.className='workspace-foot';
    footer.textContent='Game server · Updated '+new Date(dataset.asOf).toISOString().slice(0,16).replace('T',' ')+' UTC';
    content.append(footer);
  }
}
function navigate() {
  if (dialog.open) dialog.close();
  toggleNav(false);
  if (identity) { render(); window.scrollTo(0,0); content.focus({preventScroll:true}); }
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
  $('#detail').innerHTML = details(row,state.reviews[id]);
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
  if (identity) (target || content).focus({preventScroll:true});
});
async function saveReview(nextState) {
  const id=activeId, epoch=generation, row=dataset?.rows.find(r=>r.id===id);
  if (!identity || !row) return;
  const note=$('#review-note').value.trim(), fields=[...dialog.querySelectorAll('[data-review]')];
  fields.forEach(button=>button.disabled=true);
  try {
    const data=await request('reviews/'+id,{state:nextState,note,expectedRevision:openRevision,
      startedAt:new Date(row.started).toISOString(),expectedOperator:identity.username});
    if (epoch!==generation) return;
    listVersion++; state.reviews[id]=cleanReview(data); render();
    if (activeId===id && dialog.open) dialog.close();
    notify(nextState==='flagged'?'Review saved to the queue.':'Review resolved.');
  } catch (err) {
    if (epoch!==generation) return;
    if (err.status===401 || err.status===403) return lock('Sign in again to continue.',true);
    if (err.status===409) await fetchWorkspace();
    if (dialog.open && activeId===id) $('#review-error').textContent=err.status===409?'Another operator changed this review. Reopen the attempt to read the latest note.':err.message;
    fields.forEach(button=>button.disabled=false);
  }
}
function exportRows() {
  const rows = currentRows();
  const blob = new Blob([resultsCsv(rows,state.reviews)],{type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href=url; a.download='purrcels-' + currentView + '-' + new Date(dataset.asOf).toISOString().slice(0,10) + '.csv';
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url),1000);
  notify('Exported ' + rows.length + ' attempts.');
}
document.addEventListener('click',e=>{
  if (!identity) return;
  const target=e.target.closest('[data-id],[data-review],[data-action]');
  if (!target) return;
  if (target.dataset.id) return openDetail(target.dataset.id);
  if (target.dataset.review) return saveReview(target.dataset.review);
  switch (target.dataset.action) {
    case 'close': dialog.close(); break;
    case 'export': if (dataset) exportRows(); break;
    case 'prev': state.page=Math.max(1,state.page-1); render(); break;
    case 'next': state.page=Math.min(Math.ceil(currentRows().length/12),state.page+1); render(); break;
    case 'live': fetchWorkspace(); break;
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
window.addEventListener('hashchange',navigate);
window.addEventListener('pagehide',()=>lock('Checking your session…'));
window.addEventListener('pageshow',e=>{ if (e.persisted) checkSession(); });
document.addEventListener('visibilitychange',()=>{
  if (document.visibilityState==='visible' && identity && !dialog.open) checkSession();
});
setInterval(()=>{
  const editing=document.activeElement?.matches('input,textarea,select');
  if (identity && document.visibilityState==='visible' && !dialog.open && !editing) fetchWorkspace();
},60000);
checkSession();
