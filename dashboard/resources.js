import {icon} from './icons.js';
import {dateText, heading, num, escapeText} from './views.js?v=2';

const peers = [
  {name:'Star Battle: Logic Puzzles',maker:'brennerd',downloads:'100K+',feature:'Two stars per region. Players can check a solution and request hints.',url:'https://play.google.com/store/apps/details?id=com.brennerd.grid_puzzle.star_battle',symbol:'star',tone:'peach'},
  {name:'Queendom: Queens Logic Puzzles',maker:'Cambay Studio',downloads:'10K+',feature:'One queen per region. Classic boards and a fog-of-war mode.',url:'https://play.google.com/store/apps/details?hl=en_US&id=com.queendom.app',symbol:'tower',tone:'lilac'},
  {name:'Regions: Star Battle Puzzles',maker:'Braingym',downloads:'1K+',feature:'Daily and Journey modes, daily streaks and global leaderboards.',url:'https://play.google.com/store/apps/details?id=com.braingym.regions',symbol:'overview',tone:'mint'}
];
const references = [
  {name:'LinkedIn Queens',label:'Social rankings',text:'Players can see their daily win streak and compare scores with their connections. Company and school rankings use average scores.',url:'https://www.linkedin.com/help/linkedin/answer/a6863543'},
  {name:'NYT Connections',label:'Result breakdown',text:'The statistics view shows wins, streaks, perfect puzzles and a distribution of mistakes. An unsuccessful finish still counts as a completed puzzle in that game.',url:'https://thenewyorktimeshelpcenter.helpjuice.com/360011158491-New-York-Times-Games/28525912587924-Connections'},
  {name:'GameAnalytics',label:'Analytics platform',text:'Its progression dashboard tracks successful and failed attempts by level. Purrcels records ranked starts, verified completions and attempts that expire.',url:'https://docs.gameanalytics.com/products-and-features/analytics-iq/dashboards/overview/'}
];
const external = (url,label) => '<a class="text-link" href="' + url + '" target="_blank" rel="noopener noreferrer">' + label + icon('external') + '</a>';

export function competitors() {
  return heading('competitors') + '<section class="card market"><div class="card-heading"><div><h2>Android puzzle market</h2><p>Google Play download thresholds · Checked 25 Nov 2026</p></div><span class="light-chip">' + icon('book') + 'Public data</span></div>' +
    '<div class="table-scroll"><table class="peer-table"><thead><tr><th>Game</th><th>Downloads</th><th>Comparable features</th><th>Source</th></tr></thead><tbody>' + peers.map(p =>
    '<tr><td><div class="peer-name"><span class="kpi-icon ' + p.tone + '">' + icon(p.symbol) + '</span><div><b>' + p.name + '</b><small>' + p.maker + '</small></div></div></td><td><strong class="market-count">' + p.downloads + '</strong></td><td>' + p.feature + '</td><td>' + external(p.url,'Google Play') + '</td></tr>').join('') + '</tbody></table></div><p class="table-note">' + icon('info') + 'These are lifetime download bands for each app. Daily players, retention, revenue and solve rates are undisclosed in these listings.</p></section>' +
    '<section class="ref-section"><h2>How other dashboards show results</h2><div class="reference-grid">' + references.map(r =>
      '<article class="card ref-card"><span class="reference-label">' + r.label + '</span><h3>' + r.name + '</h3><p>' + r.text + '</p>' + external(r.url,'Read source') + '</article>').join('') + '</div></section>';
}

export function dataSources(dataset, inventory, username) {
  const counts = [['Player profiles',inventory?.profiles],['Synced puzzle records',inventory?.progress],['Ranked personal bests',inventory?.bests]];
  const cards = counts.map(([title,count]) => '<article class="kpi"><div class="kpi-label">' + title + '</div><strong>' + (Number.isSafeInteger(count) ? num(count) : '—') + '</strong></article>').join('');
  const coverage = dataset ? num(dataset.rows.length) + (dataset.rows.length===1 ? ' ranked start · ' : ' ranked starts · ') + dateText(dataset.start) + ' – ' + dateText(dataset.asOf,{day:'numeric',month:'short',year:'numeric'}) + ' UTC' : 'Awaiting ranked results';
  return heading('sources') + '<section class="card active-source"><span class="kpi-icon mint">' + icon('server') + '</span><div><h2>Purrcels game server</h2><p>' + coverage + '</p><p>Signed in as ' + escapeText(username) + '</p></div><button class="button refresh-source" data-action="live">' + icon('refresh') + 'Refresh</button></section>' +
    '<section class="ref-section"><h2>All-time cloud records</h2><div class="kpi-row database-counts">' + cards + '</div></section>' +
    '<section class="card definitions"><div class="card-heading"><div><h2>Metric definitions</h2><p>Android ranked gameplay · UTC</p></div></div><dl>' +
    '<div><dt>Ranked attempts</dt><dd>Server-issued attempts whose start falls inside the selected UTC period. The final day ends at the snapshot time.</dd></div>' +
    '<div><dt>Verified solves</dt><dd>Starts in that period with a server-accepted completion. Each completed attempt counts once, including subsequent solves of the same puzzle.</dd></div>' +
    '<div><dt>Completion rate</dt><dd>Verified solves divided by ranked starts. Open and expired attempts stay in the denominator.</dd></div>' +
    '<div><dt>Median solve time</dt><dd>Middle server-calculated duration among verified solves. A dash indicates no measured time.</dd></div>' +
    '<div><dt>Comparison</dt><dd>The preceding period has the same length and UTC cutoff. Percentage points measure changes in completion rate. Missing history appears as unavailable.</dd></div></dl><p class="table-note">Offline play and historical leaderboard rows are outside this dataset.</p></section>';
}
