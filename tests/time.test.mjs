import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

function inZone(zone, assertions) {
  const script = `
    import assert from 'node:assert/strict';
    import {localDateTime,localDateKey,localISO,shiftLocalDays,zoneLabel,timeZone} from './dashboard/time.js';
    import {selectPeriod,readSnapshot,resultsCsv} from './dashboard/model.js';
    import {identityView} from './dashboard/admin-views.js';
    ${assertions}
  `;
  const run=spawnSync(process.execPath,['--input-type=module','-e',script],{
    cwd:fileURLToPath(new URL('..',import.meta.url)),env:{...process.env,TZ:zone},encoding:'utf8'
  });
  assert.equal(run.status,0,run.stderr);
}
test('Indian operators see IST, local date rollovers, and matching local and UTC export times',()=>{
  inZone('Asia/Kolkata',`
    const before='2026-11-26T18:29:59.000Z', after='2026-11-26T18:30:00.000Z';
    assert.equal(localDateTime(before),'2026-11-26 23:59 IST');
    assert.equal(localDateTime(after),'2026-11-27 00:00 IST');
    assert.equal(localISO(after),'2026-11-27T00:00:00.000+05:30');
    const cutoff='2026-11-27T04:00:00Z';
    assert.doesNotThrow(()=>readSnapshot({version:1,attempts:[],timeZone:'Asia/Kolkata',from:after,asOf:cutoff}));
    const report=selectPeriod({asOf:Date.parse(cutoff),start:0,rows:[before,after].map(started=>({started:Date.parse(started),outcome:'open'}))},7);
    assert.deepEqual(report.trend.slice(-2).map(row=>[localDateKey(row.date),row.attempts]),[['2026-11-26',1],['2026-11-27',1]]);
    assert.ok(identityView({status:'available',lastSignIn:after}).includes('2026-11-27 00:00 IST'));
    const csv=resultsCsv([{id:'a',started:Date.parse(after)}],{a:{state:'flagged',updatedAt:after}});
    assert.ok(csv.includes(after));assert.ok(csv.includes(localISO(after)));assert.ok(csv.includes(timeZone));
  `);
});
test('New York reporting days and comparisons follow both daylight-saving changes',()=>{
  inZone('America/New_York',`
    for(const [date,expectedPrior,sundayHours] of [
      ['2026-03-09T16:15:00Z','2026-03-02T17:15:00Z',23],
      ['2026-11-02T17:15:00Z','2026-10-26T16:15:00Z',25]
    ]) {
      const report=selectPeriod({asOf:Date.parse(date),start:0,rows:[]},7);
      assert.equal(report.previousEnd,Date.parse(expectedPrior));
      assert.equal((report.trend.at(-1).date-report.trend.at(-2).date)/3600000,sundayHours);
      assert.equal(new Date(report.start).getHours(),0);
    }
    assert.match(localDateTime('2026-11-01T05:30:00Z'),/01:30 EDT$/);
    assert.match(localDateTime('2026-11-01T06:30:00Z'),/01:30 EST$/);
  `);
});
