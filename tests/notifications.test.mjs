import test from 'node:test';
import assert from 'node:assert/strict';
import {commerceView,historyView,reviewView} from '../dashboard/notifications.js';
import {localDateTime} from '../dashboard/time.js';
const draft={audience:'player',uid:'a<b',title:'Shop <today>',body:'A & B',destination:'shop'};
test('audience review escapes operator copy and prevents empty sends',()=>{
  const html=reviewView(draft,{players:0,devices:0});
  assert.match(html,/Shop &lt;today&gt;/);assert.match(html,/a&lt;b/);assert.match(html,/data-push="send" disabled/);
  assert.doesNotMatch(reviewView(draft,{players:1,devices:2}),/data-push="send" disabled/);
});
test('history distinguishes device acceptance from player taps and formats local time',()=>{
  const at='2026-11-27T17:40:00Z';
  const html=historyView({items:[{...draft,actor:'sharan',players:1,devices:2,accepted:1,pending:0,failed:1,skipped:0,opened:1,buyers:0,createdAt:at}],hasMore:true},0);
  assert.ok(html.includes(localDateTime(at)));assert.match(html,/1 accepted/);assert.match(html,/1 failed/);assert.match(html,/who tapped/);
});
test('shop report uses real product counts, including zeroes and empty periods',()=>{
  assert.match(commerceView([]),/No verified purchases/);
  const html=commerceView([{product:'purrcels_cozy_bundle_ad_free',purchases:0,buyers:0,revoked:1}]);
  assert.match(html,/Cozy Cat Pack<\/td><td>0<\/td><td>0<\/td><td>1/);
});
