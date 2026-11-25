import {DAY} from './model.js';

// Fixed simulated activity keeps screenshots and period comparisons reproducible.
export function sampleSnapshot() {
  const asOf = Date.parse('2026-11-25T23:59:59Z');
  const from = Math.floor(asOf / DAY) * DAY - 55 * DAY;
  const attempts = [];
  let seed = 97243;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const iso = time => new Date(time).toISOString();
  const chapters = ['kitten', 'tabby', 'calico', 'siamese', 'master'];
  const wave = [1, 0.91, 1.05, 0.96, 1.23, 1.38, 1.16];
  for (let day = 0; day < 56; day++) {
    const date = from + day * DAY;
    const volume = Math.round((52 + day * 1.4 + random() * 30) * wave[day % 7]);
    for (let n = 0; n < volume; n++) {
      const pick = random();
      const mode = pick < .5 ? 'campaign' : pick < .84 ? 'daily' : 'tower';
      const started = date + Math.floor((n + random()) / volume * (DAY - 1000));
      const difficulty = mode === 'daily' ? ['easy','medium','hard'][Math.floor(random() * 3)] : null;
      const chapter = Math.floor(random() * chapters.length);
      const level = 1 + Math.floor(random() * 210);
      const floor = 1 + Math.floor(random() * 6);
      const puzzle = mode === 'campaign' ? 'level_' + chapters[chapter] + '_' + level : mode === 'tower' ? 'tower_' + floor :
        'daily_' + iso(date).slice(0,10).replaceAll('-','_') + '_' + difficulty;
      const grid = mode === 'campaign' ? 4 + chapter + (level <= 5 || level > 10 && level % 2 === 1 ? 0 : 1) :
        mode === 'daily' ? {easy:5, medium:6, hard:8}[difficulty] : 4;
      const seconds = 21 + Math.floor(random() * 80 + (grid - 4) * 6);
      const completed = started + seconds * 1000;
      const solved = random() < .74 + .08 * day / 55 && completed <= asOf;
      const mistakes = Math.floor(random() ** 1.9 * 4);
      const id = Array.from({length: 3}, () => Math.floor(random() * 4294967296).toString(16).padStart(8, '0')).join('');
      attempts.push({id, puzzle, mode, difficulty, grid, startedAt:iso(started), expiresAt:iso(started + 30 * 60_000),
        completedAt:solved ? iso(completed) : null, seconds:solved ? seconds : null,
        mistakes:solved ? mistakes : null, stars:solved ? Math.max(1,3 - mistakes) : null});
    }
  }
  return {version:1, from:iso(from), asOf:iso(asOf), attempts};
}

export function sampleReviews(dataset) {
  const notes = ['Compare this completion with other runs on the same board.',
    'Check the difficulty setting against the daily puzzle.', 'Review the timing on this attempt.'];
  return Object.fromEntries(notes.map((note, i) => [dataset.rows[[2,8,16][i]].id,
    {state:'flagged', note, revision:1, updatedAt:new Date(dataset.asOf).toISOString()}]));
}
