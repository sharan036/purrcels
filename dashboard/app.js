import {cleanReview, filterResults, ID_PATTERN, readQueuePage, readSnapshot, resultsCsv, selectPeriod} from './model.js?v=4';
import {createAdmin} from './admin.js?v=6';
import {request, reportingZone} from './session.js?v=5';
import {timeZone, localDateKey, localDateTime, zoneLabel} from './time.js?v=4';
import {icon} from './icons.js?v=6';
import {details, escapeText, listView, overview, pageTitle, resultsPanel} from './views.js?v=4';
import {dataSources} from './resources.js?v=4';

const $ = query => document.querySelector(query);
const content = $('#content'), dialog = $('#record-dialog');
const freshFilters = () => ({outcome:'all',difficulty:'all',review:'all',search:''});
const viewNames = {overview:'Overview',results:'Game results',reviews:'Review queue',sources:'Data sources',players:'Players',moderation:'Moderation',notifications:'Notifications'};
const state = {days:7,mode:'all',filters:freshFilters(),reviews:{},page:1};
const adminView = view => ['players','moderation','notifications'].includes(view);
const viewFromHash = () => {
  const view=location.hash.slice(1);
  return Object.hasOwn(viewNames,view) && (!adminView(view)||identity?.role==='superadmin') ? view : 'overview';
};
const channel = typeof BroadcastChannel==='function' ? new BroadcastChannel('purrcels.studio.session') : null;
const pendingKey = 'purrcels.studio.logout-pending';
let identity=null, dataset=null, inventory=null, currentView='', activeId=null, activeAttempt=null, openRevision=0;
let generation=0, listVersion=0, sessionTimer, noticeTimer, failure='', logoutPending=false;
let reviewPage=null, reviewDate=null, reviewVersion=0, reviewTimer, reviewError='', flaggedTotal=null, exportJob=null;
const allDateReviews=()=>currentView==='reviews' && identity?.reviewQueue===true;
try { logoutPending=sessionStorage.getItem(pendingKey)==='1'; } catch {}
for (const node of document.querySelectorAll('[data-icon]')) node.innerHTML=icon(node.dataset.icon);

async function operatorRequest(path,body) {
  if(!identity) throw Error('Sign in to Purrcels Studio.');
  const ticket=generation, username=identity.username;
  try {
    const result=await request(path,{...body,expectedOperator:username});
    if(ticket!==generation) throw Error('Session changed.');
    if(result.operator!==username) {lock('Your account changed. Sign in again.',true);throw Error('Session changed.');}
    return result;
  } catch(err) {
    if(ticket===generation && (err.status===401 || err.status===403)) lock('Your access changed. Sign in again.',true);
    throw err;
  }
}
async function adminRequest(path,body) {
  if(identity?.role!=='superadmin') throw Error('Superadmin access required.');
  return operatorRequest('admin/'+path,path==='stats' ? {...body,timeZone:identity.reportingZone} : body);
}
const admin=createAdmin(content,adminRequest,notify,stats=>{
  if(identity?.reviewQueue) {flaggedTotal=stats.flagged;updateBadge();}
});
function roleUI(role) {
  for(const node of document.querySelectorAll('[data-superadmin]')) node.hidden=role!=='superadmin';
}
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
  clearQueue(); flaggedTotal=null; exportJob=null;
  admin.reset(); roleUI(null);
  identity=null; dataset=null; inventory=null; failure=''; currentView=''; activeId=null; activeAttempt=null;
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
  const role=user.role==='superadmin'?'superadmin':'operator';
  const reviewQueue=user.reviewQueue===true;
  const sameAccount=identity?.username===user.username && identity.role===role && identity.reviewQueue===reviewQueue;
  if (!sameAccount) lock('');
  identity={username:user.username,expiresAt:expiry,role,reviewQueue,reportingZone:reportingZone(user,timeZone)}; roleUI(role);
  clearTimeout(sessionTimer);
  sessionTimer=setTimeout(()=>lock('Your session has expired. Sign in again.',true),expiry-Date.now());
  $('#login-screen').hidden=true; $('#studio-shell').hidden=false; $('#password').value='';
  render();
  if (!adminView(currentView) || sameAccount) refreshVisible();
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
    const data=await request('workspace?timeZone='+encodeURIComponent(identity.reportingZone));
    if (epoch!==generation || version!==listVersion) return;
    if (data.operator!==identity.username) { lock('Checking your session…'); return checkSession(); }
    const fresh=readSnapshot(data.snapshot);
    const reviews={};
    for (const [id,value] of Object.entries(data.reviews)) if (ID_PATTERN.test(id)) reviews[id]=cleanReview(value);
    dataset=fresh; inventory=data.inventory; state.reviews=reviews; failure='';
    if(Number.isSafeInteger(data.flagged)) flaggedTotal=data.flagged;
    render();
  } catch (err) {
    if (epoch!==generation || version!==listVersion) return;
    if (err.status===401 || err.status===403) return lock('Sign in again to view game results.',true);
    failure=err.message; render();
  }
}
function clearQueue() {
  clearTimeout(reviewTimer); reviewVersion++; reviewPage=null; reviewDate=null; reviewError='';
}
function updateBadge() {
  const count=identity?.reviewQueue ? flaggedTotal : Object.values(state.reviews).filter(r=>r.state==='flagged').length;
  $('#queue-count').hidden=!count; $('#queue-count').textContent=count??'';
}
function queuePanel() {
  if(reviewError) return '<div class="unavailable" role="status"><p>'+escapeText(reviewError)+'</p><button class="button" data-action="live">Retry</button></div>';
  if(!reviewPage) return '<p class="unavailable" role="status">Loading reviewed attempts…</p>';
  return resultsPanel(reviewPage.rows,{...state,reviews:reviewPage.reviews},true,reviewPage.total);
}
function paintQueue() {
  const target=$('#list-panel');
  if(!allDateReviews() || !target) return;
  target.innerHTML=queuePanel();
  content.querySelector('[data-action="export"]').disabled=!reviewPage || !!exportJob;
}
function queueFilters() {
  return {mode:state.mode,...state.filters};
}
async function fetchQueue({keepDate=false,clear=false,delay=0}={}) {
  clearTimeout(reviewTimer);
  const version=++reviewVersion;
  if(!keepDate) reviewDate=null;
  if(clear) reviewPage=null;
  reviewError=''; paintQueue();
  if(delay) {
    reviewTimer=setTimeout(()=>fetchQueue(),delay); return;
  }
  try {
    const data=await operatorRequest('review-queue',{...queueFilters(),offset:(state.page-1)*12,asOf:reviewDate});
    if(version!==reviewVersion || !allDateReviews()) return;
    const page=readQueuePage(data), last=Math.max(1,Math.ceil(page.total/12));
    reviewDate=page.asOf; flaggedTotal=page.flagged; updateBadge();
    if(state.page>last) {
      state.page=last; return fetchQueue({keepDate:true,clear:true});
    }
    reviewPage=page; paintQueue();
  } catch(err) {
    if(version===reviewVersion && allDateReviews()) {reviewPage=null;reviewError=err.message;paintQueue();}
  }
}
function refreshVisible() {
  if(adminView(currentView)) return admin.refresh();
  return allDateReviews()?fetchQueue():fetchWorkspace();
}
function findAttempt(id) {
  return (allDateReviews()?reviewPage:dataset)?.rows.find(row=>row.id===id);
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
  if(location.hash && !Object.hasOwn(viewNames,location.hash.slice(1))) history.replaceState(null,'','#overview');
  if (next!==currentView) {
    clearQueue(); listVersion++; exportJob=null; admin.leave(); currentView=next; state.page=1; state.mode='all'; state.filters=freshFilters();
    if (next==='reviews') state.filters.review='flagged';
  }
  $('#studio-zone').textContent=zoneLabel(); $('#studio-zone').title='Display time zone · '+timeZone;
  document.title=viewNames[currentView]+' · Purrcels Studio'; $('#crumb').textContent=viewNames[currentView];
  for (const link of document.querySelectorAll('[data-view]')) {
    if (link.dataset.view===currentView) link.setAttribute('aria-current','page'); else link.removeAttribute('aria-current');
  }
  $('#source-label').textContent=failure?'Refresh unavailable':'Game server';
  $('#source-chip').dataset.source=failure?'offline':'operator';
  updateBadge();
  if (adminView(currentView)) {admin.show(currentView);return;}
  if (allDateReviews()) {content.innerHTML=listView([],state,true,queuePanel());return;}
  if (currentView==='sources') content.innerHTML=dataSources(dataset,inventory,identity.username);
  else if (!dataset) content.innerHTML='<h1>'+pageTitle(currentView)+'</h1><section class="card unavailable"><h2>'+(failure?'Game results unavailable':'Reading ranked attempts…')+'</h2>'+(failure?'<button class="button" data-action="live">Retry</button>':'')+'</section>';
  else if (currentView==='overview') content.innerHTML=overview(dataset,selectPeriod(dataset,state.days),state);
  else content.innerHTML=listView(currentRows(),state,currentView==='reviews');
  if (identity.role==='superadmin' && currentView==='overview' && dataset) {
    const target=document.createElement('div'); target.id='admin-stats';
    content.querySelector('.analytics-row').before(target); admin.summary(target,true);
  }
  if (failure) {
    const warning=document.createElement('p'); warning.className='scope-note warning';
    warning.textContent=failure+(dataset?' Showing the last successful refresh.':''); content.prepend(warning);
  }
  if (dataset && currentView!=='sources') {
    const footer=document.createElement('footer'); footer.className='workspace-foot';
    footer.textContent='Game server · Updated '+localDateTime(dataset.asOf);
    content.append(footer);
  }
}
function navigate() {
  if (dialog.open) dialog.close();
  toggleNav(false);
  if (identity) {
    render(); if(!adminView(currentView)) refreshVisible();
    window.scrollTo(0,0); content.focus({preventScroll:true});
  }
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
$('#sidebar').addEventListener('click', e => {
  const link=e.target.closest('a');
  if (!link) return;
  toggleNav(false);
  if (link.dataset.view===currentView && adminView(currentView) &&
      !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
    e.preventDefault();
    admin.directory();
    window.scrollTo(0,0);
    content.focus({preventScroll:true});
  }
});
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
  const row = findAttempt(id);
  if (!row) return;
  const review=(allDateReviews()?reviewPage.reviews:state.reviews)[id];
  activeId = id; activeAttempt=row; openRevision = review?.revision || 0;
  $('#detail').innerHTML = details(row,review);
  if (identity.role==='superadmin') {
    const button=document.createElement('button');button.type='button';button.className='button';button.dataset.action='inspect-player';
    button.textContent='View player';$('#detail .detail-actions').prepend(button);
  }
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
  activeId = null; activeAttempt=null;
  if (identity) (target || content).focus({preventScroll:true});
});
async function saveReview(nextState) {
  const id=activeId, epoch=generation, row=activeAttempt;
  if (!identity || !row) return;
  const note=$('#review-note').value.trim(), fields=[...dialog.querySelectorAll('[data-review]')];
  fields.forEach(button=>button.disabled=true);
  try {
    const data=await request('reviews/'+id,{state:nextState,note,expectedRevision:openRevision,
      startedAt:new Date(row.started).toISOString(),expectedOperator:identity.username});
    if (epoch!==generation) return;
    listVersion++;
    const saved=cleanReview(data);
    if(dataset?.rows.some(attempt=>attempt.id===id)) state.reviews[id]=saved;
    if(allDateReviews()) await fetchQueue();
    else {render(); if(identity.reviewQueue && !adminView(currentView)) fetchWorkspace();}
    if(epoch!==generation) return;
    if (activeId===id && dialog.open) dialog.close();
    notify(nextState==='flagged'?'Review saved to the queue.':'Review resolved.');
  } catch (err) {
    if (epoch!==generation) return;
    if (err.status===401 || err.status===403) return lock('Sign in again to continue.',true);
    if (err.status===409) await refreshVisible();
    if (dialog.open && activeId===id) $('#review-error').textContent=err.status===409?'Another operator changed this review. Reopen the attempt to read the latest note.':err.message;
    fields.forEach(button=>button.disabled=false);
  }
}
function downloadCsv(parts,count,at) {
  const blob = new Blob(parts,{type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href=url; a.download='purrcels-' + currentView + '-' + localDateKey(at) + '.csv';
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url),1000);
  notify('Exported ' + count + ' attempts.');
}
async function exportRows() {
  if(!allDateReviews()) {
    if(dataset) {const rows=currentRows(); downloadCsv([resultsCsv(rows,state.reviews)],rows.length,dataset.asOf);}
    return;
  }
  if(exportJob || !reviewPage) return;
  const job={}, asOf=reviewPage.asOf, filters=queueFilters(), total=reviewPage.total;
  exportJob=job;
  content.querySelector('[data-action="export"]').disabled=true;
  try {
    const parts=[];
    let offset=0;
    do {
      const data=await operatorRequest('review-queue',{...filters,offset,limit:250,asOf});
      if(exportJob!==job || !allDateReviews()) return;
      const page=readQueuePage(data);
      if(page.total!==total || page.asOf!==asOf || (!page.rows.length && offset<total)) {
        throw Error('The review list changed. Refresh before exporting.');
      }
      const csv=resultsCsv(page.rows,page.reviews);
      parts.push(offset===0?csv:csv.slice(csv.indexOf('\r\n')+2));
      offset+=page.rows.length;
    } while(offset<total);
    downloadCsv(parts,total,asOf);
  } catch(err) {if(exportJob===job) notify(err.message);}
  finally {
    if(exportJob===job) {
      exportJob=null;
      const button=content.querySelector('[data-action="export"]');
      if(allDateReviews() && button) button.disabled=!reviewPage;
    }
  }
}
document.addEventListener('click',e=>{
  if (!identity) return;
  const target=e.target.closest('[data-id],[data-review],[data-action]');
  if (!target) return;
  if (target.dataset.id) return openDetail(target.dataset.id);
  if (target.dataset.review) return saveReview(target.dataset.review);
  switch (target.dataset.action) {
    case 'inspect-player': {
      const row=activeAttempt;
      if(!row || identity.role!=='superadmin') break;
      const ticket=generation;target.disabled=true;
      adminRequest('attempt-owner',{key:row.id,startedAt:new Date(row.started).toISOString()}).then(result=>{
        if(ticket===generation && dialog.open && activeId===row.id){dialog.close();admin.open(result.uid);}
      }).catch(err=>{if(ticket===generation)notify(err.message);}).finally(()=>target.disabled=false);
      break;
    }
    case 'close': dialog.close(); break;
    case 'export': exportRows(); break;
    case 'prev': case 'next': {
      const total=allDateReviews()?reviewPage?.total:currentRows().length;
      if(total==null) break;
      state.page=Math.max(1,Math.min(Math.ceil(total/12),state.page+(target.dataset.action==='next'?1:-1)));
      if(allDateReviews()) fetchQueue({keepDate:true,clear:true}); else render();
      break;
    }
    case 'live': refreshVisible(); break;
  }
});
content.addEventListener('change',e => {
  const field=e.target.dataset.filter;
  if (!field) return;
  if (field==='days') state.days=Number(e.target.value);
  else if (field==='mode') state.mode=e.target.value;
  else state.filters[field]=e.target.value;
  state.page=1;
  if(allDateReviews()) fetchQueue({clear:true});
  else {render();content.querySelector('[data-filter="' + field + '"]')?.focus({preventScroll:true});}
});
content.addEventListener('input',e => {
  if (e.target.id==='find-results') {
    state.filters.search=e.target.value; state.page=1;
    if(allDateReviews()) fetchQueue({clear:true,delay:220});
    else $('#list-panel').innerHTML=resultsPanel(currentRows(),state,currentView==='reviews');
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
  if (identity && document.visibilityState==='visible' && !dialog.open && !editing) {
    if(adminView(currentView)) checkSession(); else refreshVisible();
  }
},60000);
checkSession();
