import {timeZone} from './time.js?v=4';
import {escapeText as escape} from './views.js?v=4';
import {statsView,trendView,moderationCounts,listShell,listResults,detailView,identityView,historyView,decisionForm,auditView,head} from './admin-views.js?v=4';

const loading='<p class="admin-muted" role="status">Loading…</p>';
const unavailable=(message,retry)=>'<p class="admin-muted" role="status">'+escape(message)+'</p><button type="button" class="button" data-admin="'+retry+'">Retry</button>';
const fresh=()=>({search:'',source:'game',filter:'all',offset:0,tokens:[null]});
export function createAdmin(content,call,notify,onStats) {
  let epoch=0, view='', list=fresh(), selected=null, section='attempts', historyPage=0, auditPage=0, pendingUid=null;
  let listVersion=0, historyVersion=0, stats=null, statsAt=0, statsJob=null, saving=false;
  const el=id=>content.querySelector('#'+id);
  function leave() {
    epoch++;listVersion++;historyVersion++; view='';selected=null;saving=false;
  }
  function reset() {
    leave();list=fresh();auditPage=0;pendingUid=null;stats=null;statsAt=0;statsJob=null;
  }
  async function getStats() {
    if(stats && Date.now()-statsAt<60000) return stats;
    if(!statsJob) {
      const job=call('stats',{timeZone}).then(result=>{
        if(statsJob===job){stats=result;statsAt=Date.now();onStats(result.stats);}
        return result;
      }).finally(()=>{if(statsJob===job)statsJob=null;});
      statsJob=job;
    }
    return statsJob;
  }
  async function summary(target,compact) {
    if(!target) return;
    target.innerHTML=stats?(view==='moderation'?moderationCounts(stats):statsView(stats,compact)):loading;
    try {
      const data=await getStats();
      if(!target.isConnected) return;
      target.innerHTML=view==='moderation'?moderationCounts(data):statsView(data,compact);
      if(!compact && el('admin-trend')) el('admin-trend').innerHTML=trendView(data.daily,data.timeZone);
    } catch(err) {if(target.isConnected) target.innerHTML=unavailable(err.message,'stats');}
  }
  async function loadList() {
    const target=el('admin-list'), version=++listVersion;
    if(!target) return;
    target.innerHTML=loading;
    try {
      const result=list.source==='game' ? await call('players',{search:list.search,filter:list.filter,offset:list.offset})
        : await call('firebase-users',{token:list.tokens[list.offset/25]});
      if(!target.isConnected || version!==listVersion) return;
      if(list.source==='firebase') {
        if(result.status!=='available') throw Error('Firebase accounts are temporarily unavailable.');
        list.tokens[list.offset/25+1]=result.next;
      }
      target.innerHTML=listResults(result,list.source,list.offset);
    } catch(err) {if(target.isConnected && version===listVersion) target.innerHTML=unavailable(err.message,'list');}
  }
  async function loadAudit() {
    const target=el('admin-audit'), version=++listVersion;
    if(!target) return;
    target.innerHTML=loading;
    try {
      const result=await call('audit',{offset:auditPage});
      if(target.isConnected && version===listVersion) target.innerHTML=auditView(result);
    } catch(err) {if(target.isConnected && version===listVersion) target.innerHTML=unavailable(err.message,'audit');}
  }
  function directory() {
    epoch++;selected=null;saving=false;
    if(view==='moderation') {
      content.innerHTML=head('Moderation','Review account bans and reinstatements recorded by superadmins.','<button class="button" data-admin="refresh">Refresh</button>')+
        '<div id="admin-stats"></div><section class="card admin-card"><div class="admin-section-head"><h2>Moderation log</h2><a class="text-link" href="#reviews">Review flagged attempts</a></div><div id="admin-audit" aria-live="polite"></div></section>';
      summary(el('admin-stats'),false);loadAudit();return;
    }
    content.innerHTML=listShell(list);summary(el('admin-stats'),false);loadList();
  }
  function refresh() {
    if(el('admin-list')) {summary(el('admin-stats'),false);loadList();}
    else if(el('admin-audit')) {summary(el('admin-stats'),false);loadAudit();}
  }
  async function loadIdentity() {
    if(!selected) return;
    const target=el('admin-identity');
    if(!target) return;
    target.innerHTML=identityView(null);
    try {
      const result=await call('identity',{uid:selected.uid});
      if(!target.isConnected) return;
      target.innerHTML=identityView(result);
      if(result.status==='available') {
        selected.identity=result;
        if(!selected.profile?.display_name && result.name) el('admin-player-name').textContent=result.name;
      }
    } catch(err) {if(target.isConnected) target.innerHTML=unavailable(err.message,'identity');}
  }
  async function loadHistory() {
    if(!selected) return;
    const target=el('admin-history'), version=++historyVersion;
    if(!target) return;
    target.innerHTML=loading;
    try {
      const result=await call('history',{uid:selected.uid,section,offset:historyPage});
      if(target.isConnected && version===historyVersion) target.innerHTML=historyView(result);
    } catch(err) {if(target.isConnected && version===historyVersion) target.innerHTML=unavailable(err.message,'history');}
  }
  async function player(uid,keepHistory=false) {
    const ticket=++epoch;selected=null;saving=false;
    if(!keepHistory){section='attempts';historyPage=0;}
    content.innerHTML=loading;
    try {
      const profile=await call('player',{uid});
      if(ticket!==epoch) return;
      selected=profile;profile.fromAudit=view==='moderation';
      content.innerHTML=detailView(profile,profile.identity);el('admin-section').value=section;
      if(!profile.identity) loadIdentity();
      loadHistory();
      content.focus({preventScroll:true});
    } catch(err) {
      if(ticket!==epoch) return;
      content.innerHTML='<button type="button" class="button" data-admin="back">Back to directory</button>'+unavailable(err.message,'retry-player');
      content.querySelector('[data-admin="retry-player"]').dataset.uid=uid;
    }
  }
  async function decide(form) {
    if(!selected || saving || !form.reportValidity()) return;
    const {uid,moderation}=selected,ticket=epoch,fields=new FormData(form),reason=String(fields.get('reason')||'').trim();
    const error=form.querySelector('[role="alert"]');
    if(reason.length<5){error.textContent='Enter at least five characters for the audit log.';return;}
    const action=moderation.active?'reinstate':'ban',days=fields.get('days');
    saving=true;
    for(const input of form.elements)input.disabled=true;
    try {
      await call('moderate',{uid,action,reason,days:days==null||days==='forever'?null:Number(days),expectedRevision:moderation.revision});
      if(ticket!==epoch) return;
      stats=null;statsAt=0;statsJob=null;
      notify(action==='ban'?'Player banned from online play.':'Player reinstated.');
      await player(uid,true);
    } catch(err) {
      if(ticket!==epoch) return;
      if(err.status===409){notify('Player status changed. The latest decision has been loaded.');await player(uid,true);return;}
      error.textContent=err.message;
      for(const input of form.elements)input.disabled=false;
    } finally {if(ticket===epoch)saving=false;}
  }
  content.addEventListener('click',event=>{
    const button=event.target.closest('[data-admin]');if(!button||button.disabled)return;
    const action=button.dataset.admin;
    if(action==='stats'){statsAt=0;summary(el('admin-stats'),view!=='players');return;}
    if(!view)return;
    switch(action){
      case 'player': case 'retry-player': player(button.dataset.uid);break;
      case 'back': directory();break;
      case 'list': loadList();break;
      case 'list-next': list.offset+=25;loadList();break;
      case 'list-prev': list.offset=Math.max(0,list.offset-25);loadList();break;
      case 'source': list={...fresh(),source:button.dataset.source};directory();break;
      case 'refresh': statsAt=0;directory();break;
      case 'identity': loadIdentity();break;
      case 'refresh-player': if(selected && !saving && !el('moderation-form')) player(selected.uid,true);break;
      case 'history': loadHistory();break;
      case 'history-next': historyPage+=25;loadHistory();break;
      case 'history-prev': historyPage=Math.max(0,historyPage-25);loadHistory();break;
      case 'audit': loadAudit();break;
      case 'audit-next': auditPage+=25;loadAudit();break;
      case 'audit-prev': auditPage=Math.max(0,auditPage-25);loadAudit();break;
      case 'decide':
        content.querySelector('[data-admin="refresh-player"]').disabled=true;
        el('admin-decision').innerHTML=decisionForm(selected);
        el('moderation-form').querySelector('textarea').focus();break;
      case 'cancel': if(!saving)player(selected.uid,true);break;
    }
  });
  content.addEventListener('submit',event=>{
    const form=event.target;
    if(form.id==='moderation-form'){event.preventDefault();decide(form);}
    if(form.id==='admin-search'){
      event.preventDefault();const fields=new FormData(form);
      list.search=String(fields.get('search')||'').trim();
      list.filter=String(fields.get('filter')||'all');list.offset=0;list.tokens=[null];
      if(list.source==='firebase' && list.search)player(list.search);else loadList();
    }
  });
  content.addEventListener('change',e=>{
    if(e.target.id==='admin-section'){section=e.target.value;historyPage=0;loadHistory();}
    if(e.target.name==='filter' && e.target.form?.id==='admin-search')e.target.form.requestSubmit();
  });
  return {reset,leave,summary,directory,refresh,show(next){
    if(view===next)return;
    view=next;
    if(pendingUid){const uid=pendingUid;pendingUid=null;player(uid);}else directory();
  },open(uid){pendingUid=uid;if(view==='players'){pendingUid=null;player(uid);}else location.hash='players';}};
}
