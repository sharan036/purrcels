import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {localDateTime} from '../dashboard/time.js';
import {listResults,detailView,identityView,decisionForm,historyView,auditView,statsView} from '../dashboard/admin-views.js';

test('administration navigation starts hidden on a public or older operator session',async()=>{
  const html=await readFile(new URL('../dashboard/index.html',import.meta.url),'utf8');
  assert.match(html,/<a href="#players"[^>]+data-superadmin hidden/);assert.match(html,/<a href="#moderation"[^>]+data-superadmin hidden/);
});
test('player names, notes, provider identifiers and UIDs are rendered as text',()=>{
  const uid='test"<uid>',name='<name>',note='<reason>';
  const player={uid,name,counts:{starts:1,verified:1,progress:1,bests:1},moderation:{revision:1,active:true,reason:note,actor:'op'}};
  const results=listResults({items:[{uid,name,banned:true}],hasMore:false},'game',0);
  const detail=detailView(player,{status:'available',providers:['<provider>']});
  const audit=auditView({items:[{uid,name,reason:note,action:'ban',actor:'op'}],offset:0,hasMore:false});
  for(const html of [results,detail,audit])assert.doesNotMatch(html,/<name>|<uid>|<reason>|<provider>/);
  assert.match(results,/data-uid="test&quot;&lt;uid&gt;"/);assert.match(detail,/&lt;reason&gt;/);
  assert.match(historyView({items:[],offset:0,hasMore:false}),/No records/);
});
test('Firebase availability, last sign-in and last token refresh remain distinguishable',()=>{
  assert.match(identityView({status:'missing'}),/No Firebase account/);assert.match(identityView({status:'unavailable'}),/Retry Firebase/);
  const result=identityView({status:'available',createdAt:'2026-11-10T02:00:00Z',lastSignIn:'2026-11-12T03:00:00Z',lastRefresh:null,providers:[],disabled:false});
  assert.ok(result.includes('Last sign-in</dt><dd>'+localDateTime('2026-11-12T03:00:00Z')));assert.match(result,/Last token refresh<\/dt><dd>—/);
});
test('ban and reinstatement require an explicit reason and confirmation',()=>{
  const player={name:'Selected player',moderation:{active:false}};
  assert.match(decisionForm(player),/Confirm ban/);assert.match(decisionForm(player),/name="reason"[^>]*required/);
  player.moderation.active=true;assert.match(decisionForm(player),/Confirm reinstatement/);assert.doesNotMatch(decisionForm(player),/name="days"/);
});
test('player statistics describe the actual measured activity and preserve true zeroes',()=>{
  const html=statsView({stats:{accounts:0,newProfiles:0,rankedDay:0,rankedWeek:0,rankedMonth:0,premium:0,payers:0,banned:0}},false);
  assert.match(html,/Ranked players · 24 hours/);assert.match(html,/New profiles · 7 days/);assert.equal((html.match(/<strong>0<\/strong>/g)||[]).length,8);
});
test('player history displays Neko Tower, Campaign and Daily Bento consistently',()=>{
  const html=historyView({offset:0,hasMore:false,items:[
    {puzzle_id:'tower_7',mode:'campaign'},{puzzle_id:'level_kitten_7',mode:'campaign'},{puzzle_id:'daily_2026_11_26_easy',mode:'daily'}
  ]});
  assert.match(html,/<td>tower_7<\/td><td>Neko Tower<\/td>/);
  assert.match(html,/<td>level_kitten_7<\/td><td>Campaign<\/td>/);
  assert.match(html,/<td>daily_2026_11_26_easy<\/td><td>Daily Bento<\/td>/);
});
