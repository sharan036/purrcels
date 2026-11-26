import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {readSnapshot, selectPeriod, metrics, resultsCsv, filterResults, formatTime, DAY, cleanReview} from '../dashboard/model.js';
import {request} from '../dashboard/session.js';
import {details, overview} from '../dashboard/views.js';
import {dataSources, competitors} from '../dashboard/resources.js';

const at = '2026-11-25T12:00:00Z', asOf = Date.parse(at);
function attempt(n, relative, seconds = 10) {
  const started = asOf + relative;
  return {id:String(n).padStart(24,'0'),puzzle:'level_kitten_1',mode:'campaign',difficulty:null,grid:4,
    startedAt:new Date(started).toISOString(),expiresAt:new Date(started+3_600_000).toISOString(),
    completedAt:seconds===null?null:new Date(started+seconds*1000).toISOString(),
    seconds,mistakes:seconds===null?null:0,stars:seconds===null?null:3};
}
function raw(rows = []) {
  return {version:1,from:'2026-09-01T00:00:00Z',asOf:at,attempts:rows};
}
const equalData = raw([attempt(1,-500_000,11),attempt(2,-450_000,23),attempt(3,-400_000,null),attempt(4,-2*DAY,null)]);

test('counts verified attempts, includes outstanding attempts in the denominator and uses server times', () => {
  const d=readSnapshot(equalData);
  assert.deepEqual(d.rows.map(r=>r.outcome),['open','verified','verified','expired']);
  assert.deepEqual(metrics(d.rows),{attempts:4,verified:2,rate:50,median:17,modes:{campaign:2,daily:0,tower:0}});
  assert.equal(formatTime(null),'—');
  assert.equal(formatTime(3600),'1:00:00');
});
test('reporting periods use UTC starts and compare the prior partial day at the matching cutoff', () => {
  const old=-7*DAY;
  const d=readSnapshot(raw([attempt(1,old-5000,3),attempt(2,old-1000,10),attempt(3,old+1000,3),attempt(4,-1000,1)]));
  const p=selectPeriod(d,7);
  assert.equal(p.rows.length,1);
  assert.equal(p.priorRows.length,2);
  assert.equal(metrics(p.priorRows,d.asOf-7*DAY).verified,1);
  assert.equal(p.trend.at(-1).attempts,1);
  assert.equal(p.hasHistory,true);
});
test('empty and short snapshots preserve unavailable values and gaps in coverage', () => {
  const d=readSnapshot({...raw(),from:'2026-11-25T00:00:00Z'});
  const p=selectPeriod(d,7);
  assert.equal(p.partial,true); assert.equal(p.hasHistory,false);
  assert.deepEqual(p.trend.map(t=>t.covered),[false,false,false,false,false,false,true]);
  assert.equal(metrics(d.rows).rate,null);
  assert.equal(metrics(d.rows).median,null);
});
test('rejects duplicate keys, future timestamps, inconsistent score fields and invalid modes', () => {
  const valid=attempt(1,-5000,1);
  for (const patch of [{id:'bad'}, {completedAt:null}, {mode:'practice'}, {mode:['campaign']},
    {stars:4}, {difficulty:'hard'}, {startedAt:'2026-11-26T00:00:00Z'}, {completedAt:'2026-02-30T00:00:00Z'}]) {
    assert.throws(()=>readSnapshot(raw([{...valid,...patch}])));
  }
  assert.throws(()=>readSnapshot(raw([valid,valid])));
  assert.throws(()=>readSnapshot({version:2,attempts:[]}));
  assert.equal(readSnapshot(raw([{...valid,uid:'fixture-only'}])).rows[0].uid,undefined);
});
test('search and daily difficulty apply together; only filtered rows and safely quoted notes are exported', () => {
  const a={...attempt(1,-60000,12),mode:'daily',puzzle:'daily_2026_11_25_hard',difficulty:'hard',grid:8};
  const b={...attempt(2,-55000,11),mode:'daily',puzzle:'daily_2026_11_25_easy',difficulty:'easy',grid:5};
  const d=readSnapshot(raw([a,b]));
  const reviews={[a.id]:{state:'flagged',note:'=A1,"test"\nnext'}};
  const rows=filterResults(d.rows,{outcome:'verified',difficulty:'hard',review:'flagged',search:'2026-11-25'},reviews);
  assert.equal(rows.length,1);
  const csv=resultsCsv(rows,reviews);
  assert.match(csv,/'=A1,""test""\nnext/); assert.ok(!csv.includes(b.id));
  assert.match(csv,/flagged/);
});
test('the first page offers operator login and exposes an empty, hidden workspace', async () => {
  const html=await readFile(new URL('../dashboard/index.html',import.meta.url),'utf8');
  assert.match(html,/<div id="studio-shell" hidden>/);
  assert.match(html,/type="password" autocomplete="current-password"/);
  assert.match(html,/id="sign-in" type="submit" disabled/);
  assert.doesNotMatch(html,/sample\.js|type="file"/);
  assert.match(html,/connect-src https:\/\/purrcels-api\.devinnovations\.co\.in;/);
});
test('the browser client uses the game API and its server-managed session for reads and writes', async () => {
  const transport=async(url,opts)=>{
    assert.equal(opts.credentials,'include'); assert.equal(opts.mode,'cors');
    assert.equal(opts.cache,'no-store'); assert.equal(opts.redirect,'error');
    assert.equal(new URL(url).origin,'https://purrcels-api.devinnovations.co.in');
    if(url.endsWith('/login')){
      assert.equal(opts.method,'POST'); assert.equal(opts.headers['Content-Type'],'application/json');
      assert.equal(JSON.parse(opts.body).username,'test-reader');
      return Response.json({authenticated:true,username:'test-reader'});
    }
    assert.equal(url.endsWith('/session'),true); assert.equal(opts.body,undefined);
    return Response.json({authenticated:false});
  };
  assert.deepEqual(await request('session',undefined,transport),{authenticated:false});
  assert.equal((await request('login',{username:'test-reader'},transport)).username,'test-reader');
});
test('network, authentication and malformed response failures stay distinguishable', async () => {
  for (const [fetcher,status] of [
    [async()=>{throw Error('offline');},0],
    [async()=>Response.json({error:{message:'Sign in to Purrcels Studio.'}},{status:401}),401],
    [async()=>new Response('unreadable',{status:200}),503],
  ]) await assert.rejects(request('workspace',undefined,fetcher),err=>err.status===status);
});
test('an empty database and a failed read have distinct presentations', () => {
  const dataset=readSnapshot(raw());
  const empty=overview(dataset,selectPeriod(dataset,7),{reviews:{},days:7});
  assert.match(empty,/No attempts in this view/);
  assert.match(dataSources(dataset,{profiles:0,progress:0,bests:0},'studiouser'),/0 ranked starts/);
  assert.match(dataSources(null,null,'studiouser'),/Awaiting ranked results/);
  assert.match(competitors(),/Google Play/);
});
test('review notes and recorded operator names are escaped for display', () => {
  const row=readSnapshot(equalData).rows[0];
  const view=details(row,cleanReview({state:'flagged',note:'<check>',reviewedBy:'staff & team',revision:2,updatedAt:at}));
  assert.match(view,/&lt;check&gt;/); assert.match(view,/Last saved by staff &amp; team/);
  assert.doesNotMatch(view,/<check>/);
});
