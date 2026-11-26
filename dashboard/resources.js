import {icon} from './icons.js?v=4';
import {heading, num, escapeText} from './views.js?v=4';
import {localDateTime, zoneLabel} from './time.js?v=4';

export function dataSources(dataset, inventory, username) {
  const counts = [['Player profiles',inventory?.profiles],['Synced puzzle records',inventory?.progress],['Ranked personal bests',inventory?.bests]];
  const cards = counts.map(([title,count]) => '<article class="kpi"><div class="kpi-label">' + title + '</div><strong>' + (Number.isSafeInteger(count) ? num(count) : '—') + '</strong></article>').join('');
  const coverage = dataset ? num(dataset.rows.length) + (dataset.rows.length===1 ? ' ranked start · ' : ' ranked starts · ') + localDateTime(dataset.start) + ' – ' + localDateTime(dataset.asOf) : 'Awaiting ranked results';
  return heading('sources') + '<section class="card active-source"><span class="kpi-icon mint">' + icon('server') + '</span><div><h2>Purrcels game server</h2><p>' + coverage + '</p><p>Signed in as ' + escapeText(username) + '</p></div><button class="button refresh-source" data-action="live">' + icon('refresh') + 'Refresh</button></section>' +
    '<section class="ref-section"><h2>All-time cloud records</h2><div class="kpi-row database-counts">' + cards + '</div></section>' +
    '<section class="card definitions"><div class="card-heading"><div><h2>Metric definitions</h2><p>Android ranked gameplay · ' + escapeText(zoneLabel()) + '</p></div></div><dl>' +
    '<div><dt>Ranked attempts</dt><dd>Server-issued attempts whose start falls inside the selected local calendar dates. The final day ends at the snapshot time.</dd></div>' +
    '<div><dt>Verified solves</dt><dd>Starts in that period with a server-accepted completion. Each completed attempt counts once, including subsequent solves of the same puzzle.</dd></div>' +
    '<div><dt>Completion rate</dt><dd>Verified solves divided by ranked starts. Open and expired attempts stay in the denominator.</dd></div>' +
    '<div><dt>Median solve time</dt><dd>Middle server-calculated duration among verified solves. A dash indicates no measured time.</dd></div>' +
    '<div><dt>Comparison</dt><dd>The preceding period uses the same number of local dates and ends at the same local clock time. Percentage points measure changes in completion rate. Missing history appears as unavailable.</dd></div></dl><p class="table-note">Offline play and historical leaderboard rows are outside this dataset.</p></section>';
}
