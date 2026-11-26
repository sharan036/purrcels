import {escapeText as e,num} from './views.js?v=4';
import {icon} from './icons.js?v=4';
import {MODES} from './model.js?v=4';
import {localDateTime as when, zoneLabel} from './time.js?v=4';
const displayName=u=>u.name||u.profile?.display_name||u.identity?.name||'Player';
function valueText(key,value) {
  if(value==null||value==='') return '—';
  if(key.endsWith('_at')||['lastSignIn','lastRefresh','createdAt','expiresAt'].includes(key)) return when(value);
  if(typeof value==='boolean') return value?'Yes':'No';
  if(Array.isArray(value)) return value.join(', ')||'None recorded';
  return String(value);
}
const labels={
  display_name:'Display name',avatar_cat_id:'Avatar',total_solved:'Profile solves',current_streak:'Current streak',best_streak:'Best streak',
  auto_mark_x_enabled:'Auto-mark X',mistake_protection_enabled:'Mistake protection',haptics_enabled:'Haptics',sound_enabled:'Sound',
  last_daily_solved_date:'Last daily solve',last_daily_reward_date:'Last daily reward',unlocked_achievements:'Achievements',
  migrated_from_firestore:'Imported from Firestore',created_at:'Created',updated_at:'Updated',balance:'Fish Treats',debt:'Treat debt',revision:'Revision',
  checkin_streak:'Check-in streak',best_checkin_streak:'Best check-in streak',last_checkin_day:'Last check-in',claimed_streak_prizes:'Claimed streak rewards',
  cutover_ready:'Wallet ready',product_id:'Product',active:'Active',action_tag:'Action',verified:'Verified',binary_authentic:'Authentic app',
  device_secure:'Device integrity',app_check_verified:'App Check verified',app_recognition_verdict:'App recognition',
  device_recognition_verdict:'Device recognition',app_licensing_verdict:'Licensing verdict',version_code:'Version code',reason:'Reason',
  checked_at:'Checked',puzzle_id:'Puzzle',mode:'Mode',grid_size:'Grid',best_time_seconds:'Best time (s)',mistakes_used:'Mistakes',stars:'Stars',
  completed:'Completed',completed_at:'Completed at',attempt_key:'Attempt',difficulty:'Difficulty',started_at:'Started',expires_at:'Expires',
  time_seconds:'Time (s)',review_state:'Review',date_key:'Date',kind:'Operation',purpose:'Purpose',amount:'Treat amount',
  credited_to_wallet:'Credited',settled_debt:'Debt settled',balance_after:'Balance after',purchase_type:'Type',status:'Status',
  credited_treats:'Treats',consumption_complete:'Consumed',revoked_at:'Revoked',credited_at:'Ad reward credited',action:'Action',actor:'Operator',
  lastSignIn:'Last sign-in',lastRefresh:'Last token refresh',createdAt:'Account created',providers:'Linked providers',disabled:'Firebase disabled'
};
function pairs(obj) {
  return '<dl class="admin-facts">'+Object.entries(obj).map(([key,val])=>'<div><dt>'+e(labels[key]||key)+'</dt><dd>'+e(valueText(key,val))+'</dd></div>').join('')+'</dl>';
}
function card(title,body) {return '<section class="card admin-card"><h2>'+e(title)+'</h2>'+body+'</section>';}
function btn(action,label,kind='',extra='') {return '<button type="button" data-admin="'+action+'" class="button '+kind+'" '+extra+'>'+label+'</button>';}
const stateTag=banned=>'<span class="player-status '+(banned?'suspended':'')+'">'+(banned?'Banned':'Active')+'</span>';
const playerLink=(uid,name)=>'<button type="button" class="player-link" data-admin="player" data-uid="'+e(uid)+'"><b>'+e(name)+'</b><small>'+e(uid)+'</small></button>';
export const sections={attempts:'Ranked attempts',progress:'Synced progress',bests:'Ranked bests',daily:'Historical daily ranks',global:'Historical global rank',wallet:'Wallet ledger',purchases:'Purchases',ads:'Rewarded ads',moderation:'Moderation history'};
export function statsView(data,compact=false) {
  const stats=data.stats;
  const items=compact ? [['Game accounts',stats.accounts,'database'],['Ranked players · 7 days',stats.rankedWeek,'players'],['Cozy Cat Pack owners',stats.premium,'layers'],['Active bans',stats.banned,'shield']] :
    [['Game accounts',stats.accounts,'database'],['New profiles · 7 days',stats.newProfiles,'players'],['Ranked players · 24 hours',stats.rankedDay,'timer'],['Ranked players · 7 days',stats.rankedWeek,'players'],['Ranked players · 28 days',stats.rankedMonth,'calendar'],['Cozy Cat Pack owners',stats.premium,'layers'],['Players with active purchases',stats.payers,'database'],['Active bans',stats.banned,'shield']];
  return '<section class="admin-stats"><div class="admin-section-head"><h2>'+ (compact?'Players':'Player statistics') +'</h2>'+
    (compact?'<a class="text-link" href="#players">View players '+icon('right')+'</a>':'<span>Updated '+e(when(stats.asOf))+'</span>')+'</div><div class="admin-metrics">'+items.map(([k,v,s])=>
    '<article class="card admin-metric"><span class="kpi-icon">'+icon(s)+'</span><div><span>'+e(k)+'</span><strong>'+num(v)+'</strong></div></article>').join('')+'</div></section>';
}
export function moderationCounts(data) {
  return '<div class="admin-metrics">'+[['Active bans',data.stats.banned],['Flagged attempts',data.stats.flagged]].map(([k,v])=>
    '<article class="card admin-metric"><div><span>'+k+'</span><strong>'+num(v)+'</strong></div></article>').join('')+'</div>';
}
export function trendView(daily,zone='UTC') {
  const max=Math.max(1,...daily.map(d=>d.players));
  return card('Daily ranked players','<p class="admin-muted">Unique players who started a ranked puzzle · 14 dates · '+e(zoneLabel(Date.now(),zone))+'</p><div class="admin-bars">'+daily.map(d=>
    '<div title="'+e(d.day)+' · '+num(d.players)+' players"><b>'+num(d.players)+'</b><i style="height:'+Math.round(d.players/max*64)+'px"></i><small>'+e(d.day.slice(8))+'</small></div>').join('')+'</div>');
}
export function pager(action,n,more) {
  return '<div class="admin-pager">'+btn(action+'-prev','Previous','',n===0?'disabled':'')+'<span>Page '+num(n/25+1)+'</span>'+btn(action+'-next','Next','',more?'':'disabled')+'</div>';
}
export function head(title,sub,action='') {
  return '<div class="page-head"><div><h1>'+e(title)+'</h1><p>'+e(sub)+'</p></div>'+action+'</div>';
}
export function listShell({source,search,filter}) {
  const firebase=source==='firebase';
  const filters=[['all','All game accounts'],['ranked','Ranked players'],['premium','Cozy Cat Pack owners'],['banned','Banned players']];
  return head('Players','Find a player, inspect their game history and manage online access.',btn('refresh','Refresh'))+
    '<div id="admin-stats"></div><div id="admin-trend"></div><section class="card admin-card"><h2>Player directory</h2>'+
    '<div class="admin-source-tabs" aria-label="Account directory">'+['game','firebase'].map(s=>btn('source',s==='game'?'Game accounts':'Firebase accounts','', 'data-source="'+s+'" aria-pressed="'+(s===source)+'"')).join('')+'</div>'+
    '<form id="admin-search" class="admin-tools"><label>'+ (firebase?'Exact Firebase UID':'Name or UID')+'<input name="search" type="search" maxlength="128" value="'+e(search)+'" placeholder="'+(firebase?'Firebase UID':'Search players')+'"></label>'+
    (firebase?'':'<label>Show<select name="filter">'+filters.map(([k,label])=>'<option value="'+k+'" '+(k===filter?'selected':'')+'>'+label+'</option>').join('')+'</select></label>')+
    '<button class="button" type="submit">'+(firebase?'Find account':'Search')+'</button></form><div id="admin-list" aria-live="polite"></div></section>';
}
export function listResults(result,source,n) {
  const firebase=source==='firebase';
  const header=firebase?['Player','Firebase status','Account created','Last sign-in']:['Player','Game access','Fish Treats','Cozy Cat Pack','Last ranked start'];
  const rows=result.items.map(u=>'<tr><td>'+playerLink(u.uid,displayName(u))+'</td>'+(firebase?
    '<td>'+e(u.disabled?'Disabled':'Enabled')+'</td><td>'+e(when(u.createdAt))+'</td><td>'+e(when(u.lastSignIn))+'</td>':
    '<td>'+stateTag(u.banned)+'</td><td>'+e(u.balance==null?'—':num(u.balance))+'</td><td>'+e(u.premium?'Owned':'—')+'</td><td>'+e(when(u.lastRanked))+'</td>')+'</tr>').join('');
  return (rows?table(header,rows):'<p class="admin-empty">No players match this search.</p>')+pager('list',n,firebase?!!result.next:result.hasMore);
}
function table(columns,rows) {return '<div class="table-scroll"><table class="admin-table"><thead><tr>'+columns.map(k=>'<th>'+e(k)+'</th>').join('')+'</tr></thead><tbody>'+rows+'</tbody></table></div>';}
function facts(title,object,empty) {return card(title,object?pairs(object):'<p class="admin-muted">'+e(empty)+'</p>');}
export function identityView(user) {
  if(!user||user.status==='loading') return '<p class="admin-muted">Reading Firebase account…</p>';
  if(user.status==='missing') return '<p class="admin-muted">No Firebase account found for this UID.</p>';
  if(user.status!=='available') return '<p class="admin-muted">Firebase sign-in details are temporarily unavailable.</p>'+btn('identity','Retry Firebase lookup');
  return pairs({display_name:user.name,createdAt:user.createdAt,lastSignIn:user.lastSignIn,lastRefresh:user.lastRefresh,providers:user.providers,disabled:user.disabled});
}
export function detailView(data,identity) {
  const m=data.moderation,c=data.counts;
  return btn('back','← Back to '+(data.fromAudit?'moderation':'players'),'admin-back')+
    '<header class="admin-profile-head"><div><h1 id="admin-player-name">'+e(displayName(data))+'</h1><p class="admin-uid">'+e(data.uid)+'</p></div><div class="admin-form-actions">'+stateTag(m.active)+btn('refresh-player','Refresh player')+'</div></header>'+
    '<div class="admin-metrics">'+[['Ranked attempts',c.starts],['Verified solves',c.verified],['Synced puzzles',c.progress],['Ranked bests',c.bests]].map(([k,v])=>'<article class="card admin-metric"><div><span>'+k+'</span><strong>'+num(v)+'</strong></div></article>').join('')+'</div>'+
    '<div class="admin-detail-grid">'+facts('Game profile',data.profile,'No synced game profile.')+card('Firebase sign-in','<div id="admin-identity" aria-live="polite">'+identityView(identity)+'</div>')+
    card('Game activity',pairs({'Last ranked start':when(c.lastRanked),'Fastest verified solve':c.fastest==null?null:num(c.fastest)+' s','Recorded purchases':c.purchases,'Rewarded ads credited':c.ads}))+
    facts('Fish Treat wallet',data.wallet,'No wallet initialized.')+facts('Cozy Cat Pack',data.entitlement,'No entitlement recorded.')+
    facts('Latest Play Integrity check',data.integrity,'No integrity check recorded.')+
    card('Online game access','<div class="admin-access">'+stateTag(m.active)+(m.revision?'<p>'+e(m.reason)+'</p><p class="admin-muted">'+e(m.actor)+' · '+e(when(m.createdAt))+(m.expiresAt?' · Ends '+e(when(m.expiresAt)):'')+'</p>':'')+
      '<div id="admin-decision">'+btn('decide',m.active?'Reinstate player':'Ban player',m.active?'':'danger-outline')+'</div></div>')+'</div>'+
    '<section class="card admin-card"><div class="admin-section-head"><h2>Player history</h2><label class="admin-history-label">Records <select id="admin-section">'+Object.entries(sections).map(([k,v])=>'<option value="'+k+'">'+v+'</option>').join('')+'</select></label></div><div id="admin-history" aria-live="polite"></div></section>';
}
export function historyView(result) {
  const keys=Object.keys(result.items[0]||{});
  function value(row,key) {
    if(key!=='mode') return valueText(key,row[key]);
    const mode=row.mode==='campaign' && row.puzzle_id?.startsWith('tower_')?'tower':row.mode;
    return Object.hasOwn(MODES,mode)?MODES[mode]:valueText(key,mode);
  }
  return (keys.length?table(keys.map(k=>labels[k]||k),result.items.map(row=>'<tr>'+keys.map(k=>'<td>'+e(value(row,k))+'</td>').join('')+'</tr>').join('')):'<p class="admin-empty">No records in this section.</p>')+pager('history',result.offset,result.hasMore);
}
export function decisionForm(data) {
  const ban=!data.moderation.active;
  return '<form id="moderation-form" class="moderation-form"><h3>'+e(ban?'Ban ':'Reinstate ')+e(displayName(data))+'?</h3><p>'+ (ban?'Blocks authenticated online play and hides this player from public rankings. Offline guest play remains available.':'Restores authenticated online play and makes eligible scores visible again.')+'</p>'+
    (ban?'<label>Duration<select name="days"><option value="7">7 days</option><option value="1">24 hours</option><option value="30">30 days</option><option value="forever">Until reinstated</option></select></label>':'')+
    '<label>Reason for the moderation log<textarea name="reason" rows="3" minlength="5" maxlength="600" required></textarea></label><p class="field-error" role="alert"></p><div class="admin-form-actions">'+btn('cancel','Cancel')+'<button class="button '+(ban?'danger':'primary')+'" type="submit">Confirm '+(ban?'ban':'reinstatement')+'</button></div></form>';
}
export function auditView(result) {
  const rows=result.items.map(r=>'<tr><td>'+playerLink(r.uid,r.name||'Player')+'</td><td>'+e(r.action==='ban'?'Ban':'Reinstatement')+'</td><td>'+e(r.reason)+'</td><td>'+e(r.actor)+'</td><td>'+e(when(r.created_at))+'</td><td>'+e(when(r.expires_at))+'</td></tr>').join('');
  return (rows?table(['Player','Decision','Reason','Operator','Changed','Expires'],rows):'<p class="admin-empty">No moderation decisions have been recorded.</p>')+pager('audit',result.offset,result.hasMore);
}
