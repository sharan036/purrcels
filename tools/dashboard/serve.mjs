import {createServer} from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile, writeFile, mkdir, link, unlink, readdir} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {ID_PATTERN, cleanReview, readSnapshot} from '../../dashboard/model.js';

const run = promisify(execFile);
const root = fileURLToPath(new URL('../../', import.meta.url));
const sql = fileURLToPath(new URL('./snapshot.sql', import.meta.url));
const staticFiles = new Set([
  '/dashboard/index.html', '/dashboard/dashboard.css', '/dashboard/app.js',
  '/dashboard/model.js', '/dashboard/sample.js', '/dashboard/views.js', '/dashboard/resources.js', '/dashboard/icons.js',
  '/dashboard/fonts/plus-jakarta-sans.woff2', '/assets/app-mark.webp', '/assets/cat.webp', '/assets/favicon.png'
]);
const types = {html:'text/html; charset=utf-8', css:'text/css; charset=utf-8', js:'text/javascript; charset=utf-8',
  webp:'image/webp', png:'image/png', woff2:'font/woff2'};

class RequestError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function json(res, status, body) {
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8'});
  res.end(JSON.stringify(body));
}

export async function databaseSnapshot(days = 56) {
  const {stdout} = await run('psql', ['-X', '-w', '-qAt', '-v', 'days=' + days, '-f', sql], {
    env:{...process.env, PGDATABASE:process.env.PGDATABASE || 'purrcels', PGCONNECT_TIMEOUT:'5'},
    timeout:18_000, maxBuffer:26 * 1024 * 1024
  });
  const data = JSON.parse(stdout);
  if (data.error === 'too_many_attempts') throw new RequestError(422, 'This window exceeds 50,000 attempts. Shorten DASHBOARD_DAYS and restart.');
  return data;
}

async function latestReview(directory) {
  let names;
  try { names = await readdir(directory); }
  catch (err) { if (err.code === 'ENOENT') return null; throw err; }
  const revisions = names.filter(n => /^[1-9]\d*\.json$/.test(n)).map(parseFloat);
  if (!revisions.length) return null;
  const revision = revisions.reduce((a,b) => Math.max(a,b), 0);
  return cleanReview(JSON.parse(await readFile(join(directory, revision + '.json'), 'utf8')));
}

async function reviewsFor(directory, ids) {
  let names;
  try { names = await readdir(directory); }
  catch (err) { if (err.code === 'ENOENT') return {}; throw err; }
  const reviews = {};
  for (const id of names) {
    if (!ids.has(id)) continue;
    const review = await latestReview(join(directory, id));
    if (review) reviews[id] = review;
  }
  return reviews;
}

async function storeReview(directory, id, input) {
  const {state, note, expectedRevision} = input ?? {};
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new RequestError(400, 'Invalid review revision.');
  let next;
  try { next = cleanReview({state, note, revision:expectedRevision + 1, updatedAt:new Date().toISOString()}); }
  catch { throw new RequestError(400, 'Choose a review state and a note of up to 600 characters.'); }
  const folder = join(directory, id);
  const current = await latestReview(folder);
  if ((current?.revision ?? 0) !== expectedRevision) throw new RequestError(409, 'Another review was saved. Refresh and check the latest note.');
  await mkdir(folder, {recursive:true, mode:0o700});
  const temp = join(folder, '.' + randomUUID());
  await writeFile(temp, JSON.stringify(next), {mode:0o600, flag:'wx'});
  try {
    // Publish a complete revision atomically. A simultaneous edit cannot replace it.
    await link(temp, join(folder, next.revision + '.json'));
  } catch (err) {
    if (err.code === 'EEXIST') throw new RequestError(409, 'Another review was saved. Refresh and check the latest note.');
    throw err;
  } finally { await unlink(temp); }
  return next;
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 8192) throw new RequestError(413, 'Review is too large.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new RequestError(400, 'Invalid review JSON.'); }
}

export function operatorServer({loadSnapshot = databaseSnapshot, directory, days = 56} = {}) {
  const reviewDir = directory || process.env.DASHBOARD_STATE_DIR ||
    join(process.env.XDG_STATE_HOME || join(homedir(), '.local', 'state'), 'purrcels-studio', 'reviews');
  let cache, inFlight;
  async function workspace() {
    if (cache && Date.now() - cache.loaded < 15_000) return cache;
    if (!inFlight) {
      inFlight = (async () => {
        const snapshot = await loadSnapshot(days);
        const dataset = readSnapshot(snapshot);
        cache = {snapshot, ids:new Set(dataset.rows.map(row => row.id)), loaded:Date.now()};
        return cache;
      })().finally(() => { inFlight = undefined; });
    }
    return inFlight;
  }
  return createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    try {
      const host = req.headers.host || '';
      if (!/^(?:127\.0\.0\.1|localhost)(?::\d{1,5})?$/.test(host) || req.headers['sec-fetch-site'] === 'cross-site') {
        throw new RequestError(403, 'Open the dashboard through your local operator connection.');
      }
      const path = new URL(req.url, 'http://localhost').pathname;
      if (req.method === 'GET' && path === '/dashboard/api/workspace') {
        const data = await workspace();
        return json(res, 200, {snapshot:data.snapshot, reviews:await reviewsFor(reviewDir, data.ids)});
      }
      if (req.method === 'POST' && path.startsWith('/dashboard/api/reviews/')) {
        if (req.headers.origin !== 'http://' + host || req.headers['content-type']?.split(';')[0] !== 'application/json') {
          throw new RequestError(403, 'Open this review inside the operator dashboard.');
        }
        const id = path.slice('/dashboard/api/reviews/'.length);
        if (!ID_PATTERN.test(id) || !cache?.ids.has(id)) throw new RequestError(404, 'Refresh the dataset to review this attempt.');
        return json(res, 200, await storeReview(reviewDir, id, await readBody(req)));
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new RequestError(405, 'Method unavailable.');
      if (path === '/' || path === '/dashboard') { res.writeHead(302, {Location:'/dashboard/'}); return res.end(); }
      const filename = path === '/dashboard/' ? '/dashboard/index.html' : path;
      if (!staticFiles.has(filename)) throw new RequestError(404, 'Page unavailable.');
      let body = await readFile(join(root, filename.slice(1)));
      if (filename.endsWith('/index.html')) body = body.toString().replace('name="purrcels-runtime" content="static"', 'name="purrcels-runtime" content="operator"');
      res.writeHead(200, {'Content-Type':types[filename.split('.').pop()]});
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch (err) {
      // Database and filesystem diagnostics can include private connection details.
      json(res, err instanceof RequestError ? err.status : 503, {error:err instanceof RequestError ? err.message : 'Operator data unavailable. Check the PostgreSQL connection and local review directory.'});
    }
  });
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const port = Number(process.env.DASHBOARD_PORT || 8787);
  const days = Number(process.env.DASHBOARD_DAYS || 56);
  if (!Number.isInteger(days) || days < 1 || days > 56) throw Error('DASHBOARD_DAYS must be 1 to 56.');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Invalid DASHBOARD_PORT.');
  operatorServer({days}).listen(port, '127.0.0.1', () => console.log('Purrcels Studio at http://127.0.0.1:' + port + '/dashboard/'));
}
