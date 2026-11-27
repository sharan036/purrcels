import {escapeText as e, num} from './views.js?v=4';
import {localDateTime} from './time.js?v=4';
import {head} from './admin-views.js?v=6';

const audiences={player:'One player',all:'All opted-in players',nonowners:'Players without the Cozy Cat Pack'};
const destinations={daily:'Daily Bento',shop:'Fish Treat Shop'};
const products={purrcels_cozy_bundle_ad_free:'Cozy Cat Pack',purrcels_treats_little_paw:'Little Paw Parcel',purrcels_treats_bento_box:'Bento Treasure Box',purrcels_treats_neko_festival:'Neko Festival Chest'};
const button=(action,label,disabled=false)=>'<button type="button" class="button" data-push="'+action+'" '+(disabled?'disabled':'')+'>'+label+'</button>';
const options=(items,selected)=>Object.entries(items).map(([key,label])=>'<option value="'+key+'" '+(key===selected?'selected':'')+'>'+e(label)+'</option>').join('');
const table=(fields,rows)=>'<div class="table-scroll"><table class="admin-table"><thead><tr>'+fields.map(f=>'<th scope="col">'+f+'</th>').join('')+'</tr></thead><tbody>'+rows+'</tbody></table></div>';
export function commerceView(items) {
  return '<section class="card admin-card"><h2>Shop purchases</h2><p class="admin-muted">Verified purchase records created in the last 28 days. Buyer counts are per product.</p>'+
    (items.length?table(['Product','Active purchases','Buyers','Revoked'],items.map(p=>'<tr><td>'+e(products[p.product]||p.product)+'</td><td>'+num(p.purchases)+'</td><td>'+num(p.buyers)+'</td><td>'+num(p.revoked)+'</td></tr>').join('')):'<p class="admin-empty">No verified purchases were recorded in this period.</p>')+'</section>';
}
export function historyView(data,page) {
  return '<div class="admin-section-head"><h2>Send history</h2>'+button('refresh','Refresh')+'</div>'+
    (data.items.length?table(['Message','Audience','Devices','Push service','Opened by','Bought within 7 days','Operator · local time'],data.items.map(m=>
      '<tr><td><details><summary>'+e(m.title)+'</summary><p>'+e(m.body)+'</p><small>Opens '+e(destinations[m.destination])+'</small></details></td>'+
      '<td>'+e(audiences[m.audience])+(m.uid?'<small class="push-secondary">'+e(m.uid)+'</small>':'')+'<small class="push-secondary">'+num(m.players)+' players</small></td><td>'+num(m.devices)+'</td>'+
      '<td>'+num(m.accepted)+' accepted<small class="push-secondary">'+num(m.pending)+' pending · '+num(m.failed)+' failed · '+num(m.skipped)+' skipped</small></td>'+
      '<td>'+num(m.opened)+' players</td><td>'+num(m.buyers)+' players</td><td>'+e(m.actor)+'<small class="push-secondary">'+e(localDateTime(m.createdAt))+'</small></td></tr>').join(''))+
      '<p class="admin-muted">Accepted counts devices that Firebase accepted for delivery. Opens count players who tapped. Buyers made a verified, currently active purchase within seven days of their first recorded tap. A player can qualify for multiple campaigns.</p>':'<p class="admin-empty">No notifications have been queued.</p>')+
    (page||data.hasMore?'<div class="admin-pager">'+button('prev','Previous',!page)+'<span>Page '+(page/20+1)+'</span>'+button('next','Next',!data.hasMore)+'</div>':'');
}
function compose(uid) {
  return '<form id="push-form" class="card admin-card push-form"><h2>New notification</h2><div class="push-fields">'+
    '<label>Audience<select name="audience">'+options(audiences,uid?'player':'nonowners')+'</select></label>'+
    '<label data-player-field '+(uid?'':'hidden')+'>Player UID<input name="uid" maxlength="128" value="'+e(uid||'')+'" '+(uid?'required':'disabled')+' autocomplete="off"><small>Find an account in <a href="#players">Players</a>.</small></label>'+
    '<label>Open on tap<select name="destination">'+options(destinations,'shop')+'</select></label>'+
    '<label class="push-wide">Title<input name="title" maxlength="65" required></label>'+
    '<label class="push-wide">Message<textarea name="body" rows="2" maxlength="220" required></textarea><small>Players may see this text on their lock screen.</small></label></div>'+
    '<button class="button primary" type="submit">Preview notification</button></form><div id="push-review" aria-live="polite"></div>';
}
export function reviewView(draft,reach) {
  return '<section class="card admin-card push-review"><h2>Review notification</h2><p><strong>'+e(draft.title)+'</strong></p><p>'+e(draft.body)+'</p>'+
    '<p>'+e(audiences[draft.audience])+(draft.uid?' · '+e(draft.uid):'')+' · Opens '+e(destinations[draft.destination])+'</p>'+
    '<p><strong>'+num(reach.players)+' eligible '+(reach.players===1?'player':'players')+'</strong> on '+num(reach.devices)+' opted-in '+(reach.devices===1?'device':'devices')+'.</p>'+
    (!reach.devices?'<p class="admin-muted">Sending becomes available when a player in this audience enables game news and offers on a supported app version.</p>':'')+
    '<div class="admin-form-actions">'+button('edit','Edit')+'<button type="button" class="button primary" data-push="send" '+(reach.devices?'':'disabled')+'>Confirm send</button></div></section>';
}
export function createNotifications(content,call,notify) {
  let epoch=0,request=0,page=0,pendingUid=null,review=null,busy=false,active=false;
  const el=id=>content.querySelector('#'+id);
  const error=msg=>{const node=el('push-error');if(node)node.textContent=msg;};
  function leave(){epoch++;request++;active=false;review=null;busy=false;}
  function reset(){leave();pendingUid=null;}
  async function refresh() {
    if(!active)return;
    const version=++request;
    try {
      const data=await call('notifications',{offset:page});
      if(!active || version!==request)return;
      const entry=el('push-compose');
      if(!data.canSend) {
        review=null;
        entry.innerHTML='<section class="card admin-card"><h2>Sending is unavailable</h2><p>'+ (data.ready?'Game writes are disabled on this server.':'The game server needs the Studio notifications database migration.')+'</p></section>';
      } else if(!el('push-form')) entry.innerHTML=compose(pendingUid);
      el('push-commerce').innerHTML=commerceView(data.products);
      el('push-history').innerHTML=historyView(data,page);
      error('');
    } catch(err) {
      if(active && version===request) {
        error(err.status===404?'This game server needs the Studio notifications update.':err.message);
        el('push-history').innerHTML=button('refresh','Retry');
      }
    }
  }
  function show() {
    leave();active=true;page=0;
    content.innerHTML=head('Notifications','Send game news and shop offers to players who opted in.')+
      '<p class="field-error" id="push-error" role="alert"></p><div id="push-compose"></div><section class="card admin-card" id="push-history" aria-live="polite">Reading send history…</section><div id="push-commerce"></div>';
    refresh();
  }
  function unfreeze() {
    const form=el('push-form');
    if(!form)return;
    for(const item of form.elements)item.disabled=false;
    const single=form.elements.audience.value==='player';
    form.querySelector('[data-player-field]').hidden=!single;
    form.elements.uid.disabled=!single;form.elements.uid.required=single;
  }
  content.addEventListener('change',event=>{
    if(active && event.target.form?.id==='push-form' && event.target.name==='audience')unfreeze();
  });
  content.addEventListener('submit',async event=>{
    const form=event.target;
    if(!active || form.id!=='push-form')return;
    event.preventDefault();if(busy || review || !form.reportValidity())return;
    const ticket=epoch, fields=new FormData(form), audience=fields.get('audience');
    const draft={audience,uid:audience==='player'?String(fields.get('uid')).trim():null,destination:fields.get('destination'),
      title:String(fields.get('title')).trim(),body:String(fields.get('body')).trim()};
    if(!draft.title || !draft.body || (audience==='player' && !draft.uid)){error('Complete the audience, title and message.');return;}
    busy=true;error('');for(const item of form.elements)item.disabled=true;
    try {
      const reach=await call('notification-preview',{audience,uid:draft.uid});
      if(ticket!==epoch)return;
      review={...draft,id:crypto.randomUUID(),players:reach.players,devices:reach.devices};
      el('push-review').innerHTML=reviewView(draft,reach);
      el('push-review').querySelector('button').focus();
    } catch(err) {if(ticket===epoch){error(err.message);unfreeze();}}
    finally {if(ticket===epoch)busy=false;}
  });
  content.addEventListener('click',async event=>{
    const btn=event.target.closest('[data-push]');
    if(!active || !btn || btn.disabled || busy)return;
    const action=btn.dataset.push;
    if(action==='refresh' || action==='next' || action==='prev') {
      if(action==='next')page+=20;if(action==='prev')page=Math.max(0,page-20);refresh();return;
    }
    if(!review)return;
    if(action==='edit') {review=null;el('push-review').replaceChildren();unfreeze();el('push-form').elements.title.focus();error('');return;}
    if(action!=='send' || !review.devices)return;
    const ticket=epoch;busy=true;btn.disabled=true;error('');
    try {
      await call('notification-send',review);
      if(ticket!==epoch)return;
      notify('Notification queued. Follow delivery in send history.');pendingUid=null;show();
    } catch(err) {
      if(ticket!==epoch)return;
      if(err.status===409){review=null;el('push-review').replaceChildren();unfreeze();}
      else btn.disabled=false;
      error(err.status===0?'The send response was interrupted. Retry Confirm send using this same draft.':err.message);
    } finally {if(ticket===epoch)busy=false;}
  });
  return {show,refresh,leave,reset,select(uid){pendingUid=uid;},clearSelection(){pendingUid=null;}};
}
