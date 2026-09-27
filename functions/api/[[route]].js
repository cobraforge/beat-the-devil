// The world scoreboard and the soul counters: a Cloudflare Pages Function over
// a D1 database bound to the project as DB. The tables create themselves on
// first use.
//
//   GET  /api/board?level=1|2                        { top, souls, places, level }
//   POST /api/start { level }                        { run }        a game begins
//   POST /api/end   { run, outcome, hearts, saved }  { seconds, score, rank, qualifies, places, souls }
//   POST /api/name  { run, name }                    { rank, top }
//
// Each level has its own board. Level 2 (The Stolen) also scores the souls a
// player brought out (`saved`, 0..7), and every one of them counts toward the
// world's 'returned', won or lost.
//
// A run's time is the server's own clock, from /start to /end: the client
// never sends a time or a score, only whether it won and how many hearts it
// had left, and that is checked for range. Only completed runs (the devil
// beaten) score. Pauses count; the clock never stops.

const TOP = 50;                    // places on the board
const MIN_SECONDS = { 1: 50, 2: 55 };   // no real run is faster (level 1 ~55 s at best; level 2's rescue alone is 50)
const SOULS = 7;                   // souls in level 2's cages
const MAX_RUN_MS = 2 * 3600e3;     // a run older than this cannot finish
const NAME_MS = 15 * 60e3;         // how long a winner has to give a name
const STARTS_PER_MINUTE = 12;      // per player, to keep a script off the counters

const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, who TEXT, started_at INTEGER NOT NULL, ended_at INTEGER, outcome TEXT, hearts INTEGER, seconds REAL, score INTEGER, name TEXT)',
  'CREATE INDEX IF NOT EXISTS runs_board ON runs (outcome, score DESC)',
  'CREATE INDEX IF NOT EXISTS runs_who ON runs (who, started_at)',
  'CREATE TABLE IF NOT EXISTS souls (k TEXT PRIMARY KEY, n INTEGER NOT NULL)',
  "INSERT OR IGNORE INTO souls (k, n) VALUES ('plays', 0), ('stolen', 0), ('freed', 0), ('returned', 0)"
];
// columns added after the board went live: each is tried on its own and a
// 'duplicate column' refusal means it is already there
const ADDED = [
  'ALTER TABLE runs ADD COLUMN level INTEGER NOT NULL DEFAULT 1',
  'ALTER TABLE runs ADD COLUMN saved INTEGER',
  'CREATE INDEX IF NOT EXISTS runs_level_board ON runs (level, outcome, score DESC)'
];
let ready = null;
function schema(db){
  return ready || (ready = (async () => {
    await db.batch(SCHEMA.map(s => db.prepare(s)));
    for (const sql of ADDED){
      try { await db.prepare(sql).run(); }
      catch (e){ if (!/duplicate column/i.test(String(e && e.message || e))) throw e; }
    }
  })().catch(e => { ready = null; throw e; }));
}
function levelOf(v){ return Number(v) === 2 ? 2 : 1; }

// hearts are worth a thousand each; speed is worth up to 2,500 more; in level 2
// every soul brought out is worth five hundred
function scoreFor(hearts, seconds, saved){ return hearts * 1000 + Math.max(0, Math.round((300 - seconds) * 10)) + 500 * (saved || 0); }

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
  const out = { plays: 0, stolen: 0, freed: 0, returned: 0 };
  results.forEach(r => { out[r.k] = r.n; });
  return out;
}
async function top(db, level){
  const { results } = await db.prepare(
    "SELECT name, score, hearts, seconds, saved, ended_at AS at FROM runs WHERE level = ? AND outcome = 'freed' AND name IS NOT NULL ORDER BY score DESC, ended_at ASC LIMIT ?"
  ).bind(level, TOP).all();
  return results;
}
// where a score would place among the named, on its level's board
async function rankOf(db, level, score){
  const r = await db.prepare("SELECT COUNT(*) AS c FROM runs WHERE level = ? AND outcome = 'freed' AND name IS NOT NULL AND score > ?").bind(level, score).first();
  return (r ? r.c : 0) + 1;
}

async function start(db, request, body){
  const now = Date.now(), me = await who(request), level = levelOf(body.level);
  const recent = await db.prepare('SELECT COUNT(*) AS c FROM runs WHERE who = ? AND started_at > ?').bind(me, now - 60e3).first();
  if (recent && recent.c >= STARTS_PER_MINUTE) return json({ error: 'slow down' }, 429);
  const run = crypto.randomUUID();
  const writes = [
    db.prepare('INSERT INTO runs (id, who, started_at, level) VALUES (?, ?, ?, ?)').bind(run, me, now, level),
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
  const row = await db.prepare('SELECT started_at, ended_at, level FROM runs WHERE id = ?').bind(body.run).first();
  if (!row) return json({ error: 'no such run' }, 404);
  if (row.ended_at != null) return json({ error: 'already ended' }, 409);
  if (now - row.started_at > MAX_RUN_MS) return json({ error: 'too old' }, 410);
  const level = levelOf(row.level), seconds = Math.round((now - row.started_at) / 100) / 10;
  let hearts = null, score = null, saved = null;
  if (level === 2){
    saved = Math.round(Number(body.saved) || 0);
    if (!(saved >= 0 && saved <= SOULS)) return json({ error: 'bad saved' }, 400);
  }
  if (outcome === 'freed'){
    hearts = Math.round(Number(body.hearts));
    if (!(hearts >= 1 && hearts <= 5)) return json({ error: 'bad hearts' }, 400);
    if (seconds < MIN_SECONDS[level]) return json({ error: 'implausible' }, 422);
    score = scoreFor(hearts, seconds, saved);
  }
  const res = await db.prepare('UPDATE runs SET ended_at = ?, outcome = ?, hearts = ?, seconds = ?, score = ?, saved = ? WHERE id = ? AND ended_at IS NULL')
    .bind(now, outcome, hearts, seconds, score, saved, body.run).run();
  if (!res.meta || res.meta.changes !== 1) return json({ error: 'already ended' }, 409);
  const counts = [db.prepare('UPDATE souls SET n = n + 1 WHERE k = ?').bind(outcome)];
  if (saved) counts.push(db.prepare("UPDATE souls SET n = n + ? WHERE k = 'returned'").bind(saved));
  await db.batch(counts);
  const out = { outcome, level, seconds, places: TOP, souls: await souls(db) };
  if (saved != null) out.saved = saved;
  if (score != null){ out.score = score; out.rank = await rankOf(db, level, score); out.qualifies = out.rank <= TOP; }
  return json(out);
}

async function setName(db, body){
  const name = cleanName(body.name);
  if (typeof body.run !== 'string' || !name) return json({ error: 'bad request' }, 400);
  const row = await db.prepare('SELECT outcome, score, ended_at, name, level FROM runs WHERE id = ?').bind(body.run).first();
  if (!row || row.outcome !== 'freed' || row.score == null) return json({ error: 'no such win' }, 404);
  if (row.name != null) return json({ error: 'already named' }, 409);
  if (Date.now() - row.ended_at > NAME_MS) return json({ error: 'too late' }, 410);
  const level = levelOf(row.level), rank = await rankOf(db, level, row.score);
  if (rank > TOP) return json({ error: 'off the board', rank }, 409);
  await db.prepare('UPDATE runs SET name = ? WHERE id = ? AND name IS NULL').bind(name, body.run).run();
  return json({ rank, name, level, top: await top(db, level) });
}

export async function onRequest(context){
  const { request, env, params } = context;
  const route = [].concat(params.route || []).join('/');
  if (!env.DB) return json({ error: 'no database bound (DB)' }, 503);
  try {
    await schema(env.DB);
    if (request.method === 'GET' && route === 'board'){
      const level = levelOf(new URL(request.url).searchParams.get('level'));
      return json({ level, top: await top(env.DB, level), souls: await souls(env.DB), places: TOP });
    }
    if (request.method !== 'POST') return json({ error: 'not found' }, 404);
    const body = await request.json().catch(() => ({}));
    if (route === 'start') return await start(env.DB, request, body);
    if (route === 'end') return await end(env.DB, body);
    if (route === 'name') return await setName(env.DB, body);
    return json({ error: 'not found' }, 404);
  } catch (e){
    return json({ error: 'server error' }, 500);
  }
}
