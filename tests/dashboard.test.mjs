import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readSnapshot, selectPeriod, metrics, resultsCsv, filterResults, formatTime, DAY} from '../dashboard/model.js';
import {sampleSnapshot, sampleReviews} from '../dashboard/sample.js';
import {operatorServer} from '../tools/dashboard/serve.mjs';

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
test('sample history spans both comparison windows and includes reviewable starts in all three modes', () => {
  const d=readSnapshot(sampleSnapshot()), p=selectPeriod(d,28);
  assert.equal(p.hasHistory,true); assert.equal(p.trend.length,28);
  assert.deepEqual(new Set(d.rows.map(r=>r.mode)),new Set(['daily','tower','campaign']));
  assert.equal(Object.keys(sampleReviews(d)).length,3);
  assert.equal(p.trend.reduce((sum,r)=>sum+r.attempts,0),p.rows.length);
});

async function openServer(t,loadSnapshot,dir) {
  const server=operatorServer({loadSnapshot,directory:dir});
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const origin='http://127.0.0.1:'+server.address().port;
  const record=(id,body,source=origin) => fetch(origin+'/dashboard/api/reviews/'+id,{method:'POST',
    headers:{Origin:source,'Content-Type':'application/json'},body:JSON.stringify(body)});
  return {origin,record,workspace:()=>fetch(origin+'/dashboard/api/workspace')};
}
test('operator serves only approved assets, selects the live runtime and exposes its current snapshot', async t => {
  const dir=await mkdtemp(join(tmpdir(),'purrcels-tests-')); t.after(()=>rm(dir,{recursive:true,force:true}));
  const api=await openServer(t,async()=>equalData,dir);
  assert.match(await (await fetch(api.origin+'/dashboard/')).text(),/name="purrcels-runtime" content="operator"/);
  for (const path of ['app.js','model.js','resources.js','views.js','icons.js','sample.js','dashboard.css','fonts/plus-jakarta-sans.woff2']) {
    assert.equal((await fetch(api.origin+'/dashboard/'+path)).status,200,path);
  }
  assert.equal((await fetch(api.origin+'/tools/dashboard/README.md')).status,404);
  const value=await (await api.workspace()).json();
  assert.deepEqual(value.snapshot,equalData); assert.deepEqual(value.reviews,{});
});
test('review revisions survive restart, reject simultaneous stale edits and preserve verified scores', async t => {
  const dir=await mkdtemp(join(tmpdir(),'purrcels-tests-')); t.after(()=>rm(dir,{recursive:true,force:true}));
  const a=await openServer(t,async()=>equalData,dir), b=await openServer(t,async()=>equalData,dir);
  await a.workspace(); await b.workspace();
  const id=equalData.attempts[0].id;
  const body={state:'flagged',note:'Check run',expectedRevision:0};
  const pair=await Promise.all([a.record(id,body),b.record(id,body)]);
  assert.deepEqual(pair.map(r=>r.status).sort(),[200,409]);
  assert.equal((await a.record(id,{state:'resolved',note:'Checked',expectedRevision:1})).status,200);
  const restarted=await openServer(t,async()=>equalData,dir);
  const data=await (await restarted.workspace()).json();
  assert.equal(data.reviews[id].state,'resolved'); assert.equal(data.reviews[id].revision,2);
  assert.equal((await restarted.record(id,{...body,expectedRevision:2})).status,200);
  assert.deepEqual(data.snapshot,equalData);
});
test('a wrong origin, an unknown attempt and invalid notes cannot create review records', async t => {
  const dir=await mkdtemp(join(tmpdir(),'purrcels-tests-')); t.after(()=>rm(dir,{recursive:true,force:true}));
  const api=await openServer(t,async()=>equalData,dir); await api.workspace();
  const id=equalData.attempts[0].id, body={state:'flagged',note:'Test note',expectedRevision:0};
  assert.equal((await api.record(id,body,'https://example.org')).status,403);
  assert.equal((await api.record('f'.repeat(24),body)).status,404);
  assert.equal((await api.record(id,{...body,note:'x'.repeat(601)})).status,400);
  assert.deepEqual((await (await api.workspace()).json()).reviews,{});
});
test('a failed database read returns an explicit unavailable response without a sample fallback', async t => {
  const api=await openServer(t,async()=>{throw Error('fixture diagnostic');},tmpdir());
  const res=await api.workspace();
  assert.equal(res.status,503); assert.doesNotMatch(JSON.stringify(await res.json()),/fixture diagnostic|attempts/);
});
