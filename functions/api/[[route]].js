// The world scoreboard and the soul counters: a Cloudflare Pages Function over
// a D1 database bound to the project as DB. The tables create themselves on
// first use.
//
//   GET  /api/board                          { top, souls, places }
//   POST /api/start                          { run }                a game begins
//   POST /api/end   { run, outcome, hearts } { seconds, score, rank, qualifies, places, souls }
//   POST /api/name  { run, name }            { rank, top }
//
// A run's time is the server's own clock, from /start to /end: the client
// never sends a time or a score, only whether it won and how many hearts it
// had left, and that is checked for range. Only completed runs (the devil
// beaten) score. Pauses count; the clock never stops.

const TOP = 50;                    // places on the board
const MIN_SECONDS = 50;            // no real run beats the devil faster (~55 s at best)
const MAX_RUN_MS = 2 * 3600e3;     // a run older than this cannot finish
const NAME_MS = 15 * 60e3;         // how long a winner has to give a name
const STARTS_PER_MINUTE = 12;      // per player, to keep a script off the counters

const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, who TEXT, started_at INTEGER NOT NULL, ended_at INTEGER, outcome TEXT, hearts INTEGER, seconds REAL, score INTEGER, name TEXT)',
  'CREATE INDEX IF NOT EXISTS runs_board ON runs (outcome, score DESC)',
  'CREATE INDEX IF NOT EXISTS runs_who ON runs (who, started_at)',
  'CREATE TABLE IF NOT EXISTS souls (k TEXT PRIMARY KEY, n INTEGER NOT NULL)',
  "INSERT OR IGNORE INTO souls (k, n) VALUES ('plays', 0), ('stolen', 0), ('freed', 0)"
];
let ready = null;
function schema(db){
  return ready || (ready = db.batch(SCHEMA.map(s => db.prepare(s))).catch(e => { ready = null; throw e; }));
}

// hearts are worth a thousand each; speed is worth up to 2,500 more
function scoreFor(hearts, seconds){ return hearts * 1000 + Math.max(0, Math.round((300 - seconds) * 10)); }

function json(body, status){
  return new Response(JSON.stringify(body), { status: status || 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
// who is playing, for the rate limit only: a hash of the address, never the address
async function who(request){
  const ip = request.headers.get('CF-Connecting-IP') || '';
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('beat-the-devil:' + ip));
  return [...new Uint8Array(d)].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}
// arcade names: upper case, letters, digits and a little punctuation, 12 at most
function cleanName(s){
  return String(s || '').toUpperCase().replace(/[^A-Z0-9 .\-_'!?]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12);
}

async function souls(db){
  const { results } = await db.prepare('SELECT k, n FROM souls').all();
  const out = { plays: 0, stolen: 0, freed: 0 };
  results.forEach(r => { out[r.k] = r.n; });
  return out;
}
async function top(db){
  const { results } = await db.prepare(
    "SELECT name, score, hearts, seconds, ended_at AS at FROM runs WHERE outcome = 'freed' AND name IS NOT NULL ORDER BY score DESC, ended_at ASC LIMIT ?"
  ).bind(TOP).all();
  return results;
}
// where a score would place among the named
async function rankOf(db, score){
  const r = await db.prepare("SELECT COUNT(*) AS c FROM runs WHERE outcome = 'freed' AND name IS NOT NULL AND score > ?").bind(score).first();
  return (r ? r.c : 0) + 1;
}

async function start(db, request){
  const now = Date.now(), me = await who(request);
  const recent = await db.prepare('SELECT COUNT(*) AS c FROM runs WHERE who = ? AND started_at > ?').bind(me, now - 60e3).first();
  if (recent && recent.c >= STARTS_PER_MINUTE) return json({ error: 'slow down' }, 429);
  const run = crypto.randomUUID();
  const writes = [
    db.prepare('INSERT INTO runs (id, who, started_at) VALUES (?, ?, ?)').bind(run, me, now),
    db.prepare("UPDATE souls SET n = n + 1 WHERE k = 'plays'")
  ];
  // now and then, forget runs that were started and never finished
  if (Math.random() < 0.02) writes.push(db.prepare('DELETE FROM runs WHERE ended_at IS NULL AND started_at < ?').bind(now - 86400e3));
  await db.batch(writes);
  return json({ run });
}

async function end(db, body){
  const now = Date.now(), outcome = body.outcome;
  if (typeof body.run !== 'string' || (outcome !== 'freed' && outcome !== 'stolen')) return json({ error: 'bad request' }, 400);
  const row = await db.prepare('SELECT started_at, ended_at FROM runs WHERE id = ?').bind(body.run).first();
  if (!row) return json({ error: 'no such run' }, 404);
  if (row.ended_at != null) return json({ error: 'already ended' }, 409);
  if (now - row.started_at > MAX_RUN_MS) return json({ error: 'too old' }, 410);
  const seconds = Math.round((now - row.started_at) / 100) / 10;
  let hearts = null, score = null;
  if (outcome === 'freed'){
    hearts = Math.round(Number(body.hearts));
    if (!(hearts >= 1 && hearts <= 5)) return json({ error: 'bad hearts' }, 400);
    if (seconds < MIN_SECONDS) return json({ error: 'implausible' }, 422);
    score = scoreFor(hearts, seconds);
  }
  const res = await db.prepare('UPDATE runs SET ended_at = ?, outcome = ?, hearts = ?, seconds = ?, score = ? WHERE id = ? AND ended_at IS NULL')
    .bind(now, outcome, hearts, seconds, score, body.run).run();
  if (!res.meta || res.meta.changes !== 1) return json({ error: 'already ended' }, 409);
  await db.prepare('UPDATE souls SET n = n + 1 WHERE k = ?').bind(outcome).run();
  const out = { outcome, seconds, places: TOP, souls: await souls(db) };
  if (score != null){ out.score = score; out.rank = await rankOf(db, score); out.qualifies = out.rank <= TOP; }
  return json(out);
}

async function setName(db, body){
  const name = cleanName(body.name);
  if (typeof body.run !== 'string' || !name) return json({ error: 'bad request' }, 400);
  const row = await db.prepare('SELECT outcome, score, ended_at, name FROM runs WHERE id = ?').bind(body.run).first();
  if (!row || row.outcome !== 'freed' || row.score == null) return json({ error: 'no such win' }, 404);
  if (row.name != null) return json({ error: 'already named' }, 409);
  if (Date.now() - row.ended_at > NAME_MS) return json({ error: 'too late' }, 410);
  const rank = await rankOf(db, row.score);
  if (rank > TOP) return json({ error: 'off the board', rank }, 409);
  await db.prepare('UPDATE runs SET name = ? WHERE id = ? AND name IS NULL').bind(name, body.run).run();
  return json({ rank, name, top: await top(db) });
}

export async function onRequest(context){
  const { request, env, params } = context;
  const route = [].concat(params.route || []).join('/');
  if (!env.DB) return json({ error: 'no database bound (DB)' }, 503);
  try {
    await schema(env.DB);
    if (request.method === 'GET' && route === 'board') return json({ top: await top(env.DB), souls: await souls(env.DB), places: TOP });
    if (request.method !== 'POST') return json({ error: 'not found' }, 404);
    const body = await request.json().catch(() => ({}));
    if (route === 'start') return await start(env.DB, request);
    if (route === 'end') return await end(env.DB, body);
    if (route === 'name') return await setName(env.DB, body);
    return json({ error: 'not found' }, 404);
  } catch (e){
    return json({ error: 'server error' }, 500);
  }
}
