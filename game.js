// game.js — Beat the Devil.
// A white heart, five bolts, and the Devil. Two of the bolts are for his eyes;
// nothing but the title card will remind you. The heartbeat is the game's
// clock: the floor, the embers, his aura and the music all pulse off it.
(function(){
"use strict";

var AUDIO = window.BTD_AUDIO, sfx = AUDIO.sfx, music = AUDIO.music;

// ---------- setup ----------
var LW = 420, LH = 640;
var cvs = document.getElementById('c');
var ctx = cvs.getContext('2d');
var stage = document.getElementById('stage');
var wrap = document.getElementById('wrap');
var monitor = document.getElementById('monitor');
var scale = 1;
// bezel extents in logical px at --s = 1 (must match style.css #monitor padding)
var BEZEL_X = 38 * 2, BEZEL_Y = 36 + 78;

var isTouch = (window.matchMedia && window.matchMedia('(pointer:coarse)').matches) ||
              ('ontouchstart' in window);

// on a small screen the bezel goes and the glass takes the whole screen
var bare = false;
// On touch the two controls get ground of their own: a band under the
// picture, or a band either side of it on a phone held sideways, whichever
// costs the picture less. The picture shrinks to leave it, so no thumb ever
// sits over the arena. CTL_R is both controls' radius in css px.
var CTL_R = 38, CTL_BAND = CTL_R * 2 + 28, ctlMode = '';
function resize(){
  bare = Math.min(window.innerWidth, window.innerHeight) < 600;
  document.body.classList.toggle('bare', bare);
  var pad = bare ? 0 : 12, bx = bare ? 0 : BEZEL_X, by = bare ? 0 : BEZEL_Y;
  wrap.style.padding = '';
  var aw = wrap.clientWidth - pad, ah = wrap.clientHeight - pad;
  scale = Math.min(aw / (LW + bx), ah / (LH + by));
  ctlMode = '';
  if (isTouch){
    var sBand = Math.min(aw / (LW + bx), (ah - CTL_BAND) / (LH + by));
    var sSide = Math.min((aw - 2 * CTL_BAND) / (LW + bx), ah / (LH + by));
    ctlMode = sBand >= sSide ? 'band' : 'sides';
    scale = Math.max(sBand, sSide);
    // the picture centres in what is left over
    var edge = (CTL_BAND + pad / 2) + 'px';
    if (ctlMode === 'band') wrap.style.paddingBottom = edge;
    else { wrap.style.paddingLeft = edge; wrap.style.paddingRight = edge; }
  }
  var w = Math.max(160, Math.floor(LW * scale));
  var h = Math.max(240, Math.floor(LH * scale));
  // fewer device pixels on touch screens: every raster cost scales with them
  var dpr = Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 2);
  rect = null;
  cvs.width = Math.floor(w * dpr);
  cvs.height = Math.floor(h * dpr);
  cvs.style.width = w + 'px';
  cvs.style.height = h + 'px';
  stage.style.width = w + 'px';
  stage.style.height = h + 'px';
  monitor.style.setProperty('--s', (w / LW).toFixed(3));
  ctx.setTransform(cvs.width / LW, 0, 0, cvs.height / LH, 0, 0);
  layoutControls();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', function(){ setTimeout(resize, 120); });
resize();

// the version the title shows; bump it with each release (BTD_VERSION counts builds)
var GAME_VERSION = '1.0';
document.getElementById('ver').textContent = 'v' + GAME_VERSION;
// ---------- the briefings ----------
// Before each level: its story, typed out a page at a time (and read aloud),
// then what to do. Every run starts from the main menu with it; Skip jumps to
// the rules. Space, a click or a tap goes on.
var BRIEF = {
  1: { head: 'LEVEL I \u00b7 THE PIT', say: 'Level one. The Pit.', story: [
        'The shop was not there last week.\nA narrow door, a dusty window,\nand one game on the shelf\nwith no price on it.',
        'You played it all night.\nThen the next night.\nYour friends stopped calling.\nYou stopped noticing.',
        'Tonight the screen is different.\nThe white heart on it beats\nwhen your own heart beats.\n\nIt is yours. And he wants it.'
      ],
      how: 'HOW TO BEAT HIM', rules: [
        'Survive the pitchforks and the hellfire until he comes.',
        'Then put a bolt through each of his eyes, only while it is open.',
        'You have five bolts for the whole run. Two are for his eyes.'
      ] },
  2: { head: 'LEVEL II \u00b7 THE STOLEN', say: 'Level two. The Stolen.', story: [
        'The light came down for your heart.\nIt would not take you alone.',
        'You were not the first to play.\nBelow the pit is his dungeon,\nand the ones he beat before you\nhang there in cages.',
        'Seven stolen souls.\nHis Warden keeps the keys.\n\nGo back down for them.'
      ],
      how: 'HOW TO FREE THEM', rules: [
        'Hold still beside a cage to open it. The soul follows you.',
        'Carry up to three up into the light at the top.',
        'A hit drags every soul you carry back into a cage.',
        'Dodge the burning chains and the knights on the floor. A chain can smash a cage open for you.',
        'When the Warden comes, shoot his lantern while it is open. You have five bolts. Two are for his lantern.'
      ] }
};
// ---------- the narrator ----------
// The briefings' stories are read aloud: recordings of a neural voice (an
// audiobook reader's, public domain), rendered offline from BRIEF itself by
// dev/voice.py into voice/*.mp3, with voice/timings.json saying when each
// paragraph is spoken so the page types itself out in step. They are the
// game's only recorded sound, and they play through Web Audio (AUDIO.narrator)
// like the rest of it. Silent when the game is muted, or with the briefing's
// Voice button (remembered on the device).
var VOICE_V = 3;                      // bump when the recordings are re-rendered
var NARRATOR = { timings: null, rate: 0.97, loading: false };
// lines spoken outside the briefings, rendered by dev/voice.py like the stories:
// the narrator's when level I is won, and the Warden's as he comes
var SPOKEN = {
  win1: { who: 'narrator', text: 'You beat the devil.\n\nBut it is not over yet. The others he took are still down there.\n\nWe have to save them.' },
  warden: { who: 'warden', text: 'You will never escape.' }
};
// the narrator says a line (not while the game is muted); its length, or 0
function sayLine(key){
  if (AUDIO.isMuted() || !AUDIO.narrator.ready(key)) return 0;
  return AUDIO.narrator.play(key, NARRATOR.rate);
}
function voiceKey(level, page){ return 'l' + level + '-' + page; }
function voiceUrl(key){ return 'voice/' + key + '.mp3?v=' + VOICE_V; }
// fetch the lines (a quarter of a megabyte in all), once, after the page is up
function narratorLoad(){
  if (NARRATOR.loading || !window.fetch) return;
  NARRATOR.loading = true;
  fetch('voice/timings.json?v=' + VOICE_V).then(function(r){ return r.ok ? r.json() : null; }).then(function(j){
    NARRATOR.timings = j;
    if (j) Object.keys(j).forEach(function(k){ AUDIO.narrator.load(k, voiceUrl(k)); });
  }).catch(function(){});
}
function hush(){ AUDIO.narrator.stop(); }
var BRIEF_CONTROLS = isTouch ? 'Left thumb on the circle to move\nRight thumb on the button to fire \u00b7 II to pause'
                             : 'Arrows / WASD to move \u00b7 Space to fire\nP to pause \u00b7 M to mute';
var STORY = 'He wants your heart.<br>You have five bolts.<br>Two are for his eyes.<br><br>';
document.getElementById('tip').innerHTML = STORY + (isTouch
  ? 'Left thumb on the circle to move<br>Right thumb on the button to fire'
  : 'Arrows / WASD to move<br>Space to fire<br>P pause &middot; M mute');
if (isTouch){
  document.body.classList.add('touch');
  document.getElementById('start-hint').textContent = 'Tap to start';
}
if (!isTouch) [].forEach.call(document.querySelectorAll('.menubtn'), function(b){ b.textContent = 'Main menu (Esc)'; });

// ---------- storage ----------
// the best completed run on this device, in board points
var bests = { 1: 0, 2: 0 };
try { bests[1] = parseInt(localStorage.getItem('btd.best'), 10) || 0; bests[2] = parseInt(localStorage.getItem('btd.best2'), 10) || 0; } catch(e){}
function saveBest(level, v){
  if (G.dev || DEV.on || !(v > bests[level])) return;   // a dev run is not a best
  bests[level] = v;
  try { localStorage.setItem(level === 2 ? 'btd.best2' : 'btd.best', String(v)); } catch(e){}
}
// Dev mode (see the dev section below): its switches, and whether it is on.
// Set up here because the run's bookkeeping asks it before anything else.
var DEV = { on: false, god: false, ammo: false, slow: false, badge: 0, lamp: 0, lastT: 0 };
try { DEV.on = localStorage.getItem('btd.dev') === '1'; } catch(e){}

// ---------- scoring ----------
// Only a completed run scores: hearts left are worth a thousand each, and
// speed up to 2,500 more, so one heart is worth a hundred seconds. The clock
// runs from the first step into the pit to the bolt that kills him, and it
// never stops, not for a pause. The server keeps its own clock and computes
// the score that goes on the board; this copy is for showing it at once.
function boardScore(hearts, seconds, saved){ return hearts * 1000 + Math.max(0, Math.round((300 - seconds) * 10)) + 500 * (saved || 0); }
function clock(s){ s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
function thousands(n){ return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function runSeconds(){ return G.runSecs != null ? G.runSecs : (G.mode === 'play' && G.runStart ? (performance.now() - G.runStart) / 1000 : 0); }

// ---------- the world: scoreboard and soul counters ----------
// All of it lives behind /api: a Cloudflare Pages Function over a D1 database
// (functions/api/[[route]].js). The game never waits on it. Every call has a
// short timeout, and if there is no server — a static host answering with a
// page, or no database bound — the board is hidden and the game plays the same.
var WORLD = { online: null, boards: { 1: [], 2: [] }, view: 1, souls: null, places: 50, run: null, runP: null, endP: null, result: null, naming: false, mine: null };
// the player's own entry, remembered on this device so the board can mark it
try { WORLD.mine = JSON.parse(localStorage.getItem('btd.mine') || 'null'); } catch(e){}
function api(path, body){
  if (WORLD.online === false) return Promise.reject(new Error('offline'));
  var ac = window.AbortController ? new AbortController() : null;
  var timer = ac && setTimeout(function(){ ac.abort(); }, 6000);
  return fetch('/api/' + path, {
    method: body ? 'POST' : 'GET', cache: 'no-store', signal: ac ? ac.signal : undefined,
    headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined
  }).then(function(r){
    if (timer) clearTimeout(timer);
    if ((r.headers.get('content-type') || '').indexOf('application/json') < 0){ WORLD.online = false; throw new Error('no api'); }
    return r.json().then(function(j){
      if (r.status === 503){ WORLD.online = false; throw new Error(j.error); }   // no database yet
      WORLD.online = true;
      if (!r.ok) throw new Error(j.error || String(r.status));
      return j;
    });
  }, function(e){ if (timer) clearTimeout(timer); throw e; });
}
function worldLoad(){
  return Promise.all([1, 2].map(function(l){
    return api('board?level=' + l).then(function(j){ WORLD.boards[l] = j.top || []; WORLD.souls = j.souls || WORLD.souls; WORLD.places = j.places || WORLD.places; });
  })).catch(function(){}).then(renderWorld);
}
function worldStart(){
  WORLD.run = null; WORLD.result = null; WORLD.endP = null; WORLD.naming = false; WORLD.runP = null;
  if (DEV.on) return;                                 // a dev run never reaches the world
  WORLD.runP = api('start', { level: G.level }).then(function(j){ WORLD.run = j.run; }).catch(function(){});
}
// outcome 'freed' or 'stolen', sent the moment it is decided; in level 2,
// with the souls brought out
function worldEnd(outcome, hearts, saved){
  if (!WORLD.runP) return;
  WORLD.endP = WORLD.runP.then(function(){
    if (!WORLD.run) throw new Error('no run');
    var body = { run: WORLD.run, outcome: outcome, hearts: hearts };
    if (saved != null) body.saved = saved;
    return api('end', body);
  }).then(function(j){ WORLD.result = j; if (j.souls) WORLD.souls = j.souls; if (j.places) WORLD.places = j.places; renderWorld(); return j; });
  WORLD.endP.catch(function(){});
}
function dateOf(ms){
  var d = new Date(ms), M = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  return d.getDate() + ' ' + M[d.getMonth()] + ' ' + String(d.getFullYear()).slice(2);
}
function hiScore(){ var b = WORLD.boards[G.level] || []; return Math.max(bests[G.level] || 0, b.length ? b[0].score : 0); }
function soulsLine(){ return WORLD.souls ? thousands(WORLD.souls.stolen) + ' souls stolen' : ''; }
// the title's counter and board, and the lose panel's count
function renderWorld(){
  var s = WORLD.souls, sl = document.getElementById('souls');
  if (s){
    sl.hidden = false;
    sl.textContent = '';
    sl.appendChild(document.createTextNode(thousands(s.stolen) + ' souls stolen'));
    var fr = document.createElement('span'); fr.textContent = ' \u00b7 ' + thousands(s.freed) + ' freed' + (s.returned ? ' \u00b7 ' + thousands(s.returned) + ' returned' : ''); sl.appendChild(fr);
  } else sl.hidden = true;
  var bd = document.getElementById('board'), rows = document.getElementById('board-rows');
  bd.hidden = !WORLD.online;
  if (WORLD.online){
    rows.textContent = '';
    var top = WORLD.boards[WORLD.view] || [];
    [].forEach.call(document.querySelectorAll('.board-tabs button'), function(b){ b.classList.toggle('on', +b.getAttribute('data-view') === WORLD.view); });
    if (!top.length){
      var li0 = document.createElement('li'); li0.className = 'empty';
      li0.textContent = WORLD.view === 2 ? 'No one has brought them back yet' : 'No soul has been freed yet';
      rows.appendChild(li0);
    }
    var mineRow = null;
    top.forEach(function(e, i){
      var li = document.createElement('li');
      [String(i + 1), e.name, thousands(e.score), e.hearts + '\u2665', clock(e.seconds), dateOf(e.at)].forEach(function(t){
        var sp = document.createElement('span'); sp.textContent = t; li.appendChild(sp);
      });
      if (WORLD.mine && (WORLD.mine.level || 1) === WORLD.view && WORLD.mine.name === e.name && WORLD.mine.score === e.score){ li.className = 'me'; mineRow = mineRow || li; }
      rows.appendChild(li);
    });
    // ten show at a time; the list scrolls to the player's own place if it is further down
    rows.scrollTop = mineRow ? Math.max(0, mineRow.offsetTop - rows.clientHeight / 2) : 0;
  }
  if (G.mode === 'over' && s) document.getElementById('over-hi').textContent = soulsLine();
}
if (/debug/.test(location.hash)){ window.BTD_WORLD = WORLD; window.BTD_WORLD_LOAD = worldLoad; }

// ---------- helpers ----------
function rnd(a,b){ return a + Math.random()*(b-a); }
function clamp(v,a,b){ return v<a?a:(v>b?b:v); }
function lerp(a,b,k){ return a + (b-a)*k; }
function decay(v, rate, dt){ return Math.max(0, v - rate*dt); }
function smooth(k){ k = clamp(k,0,1); return k*k*(3-2*k); }
// attack/decay envelope: 0 → 1 over `rise`, back to 0 over `fall`
function env(t, rise, fall){
  if (t < 0) return 0;
  if (t < rise) return t / rise;
  return Math.max(0, 1 - (t - rise) / fall);
}
function rgba(r,g,b,a){ return 'rgba(' + (r|0) + ',' + (g|0) + ',' + (b|0) + ',' + a + ')'; }

// ---------- constants ----------
var AMMO = 5;        // bolts for the whole run; two are for his eyes, but nothing enforces it
var LIVES = 5;       // hearts for the whole run
var BOLT_SPEED = 640;
var FORK_SPEED = 520;
// How hurt the heart looks and sounds, in three stages whatever LIVES is:
// 0 whole (no life lost yet), 1 wounded (dimmer, the odd stumble), 2 the last
// life (colour drained, glow guttering, never a regular beat again).
function wounds(){ return G.lives >= LIVES ? 0 : (G.lives > 1 ? 1 : 2); }
// how far his arms have crept in: 0 at full health to 2 on the last life
function armCreep(){ return clamp((LIVES - G.lives) / (LIVES - 1), 0, 1) * 2; }
// the palette lives in style.css; read it once, never hardcode hex in draw calls
var cssVars = getComputedStyle(document.documentElement);
function cssColor(name, fallback){ var v = cssVars.getPropertyValue(name).trim(); return v || fallback; }
function hexRgb(hex){ var n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
var COLORS = {
  void:     cssColor('--void', '#0a0620'),
  midnight: cssColor('--midnight', '#1b1046'),
  heart:    cssColor('--heart', '#9fe8ff'),
  claw:     cssColor('--claw', '#c2140e'),
  bone:     cssColor('--bone', '#fdf8f0'),
  ember:    cssColor('--ember', '#ff2a00'),
  sulfur:   cssColor('--sulfur', '#ffc321'),
  ash:      cssColor('--ash', '#c79a8f'),
  title:    cssColor('--title', '#ff5a1f'),
  rock:     cssColor('--rock', '#1c0705'),
  magma:    cssColor('--magma', '#ff5a0e'),
  grace:    cssColor('--grace', '#fff0cc')
};
var RGB = {}; Object.keys(COLORS).forEach(function(k){ RGB[k] = hexRgb(COLORS[k]); });
function col(name, a){ var c = RGB[name]; return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
var FLOOR = LH - 8;
// how high the heart may fly: more room in the survive phase, below his chin in the fight
function ceilingY(){ return G.phase === 'survive' || G.phase === 'rescue' ? LH * 0.25 : LH * 0.42; }
// the tallest a floor flame may be and still leave 80 px of air above the ceiling
function flameLimit(){ return LH - ceilingY() - 80; }

// ---------- quality ----------
// Three tiers. The game starts at the top and steps down when frames run long
// (see frame()): never mid-attack, only in the survive phase or between his
// attacks. Nothing here changes the rules, only what is drawn.
var QUALITY = [
  { name: 'full',   shimmer: true,  smoke: true,  glow: true,  hide: true,  parts: 1,   partCap: 260, edge: 1,   fireEvery: 1, fireLo: false, armsEvery: 1, devilEvery: 1 },
  { name: 'medium', shimmer: false, smoke: true,  glow: true,  hide: false, parts: 0.6, partCap: 140, edge: 1.5, fireEvery: 2, fireLo: false, armsEvery: 1, devilEvery: 2 },
  { name: 'low',    shimmer: false, smoke: false, glow: false, hide: false, parts: 0.3, partCap: 70,  edge: 2,   fireEvery: 2, fireLo: true,  armsEvery: 1, devilEvery: 3 }
];
var tier = 0, Q = QUALITY[0], wantTier = 0;
// BTD_SKIP: debug, {block: true} leaves a drawing block out, to measure its cost
function skip(k){ return window.BTD_SKIP && window.BTD_SKIP[k]; }
// a shadow radius, or none on the low tier (BTD_NOSHADOW: A/B switch for measuring)
function shadowR(r){ return Q.glow && !window.BTD_NOSHADOW ? r : 0; }
// pre-rendered glows: a radial falloff in one colour, drawn with drawImage
// where a shadowBlur would otherwise be re-blurred every frame. Keyed by
// colour and size, rendered once. Off entirely on the low tier.
var glowCache = {};
function glowSprite(rgb, r){
  var key = rgb.join(',') + '|' + r, c = glowCache[key];
  if (c) return c;
  var R = Math.ceil(r), size = R * 2;
  c = document.createElement('canvas'); c.width = c.height = size;
  var cx = c.getContext('2d'), g = cx.createRadialGradient(R, R, 0, R, R, R);
  g.addColorStop(0, rgba(rgb[0], rgb[1], rgb[2], 0.55));
  g.addColorStop(0.35, rgba(rgb[0], rgb[1], rgb[2], 0.22));
  g.addColorStop(1, rgba(rgb[0], rgb[1], rgb[2], 0));
  cx.fillStyle = g; cx.fillRect(0, 0, size, size);
  return glowCache[key] = c;
}
// a glow centred on x,y: radius r (quantised so the cache stays small),
// optionally stretched to w×h, at alpha a. Colour as [r,g,b].
function drawGlow(x, y, r, rgb, a, w, h){
  if (!Q.glow || window.BTD_NOSHADOW) return;
  var R = Math.max(4, Math.round(r / 4) * 4), sp = glowSprite(rgb, R);
  w = w || R * 2; h = h || R * 2;
  var pa = ctx.globalAlpha;
  ctx.globalAlpha = pa * (a == null ? 1 : a);
  ctx.drawImage(sp, x - w / 2, y - h / 2, w, h);
  ctx.globalAlpha = pa;
}
function setTier(n){
  tier = clamp(n, 0, QUALITY.length - 1); Q = QUALITY[tier]; wantTier = tier; if (G) G.tier = tier;
  faceFire = Q.fireLo ? faceFireLo : faceFireHi; colFire = Q.fireLo ? colFireLo : colFireHi;
}
// a particle, subject to the tier's share and cap
function addPart(q){
  if (Q.parts < 1 && Math.random() > Q.parts) return;
  if (G.parts.length >= Q.partCap) return;
  G.parts.push(q);
}

// ---------- fire ----------
// A tiling value-noise field, and a small palette-mapped fire texture rendered
// once per frame. The face, his mouth and every column of hellfire draw
// windows of it. Three layers scroll upward at different speeds.
var FIRE = (function(){
  var N = 128, tile = new Float32Array(N*N);
  function grid(size){ var g = new Float32Array(size*size); for (var i=0;i<g.length;i++) g[i] = Math.random(); return g; }
  function sampleGrid(g, size, x, y){
    var x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    fx = fx*fx*(3-2*fx); fy = fy*fy*(3-2*fy);
    var xa = ((x0 % size) + size) % size, xb = (xa + 1) % size;
    var ya = ((y0 % size) + size) % size, yb = (ya + 1) % size;
    var v00 = g[ya*size+xa], v10 = g[ya*size+xb], v01 = g[yb*size+xa], v11 = g[yb*size+xb];
    return (v00 + (v10-v00)*fx) + ((v01 + (v11-v01)*fx) - (v00 + (v10-v00)*fx)) * fy;
  }
  var g8 = grid(8), g16 = grid(16), g32 = grid(32);
  var lo = 1e9, hi_ = -1e9;
  for (var y=0;y<N;y++) for (var x=0;x<N;x++){
    var u = x/N, v = y/N;
    var val = sampleGrid(g8, 8, u*8, v*8) * 0.55 + sampleGrid(g16, 16, u*16, v*16) * 0.3 + sampleGrid(g32, 32, u*32, v*32) * 0.15;
    tile[y*N+x] = val; if (val < lo) lo = val; if (val > hi_) hi_ = val;
  }
  for (var i=0;i<tile.length;i++) tile[i] = (tile[i] - lo) / (hi_ - lo);
  // wrapped bilinear sample in tile pixels
  function at(x, y){
    var x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    var xa = ((x0 % N) + N) % N, xb = (xa + 1) % N, ya = ((y0 % N) + N) % N, yb = (ya + 1) % N;
    var a = tile[ya*N+xa], b = tile[ya*N+xb], c = tile[yb*N+xa], d = tile[yb*N+xb];
    var t = a + (b-a)*fx, u2 = c + (d-c)*fx;
    return t + (u2-t)*fy;
  }
  // palette: char black → dark red → orange → yellow → white
  var pal = new Uint8ClampedArray(256*3);
  var stops = [[0,0,0],[64,6,2],[168,26,4],[255,96,10],[255,190,40],[255,250,225]];
  for (var p=0;p<256;p++){
    var k = p/255 * (stops.length-1), s0 = Math.floor(k), s1 = Math.min(stops.length-1, s0+1), kk = k - s0;
    for (var c2=0;c2<3;c2++) pal[p*3+c2] = stops[s0][c2] + (stops[s1][c2]-stops[s0][c2])*kk;
  }
  // a texture: W×H, layers scrolling up. shape(v) scales intensity by height
  // (v = 0 at the top, 1 at the bottom). charK > 0 adds char patches.
  function make(W, H){
    var c = document.createElement('canvas'); c.width = W; c.height = H;
    var cx = c.getContext('2d'), img = cx.createImageData(W, H), data = img.data;
    return {
      canvas: c, w: W, h: H,
      render: function(t, mode){
        var i = 0;
        var thr = 0.79 + 0.035 * Math.sin(t * 0.7);     // char patches shrink and re-ignite
        for (var y=0;y<H;y++){
          var v = y / H;
          for (var x=0;x<W;x++){
            var n = at(x*0.9,        y*0.9 + t*38)  * 0.5
                  + at(x*1.9 + 40,   y*1.9 + t*85)  * 0.32
                  + at(x*3.7 + 90,   y*3.7 + t*150) * 0.18;
            var inten, alpha = 255;
            if (mode === 'face'){
              inten = n * 1.25 - 0.08;
              var ch = at(x*0.85 + 300, y*0.85 + t*6);
              var ck = Math.max(0, Math.min(1, (ch - (thr - 0.07)) / 0.09)); ck = ck * ck * (3 - 2 * ck);   // soft-edged char
              var rim = Math.max(0, Math.min(1, (ch - (thr - 0.16)) / 0.08)); rim = rim * rim * (3 - 2 * rim);
              inten = inten * (1 - ck) + 0.02 * ck + 0.4 * rim * (1 - ck);   // the rim re-igniting
            } else {
              // a column: solid at the base, ragged and fading at the top
              inten = n * (0.35 + 1.05 * v) - (1 - v) * 0.42;
              alpha = inten < 0.06 ? 0 : Math.min(255, (inten - 0.06) * 900);
            }
            var pi = Math.max(0, Math.min(255, inten * 255)) | 0;
            data[i] = pal[pi*3]; data[i+1] = pal[pi*3+1]; data[i+2] = pal[pi*3+2]; data[i+3] = alpha;
            i += 4;
          }
        }
        cx.putImageData(img, 0, 0);
      }
    };
  }
  // curl of the field: divergence-free swirl, for churning edges and drifting embers
  function curl(x, y){
    var e = 1.5;
    var dx = (at(x + e, y) - at(x - e, y)) / (2 * e);
    var dy = (at(x, y + e) - at(x, y - e)) / (2 * e);
    return { x: dy, y: -dx };
  }
  return { at: at, curl: curl, make: make };
})();
var faceFireHi = FIRE.make(128, 96), faceFireLo = FIRE.make(80, 60);
var colFireHi  = FIRE.make(96, 144), colFireLo  = FIRE.make(60, 90);
var faceFire = faceFireHi, colFire = colFireHi;   // swapped by setTier

// ---------- state ----------
var G = {};
function reset(level){
  G.mode = 'title';           // title | play | ending | over | won
  G.tier = tier;
  G.t = 0;
  G.score = 0;                // board points, set when the devil dies
  G.runStart = 0;             // performance.now() at the first step into the pit
  G.runSecs = null;           // the run's time, fixed the moment it is decided
  G.lives = LIVES;
  G.ammo = AMMO;
  G.phase = 'survive';        // survive | devil
  G.surv = 0;
  G.SURV = 42;
  G.level = level === 2 ? 2 : 1;
  G.dev = DEV.on;             // a dev run: never sent to the world, never a best
  G.prog = 0;
  G.player = { x: LW/2, y: LH - 78, vx: 0, vy: 0, px: LW/2, py: LH - 78 };
  G.bolts = []; G.forks = []; G.flames = []; G.parts = []; G.embers = []; G.texts = []; G.splats = [];
  G.devil = null;
  G.invuln = 0;
  G.shake = 0; G.flash = 0; G.white = 0; G.black = 0;
  G.forkT = 2.4; G.walkT = 3.2; G.emberT = 6; G.jetT = 3.0; G.fireCd = 0;
  G.lastWalkerHalf = 0;                    // -1 left, 1 right: jets and columns alternate halves
  G.recoil = 0;
  G.herald = 0;
  G.lightning = 0; G.lightT = rnd(5, 9); G.boltPath = null;
  G.watch = null; G.watched = 0;           // his eyes in the dark, twice
  G.hold = 0;                              // silence before he lands
  G.inferno = false;                       // after the arrival volley the fire steps up for good
  G.arms = null;                           // his clawed arms, framing the arena
  G.titleHearts = [];
  for (var th=0; th<14; th++) G.titleHearts.push({ x: rnd(20, LW-20), y: rnd(0, LH), v: rnd(18, 42), s: rnd(5, 11), p: rnd(0, 6.28) });
  G.taken = null;                          // the losing sequence
  if (G.level === 2){ G.phase = 'rescue'; G.SURV = 50; stolenReset(); }
  else { G.cages = G.carried = G.rising = G.shades = G.comers = G.strays = G.knights = G.quarrels = []; G.warden = null; G.cagedEnd = null; G.intro = 0; G.saved = 0; G.soulsOut = 0; G.shaft = 0; }
  G.freed = null;                          // the winning one: his last grasp, and the release
  G.heaven = null;                         // the light that comes down for it
  G.heartSilent = false;                   // after he takes it, the beat is never heard again
  G.paused = false;
  G.ending = null;
  G.endT = 0;
  G.heart = { bpm: 68, period: 60/68, since: 0, next: 60/68, dubAt: 0.28, dubDone: true,
              scale: 1, lubScale: 1.14, pulse: 0, arr: 0, big: false, danger: 0, override: -1,
              stop: 0, light: 1, settleT: 9, settleAmp: 0, flutter: 0 };   // stop: the dead moment after a hit; light: what it has not shed
  // penalties last exactly as long as invulnerability: nothing impairs the heart while it can be hit
  G.penalty = null;      // {kind:'fork'|'burn', t, dir}
  G.embed = null;        // the pitchfork stuck in it
  G.shove = null;        // the fork's momentum, still carrying the heart: { vx, vy, t }
  G.splats = [];         // blood on the floor, fading
  G.scars = [];          // cracks and char, permanent
  G.loose = [];          // forks that have worked loose and tumble away
  G.idleT = 0;
  for (var i=0;i<26;i++) G.embers.push({ x: rnd(0,LW), y: rnd(0,LH), v: rnd(14,42), r: rnd(0.8,2.2), p: rnd(0,6.28) });
}
reset();
// open with #debug to poke at the state from the console:
// window.BTD_G is the state, window.BTD_STEP(dt) advances one frame by hand
if (/debug/.test(location.hash)){
  window.BTD_G = G;
  window.BTD_VERSION = 46;
  window.BTD_STEP = function(dt){ update(dt); draw(); };
  window.BTD_START = function(level){ startGame(level || 1); };   // straight into a level, no menu or briefing
}

// ---------- input ----------
var keys = {};
var fireQueued = false;
// On touch there are two controls and nothing else: the joystick for the left
// thumb, the fire button for the right, the same size, off the picture on
// their own ground (see resize) and drawn on their own layer, #ctl, in css
// px. Pointers are tracked by id from the moment they land. One that lands on
// the button fires on press and never steers; one that lands on the stick
// steers and never fires; a touch anywhere else does nothing. A mouse keeps
// drag-to-move and click-to-fire.
var pointers = {}, movePtr = null, drag = null;
var downT = 0, moved = 0;                         // mouse only: a click fires
var ctl = document.getElementById('ctl'), cctx = ctl.getContext('2d');
// the fire button, and the joystick mirroring it. The stick is analog and
// measured from its fixed centre: a 12 % dead zone, then linear to full
// speed at the rim, which is exactly the keys' speed.
var fireBtn = { x: 0, y: 0, r: CTL_R, press: 0 };
var stick = { x: 0, y: 0, R: CTL_R, id: null, kx: 0, ky: 0, jx: 0, jy: 0 };
// The layer is only a strip around the two controls, not the whole screen,
// and it is redrawn only when something on it changes: a full-screen layer
// redrawn every frame cost ~5 ms a frame on a throttled phone.
var ctlLayer = { x: 0, y: 0, W: 0, H: 0, dpr: 1, key: '' };
function layoutControls(){
  if (!isTouch || !stick) return;                 // resize() runs once before this block
  var W = window.innerWidth, wr = wrap.getBoundingClientRect();
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  var r = CTL_R, lx, rx, cy;
  if (ctlMode === 'band'){
    // the foot of the band, where thumbs rest, a little in from the edges
    cy = wr.bottom - 14 - r;
    lx = wr.left + Math.max(14 + r, wr.width * 0.17); rx = wr.right - Math.max(14 + r, wr.width * 0.17);
  } else {
    // sideways: the middle of each side band, low, where the thumbs fall
    var side = Math.min(CTL_BAND, (wr.width - parseFloat(stage.style.width)) / 2);
    cy = wr.top + wr.height * 0.7;
    lx = wr.left + Math.min(side / 2 + 20, 110); rx = wr.right - Math.min(side / 2 + 20, 110);
  }
  stick.x = lx; stick.y = cy; fireBtn.x = rx; fireBtn.y = cy;
  if (stick.id == null){ stick.kx = lx; stick.ky = cy; }
  var pad = r + 16;                                // the rim, the press flash and the lit arc
  ctlLayer.x = 0; ctlLayer.y = Math.floor(cy - pad); ctlLayer.W = W; ctlLayer.H = Math.ceil(pad * 2); ctlLayer.dpr = dpr; ctlLayer.key = '';
  ctl.width = Math.floor(W * dpr); ctl.height = Math.floor(ctlLayer.H * dpr);
  ctl.style.width = W + 'px'; ctl.style.height = ctlLayer.H + 'px';
  ctl.style.left = '0px'; ctl.style.top = ctlLayer.y + 'px';
}
function onFireBtn(q){ return isTouch && Math.hypot(q.x - fireBtn.x, q.y - fireBtn.y) <= fireBtn.r * 1.35; }
// generous: a thumb that lands a good way off the ring still takes the stick
function onStick(q){ return isTouch && Math.hypot(q.x - stick.x, q.y - stick.y) <= stick.R * 2; }
function stickTo(q){
  var dx = q.x - stick.x, dy = q.y - stick.y, d = Math.hypot(dx, dy), R = stick.R;
  var c = d > R ? R / d : 1;                      // the knob stops at the rim
  stick.kx = stick.x + dx * c; stick.ky = stick.y + dy * c;
  var m = Math.min(1, d / R), k = m < 0.12 ? 0 : (m - 0.12) / 0.88;
  stick.jx = d > 0 ? dx / d * k : 0; stick.jy = d > 0 ? dy / d * k : 0;
}
function stickRelease(){ stick.id = null; stick.jx = stick.jy = 0; }
if (/debug/.test(location.hash)){ window.BTD_STICK = stick; window.BTD_FIREBTN = fireBtn; }   // the controls, in css px
resize();

window.addEventListener('keydown', function(e){
  if (e.target && e.target.closest && e.target.closest('.name')) return;   // typing a name
  var k = e.key, space = k === ' ' || e.code === 'Space';
  if (k === '`' || e.code === 'Backquote'){ if (!e.repeat) perfShow = !perfShow; e.preventDefault(); return; }   // the overlay, and nothing else
  if (space || ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].indexOf(k) >= 0) e.preventDefault();
  if (e.repeat) return;
  var lk = k.toLowerCase();
  keys[lk] = true;
  if (lk === 'm'){ toggleMute(); return; }
  if (lk === 'escape' && G.mode === 'brief'){ if (brief && brief.page < BRIEF[brief.level].story.length) briefSkip(); else toTitle(); return; }
  if (lk === 'escape' && G.mode !== 'play'){ goTitle(); return; }
  if (lk === 'q' && G.paused){ toTitle(); return; }            // from the pause screen, the main menu
  if (lk === 'p' || lk === 'escape'){ togglePause(); return; }
  if (space || k === 'Enter'){
    if (G.mode === 'play'){ if (!G.paused) fireQueued = true; }
    else tryStart();
  } else if (G.mode === 'title'){
    AUDIO.unlock();
    music.play('title');
  }
});
window.addEventListener('keyup', function(e){ keys[e.key.toLowerCase()] = false; });
window.addEventListener('blur', function(){ keys = {}; pointers = {}; movePtr = null; drag = null; stickRelease(); });
document.addEventListener('visibilitychange', function(){
  if (document.hidden && G.mode === 'play' && !G.paused && !window.BTD_FREEZE) togglePause();
});

// the canvas rect, measured once per layout rather than per pointer event
// (getBoundingClientRect forces layout every time it is asked)
var rect = null;
function canvasRect(){ return rect || (rect = cvs.getBoundingClientRect()); }
window.addEventListener('scroll', function(){ rect = null; }, true);
function toLogical(e){
  var r = canvasRect();
  return { x: (e.clientX - r.left) / r.width * LW, y: (e.clientY - r.top) / r.height * LH };
}
// On the window rather than the stage: on touch the controls live outside the
// picture. A mouse still has to press on the picture itself.
window.addEventListener('pointerdown', function(e){
  if (e.target === muteBtn) return;
  if (e.target.closest && e.target.closest('.name, .board, .menubtn, .pausebtn, .briefbtn, .nextlvl, #pausebtn, #dev')) return;   // (the briefing's Skip and Voice too)   // the name box, the board and the buttons take their own touches
  var onPicture = stage.contains(e.target);
  if (!isTouch && !onPicture) return;
  var p = toLogical(e), q = { x: e.clientX, y: e.clientY };
  if (G.mode !== 'play'){ tryStart(); return; }
  if (G.paused){ togglePause(); return; }
  if (onFireBtn(q)){
    pointers[e.pointerId] = { kind: 'fire' };
    fireBtn.press = 1; fireQueued = true;          // on press, not release
    return;
  }
  if (onStick(q)){
    if (stick.id != null) return;                  // one thumb on it at a time
    stick.id = e.pointerId;
    pointers[e.pointerId] = { kind: 'stick' };
    stickTo(q);
    G.idleT = 0;
    return;
  }
  // a finger anywhere else does nothing; only a mouse drags
  if (e.pointerType !== 'mouse' || movePtr != null || !onPicture) return;
  movePtr = e.pointerId;
  pointers[e.pointerId] = { kind: 'move', x: p.x, y: p.y };
  // the heart rides above the finger: whatever offset it lands with eases
  // to one that keeps it clear of the thumb
  drag = { ox: G.player.x - p.x, oy: G.player.y - p.y, t: 0 };
  downT = performance.now(); moved = 0;
  G.idleT = 0;
});
window.addEventListener('pointermove', function(e){
  var pt = pointers[e.pointerId];
  if (!pt) return;
  if (pt.kind === 'stick'){ stickTo({ x: e.clientX, y: e.clientY }); return; }
  if (pt.kind !== 'move') return;
  var p = toLogical(e);
  moved += Math.abs(p.x - pt.x) + Math.abs(p.y - pt.y);
  pt.x = p.x; pt.y = p.y;
});
function endPointer(e){
  var pt = pointers[e.pointerId];
  delete pointers[e.pointerId];
  if (pt && pt.kind === 'stick'){ stickRelease(); return; }
  if (!pt || pt.kind !== 'move') return;
  // a mouse tap (no button on screen) fires; a finger never does
  if (!isTouch && G.mode === 'play' && !G.paused && moved < 10 && performance.now() - downT < 300) fireQueued = true;
  movePtr = null; drag = null;
}
window.addEventListener('pointerup', endPointer);
window.addEventListener('pointercancel', endPointer);

var muteBtn = document.getElementById('mute');
function toggleMute(){
  // before any sound has played, the button that says "Sound on" lets it in
  // rather than turning it off
  if (!AUDIO.running() && !AUDIO.isMuted()){
    AUDIO.unlock();
    if (G.mode === 'title') music.play('title');
    return;
  }
  AUDIO.unlock();
  AUDIO.setMuted(!AUDIO.isMuted());
  muteLabel();
  if (AUDIO.isMuted()) hush();                      // the narrator too
  if (G.mode === 'title') music.play('title');
}
muteBtn.addEventListener('click', function(e){ e.stopPropagation(); toggleMute(); });
// its label, and its speaker (waves when on, a red line across it when off)
function muteLabel(){
  var off = AUDIO.isMuted();
  muteBtn.querySelector('.lbl').textContent = off ? 'Sound off' : 'Sound on';
  muteBtn.setAttribute('aria-label', off ? 'Sound off' : 'Sound on');
  muteBtn.classList.toggle('off', off);
}

function togglePause(){
  if (G.mode !== 'play') return;
  G.paused = !G.paused;
  keys = {}; fireQueued = false; stickRelease();
  document.getElementById('scr-pause').hidden = !G.paused;
  AUDIO.hold(G.paused);                              // paused, the game is silent
  sfx.pause();
  if (G.paused) music.pause(); else music.resume();
}

var scrTitle = document.getElementById('scr-title');
var scrOver  = document.getElementById('scr-over');
var scrWin   = document.getElementById('scr-win');
var scrBrief = document.getElementById('scr-brief'), brief = null;
function openBrief(level){
  var B = BRIEF[level];
  reset(level); G.mode = 'brief';
  scrTitle.hidden = true; scrOver.hidden = true; scrWin.hidden = true;
  closeNameForm();
  brief = { level: level, page: 0, at: performance.now(), done: false, shown: -1, voiced: false, segs: null };
  scrBrief.hidden = false;
  if (level === 2) music.play('stolen');           // his dungeon, under the story
  briefRender();
  briefSpeak();
}
// the narrator reads the page just turned to (the first with the level's name).
// If its line is still on its way, the page starts typing without him and he
// picks it up from the start if the line arrives within a second and a half.
function briefSpeak(){
  var B = BRIEF[brief.level], b = brief, page = brief.page, key = voiceKey(brief.level, page);
  hush(); b.voiced = false; b.segs = null;
  if (page >= B.story.length || AUDIO.isMuted()) return;
  function go(){
    if (brief !== b || b.page !== page || !NARRATOR.timings || !NARRATOR.timings[key]) return;
    var dur = AUDIO.narrator.play(key, NARRATOR.rate, function(){ if (brief === b && b.page === page){ b.done = true; briefRender(); } });
    if (!dur) return;
    b.voiced = true; b.segs = NARRATOR.timings[key].segs; b.at = performance.now(); b.done = false; b.shown = -1;
  }
  if (AUDIO.narrator.ready(key)) go();
  else {
    var pr = NARRATOR.timings && AUDIO.narrator.load(key, voiceUrl(key));
    if (pr) pr.then(function(){ if (performance.now() - b.at < 1500) go(); });
  }
}
function briefRender(){
  var B = BRIEF[brief.level], n = B.story.length, onRules = brief.page >= n, go = isTouch ? 'Tap' : 'Press space';
  document.getElementById('brief-level').textContent = B.head;
  var pg = document.getElementById('brief-page');
  pg.classList.toggle('rules', onRules);
  if (onRules){
    pg.textContent = '';
    var h = document.createElement('div'); h.className = 'brief-how'; h.textContent = B.how; pg.appendChild(h);
    var ul = document.createElement('ul');
    B.rules.forEach(function(r){ var li = document.createElement('li'); li.textContent = r; ul.appendChild(li); });
    pg.appendChild(ul);
    var c = document.createElement('div'); c.className = 'brief-controls'; c.style.whiteSpace = 'pre-line'; c.textContent = BRIEF_CONTROLS; pg.appendChild(c);
  } else pg.textContent = brief.done ? B.story[brief.page] : B.story[brief.page].slice(0, Math.max(0, brief.shown));
  var dots = document.getElementById('brief-dots'); dots.textContent = '';
  for (var i = 0; i <= n; i++){ var d = document.createElement('span'); if (i === brief.page) d.className = 'on'; dots.appendChild(d); }
  document.getElementById('brief-hint').textContent = go + (onRules ? ' to begin' : ' to continue');
  document.getElementById('brief-skip').textContent = onRules ? 'Story' : 'Skip';
}
// the story types itself out: in step with the narrator, each paragraph over
// the time he speaks it; without him, 38 letters a second. By the clock, not
// the frame rate.
function briefTick(){
  if (!brief || brief.done) return;
  var B = BRIEF[brief.level];
  if (brief.page >= B.story.length){ brief.done = true; return; }
  var full = B.story[brief.page].length, s = (performance.now() - brief.at) / 1000, n = 0;
  if (brief.voiced && brief.segs){
    var e = s * NARRATOR.rate;                       // where he is in the recording
    brief.segs.forEach(function(g){
      if (e >= g[1]) n = Math.max(n, g[3]);
      else if (e > g[0]) n = Math.max(n, g[2] + Math.floor((g[3] - g[2]) * (e - g[0]) / (g[1] - g[0])));
    });
  } else n = Math.floor(s * 38);
  n = Math.max(0, Math.min(full, n));
  if (n >= full) brief.done = true;
  if (n !== brief.shown || brief.done){ brief.shown = n; briefRender(); }
}
function briefPage(pg){ brief.page = pg; brief.at = performance.now(); brief.done = false; brief.shown = -1; briefRender(); briefSpeak(); }
// on: a page still typing finishes; a finished one turns; the rules begin the level
function briefNext(){
  if (!brief || performance.now() - brief.at < 200) return;
  var B = BRIEF[brief.level], n = B.story.length;
  if (brief.page < n && !brief.done){ brief.done = true; briefRender(); return; }
  if (brief.page < n){ briefPage(brief.page + 1); return; }
  startGame(brief.level);
}
// the story skipped to the rules, or the rules back to the story
function briefSkip(){
  if (!brief) return;
  var n = BRIEF[brief.level].story.length;
  briefPage(brief.page < n ? n : 0);
}

// level: 1 or 2; nothing given means the level last played
// There is no choosing a level: every run starts in the pit, and the only way
// down to the stolen is to beat him first. From level I's win panel the next
// step goes down for them; anywhere else (the title, a loss, level II's win)
// it is the pit again.
function nextLevel(){ return G.mode === 'won' && G.level === 1 ? 2 : 1; }
function tryStart(){
  AUDIO.unlock();
  if (WORLD.naming) return;                       // a winner is giving a name
  if (G.mode === 'brief'){ briefNext(); return; }
  if (G.mode === 'title' || G.mode === 'over' || G.mode === 'won'){
    if (G.mode !== 'title' && G.endT < 0.9) return;
    if (G.mode === 'title') openBrief(1);         // the story first, from the title
    else if (nextLevel() === 2) openBrief(2);     // and on the way down to the stolen
    else toTitle();                               // anything else: back to the main menu
  }
}
function startGame(level){
  level = level === 2 ? 2 : 1;
  reset(level);
  AUDIO.muffle(false);
  G.mode = 'play';
  G.runStart = performance.now();
  scrTitle.hidden = true; scrOver.hidden = true; scrWin.hidden = true; scrBrief.hidden = true; brief = null; hush();
  closeNameForm();
  music.play(level === 2 ? 'stolen' : 'survive');
  worldStart();
}
// from an end panel back to the title: the pit, the board fresh from the world, and its music
function goTitle(){
  if (WORLD.naming || (G.mode !== 'over' && G.mode !== 'won') || G.endT < 0.9) return;
  toTitle();
}
// back to the title from anywhere: an end panel, or the pause screen (the run is abandoned)
function toTitle(){
  G.paused = false;
  document.getElementById('scr-pause').hidden = true;
  AUDIO.hold(false);
  scrBrief.hidden = true; brief = null; hush();
  reset(1);
  AUDIO.muffle(false);
  scrOver.hidden = true; scrWin.hidden = true;
  closeNameForm();
  showTitle();
  worldLoad();
  music.play('title', true);
}
function showTitle(){
  document.getElementById('hi-title').textContent = (bests[1] ? 'Your best ' + thousands(bests[1]) : '') + (bests[2] ? ' \u00b7 II ' + thousands(bests[2]) : '');
  scrTitle.hidden = false;
}
// what space (or a tap) does from an end panel, said on it
function endHints(){
  var go = isTouch ? 'Tap' : 'Press space', down = nextLevel() === 2;
  document.getElementById('over-hint').textContent = go + ' for the main menu';
  document.getElementById('win-hint').textContent = go + (down ? ' to continue to Level II' : ' for the main menu');
  document.getElementById('win-next').hidden = !down;
  // a Main menu button only where space goes somewhere else
  document.querySelector('#scr-over .menubtn').hidden = true;
  document.querySelector('#scr-win .menubtn').hidden = !down;
}
[].forEach.call(document.querySelectorAll('.menubtn'), function(b){
  b.addEventListener('click', function(e){ e.stopPropagation(); b.blur(); goTitle(); });
});
// the briefing's Skip / Story, and the win panel's way on to level II
document.getElementById('brief-skip').addEventListener('click', function(e){ e.stopPropagation(); this.blur(); AUDIO.unlock(); briefSkip(); });
document.getElementById('win-next').addEventListener('click', function(e){ e.stopPropagation(); this.blur(); tryStart(); });
// pausing: the phone's pause button (a keyboard has P and Esc), and the pause screen's buttons
var pauseBtn = document.getElementById('pausebtn'), pauseShown = false;
pauseBtn.addEventListener('click', function(e){ e.stopPropagation(); pauseBtn.blur(); AUDIO.unlock(); if (G.mode === 'play' && !G.paused) togglePause(); });
document.getElementById('pause-resume').addEventListener('click', function(e){ e.stopPropagation(); this.blur(); if (G.paused) togglePause(); });
document.getElementById('pause-menu').addEventListener('click', function(e){ e.stopPropagation(); this.blur(); if (G.paused) toTitle(); });
if (isTouch) document.getElementById('pause-hint').textContent = 'Tap to resume';
else document.getElementById('pause-menu').textContent = 'Main menu (Q)';
// the pause button shows only in play (and the sound button moves over for it)
function pauseUI(){
  var want = G.mode === 'play' && !G.paused;
  if (want === pauseShown) return;
  pauseShown = want; pauseBtn.hidden = !want;
  document.body.classList.toggle('playing', want);
}
// ---------- dev mode ----------
// Five clicks on the cabinet's rainbow badge, then five on its orange power
// lamp, turn it on; the same knock (or its own button) turns it off. It stays
// on across reloads on this device. Its switches start either level at once,
// jump to the boss, kill him, and turn on no damage, endless bolts, slow
// motion and the frame-time overlay. A dev run never reaches the world board
// and never becomes a saved best.
var devPanel = document.getElementById('dev');
function devRender(){
  devPanel.hidden = !DEV.on;
  [].forEach.call(devPanel.querySelectorAll('button'), function(b){
    var k = b.getAttribute('data-dev');
    b.classList.toggle('on', !!((k === 'god' && DEV.god) || (k === 'ammo' && DEV.ammo) || (k === 'slow' && DEV.slow) || (k === 'fps' && perfShow)));
  });
}
function devToggle(){
  DEV.on = !DEV.on;
  if (!DEV.on){ DEV.god = DEV.ammo = DEV.slow = false; }
  else if (G.mode === 'play' || G.mode === 'ending') G.dev = true;   // turned on mid-run: this run is a dev run now
  try { localStorage.setItem('btd.dev', DEV.on ? '1' : '0'); } catch(e){}
  AUDIO.unlock(); sfx.cageOpen();
  devRender();
}
function devKnock(which){
  var now = performance.now();
  if (now - DEV.lastT > 3000){ DEV.badge = 0; DEV.lamp = 0; }   // a pause breaks the knock
  DEV.lastT = now;
  if (which === 'badge'){ if (DEV.lamp){ DEV.lamp = 0; DEV.badge = 0; } DEV.badge++; return; }
  if (DEV.badge < 5){ DEV.badge = 0; DEV.lamp = 0; return; }
  DEV.lamp++;
  if (DEV.lamp >= 5){ DEV.badge = 0; DEV.lamp = 0; devToggle(); }
}
document.getElementById('badge').addEventListener('click', function(){ devKnock('badge'); });
document.getElementById('power').addEventListener('click', function(){ devKnock('lamp'); });
function devStart(level){
  AUDIO.unlock();
  closeNameForm();
  startGame(level);
}
devPanel.addEventListener('click', function(e){
  var b = e.target.closest && e.target.closest('button'); if (!b) return;
  e.stopPropagation(); b.blur();
  var k = b.getAttribute('data-dev');
  if (k === 'l1' || k === 'l2') devStart(k === 'l1' ? 1 : 2);
  else if (k === 'boss'){ if (G.mode === 'play' && openPhase()) G.surv = Math.max(G.surv, G.SURV - 0.1); }
  else if (k === 'win'){
    if (G.mode !== 'play') return;
    if (G.devil && !G.devil.dying && G.devil.state !== 'wait'){ G.devil.eyes.forEach(function(e2){ e2.dead = true; }); devilDies(); }
    else if (G.warden && !G.warden.dying && G.warden.state !== 'wait' && G.warden.state !== 'enter'){ G.warden.hits = 2; wardenDies(); }
  }
  else if (k === 'god') DEV.god = !DEV.god;
  else if (k === 'ammo'){ DEV.ammo = !DEV.ammo; if (DEV.ammo && G.mode === 'play') G.ammo = AMMO; }
  else if (k === 'slow') DEV.slow = !DEV.slow;
  else if (k === 'fps') perfShow = !perfShow;
  else if (k === 'off') devToggle();
  devRender();
});
[].forEach.call(document.querySelectorAll('.board-tabs button'), function(b){
  b.addEventListener('click', function(e){ e.stopPropagation(); WORLD.view = +b.getAttribute('data-view'); renderWorld(); });
});
showTitle();
worldLoad();
devRender();
setTimeout(narratorLoad, 800);                     // his lines, once the page is up
// the title's music is asked for at once: a browser that lets a page sound
// before a tap plays it now; otherwise it comes in on the first touch or key
// that isn't a start (the board, its tabs, Sound on)
music.play('title');

// ---------- a name for the board ----------
var nameForm = document.getElementById('name-form'), nameIn = document.getElementById('name-in');
var winHint = document.getElementById('win-hint'), winHi = document.getElementById('win-hi'), winBtns = document.getElementById('win-btns');
function openNameForm(){
  WORLD.naming = true;
  nameForm.hidden = false; winHint.hidden = true; winBtns.hidden = true;   // a name or Skip first
  try { nameIn.value = localStorage.getItem('btd.name') || ''; } catch(e){}
  if (!isTouch) setTimeout(function(){ nameIn.focus(); }, 60);   // a phone opens its keyboard on the tap
}
function closeNameForm(){
  WORLD.naming = false;
  nameForm.hidden = true; winHint.hidden = false; winBtns.hidden = false;
  if (document.activeElement === nameIn) nameIn.blur();
}
nameForm.addEventListener('submit', function(e){
  e.preventDefault();
  var n = nameIn.value.trim();
  if (!n) return;
  try { localStorage.setItem('btd.name', n); } catch(err){}
  winHi.textContent = 'Carving it in\u2026';
  api('name', { run: WORLD.run, name: n }).then(function(j){
    var lv = j.level || G.level;
    WORLD.boards[lv] = j.top || WORLD.boards[lv]; WORLD.view = lv;
    WORLD.mine = { name: j.name, score: WORLD.result && WORLD.result.score, level: lv };
    try { localStorage.setItem('btd.mine', JSON.stringify(WORLD.mine)); } catch(err){}
    winHi.textContent = j.name + ' \u00b7 #' + j.rank + ' in the world';
    renderWorld();
  }, function(){ winHi.textContent = 'The board would not take it'; }).then(closeNameForm);
  G.endT = 0;                                      // no accidental restart on the same tap
});
document.getElementById('name-skip').addEventListener('click', function(){ closeNameForm(); G.endT = 0; });

// ---------- the heartbeat ----------
// Two-beat cycle: a lub (1.0 → 1.14 over ~90 ms) then a smaller dub. Rate
// runs 68 → 150 bpm on danger: the nearest hazard's distance and the survive
// meter. A hit gives one oversized beat, then ~2 s of arrhythmia.
function nearestHazard(){
  var p = G.player, best = 1e9, d;
  G.forks.forEach(function(f){
    if (f.state === 'fly' || f.state === 'stuck') d = Math.hypot(p.x - f.x, p.y - f.y);
    else d = Math.hypot(p.x - f.tx, p.y - f.ty) + 60;   // being aimed at counts, less
    if (d < best) best = d;
  });
  G.flames.forEach(function(fl){
    if (fl.type === 'walker'){
      d = Math.abs(p.x - fl.x); if (p.y < LH - fl.h) d = Math.hypot(d, (LH - fl.h) - p.y);
    } else if (fl.type === 'ember'){
      if (fl.state === 'fly') d = Math.hypot(p.x - fl.x, p.y - fl.y) + 30;
      else d = fl.t > fl.fuse * 0.5 ? Math.hypot(p.x - fl.tx, p.y - fl.ty) : 1e9;
    } else if (fl.type === 'chain'){
      if (fl.state === 'aim' || fl.state === 'lock') d = Math.abs(Math.hypot(p.x - fl.ax, p.y - fl.ay) - fl.L) + 50;
      else d = Math.min(Math.hypot(p.x - fl.bx, p.y - fl.by) - fl.r, fl.state === 'swing' ? distToSeg(p.x, p.y, fl.ax, fl.ay, fl.bx, fl.by) - 4 : 1e9);
    } else if (fl.type === 'breath'){
      d = (p.x < LW/2 ? -1 : 1) === fl.side ? 40 : 1e9;
    } else if (fl.type === 'jet'){
      var jl = jetLen(fl);
      if (jl > 0){ var jd = jetDir(fl); d = distToSeg(p.x, p.y, fl.ox, fl.oy, fl.ox + jd.x * jl, fl.oy + jd.y * jl) - 20; }
      else d = Math.hypot(p.x - fl.tx, p.y - fl.ty) + 60;
    }
    if (d < best) best = d;
  });
  if (G.devil) G.devil.eyes.forEach(function(e){
    if (e.charge > 0 || e.beam > 0){ d = Math.abs(p.x - e.lockX) + 20; if (d < best) best = d; }
  });
  if (G.knights && G.knights.length) best = Math.min(best, knightsNear(p));
  return best;
}
function updateHeart(dt){
  var h = G.heart, target;
  if (h.override >= 0) target = h.override;
  else if (G.mode === 'play' || G.mode === 'ending'){
    var danger = 1 - clamp((nearestHazard() - 30) / 220, 0, 1);
    if (openPhase()) danger = Math.max(danger, G.prog * 0.55);
    else danger = Math.max(danger, 0.72);            // a boss: the heart races (127 bpm and up), and the music with it
    if (G.lives === 1) danger = Math.max(danger, 0.55);
    h.danger = danger;
    target = 68 + 82 * danger;
    if (G.penalty && G.penalty.kind === 'burn') target += 55;            // panicked
    if (G.penalty && G.penalty.kind === 'fork') target *= 0.72;          // labored
    if (G.ending && G.ending.kind === 'dead') target = 0;
    if (G.freed && G.freed.released){ target = 60; h.arr = 0; }      // free, and calm
  } else if (G.mode === 'over') target = 46;
  else if (G.mode === 'won') target = 84;
  else target = 68;

  if (target <= 0){ h.pulse = decay(h.pulse, 3, dt); h.scale = 1; return; }  // the heart is still
  h.bpm += (target - h.bpm) * Math.min(1, dt * 1.2);
  h.period = 60 / h.bpm;
  if (h.arr > 0) h.arr -= dt;
  h.settleT += dt; h.settleAmp = decay(h.settleAmp, 2.2, dt); h.flutter = decay(h.flutter, 2, dt);
  if (h.stop > 0){ h.stop -= dt; h.pulse = decay(h.pulse, 6, dt); h.scale = 1; return; }   // stopped dead
  if (G.hold > 0){ h.pulse = decay(h.pulse, 3, dt); h.scale = 1; return; }   // it skips a beat

  h.since += dt;
  if (!h.dubDone && h.since >= h.dubAt){ h.dubDone = true; h.pulse = Math.max(h.pulse, 0.55); }
  if (h.since >= h.next){
    h.since = 0; h.dubDone = false;
    var big = h.big; h.big = false;
    var dmg = (G.mode === 'play' || G.mode === 'ending') && !(G.freed && G.freed.heal > 0.3) ? wounds() : 0;
    var pen = G.penalty ? G.penalty.kind : '';
    h.lubScale = big ? 1.32 : (pen === 'burn' ? 1.06 : (pen === 'fork' ? 1.24 : (dmg >= 2 ? 1.2 : 1.14)));
    h.pulse = pen === 'burn' ? 0.7 : 1;                                   // fast and shallow
    h.settleT = 0; h.settleAmp = big ? 1.6 : 1;
    h.next = h.arr > 0 ? h.period * rnd(0.5, 1.7) : h.period;
    if (dmg === 1 && Math.random() < 0.18) h.next *= rnd(0.75, 1.35);   // a stumble now and then
    if (dmg >= 2) h.next *= rnd(0.62, 1.55);                              // never regular again
    if (pen === 'fork' && Math.random() < 0.5) h.next *= 1.4;             // the hitch
    if (h.flutterDue){ h.flutterDue = false; h.next = 0.19; h.flutter = 1; }   // the involuntary double-beat
    h.dubAt = Math.min(pen === 'fork' ? 0.42 : (dmg >= 2 ? 0.34 : 0.28), h.next * 0.45);
    music.beat(h.next, h.dubAt, big ? 1.6 : 0.25 + 0.75 * h.danger, G.heartSilent || (G.mode === 'title' && !music.current()));
  }
  h.scale = 1 + env(h.since, 0.09, 0.18) * (h.lubScale - 1)
              + (h.dubDone ? env(h.since - h.dubAt, 0.07, 0.15) * 0.08 : 0);
  h.pulse = decay(h.pulse, 3.5, dt);
}

// ---------- spawning ----------
// Pitchforks are thrown, not dropped: aim (a thin line tracks you), lock
// (the line snaps solid, aimed where you will be), throw (a fixed vector).
// They stick in the floor and stay dangerous for a moment.
var forkGroup = 0;
function throwFork(kind, ox, oy){
  var p = G.player;
  if (ox == null){ ox = rnd(30, LW-30); oy = -14; }
  var group = ++forkGroup;
  function mk(tx, ty, track, spread, delay){
    G.forks.push({ group: group, ox: ox, oy: oy, x: ox, y: oy, tx: tx, ty: ty, track: track, spread: spread || 0,
                   state: 'aim', t: -(delay || 0), aimT: 0.45, lockT: 0.22,
                   vx: 0, vy: 0, rot: 0, r: 11, grazed: false, stuckT: 0 });
  }
  if (kind === 'fan'){
    mk(p.x, p.y, true, -0.26); mk(p.x, p.y, true, 0); mk(p.x, p.y, true, 0.26);
  } else if (kind === 'bracket'){
    // pins both sides of where you are now; commit before it locks
    mk(clamp(p.x - 64, 24, LW-24), p.y, false); mk(clamp(p.x + 64, 24, LW-24), p.y, false);
  } else {
    mk(p.x, p.y, true);
  }
  sfx.aim();
}
// the arrival volley: fast, unaimed, straight out of his mouth
function eruptForks(ox, oy, n){
  for (var i=0;i<n;i++){
    var ang = Math.PI * 0.22 + (i / (n-1)) * Math.PI * 0.56 + rnd(-0.06, 0.06);
    var sp = 700 + rnd(-70, 70);
    G.forks.push({ group: ++forkGroup, ox: ox, oy: oy, x: ox, y: oy, tx: 0, ty: 0, track: false, spread: 0,
                   state: 'fly', t: 0, aimT: 0, lockT: 0,
                   vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, rot: ang - Math.PI/2, r: 11, grazed: false, stuckT: 0 });
  }
}
// how many hazards are live: fork volleys count once, every flame counts
function hazardCount(){
  var groups = {}, n = 0;
  G.forks.forEach(function(f){ if (!groups[f.group]){ groups[f.group] = true; n++; } });
  G.flames.forEach(function(f){ if (!(f.type === 'walker' && f.state === 'die')) n++; });
  if (G.shades && G.shades.some(function(s){ return s.state !== 'fade'; })) n++;   // shades are one group
  if (G.knights){                                    // a spear attack is one group, a crossbow's another
    if (G.knights.some(function(k){ return k.kind === 'spear' && knightArmed(k); })) n++;
    if (G.knights.some(function(k){ return k.kind === 'xbow' && knightArmed(k); }) || G.quarrels.some(function(q){ return !q.stuck; })) n++;
  }
  return n;
}
// survive phase: never more than two hazards of any kind at once. Skip, never queue.
function mayspawn(){ return !openPhase() || hazardCount() < 2; }
// which halves currently have a jet aiming or firing from their wall
function jetHalves(){
  var h = {};
  G.flames.forEach(function(f){ if (f.type === 'jet') h[f.side] = true; });
  return h;
}
// which halves have a floor column still rising
function risingHalves(){
  var h = {};
  G.flames.forEach(function(f){ if (f.type === 'walker' && f.state !== 'die' && f.age < 0.8) h[f.x < LW/2 ? -1 : 1] = true; });
  return h;
}
// the x-interval a floor flame owns, including everywhere it may still walk
function walkerSpan(fl){
  var a = Math.min(fl.x, fl.targetX) - fl.w * 0.5 - 8, b = Math.max(fl.x, fl.targetX) + fl.w * 0.5 + 8;
  return [Math.max(0, a), Math.min(LW, b)];
}
// invariant: at least 40 % of the width stays flame-free. Returns true if a
// new flame spanning [a, b] would still leave that much.
function flameFreeOK(a, b){
  var spans = [[a, b]];
  G.flames.forEach(function(fl){ if (fl.type === 'walker' && fl.state !== 'die') spans.push(walkerSpan(fl)); });
  spans.sort(function(u, v){ return u[0] - v[0]; });
  var covered = 0, curA = spans[0][0], curB = spans[0][1];
  for (var i=1;i<spans.length;i++){
    if (spans[i][0] <= curB) curB = Math.max(curB, spans[i][1]);
    else { covered += curB - curA; curA = spans[i][0]; curB = spans[i][1]; }
  }
  covered += curB - curA;
  return covered <= LW * 0.6;
}
// A floor flame. Its target x is locked at ignition (the heart's x, at most
// `cap` px away); it walks there at 100 px/s and never moves again. Rises to
// full height over 0.8 s. Skipped if it would break the flame-free invariant.
function spawnWalker(x, cap){
  var p = G.player;
  if (x == null){
    x = rnd(30, LW-30);
    if (Math.abs(x - p.x) < 100) x = p.x + (p.x < LW/2 ? 1 : -1) * rnd(130, 190);
    // never rise on a half a jet is working; alternate with it
    var jh = jetHalves();
    if (jh[x < LW/2 ? -1 : 1] && !jh[x < LW/2 ? 1 : -1]) x = LW - x;
    x = clamp(x, 30, LW-30);
  }
  cap = cap == null ? 140 : cap;
  var w = G.inferno ? 72 : 60;
  var targetX = clamp(x + clamp(p.x - x, -cap, cap), 30, LW - 30);
  var a = Math.min(x, targetX) - w * 0.5 - 8, b = Math.max(x, targetX) + w * 0.5 + 8;
  if (!flameFreeOK(Math.max(0, a), Math.min(LW, b))) return false;
  G.lastWalkerHalf = x < LW/2 ? -1 : 1;
  var limit = flameLimit();
  var hmax = Math.min(limit, G.phase === 'survive' ? rnd(300, 420) : rnd(220, 300));
  G.flames.push({ type:'walker', x: x, targetX: targetX, h: 0, hmax: hmax, w: w,
                  t: 0, age: 0, flare: 0, state:'walk', seed: Math.random() });
  sfx.ignite(x);
  return true;
}
// An angled flame jet from a wall. Same contract as the forks: the vent glows
// and an aim line tracks the heart for 0.6 s, the line locks and flashes,
// then a lance fires along that fixed vector: 40 px wide, 450 px long,
// 0.3 s out, 0.5 s held, then it retracts. Always 15–35° above horizontal.
// Aimed at where the heart is at lock time, not led. Returns false when both
// halves have a column rising, so the caller can try again shortly.
function spawnJet(){
  var p = G.player, rising = risingHalves(), sides = [];
  if (G.flames.some(function(f){ return f.type === 'jet'; })) return false;   // one at a time
  if (!rising[-1]) sides.push(-1);
  if (!rising[1]) sides.push(1);
  if (!sides.length) return false;
  // prefer the half opposite the last column, then the wall further from the heart
  var side;
  if (sides.length === 2) side = G.lastWalkerHalf ? -G.lastWalkerHalf : (p.x < LW/2 ? 1 : -1);
  else side = sides[0];
  var ox = side < 0 ? 0 : LW;
  var dx = Math.max(60, Math.abs(p.x - ox));
  var oy = clamp(p.y + dx * Math.tan(25 * Math.PI/180), 200, FLOOR - 12);
  G.flames.push({ type:'jet', side: side, ox: ox, oy: oy, tx: p.x, ty: p.y, ang: 0,
                  state:'aim', t: 0, aimT: 0.9, lockT: 0.22, len: 0, seed: Math.random() });
  sfx.aim();
  return true;
}
function jetDir(j){ return { x: -j.side * Math.cos(j.ang), y: -Math.sin(j.ang) }; }   // into the arena, upward
function jetLen(j){
  if (j.state === 'fire') return 450 * smooth(j.t / 0.3);
  if (j.state === 'hold') return 450;
  if (j.state === 'retract') return 450 * (1 - smooth(j.t / 0.3));
  return 0;
}
function distToSeg(px, py, ax, ay, bx, by){
  var vx = bx - ax, vy = by - ay, L2 = vx*vx + vy*vy || 1;
  var k = clamp(((px - ax) * vx + (py - ay) * vy) / L2, 0, 1);
  return Math.hypot(px - (ax + vx*k), py - (ay + vy*k));
}
// A fireball: thrown from the dark above (or his mouth) at where the heart is
// now, not led. It tumbles in with a tail, lands, scorches a ring into the
// floor that brightens and contracts over the fuse, then detonates.
function spawnEmber(ox, oy){
  var p = G.player;
  var tx = p.x, ty = p.y;
  if (ox == null){ ox = clamp(tx + rnd(-140, 140), 20, LW - 20); oy = -24; }
  var dx = tx - ox, dy = ty - oy, dist = Math.hypot(dx, dy) || 1, sp = 430;
  G.flames.push({ type:'ember', state:'fly', x: ox, y: oy, tx: tx, ty: ty, vx: dx / dist * sp, vy: dy / dist * sp,
                  t: 0, fuse: 1.2, rot: rnd(0, 6.28), spin: rnd(5, 9) * (Math.random() < 0.5 ? -1 : 1), seed: Math.random() });
  sfx.throwFork();
}
function spawnBreath(side){
  G.flames.push({ type:'breath', side: side, t: 0, warn: 1.0, burn: 0.8 });
  sfx.breathWarn();
}
function burst(x, y, color, n, spd, grav){
  for (var i=0;i<(n||8);i++){
    var a = rnd(0, Math.PI*2), s = rnd(40, spd||210);
    addPart({ x:x, y:y, vx: Math.cos(a)*s, vy: Math.sin(a)*s, life: rnd(0.3,0.75), t:0, c: color, r: rnd(1.3,3.2), g: grav == null ? 260 : grav });
  }
}
function addText(x, y, text, color, life, size){
  G.texts.push({ x: clamp(x, 40, LW-40), y: y, text: text, c: color || COLORS.bone, t: 0, life: life || 0.9, size: size || 8 });
}

// ---------- devil ----------
function makeDevil(){
  return {
    x: LW/2, y: -170, targetY: 138,
    w: 268, h: 176,
    sway: 0, swayAmp: 58,
    state: 'wait', st: 0,      // wait | enter | arrive | open | attack | taken
    cycle: 0, attack: '', rage: 0, kick: 0,
    mouth: 0, mouthGlow: 0, turn: 0,
    dying: false, dieT: 0, dead: false,
    eyes: [
      { dx: -56, open: false, flash: 0, dead: false, charge: 0, beam: 0, lockX: LW/2, wide: 0, ember: 0.15 },
      { dx:  56, open: false, flash: 0, dead: false, charge: 0, beam: 0, lockX: LW/2, wide: 0, ember: 0.15 }
    ]
  };
}
function livingEyes(d){ return d.eyes.filter(function(e){ return !e.dead; }); }
function anyEyeOpen(d){ return d.eyes.some(function(e){ return e.open && !e.dead; }); }
function devilSpeed(d){ return Math.pow(1.2, d.rage); }

// ---------- firing ----------
function fire(){
  var p = G.player;
  if (G.fireCd > 0 || G.ammo <= 0) return;     // empty is just empty
  if (!(DEV.on && DEV.ammo)) G.ammo--;               // dev: endless bolts
  G.bolts.push({ x: p.x, y: p.y - 14, vy: -BOLT_SPEED });
  G.fireCd = 0.28;
  G.recoil = 1;
  sfx.shoot();
}
function boltLost(b, why){
  addText(b.x, Math.max(30, b.y + 40), why || 'LOST', COLORS.ember, 0.9);
  sfx.lost();
  checkAmmo();
}
function boltWasted(b, why){
  burst(b.x, b.y, COLORS.ash, 5, 140);
  addText(b.x, b.y + 30, why, COLORS.sulfur, 1.0);
  sfx.clank();
  checkAmmo();
}
// Only at zero. One bolt and two eyes is already lost, and it plays on.
function checkAmmo(){
  if (G.level === 2){
    var w = G.warden;
    if (G.phase !== 'warden' || !w || w.dying || G.mode !== 'play' || w.state === 'wait' || w.state === 'enter' || w.state === 'arrive') return;
    if (G.ammo + G.bolts.length === 0 && w.hits < 2 && w.takeIn == null) w.takeIn = 1.0;
    return;
  }
  if (G.phase !== 'devil' || !G.devil || G.devil.dying || G.mode !== 'play') return;
  if (G.devil.state === 'wait' || G.devil.state === 'enter' || G.devil.state === 'arrive') return;
  if (G.ammo + G.bolts.length === 0 && livingEyes(G.devil).length > 0 && G.devil.takeIn == null) G.devil.takeIn = 1.0;
}

// ---------- endings ----------
function beginEnding(kind, dur){
  G.mode = 'ending';
  G.ending = { kind: kind, t: 0, dur: dur };
  keys = {}; fireQueued = false;
  if (G.devil) G.devil.eyes.forEach(function(e){ e.beam = 0; e.charge = 0; });
}
// He takes it. Input is cut; the heart keeps beating, slowing, and drifts —
// no longer yours. His hand closes around it; the beat goes on inside the
// fist. He turns and points at the player. The beat stops. Black.
function runOver(outcome){
  G.runSecs = runSeconds();
  // level 2: the souls brought out are those delivered, plus those carried when the lantern breaks
  if (G.level === 2) G.soulsOut = G.saved + (outcome === 'freed' ? G.carried.length : 0);
  if (!G.dev) worldEnd(outcome, outcome === 'freed' ? G.lives : 0, G.level === 2 ? G.soulsOut : null);
}
function loseHeart(){
  var d = G.devil;
  runOver('stolen');
  beginEnding('taken', 9.8);
  d.state = 'taken';
  d.eyes.forEach(function(e){ e.open = false; e.wide = 0; });
  G.taken = { t: 0, bpm: G.heart.bpm, hand: { x: G.player.x, y: G.player.y, close: 0 }, point: 0, grabbed: false, stopped: false };
  if (G.arms){ G.arms.l.mode = 'reach'; G.arms.r.mode = 'reach'; G.arms.reach = 0; }
  burnOutHazards();
  music.stop(1.2);
  music.whisper(0);
}
function updateTaken(dt){
  var T = G.taken, d = G.devil, p = G.player, h = G.heart;
  T.t += dt;
  var t = T.t;
  // the heart slows all the way through, and stops
  T.bpm += (36 - T.bpm) * Math.min(1, dt * 0.5);
  h.override = t < 7.3 ? T.bpm : 0;
  if (t >= 7.3 && !T.stopped){ T.stopped = true; G.heartSilent = true; }
  if (!T.grabbed){
    // adrift
    p.x += Math.sin(t * 0.9) * 14 * dt;
    p.y -= 12 * dt;
  }
  // both clawed hands come in from the sides and close around the heart
  var hand = T.hand, A = G.arms;
  hand.x = p.x; hand.y = p.y;
  if (t > 1.0 && A){
    A.reach = smooth((t - 1.0) / 1.6);
    if (t > 1.05 && !T.rumbled){ T.rumbled = true; sfx.grab(); }
  }
  if (t > 2.6){
    hand.close = smooth((t - 2.6) / 0.5);
    if (!T.grabbed && hand.close >= 1){ T.grabbed = true; AUDIO.muffle(true); }
  }
  if (T.grabbed){
    // the hands lift it toward him, and he turns to the player
    var k2 = smooth((t - 4.2) / 1.2);
    // lifted to just below his mouth, glowing, beating slowly, dimming until it goes out
    p.x = lerp(p.x, d.x + (d.turn || 0) * 30, Math.min(1, dt * 2 * (t > 4.2 ? 1 : 0)));
    p.y = lerp(p.y, d.y + 128, Math.min(1, dt * 2 * (t > 4.2 ? 1 : 0)));
    T.glow = 1 - smooth((t - 3.0) / 4.3);
    hand.x = p.x; hand.y = p.y;
    d.turn = k2;
    T.point = smooth((t - 4.8) / 1.5);   // the right hand lets go and points
  }
  if (t >= 7.6) G.black = 1;
  if (t >= G.ending.dur){
    G.ending = null;
    gameOver('You had nothing left for him.', true);
  }
}
function heartGaveOut(){
  runOver('stolen');
  beginEnding('dead', 1.9);
  G.shake = 1.4;
  music.stop();
}
// everything on screen burns out
function burnOutHazards(){
  G.forks.forEach(function(f){ burst(f.x, f.y, '#ff6a1f', 3, 90); });
  G.forks.length = 0;
  G.bolts.length = 0;
  if (G.knights) knightsStand(false);
  G.flames.forEach(function(fl){
    if (fl.type === 'walker'){ fl.state = 'die'; fl.t = 0; }
    else if (fl.type === 'ember'){ fl.state = 'bloom'; fl.t = fl.fuse + 0.5; }
    else if (fl.type === 'jet'){ if (fl.len > 0){ fl.state = 'retract'; fl.t = 0; } else { fl.state = 'retract'; fl.t = 1; } }
    else if (fl.type === 'chain') windDown(fl);
    else fl.t = fl.warn + fl.burn;
  });
}
// a chain is hauled up (one still in its clamp just goes)
function windDown(fl){
  if (fl.type !== 'chain' || fl.state === 'reel') return;
  if ((fl.state === 'aim' || fl.state === 'lock') && fl.from === 'roof'){ fl.gone = true; return; }
  fl.state = 'reel'; fl.t = 0; fl.len0 = fl.len;
}
// ---------- the release ----------
// He dies, burning and sinking into the pit. With the last of him his hands
// lunge in and close around the heart — a final grasp — and with him gone
// they burn to ash and crumble, and let it go. The roof of the pit splits and
// a light comes down on it; in the light the heart heals, its scars fading,
// its beat slowing to calm, and it rises up the light and out. Only then the
// panel. In seconds from the killing bolt:
var FREE = { reach: [0.2, 1.0], close: [1.0, 1.4], dead: 2.4, char: [2.5, 3.7], crumble: 3.7,
             crack: 3.9, beam: [4.1, 4.8], heal: [4.8, 6.4], rise: [6.2, 8.4], end: 8.8 };
function devilDies(){
  var d = G.devil;
  runOver('freed');
  d.dying = true; d.dieT = 0;
  beginEnding('devil', FREE.end);
  G.white = 1; G.shake = 1.6;
  music.stop();
  sfx.kill();
  sfx.roar();
  sfx.deathCry();
  burnOutHazards();
  G.freed = { hand: { x: G.player.x, y: G.player.y, close: 0 }, grabbed: false, char: 0, released: false, heal: 0 };
  if (G.arms){ G.arms.l.mode = 'reach'; G.arms.r.mode = 'reach'; G.arms.reach = 0; }
}
function updateFreed(dt){
  var t = G.ending.t, d = G.devil, F = G.freed, p = G.player, A = G.arms;
  // he burns, cracks, sinks
  if (!d.dead){
    d.dieT = t;
    G.shake = Math.max(G.shake, 0.6 * (1 - t / FREE.dead));
    if (Math.random() < 0.35)
      burst(d.x + rnd(-110,110), d.y + rnd(-70,100), Math.random()<0.5 ? COLORS.ember : COLORS.sulfur, 2, 220, 60);
    if (Math.random() < 0.6)
      addPart({ x: d.x + rnd(-90, 90), y: d.y + rnd(-40, 100), vx: rnd(-20, 20), vy: rnd(-90, -40), life: rnd(0.6, 1.3), t: 0,
                c: Math.random() < 0.5 ? '#ffb060' : '#ff7a10', r: rnd(1, 2.4), g: -30, turb: 40 });
    if (t >= FREE.dead){
      d.dead = true; G.white = 1; G.shake = 1.4;
      burst(d.x, d.y + 30, '#5b534e', 26, 260, 220);         // ash
      burst(d.x, d.y, COLORS.ember, 18, 380, 60);
      sfx.collapse();
    }
  }
  // the last grasp, and the hands burning to ash
  if (A){
    A.reach = smooth((t - FREE.reach[0]) / (FREE.reach[1] - FREE.reach[0]));
    F.hand.x = p.x; F.hand.y = p.y;
    F.hand.close = smooth((t - FREE.close[0]) / (FREE.close[1] - FREE.close[0]));
    if (t > FREE.reach[0] && !F.lunged){ F.lunged = true; sfx.grab(); }
    if (!F.grabbed && F.hand.close >= 1){ F.grabbed = true; AUDIO.muffle(true); }
    F.char = smooth((t - FREE.char[0]) / (FREE.char[1] - FREE.char[0]));
    A.l.char = A.r.char = F.char;
    if (F.char > 0 && Math.random() < 0.7 * F.char){
      var a = Math.random() < 0.5 ? A.l : A.r;
      addPart({ x: a.hx + rnd(-60, 60), y: a.hy + rnd(-40, 40), vx: rnd(-10, 10), vy: rnd(-40, -10), life: rnd(0.5, 1), t: 0,
                c: Math.random() < 0.5 ? '#ff9a40' : '#5b534e', r: rnd(0.8, 2), g: 30, turb: 20 });
    }
    if (t >= FREE.crumble) crumbleArms();
  } else if (t >= FREE.crumble && !F.released){ F.released = true; AUDIO.muffle(false); }
  heavenAscent(t, FREE, dt);
}
// the roof splits, the light comes down, the heart heals in it and rises up
// it and out. T holds the times (FREE for the devil, RELEASE for the Warden).
function heavenAscent(t, T, dt){
  var p = G.player, F = G.freed;
  if (t >= T.crack && !G.heaven){
    G.heaven = { x: clamp(p.x, 50, LW - 50), t: 0, crack: 0, beam: 0, wash: 0 };
    G.shake = Math.max(G.shake, 0.7);
    burst(G.heaven.x, 6, '#6a5048', 12, 120, 420);            // the roof coming down in pieces
    sfx.heavenCrack();
  }
  if (G.heaven){
    var H = G.heaven;
    H.t += dt;
    H.crack = smooth(H.t / 0.5);
    H.beam = smooth((t - T.beam[0]) / (T.beam[1] - T.beam[0]));
    H.wash = H.beam;
    if (H.beam > 0 && !H.sung){ H.sung = true; music.play('win'); }
  }
  F.heal = smooth((t - T.heal[0]) / (T.heal[1] - T.heal[0]));
  if (F.released && G.heaven) p.x = lerp(p.x, G.heaven.x, Math.min(1, dt * 1.6));
  var rk = (t - T.rise[0]) / (T.rise[1] - T.rise[0]);
  if (rk > 0){
    if (F.riseY == null) F.riseY = p.y;
    p.y = lerp(F.riseY, -70, Math.pow(Math.min(1, rk), 1.8));
  }
}
// the hands go to ash and fall apart, and the heart is loose
function crumbleArms(){
  var A = G.arms, F = G.freed;
  ['l', 'r'].forEach(function(key){
    var a = A[key], rr = a.reach > 0 ? a.rot : -a.rot, c = Math.cos(rr), s = Math.sin(rr);
    for (var i = 0; i < 48; i++){
      var lb = rnd(-460, 110), ly = rnd(-1, 1) * (lb < -40 ? 40 + (-lb - 40) * 0.12 : 46), lx = a.reach * lb;
      var r = Math.random();
      addPart({ x: a.hx + lx * c - ly * s, y: a.hy + lx * s + ly * c, vx: rnd(-30, 30), vy: rnd(-50, 10), life: rnd(0.9, 2.1), t: 0,
                c: r < 0.4 ? '#5b534e' : (r < 0.8 ? '#2e2927' : '#ff8a30'), r: rnd(1.2, 3.4), g: rnd(80, 190), turb: 24 });
    }
  });
  G.arms = null; F.released = true; F.grabbed = false;
  G.inferno = false;
  G.white = Math.max(G.white, 0.35);
  AUDIO.muffle(false);
  sfx.crumble();
}
// motes drifting up the light
function heavenMotes(dt){
  var H = G.heaven;
  if (H.beam < 0.2 || Math.random() > dt * 36 * H.beam) return;
  var yy = rnd(10, FLOOR - 10), w = lerp(10 + 40 * H.crack, 70, yy / LH);
  addPart({ x: H.x + rnd(-w, w), y: yy, vx: rnd(-5, 5), vy: rnd(-26, -8), life: rnd(1.4, 3), t: 0,
            c: Math.random() < 0.5 ? col('grace', 1) : col('sulfur', 0.9), r: rnd(0.7, 1.7), g: -3, turb: 10 });
}
function updateEnding(dt){
  var E = G.ending, d = G.devil;
  E.t += dt;
  if (E.kind === 'taken'){ updateTaken(dt); return; }
  if (d && !d.dying){ d.sway += dt; d.x = LW/2 + Math.sin(d.sway * 0.55) * d.swayAmp; }
  if (E.kind === 'devil') updateFreed(dt);
  else if (E.kind === 'released') updateReleased(dt);
  else if (E.kind === 'caged') updateCaged(dt);
  else if (G.level === 2){ updateCages(dt); updateCarried(dt); updateStrays(dt); updateShades(dt); updateKnights(dt, false); }
  if (E.t >= E.dur){
    G.ending = null;
    if (E.kind === 'devil' || E.kind === 'released') victory();
    else if (E.kind === 'caged') gameOver('He locked you in with them.', true);
    else gameOver('Your heart gave out.');
  }
}
function gameOver(why, quiet){
  G.mode = 'over';
  G.endT = 0;
  document.getElementById('over-why').textContent = why;
  scrOver.classList.toggle('low', !!quiet);
  document.getElementById('over-score').textContent = (G.runSecs != null ? 'You lasted ' + clock(G.runSecs) : '') + (G.level === 2 && G.saved ? ' \u00b7 ' + G.saved + ' freed' : '');
  document.getElementById('over-hi').textContent = G.dev ? 'Dev run \u00b7 not recorded' : (soulsLine() || (bests[G.level] ? 'Your best ' + thousands(bests[G.level]) : ''));
  endHints();
  scrOver.hidden = false;
  if (!quiet) sfx.over();
  setTimeout(function(){ if (G.mode === 'over'){ AUDIO.muffle(false); G.heart.override = -1; music.play('dirge'); } }, quiet ? 2500 : 1000);
}
function showWinScore(hearts, secs, score, saved){
  document.getElementById('win-score').textContent = hearts + ' heart' + (hearts > 1 ? 's' : '') + ' \u00b7 ' + clock(secs)
    + (G.level === 2 ? ' \u00b7 ' + saved + ' soul' + (saved === 1 ? '' : 's') : '') + ' \u00b7 ' + thousands(score) + ' points';
}
function victory(){
  G.mode = 'won';
  G.endT = 0;
  var spare = G.ammo, secs = G.runSecs || 0, saved = G.level === 2 ? G.soulsOut : 0;
  G.score = boardScore(G.lives, secs, saved);
  saveBest(G.level, G.score);
  document.getElementById('win-big').innerHTML = G.level === 2 ? 'YOU BROUGHT<br>THEM BACK' : 'YOU BEAT<br>THE DEVIL';
  document.getElementById('win-why').innerHTML = G.level === 2
    ? 'They are free.<br>' + (saved ? 'You carried ' + saved + ' of them out yourself.' : 'The lantern freed them. Not your hands.')
    : 'Your soul is free.<br>' + (spare
      ? ('Two eyes. ' + spare + ' bolt' + (spare > 1 ? 's' : '') + ' to spare.')
      : 'Two eyes. Not a bolt to spare.');
  showWinScore(G.lives, secs, G.score, saved);
  winHi.textContent = G.dev ? 'Dev run \u00b7 not recorded' : (WORLD.endP ? 'Asking the world\u2026' : (bests[G.level] ? 'Your best ' + thousands(bests[G.level]) : ''));
  endHints();
  scrWin.hidden = false;
  // the server's clock is the one that counts: when it answers, its time and
  // score replace ours, and a place on the board asks for a name
  if (WORLD.endP) WORLD.endP.then(function(r){
    if (G.mode !== 'won' || r.score == null) return;
    showWinScore(G.lives, r.seconds, r.score, saved);
    saveBest(G.level, r.score);
    winHi.textContent = '#' + r.rank + ' in the world' + (r.qualifies ? '' : ' \u00b7 the board holds ' + WORLD.places);
    if (r.qualifies) openNameForm();
  }, function(){ if (G.mode === 'won') winHi.textContent = 'Scoreboard offline \u00b7 your best ' + thousands(bests[G.level]); });
  sfx.win();
  setTimeout(function(){ if (G.mode === 'won') music.play('win'); }, 900);
  // level I: she tells you it is not over
  if (G.level === 1) setTimeout(function(){ if (G.mode === 'won' && G.level === 1) sayLine('win1'); }, 1400);
}

// ---------- update ----------
function update(dt){
  applyTier();
  G.t += dt;
  G.shake = decay(G.shake, 3.4, dt);
  G.flash = decay(G.flash, 3, dt);
  G.white = decay(G.white, 2.2, dt);
  G.lightning = decay(G.lightning, 2.0, dt);
  G.recoil = decay(G.recoil, 8, dt);
  fireBtn.press = decay(fireBtn.press, 5, dt);
  if (stick.id == null){                          // let go, the knob springs home
    var sk = Math.min(1, dt * 14);
    stick.kx = lerp(stick.kx, stick.x, sk); stick.ky = lerp(stick.ky, stick.y, sk);
  }
  if (G.herald > 0) G.herald -= dt;
  if (G.hold > 0) G.hold -= dt;
  if (G.devil) G.devil.kick = decay(G.devil.kick, 3, dt);
  updateHeart(dt);

  // embers rise faster as the phase darkens and with every beat
  var emberK = 1 + G.prog * 1.3 + 0.8 * G.heart.pulse + (G.phase === 'devil' || G.phase === 'warden' ? 0.6 : 0);
  for (var i=0;i<G.embers.length;i++){
    var em = G.embers[i];
    em.y -= em.v * emberK * dt;
    em.x += Math.sin(G.t*1.5 + em.p) * 10 * dt;
    if (em.y < -6){ em.y = LH + 6; em.x = rnd(0, LW); }
  }
  stepParticles(dt);
  if (G.heaven) heavenMotes(dt);
  stepTexts(dt);
  for (var lf=G.loose.length-1; lf>=0; lf--){
    var L = G.loose[lf]; L.t += dt; L.x += L.vx * dt; L.y += L.vy * dt; L.vy += 520 * dt; L.rot += L.spin * dt;
    if (L.y > LH + 40 || L.t > 3) G.loose.splice(lf, 1);
  }
  if (G.mode === 'title'){
    for (var ti=0; ti<G.titleHearts.length; ti++){
      var th2 = G.titleHearts[ti];
      th2.y -= th2.v * dt; th2.x += Math.sin(G.t * 0.8 + th2.p) * 8 * dt;
      if (th2.y < -20){ th2.y = LH + 20; th2.x = rnd(20, LW-20); }
    }
  }
  if (G.arms) updateArms(dt);
  updateFireVoices();

  if (G.mode === 'ending'){
    updateEnding(dt);
    moveHazards(dt, false);
    return;
  }
  if (G.mode !== 'play'){ G.endT += dt; return; }

  var p = G.player;

  // penalties expire the moment the heart is vulnerable again
  if (G.invuln > 0) G.invuln -= dt;
  if (G.penalty){
    G.penalty.t += dt;
    if (G.invuln <= 0){
      if (G.embed) releaseFork();
      G.penalty = null;
    }
  }
  // movement. embedded: slow, dragging the fork. burnt: fast and twitchy.
  var pen = G.penalty ? G.penalty.kind : '';
  var sp = 265 * (pen === 'fork' ? 0.65 : (pen === 'burn' ? 1.15 : 1)), mx = 0, my = 0;
  if (G.carried && G.carried.length) sp *= 1 - STOLEN.SLOW * G.carried.length;   // each soul carried is a little weight
  if (keys['arrowleft'] || keys['a']) mx -= 1;
  if (keys['arrowright']|| keys['d']) mx += 1;
  if (keys['arrowup']   || keys['w']) my -= 1;
  if (keys['arrowdown'] || keys['s']) my += 1;
  // the joystick adds its analog vector to the keys'. Nothing else about touch
  // is special: the speed and every penalty are the same multipliers.
  mx += stick.jx; my += stick.jy;
  var dragging = false;
  if (drag && movePtr != null && pointers[movePtr]){
    // the target: the finger plus an offset that eases to sit above it
    var fp = pointers[movePtr];
    drag.t += dt;
    var k = smooth(drag.t / 0.35);
    var ox = lerp(drag.ox, clamp(drag.ox, -30, 30), k), oy = lerp(drag.oy, Math.min(drag.oy, -90), k);
    var ddx = fp.x + ox - p.x, ddy = fp.y + oy - p.y, dd = Math.hypot(ddx, ddy);
    if (dd > 0.5){ mx = ddx / dd; my = ddy / dd; dragging = true; }
    if (dragging && dd < sp * dt) sp = dd / dt;   // no overshoot
  }
  // how hard: keys, a drag and a stick at the rim are all 1; a stick pushed
  // halfway is half. Taken before the burn's jitter, which only bends the way.
  var mag = Math.min(1, Math.hypot(mx, my));
  if (pen === 'burn' && (mx || my)){ mx += rnd(-0.45, 0.45); my += rnd(-0.45, 0.45); }
  // knocked: the fork's momentum carries the heart, and the hand on the controls
  // is weaker for it (down to 40 %), never gone
  var shoveK = 0;
  if (G.shove){
    var sh = G.shove; sh.t += dt;
    var vk = sh.t >= SHOVE_T ? 0 : Math.exp(-sh.t / SHOVE_TAU);
    shoveK = vk;
    var nx = p.x + sh.vx * vk * dt, ny = p.y + sh.vy * vk * dt;
    // it may shove the heart into fire (deliberate) but never off the playfield
    if (nx < 16 || nx > LW - 16){ sh.vx = 0; nx = clamp(nx, 16, LW - 16); }
    if (ny < ceilingY() || ny > LH - 30){ sh.vy = 0; ny = clamp(ny, ceilingY(), LH - 30); }
    p.x = nx; p.y = ny;
    if (vk === 0 || (!sh.vx && !sh.vy)) G.shove = null;
  }
  if (mx || my){
    var m = (Math.hypot(mx,my) || 1) / mag;
    p.x += mx/m * sp * dt * (1 - 0.6 * shoveK);
    p.y += my/m * sp * dt * (1 - 0.6 * shoveK);
    G.idleT = 0;
  } else if (movePtr == null && stick.id == null){
    G.idleT += dt;
    if (G.idleT > 3 && !G.heart.flutterDue){ G.heart.flutterDue = true; G.idleT = -2; }   // it flutters, then waits again
  }
  p.x = clamp(p.x, 16, LW-16);
  p.y = clamp(p.y, ceilingY(), LH-30);
  // smoothed velocity, so the forks can lead you
  if (dt > 0){
    p.vx = lerp(p.vx, (p.x - p.px) / dt, Math.min(1, dt * 12));
    p.vy = lerp(p.vy, (p.y - p.py) / dt, Math.min(1, dt * 12));
  }
  p.px = p.x; p.py = p.y;

  // firing
  G.fireCd -= dt;
  if (fireQueued){ fireQueued = false; if (G.invuln < 1.4) fire(); }

  // bolts
  for (var i=G.bolts.length-1;i>=0;i--){
    var b = G.bolts[i];
    b.y += b.vy * dt;
    if (G.level === 2){
      // out of the air before anything counts what is left (the last bolt must not count itself)
      G.bolts.splice(i, 1);
      if (boltHitsShade(b) || wardenBolt(b)) continue;
      G.bolts.splice(i, 0, b);                         // it met nothing: back in flight
    }
    if (G.devil && (G.devil.state === 'open' || G.devil.state === 'attack')){
      var d = G.devil, ey = d.y + 4;
      if (b.y <= ey + 17 && b.y > ey - 40 && Math.abs(b.x - d.x) < d.w * 0.42){
        // reached the brow line: an eye, or the bone between them
        var struck = null;
        for (var k=0;k<d.eyes.length;k++){
          var e = d.eyes[k];
          if (!e.dead && Math.abs(b.x - (d.x + e.dx)) < 22){ struck = e; break; }
        }
        G.bolts.splice(i,1);
        if (struck && struck.open) eyeHit(d, struck);
        else if (struck) boltWasted(b, 'NOT YET');
        else boltWasted(b, 'WASTED');
        continue;
      }
    }
    if (b.y < -24){ G.bolts.splice(i,1); boltLost(b); }
  }
  if (G.mode !== 'play') return;   // a bolt may have ended the game

  // phase logic
  if (G.phase === 'survive'){
    G.surv += dt;
    var prog = G.prog = G.surv / G.SURV;
    music.whisper(prog > 0.7 ? (prog - 0.7) / 0.3 : 0);

    // twice, his eyes open in the dark and watch. Nothing else happens.
    if (G.watch){
      G.watch.t += dt;
      if (G.watch.t > G.watch.dur) G.watch = null;
    } else if ((G.watched === 0 && prog > 0.33) || (G.watched === 1 && prog > 0.68)){
      G.watched++;
      G.watch = { t: 0, dur: 1.3 };
      sfx.watch();
    }

    if (!G.watch){
      G.forkT -= dt;
      if (G.forkT <= 0){
        G.forkT = rnd(1.9, 2.7) - prog * 0.8;
        if (mayspawn()){
          var r = Math.random();
          throwFork(prog > 0.45 && r < 0.2 ? 'bracket' : (prog > 0.3 && r < 0.42 ? 'fan' : 'single'));
        }
      }
      G.walkT -= dt;
      if (G.walkT <= 0){ G.walkT = rnd(3.6, 5.2) - prog * 1.6; if (mayspawn()) spawnWalker(); }
      // side jets: none in the first 40 %, then one every 7 s, 4.5 s in the last quarter
      if (prog > 0.4){
        G.jetT -= dt;
        if (G.jetT <= 0){
          var jetEvery = prog < 0.75 ? 7 : lerp(7, 4.5, (prog - 0.75) / 0.25);
          G.jetT = (mayspawn() && spawnJet()) ? jetEvery : 0.3;
        }
      }
      if (prog > 0.25){
        G.emberT -= dt;
        if (G.emberT <= 0){ G.emberT = rnd(2.3, 3.4) - prog * 0.6; if (mayspawn()) spawnEmber(); }
      }
    }

    if (G.surv >= G.SURV){
      // silence. the heart skips. then he lands.
      G.phase = 'devil';
      G.prog = 1;
      G.devil = makeDevil();
      G.hold = 1.4;
      music.stop(0.5);
      music.whisper(0);
      G.forks.length = 0;
    }
  } else if (G.level === 2){
    updateStolen(dt);
    if (G.mode !== 'play') return;
  } else if (G.devil){
    updateDevil(dt);
    if (G.mode !== 'play') return;
    var ds = G.devil.state;
    if (ds === 'open' || ds === 'attack'){
      G.jetT -= dt;
      if (G.jetT <= 0){ G.jetT = spawnJet() ? rnd(2.2, 2.8) : 0.3; }
    }
    // lightning
    if (G.devil.state !== 'wait'){
      G.lightT -= dt;
      if (G.lightT <= 0){
        G.lightning = 1;
        G.lightT = rnd(6, 12);
        G.boltPath = makeLightning();
        sfx.thunder();
      }
    }
  }

  moveHazards(dt, true);
}

function forkHazardPos(f){
  return f.state === 'stuck' ? { x: f.x, y: f.y - 8 } : { x: f.x, y: f.y };
}
function moveHazards(dt, live){
  var p = G.player;

  // forks
  for (var i=G.forks.length-1;i>=0;i--){
    var f = G.forks[i];
    f.t += dt;
    if (f.t < 0) continue;                 // waiting its turn in a volley
    if (f.state === 'aim'){
      if (f.track){
        f.tx = clamp(p.x + p.vx * 0.35, 16, LW-16);
        f.ty = clamp(p.y + p.vy * 0.35, ceilingY(), LH-30);
      }
      f.rot = Math.atan2(f.ty - f.oy, f.tx - f.ox) - Math.PI/2;
      if (f.t >= f.aimT){ f.state = 'lock'; f.t = 0; sfx.lock(); }
    } else if (f.state === 'lock'){
      if (f.t >= f.lockT){
        var ang = Math.atan2(f.ty - f.oy, f.tx - f.ox) + f.spread;
        f.vx = Math.cos(ang) * FORK_SPEED; f.vy = Math.sin(ang) * FORK_SPEED;
        f.rot = ang - Math.PI/2;
        f.state = 'fly'; f.t = 0;
        sfx.throwFork();
      }
    } else if (f.state === 'fly'){
      f.x += f.vx * dt; f.y += f.vy * dt;
      if (f.y >= FLOOR - 6){
        f.y = FLOOR - 6; f.state = 'stuck'; f.t = 0; f.baseRot = f.rot;
        burst(f.x, FLOOR, '#ff6a1f', 3, 90);
        sfx.impact(f.x, false);
      } else if (f.x < -30 || f.x > LW + 30 || f.y < -60){
        if (f.y > 0 && f.y < LH) sfx.impact(clamp(f.x, 0, LW), true);   // into the wall
        G.forks.splice(i,1); continue;
      }
    } else {   // stuck: quivers, then burns out
      f.rot = f.baseRot + Math.sin(f.t * 42) * 0.14 * Math.max(0, 1 - f.t / 1.2);
      if (f.t > 1.5){ G.forks.splice(i,1); continue; }
    }

    // bolts can still break one
    var hit = false;
    for (var j=G.bolts.length-1;j>=0;j--){
      var bb = G.bolts[j];
      if (Math.abs(bb.x - f.x) < f.r + 5 && Math.abs(bb.y - f.y) < f.r + 12){
        G.bolts.splice(j,1);
        G.forks.splice(i,1);
        burst(f.x, f.y, '#ff6a1f', 6, 180);
        sfx.pop();
        hit = true;
        checkAmmo();
        break;
      }
    }
    if (hit || !live || G.mode !== 'play') continue;
    if (f.state !== 'fly' && f.state !== 'stuck') continue;
    var hp = forkHazardPos(f);
    if (hits(p, hp.x, hp.y, f.r)){ hurt('fork', hp.x, hp.y, f.vx || 0, f.vy || 1); break; }   // hurt() clears the forks
    // graze: a near miss is marked
    if (f.state === 'fly' && !f.grazed && G.invuln <= 0 && Math.hypot(p.x - f.x, p.y - f.y) < f.r + 8 + 16){
      f.grazed = true;
      addText(p.x, p.y - 26, 'CLOSE', COLORS.sulfur, 0.6, 7);
      sfx.graze();
    }
  }

  // fire
  for (var i=G.flames.length-1;i>=0;i--){
    var fl = G.flames[i];
    fl.t += dt;
    var burn = false, burnAt = null;
    if (fl.type === 'walker'){
      fl.age += dt;
      fl.hmax = Math.min(fl.hmax, flameLimit());          // the ceiling can drop mid-life (his arrival)
      if (fl.state !== 'die') fl.h = fl.hmax * smooth(Math.min(1, fl.age / 0.8));   // the danger visibly climbs
      if (fl.state === 'walk'){
        // toward the x locked at ignition, then it stops. It never re-aims.
        var dxw = fl.targetX - fl.x;
        if (Math.abs(dxw) <= 100 * dt){ fl.x = fl.targetX; fl.state = 'stand'; }
        else fl.x += Math.sign(dxw) * 100 * dt;
        if (live && Math.abs(p.x - fl.x) < 14){ fl.state = 'erupt'; fl.t = 0; sfx.erupt(fl.x); G.shake = Math.max(G.shake, 0.6); }
      } else if (fl.state === 'erupt'){
        fl.flare = 1 - fl.t / 0.7;                            // a flare, not a climb: the height limit holds
        if (fl.t > 0.7){ fl.state = 'stand'; fl.flare = 0; }
      }
      if (fl.state !== 'die' && fl.age > 6){ fl.state = 'die'; fl.t = 0; sfx.crackle(fl.x); }
      if (fl.state === 'die'){
        fl.h -= 420 * dt;
        if (fl.h <= 0){ G.flames.splice(i,1); continue; }
      }
      // embers shed from the top and drift up on the turbulence
      if (fl.h > 30 && Math.random() < 0.22)
        addPart({ x: fl.x + rnd(-fl.w*0.3, fl.w*0.3), y: LH - fl.h + rnd(-6, 24), vx: rnd(-12, 12), vy: rnd(-70, -30),
                       life: rnd(0.7, 1.5), t: 0, c: Math.random() < 0.5 ? '#ffb060' : '#ff7a10', r: rnd(1.2, 2.4), g: -26, turb: 60 });
      burn = Math.abs(p.x - fl.x) < fl.w * (0.5 + 0.2 * fl.flare) + 4 && p.y > LH - fl.h - 6;
      if (burn) burnAt = [fl.x, p.y + 20];
    } else if (fl.type === 'ember'){
      if (fl.state === 'fly'){
        fl.x += fl.vx * dt; fl.y += fl.vy * dt; fl.rot += fl.spin * dt;
        // embers shed off the tail
        if (Math.random() < 0.6){
          var bv = Math.hypot(fl.vx, fl.vy) || 1;
          addPart({ x: fl.x - fl.vx / bv * rnd(8, 26) + rnd(-4, 4), y: fl.y - fl.vy / bv * rnd(8, 26) + rnd(-4, 4),
                         vx: -fl.vx * 0.08 + rnd(-20, 20), vy: -fl.vy * 0.08 + rnd(-30, 0), life: rnd(0.4, 0.9), t: 0,
                         c: Math.random() < 0.5 ? '#ffb060' : '#ff7a10', r: rnd(1, 2.2), g: -20, turb: 40 });
        }
        var remaining = Math.hypot(fl.tx - fl.x, fl.ty - fl.y);
        if (remaining < 430 * dt * 1.1){
          fl.x = fl.tx; fl.y = fl.ty; fl.state = 'ring'; fl.t = 0;
          burst(fl.tx, fl.ty, '#ff7a10', 6, 140);
          if (live) sfx.emberLand();
        }
        burn = Math.hypot(p.x - fl.x, p.y - fl.y) < 11 + 8;
        if (burn) burnAt = [fl.x, fl.y];
      } else if (fl.state === 'ring'){
        // scorched into the floor: brightens and contracts, then goes off
        if (fl.t > fl.fuse){
          fl.state = 'bloom'; fl.t = 0; burst(fl.tx, fl.ty, '#ffb060', 8, 200);
          if (live){ sfx.bloom(fl.tx); G.shake = Math.max(G.shake, 1.1 * (1 - clamp(Math.hypot(p.x - fl.tx, p.y - fl.ty) / 320, 0, 1))); }
        }
      } else {
        if (fl.t > 0.8){ G.flames.splice(i,1); continue; }
        if (fl.t < 0.5){
          var br = 10 + 24 * Math.min(1, fl.t / 0.12);
          burn = Math.hypot(p.x - fl.tx, p.y - fl.ty) < br + 6;
          if (burn) burnAt = [fl.tx, fl.ty];
        }
      }
    } else if (fl.type === 'jet'){
      if (fl.state === 'aim'){
        if (live){ fl.tx = p.x; fl.ty = p.y; }          // tracks, then freezes at lock: not led
        if (fl.t >= fl.aimT){
          fl.state = 'lock'; fl.t = 0;
          var adx = Math.max(1, Math.abs(fl.tx - fl.ox)), ady = fl.oy - fl.ty;
          fl.ang = clamp(Math.atan2(ady, adx), 15 * Math.PI/180, 35 * Math.PI/180);
          sfx.lock();
        }
      } else if (fl.state === 'lock'){
        if (fl.t >= fl.lockT){ fl.state = 'fire'; fl.t = 0; if (live) sfx.jet(); G.shake = Math.max(G.shake, 0.3); }
      } else if (fl.state === 'fire'){
        if (fl.t >= 0.3){ fl.state = 'hold'; fl.t = 0; }
      } else if (fl.state === 'hold'){
        if (fl.t >= 0.5){ fl.state = 'retract'; fl.t = 0; }
      } else if (fl.t >= 0.3){ G.flames.splice(i,1); continue; }
      fl.len = jetLen(fl);
      if (fl.len > 0){
        var jd2 = jetDir(fl);
        burn = distToSeg(p.x, p.y, fl.ox, fl.oy, fl.ox + jd2.x * fl.len, fl.oy + jd2.y * fl.len) < 20 + 6;
        if (burn) burnAt = [p.x + jd2.x * -20, p.y + jd2.y * -20];
      }
    } else if (fl.type === 'chain'){
      if (stepChain(fl, dt, live)){ G.flames.splice(i, 1); continue; }
    } else if (fl.type === 'breath'){
      if (fl.t > fl.warn + fl.burn){ G.flames.splice(i,1); continue; }
      if (fl.t > fl.warn && !fl.roared){ fl.roared = true; sfx.breath(); G.shake = Math.max(G.shake, 0.6); }
      if (fl.t > fl.warn && fl.t < fl.warn + fl.burn * 0.85){
        burn = (p.x < LW/2 ? -1 : 1) === fl.side;
        if (burn) burnAt = [p.x, p.y - 60];
      }
    }
    if (live && burn) hurt('burn', burnAt ? burnAt[0] : p.x, burnAt ? burnAt[1] : p.y - 40);
  }
}

// every burning thing gets a voice, louder when tall and near the heart
var flameSeq = 0;
function updateFireVoices(){
  var p = G.player, list = [];
  G.flames.forEach(function(fl){
    if (!fl.id) fl.id = ++flameSeq;
    if (fl.type === 'walker' && fl.h > 10) list.push({ id: fl.id, x: fl.x, h: Math.min(1, fl.h / 380), dist: Math.hypot(Math.max(0, Math.abs(p.x - fl.x) - fl.w/2), Math.max(0, (LH - fl.h) - p.y)) });
    else if (fl.type === 'jet' && fl.len > 0){ var jd = jetDir(fl); list.push({ id: fl.id, x: fl.ox + jd.x * fl.len * 0.5, h: fl.len / 450, dist: distToSeg(p.x, p.y, fl.ox, fl.oy, fl.ox + jd.x * fl.len, fl.oy + jd.y * fl.len) }); }
    else if (fl.type === 'breath' && fl.t > fl.warn && fl.t < fl.warn + fl.burn) list.push({ id: fl.id, x: LW/2 + fl.side * 105, h: 1, dist: (p.x < LW/2 ? -1 : 1) === fl.side ? 0 : 220 });
  });
  AUDIO.fire.update(list);
}
function stepParticles(dt){
  if (G.mode === 'play' || G.mode === 'ending'){
    if (G.embed){
      // steady at first, tapering as the fork works loose
      var taper = 1 - G.embed.t / 2.0;
      if (Math.random() < dt * 22 * taper) bleed();
    } else if (G.lives <= 1 && Math.random() < dt * 0.9){
      bleed(0, 0, rnd(1.0, 1.6));                   // the last life: a slow drip from the cracks
    }
  }
  for (var i=G.splats.length-1;i>=0;i--){ var sp2 = G.splats[i]; sp2.t += dt; if (sp2.t > sp2.life) G.splats.splice(i, 1); }
  for (var i=G.parts.length-1;i>=0;i--){
    var q = G.parts[i];
    q.t += dt;
    if (q.t > q.life){ G.parts.splice(i,1); continue; }
    if (q.blood && q.y >= FLOOR - 1){
      // a splat where it lands, fading over a few seconds
      if (G.splats.length < Q.partCap / 5) G.splats.push({ x: q.x, y: FLOOR - 1, r: q.r * rnd(1.4, 2.6), t: 0, life: rnd(3, 5), seed: Math.random() });
      G.parts.splice(i, 1); continue;
    }
    if (q.turb){
      var c = FIRE.curl(q.x * 0.6, q.y * 0.6 + G.t * 30);
      q.vx += c.x * q.turb * dt * 20; q.vy += c.y * q.turb * dt * 20;
      q.vx *= 1 - dt * 1.5;
    }
    q.x += q.vx * dt; q.y += q.vy * dt;
    q.vy += q.g * dt;
  }
}
function stepTexts(dt){
  for (var i=G.texts.length-1;i>=0;i--){
    var tx = G.texts[i];
    tx.t += dt;
    tx.y -= 18 * dt;
    if (tx.t > tx.life) G.texts.splice(i,1);
  }
}

function hits(p, x, y, r){
  if (G.invuln > 0) return false;
  return Math.hypot(p.x - x, p.y - y) < r + 8;
}

// kind: 'fork' (a pitchfork embeds), 'burn' (fire clings), or nothing.
// hx, hy: where it came from, for the struck side and the fork's angle.
function hurt(kind, hx, hy, vx, vy){
  if (G.invuln > 0 || G.mode !== 'play' || (DEV.on && DEV.god)) return;
  var p = G.player;
  G.lives--;
  G.invuln = 2.0;
  G.shake = 1.1;
  G.flash = 1;
  burst(p.x, p.y, COLORS.bone, 14, 260);
  sfx.hurt();
  G.forks.length = 0;
  if (G.level === 2) dropSouls();
  // the beat stops dead, restarts with a hard irregular thump, then arrhythmia;
  // and it sheds light it will not get back
  var h = G.heart;
  h.stop = 0.2; h.big = true; h.arr = 2.0; h.next = h.since + rnd(0.05, 0.25);
  h.light = Math.max(0.35, h.light - 0.22);
  for (var li=0; li<16; li++)
    addPart({ x: p.x, y: p.y, vx: rnd(-90, 90), vy: rnd(-120, 20), life: rnd(0.5, 1.1), t: 0,
                   c: Math.random() < 0.5 ? COLORS.heart : '#ffffff', r: rnd(1, 2.6), g: -10, turb: 30 });
  if (G.arms) G.arms.creep = armCreep();
  // the penalty, and the scar it leaves
  var dx = (hx == null ? 0 : hx - p.x), dy = (hy == null ? -1 : hy - p.y), dl = Math.hypot(dx, dy) || 1;
  var dir = { x: dx / dl, y: dy / dl };
  if (kind === 'fork'){
    var vl = Math.hypot(vx || 0, vy || 0) || 1, tdir = { x: (vx || 0) / vl, y: (vy || 1) / vl };
    G.penalty = { kind: 'fork', t: 0, dir: tdir };
    G.embed = { ang: Math.atan2(tdir.y, tdir.x) - Math.PI/2, dir: tdir, t: 0 };
    // the fork's momentum: 380 px/s along its travel, decaying over ~0.35 s
    G.shove = { vx: tdir.x * SHOVE_V, vy: tdir.y * SHOVE_V, t: 0 };
    sfx.wet();
    // dark blood from the wound, thrown the way the fork was going
    var wp = woundPoint();
    for (var bi=0; bi<18; bi++){
      var bs = rnd(40, 210), ba = Math.atan2(tdir.y, tdir.x) + rnd(-0.9, 0.9);
      addPart({ x: wp.x, y: wp.y, vx: Math.cos(ba) * bs + rnd(-30, 30), vy: Math.sin(ba) * bs - rnd(0, 60),
                life: rnd(0.5, 1.1), t: 0, c: Math.random() < 0.6 ? BLOOD : BLOOD_DARK, r: rnd(1.2, 2.6), g: 420, blood: true });
    }
    // a stain around the wound that never quite fades
    G.scars.push({ kind: 'stain', x: -tdir.x * 0.55 + rnd(-0.1, 0.1), y: -tdir.y * 0.55 + rnd(-0.1, 0.1), r: rnd(0.4, 0.55), seed: Math.random() });
    // a crack running in from the wound
    var ex = -tdir.x * 0.8, ey = -tdir.y * 0.8, pts = [];
    for (var ci=0; ci<5; ci++){ var u = ci/4; pts.push([ex + (0.15 - ex) * u + (ci && ci < 4 ? rnd(-0.18, 0.18) : 0), ey + (0.1 - ey) * u + (ci && ci < 4 ? rnd(-0.18, 0.18) : 0)]); }
    G.scars.push({ kind: 'crack', pts: pts });
  } else if (kind === 'burn'){
    if (G.embed){ burnAwayFork(); }
    G.penalty = { kind: 'burn', t: 0, dir: dir };
    G.scars.push({ kind: 'char', x: dir.x * 0.5 + rnd(-0.15, 0.15), y: dir.y * 0.5 + rnd(-0.15, 0.15), r: rnd(0.28, 0.42), seed: Math.random() });
  } else G.penalty = { kind: 'hit', t: 0, dir: dir };
  if (G.lives <= 0){
    burst(p.x, p.y, COLORS.ember, 20, 320);
    heartGaveOut();
  }
}
var SHOVE_V = 380, SHOVE_TAU = 0.25, SHOVE_T = 0.35;   // 380 px/s, e-folding 0.25 s, cut at 0.35 s: ~72 px
var BLOOD = '#8e1018', BLOOD_DARK = '#4e0810';
// where the fork went in: the side it came from
function woundPoint(){
  var p = G.player, d = G.embed ? G.embed.dir : (G.penalty && G.penalty.dir) || { x: 0, y: -1 };
  return { x: p.x - d.x * 7, y: p.y - d.y * 7 };
}
// a droplet from the wound, left where the heart was so it trails behind
function bleed(vx, vy, life){
  var wp = woundPoint();
  addPart({ x: wp.x + rnd(-1.5, 1.5), y: wp.y + rnd(-1, 1), vx: vx || rnd(-6, 6), vy: vy || rnd(0, 20),
            life: life || rnd(0.8, 1.4), t: 0, c: Math.random() < 0.7 ? BLOOD : BLOOD_DARK, r: rnd(1.2, 2.2), g: 420, blood: true });
}
// the fork works loose and tumbles away
function releaseFork(){
  var em = G.embed, p = G.player; G.embed = null;
  G.loose.push({ x: p.x, y: p.y, vx: em.dir.x * 60 + rnd(-40, 40), vy: -120 + rnd(-30, 30), rot: em.ang, spin: rnd(-6, 6), t: 0 });
  sfx.stick();
}
// burnt while embedded: the fork burns away early
function burnAwayFork(){
  var p = G.player; G.embed = null;
  burst(p.x, p.y, '#ff7a10', 10, 160);
}

// ---------- devil behaviour ----------
function updateDevil(dt){
  var d = G.devil, p = G.player;
  d.st += dt;

  if (d.state === 'wait'){
    if (G.hold <= 0){
      d.state = 'enter'; d.st = 0;
      G.arms = makeArms();
      G.shake = 1.4; G.herald = 2.0; G.lightning = 1; G.boltPath = makeLightning();
      sfx.boss();
      music.play('devil');
    }
    return;
  }

  d.sway += dt;
  d.x = LW/2 + Math.sin(d.sway * 0.55) * d.swayAmp;

  // a second to know, then he takes it
  if (d.takeIn != null){ d.takeIn -= dt; if (d.takeIn <= 0){ loseHeart(); return; } }

  if (d.state === 'enter'){
    d.y += (d.targetY - d.y) * Math.min(1, dt * 2.2);
    if (Math.abs(d.y - d.targetY) < 2){ d.state = 'arrive'; d.st = 0; }
    return;
  }

  // embers in the sockets: dull, brighter when he is about to strike
  d.eyes.forEach(function(e){
    if (e.flash > 0) e.flash -= dt * 4;
    var want = e.dead ? 0 : (e.charge > 0 ? 1 : (d.state === 'attack' && d.st < 0.7 ? 1 : (e.open ? 0.55 : 0.15)));
    e.ember = lerp(e.ember, want, Math.min(1, dt * 6));
  });

  if (d.state === 'arrive'){
    // mouth opens wide, the interior goes white, then the volley
    if (!d.laughed){ d.laughed = true; d.laughLen = sfx.laughter() || 2.3; }
    var L = d.laughLen, lb = laughBurst(d.st);
    d.mouth = d.st < L ? 0.35 + 0.6 * lb : Math.min(1, d.mouth + dt * 4);
    d.mouthGlow = d.st < L - 0.35 ? 0 : (d.st < L ? (d.st - (L - 0.35)) / 0.35 : Math.max(0, 1 - (d.st - L) / 0.3));
    if (d.st >= L && !d.volleyed){
      d.volleyed = true;
      eruptForks(d.x, d.y + 70, 9);
      G.shake = 1.6; G.inferno = true;
      sfx.volley(); sfx.roar();
    }
    if (d.st > L + 0.8){
      d.mouth = Math.max(0, 1 - (d.st - (L + 0.8)) / 0.3);
    }
    if (d.st > L + 1.2){
      d.mouth = 0;
      if (G.ammo + G.bolts.length === 0) d.takeIn = 0.8;   // he can see you have nothing
      startAttack(d);
    }
    return;
  }

  if (d.state === 'open'){
    // no new hazards while he's exposed: the window is about aim, not luck
    var window_ = 1.9 - d.rage * 0.3;
    if (d.st > window_){
      d.eyes.forEach(function(e){ e.open = false; e.charge = 0; e.beam = 0; e.lockX = p.x; });
      startAttack(d);
    }
    return;
  }

  // ----- attack -----
  var a = d.attack, speed = devilSpeed(d), st = d.st * speed;
  if (a === 'volley'){
    if (d.thrown < 3 && st > d.thrown * 0.9){
      throwFork(d.rage > 0 && d.thrown === 1 ? 'fan' : 'single', d.x, d.y + 60);
      d.thrown++;
    }
    if (st > 3.4) openEye(d);
  } else if (a === 'breath'){
    d.mouth = st < 1.0 ? Math.min(1, st / 0.8) * 0.6 : Math.max(0, 1 - (st - 1.8) / 0.4);
    if (st > 3.0) openEye(d);
  } else if (a === 'beams'){
    livingEyes(d).forEach(function(e){
      if (e.charge < 1.0){
        e.charge += dt * speed / 1.2;
        e.lockX = e.lockX + (p.x - e.lockX) * Math.min(1, dt*3.2);
      } else {
        e.beam += dt;
        if (e.beam < 0.75){
          if (Math.abs(p.x - e.lockX) < 17 && p.y > d.y) hurt('burn', e.lockX, p.y - 60);
        }
      }
    });
    if (st > 3.0) openEye(d);
  } else if (a === 'claw'){
    // one hand winds up high on your side, then slams the floor there
    var arm = G.arms[d.clawSide];
    if (st < 1.0){ arm.mode = 'wind'; arm.k = st / 1.0; }
    else if (st < 1.25){ arm.mode = 'slam'; arm.k = (st - 1.0) / 0.25; }
    else if (st < 1.6){
      if (arm.mode !== 'impact'){ arm.mode = 'impact'; G.shake = 1.2; sfx.stick(); sfx.thunder(); burst(arm.hx, FLOOR, COLORS.ash, 10, 240); }
      arm.k = (st - 1.25) / 0.35;
      var band = d.clawSide === 'l' ? p.x < 150 : p.x > LW - 150;
      if (band && p.y > LH * 0.5) hurt();
    } else { arm.mode = 'recover'; arm.k = Math.min(1, (st - 1.6) / 0.9); }
    if (st > 2.8){ arm.mode = 'idle'; openEye(d); }
  } else {   // fire: walkers from both edges, embers where you stand
    if (!d.fired && st > 0.1){ d.fired = true; spawnWalker(34, 40); spawnWalker(LW - 34, 40); }
    if (st > 1.2 && !d.embered){ d.embered = true; spawnEmber(d.x, d.y + 70); }
    if (st > 2.2 && d.embered === true){ d.embered = 2; spawnEmber(d.x, d.y + 70); }
    if (st > 3.6) openEye(d);
  }
}
// the mouth follows the laugh's five bursts
function laughBurst(st){
  var bursts = [[0.0, 0.2], [0.3, 0.22], [0.64, 0.26], [1.04, 0.3], [1.52, 0.4]], k = 0;
  bursts.forEach(function(b){ var u = (st - b[0]) / b[1]; if (u >= 0 && u <= 1) k = Math.max(k, Math.sin(u * Math.PI)); });
  return k;
}
var ATTACKS = ['volley', 'breath', 'claw', 'beams', 'fire'];
function startAttack(d){
  d.state = 'attack'; d.st = 0;
  d.cycle++;
  d.attack = ATTACKS[d.cycle % ATTACKS.length];
  d.thrown = 0; d.fired = false; d.embered = false; d.mouth = 0;
  if (d.attack === 'breath') spawnBreath(G.player.x < LW/2 ? -1 : 1);
  if (d.attack === 'claw'){
    if (!G.arms) d.attack = 'volley';
    else { d.clawSide = G.player.x < LW/2 ? 'l' : 'r'; sfx.breathWarn(); }
  }
}
function openEye(d){
  d.state = 'open';
  d.st = 0; d.mouth = 0;
  d.eyes.forEach(function(e){ e.charge = 0; e.beam = 0; e.open = false; });
  var alive = livingEyes(d);
  if (!alive.length) return;
  var e = alive.length === 2 ? alive[d.cycle % 2] : alive[0];
  e.open = true; e.flash = 1;
  sfx.eyeOpen();
}
function eyeHit(d, e){
  var ex = d.x + e.dx, ey = d.y + 4;
  e.dead = true; e.open = false; e.ember = 0;
  d.rage++;
  d.kick = 1;                 // head snaps back
  G.shake = 1.3;
  G.white = 0.6;
  burst(ex, ey, COLORS.sulfur, 8, 220);
  burst(ex, ey, COLORS.bone, 14, 320);
  sfx.eye();
  sfx.roar();
  if (livingEyes(d).length === 0){ devilDies(); return; }
  livingEyes(d).forEach(function(o){ o.wide = 1; });   // the other opens wider
  addText(d.x, d.y + 118, 'YOU WILL PAY FOR THAT', COLORS.sulfur, 1.4, 8);
  d.eyes.forEach(function(x){ x.charge = 0; x.beam = 0; x.lockX = G.player.x; });
  startAttack(d);
  checkAmmo();
}
function makeLightning(){
  var pts = [], x = rnd(40, LW-40), y = -10;
  var tx = G.devil ? G.devil.x + (Math.random()<0.5 ? -1 : 1) * G.devil.w*0.4 : LW/2;
  var ty = G.devil ? G.devil.y - G.devil.h*0.6 : 120;
  var n = 7;
  for (var i=0;i<=n;i++){
    var k = i/n;
    pts.push({ x: x + (tx - x)*k + (i && i<n ? rnd(-26,26) : 0), y: y + (ty - y)*k });
  }
  return pts;
}

// =====================================================================
// ---------- LEVEL 2: THE STOLEN ----------
// (DESIGN rule 11) Below the pit is his dungeon. Cages hang from the roof,
// each with a stolen soul in it; a shaft of light comes down at the top
// centre. Free them, carry them up into the light, then break the Warden's
// lantern. Everything else — bolts, hearts, the penalty, the telegraphs,
// the two-hazard cap — is level 1's.
// =====================================================================
var STOLEN = { SOULS: 7, HANG: 4, CARRY: 3, OPEN_T: 1.0, OPEN_R: 30, SLOW: 0.06, SHAFT_W: 88, SHAFT_REACH: 44, INTRO: 1.5 };
function openPhase(){ return G.phase === 'survive' || G.phase === 'rescue'; }
function stolenReset(){
  G.cages = []; G.carried = []; G.rising = []; G.shades = []; G.comers = [];
  G.pool = STOLEN.SOULS;      // souls not in a hanging cage (yet, or again)
  G.saved = 0;                // delivered into the light
  G.soulsOut = 0;             // saved + carried out at the end: what scores
  G.intro = STOLEN.INTRO;
  G.warden = null;
  G.chainT = 1.0; G.spearT = 9; G.xbowT = 6; G.shadeT = 3.5; G.cageT = 0.3;
  G.knights = []; G.quarrels = []; G.patrolN = 0;   // the patrol on the floor, and its quarrels in flight
  G.strays = [];              // souls spilled from smashed cages, waiting to be picked up
  G.shaft = 1;                // the light's strength: it goes while the Warden is here
  G.cagedEnd = null;
}
function hangingCages(){ return G.cages.filter(function(c){ return c.soul && c.state !== 'rise'; }).length; }
// a cage lowers somewhere clear of the others and of the light's column
function lowerCage(){
  var x, y, tries = 0, ok;
  do {
    x = rnd(52, LW - 52); y = rnd(190, 420); tries++;
    ok = !(Math.abs(x - LW/2) < 80 && y < 270) && !G.cages.some(function(c){ return c.state !== 'rise' && Math.hypot(c.x - x, c.ty - y) < 104; });
  } while (!ok && tries < 40);
  G.pool--;
  G.cages.push({ x: x, y: -40, ty: y, soul: true, lock: 0, state: 'lower', t: 0, sway: rnd(0, 6.28), shake: 0 });
  sfx.cageLower();
}
function updateCages(dt){
  var p = G.player, near = null;
  for (var i = G.cages.length - 1; i >= 0; i--){
    var c = G.cages[i];
    c.t += dt; c.sway += dt; c.shake = decay(c.shake, 3, dt);
    if (c.state === 'lower'){
      c.y = lerp(-40, c.ty, smooth(c.t / 1.2));
      if (c.t >= 1.2){ c.state = 'hang'; c.t = 0; }
    } else if (c.state === 'rise'){
      c.y -= 170 * dt;
      if (c.y < -90){ if (c.soul) G.pool++; G.cages.splice(i, 1); continue; }
    } else {
      c.y = c.ty + Math.sin(c.sway * 0.8) * 3;
      if (c.soul && G.mode === 'play' && Math.hypot(p.x - c.x, p.y - c.y) < STOLEN.OPEN_R) near = c;
      else c.lock = Math.max(0, c.lock - dt * 2 / STOLEN.OPEN_T);   // leaving drains it at twice the rate
      if (!c.soul && c.t > 0.9){ c.state = 'rise'; c.t = 0; }
    }
  }
  if (!near){ G.fullWarned = false; return; }
  if (G.carried.length >= STOLEN.CARRY){
    near.lock = Math.max(0, near.lock - dt);
    if (!G.fullWarned){ G.fullWarned = true; addText(p.x, p.y - 30, 'CARRY THEM UP', COLORS.sulfur, 1.1, 7); }
    return;
  }
  var before = near.lock;
  near.lock = Math.min(1, near.lock + dt / STOLEN.OPEN_T);
  near.shake = Math.max(near.shake, 0.35);
  if (Math.floor(near.lock * 4) > Math.floor(before * 4)) sfx.cageTurn(near.lock);
  if (near.lock >= 1) openCage(near);
}
function openCage(c){
  c.soul = false; c.lock = 0; c.t = 0; c.shake = 1;
  G.carried.push({ x: c.x, y: c.y, t: 0, seed: Math.random() });
  burst(c.x, c.y, col('heart', 0.9), 10, 140, -20);
  sfx.cageOpen();
}
// the freed follow in a trail, and go up when carried into the light
function updateCarried(dt){
  var p = G.player, prev = { x: p.x, y: p.y + 4 };
  G.carried.forEach(function(s, i){
    s.t += dt;
    var dx = s.x - prev.x, dy = s.y - prev.y, d = Math.hypot(dx, dy) || 1, gap = i ? 15 : 20;
    if (d > gap){ s.x = prev.x + dx / d * gap; s.y = prev.y + dy / d * gap; }
    s.y += Math.sin(s.t * 3 + i) * 6 * dt;
    prev = s;
  });
  // souls coming down to the heart at the end join the trail when they reach it
  for (var j = G.comers.length - 1; j >= 0; j--){
    var cm = G.comers[j], tail = G.carried[G.carried.length - 1] || p;
    cm.t += dt;
    var cdx = tail.x - cm.x, cdy = tail.y - cm.y, cd = Math.hypot(cdx, cdy) || 1, sp = 260 + 140 * cm.t;
    cm.x += cdx / cd * Math.min(cd, sp * dt); cm.y += cdy / cd * Math.min(cd, sp * dt);
    if (cd < 14){ G.carried.push({ x: cm.x, y: cm.y, t: 0, seed: cm.seed }); G.comers.splice(j, 1); sfx.graze(); }
  }
  if (G.mode === 'play' && G.carried.length && G.shaft > 0.5 && Math.abs(p.x - LW/2) < STOLEN.SHAFT_W / 2 && p.y < ceilingY() + STOLEN.SHAFT_REACH){
    G.carried.forEach(function(s){ G.rising.push({ x: s.x, y: s.y, t: 0, seed: s.seed }); });
    G.saved += G.carried.length;
    addText(LW/2, ceilingY() + 24, G.carried.length > 1 ? G.carried.length + ' ARE FREE' : 'FREE', col('grace', 1), 1.3, 9);
    G.carried = [];
    sfx.deliver();
  }
  for (var k = G.rising.length - 1; k >= 0; k--){
    var r = G.rising[k];
    r.t += dt; r.y -= (60 + 180 * r.t) * dt;
    if (!r.dark) r.x += (LW/2 - r.x) * Math.min(1, dt * 2);
    if (r.y < -30) G.rising.splice(k, 1);
  }
}
// a hit hauls every soul you carry back up into the dark, to be caged again
function dropSouls(){
  if (!G.carried || !G.carried.length) return;
  G.carried.forEach(function(s){ G.rising.push({ x: s.x, y: s.y, t: 0, seed: s.seed, dark: true }); });
  G.pool += G.carried.length;
  G.carried = [];
  sfx.snatch();
}
// ----- shades: they hunt the souls you carry, never the heart -----
function spawnShade(){
  var side = Math.random() < 0.5 ? -1 : 1;
  G.shades.push({ x: side < 0 ? 14 : LW - 14, y: rnd(260, 540), side: side, t: 0, state: 'gather', life: 6, seed: Math.random() });
  sfx.shade();
}
function updateShades(dt){
  for (var i = G.shades.length - 1; i >= 0; i--){
    var sh = G.shades[i];
    sh.t += dt;
    if (sh.state === 'gather'){ if (sh.t >= 0.8){ sh.state = 'drift'; sh.t = 0; } }
    else if (sh.state === 'drift'){
      // the last soul carried; failing that, the nearest spilled one
      var tail = G.carried[G.carried.length - 1], stray = null;
      if (!tail && G.strays.length){ stray = G.strays.slice().sort(function(a, b){ return Math.hypot(a.x - sh.x, a.y - sh.y) - Math.hypot(b.x - sh.x, b.y - sh.y); })[0]; tail = stray; }
      if (!tail || sh.t > sh.life || G.mode !== 'play'){ sh.state = 'fade'; sh.t = 0; continue; }
      var dx = tail.x - sh.x, dy = tail.y - sh.y, d = Math.hypot(dx, dy) || 1;
      sh.x += dx / d * 85 * dt; sh.y += dy / d * 85 * dt;
      if (d < 14){
        var s = stray ? G.strays.splice(G.strays.indexOf(stray), 1)[0] : G.carried.pop();
        G.rising.push({ x: s.x, y: s.y, t: 0, seed: s.seed, dark: true });
        G.pool++;
        sh.state = 'fade'; sh.t = 0;
        addText(s.x, s.y - 16, 'TAKEN', COLORS.ember, 1.0, 7);
        sfx.snatch();
      }
    } else if (sh.t > 0.5){ G.shades.splice(i, 1); }
  }
}
// a bolt through a shade ends it (and is spent)
function boltHitsShade(b){
  for (var i = 0; i < G.shades.length; i++){
    var sh = G.shades[i];
    if (sh.state !== 'fade' && Math.hypot(b.x - sh.x, b.y - sh.y) < 16){
      sh.state = 'fade'; sh.t = 0;
      burst(sh.x, sh.y, '#40303a', 10, 160, 0);
      sfx.pop();
      return true;
    }
  }
  return false;
}
// ----- chains: a spiked iron ball on a real chain (rules 4 and 11) -----
// From the roof it waits in a hatch, its chain run along the roof to a
// pulley; let go, it falls until the chain runs out, catches with a jolt and
// swings. From the Warden's fist he winds it back along its arc and lets it
// fly. Either way, from the moment it is let go the ball is a pendulum under
// gravity: it slows at the top of each swing, strikes the walls and comes
// back off them, and its chain is a rope of links that trails and bows.
var CHAIN = { ROOF: 97, G: 1300, BALL: 11, HIT_BALL: 19, HIT_LINK: 11, SWING: 3.0, REEL: 0.5, NODES: 18, BOUNCE: 0.5, DAMP: 0.08, AIM: 0.9, LOCK: 0.22 };
function chainLive(from){ return G.flames.some(function(f){ return f.type === 'chain' && f.from === from; }); }
function spawnChain(){
  var p = G.player, s = p.x < LW / 2 ? 1 : -1;       // the pulley over the heart, toward the middle
  if (Math.random() < 0.35) s = -s;
  var ax = clamp(p.x + s * rnd(40, 150), 26, LW - 26);
  var fl = { type: 'chain', from: 'roof', ax: ax, ay: CHAIN.ROOF + 7, lmin: 150, lmax: 600, r: CHAIN.BALL, ts: 1, swingT: CHAIN.SWING,
             state: 'aim', t: 0, aimT: CHAIN.AIM, lockT: CHAIN.LOCK, th: 0, om: 0, len: 0, L: 200, A: 1, th0: 0.8, side: 1,
             hx: ax, bx: ax, by: CHAIN.ROOF + 13, vy: 0, nodes: null, spin: 0, lastTh: 0, wheel: 0, seed: Math.random() };
  chainPlan(fl);
  fl.bx = fl.hx;
  G.flames.push(fl);
  sfx.aim(); sfx.chainRattle(fl.hx);
  return true;
}
// the swing's reach, for a ball dropped from the roof at `start` from straight
// down: it falls until the chain runs out, keeps the part of its speed that is
// across the chain, and swings out to this angle on the other side
function dropAmplitude(start){
  var c = Math.cos(start), s = Math.sin(start);
  return Math.acos(clamp(c - c * s * s, -1, 1));
}
// Plan the swing from where the heart is: the chain is as long as the heart is
// far from the pivot, so the arc passes through it, and the ball is let go on
// the side that carries the swing past it (the far side when there is room:
// down through the bottom and up through the heart). Called every frame of
// the aim, and not again after the lock.
function chainPlan(fl){
  var p = G.player, dx = p.x - fl.ax, dy = Math.max(30, p.y - fl.ay);
  var L = clamp(Math.hypot(dx, dy), fl.lmin, fl.lmax), phi = Math.atan2(dx, dy), ap = Math.abs(phi), sg = phi < 0 ? -1 : 1, best = null;
  fl.L = L;
  [-sg, sg].forEach(function(side, far){
    var room = side > 0 ? LW - fl.r - 4 - fl.ax : fl.ax - fl.r - 4;
    var lim = room >= L ? 1.4 : Math.asin(Math.max(0, room) / L);   // how far out that side's wall lets it start
    var start, amp, margin;
    if (fl.from === 'roof'){
      if (far === 0){
        // the smallest drop that swings 20° past the heart on the other side
        var want = Math.min(1.4, Math.max(ap + 0.35, 0.8)), lo = 0.05, hi = Math.min(lim, 1.4);
        if (dropAmplitude(hi) > want){ for (var it = 0; it < 14; it++){ var mid = (lo + hi) / 2; if (dropAmplitude(mid) > want) hi = mid; else lo = mid; } }
        start = hi; amp = dropAmplitude(start); margin = amp - ap;
      } else {
        start = Math.min(lim, Math.max(ap + 0.35, 0.5)); amp = dropAmplitude(start); margin = start - ap;
      }
    } else {
      start = Math.min(lim, 1.25, Math.max(ap + 0.4, 0.75)); amp = start; margin = start - ap;
    }
    var score = margin + (far === 0 ? 0.15 : 0);
    if (!best || score > best.score) best = { score: score, side: side, start: start, amp: amp };
  });
  fl.side = best.side; fl.th0 = best.start * best.side; fl.A = best.amp;
  if (fl.from === 'roof') fl.hx = fl.ax + Math.sin(fl.th0) * L;     // straight above where the chain runs out
}
// how far along its arc the ball can go before a wall stops it
function chainArc(fl){
  var lim = fl.r + 2;
  var lo = -Math.asin(Math.min(1, Math.max(0, fl.ax - lim) / fl.L)), hi = Math.asin(Math.min(1, Math.max(0, LW - lim - fl.ax) / fl.L));
  return [Math.max(-fl.A, lo), Math.min(fl.A, hi)];
}
function ballFromAngle(fl){ fl.bx = fl.ax + Math.sin(fl.th) * fl.len; fl.by = fl.ay + Math.cos(fl.th) * fl.len; }
function ballVelocity(fl){
  if (fl.state === 'drop') return { x: 0, y: fl.vy * fl.ts };
  if (fl.state !== 'swing') return { x: 0, y: 0 };
  var v = fl.om * fl.len * fl.ts;
  return { x: Math.cos(fl.th) * v, y: -Math.sin(fl.th) * v };
}
// how hot it is: it heats in its clamp or his fist through the telegraph,
// burns from the moment it is let go, and dies down as it is hauled up
function chainHeat(fl){
  if (fl.state === 'aim') return 0.15 + 0.45 * Math.min(1, fl.t / fl.aimT);
  if (fl.state === 'lock') return 0.75;
  if (fl.state === 'drop' || fl.state === 'swing') return 1;
  return Math.max(0, 1 - fl.t / CHAIN.REEL);
}
// the chain itself: a rope of nodes pinned at the pivot and the ball
function ropeInit(fl, x0, y0, x1, y1){
  fl.nodes = [];
  for (var i = 0; i <= CHAIN.NODES; i++){ var u = i / CHAIN.NODES, x = lerp(x0, x1, u), y = lerp(y0, y1, u); fl.nodes.push({ x: x, y: y, px: x, py: y }); }
}
function ropeStep(fl, dt, slack){
  var n = fl.nodes, N = n.length - 1, i, it;
  n[0].x = fl.ax; n[0].y = fl.ay; n[N].x = fl.bx; n[N].y = fl.by;
  var rest = Math.max(0.3, fl.len * slack / N), g = CHAIN.G * dt * dt;
  for (i = 1; i < N; i++){
    var q = n[i], vx = (q.x - q.px) * 0.98, vy = (q.y - q.py) * 0.98;
    q.px = q.x; q.py = q.y; q.x += vx; q.y += vy + g;
  }
  // links pull, never push: a chain can go slack, never stiff
  for (it = 0; it < 12; it++){
    var fwd = it % 2 === 0;
    for (var j = 0; j < N; j++){
      i = fwd ? j : N - 1 - j;
      var a = n[i], b = n[i + 1], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d <= rest || d < 1e-4) continue;
      var k = (d - rest) / d;
      if (i === 0){ b.x -= dx * k; b.y -= dy * k; }
      else if (i + 1 === N){ a.x += dx * k; a.y += dy * k; }
      else { a.x += dx * k * 0.5; a.y += dy * k * 0.5; b.x -= dx * k * 0.5; b.y -= dy * k * 0.5; }
    }
  }
  n[0].x = fl.ax; n[0].y = fl.ay; n[N].x = fl.bx; n[N].y = fl.by;
}
function chainTouches(fl, x, y, r){
  var n = fl.nodes; if (!n) return false;
  for (var i = 0; i < n.length - 1; i++) if (distToSeg(x, y, n[i].x, n[i].y, n[i + 1].x, n[i + 1].y) < r) return true;
  return false;
}
// one frame of a chain; true when it is gone
function stepChain(fl, dt, live){
  if (fl.gone) return true;                            // hauled off before it was let go
  var p = G.player, sdt = dt * fl.ts;
  if (fl.state === 'aim'){
    if (live) chainPlan(fl);                          // tracks, then freezes at lock: not led
    if (fl.from === 'fist'){
      var e = smooth(fl.t / fl.aimT);                 // he winds it back along its arc
      fl.len = lerp(fl.len0, fl.L, e); fl.th = lerp(fl.thI, fl.th0, e); ballFromAngle(fl);
      ropeStep(fl, dt, 1.02);
    } else { fl.bx = fl.hx + Math.sin(fl.t * 47) * 0.9 * (fl.t / fl.aimT); fl.by = fl.ay + 6; }   // it trembles in its clamp
    if (fl.t >= fl.aimT){ fl.state = 'lock'; fl.t = 0; sfx.lock(); }
  } else if (fl.state === 'lock'){
    if (fl.from === 'roof'){ fl.bx = fl.hx + rnd(-1, 1) * 1.3; }
    else ropeStep(fl, dt, 1.02);
    if (fl.t >= fl.lockT){
      fl.t = 0;
      if (fl.from === 'roof'){
        fl.state = 'drop'; fl.vy = 0; fl.bx = fl.hx; fl.by = fl.ay + 6; fl.len = Math.hypot(fl.hx - fl.ax, 6);
        ropeInit(fl, fl.ax, fl.ay, fl.hx, fl.ay + 6);
        sfx.chainDrop(fl.hx);
      } else {
        fl.state = 'swing'; fl.om = 0; fl.th = fl.th0; fl.len = fl.L; fl.lastTh = fl.th;
        sfx.chainLoose(fl.bx);
      }
    }
  } else if (fl.state === 'drop'){
    fl.vy += CHAIN.G * sdt; fl.by += fl.vy * sdt;
    var ddx = fl.bx - fl.ax, ddy = fl.by - fl.ay, d = Math.hypot(ddx, ddy);
    fl.len = d; fl.wheel += fl.vy * sdt / 6;
    if (d >= fl.L){
      // the chain runs out: it catches, and the fall becomes a swing
      fl.th = Math.atan2(ddx, ddy); fl.len = fl.L; fl.lastTh = fl.th;
      fl.om = -fl.vy * Math.sin(fl.th) / fl.L;
      ballFromAngle(fl);
      fl.state = 'swing'; fl.t = 0;
      if (live){ G.shake = Math.max(G.shake, 0.35); sfx.chainSnap(fl.bx); }
      burst(fl.ax, fl.ay + 5, '#ffb060', 6, 130);
    }
    ropeStep(fl, sdt, 1.0);
  } else if (fl.state === 'swing'){
    for (var k = 0, h = sdt / 4; k < 4; k++){
      fl.om += (-(CHAIN.G / fl.len) * Math.sin(fl.th) - CHAIN.DAMP * fl.om) * h;
      fl.th += fl.om * h;
      // the walls: it strikes, and comes back off them at half the speed
      var bxk = fl.ax + Math.sin(fl.th) * fl.len, lim = fl.r + 2;
      if (bxk < lim || bxk > LW - lim){
        var left = bxk < lim, edge = left ? lim : LW - lim;
        fl.th = Math.asin(clamp((edge - fl.ax) / fl.len, -1, 1));
        if (left ? fl.om < 0 : fl.om > 0){
          var sp = Math.abs(fl.om * fl.len);
          fl.om = -fl.om * CHAIN.BOUNCE;
          if (sp > 90){
            ballFromAngle(fl);
            burst(edge + (left ? -fl.r : fl.r) * 0.6, fl.by, '#ffc070', 7, 200);
            if (live){ sfx.ballClang(edge); G.shake = Math.max(G.shake, 0.3); }
          }
        }
      }
    }
    ballFromAngle(fl);
    var speed = Math.abs(fl.om * fl.len);
    if ((fl.th > 0) !== (fl.lastTh > 0) && speed > 260 && live) sfx.chainWhoosh(fl.bx, speed);
    fl.lastTh = fl.th;
    fl.spin += fl.om * sdt * 2.2;
    ropeStep(fl, sdt, 1.012);
    if (fl.t >= fl.swingT){ fl.state = 'reel'; fl.t = 0; fl.len0 = fl.len; sfx.chainReel(fl.ax); }
  } else {
    // hauled back up: into the roof, or into his fist
    var end = fl.from === 'fist' ? WARDEN.FLAIL_LEN : 0;
    fl.len = lerp(fl.len0, end, smooth(fl.t / CHAIN.REEL));
    fl.om *= Math.max(0, 1 - 5 * dt); fl.th += fl.om * dt; fl.th *= Math.max(0, 1 - 2.5 * dt);
    fl.wheel -= fl.len0 / CHAIN.REEL * dt / 6;
    ballFromAngle(fl);
    ropeStep(fl, dt, 1.0);
    if (fl.t >= CHAIN.REEL){
      if (fl.owner){ fl.owner.flail = { th: fl.th, om: fl.om, len: WARDEN.FLAIL_LEN }; fl.owner.flailOut = null; }
      return true;
    }
  }
  var out = fl.state === 'drop' || fl.state === 'swing';
  if (out && Math.random() < 0.6){
    // it burns: embers shed from the ball, and now and then from a link
    var V = ballVelocity(fl), n = fl.nodes && fl.nodes[1 + Math.floor(Math.random() * (fl.nodes.length - 2))];
    addPart({ x: fl.bx + rnd(-5, 5), y: fl.by + rnd(-5, 5), vx: -V.x * 0.15 + rnd(-30, 30), vy: -V.y * 0.15 - rnd(20, 80), life: rnd(0.4, 0.9), t: 0, c: Math.random() < 0.5 ? '#ffb050' : '#ff6a10', r: rnd(1, 2.2), g: -40, turb: 20 });
    if (n && Math.random() < 0.4) addPart({ x: n.x, y: n.y, vx: rnd(-20, 20), vy: rnd(-70, -20), life: rnd(0.3, 0.7), t: 0, c: '#ff9a40', r: rnd(0.8, 1.6), g: -30, turb: 15 });
  }
  if (out){
    // it smashes a cage it meets (the soul spills out) and ends a shade
    var hard = fl.state === 'drop' ? fl.vy > 220 : Math.abs(fl.om * fl.len) > 220;     // only a ball moving hard breaks a cage
    if (G.cages && hard) G.cages.forEach(function(c){ if (c.state === 'hang' && c.soul && Math.hypot(c.x - fl.bx, c.y - fl.by) < fl.r + 18) smashCage(c, fl); });
    if (G.shades) G.shades.forEach(function(sh){
      if (sh.state !== 'fade' && Math.hypot(sh.x - fl.bx, sh.y - fl.by) < fl.r + 14){ sh.state = 'fade'; sh.t = 0; burst(sh.x, sh.y, '#40303a', 10, 160, 0); sfx.pop(); }
    });
    // the ball hurts from the moment it is let go; the chain once it swings
    if (live){
      if (Math.hypot(p.x - fl.bx, p.y - fl.by) < CHAIN.HIT_BALL) hurt(null, fl.bx, fl.by);
      else if (fl.state === 'swing' && chainTouches(fl, p.x, p.y, CHAIN.HIT_LINK)) hurt(null, p.x, p.y - 10);
    }
  }
  return false;
}
// a ball through a hanging cage breaks it open: the soul spills out and waits
function smashCage(c, fl){
  c.soul = false; c.broken = true; c.lock = 0; c.t = 0; c.shake = 1.4;
  var a = Math.atan2(c.y - fl.by, c.x - fl.bx);
  G.strays.push({ x: c.x, y: c.y + 3, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120 - 40, t: 0, seed: Math.random() });
  burst(c.x, c.y, '#6e605a', 12, 220);
  burst(c.x, c.y, col('heart', 0.9), 8, 140, -20);
  fl.om *= 0.8;
  G.shake = Math.max(G.shake, 0.4);
  addText(c.x, c.y - 34, 'SMASHED', COLORS.heart, 1.0, 7);
  sfx.cageSmash();
}
// Souls spilled from a smashed cage do not wait: they sink toward the crust,
// fading, and after STRAY.LIFE seconds the pit takes them back (to be caged
// again). Shades go for them too.
var STRAY = { LIFE: 4.5, SINK: 22 };
function updateStrays(dt){
  var p = G.player;
  for (var i = G.strays.length - 1; i >= 0; i--){
    var s = G.strays[i], damp = Math.max(0, 1 - 3 * dt);
    s.t += dt; s.vx *= damp; s.vy *= damp;
    s.x = clamp(s.x + s.vx * dt, 14, LW - 14);
    s.y = clamp(s.y + (s.vy + STRAY.SINK) * dt + Math.sin(s.t * 2.4 + s.seed * 6) * 8 * dt, LH * 0.25 + 8, FLOOR - 20);
    if (s.t >= STRAY.LIFE){
      G.rising.push({ x: s.x, y: s.y, t: 0, seed: s.seed, dark: true });
      G.pool++; G.strays.splice(i, 1);
      addText(s.x, s.y - 16, 'LOST', COLORS.ember, 1.0, 7);
      sfx.snatch();
      continue;
    }
    if (G.mode !== 'play' || Math.hypot(p.x - s.x, p.y - s.y) > 18){ s.warned = false; continue; }
    if (G.carried.length < STOLEN.CARRY){ G.carried.push({ x: s.x, y: s.y, t: 0, seed: s.seed }); G.strays.splice(i, 1); sfx.cageOpen(); }
    else if (!s.warned){ s.warned = true; addText(p.x, p.y - 30, 'CARRY THEM UP', COLORS.sulfur, 1.1, 7); }
  }
}

// ----- the knights: a patrol of dark knights marching the crust (rules 4 and 11) -----
// They march in from the sides and pace back and forth along the floor, their
// helms turned up to follow the heart; touching one is a hit. Now and then
// one attacks: a spearman strides under the heart, a pale line over his pike
// showing how high it will reach, braces, and drives it straight up; a
// crossbowman stops, raises his crossbow along a pale line to the heart, and
// looses a quarrel along it. Neither leads the heart: it is where the heart
// was at the lock.
var KNIGHT = { SPEED: 30, TRACK: 75, AIM: 0.9, LOCK: 0.22, THRUST: 0.1, HOLD: 0.4, PULL: 0.3, RECOVER: 0.5, STAGGER: 0.18, GAP: 64,
               REST: 120, REACH_MIN: 150, REACH_MAX: 360, XAIM: 0.7, RAISE: 0.3, QUARREL: 720, SHAFT: 13, SPEAR_DX: 10, H: 100, BODY: 14, MAX: 5,
               WARDEN_XBOWS: 2, WARDEN_SHOT: [3.2, 4.4], WARDEN_SHOT_HIT: 0.4 };
// who marches in, and when (the meter's share): spearmen first, then a crossbowman
var PATROL = [[0, 'spear'], [0.2, 'spear'], [0.4, 'xbow'], [0.7, 'spear']];
function knightEnter(kind, side){
  if (G.knights.length >= KNIGHT.MAX) return null;
  side = side || (Math.random() < 0.5 ? -1 : 1);
  var edge = function(sd){ return G.knights.some(function(o){ return o.st !== 'die' && Math.abs(o.x - (sd < 0 ? -26 : LW + 26)) < 70; }); };
  if (edge(side) && !edge(-side)) side = -side;           // not in on top of another
  var k = { kind: kind, x: side < 0 ? -26 : LW + 26, dir: -side, face: -side, st: 'walk', t: 0, step: Math.random() * 6, turnT: rnd(4, 7),
            look: 0, raise: 0, reach: 200, tip: KNIGHT.REST, ang: 0, tx: 0, ty: 0, off: 0, delay: 0, fade: 1, seed: Math.random() };
  G.knights.push(k);
  sfx.knightMarch(k.x);
  return k;
}
function spearX(k){ return k.x + KNIGHT.SPEAR_DX * k.face; }
function knightArmed(k){ return k.st === 'aim' || k.st === 'lock' || k.st === 'thrust' || k.st === 'hold' || k.st === 'shot'; }
// the crossbow's pivot at his shoulder, raised to aim
function xbowAt(k){ return { x: k.x + 4 * k.face, y: FLOOR - 78 }; }
// send up to n free knights of a kind at the heart; true if any went
function knightAttack(kind, n){
  var p = G.player, offs = [0, -KNIGHT.GAP, KNIGHT.GAP];
  var free = G.knights.filter(function(k){ return k.kind === kind && k.st === 'walk' && k.x > 16 && k.x < LW - 16; })
    .sort(function(a, b){ return Math.abs(a.x - p.x) - Math.abs(b.x - p.x); }).slice(0, n);
  if (!free.length) return false;
  free.forEach(function(k, i){ k.st = 'aim'; k.t = 0; k.delay = 0; k.off = kind === 'spear' ? offs[i] : 0; k.face = p.x + k.off >= k.x ? 1 : -1; });
  if (kind === 'spear') free.slice().sort(function(a, b){ return a.off - b.off; }).forEach(function(k, i){ k.delay = i * KNIGHT.STAGGER; });   // left to right, a beat apart
  else free.forEach(function(k, i){ k.t = -i * 0.35; });                                  // a pair looses one after the other
  sfx.aim();
  return true;
}
function knightsBusy(){ return G.knights.some(knightArmed) || G.quarrels.some(function(q){ return !q.stuck; }); }
function knightsOf(kind){ return G.knights.filter(function(k){ return k.kind === kind && k.st !== 'die'; }).length; }
// how near the heart is to the patrol and its attacks, for its beat
function knightsNear(p){
  var best = 1e9;
  G.knights.forEach(function(k){
    if (k.st === 'die') return;
    best = Math.min(best, Math.max(0, Math.abs(p.x - k.x) - KNIGHT.BODY) + Math.max(0, (FLOOR - KNIGHT.H) - p.y) + 30);
    if (k.kind === 'spear' && knightArmed(k)){
      var tele = k.st === 'aim' || k.st === 'lock', top = FLOOR - (tele ? k.reach : k.tip);
      best = Math.min(best, Math.abs(p.x - spearX(k)) + Math.max(0, top - p.y) + (tele ? 40 : 0));
    } else if (k.kind === 'xbow' && (k.st === 'aim' || k.st === 'lock') && k.t >= 0){
      var X = xbowAt(k); best = Math.min(best, distToSeg(p.x, p.y, X.x, X.y, k.tx, k.ty) + 50);
    }
  });
  G.quarrels.forEach(function(q){ if (!q.stuck) best = Math.min(best, Math.hypot(p.x - q.x, p.y - q.y)); });
  return best;
}
// the patrol stands down (an ending); with their master gone, they burn away
function knightsStand(dying){
  G.knights.forEach(function(k){
    if (dying){ if (k.st !== 'die'){ k.st = 'die'; k.t = 0; } return; }
    if (k.st !== 'walk' && k.st !== 'die'){ k.st = 'walk'; k.t = 0; k.tip = KNIGHT.REST; k.raise = 0; }
  });
  G.quarrels = G.quarrels.filter(function(q){ return q.stuck; });
}
function updateKnights(dt, live){
  var p = G.player, i;
  for (i = G.knights.length - 1; i >= 0; i--){
    var k = G.knights[i];
    k.t += dt;
    // their helms turn up to follow the heart
    var want = clamp(Math.atan2(p.x - k.x, Math.max(20, (FLOOR - KNIGHT.H) - p.y)) * 0.5, -0.4, 0.4);
    k.look += (want - k.look) * Math.min(1, dt * 4);
    if (k.st === 'die'){
      k.fade = Math.max(0, 1 - k.t / 1.1);
      if (Math.random() < 0.6) addPart({ x: k.x + rnd(-12, 12), y: FLOOR - rnd(0, KNIGHT.H), vx: rnd(-20, 20), vy: rnd(-90, -40), life: rnd(0.5, 1), t: 0, c: Math.random() < 0.5 ? '#ffb060' : '#4a3e3a', r: rnd(1, 2.2), g: -20 });
      if (k.fade <= 0) G.knights.splice(i, 1);
      continue;
    }
    if (k.st === 'walk'){
      k.x += k.dir * KNIGHT.SPEED * dt; k.step += KNIGHT.SPEED * dt / 8; k.face = k.dir;
      k.turnT -= dt;
      var inside = k.x > 26 && k.x < LW - 26;
      // keep their distance: turn from one just ahead, and of two on top of each other the later turns
      var blocked = G.knights.some(function(o, j){ return o !== k && o.st !== 'die' && Math.abs(o.x - k.x) < 46 && ((o.x - k.x) * k.dir > 0 || (Math.abs(o.x - k.x) < 12 && j < i && o.dir === k.dir)); });
      if ((k.x <= 26 && k.dir < 0) || (k.x >= LW - 26 && k.dir > 0) || (inside && (k.turnT <= 0 || blocked))){ k.dir = -k.dir; k.turnT = rnd(4, 7); }
    } else if (k.st === 'recover'){
      k.raise = Math.max(0, k.raise - dt / KNIGHT.RAISE);
      if (k.t >= KNIGHT.RECOVER){ k.st = 'walk'; k.t = 0; k.dir = k.face; }
    } else if (k.kind === 'spear'){
      if (k.st === 'aim'){
        // he strides under the heart, his line showing how high he will reach
        if (live){
          var tx = clamp(p.x + k.off - KNIGHT.SPEAR_DX * k.face, 20, LW - 20), mv = clamp(tx - k.x, -KNIGHT.TRACK * dt, KNIGHT.TRACK * dt);
          k.x += mv; k.step += Math.abs(mv) / 8;
          k.reach = clamp(FLOOR - p.y + 50, KNIGHT.REACH_MIN, KNIGHT.REACH_MAX);
        }
        if (k.t >= KNIGHT.AIM){ k.st = 'lock'; k.t = 0; if (k.delay === 0) sfx.lock(); }
      } else if (k.st === 'lock'){
        if (k.t >= KNIGHT.LOCK + k.delay){ k.st = 'thrust'; k.t = 0; if (live) sfx.spearThrust(spearX(k)); }
      } else if (k.st === 'thrust'){
        k.tip = lerp(KNIGHT.REST, k.reach, Math.min(1, k.t / KNIGHT.THRUST));
        if (k.t >= KNIGHT.THRUST){ k.st = 'hold'; k.t = 0; }
      } else if (k.st === 'hold'){
        k.tip = k.reach;
        if (k.t >= KNIGHT.HOLD){ k.st = 'pull'; k.t = 0; }
      } else if (k.st === 'pull'){
        k.tip = lerp(k.reach, KNIGHT.REST, smooth(k.t / KNIGHT.PULL));
        if (k.t >= KNIGHT.PULL){ k.st = 'recover'; k.t = 0; k.tip = KNIGHT.REST; }
      }
      // the pike, from its tip down to the crust, while it is driven and held
      if (live && (k.st === 'thrust' || k.st === 'hold') && Math.abs(p.x - spearX(k)) < KNIGHT.SHAFT && p.y > FLOOR - k.tip - 6)
        hurt(null, spearX(k), p.y + 20);
    } else {
      if (k.st === 'aim' && k.t >= 0){
        k.raise = Math.min(1, k.raise + dt / KNIGHT.RAISE);
        if (live){ k.tx = p.x; k.ty = p.y; }
        k.face = k.tx >= k.x ? 1 : -1;
        var X = xbowAt(k); k.ang = Math.atan2(k.ty - X.y, k.tx - X.x);
        if (k.t >= KNIGHT.XAIM){ k.st = 'lock'; k.t = 0; sfx.lock(); }
      } else if (k.st === 'lock'){
        if (k.t >= KNIGHT.LOCK){
          k.st = 'shot'; k.t = 0;
          var X2 = xbowAt(k), c = Math.cos(k.ang), sn = Math.sin(k.ang);
          G.quarrels.push({ x: X2.x + c * 16, y: X2.y + sn * 16, vx: c * KNIGHT.QUARREL, vy: sn * KNIGHT.QUARREL, ang: k.ang, stuck: false, t: 0 });
          if (live) sfx.xbowTwang(X2.x);
        }
      } else if (k.st === 'shot'){
        if (k.t >= 0.35){ k.st = 'recover'; k.t = 0; }
      }
    }
    // touching one is a hit
    if (live && Math.abs(p.x - k.x) < KNIGHT.BODY + 6 && p.y > FLOOR - KNIGHT.H + 8) hurt(null, k.x, p.y);
  }
  for (i = G.quarrels.length - 1; i >= 0; i--){
    var q = G.quarrels[i];
    if (q.stuck){ q.t += dt; if (q.t > 1.2) G.quarrels.splice(i, 1); continue; }
    var ox = q.x, oy = q.y;
    q.x += q.vx * dt; q.y += q.vy * dt;
    // it strikes only a heart that can be hurt; through one that cannot (just hit) it flies on
    if (live && G.invuln <= 0 && !(DEV.on && DEV.god) && distToSeg(p.x, p.y, ox, oy, q.x, q.y) < 12){ hurt(null, q.x, q.y); G.quarrels.splice(i, 1); continue; }
    if (q.y < 6 || q.x < 4 || q.x > LW - 4){
      q.stuck = true; q.t = 0; q.x = clamp(q.x, 4, LW - 4); q.y = Math.max(6, q.y);
      if (live) sfx.quarrelThunk(q.x);
    } else if (q.y > LH + 20) G.quarrels.splice(i, 1);
  }
}
// ----- the rescue, then the Warden -----
function updateStolen(dt){
  if (G.intro > 0) G.intro -= dt;
  G.shaft = G.phase === 'rescue' ? Math.min(1, G.shaft + dt) : Math.max(0, G.shaft - dt * 0.8);
  updateCages(dt);
  updateCarried(dt);
  updateStrays(dt);
  updateShades(dt);
  updateKnights(dt, G.mode === 'play');
  if (G.phase === 'rescue'){
    G.surv += dt;
    var prog = G.prog = Math.min(1, G.surv / G.SURV);
    G.cageT -= dt;
    if (G.pool > 0 && hangingCages() < STOLEN.HANG && G.cageT <= 0){ lowerCage(); G.cageT = 0.7; }
    if (G.intro <= 0){
      // the patrol marches in as the meter fills
      while (G.patrolN < PATROL.length && prog >= PATROL[G.patrolN][0]){ knightEnter(PATROL[G.patrolN][1], G.patrolN % 2 ? 1 : -1); G.patrolN++; }
      // one swinging chain at a time; spear attacks from 20 %, a crossbow from 40 %
      G.chainT -= dt;
      if (G.chainT <= 0){ G.chainT = rnd(3.4, 4.4) - prog * 1.0; if (mayspawn() && !chainLive('roof')) spawnChain(); }
      if (prog > 0.2){
        G.spearT -= dt;
        if (G.spearT <= 0){ G.spearT = lerp(6.5, 4.5, prog); if (mayspawn()) knightAttack('spear', prog < 0.45 ? 1 : (prog < 0.75 ? 2 : 3)); }
      }
      if (prog > 0.4){
        G.xbowT -= dt;
        if (G.xbowT <= 0){ G.xbowT = rnd(8, 10.5) - prog * 2; if (mayspawn()) knightAttack('xbow', 1); }
      }
      if (G.carried.length || G.strays.length){
        G.shadeT -= dt;
        if (G.shadeT <= 0){ G.shadeT = rnd(3.2, 4.2); if (!G.shades.length && mayspawn()) spawnShade(); }
      }
    }
    if (G.surv >= G.SURV) wardenComes();
  } else if (G.warden){
    updateWarden(dt);
    // his crossbowmen keep shooting all through the fight, faster as he is hurt
    var ww = G.warden;
    if (!ww.dying && (ww.state === 'open' || ww.state === 'attack') && G.mode === 'play'){
      G.xbowT -= dt;
      if (G.xbowT <= 0){ G.xbowT = rnd(KNIGHT.WARDEN_SHOT[0], KNIGHT.WARDEN_SHOT[1]) - KNIGHT.WARDEN_SHOT_HIT * ww.hits; knightAttack('xbow', 1); }
    }
  }
}
// the meter is full: silence, the cages are hoisted away, and he comes down
function wardenComes(){
  G.phase = 'warden'; G.prog = 1;
  G.warden = makeWarden();
  G.hold = 1.4;
  G.cages.forEach(function(c){ c.state = 'rise'; c.t = 0; });
  G.flames.forEach(function(fl){ if (fl.type === 'chain') windDown(fl); });
  knightsStand(false);
  while (knightsOf('xbow') < KNIGHT.WARDEN_XBOWS && knightEnter('xbow'));   // his crossbowmen march in for the fight
  G.xbowT = 3.5;
  G.strays.forEach(function(s){ G.rising.push({ x: s.x, y: s.y, t: 0, seed: s.seed, dark: true }); });   // taken back up
  G.pool += G.strays.length; G.strays = [];
  G.shades.forEach(function(s){ s.state = 'fade'; s.t = 0; });
  music.stop(0.5);
  music.whisper(0);
}
// The Warden: a knight in black iron, looming out of the dark, his legs lost
// in his cloak. A horned great helm with a fire in its slit; a lantern
// hanging from his left fist (the target: shuttered but for its windows); a
// flail in his right. Both hang on chains, and both swing as he moves.
var WARDEN = { Y: 158, LAMP_FIST: [80, 30], FLAIL_FIST: [-94, 58], SHOULDER: [90, 14], BONES: [40, 38],
               LAMP_CHAIN: 20, LAMP_T: 22, LAMP_W: 17, FLAIL_LEN: 26, FLAIL_BALL: 13 };
function makeWarden(){
  return { x: LW/2, y: -290, targetY: WARDEN.Y, state: 'wait', st: 0, sway: 0, cycle: 0, attack: '', hits: 0,
           shutter: 0, beam: null, thrown: 0, summoned: false, knightsN: 0, dying: false, dieT: 0, dead: false, kick: 0, takeIn: null,
           eyes: 0, flare: 0, lamp: { th: 0, om: 0 }, flail: { th: 0, om: 0, len: WARDEN.FLAIL_LEN }, flailOut: null,
           prevL: null, prevF: null, broken: false, wreck: [] };
}
// where everything is this frame: his centre, both fists, the lantern
function wardenPose(w){
  var dieK = w.dying ? clamp(w.dieT / RELEASE.dead, 0, 1) : 0;
  var x = w.x + (w.dying ? Math.sin(G.t * 40) * 4 * dieK : 0), y = w.y - w.kick * 18 + Math.sin(G.t * 1.7) * 1.2 + dieK * dieK * 90;
  var raise = w.state === 'open' ? 12 * w.shutter : 0;          // he holds it up when it is open
  var lf = { x: x + WARDEN.LAMP_FIST[0], y: y + WARDEN.LAMP_FIST[1] - raise }, ff = { x: x + WARDEN.FLAIL_FIST[0], y: y + WARDEN.FLAIL_FIST[1] };
  var sn = Math.sin(w.lamp.th), cs = Math.cos(w.lamp.th);
  var ring = { x: lf.x + sn * WARDEN.LAMP_CHAIN, y: lf.y + 6 + cs * WARDEN.LAMP_CHAIN };
  return { x: x, y: y, lampFist: lf, flailFist: ff, ring: ring, lantern: { x: ring.x + sn * WARDEN.LAMP_T, y: ring.y + cs * WARDEN.LAMP_T }, rot: w.lamp.th };
}
function wardenLantern(w){ return wardenPose(w).lantern; }
// two bones from shoulder to fist, the elbow bent outward
function limb(S, F, a, b, out){
  var dx = F.x - S.x, dy = F.y - S.y, d = Math.max(1, Math.min(Math.hypot(dx, dy), a + b - 0.5)), ang = Math.atan2(dy, dx);
  var A = Math.acos(clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1));
  var e1 = { x: S.x + Math.cos(ang + A) * a, y: S.y + Math.sin(ang + A) * a }, e2 = { x: S.x + Math.cos(ang - A) * a, y: S.y + Math.sin(ang - A) * a };
  return (e1.x - e2.x) * out > 0 ? e1 : e2;
}
function wardenArms(P){
  var sl = { x: P.x + WARDEN.SHOULDER[0], y: P.y + WARDEN.SHOULDER[1] }, sf = { x: P.x - WARDEN.SHOULDER[0], y: P.y + WARDEN.SHOULDER[1] };
  return [
    { s: 1, S: sl, E: limb(sl, P.lampFist, WARDEN.BONES[0], WARDEN.BONES[1], 1), F: P.lampFist },
    { s: -1, S: sf, E: limb(sf, P.flailFist, WARDEN.BONES[0], WARDEN.BONES[1], -1), F: P.flailFist }
  ];
}
// what hangs from a fist swings from the fist's own movement
function swingFrom(pend, len, fist, prev, dt, damp){
  if (dt <= 0) return;
  var vx = (fist.x - prev.x) / dt, ax = clamp((vx - prev.vx) / dt, -2500, 2500);
  prev.x = fist.x; prev.vx = vx;
  pend.om += (-(CHAIN.G / len) * Math.sin(pend.th) - (ax / len) * Math.cos(pend.th) - damp * pend.om) * dt;
  pend.th = clamp(pend.th + pend.om * dt, -1.3, 1.3);
}
var WARDEN_ATTACKS = ['knights', 'flail', 'beam'];
function wardenAttack(w){
  w.state = 'attack'; w.st = 0; w.cycle++;
  w.attack = WARDEN_ATTACKS[w.cycle % WARDEN_ATTACKS.length];
  w.thrown = 0; w.summoned = false; w.beam = null;
}
function wardenOpen(w){ w.state = 'open'; w.st = 0; w.beam = null; sfx.shutter(); }
// his flail: the ball on its chain, wound back from his fist and let fly
function spawnFlail(w, speed){
  var P = wardenPose(w), F = P.flailFist, fl = w.flail;
  var c = { type: 'chain', from: 'fist', owner: w, ax: F.x, ay: F.y + 6, lmin: 110, lmax: 520, r: WARDEN.FLAIL_BALL, ts: speed, swingT: 2.6,
            state: 'aim', t: 0, aimT: CHAIN.AIM, lockT: CHAIN.LOCK, th: fl.th, om: 0, len: fl.len, len0: fl.len, thI: fl.th, L: 200, A: 1, th0: 0.8, side: 1,
            bx: 0, by: 0, nodes: null, spin: 0, lastTh: 0, wheel: 0, seed: Math.random() };
  ballFromAngle(c);
  chainPlan(c);
  ropeInit(c, c.ax, c.ay, c.bx, c.by);
  G.flames.push(c);
  w.flailOut = c;
  sfx.aim(); sfx.chainRattle(F.x);
}
function updateWarden(dt){
  var w = G.warden, p = G.player;
  w.st += dt; w.kick = decay(w.kick, 3, dt); w.flare = decay(w.flare, 1.4, dt);
  if (w.state === 'wait'){
    if (G.hold <= 0){ w.state = 'enter'; w.st = 0; G.shake = 1.2; G.herald = 2.0; sfx.wardenArrive(); music.play('warden'); }
    return;
  }
  if (!w.flailOut) w.sway += dt;                         // he stands still to swing it
  w.x = LW/2 + Math.sin(w.sway * 0.5) * 50;
  var P = wardenPose(w);
  if (!w.prevL){ w.prevL = { x: P.lampFist.x, vx: 0 }; w.prevF = { x: P.flailFist.x, vx: 0 }; }
  swingFrom(w.lamp, WARDEN.LAMP_CHAIN + WARDEN.LAMP_T, P.lampFist, w.prevL, dt, 1.1);
  if (!w.flailOut) swingFrom(w.flail, WARDEN.FLAIL_LEN, P.flailFist, w.prevF, dt, 1.3);
  else { w.prevF.x = P.flailFist.x; w.prevF.vx = 0; }
  if (w.takeIn != null){ w.takeIn -= dt; if (w.takeIn <= 0){ lockedIn(); return; } }
  w.shutter = w.state === 'open' ? Math.min(1, w.shutter + dt * 5) : Math.max(0, w.shutter - dt * 6);
  if (w.state === 'enter'){
    w.y += (w.targetY - w.y) * Math.min(1, dt * 1.8);
    if (Math.abs(w.y - w.targetY) < 2){ w.state = 'arrive'; w.st = 0; }
    return;
  }
  if (w.state === 'arrive'){
    // the fire lights in his helm's slit; then he speaks — his line, in his
    // voice — or, if it cannot be heard, he roars
    w.eyes = Math.min(1, w.st / 0.4);
    if (!w.lit && w.st > 0.12){ w.lit = true; w.flare = 1; sfx.wardenEyes(); }
    if (!w.roared && w.st > 0.45){
      w.roared = true; G.shake = 0.8; w.lamp.om += 3;
      w.said = AUDIO.isMuted() ? 0 : AUDIO.narrator.warden('warden');
      if (!w.said) sfx.roar();
      addText(w.x, w.y + 150, SPOKEN.warden.text.toUpperCase(), COLORS.ember, Math.max(1.6, w.said || 0), 9);
    }
    if (w.said && w.st < 0.45 + w.said) w.flare = Math.max(w.flare, 0.8);   // his eyes burn as he speaks
    if (w.st > Math.max(1.8, 0.45 + (w.said || 0) + 0.4)){
      if (G.ammo + G.bolts.length === 0) w.takeIn = 0.8;   // he can see you have nothing
      wardenAttack(w);
    }
    return;
  }
  w.eyes = 1;
  if (w.state === 'open'){
    if (w.st > 1.9 - 0.3 * w.hits) wardenAttack(w);
    return;
  }
  var speed = Math.pow(1.2, w.hits), st = w.st * speed;
  if (w.attack === 'flail'){
    if (!w.thrown){ w.thrown = 1; w.flare = 0.7; spawnFlail(w, speed); }
    if (!w.flailOut && st > 0.5) wardenOpen(w);
  } else if (w.attack === 'beam'){
    var bm = w.beam, L = P.lantern;
    if (!bm){ bm = w.beam = { state: 'aim', t: 0, x: p.x }; sfx.aim(); }
    bm.t += dt * speed;
    if (bm.state === 'aim'){
      bm.x += (p.x - bm.x) * Math.min(1, dt * 9);         // tracks, then freezes at lock
      if (bm.t >= 0.9){ bm.state = 'lock'; bm.t = 0; sfx.lock(); }
    } else if (bm.state === 'lock'){
      if (bm.t >= 0.22){ bm.state = 'fire'; bm.t = 0; sfx.lanternBeam(); G.shake = Math.max(G.shake, 0.4); }
    } else if (bm.state === 'fire'){
      if (beamTouches(w, p.x, p.y, 8)) hurt('burn', p.x, p.y - 20);
      if (Math.random() < 0.8) addPart({ x: bm.x + rnd(-14, 14), y: FLOOR - 3, vx: rnd(-140, 140), vy: rnd(-240, -80), life: rnd(0.3, 0.6), t: 0, c: Math.random() < 0.5 ? '#fff0c0' : '#ffc860', r: rnd(1, 2.2), g: 520 });
      if (bm.t >= 0.6) bm.state = 'done';
    }
    if (bm.state === 'done' && st > 2.2) wardenOpen(w);
  } else {
    // he sends his knights at the heart: the spearmen in a rank, or the crossbows;
    // and more march in, for next time
    if (!w.summoned){
      w.summoned = true; w.knightsN++; w.flare = 0.7;
      var kind = w.knightsN % 2 ? 'spear' : 'xbow';
      knightAttack(kind, kind === 'spear' ? 3 : 2);
      if (knightsOf('spear') < 3) knightEnter('spear');
      if (knightsOf('xbow') < KNIGHT.WARDEN_XBOWS) knightEnter('xbow');
    }
    if (st > 2.4 && !knightsBusy()) wardenOpen(w);
  }
}
// when he dies his armour comes apart: the helm and pauldrons (and the flail,
// if he holds it) fall into the crust
function updateWreck(w, t, dt){
  if (t >= 0.55 && !w.broken){
    w.broken = true;
    var P = wardenPose(w);
    w.wreck.push({ kind: 'helm', x: P.x, y: P.y - 62, vx: rnd(-40, 40), vy: -170, rot: 0, spin: rnd(-2.5, 2.5), a: 1 });
    w.wreck.push({ kind: 'pauldron', s: -1, x: P.x - 72, y: P.y - 24, vx: -90, vy: -90, rot: 0, spin: -1.6, a: 1 });
    w.wreck.push({ kind: 'pauldron', s: 1, x: P.x + 72, y: P.y - 24, vx: 90, vy: -90, rot: 0, spin: 1.6, a: 1 });
    if (!w.flailOut){ var F = P.flailFist; w.wreck.push({ kind: 'ball', x: F.x + Math.sin(w.flail.th) * w.flail.len, y: F.y + 12 + Math.cos(w.flail.th) * w.flail.len, vx: 0, vy: 0, rot: 0, spin: 0, a: 1 }); }
    burst(P.x, P.y - 40, '#5b534e', 16, 220);
    sfx.clank(); G.shake = Math.max(G.shake, 0.6);
  }
  w.wreck.forEach(function(pc){
    if (!pc.landed){
      pc.vy += 900 * dt; pc.x += pc.vx * dt; pc.y += pc.vy * dt; pc.rot += pc.spin * dt;
      if (pc.y > FLOOR - 12){ pc.landed = true; pc.y = FLOOR - 12; burst(pc.x, FLOOR - 4, '#ffb060', 12, 200); sfx.ballClang(pc.x); }
    } else { pc.y += 14 * dt; pc.a = Math.max(0, pc.a - dt * 0.7); }
  });
}
// the lantern's beam: from the lantern's foot straight to the locked point on
// the floor, narrow where it leaves the lantern and wide where it strikes
var BEAM = { W0: 5, W1: 20 };
function beamLine(w){
  var P = wardenPose(w), L = P.lantern;
  return { x0: L.x + Math.sin(P.rot) * WARDEN.LAMP_T, y0: L.y + Math.cos(P.rot) * WARDEN.LAMP_T, x1: w.beam.x, y1: FLOOR };
}
function beamTouches(w, x, y, r){
  var B = beamLine(w), dx = B.x1 - B.x0, dy = B.y1 - B.y0, ll = dx * dx + dy * dy || 1;
  var u = clamp(((x - B.x0) * dx + (y - B.y0) * dy) / ll, 0, 1), cx = B.x0 + dx * u, cy = B.y0 + dy * u;
  return Math.hypot(x - cx, y - cy) < lerp(BEAM.W0, BEAM.W1, u) + r;
}
// is this point on his armour? (bolts go through his cloak)
function wardenArmour(w, x, y){
  var P = wardenPose(w), dx = x - P.x, dy = y - P.y, ax = Math.abs(dx);
  if (ax < 27 && dy > -104 && dy < -22) return true;                 // the helm
  if (ax > 18 && ax < 124 && dy > -72 && dy < 22) return true;       // the pauldrons
  if (ax < 58 && dy > -28 && dy < 96) return true;                   // the breastplate
  if (ax < 46 && dy > 92 && dy < 116) return true;                   // the faulds
  var arms = wardenArms(P);
  for (var i = 0; i < arms.length; i++){
    var A = arms[i];
    if (distToSeg(x, y, A.S.x, A.S.y, A.E.x, A.E.y) < 11 || distToSeg(x, y, A.E.x, A.E.y, A.F.x, A.F.y) < 10 || Math.hypot(x - A.F.x, y - A.F.y) < 12) return true;
  }
  return false;
}
// a bolt reaching him: the lantern if it is open, iron if it is not
function wardenBolt(b){
  var w = G.warden;
  if (!w || w.dying || (w.state !== 'open' && w.state !== 'attack')) return false;
  var L = wardenLantern(w);
  if (Math.abs(b.x - L.x) < WARDEN.LAMP_W && Math.abs(b.y - L.y) < WARDEN.LAMP_T + 4){
    if (w.state === 'open' && w.shutter > 0.6) lanternHit(w);
    else boltWasted(b, 'NOT YET');
    return true;
  }
  if (wardenArmour(w, b.x, b.y)){ boltWasted(b, 'WASTED'); return true; }
  return false;
}
function lanternHit(w){
  w.hits++; w.kick = 1; G.shake = 1.3; G.white = 0.5; w.flare = 1;
  w.lamp.om += (Math.random() < 0.5 ? -1 : 1) * 5;          // it swings from the blow
  var L = wardenLantern(w);
  burst(L.x, L.y, COLORS.sulfur, 10, 240);
  burst(L.x, L.y, col('grace', 0.9), 12, 300);
  sfx.lanternHit();
  if (w.hits >= 2){ wardenDies(); return; }
  sfx.roar();
  addText(w.x, w.y + 130, 'THEY ARE MINE', COLORS.sulfur, 1.4, 8);
  wardenAttack(w);
  checkAmmo();
}
// ----- the release: the lantern breaks, every cage bursts, the light takes them all
var RELEASE = { cages: 1.3, dead: 2.0, crack: 2.6, beam: [2.8, 3.5], heal: [3.5, 5.0], rise: [4.8, 7.2], end: 7.8 };
function wardenDies(){
  var w = G.warden, L = wardenLantern(w);
  runOver('freed');
  w.dying = true; w.dieT = 0;
  beginEnding('released', RELEASE.end);
  G.white = 1; G.shake = 1.6;
  music.stop();
  sfx.lanternShatter(); sfx.roar();
  burnOutHazards();
  knightsStand(true);                       // with their master gone, his knights burn away
  G.shades.forEach(function(s){ s.state = 'fade'; s.t = 0; });
  G.freed = { hand: { x: G.player.x, y: G.player.y, close: 0 }, grabbed: false, char: 0, released: true, heal: 0 };
  for (var i = 0; i < 26; i++)
    addPart({ x: L.x, y: L.y, vx: rnd(-260, 260), vy: rnd(-260, 120), life: rnd(0.6, 1.4), t: 0, c: Math.random() < 0.5 ? col('grace', 0.9) : '#9fb8c8', r: rnd(1, 2.6), g: 420 });
}
function updateReleased(dt){
  var t = G.ending.t, w = G.warden, F = G.freed;
  if (w) updateWreck(w, t, dt);
  updateKnights(dt, false);
  if (w && !w.dead){
    w.dieT = t;
    if (Math.random() < 0.5)
      addPart({ x: w.x + rnd(-110, 110), y: w.y + rnd(-20, 160), vx: rnd(-20, 20), vy: rnd(-90, -40), life: rnd(0.6, 1.2), t: 0, c: Math.random() < 0.5 ? '#ffb060' : '#5b534e', r: rnd(1, 2.4), g: -20, turb: 40 });
    if (t >= RELEASE.dead){ w.dead = true; burst(w.x, w.y + 60, '#5b534e', 24, 240, 200); sfx.collapse(); }
  }
  // every cage bursts: the souls come down out of the dark to the heart
  if (t >= RELEASE.cages && !F.called){
    F.called = true;
    var n = G.pool + G.cages.filter(function(c){ return c.soul; }).length;
    G.pool = 0; G.cages.forEach(function(c){ c.soul = false; });
    for (var i = 0; i < n; i++) G.comers.push({ x: rnd(40, LW - 40), y: -20 - i * 22, t: 0, seed: Math.random() });
    if (n) sfx.cagesBurst();
  }
  updateCages(dt);
  updateCarried(dt);
  updateShades(dt);
  heavenAscent(t, RELEASE, dt);
}
// ----- out of bolts with the lantern whole: he locks the heart in with them
function lockedIn(){
  runOver('stolen');
  beginEnding('caged', 5.0);
  G.cagedEnd = { y: -60, slam: false };
  music.stop(1.2);
  burnOutHazards();
  G.shades.forEach(function(s){ s.state = 'fade'; s.t = 0; });
}
function updateCaged(dt){
  var t = G.ending.t, c = G.cagedEnd, p = G.player, h = G.heart;
  c.y = lerp(-60, p.y, smooth(t / 1.2));
  if (t >= 1.2 && !c.slam){ c.slam = true; AUDIO.muffle(true); sfx.cageSlam(); G.shake = 0.9; }
  h.override = t < 3.6 ? lerp(70, 38, t / 3.6) : 0;
  if (t >= 3.6) G.heartSilent = true;
  if (t >= 4.2) G.black = 1;
  updateCages(dt); updateCarried(dt); updateShades(dt); updateKnights(dt, false);
}

// ---------- level 2: drawing ----------
// the dungeon over the pit: a portcullis across the back wall and chains hanging still
var dungeonLayer = makeLayer();
function renderDungeon(){
  var R = seeded(2222), i;
  ctx.lineCap = 'round';
  for (i = 0; i < 9; i++){
    var bx = 24 + i * 46, bot = FLOOR - 80 - (i % 3) * 14;
    ctx.strokeStyle = 'rgba(6,3,3,.85)'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(bx, 50); ctx.lineTo(bx, bot); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,90,20,.12)'; ctx.lineWidth = 1;          // the glow from below catches one edge
    ctx.beginPath(); ctx.moveTo(bx + 2.5, 330); ctx.lineTo(bx + 2.5, bot); ctx.stroke();
  }
  // the iron girder under the roof that his chains hang from
  var gy = CHAIN.ROOF - 9, gg = ctx.createLinearGradient(0, gy, 0, gy + 9);
  gg.addColorStop(0, '#2a2224'); gg.addColorStop(0.5, '#171113'); gg.addColorStop(1, '#0c0809');
  ctx.fillStyle = gg; ctx.fillRect(0, gy, LW, 9);
  ctx.strokeStyle = 'rgba(255,100,40,.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, gy + 9); ctx.lineTo(LW, gy + 9); ctx.stroke();
  ctx.fillStyle = 'rgba(170,150,140,.35)';
  for (i = 8; i < LW; i += 22){ ctx.beginPath(); ctx.arc(i, gy + 4.5, 1.2, 0, 6.2832); ctx.fill(); }
  ctx.strokeStyle = 'rgba(6,3,3,.85)'; ctx.lineWidth = 4;
  [120, 300].forEach(function(y){ ctx.beginPath(); ctx.moveTo(12, y); ctx.quadraticCurveTo(LW / 2, y + 6, LW - 12, y); ctx.stroke(); });
  for (i = 0; i < 6; i++){
    var cx = 30 + R() * (LW - 60), len = 50 + R() * 130;
    for (var d = 0; d < len; d += 8){
      ctx.strokeStyle = 'rgba(40,30,30,.8)'; ctx.lineWidth = 1.6;
      ctx.beginPath();
      if ((d / 8) % 2) ctx.ellipse(cx, d + 4, 1.4, 4, 0, 0, 6.2832);
      else ctx.ellipse(cx, d + 4, 3.2, 4.2, 0, 0, 6.2832);
      ctx.stroke();
    }
  }
}
// the light the souls go up into: top centre, as wide as its reach
function drawShaft(){
  if (G.shaft <= 0.01) return;
  var reach = ceilingY() + STOLEN.SHAFT_REACH, w = STOLEN.SHAFT_W;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.5 * G.shaft;
  ctx.drawImage(beamSprite(), LW/2 - w * 0.95, 0, w * 1.9, reach + 70);
  ctx.globalAlpha = G.shaft;
  drawGlow(LW/2, reach, 40, RGB.grace, 0.35 + 0.15 * Math.sin(G.t * 2), w * 1.5, 56);
  ctx.restore();
  // where it takes them: marked while you carry any
  if (G.carried.length && G.mode === 'play'){
    ctx.save();
    ctx.strokeStyle = col('grace', 0.35 + 0.25 * Math.sin(G.t * 5));
    ctx.lineWidth = 1; ctx.setLineDash([3, 6]);
    ctx.beginPath(); ctx.moveTo(LW/2 - w/2, reach); ctx.lineTo(LW/2 + w/2, reach); ctx.stroke();
    ctx.restore();
  }
}
// a cage: a domed iron birdcage on its chain, the soul dim inside, the lock's progress as a ring
function drawCage(c){
  var sh = c.shake ? Math.sin(G.t * 55) * 2.2 * c.shake : 0, x = c.x + sh, y = c.y;
  ctx.save();
  ctx.strokeStyle = 'rgba(80,66,62,.9)'; ctx.lineWidth = 1.6;
  for (var d = 4; d < y - 26; d += 8){
    ctx.beginPath();
    if ((d / 8 | 0) % 2) ctx.ellipse(c.x + sh * d / y, d, 1.2, 3.6, 0, 0, 6.2832);
    else ctx.ellipse(c.x + sh * d / y, d, 2.8, 3.8, 0, 0, 6.2832);
    ctx.stroke();
  }
  if (c.soul) drawGem(x, y + 3, 6, { alpha: 0.55 + 0.2 * Math.sin(G.t * 3 + c.sway), pulse: 0.2, dmg: 1 });
  ctx.lineWidth = 1.8; ctx.lineCap = 'round';
  for (var k = -2; k <= 2; k++){
    if (c.broken && (k === 0 || k === 1)) continue;          // smashed: two bars gone, the rest bent out
    var bx = x + k * 7.5, bend = c.broken ? k * 6 : 0;
    ctx.strokeStyle = 'rgba(96,82,78,.95)';
    ctx.beginPath(); ctx.moveTo(bx + bend * 0.5, y + 17); ctx.quadraticCurveTo(bx + k * 1.5 + bend, y - 10, x + k * 2, y - 22); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,120,50,.28)'; ctx.lineWidth = 0.8;              // warm from the lava below
    ctx.beginPath(); ctx.moveTo(bx + 0.8, y + 17); ctx.lineTo(bx + 0.8, y + 4); ctx.stroke();
    ctx.lineWidth = 1.8;
  }
  ctx.strokeStyle = 'rgba(110,94,88,1)'; ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.ellipse(x, y + 17, 17, 4, 0, 0, 6.2832); ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y - 25, 3, 0, 6.2832); ctx.stroke();
  if (c.lock > 0){
    ctx.strokeStyle = col('heart', 0.85); ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(x, y, 26, -Math.PI / 2, -Math.PI / 2 + c.lock * 6.2832); ctx.stroke();
  }
  ctx.restore();
}
// the souls: those carried, those going up, those coming down at the end, and the shades after them
function drawSouls(){
  var p = G.player;
  if (G.carried.length){
    ctx.save();
    ctx.strokeStyle = col('heart', 0.22); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(p.x, p.y);
    G.carried.forEach(function(s){ ctx.lineTo(s.x, s.y); });
    ctx.stroke();
    ctx.restore();
  }
  G.carried.forEach(function(s, i){ drawGem(s.x, s.y, 5.4, { alpha: 0.95, pulse: G.heart.pulse * 0.7, breath: 0.8 + 0.2 * Math.sin(s.t * 2 + i) }); });
  G.comers.forEach(function(s){ drawGem(s.x, s.y, 5.4, { alpha: 0.9, pulse: 0.5 }); });
  G.strays.forEach(function(s){
    var left = STRAY.LIFE - s.t, a = left < 1.6 ? 0.35 + 0.55 * Math.abs(Math.sin(s.t * (8 + 10 * (1.6 - left)))) : 0.9;   // it gutters as it goes
    drawGem(s.x, s.y, 5.4, { alpha: a, pulse: 0.6, breath: 0.8 + 0.2 * Math.sin(s.t * 3) });
  });
  G.rising.forEach(function(r){
    if (r.dark){
      ctx.save(); ctx.globalAlpha = Math.max(0, 1 - r.t * 1.2);
      ctx.fillStyle = 'rgba(40,8,12,.9)'; heartPath(r.x, r.y, 5.4); ctx.fill();
      ctx.strokeStyle = col('ember', 0.6); ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
    } else drawGem(r.x, r.y, 5.4 * (1 + r.t * 0.3), { alpha: Math.max(0, 1 - r.t * 0.6), pulse: 1, light: 1.3 });
  });
  G.shades.forEach(drawShade);
}
// a shade: black smoke with a cold pale rim, so it reads against the rock, and two faint eyes
function drawShade(sh){
  var k = sh.state === 'gather' ? sh.t / 0.8 : (sh.state === 'fade' ? 1 - sh.t / 0.5 : 1);
  var r = 13 + 3 * Math.sin(G.t * 5 + sh.seed * 9), x = sh.x, y = sh.y;
  ctx.save();
  ctx.globalAlpha = clamp(k, 0, 1);
  drawGlow(x, y, 32, [150, 185, 205], 0.35, r * 4, r * 4);
  var g = ctx.createRadialGradient(x, y, 1, x, y, r * 1.8);
  g.addColorStop(0, 'rgba(0,0,0,.95)'); g.addColorStop(0.55, 'rgba(10,4,10,.7)'); g.addColorStop(1, 'rgba(10,4,10,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 1.8, 0, 6.2832); ctx.fill();
  ctx.lineCap = 'round';
  for (var i = 0; i < 3; i++){
    var a = G.t * 2.2 + i * 2.1 + sh.seed * 5;
    ctx.strokeStyle = 'rgba(16,6,14,.75)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(a) * r * 1.6, y + Math.sin(a) * r, x + Math.cos(a + 0.8) * r * 2.4, y + Math.sin(a + 0.8) * r * 1.8);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(205,225,235,.85)';
  ctx.beginPath(); ctx.ellipse(x - 4, y - 2, 1.8, 1.1, 0, 0, 6.2832); ctx.ellipse(x + 4, y - 2, 1.8, 1.1, 0, 0, 6.2832); ctx.fill();
  ctx.restore();
}
// links along a curve
function chainAlong(pts, link){
  link = link || 8;
  for (var i = 0; i < pts.length - 1; i++){
    var a = pts[i], b = pts[i + 1], dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1, ang = Math.atan2(dy, dx);
    for (var d = 0; d < L; d += link){
      var x = a.x + dx / L * d, y = a.y + dy / L * d, n = Math.round((i * 1000 + d) / link);
      ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
      if (n % 2){ ctx.fillStyle = '#2c2422'; ctx.fillRect(-link * 0.6, -1.3, link * 1.2, 2.6); }
      else { ctx.strokeStyle = '#6e605a'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.ellipse(0, 0, link * 0.62, link * 0.36, 0, 0, 6.2832); ctx.stroke(); }
      ctx.restore();
    }
  }
}
// ---- chains: links, the ball, the pulley and the clamp ----
// Links along a polyline, alternating face-on rings and edge-on bars through
// them: dark iron with a cold light down each link, the lava's warmth
// catching their lower edges.
function chainLinks(pts, size){
  size = size || 1;
  var pitch = 6.2 * size, face = [], edge = [], acc = 0, n = 0, i, k;
  for (i = 0; i < pts.length - 1; i++){
    var a = pts[i], b = pts[i + 1], dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy);
    if (L < 1e-3) continue;
    var ang = Math.atan2(dy, dx), d = acc;
    for (; d < L; d += pitch) (n++ % 2 ? edge : face).push(a.x + dx * d / L, a.y + dy * d / L, ang);
    acc = d - L;
  }
  ctx.save();
  ctx.lineCap = 'round';
  var rx = 4.6 * size, ry = 2.8 * size, hl = 4.8 * size;
  ctx.beginPath();
  for (k = 0; k < face.length; k += 3){
    ctx.moveTo(face[k] + Math.cos(face[k + 2]) * rx, face[k + 1] + Math.sin(face[k + 2]) * rx);
    ctx.ellipse(face[k], face[k + 1], rx, ry, face[k + 2], 0, 6.2832);
  }
  ctx.strokeStyle = '#120d0c'; ctx.lineWidth = 2.6 * size; ctx.stroke();
  ctx.strokeStyle = '#6a5c56'; ctx.lineWidth = 1.0 * size; ctx.stroke();
  ctx.beginPath();
  for (k = 0; k < edge.length; k += 3){
    var c = Math.cos(edge[k + 2]) * hl, s = Math.sin(edge[k + 2]) * hl;
    ctx.moveTo(edge[k] - c, edge[k + 1] - s); ctx.lineTo(edge[k] + c, edge[k + 1] + s);
  }
  ctx.strokeStyle = '#120d0c'; ctx.lineWidth = 3.4 * size; ctx.stroke();
  ctx.strokeStyle = '#4e423d'; ctx.lineWidth = 1.3 * size; ctx.stroke();
  ctx.translate(0, 1.1 * size);
  ctx.strokeStyle = 'rgba(255,120,50,.3)'; ctx.lineWidth = 0.8 * size; ctx.stroke();
  ctx.restore();
}
// a spiked iron ball, turning as it swings, lit orange from below
function drawSpikeBall(x, y, r, rot){
  var k, sp = r * 0.62;
  ctx.save();
  ctx.beginPath();
  for (k = 0; k < 8; k++){
    var a = rot + k * Math.PI / 4, c = Math.cos(a), s = Math.sin(a);
    ctx.moveTo(x + Math.cos(a - 0.32) * r * 0.86, y + Math.sin(a - 0.32) * r * 0.86);
    ctx.lineTo(x + c * (r + sp), y + s * (r + sp));
    ctx.lineTo(x + Math.cos(a + 0.32) * r * 0.86, y + Math.sin(a + 0.32) * r * 0.86);
    ctx.closePath();
  }
  ctx.fillStyle = '#1a1312'; ctx.fill();
  ctx.strokeStyle = 'rgba(160,140,130,.45)'; ctx.lineWidth = 0.7; ctx.stroke();
  var g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.05);
  g.addColorStop(0, '#776a64'); g.addColorStop(0.35, '#3b312f'); g.addColorStop(1, '#0e0a09');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.34, rot, 0, 6.2832); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,120,50,.6)'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.arc(x, y, r - 0.7, 0.4, Math.PI - 0.4); ctx.stroke();
  ctx.restore();
}
function drawPulley(x, y, wheel){
  var top = CHAIN.ROOF - 2;
  ctx.fillStyle = '#161111'; ctx.fillRect(x - 8, top, 16, y - top);
  ctx.strokeStyle = 'rgba(255,110,40,.25)'; ctx.lineWidth = 1; ctx.strokeRect(x - 8, top, 16, y - top);
  ctx.beginPath(); ctx.arc(x, y, 6.5, 0, 6.2832); ctx.fillStyle = '#2a2220'; ctx.fill();
  ctx.strokeStyle = '#6a5c56'; ctx.lineWidth = 1.4; ctx.stroke();
  ctx.beginPath();
  for (var k = 0; k < 3; k++){ var a = wheel + k * 2.094; ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * 5.5, y + Math.sin(a) * 5.5); }
  ctx.strokeStyle = '#4a3e3a'; ctx.lineWidth = 1.2; ctx.stroke();
}
// the clamp under the girder that holds the ball, and opens to let it fall
function drawClamp(x, y, r, open){
  var top = CHAIN.ROOF - 2, dy = y - top;
  ctx.save(); ctx.lineCap = 'round';
  [-1, 1].forEach(function(s){
    ctx.save(); ctx.translate(x + s * 4, top); ctx.rotate(-s * open * 0.9);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(s * (r + 7), dy + 1, s * r * 0.35, dy + r + 5);
    ctx.strokeStyle = '#120d0c'; ctx.lineWidth = 4; ctx.stroke();
    ctx.strokeStyle = '#5c4e48'; ctx.lineWidth = 1.3; ctx.stroke();
    ctx.restore();
  });
  ctx.fillStyle = '#161111'; ctx.fillRect(x - 9, top, 18, 5);
  ctx.restore();
}
// the chain on fire: the iron glowing along its length, flames licking up
// off the links (more toward the ball)
function chainFire(pts, heat, seed){
  if (heat <= 0.02 || !pts || pts.length < 2) return;
  var i;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  for (i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.strokeStyle = 'rgba(255,90,20,' + (0.3 * heat) + ')'; ctx.lineWidth = 9; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,170,60,' + (0.35 * heat) + ')'; ctx.lineWidth = 3.5; ctx.stroke();
  for (i = 2; i < pts.length; i += 2){
    var u = i / (pts.length - 1), q = pts[i], nz = FIRE.at(i * 37 + seed * 100, G.t * 60), r = (2.2 + 3.2 * u) * (0.6 + 0.6 * nz) * heat;
    if (r < 0.6) continue;
    drawLick(q.x, q.y + r * 0.4, r, 0.75, 'rgba(255,120,30,1)');
    drawLick(q.x, q.y + r * 0.3, r * 0.55, 0.85, 'rgba(255,225,140,1)');
  }
  ctx.restore();
}
// the ball on fire: a glow round it, flames streaming back from its motion
// (and up, when it is slow), and its iron red-hot
function ballFire(x, y, r, V, heat, seed){
  if (heat <= 0.02) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  drawGlow(x, y, 32, [255, 110, 30], 0.9 * heat, r * 6, r * 6);
  var sp = Math.hypot(V.x, V.y), k = Math.min(1, sp / 500);
  var dx = sp > 1 ? -V.x / sp * k : 0, dy = (sp > 1 ? -V.y / sp * k : 0) - (1 - k), dl = Math.hypot(dx, dy) || 1;
  var ang = Math.atan2(dx / dl, -dy / dl);
  for (var i = 0; i < 6; i++){
    var a = ang + (i - 2.5) * 0.35, nz = FIRE.at(i * 53 + seed * 80, G.t * 70), len = r * (0.8 + 0.9 * nz) * (1 + k * 0.9) * heat;
    ctx.save(); ctx.translate(x + Math.sin(a) * r * 0.6, y - Math.cos(a) * r * 0.6); ctx.rotate(a);
    drawLick(0, 0, len * 0.45, 0.8, 'rgba(255,110,25,1)');
    drawLick(0, 0, len * 0.25, 0.9, 'rgba(255,220,130,1)');
    ctx.restore();
  }
  ctx.restore();
}
function ballHot(x, y, r, heat){
  if (heat <= 0.02) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  var g = ctx.createRadialGradient(x, y + r * 0.2, 1, x, y, r * 1.1);
  g.addColorStop(0, 'rgba(255,170,70,' + (0.6 * heat) + ')'); g.addColorStop(0.7, 'rgba(255,80,20,' + (0.35 * heat) + ')'); g.addColorStop(1, 'rgba(255,60,10,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 1.1, 0, 6.2832); ctx.fill();
  ctx.restore();
}
// the chain: its telegraph (the drop and the arc it will swing), the pulley,
// the links, and the ball, smeared along its arc when it is fast — all of it
// on fire once it is let go
function drawChain(fl){
  ctx.save();
  if (fl.state === 'aim' || fl.state === 'lock'){
    var locked = fl.state === 'lock', flick = locked && Math.floor(fl.t * 30) % 2 === 0, ext = chainArc(fl);
    ctx.globalAlpha = locked ? (flick ? 0.95 : 0.6) : 0.25 + 0.4 * (fl.t / fl.aimT);
    ctx.strokeStyle = locked ? COLORS.sulfur : COLORS.bone; ctx.lineWidth = locked ? 1.5 : 1;
    if (!locked) ctx.setLineDash([3, 9]);
    ctx.beginPath();
    if (fl.from === 'roof'){ ctx.moveTo(fl.hx, fl.by + 18); ctx.lineTo(fl.hx, fl.ay + Math.cos(fl.th0) * fl.L); }
    var a0 = Math.PI / 2 - ext[1], a1 = Math.PI / 2 - ext[0];
    ctx.moveTo(fl.ax + Math.cos(a0) * fl.L, fl.ay + Math.sin(a0) * fl.L);
    ctx.arc(fl.ax, fl.ay, fl.L, a0, a1);
    ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
  }
  if (fl.from === 'roof'){
    drawPulley(fl.ax, fl.ay, fl.wheel);
    if (fl.state === 'aim' || fl.state === 'lock'){
      chainLinks([{ x: fl.ax, y: fl.ay }, { x: (fl.ax + fl.hx) / 2, y: fl.ay + 6 }, { x: fl.bx, y: fl.by }], 0.9);
      var h0 = chainHeat(fl);
      ballFire(fl.bx, fl.by, fl.r, { x: 0, y: 0 }, h0 * 0.8, fl.seed);
      drawSpikeBall(fl.bx, fl.by, fl.r, fl.spin);
      ballHot(fl.bx, fl.by, fl.r, h0);
      drawClamp(fl.hx, fl.by, fl.r, 0);
      ctx.restore();
      return;
    }
    var ca = fl.state === 'drop' ? 1 : (fl.state === 'swing' ? Math.max(0, 1 - fl.t / 0.6) : 0);
    if (ca > 0){ ctx.globalAlpha = ca; drawClamp(fl.hx, fl.ay + 6, fl.r, 1); ctx.globalAlpha = 1; }
  }
  var heat = chainHeat(fl);
  if (fl.nodes && fl.state !== 'aim' && fl.state !== 'lock') chainFire(fl.nodes, heat, fl.seed);
  if (fl.nodes) chainLinks(fl.nodes, fl.from === 'fist' ? 1.1 : 1);
  if (fl.state === 'swing' && Math.abs(fl.om * fl.len) > 280){
    ctx.fillStyle = '#3a2e2b';
    for (var k = 3; k >= 1; k--){
      var th = fl.th - fl.om * 0.014 * k * fl.ts;
      ctx.globalAlpha = 0.18 / k;
      ctx.beginPath(); ctx.arc(fl.ax + Math.sin(th) * fl.len, fl.ay + Math.cos(th) * fl.len, fl.r + 3, 0, 6.2832); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  ballFire(fl.bx, fl.by, fl.r, ballVelocity(fl), heat, fl.seed);
  drawSpikeBall(fl.bx, fl.by, fl.r, fl.spin);
  ballHot(fl.bx, fl.by, fl.r, heat);
  ctx.restore();
}

// ---- the knights ----
function drawKnights(){
  G.knights.forEach(function(k){
    if (k.kind === 'spear') drawSpearTelegraph(k); else drawXbowTelegraph(k);
    drawKnight(k);
  });
  G.quarrels.forEach(drawQuarrel);
}
function telegraphStyle(locked, t, aimT){
  var flick = locked && Math.floor(t * 30) % 2 === 0;
  ctx.globalAlpha = locked ? (flick ? 0.95 : 0.6) : 0.2 + 0.4 * Math.min(1, t / aimT);
  ctx.strokeStyle = locked ? COLORS.sulfur : COLORS.bone; ctx.lineWidth = locked ? 1.5 : 1;
  if (!locked) ctx.setLineDash([3, 9]);
}
// a pale line over the pike, as high as it will reach
function drawSpearTelegraph(k){
  if (k.st !== 'aim' && k.st !== 'lock') return;
  var x = spearX(k), top = FLOOR - k.reach;
  ctx.save();
  telegraphStyle(k.st === 'lock', k.t, KNIGHT.AIM);
  ctx.beginPath(); ctx.moveTo(x, FLOOR - k.tip - 4); ctx.lineTo(x, top); ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(x - 7, top); ctx.lineTo(x + 7, top); ctx.stroke();
  ctx.restore();
}
// a pale line from the crossbow up through the heart
function drawXbowTelegraph(k){
  if ((k.st !== 'aim' && k.st !== 'lock') || k.t < 0 || k.raise < 0.6) return;
  var X = xbowAt(k), c = Math.cos(k.ang), s = Math.sin(k.ang), d = Math.hypot(k.tx - X.x, k.ty - X.y) + 70;
  ctx.save();
  telegraphStyle(k.st === 'lock', k.t, KNIGHT.XAIM);
  ctx.beginPath(); ctx.moveTo(X.x + c * 22, X.y + s * 22); ctx.lineTo(X.x + c * d, X.y + s * d); ctx.stroke();
  ctx.restore();
}
function drawTrident(x, y, glint){
  ctx.save();
  ctx.fillStyle = '#2c2320';
  ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 4.5, y + 7, x + 2, y + 15); ctx.lineTo(x - 2, y + 15); ctx.quadraticCurveTo(x - 4.5, y + 7, x, y); ctx.fill();
  ctx.strokeStyle = '#2c2320'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  [-1, 1].forEach(function(s){ ctx.beginPath(); ctx.moveTo(x, y + 16); ctx.quadraticCurveTo(x + s * 9, y + 15, x + s * 7.5, y + 4); ctx.stroke(); });
  ctx.fillStyle = '#1c1411'; ctx.fillRect(x - 2.6, y + 15, 5.2, 7);
  ctx.strokeStyle = 'rgba(210,195,185,.55)'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(x, y + 1); ctx.quadraticCurveTo(x + 3.4, y + 7, x + 1.6, y + 14); ctx.stroke();
  if (glint > 0){
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(x, y + 2, 12, [255, 220, 150], glint, 30, 30);
    ctx.strokeStyle = 'rgba(255,240,200,' + glint + ')'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x - 6, y + 2); ctx.lineTo(x + 6, y + 2); ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 8); ctx.stroke();
  }
  ctx.restore();
}
function drawKnightLeg(L, far){
  armPlate(L.hip, L.kn, 5.5, 4.6);
  armPlate(L.kn, L.ft, 4.6, 3.8);
  ctx.fillStyle = far ? '#1a1416' : '#2c2427';
  ctx.beginPath(); ctx.arc(L.kn.x, L.kn.y, 3.8, 0, 6.2832); ctx.fill();
  ctx.strokeStyle = 'rgba(255,120,50,.5)'; ctx.lineWidth = 0.8; ctx.stroke();
  ctx.fillStyle = '#161012';
  ctx.beginPath(); ctx.moveTo(L.ft.x - 4.5, L.ft.y - 4); ctx.quadraticCurveTo(L.ft.x + 4, L.ft.y - 3.5, L.ft.x + 9, L.ft.y + 0.5); ctx.lineTo(L.ft.x - 4.5, L.ft.y + 1.2); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(255,130,60,.7)'; ctx.lineWidth = 0.9; ctx.stroke();
}
// A dark knight of the patrol, on his feet on the crust: a horned helm with
// the fire in its slit, turned up to follow the heart; spiked shoulders;
// black plate lit orange from the magma he walks on. Drawn facing the way he
// walks (or the way he attacks), striding when he moves.
function drawKnight(k){
  var f = k.face, spear = k.kind === 'spear', legs = [], i;
  for (i = 0; i < 2; i++){
    var o = i ? Math.PI : 0, a = 0.42 * Math.sin(k.step + o), bend = Math.max(0, Math.sin(k.step + o + 1.3)) * 0.7;
    var hip = { x: i ? -4 : 4, y: 4 }, kn = { x: hip.x + Math.sin(a) * 17, y: hip.y + Math.cos(a) * 17 };
    legs.push({ hip: hip, kn: kn, ft: { x: kn.x + Math.sin(a - bend) * 17, y: kn.y + Math.cos(a - bend) * 17 } });
  }
  var wy = FLOOR - Math.max(legs[0].ft.y, legs[1].ft.y);          // his waist: the lower foot stands on the crust
  ctx.save();
  ctx.globalAlpha = k.fade;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // the magma's light where he walks
  drawGlow(k.x, FLOOR, 24, [255, 110, 30], 0.5, 64, 18);
  if (spear){
    var sx = spearX(k), ty = FLOOR - k.tip, live = k.st === 'thrust' || k.st === 'hold';
    ctx.strokeStyle = '#1c1411'; ctx.lineWidth = 3.8; ctx.beginPath(); ctx.moveTo(sx, ty + 14); ctx.lineTo(sx, Math.max(ty + 14, wy + 40)); ctx.stroke();
    ctx.strokeStyle = 'rgba(205,185,172,.5)'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(sx - 0.9 * f, ty + 16); ctx.lineTo(sx - 0.9 * f, Math.max(ty + 16, wy + 40)); ctx.stroke();
    if (live){
      var fk = k.st === 'thrust' ? 1 : Math.max(0, 1 - k.t / 0.25);
      if (fk > 0){ ctx.strokeStyle = 'rgba(255,235,200,' + (0.55 * fk) + ')'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(sx, ty + 20); ctx.lineTo(sx, ty + 20 + 90 * fk); ctx.stroke(); }
    }
    drawTrident(sx, ty, k.st === 'lock' ? 0.5 + 0.5 * Math.sin(k.t * 60) : (live ? 0.6 : 0));
  }
  ctx.translate(k.x, wy); ctx.scale(f, 1);
  drawKnightLeg(legs[1], true);
  // faulds over the hips
  ctx.fillStyle = '#1d1619'; ctx.beginPath(); ctx.moveTo(-12, 2); ctx.quadraticCurveTo(0, 5, 12, 2); ctx.lineTo(13, 10); ctx.quadraticCurveTo(0, 14, -13, 10); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(255,120,50,.55)'; ctx.lineWidth = 0.8; ctx.stroke();
  drawKnightLeg(legs[0], false);
  // the body
  ctx.beginPath(); ctx.moveTo(-14, -38); ctx.quadraticCurveTo(-17, -16, -12, 4); ctx.lineTo(12, 4); ctx.quadraticCurveTo(17, -16, 14, -38); ctx.quadraticCurveTo(0, -43, -14, -38); ctx.closePath();
  var g = ctx.createLinearGradient(0, -42, 0, 6);
  g.addColorStop(0, '#2c2427'); g.addColorStop(0.6, '#150f11'); g.addColorStop(1, '#2a0e06');
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = 'rgba(255,120,50,.65)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.strokeStyle = 'rgba(170,150,145,.3)'; ctx.beginPath(); ctx.moveTo(0, -38); ctx.lineTo(0, 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,72,20,.3)'; ctx.lineWidth = 0.9;
  for (i = 0; i < 3; i++){ ctx.beginPath(); ctx.moveTo(-10, -24 + i * 8); ctx.quadraticCurveTo(0, -20 + i * 8, 10, -24 + i * 8); ctx.stroke(); }
  // the arms: on the pike, or on the crossbow (low as he walks, at his shoulder to aim)
  var hands, xp = null;
  if (spear) hands = [{ x: KNIGHT.SPEAR_DX, y: -12 }, { x: KNIGHT.SPEAR_DX, y: -28 }];
  else {
    var la = f > 0 ? k.ang : Math.PI - k.ang, r = k.raise;
    xp = { x: 4, y: lerp(-16, -40, r), a: lerp(0.45, la, r) };
    var ca = Math.cos(xp.a), sa = Math.sin(xp.a);
    hands = [{ x: xp.x - 7 * ca + 3 * sa, y: xp.y - 7 * sa - 3 * ca }, { x: xp.x + 7 * ca, y: xp.y + 7 * sa }];
  }
  [-1, 1].forEach(function(s, i2){
    var h = hands[i2];
    ctx.strokeStyle = '#1b1416'; ctx.lineWidth = 5.5;
    ctx.beginPath(); ctx.moveTo(s * 12, -34); ctx.quadraticCurveTo(s * 15, -18, h.x, h.y); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,110,40,.35)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#231a1c'; ctx.beginPath(); ctx.arc(h.x, h.y, 3.4, 0, 6.2832); ctx.fill();
  });
  if (xp) drawCrossbow(xp, k.st === 'walk' || k.st === 'aim' || k.st === 'lock');
  // spiked shoulders
  [-1, 1].forEach(function(s){
    ctx.fillStyle = '#241c1f'; ctx.beginPath(); ctx.ellipse(s * 14, -37, 9.5, 6, s * 0.3, 0, 6.2832); ctx.fill();
    ctx.strokeStyle = 'rgba(255,120,50,.5)'; ctx.lineWidth = 0.9; ctx.stroke();
    ctx.fillStyle = '#161012'; ctx.beginPath(); ctx.moveTo(s * 15, -41); ctx.quadraticCurveTo(s * 21, -46, s * 26, -53); ctx.quadraticCurveTo(s * 20, -44, s * 21, -40); ctx.closePath(); ctx.fill();
  });
  // the helm, turned up to the heart, and its horns
  ctx.save();
  ctx.translate(0, -42); ctx.rotate(k.look * f); ctx.translate(0, 42);
  ctx.strokeStyle = '#1a1314';
  [-1, 1].forEach(function(s){
    ctx.lineWidth = 3.2; ctx.beginPath(); ctx.moveTo(s * 5, -57); ctx.quadraticCurveTo(s * 13, -57, s * 14, -64); ctx.stroke();
    ctx.lineWidth = 1.7; ctx.beginPath(); ctx.moveTo(s * 14, -64); ctx.quadraticCurveTo(s * 14.8, -69, s * 12, -73); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,120,50,.5)'; ctx.lineWidth = 0.7;
    ctx.beginPath(); ctx.moveTo(s * 6, -55.5); ctx.quadraticCurveTo(s * 14.5, -55.5, s * 15.4, -64); ctx.quadraticCurveTo(s * 16, -69, s * 13, -73.5); ctx.stroke();
    ctx.strokeStyle = '#1a1314';
  });
  ctx.beginPath(); ctx.moveTo(-8, -43); ctx.bezierCurveTo(-9, -54, -7, -62, 0, -64); ctx.bezierCurveTo(7, -62, 9, -54, 8, -43); ctx.quadraticCurveTo(0, -38.5, -8, -43); ctx.closePath();
  var hg = ctx.createLinearGradient(-9, 0, 9, 0);
  hg.addColorStop(0, '#0d090a'); hg.addColorStop(0.4, '#3d3437'); hg.addColorStop(1, '#0b0708');
  ctx.fillStyle = hg; ctx.fill();
  ctx.strokeStyle = 'rgba(255,120,50,.6)'; ctx.lineWidth = 0.9; ctx.stroke();
  ctx.strokeStyle = '#020001'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-6, -55.5); ctx.lineTo(0, -52.8); ctx.lineTo(6, -55.5); ctx.stroke();
  ctx.globalCompositeOperation = 'lighter';
  [-1, 1].forEach(function(s){
    drawGlow(s * 3.2, -54.2, 10, [255, 80, 20], 1, 22, 12);
    ctx.fillStyle = 'rgba(255,200,130,1)'; ctx.beginPath(); ctx.ellipse(s * 3.2, -54.2, 1.6, 1.1, 0, 0, 6.2832); ctx.fill();
  });
  ctx.restore();
  ctx.restore();
}
// his crossbow, in his own (facing) frame: p is its pivot and angle
function drawCrossbow(p, loaded){
  ctx.save();
  ctx.translate(p.x, p.y); ctx.rotate(p.a);
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#2a1d16'; ctx.lineWidth = 3.6; ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(14, 0); ctx.stroke();
  ctx.strokeStyle = '#140d0b'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(10, -12); ctx.quadraticCurveTo(18, 0, 10, 12); ctx.stroke();
  ctx.strokeStyle = 'rgba(230,215,200,.6)'; ctx.lineWidth = 0.7; ctx.beginPath();
  if (loaded){ ctx.moveTo(10, -12); ctx.lineTo(-2, 0); ctx.lineTo(10, 12); } else { ctx.moveTo(10, -12); ctx.lineTo(11, 12); }
  ctx.stroke();
  if (loaded){
    ctx.strokeStyle = '#3a2c22'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-2, 0); ctx.lineTo(18, 0); ctx.stroke();
    ctx.fillStyle = '#8a7c74'; ctx.beginPath(); ctx.moveTo(23, 0); ctx.lineTo(18, -2.4); ctx.lineTo(18, 2.4); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}
function drawQuarrel(q){
  var c = Math.cos(q.ang), s = Math.sin(q.ang), a = q.stuck ? Math.max(0, 1 - q.t / 1.2) : 1;
  ctx.save(); ctx.globalAlpha = a; ctx.lineCap = 'round';
  if (!q.stuck){ ctx.strokeStyle = 'rgba(255,220,180,.2)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(q.x - c * 40, q.y - s * 40); ctx.lineTo(q.x - c * 12, q.y - s * 12); ctx.stroke(); }
  ctx.strokeStyle = '#2a201b'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(q.x - c * 15, q.y - s * 15); ctx.lineTo(q.x, q.y); ctx.stroke();
  ctx.strokeStyle = 'rgba(170,150,140,.55)'; ctx.lineWidth = 0.8; ctx.stroke();
  ctx.fillStyle = '#9a8c84';
  ctx.beginPath(); ctx.moveTo(q.x + c * 6, q.y + s * 6); ctx.lineTo(q.x - s * 2.6, q.y + c * 2.6); ctx.lineTo(q.x + s * 2.6, q.y - c * 2.6); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#7a1e10';
  [-1, 1].forEach(function(v){ var bx = q.x - c * 15, by = q.y - s * 15; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + c * 5 - s * v * 3.2, by + s * 5 + c * v * 3.2); ctx.lineTo(bx + c * 6, by + s * 6); ctx.closePath(); ctx.fill(); });
  ctx.restore();
}

// ---- the Warden ----
// His body is drawn once into two sprites at the canvas's own resolution:
// what is behind his arms (cloak, breastplate, keys) and what is in front of
// them (horns, pauldrons, helm). His arms, fists, eyes, lantern and flail are
// drawn live over them. None of him is a straight-sided blob: plates, rims
// and spikes, dark iron with a cold light on it and the lava's glow under it.
var WS = { W: 300, H: 400, OX: 150, OY: 150 };
var wardenArt = { scale: 0, back: null, front: null };
function spriteOf(box, s, render){
  var c = document.createElement('canvas'); c.width = Math.ceil(box.W * s); c.height = Math.ceil(box.H * s);
  var cx = c.getContext('2d'); cx.setTransform(s, 0, 0, s, box.OX * s, box.OY * s);
  var saved = ctx; ctx = cx;
  try { render(); } finally { ctx = saved; }
  return c;
}
function wardenSprites(){
  var s = Math.max(1, cvs.width / LW);
  if (wardenArt.scale !== s){ wardenArt.scale = s; wardenArt.back = spriteOf(WS, s, wardenBack); wardenArt.front = spriteOf(WS, s, wardenFront); }
  return wardenArt;
}
function cubic(a, b, c, d, u){ var v = 1 - u; return v * v * v * a + 3 * v * v * u * b + 3 * v * u * u * c + u * u * u * d; }
function cubicD(a, b, c, d, u){ var v = 1 - u; return 3 * v * v * (b - a) + 6 * v * u * (c - b) + 3 * u * u * (d - c); }
function rrect(x, y, w, h, r){
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}
function wardenBack(){ wardenCloak(); wardenFaulds(); wardenTorso(); wardenBelt(); wardenGorget(); wardenChestChain(); }
function wardenFront(){ wardenHorn(-1); wardenHorn(1); wardenPauldron(-1); wardenPauldron(1); wardenHelm(); }
// a black cloak from his shoulders, its hem in tatters that fade into the dark
function wardenCloak(){
  var R = seeded(4077), hem = [], i, x;
  for (x = -130; x <= 130; x += 10) hem.push({ x: x + (R() - 0.5) * 4, y: 146 + (1 - Math.pow(Math.abs(x) / 130, 2)) * 64 + R() * 28, n: 18 + R() * 26 });
  function outline(){
    ctx.beginPath();
    ctx.moveTo(-62, -30);
    ctx.bezierCurveTo(-110, -26, -128, 40, -134, 146);
    hem.forEach(function(h){
      ctx.lineTo(h.x - 4, h.y - h.n);
      ctx.quadraticCurveTo(h.x - 1, h.y - 6, h.x + 1, h.y);
      ctx.quadraticCurveTo(h.x + 3, h.y - 8, h.x + 5, h.y - h.n + 2);
    });
    ctx.lineTo(134, 146);
    ctx.bezierCurveTo(128, 40, 110, -26, 62, -30);
    ctx.closePath();
  }
  outline();
  var g = ctx.createLinearGradient(0, -30, 0, 240);
  g.addColorStop(0, '#170c0e'); g.addColorStop(0.4, '#0f0708'); g.addColorStop(0.75, 'rgba(12,5,6,.8)'); g.addColorStop(1, 'rgba(12,5,6,0)');
  ctx.fillStyle = g; ctx.fill();
  var rim = ctx.createLinearGradient(0, -30, 0, 240);
  rim.addColorStop(0, 'rgba(255,90,30,0)'); rim.addColorStop(0.45, 'rgba(255,90,30,.3)'); rim.addColorStop(0.8, 'rgba(255,90,30,.16)'); rim.addColorStop(1, 'rgba(255,90,30,0)');
  ctx.strokeStyle = rim; ctx.lineWidth = 1.2;
  [-1, 1].forEach(function(s){ ctx.beginPath(); ctx.moveTo(s * 62, -30); ctx.bezierCurveTo(s * 110, -26, s * 128, 40, s * 134, 146); ctx.stroke(); });
  ctx.save(); outline(); ctx.clip();
  for (i = 0; i < 10; i++){
    var fx = -120 + i * 26 + (R() - 0.5) * 10;
    ctx.beginPath(); ctx.moveTo(fx * 0.45, -10); ctx.quadraticCurveTo(fx * 0.9, 90, fx * 1.02, 240);
    ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 7; ctx.stroke();
    ctx.strokeStyle = 'rgba(120,50,45,.1)'; ctx.lineWidth = 1.5; ctx.stroke();
  }
  ctx.restore();
}
function torsoPath(){
  ctx.beginPath();
  ctx.moveTo(-30, -26);
  ctx.bezierCurveTo(-50, -24, -60, -8, -58, 16);
  ctx.bezierCurveTo(-56, 44, -48, 68, -40, 90);
  ctx.quadraticCurveTo(0, 100, 40, 90);
  ctx.bezierCurveTo(48, 68, 56, 44, 58, 16);
  ctx.bezierCurveTo(60, -8, 50, -24, 30, -26);
  ctx.quadraticCurveTo(0, -18, -30, -26);
  ctx.closePath();
}
// the breastplate: ribs worked into the iron, a fire burning in the grooves
function wardenTorso(){
  torsoPath();
  var g = ctx.createLinearGradient(-58, 0, 58, 0);
  g.addColorStop(0, '#0b0708'); g.addColorStop(0.28, '#2a2326'); g.addColorStop(0.46, '#3c3438'); g.addColorStop(0.7, '#1f181b'); g.addColorStop(1, '#090506');
  ctx.fillStyle = g; ctx.fill();
  var v = ctx.createLinearGradient(0, -26, 0, 100);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(0.55, 'rgba(0,0,0,.3)'); v.addColorStop(1, 'rgba(90,22,8,.5)');
  ctx.fillStyle = v; ctx.fill();
  ctx.strokeStyle = 'rgba(255,100,40,.3)'; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.save(); torsoPath(); ctx.clip();
  [-1, 1].forEach(function(s){
    ctx.beginPath(); ctx.moveTo(s * 2, 6); ctx.quadraticCurveTo(s * 30, 22, s * 60, 2);
    ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 2.4; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s * 2, 4.5); ctx.quadraticCurveTo(s * 30, 20.5, s * 60, 0.5);
    ctx.strokeStyle = 'rgba(170,150,145,.22)'; ctx.lineWidth = 1; ctx.stroke();
  });
  for (var k = 0; k < 4; k++){
    var ry = 30 + k * 13, rw = 46 - k * 5;
    [-1, 1].forEach(function(s){
      ctx.beginPath(); ctx.moveTo(s * 6, ry); ctx.quadraticCurveTo(s * rw * 0.6, ry + 9, s * rw, ry - 4);
      ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.lineWidth = 3.2; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,72,20,.34)'; ctx.lineWidth = 1.1; ctx.stroke();
    });
  }
  ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(0, 96);
  ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 3; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-1, -20); ctx.lineTo(-1, 96);
  ctx.strokeStyle = 'rgba(180,160,155,.28)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.restore();
}
function wardenFaulds(){
  for (var k = 1; k >= 0; k--){
    var t0 = 94 + k * 11, w0 = 42 + k * 4;
    ctx.beginPath(); ctx.moveTo(-w0, t0); ctx.quadraticCurveTo(0, t0 + 8, w0, t0); ctx.lineTo(w0 + 3, t0 + 13); ctx.quadraticCurveTo(0, t0 + 21, -w0 - 3, t0 + 13); ctx.closePath();
    var g = ctx.createLinearGradient(0, t0, 0, t0 + 20); g.addColorStop(0, '#2a2225'); g.addColorStop(1, '#0f0a0b');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(255,100,40,.38)'; ctx.lineWidth = 1; ctx.stroke();
  }
}
// his belt, and the keys to every cage on a ring at his hip
function wardenBelt(){
  ctx.beginPath(); ctx.moveTo(-44, 82); ctx.quadraticCurveTo(0, 92, 44, 82); ctx.lineTo(42, 92); ctx.quadraticCurveTo(0, 102, -42, 92); ctx.closePath();
  ctx.fillStyle = '#140e0f'; ctx.fill(); ctx.strokeStyle = 'rgba(255,100,40,.3)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = 'rgba(170,150,140,.45)';
  for (var x = -36; x <= 36; x += 12){ ctx.beginPath(); ctx.arc(x, 87.5 + (1 - Math.pow(x / 44, 2)) * 4.5, 1.2, 0, 6.2832); ctx.fill(); }
  var kx = -30, ky = 99;
  ctx.strokeStyle = '#4a3e3a'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(kx, ky, 5, 0, 6.2832); ctx.stroke();
  [[-0.35, 22], [0.05, 26], [0.4, 20]].forEach(function(K){
    ctx.save(); ctx.translate(kx, ky + 4); ctx.rotate(K[0]);
    ctx.strokeStyle = '#3a302c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 4, 3, 0, 6.2832); ctx.moveTo(0, 7); ctx.lineTo(0, K[1]); ctx.stroke();
    ctx.fillStyle = '#3a302c'; ctx.fillRect(0, K[1] - 5, 4, 2); ctx.fillRect(0, K[1] - 2, 5, 2);
    ctx.strokeStyle = 'rgba(255,110,40,.3)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(1, 8); ctx.lineTo(1, K[1]); ctx.stroke();
    ctx.restore();
  });
}
function wardenGorget(){
  for (var k = 0; k < 2; k++){
    var y0 = -40 + k * 7, w0 = 27 + k * 4;
    ctx.beginPath(); ctx.moveTo(-w0, y0 + 6); ctx.quadraticCurveTo(0, y0 - 4, w0, y0 + 6); ctx.lineTo(w0 + 2, y0 + 12); ctx.quadraticCurveTo(0, y0 + 3, -w0 - 2, y0 + 12); ctx.closePath();
    ctx.fillStyle = k ? '#1c1518' : '#2a2226'; ctx.fill();
    ctx.strokeStyle = 'rgba(170,150,145,.3)'; ctx.lineWidth = 0.9; ctx.stroke();
  }
}
// a chain slung across his chest, a padlock hanging from it
function wardenChestChain(){
  var pts = [];
  for (var i = 0; i <= 12; i++){ var u = i / 12; pts.push({ x: -54 + 108 * u, y: 2 + Math.sin(Math.PI * u) * 42 }); }
  chainLinks(pts, 0.9);
  var x = 0, y = 46;
  ctx.strokeStyle = '#3a302c'; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.arc(x, y + 3, 5.5, Math.PI, 0); ctx.stroke();
  var g = ctx.createLinearGradient(x - 9, 0, x + 9, 0); g.addColorStop(0, '#15100f'); g.addColorStop(0.4, '#4a3f3a'); g.addColorStop(1, '#120d0c');
  rrect(x - 9, y + 3, 18, 15, 3); ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = 'rgba(255,100,40,.4)'; ctx.lineWidth = 0.9; ctx.stroke();
  ctx.fillStyle = '#030101'; ctx.beginPath(); ctx.arc(x, y + 9, 1.9, 0, 6.2832); ctx.fill(); ctx.fillRect(x - 0.8, y + 9, 1.6, 5);
}
function wardenHorn(s){
  var P = [[s * 17, -84], [s * 52, -94], [s * 84, -84], [s * 88, -122]], N = 18, A = [], B = [], i;
  for (i = 0; i <= N; i++){
    var u = i / N, x = cubic(P[0][0], P[1][0], P[2][0], P[3][0], u), y = cubic(P[0][1], P[1][1], P[2][1], P[3][1], u);
    var dx = cubicD(P[0][0], P[1][0], P[2][0], P[3][0], u), dy = cubicD(P[0][1], P[1][1], P[2][1], P[3][1], u), l = Math.hypot(dx, dy) || 1;
    var w = 8.5 * Math.pow(1 - u, 0.8) + 0.4, nx = -dy / l, ny = dx / l;
    A.push([x + nx * w, y + ny * w]); B.push([x - nx * w, y - ny * w]);
  }
  ctx.beginPath(); ctx.moveTo(A[0][0], A[0][1]);
  for (i = 1; i <= N; i++) ctx.lineTo(A[i][0], A[i][1]);
  for (i = N; i >= 0; i--) ctx.lineTo(B[i][0], B[i][1]);
  ctx.closePath();
  var g = ctx.createLinearGradient(P[0][0], P[0][1], P[3][0], P[3][1]);
  g.addColorStop(0, '#140e0f'); g.addColorStop(0.45, '#3a2e2a'); g.addColorStop(0.8, '#7d6c5a'); g.addColorStop(1, '#b3a088');
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1; ctx.stroke();
  for (i = 2; i < 13; i += 2){ ctx.beginPath(); ctx.moveTo(A[i][0], A[i][1]); ctx.lineTo(B[i][0], B[i][1]); ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 1.1; ctx.stroke(); }
  var low = s > 0 ? A : B;
  ctx.beginPath(); ctx.moveTo(low[0][0], low[0][1]);
  for (i = 1; i <= 13; i++) ctx.lineTo(low[i][0], low[i][1]);
  ctx.strokeStyle = 'rgba(255,110,40,.4)'; ctx.lineWidth = 1.2; ctx.stroke();
}
function wardenPauldron(s){
  var k;
  for (k = 2; k >= 1; k--){
    var o = k * 9;
    ctx.beginPath();
    ctx.moveTo(s * (30 + k * 2), 4 + o);
    ctx.bezierCurveTo(s * 56, -2 + o, s * 94, 2 + o, s * (116 - k * 3), 14 + o);
    ctx.bezierCurveTo(s * (119 - k * 3), 20 + o, s * (115 - k * 3), 25 + o, s * (108 - k * 3), 27 + o);
    ctx.bezierCurveTo(s * 88, 18 + o, s * 58, 14 + o, s * (34 + k * 2), 17 + o);
    ctx.closePath();
    ctx.fillStyle = k === 2 ? '#150f11' : '#1c1518'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,100,40,.5)'; ctx.lineWidth = 1.1; ctx.stroke();
  }
  // the plate: up from the neck to a peak, then down and out over the arm
  ctx.beginPath();
  ctx.moveTo(s * 22, -20);
  ctx.bezierCurveTo(s * 34, -46, s * 54, -66, s * 64, -72);
  ctx.bezierCurveTo(s * 88, -60, s * 114, -36, s * 122, -6);
  ctx.quadraticCurveTo(s * 126, 8, s * 116, 18);
  ctx.bezierCurveTo(s * 92, 6, s * 56, 2, s * 28, 10);
  ctx.closePath();
  var g = ctx.createLinearGradient(0, -72, 0, 18);
  g.addColorStop(0, '#4d4247'); g.addColorStop(0.4, '#2a2125'); g.addColorStop(1, '#100a0c');
  ctx.fillStyle = g; ctx.fill();
  var h = ctx.createLinearGradient(s * 20, 0, s * 126, 0);
  h.addColorStop(0, 'rgba(0,0,0,.4)'); h.addColorStop(0.45, 'rgba(0,0,0,0)'); h.addColorStop(1, 'rgba(0,0,0,.5)');
  ctx.fillStyle = h; ctx.fill();
  ctx.strokeStyle = 'rgba(255,100,40,.5)'; ctx.lineWidth = 1.2; ctx.stroke();
  // its ridge, catching a cold light
  ctx.beginPath(); ctx.moveTo(s * 28, -24); ctx.bezierCurveTo(s * 38, -46, s * 54, -62, s * 63, -67); ctx.bezierCurveTo(s * 86, -56, s * 110, -34, s * 117, -8);
  ctx.strokeStyle = 'rgba(200,180,175,.38)'; ctx.lineWidth = 1.2; ctx.stroke();
  // a groove parallel to the lower edge
  ctx.beginPath(); ctx.moveTo(s * 36, -2); ctx.bezierCurveTo(s * 60, -8, s * 94, -6, s * 114, 6);
  ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 2; ctx.stroke();
  // spikes along the ridge, the tallest from the peak
  [[0.98, 0, 30], [0.3, 1, 22], [0.62, 1, 18]].forEach(function(sp){
    var u = sp[0], seg = sp[1], bx, by;
    if (seg === 0){ bx = cubic(s * 22, s * 34, s * 54, s * 64, u); by = cubic(-20, -46, -66, -72, u); }
    else { bx = cubic(s * 64, s * 88, s * 114, s * 122, u); by = cubic(-72, -60, -36, -6, u); }
    var a = seg === 0 ? -Math.PI / 2 + s * 0.28 : -Math.PI / 2 + s * (0.55 + u * 0.5), c = Math.cos(a), sn = Math.sin(a), px = -sn, py = c, L = sp[2];
    ctx.beginPath();
    ctx.moveTo(bx + px * 5, by + py * 5);
    ctx.quadraticCurveTo(bx + c * L * 0.55 + px * 1.8, by + sn * L * 0.55 + py * 1.8, bx + c * L, by + sn * L);
    ctx.quadraticCurveTo(bx + c * L * 0.55 - px * 1.8, by + sn * L * 0.55 - py * 1.8, bx - px * 5, by - py * 5);
    ctx.closePath();
    var sg = ctx.createLinearGradient(bx, by, bx + c * L, by + sn * L);
    sg.addColorStop(0, '#1a1314'); sg.addColorStop(1, '#6e5f58');
    ctx.fillStyle = sg; ctx.fill();
    ctx.strokeStyle = 'rgba(255,110,40,.45)'; ctx.lineWidth = 0.8; ctx.stroke();
  });
  ctx.fillStyle = 'rgba(170,150,140,.5)';
  for (k = 0; k < 4; k++){
    var u2 = 0.2 + k * 0.2;
    ctx.beginPath(); ctx.arc(cubic(s * 28, s * 56, s * 92, s * 116, u2), cubic(10, 2, 6, 18, u2) - 4, 1.3, 0, 6.2832); ctx.fill();
  }
}
// a great helm: a crest, a scowling brow, a slit with nothing but fire behind it
function wardenHelm(){
  ctx.beginPath();
  ctx.moveTo(-24, -34);
  ctx.bezierCurveTo(-28, -58, -26, -84, -14, -95);
  ctx.quadraticCurveTo(0, -103, 14, -95);
  ctx.bezierCurveTo(26, -84, 28, -58, 24, -34);
  ctx.quadraticCurveTo(12, -24, 0, -20);
  ctx.quadraticCurveTo(-12, -24, -24, -34);
  ctx.closePath();
  var g = ctx.createLinearGradient(-28, 0, 28, 0);
  g.addColorStop(0, '#0c0809'); g.addColorStop(0.32, '#3d3438'); g.addColorStop(0.5, '#4a4045'); g.addColorStop(0.7, '#241d20'); g.addColorStop(1, '#0a0607');
  ctx.fillStyle = g; ctx.fill();
  var v = ctx.createLinearGradient(0, -103, 0, -20);
  v.addColorStop(0, 'rgba(0,0,0,.35)'); v.addColorStop(0.6, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(90,24,8,.45)');
  ctx.fillStyle = v; ctx.fill();
  ctx.strokeStyle = 'rgba(255,100,40,.35)'; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, -101); ctx.quadraticCurveTo(1, -86, 0, -70);
  ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 3; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-0.8, -101); ctx.quadraticCurveTo(0.2, -86, -0.8, -70);
  ctx.strokeStyle = 'rgba(190,170,165,.35)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-25, -73); ctx.quadraticCurveTo(-10, -71, 0, -64); ctx.quadraticCurveTo(10, -71, 25, -73);
  ctx.lineTo(25, -69); ctx.quadraticCurveTo(10, -67, 0, -60); ctx.quadraticCurveTo(-10, -67, -25, -69); ctx.closePath();
  ctx.fillStyle = '#2a2226'; ctx.fill();
  ctx.strokeStyle = 'rgba(190,170,165,.3)'; ctx.lineWidth = 0.9; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-20, -66); ctx.lineTo(-3, -59); ctx.lineTo(3, -59); ctx.lineTo(20, -66); ctx.lineTo(19, -61.5); ctx.lineTo(3, -55); ctx.lineTo(-3, -55); ctx.lineTo(-19, -61.5); ctx.closePath();
  ctx.fillStyle = '#020001'; ctx.fill();
  ctx.fillStyle = '#030102'; ctx.fillRect(-1.6, -52, 3.2, 22);
  for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++) [-1, 1].forEach(function(s){ ctx.beginPath(); ctx.arc(s * (7 + c * 5), -48 + r * 6 + c * 1.5, 1.2, 0, 6.2832); ctx.fill(); });
  ctx.fillStyle = 'rgba(170,150,140,.5)';
  [[-18, -40], [-9, -30], [9, -30], [18, -40], [-22, -78], [22, -78]].forEach(function(p){ ctx.beginPath(); ctx.arc(p[0], p[1], 1.2, 0, 6.2832); ctx.fill(); });
}
function armPlate(a, b, wa, wb){
  var dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  ctx.beginPath();
  ctx.moveTo(a.x + nx * wa, a.y + ny * wa);
  ctx.lineTo(b.x + nx * wb, b.y + ny * wb);
  ctx.quadraticCurveTo(b.x + ux * wb * 1.3, b.y + uy * wb * 1.3, b.x - nx * wb, b.y - ny * wb);
  ctx.lineTo(a.x - nx * wa, a.y - ny * wa);
  ctx.quadraticCurveTo(a.x - ux * wa * 1.3, a.y - uy * wa * 1.3, a.x + nx * wa, a.y + ny * wa);
  ctx.closePath();
  var g = ctx.createLinearGradient(a.x + nx * wa, a.y + ny * wa, a.x - nx * wa, a.y - ny * wa);
  g.addColorStop(0, '#0e0a0b'); g.addColorStop(0.45, '#3a3135'); g.addColorStop(0.6, '#2a2226'); g.addColorStop(1, '#0c0809');
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = 'rgba(255,100,40,.35)'; ctx.lineWidth = 1; ctx.stroke();
}
function drawWardenArm(A){
  armPlate(A.S, A.E, 14, 12);
  armPlate(A.E, A.F, 12, 10);
  var dx = A.F.x - A.E.x, dy = A.F.y - A.E.y, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
  ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 1.4;
  [0.35, 0.62].forEach(function(u){ var x = A.E.x + dx * u, y = A.E.y + dy * u; ctx.beginPath(); ctx.moveTo(x + nx * 9, y + ny * 9); ctx.lineTo(x - nx * 9, y - ny * 9); ctx.stroke(); });
  // the couter over the elbow, spiked outward
  var mx = (A.S.x + A.F.x) / 2, my = (A.S.y + A.F.y) / 2, ox = A.E.x - mx, oy = A.E.y - my, ol = Math.hypot(ox, oy) || 1;
  ox /= ol; oy /= ol;
  ctx.beginPath(); ctx.moveTo(A.E.x - oy * 4.5, A.E.y + ox * 4.5); ctx.lineTo(A.E.x + ox * 18, A.E.y + oy * 18); ctx.lineTo(A.E.x + oy * 4.5, A.E.y - ox * 4.5); ctx.closePath();
  ctx.fillStyle = '#181112'; ctx.fill(); ctx.strokeStyle = 'rgba(170,150,140,.35)'; ctx.lineWidth = 0.8; ctx.stroke();
  var g = ctx.createRadialGradient(A.E.x - 3, A.E.y - 3, 1, A.E.x, A.E.y, 10);
  g.addColorStop(0, '#4a4044'); g.addColorStop(1, '#141011');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(A.E.x, A.E.y, 9, 0, 6.2832); ctx.fill();
  ctx.strokeStyle = 'rgba(255,100,40,.4)'; ctx.lineWidth = 1; ctx.stroke();
}
// an armoured fist, knuckle plates and claws
function drawGauntlet(A){
  var a = Math.atan2(A.F.y - A.E.y, A.F.x - A.E.x);
  ctx.save(); ctx.translate(A.F.x, A.F.y); ctx.rotate(a);
  ctx.fillStyle = '#1d1619'; ctx.beginPath(); ctx.moveTo(-11, -11); ctx.lineTo(-2, -12.5); ctx.lineTo(-2, 12.5); ctx.lineTo(-11, 11); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(255,100,40,.35)'; ctx.lineWidth = 0.9; ctx.stroke();
  var g = ctx.createRadialGradient(1, -3, 1, 3, 0, 12);
  g.addColorStop(0, '#4a4044'); g.addColorStop(1, '#120d0e');
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(4, 0, 10.5, 9.5, 0, 0, 6.2832); ctx.fill();
  ctx.strokeStyle = 'rgba(255,100,40,.4)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1.2;
  for (var k = 0; k < 4; k++){ ctx.beginPath(); ctx.arc(10, -6 + k * 4, 2.3, -1.3, 1.3); ctx.stroke(); }
  ctx.fillStyle = '#120c0d';
  for (k = 0; k < 4; k++){ var y = -6 + k * 4; ctx.beginPath(); ctx.moveTo(12, y - 1.2); ctx.quadraticCurveTo(17, y - 0.5, 17.5, y + 3); ctx.quadraticCurveTo(15, y + 1, 12, y + 1.2); ctx.closePath(); ctx.fill(); }
  ctx.restore();
}
function drawWardenEyes(w, P){
  var k = clamp(w.eyes * (0.78 + 0.12 * Math.sin(G.t * 6.3) + 0.1 * Math.sin(G.t * 17)) + w.flare * 0.8, 0, 1.6);
  if (k <= 0.01) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  [-1, 1].forEach(function(s){
    var ex = P.x + s * 9.5, ey = P.y - 60.5;
    drawGlow(ex, ey, 16, [255, 80, 20], 0.75 * k, 46, 22);
    ctx.fillStyle = 'rgba(255,110,30,' + Math.min(1, 0.9 * k) + ')';
    ctx.beginPath(); ctx.ellipse(ex, ey, 4.4, 1.7, s * -0.38, 0, 6.2832); ctx.fill();
    ctx.fillStyle = 'rgba(255,236,190,' + Math.min(1, k) + ')';
    ctx.beginPath(); ctx.ellipse(ex, ey, 1.9, 0.9, s * -0.38, 0, 6.2832); ctx.fill();
  });
  ctx.restore();
}
function drawWarden(w){
  drawWreck(w);
  if (w.dead || w.state === 'wait') return;
  var P = wardenPose(w), dieK = w.dying ? clamp(w.dieT / RELEASE.dead, 0, 1) : 0, S = wardenSprites(), arms = wardenArms(P);
  ctx.save();
  ctx.globalAlpha = 1 - dieK * 0.85;
  var ag = ctx.createRadialGradient(P.x, P.y + 10, 30, P.x, P.y + 10, 210);
  ag.addColorStop(0, 'rgba(0,0,0,.6)'); ag.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = ag; ctx.fillRect(P.x - 210, P.y - 200, 420, 420);
  if (!w.dying) drawGlow(P.lantern.x, P.lantern.y, 90, [255, 150, 60], 0.22 + 0.4 * w.shutter, 300, 260);
  ctx.drawImage(S.back, P.x - WS.OX, P.y - WS.OY, WS.W, WS.H);
  arms.forEach(drawWardenArm);
  if (!w.broken) ctx.drawImage(S.front, P.x - WS.OX, P.y - WS.OY, WS.W, WS.H);
  arms.forEach(drawGauntlet);
  if (!w.broken) drawWardenEyes(w, P);
  if (!w.flailOut && !w.dying){
    var F = P.flailFist, fb = { x: F.x + Math.sin(w.flail.th) * w.flail.len, y: F.y + 6 + Math.cos(w.flail.th) * w.flail.len };
    chainLinks([{ x: F.x, y: F.y + 6 }, fb], 1.05);
    drawSpikeBall(fb.x, fb.y + WARDEN.FLAIL_BALL * 0.5, WARDEN.FLAIL_BALL, 0.3 + w.flail.th);
  }
  if (!w.dying){
    chainLinks([{ x: P.lampFist.x, y: P.lampFist.y + 6 }, P.ring], 0.75);
    drawLantern(P, w);
  }
  ctx.restore();
}
// his armour when he dies: the helm and pauldrons come loose and fall into the crust
function drawWreck(w){
  if (!w.wreck || !w.wreck.length) return;
  w.wreck.forEach(function(pc){
    if (pc.a <= 0) return;
    ctx.save(); ctx.globalAlpha = pc.a;
    ctx.translate(pc.x, pc.y); ctx.rotate(pc.rot);
    if (pc.kind === 'helm'){ ctx.translate(0, 62); wardenHorn(-1); wardenHorn(1); wardenHelm(); }
    else if (pc.kind === 'pauldron'){ ctx.translate(-pc.s * 72, 24); wardenPauldron(pc.s); }
    else drawSpikeBall(0, 0, WARDEN.FLAIL_BALL, 0);
    ctx.restore();
  });
}
// the lantern: iron bars, a fire inside, two shutters that slide apart when it
// opens; shut, they leave a seam of fire between them so the target always
// shows. It hangs from his fist and swings with it.
function drawLantern(P, w){
  var open = w.shutter, L = WARDEN.LAMP_W, T = WARDEN.LAMP_T, f, k;
  ctx.save();
  ctx.translate(P.lantern.x, P.lantern.y); ctx.rotate(-P.rot);
  var fg = ctx.createRadialGradient(0, 3, 2, 0, 0, 24);
  fg.addColorStop(0, 'rgba(255,250,225,' + (0.55 + 0.45 * open) + ')'); fg.addColorStop(0.45, 'rgba(255,186,76,.9)'); fg.addColorStop(1, 'rgba(255,90,20,0)');
  ctx.fillStyle = fg; ctx.beginPath(); ctx.ellipse(0, 0, L - 2, T - 2, 0, 0, 6.2832); ctx.fill();
  for (f = 0; f < 3; f++){
    var fx = (f - 1) * 5, fh = 9 + 5 * FIRE.at(f * 30, G.t * 40);
    drawLick(fx, 10, 3.4, 0.8, f === 1 ? 'rgba(255,240,190,1)' : 'rgba(255,160,50,1)');
    ctx.fillStyle = 'rgba(255,200,90,.6)'; ctx.beginPath(); ctx.ellipse(fx, 7 - fh * 0.3, 2.3, fh * 0.45, 0, 0, 6.2832); ctx.fill();
  }
  if (w.hits > 0){
    ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-2, -4); ctx.lineTo(-9, -12); ctx.moveTo(-2, -4); ctx.lineTo(5, -13); ctx.moveTo(-2, -4); ctx.lineTo(7, 3); ctx.moveTo(-2, -4); ctx.lineTo(-7, 8); ctx.stroke();
  }
  ctx.strokeStyle = '#5c4e4a'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  for (k = -2; k <= 2; k++){ ctx.beginPath(); ctx.moveTo(k * 6.2, -T + 2); ctx.quadraticCurveTo(k * 7.2, 0, k * 6.2, T - 2); ctx.stroke(); }
  ctx.fillStyle = '#2e2426';
  ctx.beginPath(); ctx.moveTo(-L - 3, -T + 3); ctx.quadraticCurveTo(0, -T - 12, L + 3, -T + 3); ctx.quadraticCurveTo(0, -T - 1, -L - 3, -T + 3); ctx.fill();
  ctx.beginPath(); ctx.ellipse(0, T, L + 2, 4, 0, 0, 6.2832); ctx.fill();
  ctx.strokeStyle = '#6e605a'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(0, -T - 6, 3.5, 0, 6.2832); ctx.stroke();
  drawGlow(0, 0, 24, [255, 170, 70], 0.45 + 0.2 * Math.sin(G.t * 7), 46, 70);
  var sw = (L - 1.4) * (1 - open);
  if (sw > 0.5){
    [-1, 1].forEach(function(s){
      var x0 = s < 0 ? -L : L - sw;
      var pg = ctx.createLinearGradient(x0, 0, x0 + sw, 0);
      pg.addColorStop(0, '#3a3032'); pg.addColorStop(1, '#221a1c');
      ctx.fillStyle = pg; ctx.fillRect(x0, -T + 3, sw, 2 * T - 6);
      ctx.fillStyle = 'rgba(160,140,130,.6)';
      ctx.beginPath(); ctx.arc(x0 + sw / 2, -7, 1.1, 0, 6.2832); ctx.arc(x0 + sw / 2, 7, 1.1, 0, 6.2832); ctx.fill();
    });
  }
  if (open > 0.1){
    drawGlow(0, 0, 44, [255, 240, 190], open, 120, 130);
    ctx.globalAlpha = (0.5 + 0.4 * Math.sin(G.t * 12)) * open;
    ctx.strokeStyle = COLORS.sulfur; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(0, 0, L + 7, T + 7, 0, 0, 6.2832); ctx.stroke();
  }
  ctx.restore();
}
// his lantern's beam. Aiming, the lantern gathers its light (a glow swelling
// round it, sparks crawling over it) while a pale line runs from its foot to
// the floor under the heart; locked, the line flashes; then a beam of energy
// stands along that line: narrow where it leaves the lantern, wide where it
// strikes, a white core in gold with filaments crawling along it.
function drawWardenBeam(w){
  var bm = w.beam; if (!bm || w.dead || w.dying) return;
  var B = beamLine(w), dx = B.x1 - B.x0, dy = B.y1 - B.y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L, i;
  ctx.save();
  if (bm.state === 'aim' || bm.state === 'lock'){
    var gk = bm.state === 'aim' ? bm.t / 0.9 : 1;
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(B.x0, B.y0 - 14, 30, [255, 225, 150], 0.35 + 0.65 * gk, 50 + 50 * gk, 60 + 50 * gk);
    ctx.strokeStyle = 'rgba(255,240,200,' + (0.35 + 0.5 * gk) + ')'; ctx.lineWidth = 1;
    for (i = 0; i < 3; i++){
      var a = Math.random() * 6.2832, r0 = 14 + Math.random() * 6, r1 = r0 + 6 + 10 * gk;
      ctx.beginPath(); ctx.moveTo(B.x0 + Math.cos(a) * r0, B.y0 - 14 + Math.sin(a) * r0 * 1.2);
      ctx.lineTo(B.x0 + Math.cos(a + 0.2) * (r0 + r1) / 2 + rnd(-2, 2), B.y0 - 14 + Math.sin(a + 0.2) * (r0 + r1) / 2 * 1.2);
      ctx.lineTo(B.x0 + Math.cos(a - 0.1) * r1, B.y0 - 14 + Math.sin(a - 0.1) * r1 * 1.2); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    telegraphStyle(bm.state === 'lock', bm.t, 0.9);
    ctx.beginPath(); ctx.moveTo(B.x0, B.y0); ctx.lineTo(B.x1, B.y1); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(B.x1 - BEAM.W1, FLOOR); ctx.lineTo(B.x1 + BEAM.W1, FLOOR); ctx.stroke();   // how wide it will burn
  } else if (bm.state === 'fire'){
    var k = 1 - bm.t / 0.6, flick = 0.85 + 0.15 * Math.sin(G.t * 70);
    ctx.globalCompositeOperation = 'lighter';
    [[1.9, 'rgba(255,170,70,', 0.22], [1.2, 'rgba(255,215,130,', 0.45], [0.55, 'rgba(255,248,220,', 0.9]].forEach(function(layer){
      var w0 = BEAM.W0 * layer[0], w1 = BEAM.W1 * layer[0];
      ctx.beginPath();
      ctx.moveTo(B.x0 + nx * w0, B.y0 + ny * w0); ctx.lineTo(B.x1 + nx * w1, B.y1 + ny * w1);
      ctx.lineTo(B.x1 - nx * w1, B.y1 - ny * w1); ctx.lineTo(B.x0 - nx * w0, B.y0 - ny * w0); ctx.closePath();
      ctx.fillStyle = layer[1] + (layer[2] * k * flick) + ')'; ctx.fill();
    });
    // energy crawling along it
    ctx.strokeStyle = 'rgba(255,255,240,' + (0.75 * k) + ')'; ctx.lineWidth = 1.2;
    for (var f2 = 0; f2 < 2; f2++){
      ctx.beginPath();
      for (var u = 0; u <= 1.001; u += 0.08){
        var off = (Math.random() - 0.5) * 2 * lerp(BEAM.W0, BEAM.W1, u) * 0.7;
        var px = B.x0 + dx * u + nx * off, py = B.y0 + dy * u + ny * off;
        if (u === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    drawGlow(B.x0, B.y0, 30, [255, 240, 200], k, 70, 70);
    drawGlow(B.x1, B.y1, 44, [255, 200, 90], k, 150, 56);
  }
  ctx.restore();
}
// the losing end: a cage comes down over the heart
function drawCagedEnd(){
  var c = G.cagedEnd, p = G.player;
  drawCage({ x: p.x, y: c.y, soul: false, lock: 0, shake: c.slam ? 0.2 : 0, sway: 0 });
}
// seven small hearts under the lives: freed (bright), carried (with you), still caged (outline)
function drawSoulTally(){
  for (var i = 0; i < STOLEN.SOULS; i++){
    var x = 18 + i * 12, y = 88;
    if (i < G.saved) drawGem(x, y, 4, { alpha: 1, light: 1.3 });
    else if (i < G.saved + G.carried.length) drawGem(x, y, 4, { alpha: 0.55 + 0.35 * G.heart.pulse });
    else { ctx.save(); ctx.strokeStyle = 'rgba(253,248,240,.28)'; ctx.lineWidth = 1; heartPath(x, y, 4); ctx.stroke(); ctx.restore(); }
  }
}

// ---------- drawing ----------
function heartPath(x, y, s){
  ctx.beginPath();
  ctx.moveTo(x, y + s*0.72);
  ctx.bezierCurveTo(x - s*1.30, y - s*0.24, x - s*0.62, y - s*1.28, x, y - s*0.46);
  ctx.bezierCurveTo(x + s*0.62, y - s*1.28, x + s*1.30, y - s*0.24, x, y + s*0.72);
  ctx.closePath();
}

// how much fire is under the heart right now, 0..1
function fireBelow(p){ return fireLight(p.x, p.y).k; }
// how much fire light falls on a point, and from which direction (unit vector toward the fire)
function fireLight(x, y){
  var best = { k: 0, dx: 0, dy: 1 };
  G.flames.forEach(function(fl){
    var nx, ny, kk;
    if (fl.type === 'walker' && fl.h > 20){
      nx = clamp(x, fl.x - fl.w * 0.5, fl.x + fl.w * 0.5); ny = clamp(y, LH - fl.h, LH);
      kk = 1 - clamp(Math.hypot(x - nx, y - ny) / 170, 0, 1);
    } else if (fl.type === 'jet' && fl.len > 0){
      var jd = jetDir(fl), ex = fl.ox + jd.x * fl.len, ey = fl.oy + jd.y * fl.len;
      var vx = ex - fl.ox, vy = ey - fl.oy, L2 = vx*vx + vy*vy || 1, kseg = clamp(((x - fl.ox) * vx + (y - fl.oy) * vy) / L2, 0, 1);
      nx = fl.ox + vx * kseg; ny = fl.oy + vy * kseg;
      kk = 0.8 * (1 - clamp(Math.hypot(x - nx, y - ny) / 150, 0, 1));
    } else return;
    if (kk > best.k){
      var d = Math.hypot(nx - x, ny - y) || 1;
      best = { k: kk, dx: (nx - x) / d, dy: (ny - y) / d };
    }
  });
  return best;
}
function drawPlayer(){
  var p = G.player, h = G.heart, t = G.t;
  if (G.mode === 'play' && G.invuln > 0 && Math.floor(G.t * 14) % 2 === 0 && !(G.penalty && G.penalty.kind !== 'hit')) return;
  var held = G.taken && G.taken.grabbed && G.mode === 'ending';
  var heal = G.freed && G.mode === 'ending' ? G.freed.heal : 0;       // in the light: healing, brightening
  var y = p.y + G.recoil * 3, s = 11 * (window.BTD_HEART_SCALE || 1) * (held ? 1.8 : 1) * (1 + 0.3 * heal);   // BTD_HEART_SCALE: debug magnifier
  var lit = fireBelow(p), fire = fireLight(p.x, p.y);
  var pen = G.penalty, burn = pen && pen.kind === 'burn' ? pen : null;
  // It is a muscle, not a gem. Each beat: a slow fill, a hard squeeze on the
  // lub, a smaller one on the dub, then the flesh rings out like jelly.
  var e1 = env(h.since, 0.07, 0.22) * (h.lubScale - 1) / 0.14, e2 = h.dubDone ? env(h.since - h.dubAt, 0.07, 0.16) : 0;
  var fill = Math.sin(Math.PI * clamp(h.since / Math.max(0.25, h.next), 0, 1)) * 0.05;   // diastole: it swells between beats
  var ring = Math.exp(-h.since * 8.5) * Math.sin(h.since * 46) * 0.075;                  // and rings after the squeeze
  var sx = 1 + 0.24 * e1 - 0.06 * e2 + ring - fill * 0.4;
  var sy = 1 - 0.15 * e1 + 0.12 * e2 - ring + fill;
  var settle = Math.sin(h.settleT * 24) * 0.05 * h.settleAmp;
  var dx = (FIRE.at(t * 5, 3) - 0.5) * 3.5, dy = (FIRE.at(t * 4.3, 80) - 0.5) * 3.5;
  if (h.flutter > 0){ dx += rnd(-1.6, 1.6); dy += rnd(-1.6, 1.6); }
  // a lean into the direction of travel, and a light trail when moving fast
  var speed = Math.hypot(p.vx, p.vy);
  var rot = settle + clamp(p.vx / 1400, -0.22, 0.22) + ring * 0.7;
  if (speed > 150 && Math.random() < 0.8)
    addPart({ x: p.x - p.vx / speed * 8 + rnd(-3, 3), y: y - p.vy / speed * 8 + rnd(-3, 3), vx: -p.vx * 0.05, vy: -p.vy * 0.05,
                   life: rnd(0.18, 0.32), t: 0, c: col('heart', 0.5), r: rnd(1.5, 3), g: 0 });
  if (burn && speed > 40 && Math.random() < 0.5)
    addPart({ x: p.x + rnd(-6, 6), y: y + rnd(-6, 6), vx: -p.vx * 0.06 + rnd(-8, 8), vy: -p.vy * 0.06 - 30, life: rnd(0.5, 1.0), t: 0,
                   c: 'rgba(30,18,30,.55)', r: rnd(3, 6), g: -14, turb: 20 });
  ctx.save();
  if (lit > 0){
    var ug = ctx.createRadialGradient(p.x, y + 14, 2, p.x, y + 14, 34);
    ug.addColorStop(0, 'rgba(255,140,30,' + (0.55 * lit) + ')');
    ug.addColorStop(1, 'rgba(255,60,0,0)');
    ctx.fillStyle = ug;
    ctx.fillRect(p.x - 40, y - 26, 80, 60);
  }
  // the wave the squeeze throws off, once per beat
  if (!held && h.since < 0.42 && G.mode !== 'title'){
    var rk = h.since / 0.42, rr = s * (1.1 + 2.6 * rk);
    ctx.save();
    ctx.globalAlpha = (1 - rk) * (1 - rk) * 0.3 * h.light;
    ctx.strokeStyle = col('heart', 1); ctx.lineWidth = Math.max(0.6, 2.2 * (1 - rk));
    ctx.beginPath(); ctx.ellipse(p.x + dx, y + dy, rr, rr * 0.86, 0, 0, 6.2832); ctx.stroke();
    ctx.restore();
  }
  if (heal > 0) drawGlow(p.x + dx, y + dy, 48, RGB.grace, 0.9 * heal, 150 * (0.5 + 0.5 * heal), 150 * (0.5 + 0.5 * heal));
  drawGem(p.x + dx, y + dy, s, {
    pulse: h.pulse, lit: lit, dmg: wounds(), light: lerp(h.light * (G.taken && G.taken.glow != null ? G.taken.glow : 1), 1.3, heal), fire: fire, scars: G.scars,
    burnK: burn ? Math.max(0, 1 - pen.t / 0.6) : 0, heal: heal,
    sx: sx, sy: sy, rot: rot, veins: true, leak: heal < 0.3 && (G.lives <= 1 || (pen && pen.kind === 'fork')),
    breath: 0.82 + 0.18 * Math.sin(t * 1.1 + 0.7),                  // its own slower cycle
    veinWave: h.since / 0.45
  });
  // the embedded fork, quivering, and the light leaking from the wound
  if (G.embed){
    var em = G.embed, q = Math.sin(em.t * 38) * 0.12 * Math.max(0, 1 - em.t / 1.2);
    ctx.save();
    ctx.translate(p.x + dx + em.dir.x * 4, y + dy + em.dir.y * 4);
    ctx.rotate(em.ang + q);
    ctx.translate(0, -12);          // tines in the heart, handle out along the arrival line
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    drawGlow(0, 10, 16, RGB.ember, 0.5, 30, 60);
    ctx.strokeStyle = '#ff6a24'; ctx.lineWidth = 3;
    forkShape();
    ctx.restore();
    if (Math.random() < 0.7)
      addPart({ x: p.x + em.dir.x * 6 + rnd(-3, 3), y: y + em.dir.y * 6 + rnd(-3, 3), vx: em.dir.x * 20 + rnd(-10, 10), vy: -18 + rnd(-10, 10),
                     life: rnd(0.3, 0.7), t: 0, c: Math.random() < 0.6 ? COLORS.heart : '#ffffff', r: rnd(0.8, 1.8), g: -8, turb: 20 });
  }
  // flame clinging to the struck side, licking upward, shrinking as the timer runs out
  if (burn){
    var bk = Math.max(0, 1 - pen.t / 2.0), bx = p.x + dx + burn.dir.x * s * 0.9, by = y + dy + burn.dir.y * s * 0.6;
    var fh = 26 * bk;
    ctx.save();
    drawGlow(bx, by - fh * 0.5, 20, [255, 106, 16], 0.7 * bk, 34, fh + 30);
    var fg = ctx.createLinearGradient(0, by, 0, by - fh);
    fg.addColorStop(0, 'rgba(255,220,120,.9)'); fg.addColorStop(0.5, 'rgba(255,110,10,.8)'); fg.addColorStop(1, 'rgba(255,40,10,0)');
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(bx - 7 * bk, by + 3);
    for (var i=1;i<=5;i++){ var k = i/5, e = (FIRE.at(k*50 + t*90, 40) - 0.5) * 8; ctx.lineTo(bx - 7 * bk * (1 - k) + e, by - fh * k); }
    for (var j=5;j>=1;j--){ var k2 = j/5, e2 = (FIRE.at(k2*50 + t*95 + 300, 60) - 0.5) * 8; ctx.lineTo(bx + 7 * bk * (1 - k2) + e2, by - fh * k2); }
    ctx.lineTo(bx + 7 * bk, by + 3);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    if (Math.random() < 0.4)
      addPart({ x: bx + rnd(-4, 4), y: by - fh * 0.6, vx: rnd(-8, 8), vy: rnd(-40, -20), life: rnd(0.3, 0.7), t: 0, c: '#ffb060', r: rnd(0.8, 1.6), g: -20, turb: 30 });
  }
  ctx.restore();
}

function boltShape(x, y, s){
  ctx.beginPath();
  ctx.moveTo(x + 1*s, y - 12*s);
  ctx.lineTo(x - 4*s, y - 1*s);
  ctx.lineTo(x - 0.5*s, y - 1*s);
  ctx.lineTo(x - 2*s, y + 12*s);
  ctx.lineTo(x + 4.5*s, y - 2*s);
  ctx.lineTo(x + 0.5*s, y - 2*s);
  ctx.closePath();
}
function drawBolt(b){
  ctx.save();
  drawGlow(b.x, b.y, 16, RGB.heart, 0.8, 26, 40);
  ctx.fillStyle = '#eefaff';
  boltShape(b.x, b.y, 1);
  ctx.fill();
  ctx.restore();
}

function forkShape(){
  ctx.beginPath(); ctx.moveTo(0,-17); ctx.lineTo(0,3); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-9,3); ctx.lineTo(9,3); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-9,3); ctx.lineTo(-9,15);
  ctx.moveTo(0,3);  ctx.lineTo(0,18);
  ctx.moveTo(9,3);  ctx.lineTo(9,15);
  ctx.stroke();
}
function drawFork(f){
  if (f.t < 0) return;
  ctx.save();
  if (f.state === 'aim' || f.state === 'lock'){
    var locked = f.state === 'lock';
    var flick = locked && Math.floor(f.t * 30) % 2 === 0;
    ctx.globalAlpha = locked ? (flick ? 0.95 : 0.6) : 0.18 + 0.12 * (f.t / f.aimT);
    ctx.strokeStyle = locked ? COLORS.sulfur : COLORS.bone;      // pale: red dashes vanish on the pit's rock
    ctx.lineWidth = locked ? 1.5 : 1;
    if (!locked) ctx.setLineDash([3, 9]);
    ctx.beginPath(); ctx.moveTo(f.ox, f.oy); ctx.lineTo(f.tx, f.ty); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = locked ? 1 : 0.25 + 0.6 * (f.t / f.aimT);
  }
  var alpha = f.state === 'stuck' ? Math.min(1, (1.5 - f.t) / 0.4) : 1;
  ctx.globalAlpha *= alpha;
  ctx.translate(f.x, f.y);
  ctx.rotate(f.rot);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  drawGlow(0, 0, f.state === 'lock' ? 28 : 18, RGB.ember, f.state === 'lock' ? 0.9 : 0.6, 40, 70);
  ctx.strokeStyle = f.state === 'lock' ? '#ffb070' : '#ff6a24';
  ctx.lineWidth = 3;
  forkShape();
  ctx.restore();
}

// a column of hellfire: turbulent edges from the noise field, the shared fire
// texture inside, a glow, and heat shimmer above the tip
// the edge of a flame: three octaves of curl noise scrolling up at different rates
function flameEdge(k, seed, t, w){
  var amp = w * (0.28 + 1.2 * k);
  return (FIRE.curl(k * 40 + seed * 300, t * 45 + seed * 90).x * 0.55
        + FIRE.curl(k * 95 + seed * 120, t * 105 + seed * 40).x * 0.32
        + FIRE.curl(k * 210 + seed * 500, t * 220).x * 0.16) * amp * 4.5;
}
// light spilled on the floor around a column
function floorSpill(x, w, h){
  var r = w * 2.2 + h * 0.15;
  var g = ctx.createRadialGradient(x, FLOOR, 2, x, FLOOR, r);
  g.addColorStop(0, 'rgba(255,140,40,.42)');
  g.addColorStop(0.5, 'rgba(255,90,20,.18)');
  g.addColorStop(1, 'rgba(255,60,10,0)');
  ctx.save();
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(x, FLOOR, r, r * 0.22, 0, 0, 6.2832); ctx.fill();
  ctx.restore();
}
// thin smoke above the tip, darkening the rock behind it
function smokePlume(x, top, w, seed, t){
  ctx.save();
  for (var i=0;i<8;i++){
    var k = i / 8;
    var c = FIRE.curl(seed * 200 + i * 9, t * 18 + i * 13);
    var px = x + c.x * (60 + i * 30) * 4 + Math.sin(t * 0.7 + seed * 6 + i) * (6 + i * 5);
    var py = top - 14 - i * 24 - (t * 12 + seed * 100) % 24;
    var r = w * 0.32 + i * 6;
    ctx.fillStyle = 'rgba(8,4,18,' + (0.26 * (1 - k)) + ')';
    ctx.beginPath(); ctx.arc(px, py, r, 0, 6.2832); ctx.fill();
  }
  ctx.restore();
}
// ---------- fire ----------
// A fire is not a shape, it is several tongues of different heights rising,
// leaning, pinching off and dying, seen as a gradient from a dull red edge to
// a white core. So: three layers (outer red, mid orange, inner yellow-white),
// each a set of tongues that taper hard toward their tips and wander on the
// curl field; licks that detach above them; a white-hot bed at the floor.
// The hitbox is unchanged — `w` and `h` still describe the danger.

// one tongue, as a closed path: base half-width hw, height hgt, leaning by
// `lean`, its tip wandering. u is the tongue's own phase so no two agree.
function tongueCentre(x, lean, u, t, wob, k){
  // the tip curls further than the body: k^1.7 on the lean, and the curl
  // field pushes the whole spine sideways more the higher it goes
  return x + lean * Math.pow(k, 1.7) + FIRE.curl(u * 90 + k * 46, t * 62 + u * 40).x * wob * Math.pow(k, 1.3) * 4.2;
}
function tongueHalf(hw, u, t, k, side){
  // widest in the lower third, pinching to nothing at the tip
  var prof = Math.pow(1 - k, 1.25) * (1 + 0.55 * Math.sin(Math.PI * k));
  return hw * prof * (1 + 0.3 * (FIRE.at(u * 50 + side * 311 + k * 34, t * 72) - 0.5));
}
// one tongue as a closed path, sides curved through their sample points
function tonguePath(x, base, hw, hgt, lean, u, t, wob){
  var N = 10, i, k, c, half, pts = [];
  for (i = 0; i <= N; i++){
    k = i / N; c = tongueCentre(x, lean, u, t, wob, k);
    pts.push([c - tongueHalf(hw, u, t, k, 0), base - hgt * k, c + tongueHalf(hw, u, t, k, 1), base - hgt * k]);
  }
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (i = 1; i <= N; i++){                        // up the left side, curved
    var a2 = pts[i-1], b2 = pts[i];
    ctx.quadraticCurveTo(a2[0], (a2[1] + b2[1]) / 2, (a2[0] + b2[0]) / 2, (a2[1] + b2[1]) / 2);
    ctx.lineTo(b2[0], b2[1]);
  }
  for (i = N - 1; i >= 0; i--){                    // and down the right
    var a3 = pts[i+1], b3 = pts[i];
    ctx.quadraticCurveTo(a3[2], (a3[3] + b3[3]) / 2, (a3[2] + b3[2]) / 2, (a3[3] + b3[3]) / 2);
    ctx.lineTo(b3[2], b3[3]);
  }
  ctx.closePath();
}
// a detached lick: a small teardrop that rises, shrinks and goes out
function drawLick(x, y, r, a, c){
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.moveTo(x - r, y);
  ctx.quadraticCurveTo(x - r * 0.9, y - r * 1.1, x, y - r * 2.4);
  ctx.quadraticCurveTo(x + r * 0.9, y - r * 1.1, x + r, y);
  ctx.quadraticCurveTo(x, y + r * 0.7, x - r, y);
  ctx.closePath();
  ctx.globalAlpha = a;
  ctx.fill();
  ctx.globalAlpha = 1;
}
function flameColumn(x, h, w, seed, flare){
  if (h < 4) return;
  var t = G.t, top = LH - h, fl = flare || 0;
  w = w * (1 + 0.35 * fl);
  if (Q.smoke) smokePlume(x, top, w, seed, t);
  floorSpill(x, w, h);
  var glowK = 0.8 + 0.5 * fl;
  drawGlow(x, LH - h * 0.10, 40, [255, 110, 30], glowK, w * 4.4 + 40, h * 0.62 + 60);   // the pool at its foot
  drawGlow(x, LH - h * 0.52, 40, [255, 84, 16], glowK * 0.5, w * 2.4, h * 0.7);         // and the body's haze

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // three layers, outermost first: each is a set of tongues, shorter and
  // narrower and hotter as they go in. The flicker is per tongue, not global.
  // heights are measured against the hitbox (LH-h to the floor, w wide), so
  // what the player reads as fire is what actually burns
  var layers = [
    { n: 5, hw: 0.34, hh: 1.02, a: 0.30, c: '196,38,6',   sp: 0.52 },
    { n: 4, hw: 0.26, hh: 0.86, a: 0.34, c: '255,116,12', sp: 0.44 },
    { n: 3, hw: 0.17, hh: 0.60, a: 0.42, c: '255,208,96', sp: 0.32 }
  ];
  for (var li = 0; li < layers.length; li++){
    var L = layers[li];
    for (var i = 0; i < L.n; i++){
      var u = seed * 7.3 + li * 2.1 + i * 1.7;
      // each tongue breathes on its own cycle, and sits off centre
      var puff = 0.62 + 0.38 * FIRE.at(u * 60, t * 95);
      var hgt = h * L.hh * puff * (1 + 0.25 * fl);
      var hw = w * L.hw * (0.6 + 0.5 * FIRE.at(u * 33 + 70, t * 48));
      var off = (i - (L.n - 1) / 2) * w * L.sp * 0.42 + (FIRE.at(u * 21, t * 26) - 0.5) * w * 0.2;
      var lean = (FIRE.curl(u * 40, t * 30).x) * w * 1.6;
      tonguePath(x + off, LH + 3, hw, hgt, lean, u, t, w * 0.5);
      // fire dissolves as it rises: full at the root, gone before the tip
      var a0 = L.a * (0.75 + 0.35 * puff);
      var tgg = ctx.createLinearGradient(0, LH + 3, 0, LH + 3 - hgt);
      tgg.addColorStop(0, 'rgba(' + L.c + ',' + a0 + ')');
      tgg.addColorStop(0.55, 'rgba(' + L.c + ',' + (a0 * 0.85) + ')');
      tgg.addColorStop(0.88, 'rgba(' + L.c + ',' + (a0 * 0.3) + ')');
      tgg.addColorStop(1, 'rgba(' + L.c + ',0)');
      ctx.fillStyle = tgg;
      ctx.fill();
    }
  }
  // the bed: white-hot where it meets the floor, and wider than the tongues
  var bg = ctx.createRadialGradient(x, LH + 2, 1, x, LH + 2, w * 0.9);
  bg.addColorStop(0, 'rgba(255,240,200,' + (0.5 + 0.4 * fl) + ')');
  bg.addColorStop(0.35, 'rgba(255,150,40,.36)');
  bg.addColorStop(1, 'rgba(255,60,10,0)');
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.ellipse(x, LH + 2, w * 0.9, h * 0.22 + 14, 0, 0, 6.2832); ctx.fill();
  // licks that have pinched off and are rising above the tips
  var licks = Q.smoke ? 3 : 2;
  for (i = 0; i < licks; i++){
    var lu = seed * 11 + i * 3.7;
    var ph = (t * (0.55 + 0.2 * i) + lu) % 1;                     // 0..1, its life
    var ly = top + h * 0.22 - ph * (h * 0.42 + 40);
    var lx = x + (FIRE.curl(lu * 30, t * 24).x) * w * 2.2 + (i - 1) * w * 0.28;
    var lr = (3 + w * 0.055) * (1 - ph * 0.8);
    if (lr > 0.7) drawLick(lx, ly, lr, (1 - ph) * (1 - ph) * 0.45 * (0.6 + 0.6 * fl), ph < 0.45 ? 'rgba(255,170,50,1)' : 'rgba(210,60,12,1)');
  }
  ctx.restore();

  // the noise texture, only where the fire already is, for detail inside it
  if (Q.hide){
    ctx.save();
    ctx.beginPath();
    tonguePath(x, LH + 3, w * 0.58, h * 1.02, 0, seed * 7.3, t, w * 0.5);
    ctx.clip();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.5;
    var win = Math.floor(colFire.w * 0.375), sx = Math.floor(seed * (colFire.w - win)) % (colFire.w - win);
    ctx.drawImage(colFire.canvas, sx, 0, win, colFire.h, x - w * 0.8, top - 10, w * 1.6, h + 14);
    ctx.restore();
  }
  if (fl){
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var er = w * 1.5 + h * 0.28, ey2 = LH - h * 0.2;
    var eg = ctx.createRadialGradient(x, ey2, 2, x, ey2, er);
    eg.addColorStop(0, 'rgba(255,238,195,' + (0.42 * fl) + ')');
    eg.addColorStop(0.35, 'rgba(255,170,70,' + (0.2 * fl) + ')');
    eg.addColorStop(1, 'rgba(255,90,20,0)');
    ctx.fillStyle = eg;
    ctx.fillRect(x - er, ey2 - er, er * 2, er * 2);
    ctx.restore();
  }
  // sparks torn off the tips
  if (Math.random() < (0.5 + fl) * 0.22){
    addPart({ x: x + rnd(-w * 0.5, w * 0.5), y: LH - h * rnd(0.35, 0.95), vx: rnd(-26, 26), vy: rnd(-90, -34),
              life: rnd(0.5, 1.2), t: 0, c: Math.random() < 0.6 ? '#ffc766' : '#ff8a20', r: rnd(0.9, 2), g: -18, turb: 42 });
  }
  if (Q.shimmer) heatShimmer(x, top, w, seed, t);
}
// heat shimmer: everything seen through and just above the flame is displaced
// sideways. The region behind the flame is copied ONCE into a buffer and the
// strips are drawn from that; drawing the canvas onto itself would force a
// full-canvas snapshot per strip.
var shimmerBuf = document.createElement('canvas'), shimmerCtx = shimmerBuf.getContext('2d');
function heatShimmer(x, top, w, seed, t){
  var S = cvs.width / LW, sh = 7;
  var y0 = Math.max(2, top - 70), sy0 = Math.floor(y0 * S);
  var sxx = Math.max(0, Math.floor((x - w * 0.9) * S)), sw = Math.floor(w * 1.8 * S);
  var shTot = Math.min(cvs.height - sy0, Math.ceil((LH - 6 - y0) * S));
  if (sw <= 0 || shTot <= 0) return;
  if (shimmerBuf.width < sw || shimmerBuf.height < shTot){ shimmerBuf.width = Math.max(shimmerBuf.width, sw); shimmerBuf.height = Math.max(shimmerBuf.height, shTot); }
  shimmerCtx.clearRect(0, 0, sw, shTot);
  shimmerCtx.drawImage(cvs, sxx, sy0, sw, shTot, 0, 0, sw, shTot);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (var yy = y0; yy < LH - 6; yy += sh){
    var above = yy < top ? 1 - (top - yy) / 70 : 1;
    var amp = yy < top ? 6 * above : 2.6;
    var off = (FIRE.at(yy * 0.22 + seed * 200, t * 85) - 0.5) * 2 * amp;
    var sy = Math.floor(yy * S), shh = Math.ceil(sh * S);
    if (sy + shh > cvs.height) break;
    ctx.drawImage(shimmerBuf, 0, sy - sy0, sw, shh, sxx + off * S, sy, sw, shh);
  }
  ctx.restore();
}
function drawFlame(fl){
  if (fl.type === 'walker'){
    flameColumn(fl.x, fl.h, fl.w, fl.seed, fl.flare);
  } else if (fl.type === 'ember'){
    if (fl.state === 'fly') drawFireball(fl);
    else if (fl.state === 'ring') drawScorchRing(fl);
    else drawDetonation(fl);
  } else if (fl.type === 'jet'){
    drawJet(fl);
  } else if (fl.type === 'chain'){
    drawChain(fl);

  } else if (fl.type === 'breath' && fl.t > fl.warn){
    var d = G.devil, bt2 = (fl.t - fl.warn) / fl.burn;
    var top = d ? d.y + 62 : 0;
    var x0 = fl.side < 0 ? 0 : LW/2, x1 = fl.side < 0 ? LW/2 : LW;
    var mouthX = d ? d.x : LW/2;
    ctx.save();
    ctx.globalAlpha = bt2 < 0.15 ? bt2 / 0.15 : (bt2 > 0.8 ? (1 - bt2) / 0.2 : 1);
    var outer = fl.side > 0 ? x1 + 20 : x0 - 20, inner = LW/2 + Math.sin(G.t*11)*6;
    ctx.beginPath();
    ctx.moveTo(mouthX - 30, top); ctx.lineTo(mouthX + 30, top);
    ctx.lineTo(outer, top + 60 + Math.sin(G.t*13)*8);
    ctx.lineTo(outer, LH);
    ctx.lineTo(inner, LH);
    ctx.lineTo(inner, top + 60);
    ctx.closePath();
    drawGlow((outer + inner) / 2, (top + LH) / 2, 60, RGB.ember, 0.8, Math.abs(outer - inner) + 90, LH - top + 60);
    ctx.fillStyle = 'rgba(255,110,10,.75)';
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.clip();
    ctx.globalAlpha *= 0.9;
    ctx.drawImage(colFire.canvas, 0, 0, colFire.w, colFire.h, Math.min(x0, outer) - 20, top - 20, LW/2 + 60, LH - top + 40);
    ctx.restore();
  }
}

// a fireball in flight: white-hot core, orange body, a tail streaming
// opposite the velocity, a soft halo, and a tumble
function drawFireball(f){
  var t = G.t, ang = Math.atan2(f.vy, f.vx);
  ctx.save();
  // halo
  var hg = ctx.createRadialGradient(f.x, f.y, 2, f.x, f.y, 34);
  hg.addColorStop(0, 'rgba(255,150,50,.35)'); hg.addColorStop(1, 'rgba(255,60,10,0)');
  ctx.fillStyle = hg;
  ctx.beginPath(); ctx.arc(f.x, f.y, 34, 0, 6.2832); ctx.fill();
  ctx.translate(f.x, f.y);
  ctx.rotate(ang);
  // tail: tapering behind, edges churning
  drawGlow(-14, 0, 24, [255, 106, 16], 0.8, 70, 40);
  var tg = ctx.createLinearGradient(0, 0, -46, 0);
  tg.addColorStop(0, 'rgba(255,200,90,.95)'); tg.addColorStop(0.4, 'rgba(255,110,10,.8)'); tg.addColorStop(1, 'rgba(255,40,10,0)');
  ctx.fillStyle = tg;
  ctx.beginPath();
  ctx.moveTo(2, -9);
  for (var i=1;i<=6;i++){ var k = i/6, e = (FIRE.at(k*60 + f.seed*300, t*80) - 0.5) * 10 * k; ctx.lineTo(-48 * k, -9 * (1 - k) + e); }
  for (var j=6;j>=1;j--){ var k2 = j/6, e2 = (FIRE.at(k2*60 + f.seed*300 + 200, t*85) - 0.5) * 10 * k2; ctx.lineTo(-48 * k2, 9 * (1 - k2) + e2); }
  ctx.lineTo(2, 9);
  ctx.closePath(); ctx.fill();
  // body, tumbling
  ctx.rotate(f.rot);
  var bg = ctx.createRadialGradient(-2, -2, 1, 0, 0, 12);
  bg.addColorStop(0, '#fffbe8'); bg.addColorStop(0.35, '#ffd060'); bg.addColorStop(0.75, '#ff7a10'); bg.addColorStop(1, 'rgba(255,60,10,.6)');
  ctx.fillStyle = bg;
  ctx.beginPath();
  for (var a=0;a<8;a++){ var r = 10 + (a % 2 ? 2 : -1), th = a / 8 * 6.2832; ctx.lineTo(Math.cos(th) * r, Math.sin(th) * r); }
  ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(-1, -1, 4.5, 0, 6.2832); ctx.fill();
  ctx.restore();
}
// the landing: a ring scorched into the floor, brightening and contracting to the detonation
function drawScorchRing(f){
  var k = f.t / f.fuse, r = lerp(42, 14, smooth(k));
  var flick = 0.55 + 0.45 * Math.abs(Math.sin(f.t * (6 + k * 26)));
  ctx.save();
  ctx.shadowColor = '#ff6a10'; ctx.shadowBlur = shadowR(6 + 18 * k);
  ctx.strokeStyle = rgba(255, 90 + 130 * k, 20 + 60 * k, 0.35 + 0.65 * k * flick);
  ctx.lineWidth = 2 + 2.5 * k;
  ctx.beginPath(); ctx.ellipse(f.tx, f.ty, r, r * 0.45, 0, 0, 6.2832); ctx.stroke();
  // char inside the ring
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(20,6,4,' + (0.35 * k) + ')';
  ctx.beginPath(); ctx.ellipse(f.tx, f.ty, r, r * 0.45, 0, 0, 6.2832); ctx.fill();
  // the coal at the centre
  ctx.fillStyle = k < 0.8 ? '#c8320a' : '#ffb070';
  ctx.shadowColor = COLORS.ember; ctx.shadowBlur = shadowR(6 + 12 * k);
  ctx.beginPath(); ctx.arc(f.tx, f.ty, 3 + 2.5 * k, 0, 6.2832); ctx.fill();
  ctx.restore();
}
function drawDetonation(f){
  var bt = f.t, br = 10 + 24 * Math.min(1, bt / 0.12);
  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - bt / 0.8);
  var g = ctx.createRadialGradient(f.tx, f.ty, 1, f.tx, f.ty, br + 6);
  g.addColorStop(0, '#ffe58a'); g.addColorStop(0.5, '#ff7a10'); g.addColorStop(1, 'rgba(255,26,0,0)');
  ctx.fillStyle = g; ctx.shadowColor = COLORS.ember; ctx.shadowBlur = shadowR(16);
  ctx.beginPath(); ctx.arc(f.tx, f.ty, br + 6, 0, 6.2832); ctx.fill();
  // a shock ring racing out
  ctx.strokeStyle = 'rgba(255,220,160,' + (0.8 * Math.max(0, 1 - bt / 0.35)) + ')';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(f.tx, f.ty, br + 10 + bt * 120, (br + 10 + bt * 120) * 0.5, 0, 0, 6.2832); ctx.stroke();
  ctx.restore();
}
// the wall vent, its aim line, and the lance
function drawJet(j){
  var t = G.t, locked = j.state === 'lock', aiming = j.state === 'aim';
  ctx.save();
  // the vent: a notch in the wall that glows as it charges
  var charge = aiming ? j.t / j.aimT : 1;
  ctx.shadowColor = locked ? COLORS.sulfur : '#ff6a10';
  ctx.shadowBlur = shadowR(8 + 18 * charge);
  ctx.fillStyle = '#12040a';
  ctx.beginPath(); ctx.ellipse(j.ox, j.oy, 10, 16, 0, 0, 6.2832); ctx.fill();
  var vg = ctx.createRadialGradient(j.ox, j.oy, 1, j.ox, j.oy, 12);
  vg.addColorStop(0, locked ? '#fff2c0' : rgba(255, 150 + 80*charge, 40, 0.95));
  vg.addColorStop(1, 'rgba(255,60,0,0)');
  ctx.fillStyle = vg;
  ctx.beginPath(); ctx.ellipse(j.ox, j.oy, 9, 14, 0, 0, 6.2832); ctx.fill();
  ctx.shadowBlur = 0;
  if (aiming || locked){
    // the aim line: thin and tracking, then solid and flashing along the fixed vector
    var ex, ey;
    if (locked){ var jd = jetDir(j); ex = j.ox + jd.x * 450; ey = j.oy + jd.y * 450; }
    else { ex = j.tx; ey = j.ty; }
    var flick = locked && Math.floor(j.t * 30) % 2 === 0;
    ctx.globalAlpha = locked ? (flick ? 0.95 : 0.6) : 0.18 + 0.14 * charge;
    ctx.strokeStyle = locked ? COLORS.sulfur : COLORS.bone;
    ctx.lineWidth = locked ? 1.5 : 1;
    if (!locked) ctx.setLineDash([3, 9]);
    ctx.beginPath(); ctx.moveTo(j.ox, j.oy); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    return;
  }
  var L = j.len;
  if (L < 4){ ctx.restore(); return; }
  // the lance, along its vector
  ctx.translate(j.ox, j.oy);
  ctx.rotate(Math.atan2(-Math.sin(j.ang), -j.side * Math.cos(j.ang)));
  ctx.beginPath();
  ctx.moveTo(0, -20);
  var n = 10, i, k, e;
  for (i=0;i<=n;i++){
    k = i/n; e = (FIRE.at(k*80 + j.seed*300, t*70) - 0.5) * 14 * (0.3 + k);
    ctx.lineTo(L * k, -20 * (1 - k*0.55) + e);
  }
  ctx.lineTo(L + 8 + (FIRE.at(t*60, j.seed*500) - 0.5) * 16, 0);
  for (i=n;i>=0;i--){
    k = i/n; e = (FIRE.at(k*80 + j.seed*300 + 400, t*72) - 0.5) * 14 * (0.3 + k);
    ctx.lineTo(L * k, 20 * (1 - k*0.55) + e);
  }
  ctx.closePath();
  ctx.shadowColor = '#ff5a10'; ctx.shadowBlur = shadowR(24);
  var lg = ctx.createLinearGradient(0, 0, L, 0);
  lg.addColorStop(0, 'rgba(255,240,180,.95)');
  lg.addColorStop(0.5, 'rgba(255,110,10,.7)');
  lg.addColorStop(1, 'rgba(255,40,10,0)');
  ctx.fillStyle = lg;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.clip();
  // the fire texture flows from the vent to the tip
  ctx.rotate(Math.PI / 2);
  var sx = Math.floor(j.seed * 60) % 60;
  ctx.drawImage(colFire.canvas, sx, 0, 36, colFire.h, -24, -L - 10, 48, L + 14);
  ctx.restore();
}

// his eyes in the dark, before he appears
function drawWatch(){
  var w = G.watch, k = env(w.t, 0.25, 1.05) ;
  if (w.t > 0.25) k = Math.min(1, (w.dur - w.t) / 0.25);
  var p = G.player;
  ctx.save();
  ctx.globalAlpha = clamp(k, 0, 1);
  [-56, 56].forEach(function(dx){
    var ex = LW/2 + dx + (p.x - LW/2) * 0.06, ey = 118;
    coalEye(ex, ey, 20, 12 * Math.min(1, w.t * 4), 0.7, p);
  });
  ctx.restore();
}
// smoldering coal: near-black, with a dull red ember inside
function coalEye(ex, ey, rx, ry, ember, p){
  ctx.save();
  ctx.fillStyle = '#080203';
  ctx.beginPath(); ctx.ellipse(ex, ey, rx, ry, 0, 0, 6.2832); ctx.fill();
  if (ember > 0.02 && ry > 2){
    var px = p ? clamp((p.x - ex) / LW * 12, -7, 7) : 0;
    var eg = ctx.createRadialGradient(ex + px, ey, 0.5, ex + px, ey, rx * 0.7);
    eg.addColorStop(0, rgba(255, 120 + 100*ember, 40 + 80*ember, 0.95 * ember));
    eg.addColorStop(0.5, rgba(200, 30, 6, 0.6 * ember));
    eg.addColorStop(1, 'rgba(90,8,2,0)');
    ctx.fillStyle = eg;
    ctx.beginPath(); ctx.ellipse(ex, ey, rx, ry, 0, 0, 6.2832); ctx.fill();
  }
  ctx.restore();
}

// a closed smooth curve through points (quadratics through the midpoints)
function skullPath(pts){
  var n = pts.length;
  ctx.beginPath();
  ctx.moveTo((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
  for (var i=1;i<=n;i++){
    var b = pts[i % n], c = pts[(i + 1) % n];
    ctx.quadraticCurveTo(b.x, b.y, (b.x + c.x) / 2, (b.y + c.y) / 2);
  }
  ctx.closePath();
}
// the mouth: irregular, wider than tall, the lower lip fuller, one side wider
// The snarl's opening: it follows the jaw, wider than tall, lopsided, with
// irregular curvature. The gum lines are the same curves the teeth stand on.
// how tall the opening is at u: full in the middle, nothing at the corners
function gumSpan(u){ return Math.pow(Math.max(0, 1 - u * u), 0.58); }
function gumTopAt(my, mh, u){ return my - mh * gumSpan(u) * (0.92 + 0.16 * u) + u * 4 - mh * 0.04; }
function gumBotAt(my, mh, u){ return my + mh * gumSpan(u) * (1.04 - 0.12 * u + 0.18 * Math.max(0, u)) + u * 3 + mh * 0.04; }
function snarlPoints(mx, my, mw, mh){
  var pts = [], N = 15, i, u;
  for (i = 0; i <= N; i++){
    u = -1 + 2 * i / N;
    pts.push({ x: mx + u * mw, y: gumTopAt(my, mh, u) + (FIRE.at(i * 37, 210) - 0.5) * 4 });
  }
  for (i = N - 1; i >= 1; i--){
    u = -1 + 2 * i / N;
    pts.push({ x: mx + u * mw * 0.97, y: gumBotAt(my, mh, u) + (FIRE.at(i * 29 + 80, 310) - 0.5) * 5 });
  }
  return pts;
}
function mouthPoints(mx, my, mw, mh, t){
  var pts = [], n = 14;
  for (var i=0;i<n;i++){
    var th = i / n * 6.2832, c = Math.cos(th), sn = Math.sin(th);
    var rx = mw * (1 + 0.1 * Math.cos(th * 2 + 0.6)) * (c < 0 ? 1.1 : 0.94);
    var ry = mh * (sn > 0 ? 1.18 : 0.82) * (1 + 0.08 * Math.sin(th * 3 + 1.1));
    var wob = (FIRE.at(i * 31 + t * 18, 500 + i * 9) - 0.5) * 7;
    pts.push({ x: mx + c * (rx + wob), y: my + sn * (ry + wob * 0.5) });
  }
  return pts;
}
// Flesh on fire. Coal eyes. Fangs lit from below by his own mouth-fire.
// ---------- his face ----------
// Red muscle over bone: a static fibre texture (rendered once), a broad head
// with a heavy brow and furrow, small eyes burning deep under it, flared
// nostrils, a snarl of long canines over rows of teeth with a fire-lit throat,
// thick ridged horns sweeping out from the temples, and the traps and
// shoulders fading in behind. The head is cached as a sprite keyed on its
// pose; the eyes, the throat's flash, the aura and the beams are drawn live.
var fleshTex = null, fleshPattern = null;
function fleshPatternGet(){
  if (fleshPattern) return fleshPattern;
  var W = 160, H = 192, c = document.createElement('canvas'); c.width = W; c.height = H;
  var cx = c.getContext('2d'), img = cx.createImageData(W, H), d = img.data, i = 0;
  for (var y=0;y<H;y++) for (var x=0;x<W;x++){
    // fibres: the field stretched along y; a coarser mottle over it; wet specks
    var f = FIRE.at(x * 1.5, y * 0.35) * 0.55 + FIRE.at(x * 3.4 + 90, y * 0.8 + 40) * 0.3 + FIRE.at(x * 0.5 + 300, y * 0.5) * 0.15;
    var v = Math.pow(clamp((f - 0.3) / 0.48, 0, 1), 1.4) * 0.62 + 0.06;
    var r = 22 + 132 * v, g = 3 + 24 * v * v, b = 3 + 16 * v * v;
    var spec = FIRE.at(x * 5 + 700, y * 5 + 200);
    if (spec > 0.78 && v > 0.55){ var k = (spec - 0.78) / 0.22; r += 70 * k; g += 60 * k; b += 55 * k; }
    d[i] = Math.min(255, r); d[i+1] = Math.min(255, g); d[i+2] = Math.min(255, b); d[i+3] = 255; i += 4;
  }
  cx.putImageData(img, 0, 0);
  fleshTex = c; fleshPattern = ctx.createPattern(c, 'repeat');
  return fleshPattern;
}
// the head's outline: broad at the brow and cheekbones, a heavy squared jaw,
// a short chin. Skewed toward the heart by sk.
function headPoints(cx, cy, w, h, sk){
  // widest across the brow and the cheekbones, then the jaw pulls in hard:
  // a wedge, not a dome. The chin is narrow.
  var P = [
    [-0.52, -0.40], [-0.44, -0.70], [-0.18, -0.88], [0.18, -0.88], [0.44, -0.70], [0.52, -0.40],
    [0.60, -0.20], [0.58, 0.04],                       // the brow's outer corner and the temple
    [0.44, 0.26], [0.28, 0.52], [0.13, 0.72], [0, 0.78],   // the jaw, narrowing
    [-0.13, 0.72], [-0.28, 0.52], [-0.44, 0.26],
    [-0.58, 0.04], [-0.60, -0.20]
  ];
  return P.map(function(q){ return { x: cx + q[0] * w + (q[1] > 0 ? sk * 0.3 * (1 + q[1]) : sk * 0.15), y: cy + q[1] * h }; });
}
// a horn: a ribbon along a curved spine, thick at the root and tapering,
// ridged with rings, flesh at the base darkening to charcoal at the tip
function drawHorn(cx, cy, w, h, dir, sk){
  var J = [
    // rooted at the temple, out over the cheekbone, hooking down and back in
    // (he sways ±58 px in a 420 px arena; anything wider than this leaves the frame)
    { x: cx + dir * w * 0.30 + sk * 0.15, y: cy - h * 0.50 },
    { x: cx + dir * w * 0.50 + sk * 0.1, y: cy - h * 0.74 },
    { x: cx + dir * w * 0.63, y: cy - h * 0.50 },
    { x: cx + dir * w * 0.65, y: cy - h * 0.10 },
    { x: cx + dir * w * 0.54, y: cy + h * 0.24 }
  ];
  var n = 26, pts = [], left = [], right = [];
  for (var k=0;k<=n;k++) pts.push(spline(J, k/n));
  for (k=0;k<=n;k++){
    var u = k/n, a = pts[Math.max(0, k-1)], b = pts[Math.min(n, k+1)];
    var tx = b.x - a.x, ty = b.y - a.y, tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    var r = lerp(30, 4, Math.pow(u, 0.75)) * (1 + 0.06 * Math.sin(u * 40));   // the rings swell the outline a little
    left.push({ x: pts[k].x + ty * r, y: pts[k].y - tx * r });
    right.push({ x: pts[k].x - ty * r, y: pts[k].y + tx * r });
  }
  ctx.beginPath();
  ctx.moveTo(left[0].x, left[0].y);
  for (k=1;k<=n;k++) ctx.lineTo(left[k].x, left[k].y);
  for (k=n;k>=0;k--) ctx.lineTo(right[k].x, right[k].y);
  ctx.closePath();
  var hg = ctx.createLinearGradient(J[0].x, J[0].y, J[4].x, J[4].y);
  hg.addColorStop(0, 'rgb(176,44,24)'); hg.addColorStop(0.3, 'rgb(130,30,16)'); hg.addColorStop(0.7, 'rgb(64,16,10)'); hg.addColorStop(1, 'rgb(22,6,5)');
  ctx.fillStyle = hg; ctx.fill();
  ctx.save(); ctx.clip();
  // the rings: dark grooves with a lit edge, closer together toward the tip
  for (var u2 = 0.06; u2 < 0.96; u2 += 0.05 + 0.03 * (1 - u2)){
    var kk = Math.round(u2 * n), L = left[kk], R = right[kk], c = pts[kk];
    var nxt = pts[Math.min(n, kk + 1)];
    ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(L.x, L.y); ctx.quadraticCurveTo(c.x + (nxt.x - c.x) * 1.5, c.y + (nxt.y - c.y) * 1.5, R.x, R.y); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,160,120,.16)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(L.x + (c.x - nxt.x) * 0.6, L.y + (c.y - nxt.y) * 0.6); ctx.quadraticCurveTo(c.x + (nxt.x - c.x) * 0.9, c.y + (nxt.y - c.y) * 0.9, R.x + (c.x - nxt.x) * 0.6, R.y + (c.y - nxt.y) * 0.6); ctx.stroke();
  }
  // lit from the arena below: warm on the inner/lower edge, dark above
  var lg = ctx.createLinearGradient(0, cy - h * 0.7, 0, cy + h * 0.35);
  lg.addColorStop(0, 'rgba(0,0,0,.3)'); lg.addColorStop(0.55, 'rgba(0,0,0,0)'); lg.addColorStop(1, 'rgba(255,120,50,.34)');
  ctx.fillStyle = lg; ctx.fillRect(cx - w, cy - h, w * 2, h * 1.2);
  ctx.restore();
  // a wet gloss along the outer curve
  ctx.strokeStyle = 'rgba(255,200,180,.28)'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(left[3].x, left[3].y); for (k=4;k<=n-6;k++) ctx.lineTo(lerp(left[k].x, pts[k].x, 0.2), lerp(left[k].y, pts[k].y, 0.2)); ctx.stroke();
}
// the head, in world space, for a given pose. Everything static for a pose.
function drawHeadBody(cx, cy, w, h, sk, mouth, turn){
  var head = headPoints(cx, cy, w, h, sk);
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // --- the traps and shoulders behind, fading downward into the dark
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.28, cy + h * 0.50);
  ctx.bezierCurveTo(cx - w * 0.6, cy + h * 0.58, cx - w * 0.95, cy + h * 0.9, cx - w * 1.1, cy + h * 1.3);
  ctx.lineTo(cx + w * 1.1, cy + h * 1.3);
  ctx.bezierCurveTo(cx + w * 0.95, cy + h * 0.9, cx + w * 0.6, cy + h * 0.58, cx + w * 0.28, cy + h * 0.50);
  ctx.closePath();
  ctx.clip();
  ctx.save(); ctx.translate(cx, cy); ctx.fillStyle = fleshPatternGet(); ctx.fillRect(-w * 1.4, -h, w * 2.8, h * 2.6); ctx.restore();
  // the neck's strap muscles, and the whole thing sinking into black
  ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 8;
  [-0.16, 0.16].forEach(function(o){ ctx.beginPath(); ctx.moveTo(cx + o * w, cy + h * 0.6); ctx.quadraticCurveTo(cx + o * w * 1.5, cy + h * 0.95, cx + o * w * 2.6, cy + h * 1.3); ctx.stroke(); });
  var sg2 = ctx.createLinearGradient(0, cy + h * 0.5, 0, cy + h * 1.25);
  sg2.addColorStop(0, 'rgba(0,0,0,.62)'); sg2.addColorStop(0.4, 'rgba(0,0,0,.78)'); sg2.addColorStop(1, 'rgba(5,1,4,1)');
  ctx.fillStyle = sg2; ctx.fillRect(cx - w * 1.4, cy + h * 0.5, w * 2.8, h);
  // and a lit crest where the fire below catches the top of each shoulder
  [-1, 1].forEach(function(dir){
    var cg2 = ctx.createRadialGradient(cx + dir * w * 0.75, cy + h * 0.82, 4, cx + dir * w * 0.75, cy + h * 0.82, w * 0.4);
    cg2.addColorStop(0, 'rgba(255,110,50,.22)'); cg2.addColorStop(1, 'rgba(255,110,50,0)');
    ctx.fillStyle = cg2; ctx.fillRect(cx + dir * w * 0.75 - w * 0.4, cy + h * 0.4, w * 0.8, h * 0.9);
  });
  ctx.restore();
  // --- horns, behind the head
  drawHorn(cx, cy, w * (1 - 0.28 * turn), h, -1, sk);
  drawHorn(cx, cy, w * (1 - 0.28 * turn), h, 1, sk);
  // --- the head: muscle fibre, then its planes
  ctx.save();
  skullPath(head);
  ctx.fillStyle = '#3a0a04'; ctx.fill();
  ctx.clip();
  ctx.save(); ctx.translate(cx + sk * 0.2, cy); ctx.fillStyle = fleshPatternGet(); ctx.fillRect(-w, -h, w * 2, h * 2); ctx.restore();
  var vg = ctx.createRadialGradient(cx + sk * 0.4, cy + h * 0.25, w * 0.1, cx + sk * 0.2, cy, w * 0.62);
  vg.addColorStop(0, 'rgba(255,120,60,.14)'); vg.addColorStop(0.55, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.6)');
  ctx.fillStyle = vg; ctx.fillRect(cx - w, cy - h, w * 2, h * 2);
  // ---- the brow: a shelf that overhangs. It is lit along its crest, and the
  // shadow it throws falls straight down into the sockets beneath it.
  var browY = cy - h * 0.26;
  function browEdge(u){                 // u: -1..1 across the face
    return browY - 16 * (1 - u * u * 0.55) + Math.abs(u) * 10;
  }
  ctx.save();
  // the shadow first, cast down from under the shelf
  var shd = ctx.createLinearGradient(0, browY - 2, 0, browY + h * 0.34);
  shd.addColorStop(0, 'rgba(0,0,0,.92)'); shd.addColorStop(0.35, 'rgba(0,0,0,.6)'); shd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = shd;
  ctx.beginPath();
  ctx.moveTo(cx - w * 0.56 + sk * 0.3, browEdge(-1));
  ctx.quadraticCurveTo(cx - w * 0.3 + sk * 0.4, browEdge(-0.5) + 6, cx + sk * 0.5, browEdge(0) + 10);
  ctx.quadraticCurveTo(cx + w * 0.3 + sk * 0.4, browEdge(0.5) + 6, cx + w * 0.56 + sk * 0.3, browEdge(1));
  ctx.lineTo(cx + w * 0.56 + sk * 0.3, browY + h * 0.34);
  ctx.lineTo(cx - w * 0.56 + sk * 0.3, browY + h * 0.34);
  ctx.closePath(); ctx.fill();
  // the ridge itself: two swellings meeting over the nose, filled, not stroked
  [-1, 1].forEach(function(dir){
    var x0 = cx + dir * w * 0.54 + sk * 0.28, x1 = cx + dir * w * 0.06 + sk * 0.5;
    ctx.beginPath();
    ctx.moveTo(x0, browEdge(dir) + 4);
    ctx.bezierCurveTo(cx + dir * w * 0.4 + sk * 0.3, browY - 34, cx + dir * w * 0.2 + sk * 0.45, browY - 32, x1, browY - 20);
    ctx.bezierCurveTo(cx + dir * w * 0.2 + sk * 0.45, browY - 8, cx + dir * w * 0.36 + sk * 0.35, browY + 4, x0, browEdge(dir) + 6);
    ctx.closePath();
    var brg = ctx.createLinearGradient(0, browY - 34, 0, browY + 8);
    brg.addColorStop(0, 'rgb(128,30,16)'); brg.addColorStop(0.45, 'rgb(86,18,10)'); brg.addColorStop(1, 'rgb(24,5,4)');
    ctx.fillStyle = brg; ctx.fill();
    // the crest catches what light there is
    ctx.strokeStyle = 'rgba(255,175,125,.35)'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0 - dir * 6, browEdge(dir) + 2);
    ctx.bezierCurveTo(cx + dir * w * 0.4 + sk * 0.3, browY - 31, cx + dir * w * 0.22 + sk * 0.45, browY - 29, x1, browY - 18);
    ctx.stroke();
  });
  // the furrow: a deep notch between the brows with two creases climbing out
  ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx + sk * 0.5 - 3, browY - 30); ctx.quadraticCurveTo(cx + sk * 0.5, browY - 14, cx + sk * 0.52 - 2, browY + 2); ctx.stroke();
  ctx.lineWidth = 3;
  [-1, 1].forEach(function(dir){
    ctx.beginPath();
    ctx.moveTo(cx + sk * 0.5 + dir * 7, browY - 24);
    ctx.quadraticCurveTo(cx + sk * 0.5 + dir * 13, browY - 38, cx + sk * 0.5 + dir * 26, browY - 44);
    ctx.stroke();
  });
  ctx.restore();
  // the temples fall away behind the brow's corners
  [-1, 1].forEach(function(dir){
    var tgx = ctx.createRadialGradient(cx + dir * w * 0.56, cy - h * 0.40, w * 0.04, cx + dir * w * 0.56, cy - h * 0.40, w * 0.46);
    tgx.addColorStop(0, 'rgba(0,0,0,.72)'); tgx.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = tgx; ctx.fillRect(cx - w, cy - h, w * 2, h);
  });
  // ---- cheekbones: a lit wedge with a hollow under it, and the jaw pulling in
  [-1, 1].forEach(function(dir){
    var chx = cx + dir * w * 0.34 + sk * 0.35, chy = cy + h * 0.02;
    ctx.save();
    ctx.beginPath();                       // the bone: a wedge from the temple to the muzzle
    ctx.moveTo(cx + dir * w * 0.54 + sk * 0.3, cy - h * 0.12);
    ctx.quadraticCurveTo(chx + dir * w * 0.06, chy - h * 0.02, cx + dir * w * 0.12 + sk * 0.5, cy + h * 0.14);
    ctx.quadraticCurveTo(chx, chy + h * 0.10, cx + dir * w * 0.5 + sk * 0.3, cy + h * 0.02);
    ctx.closePath();
    var cgg = ctx.createLinearGradient(0, cy - h * 0.12, 0, cy + h * 0.16);
    cgg.addColorStop(0, 'rgba(255,170,110,.06)'); cgg.addColorStop(0.5, 'rgba(255,160,100,.26)'); cgg.addColorStop(1, 'rgba(255,150,90,.04)');
    ctx.fillStyle = cgg; ctx.fill();
    ctx.restore();
    // the hollow beneath it
    var hol = ctx.createRadialGradient(chx - dir * w * 0.02, cy + h * 0.26, w * 0.02, chx - dir * w * 0.02, cy + h * 0.26, w * 0.26);
    hol.addColorStop(0, 'rgba(0,0,0,.6)'); hol.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = hol; ctx.fillRect(cx - w, cy, w * 2, h * 0.7);
    // the jaw's side, falling away as it narrows toward the chin
    var jg = ctx.createLinearGradient(cx + dir * w * 0.5, 0, cx + dir * w * 0.1, 0);
    jg.addColorStop(0, 'rgba(6,1,1,.8)'); jg.addColorStop(1, 'rgba(6,1,1,0)');
    ctx.fillStyle = jg; ctx.fillRect(Math.min(cx, cx + dir * w * 0.6), cy + h * 0.1, w * 0.6, h * 0.8);
  });
  // ---- the muzzle: narrow, coming forward between the cheek hollows
  var muz = ctx.createRadialGradient(cx + sk * 0.6, cy + h * 0.30, w * 0.03, cx + sk * 0.6, cy + h * 0.30, w * 0.26);
  muz.addColorStop(0, 'rgba(255,150,100,.22)'); muz.addColorStop(0.6, 'rgba(255,120,70,.05)'); muz.addColorStop(1, 'rgba(0,0,0,.4)');
  ctx.fillStyle = muz; ctx.fillRect(cx - w * 0.5, cy, w, h * 0.8);
  ctx.lineCap = 'round';
  [-1, 1].forEach(function(dir){   // the fold running down past the mouth's corner
    ctx.strokeStyle = 'rgba(0,0,0,.32)'; ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx + sk * 0.6 + dir * w * 0.10, cy + h * 0.31);
    ctx.quadraticCurveTo(cx + sk * 0.6 + dir * w * 0.20, cy + h * 0.44, cx + sk * 0.6 + dir * w * 0.22, cy + h * 0.60);
    ctx.stroke();
  });
  // ---- the nostrils: two narrow slits, high and close, angled in toward
  // each other. Nothing rounded — a round nostril is a snout.
  var nx = cx + sk * 0.6, ny = cy + h * 0.20;
  [-1, 1].forEach(function(dir){
    ctx.save();
    ctx.translate(nx + dir * 6, ny);
    ctx.rotate(dir * 0.26);
    ctx.fillStyle = '#080101';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.quadraticCurveTo(2.2, -2, 1.4, 6);
    ctx.quadraticCurveTo(0, 8.5, -1.4, 6);
    ctx.quadraticCurveTo(-2.2, -2, 0, -7);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,150,110,.18)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-2.2, -4); ctx.quadraticCurveTo(-3, 1, -2, 5.5); ctx.stroke();
    ctx.restore();
  });
  // under the chin, and the throat's light on the chin
  var ug = ctx.createLinearGradient(0, cy + h*0.55, 0, cy + h*0.84);
  ug.addColorStop(0, 'rgba(10,2,2,0)'); ug.addColorStop(1, 'rgba(10,2,2,.7)');
  ctx.fillStyle = ug; ctx.fillRect(cx - w, cy + h*0.55, w*2, h*0.3);
  ctx.restore();
  // the outline: a dark edge so the head separates from the horns and the dark
  skullPath(head); ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 2; ctx.stroke();
  // --- the mouth: the opening follows the jaw, wider than tall and lopsided.
  // The teeth stand in gum lines that follow that curve, hanging straight down
  // from above and straight up from below, and they silhouette black against
  // the throat's light.
  var mw = 66 + 8 * mouth, mh = 12 + 34 * mouth, mx = cx + sk, my = cy + h * 0.46 + mh * 0.4;
  function gumTop(u){ return gumTopAt(my, mh, u); }
  function gumBot(u){ return gumBotAt(my, mh, u); }
  var mpts = snarlPoints(mx, my, mw, mh);
  // the lip around it, swollen and wet
  ctx.save();
  skullPath(mpts);
  ctx.lineWidth = 11; ctx.strokeStyle = 'rgb(62,9,9)'; ctx.stroke();
  ctx.lineWidth = 4.5; ctx.strokeStyle = 'rgba(190,56,46,.4)'; ctx.stroke();
  ctx.restore();
  // the throat behind everything
  ctx.save();
  skullPath(mpts);
  ctx.fillStyle = '#100202'; ctx.fill();
  ctx.clip();
  var tg = ctx.createRadialGradient(mx, my + mh * 0.45, 2, mx, my + mh * 0.1, mw * 1.05);
  tg.addColorStop(0, 'rgba(255,205,120,.92)'); tg.addColorStop(0.28, 'rgba(232,84,20,.88)'); tg.addColorStop(0.68, 'rgba(92,15,6,.95)'); tg.addColorStop(1, 'rgba(10,2,2,1)');
  ctx.fillStyle = tg; ctx.fillRect(mx - mw*1.2, my - mh*1.2, mw*2.4, mh*2.4);
  var gg = ctx.createLinearGradient(0, my - mh, 0, my - mh * 0.3);
  gg.addColorStop(0, 'rgb(104,18,26)'); gg.addColorStop(1, 'rgba(104,18,26,0)');
  ctx.fillStyle = gg; ctx.fillRect(mx - mw * 1.2, my - mh * 1.2, mw * 2.4, mh * 0.9);
  // ---- the teeth, inside the opening, as black silhouettes
  // [u along the jaw, length, half-width, tilt, state] state: 0 whole, 1 broken, 2 crooked
  // [u, length as a share of the opening's height there, half-width, tilt, state]
  var UPPER = [[-0.70, 0.38, 0.045, 0.03, 0], [-0.50, 0.62, 0.058, 0.04, 0], [-0.30, 0.34, 0.044, 0, 2],
               [-0.11, 0.30, 0.040, 0, 1], [0.09, 0.33, 0.042, 0, 0], [0.29, 0.36, 0.044, -0.01, 0],
               [0.49, 0.66, 0.058, -0.04, 0], [0.70, 0.36, 0.045, -0.03, 0]];
  var LOWER = [[-0.58, 0.30, 0.044, -0.02, 0], [-0.36, 0.48, 0.052, -0.02, 2], [-0.14, 0.26, 0.038, 0, 1],
               [0.08, 0.28, 0.040, 0, 0], [0.30, 0.46, 0.052, 0.02, 0], [0.54, 0.28, 0.042, 0.03, 0]];
  function silhouetteTooth(u, len, halfW, tilt, state, up){
    var dir = up ? 1 : -1;
    var bx = mx + u * mw * 0.93, by = up ? gumTop(u) + 1 : gumBot(u) - 1;
    // never longer than the gap it hangs into, so the rows never meet
    var open = Math.max(6, gumBot(u) - gumTop(u));
    var L = len * open;
    if (state === 1) L *= 0.5;                         // broken off short
    var hw = halfW * mw, tipx = bx + tilt * mw * (state === 2 ? 2.4 : 1);
    ctx.beginPath();
    ctx.moveTo(bx - hw, by);
    ctx.bezierCurveTo(bx - hw * 0.92, by + dir * L * 0.45, tipx - hw * 0.34, by + dir * L * 0.8, tipx, by + dir * L);
    if (state === 1){                                   // a flat, jagged break
      ctx.lineTo(tipx + hw * 0.5, by + dir * L * 0.88);
      ctx.lineTo(tipx + hw * 0.2, by + dir * L * 0.97);
    }
    ctx.bezierCurveTo(tipx + hw * 0.4, by + dir * L * 0.76, bx + hw * 0.95, by + dir * L * 0.42, bx + hw, by);
    ctx.closePath();
    ctx.fillStyle = '#0a0202';
    ctx.fill();
    // the thinnest warm edge, so it does not read as a hole
    ctx.strokeStyle = 'rgba(255,150,60,.35)'; ctx.lineWidth = 0.9; ctx.stroke();
  }
  UPPER.forEach(function(tt){ silhouetteTooth(tt[0], tt[1], tt[2], tt[3], tt[4], true); });
  LOWER.forEach(function(tt){ silhouetteTooth(tt[0], tt[1], tt[2], tt[3], tt[4], false); });
  ctx.restore();
  ctx.restore();
}
// the head sprite: the whole head for a pose, re-rendered when the pose steps
var headCache = { canvas: document.createElement('canvas'), key: '', S: 0 };
var HEAD_PAD = 1.5;   // in units of w/h either side of the centre
function headSprite(d, cx, cy, w, h, sk, mouth, turn){
  var S = cvs.width / LW, HW = d.w * HEAD_PAD, HH = d.h * HEAD_PAD;
  var key = [Math.round(sk / 4), Math.round(mouth * 12), Math.round(turn * 8), Math.round(w), S].join('|');
  var c = headCache;
  if (c.key !== key){
    c.key = key;
    if (c.S !== S){ c.canvas.width = Math.ceil(HW * 2 * S); c.canvas.height = Math.ceil(HH * 2 * S); c.S = S; }
    var cx2 = c.canvas.getContext('2d');
    cx2.setTransform(1, 0, 0, 1, 0, 0); cx2.clearRect(0, 0, c.canvas.width, c.canvas.height);
    cx2.setTransform(S, 0, 0, S, HW * S, HH * S);
    var saved = ctx; ctx = cx2;
    drawHeadBody(0, 0, w, h, Math.round(sk / 4) * 4, Math.round(mouth * 12) / 12, Math.round(turn * 8) / 8);
    ctx = saved;
  }
  return c.canvas;
}
function drawDevil(d){
  if (d.dead || d.state === 'wait') return;
  var p = G.player;
  var turn = d.turn || 0;
  var cx = d.x + turn * 30, cy = d.y - d.kick * 26, w = d.w * (1 - 0.28 * turn), h = d.h;
  var dieK = d.dying ? clamp(d.dieT / FREE.dead, 0, 1) : 0;
  if (d.dying){ cx += rnd(-1,1) * 6 * dieK; cy += rnd(-1,1) * 4 * dieK + dieK * dieK * 70; }   // shaking, and sinking into the pit
  var sk = clamp((p.x - cx) / LW, -1, 1) * 26 + turn * 40;      // watching you
  var mouth = d.mouth || 0, glow = d.mouthGlow || 0;
  ctx.save();
  ctx.globalAlpha = 1 - dieK * 0.85;

  // aura: throbs with the heartbeat
  var g = ctx.createRadialGradient(cx, cy, 12, cx, cy, w*0.95);
  g.addColorStop(0, 'rgba(255,60,0,' + (0.16 + 0.16 * G.heart.pulse) + ')');
  g.addColorStop(1, 'rgba(255,42,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(cx - w, cy - h, w*2, h*2.3);

  // the head, for this pose
  var HW = d.w * HEAD_PAD, HH = d.h * HEAD_PAD;
  ctx.drawImage(headSprite(d, cx, cy, w, h, sk, mouth, turn), cx - HW, cy - HH, HW * 2, HH * 2);

  // --- eyes: small, burning, deep under the brow. Shut: a dull ember in a
  //     narrowed slit. Open: wide, white-hot core, a glow thrown on the brow.
  d.eyes.forEach(function(e){
    var ex = cx + e.dx * (1 - 0.28*turn) + sk*0.6, ey = cy + 4;
    var srx = 30, sry = 17;
    // the socket: shadow under the brow shelf
    var sg = ctx.createRadialGradient(ex, ey, 2, ex, ey, srx * 1.4);
    sg.addColorStop(0, 'rgba(0,0,0,.95)'); sg.addColorStop(0.45, 'rgba(0,0,0,.8)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.ellipse(ex, ey, srx * 1.4, sry * 1.6, 0, 0, 6.2832); ctx.fill();
    if (e.dead){
      ctx.fillStyle = '#050101';
      ctx.beginPath(); ctx.ellipse(ex, ey, 12, 7, 0, 0, 6.2832); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.9)'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(ex - 12, ey - 5); ctx.lineTo(ex + 12, ey + 6); ctx.moveTo(ex - 12, ey + 6); ctx.lineTo(ex + 12, ey - 5); ctx.stroke();
      return;
    }
    var wide = 1 + 0.3 * e.wide;
    var ember = e.flash > 0 ? 1 : e.ember;
    var ry = e.open ? 11 * wide : (e.charge > 0 || e.beam > 0 ? 7 : 3.4), rx = e.open ? 16 * wide : 13;
    // the glow it throws, red, on the brow and cheek
    drawGlow(ex, ey, 36 + 30 * ember, [255, 40, 10], (0.35 + 0.65 * ember) * (e.open ? 1.3 : 1), 120 + 60 * ember, 80 + 40 * ember);
    // the eye: a narrowed slit, angled in toward the furrow
    ctx.save();
    ctx.translate(ex, ey); ctx.rotate(e.dx < 0 ? 0.16 : -0.16);
    ctx.fillStyle = '#080101';
    ctx.beginPath(); ctx.ellipse(0, 0, rx + 1.5, ry + 1.5, 0, 0, 6.2832); ctx.fill();
    var px = p ? clamp((p.x - ex) / LW * 6, -4, 4) : 0;
    var eg = ctx.createRadialGradient(px, 0, 0.5, px, 0, rx);
    eg.addColorStop(0, rgba(255, 150 + 60 * ember, 70 + 60 * ember, 1));
    eg.addColorStop(0.4, rgba(255, 30 + 40 * ember, 6, 0.95));
    eg.addColorStop(1, rgba(120, 8, 2, 0.6));
    ctx.fillStyle = eg;
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, 6.2832); ctx.fill();
    if (e.open){
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.ellipse(px, 0, 2.2, ry * 0.8, 0, 0, 6.2832); ctx.fill();
    }
    ctx.restore();
    if (e.open){
      ctx.save();
      ctx.globalAlpha = 0.5 + 0.4 * Math.sin(G.t * 12);
      ctx.strokeStyle = COLORS.sulfur; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(ex, ey, srx + 3, sry + 5, 0, 0, 6.2832); ctx.stroke();
      ctx.restore();
    }
  });

  // the throat's light: the mouth-fire, the white flash before a volley
  var mw = 66 + 8 * mouth, mh = 12 + 34 * mouth, mx = cx + sk, my = cy + h * 0.46 + mh * 0.4;
  drawGlow(mx, my, 32, [255, 138, 32], (0.3 + 0.5 * mouth) + 0.8 * glow, mw * 2.2 + 60 * glow, mh * 2.4 + 60 * glow);
  if (mouth > 0.2 || glow > 0){
    ctx.save();
    skullPath(snarlPoints(mx, my, mw, mh));
    ctx.clip();
    ctx.globalAlpha = 0.4 * mouth;
    ctx.drawImage(colFire.canvas, 20, 30, 50, 100, mx - mw*1.1, my - mh*1.1, mw*2.2, mh*2.2);
    ctx.globalAlpha = 1;
    if (glow > 0){ ctx.fillStyle = 'rgba(255,250,235,' + (0.95 * glow) + ')'; ctx.fillRect(mx - mw*1.2, my - mh*1.2, mw*2.4, mh*2.4); }
    ctx.restore();
  }
  // the held heart underlights the fangs and the jaw
  if (G.taken && G.taken.grabbed && G.mode === 'ending'){
    var hl = G.heart.light * (G.taken.glow == null ? 1 : G.taken.glow), hp = G.player;
    if (hl > 0.02){
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var hg2 = ctx.createRadialGradient(hp.x, hp.y, 4, hp.x, hp.y, 150);
      hg2.addColorStop(0, col('heart', 0.5 * hl)); hg2.addColorStop(1, col('heart', 0));
      ctx.fillStyle = hg2; ctx.fillRect(hp.x - 150, hp.y - 150, 300, 150);
      ctx.restore();
    }
  }

  // cracks as he dies: the fire inside him showing through
  if (dieK > 0.15){
    var ca = Math.min(1, dieK * 1.4);
    ctx.beginPath();
    var seeds = [[-40,-60,-90,60],[30,-70,80,70],[0,-20,-30,110],[-70,0,60,10]];
    seeds.forEach(function(s, si){
      var n = 5;
      ctx.moveTo(cx + s[0], cy + s[1]);
      for (var k=1;k<=n;k++){
        var kk = k/n * Math.min(1, dieK * 1.6);
        ctx.lineTo(cx + s[0] + (s[2]-s[0])*kk + Math.sin(si * 7 + k * 13) * 14, cy + s[1] + (s[3]-s[1])*kk);
      }
    });
    ctx.strokeStyle = 'rgba(255,80,10,' + (0.6 * ca) + ')'; ctx.lineWidth = 7; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,236,170,' + ca + ')'; ctx.lineWidth = 2.2; ctx.stroke();
  }
  ctx.restore();

  // beams
  d.eyes.forEach(function(e){
    if (e.dead) return;
    var ex = cx + e.dx + sk*0.6, ey = cy + 4;
    if (e.charge > 0 && e.charge < 1.0){
      ctx.save();
      ctx.globalAlpha = 0.5 + 0.4*Math.sin(G.t*22);
      ctx.strokeStyle = COLORS.sulfur;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4,6]);
      ctx.beginPath();
      ctx.moveTo(ex, ey); ctx.lineTo(e.lockX, LH);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    } else if (e.beam > 0 && e.beam < 0.75){
      var fade = e.beam > 0.55 ? (0.75 - e.beam)/0.2 : 1;
      ctx.save();
      ctx.globalAlpha = fade;
      var bg = ctx.createLinearGradient(0, ey, 0, LH);
      bg.addColorStop(0, 'rgba(255,255,255,.95)');
      bg.addColorStop(0.3, 'rgba(255,195,33,.8)');
      bg.addColorStop(1, 'rgba(255,42,0,.35)');
      ctx.fillStyle = bg;
      ctx.shadowColor = COLORS.sulfur;
      ctx.shadowBlur = shadowR(24);
      ctx.beginPath();
      ctx.moveTo(ex - 8, ey);
      ctx.lineTo(ex + 8, ey);
      ctx.lineTo(e.lockX + 16, LH);
      ctx.lineTo(e.lockX - 16, LH);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  });
}

// the heart: cyan glass with a white core, faceted like a cut stone
// ---------- the heart: a living soul ----------
// o: {alpha, pulse, lit, dmg, light, fire, scars, burnK, sx, sy, rot, veins, breath, leak}
// dmg drains the colour and gutters the glow; scars are what has been done to
// it: 'crack' from a pitchfork, 'char' from fire. They never heal.
function drawGem(x, y, s, o){
  o = o || {};
  var dmg = o.dmg || 0, light = o.light == null ? 1 : o.light, pulse = o.pulse || 0, scars = o.scars || [];
  var heal = o.heal || 0;
  if (heal > 0.5) dmg = 0;                                              // healed: the colour comes back
  var H = RGB.heart, grey = [143, 160, 176], k = dmg >= 2 ? 0.6 : (dmg === 1 ? 0.2 : 0);
  var core = [lerp(H[0], grey[0], k), lerp(H[1], grey[1], k), lerp(H[2], grey[2], k)];
  if (heal){ var gr = RGB.grace; core = [lerp(core[0], gr[0], 0.55 * heal), lerp(core[1], gr[1], 0.55 * heal), lerp(core[2], gr[2], 0.55 * heal)]; }
  if (o.burnK){ core = [lerp(core[0], 255, o.burnK), lerp(core[1], 150, o.burnK), lerp(core[2], 40, o.burnK)]; }
  var gutter = dmg >= 2 ? 0.35 + 0.65 * FIRE.at(G.t * 95, 17) : 1;
  var breath = o.breath == null ? 1 : o.breath;                        // the slower cycle
  var glow = light * gutter * (dmg === 1 ? 0.7 : 1) * breath;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(o.rot || 0);
  ctx.scale(o.sx || 1, o.sy || 1);
  ctx.globalAlpha = (o.alpha == null ? 1 : o.alpha) * (0.75 + 0.25 * glow);
  drawGlow(0, 0, s * (2.0 + 0.9 * pulse), core, 0.9 * glow);
  var g = ctx.createRadialGradient(-s*0.25, -s*0.35, 1, 0, 0, s * (1.15 + 0.3 * breath));
  g.addColorStop(0, dmg >= 2 ? '#dfe8ee' : '#ffffff');
  g.addColorStop(0.32, rgba(core[0], core[1], core[2], 1));
  g.addColorStop(1, rgba(core[0], core[1], core[2], 0.55));
  ctx.fillStyle = g;
  heartPath(0, 0, s);
  ctx.fill();
  ctx.shadowBlur = 0;
  if (o.lit > 0){
    var wg = ctx.createLinearGradient(0, -s * 0.4, 0, s * 0.8);
    wg.addColorStop(0, col('sulfur', 0));
    wg.addColorStop(1, col('sulfur', 0.65 * o.lit));
    ctx.fillStyle = wg;
    heartPath(0, 0, s); ctx.fill();
  }
  if (o.fire && o.fire.k > 0.02){
    var rx = o.fire.dx * s * 1.1, ry = o.fire.dy * s * 1.1;
    var fgr = ctx.createRadialGradient(rx, ry, 1, rx, ry, s * 1.5);
    fgr.addColorStop(0, 'rgba(255,170,60,' + (0.7 * o.fire.k) + ')');
    fgr.addColorStop(1, 'rgba(255,90,20,0)');
    ctx.fillStyle = fgr;
    heartPath(0, 0, s); ctx.fill();
  }
  // under the surface
  ctx.save();
  heartPath(0, 0, s);
  ctx.clip();
  if (o.veins){
    // veins run out from the centre; each beat brightens them outward
    var veins = [[0.0,-0.1, -0.5,-0.7, -0.95,-0.35], [0.0,-0.1, 0.5,-0.7, 0.95,-0.35], [0.0,0.0, -0.35,0.25, -0.6,0.5],
                 [0.0,0.0, 0.35,0.25, 0.6,0.5], [0.0,0.0, 0.05,0.4, 0.0,0.75], [0.0,-0.2, -0.15,-0.55, -0.4,-1.0], [0.0,-0.2, 0.2,-0.5, 0.45,-1.0]];
    var wave = o.veinWave == null ? 0 : o.veinWave;   // 0..1: how far the beat has travelled outward
    ctx.lineCap = 'round';
    veins.forEach(function(v){
      for (var seg=0; seg<3; seg++){
        var u0 = seg/3, u1 = (seg+1)/3;
        var bright = Math.max(0, 1 - Math.abs(wave - (u0 + 0.17)) * 3.2);
        ctx.strokeStyle = rgba(core[0], core[1], core[2], 0.18 + 0.6 * bright * glow);
        ctx.lineWidth = Math.max(0.5, s * (0.075 - 0.02 * seg));
        var ax = bez(v[0], v[2], v[4], u0), ay = bez(v[1], v[3], v[5], u0), bx = bez(v[0], v[2], v[4], u1), by = bez(v[1], v[3], v[5], u1);
        var mx = bez(v[0], v[2], v[4], (u0+u1)/2), my = bez(v[1], v[3], v[5], (u0+u1)/2);
        ctx.beginPath(); ctx.moveTo(ax*s, ay*s); ctx.quadraticCurveTo(mx*s*1.02, my*s*1.02, bx*s, by*s); ctx.stroke();
      }
    });
  }
  // facets
  ctx.strokeStyle = 'rgba(255,255,255,.55)';
  ctx.lineWidth = Math.max(0.6, s * 0.07);
  ctx.beginPath();
  ctx.moveTo(0, -s*0.5); ctx.lineTo(0, s*0.75);
  ctx.moveTo(-s*1.1, -s*0.15); ctx.lineTo(0, s*0.2);
  ctx.moveTo(s*1.1, -s*0.15); ctx.lineTo(0, s*0.2);
  ctx.moveTo(-s*0.6, -s*1.1); ctx.lineTo(-s*0.25, -s*0.2);
  ctx.moveTo(s*0.6, -s*1.1); ctx.lineTo(s*0.25, -s*0.2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.45)';
  ctx.beginPath(); ctx.ellipse(-s*0.45, -s*0.5, s*0.22, s*0.12, -0.6, 0, 6.2832); ctx.fill();
  // the scars, fading out in the light
  ctx.globalAlpha *= 1 - heal;
  scars.forEach(function(sc){
    if (sc.kind === 'stain'){
      // dried blood around the wound: dark red, soft-edged, restrained
      var stg = ctx.createRadialGradient(sc.x*s, sc.y*s, 0, sc.x*s, sc.y*s, sc.r * s);
      stg.addColorStop(0, 'rgba(110,10,18,.55)'); stg.addColorStop(0.6, 'rgba(90,8,14,.35)'); stg.addColorStop(1, 'rgba(70,6,10,0)');
      ctx.fillStyle = stg;
      ctx.beginPath();
      for (var a=0;a<10;a++){ var th = a/10*6.2832, rr = sc.r * s * (0.8 + 0.3 * FIRE.at(a*9 + sc.seed*300, sc.seed*70)); var px3 = sc.x*s + Math.cos(th)*rr, py3 = sc.y*s + Math.sin(th)*rr; if (a) ctx.lineTo(px3, py3); else ctx.moveTo(px3, py3); }
      ctx.closePath(); ctx.fill();
    } else if (sc.kind === 'char'){
      // a charred patch, black, ragged
      ctx.fillStyle = 'rgba(12,4,6,.92)';
      ctx.beginPath();
      for (var a=0;a<10;a++){ var th = a/10*6.2832, rr = sc.r * s * (0.75 + 0.35 * FIRE.at(a*7 + sc.seed*200, sc.seed*90)); var px2 = sc.x*s + Math.cos(th)*rr, py2 = sc.y*s + Math.sin(th)*rr; if (a) ctx.lineTo(px2, py2); else ctx.moveTo(px2, py2); }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(120,40,10,.5)'; ctx.lineWidth = Math.max(0.5, s * 0.04); ctx.stroke();
    } else {
      // a crack, dark with a lit edge
      var cr = sc.pts;
      ctx.lineWidth = Math.max(0.8, s * 0.1); ctx.strokeStyle = 'rgba(10,20,40,.85)';
      ctx.beginPath(); cr.forEach(function(pt, i){ if (i) ctx.lineTo(pt[0]*s, pt[1]*s); else ctx.moveTo(pt[0]*s, pt[1]*s); }); ctx.stroke();
      ctx.lineWidth = Math.max(0.5, s * 0.04); ctx.strokeStyle = 'rgba(255,255,255,' + (dmg >= 2 ? 0.5 + 0.4 * gutter : 0.4) + ')';
      ctx.beginPath(); cr.forEach(function(pt, i){ if (i) ctx.lineTo(pt[0]*s + 0.6, pt[1]*s + 0.6); else ctx.moveTo(pt[0]*s + 0.6, pt[1]*s + 0.6); }); ctx.stroke();
      if (o.leak && s > 8 && Math.random() < 0.35){
        var pt2 = cr[Math.floor(Math.random() * cr.length)];
        addPart({ x: x + pt2[0]*s, y: y + pt2[1]*s, vx: rnd(-14, 14), vy: rnd(-30, -8), life: rnd(0.4, 0.9), t: 0,
                       c: Math.random() < 0.6 ? COLORS.heart : '#ffffff', r: rnd(0.8, 1.8), g: -6, turb: 20 });
      }
    }
  });
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,' + (0.75 * (0.6 + 0.4 * glow)) + ')';
  ctx.lineWidth = Math.max(0.7, s * 0.09);
  heartPath(0, 0, s);
  ctx.stroke();
  ctx.restore();
}
function bez(a, b, c, u){ return (1-u)*(1-u)*a + 2*(1-u)*u*b + u*u*c; }
// cyan hearts drifting up behind the title
function drawTitleHearts(){
  for (var i=0;i<G.titleHearts.length;i++){
    var th = G.titleHearts[i];
    drawGem(th.x, th.y, th.s, { alpha: 0.3 + 0.3 * Math.abs(Math.sin(G.t * 0.6 + th.p)) });
  }
}

// ---------- his arms ----------
// Two clawed arms reach in from the edges and frame the arena. Dark muscled
// red, unlit and wet. They hunt the heart:
// breathing, a slow flex. One attack: a hand winds up, then slams its side.
// At the end they are what close around the heart.
function makeArms(){
  return {
    present: 0, reach: 0, creep: armCreep(),   // each life lost, they come further in
    // side: which edge it enters from. reach: which way the hand reaches, so
    // both palms face the centre. His right hand comes in from screen left.
    l: { side: -1, reach:  1, hand: 'right', hx: -140, hy: LH*0.56, rot: 0, curl: 0.3, spread: 0.6, mode: 'idle', k: 0, breath: rnd(0, 6) },
    r: { side:  1, reach: -1, hand: 'left',  hx: LW + 140, hy: LH*0.56, rot: 0, curl: 0.3, spread: 0.6, mode: 'idle', k: 0, breath: rnd(0, 6) }
  };
}
function updateArms(dt){
  var A = G.arms, p = G.player, T = G.taken || G.freed;
  A.present = Math.min(1, A.present + dt / 1.4);
  ['l', 'r'].forEach(function(key){
    var a = A[key], side = a.side, t = G.t;
    var inward = 64 + 24 * A.creep;
    var edgeX = side < 0 ? inward : LW - inward;
    var restX = lerp(side < 0 ? -140 : LW + 140, edgeX, smooth(A.present));
    // hunting: the hand leans to the heart's height, the fingers point at it,
    // spread when it is far and curl toward it when near, never quite closing
    var toward = Math.atan2(p.y - a.hy, (p.x - a.hx) * -side);
    var dist = Math.hypot(p.x - a.hx, p.y - a.hy);
    var restY = LH * 0.6 + clamp(p.y - LH * 0.6, -70, 40) * 0.5 + Math.sin(t * 0.9 + a.breath) * 6;
    var breathe = 0.06 * Math.sin(t * 0.55 + a.breath);
    var near = 1 - clamp((dist - 60) / 260, 0, 1);
    var tcurl = 0.22 + 0.5 * near + breathe, tspread = 0.35 + 0.45 * (1 - near);
    var lean = near * 16;
    // level: the arm reaches in horizontally and only tips a little toward
    // the heart's height, so the palm keeps facing the centre
    var tx = restX - side * lean, ty = restY, trot = clamp(toward, -0.5, 0.5) * 0.35, ease = 3;
    // an occasional scrape along the frame edge
    if (a.scrapeAt == null) a.scrapeAt = t + rnd(3, 7);
    if (t > a.scrapeAt){
      var sk = (t - a.scrapeAt) / 1.1;
      if (sk >= 1){ a.scrapeAt = t + rnd(4, 8); }
      else { tx = restX + side * 26; ty = restY - 40 + 80 * smooth(sk); tcurl = 0.7; trot = -side * 0.5; tspread = 0.2; if (sk < 0.05 && !a.scraped){ a.scraped = true; sfx.stick(); } }
    } else a.scraped = false;
    if (a.mode === 'wind'){                 // rises, opens, trembles
      tx = edgeX - side * 24; ty = restY - 210 * smooth(a.k) + Math.sin(t * 38) * 2.5 * a.k;
      tcurl = 0; tspread = 1; trot = -side * 0.5 * a.k; ease = 4;
    } else if (a.mode === 'slam'){
      tx = edgeX - side * 12; ty = lerp(restY - 210, FLOOR - 34, smooth(a.k)); tcurl = 0.1; tspread = 1; trot = -side * 0.5; ease = 30;
    } else if (a.mode === 'impact'){
      tx = edgeX - side * 12; ty = FLOOR - 34 + Math.sin(t * 50) * 1.5; tcurl = 0.15; tspread = 1; trot = -side * 0.5; ease = 30;
    } else if (a.mode === 'recover'){
      ease = 2.5;
    } else if (a.mode === 'reach' && T){    // the ending: close around the heart
      var k = A.reach;
      // the palm sits above and outside the heart, so the thumb closes over its
      // top and the fingers curl in beneath it
      tx = lerp(restX, T.hand.x - side * 40, k); ty = lerp(restY, T.hand.y - 24, k);
      tcurl = 0.15 + 0.85 * T.hand.close; tspread = 0.5; ease = 5;
      if (T.grabbed){ tx = T.hand.x - side * 40; ty = T.hand.y - 24; ease = 12; }
      // the forearm comes up from its lower corner, so the hands cup the heart from below
      var cX = side < 0 ? -90 : LW + 90, cY = LH + 40;
      var up = side < 0 ? Math.atan2(-(cY - ty), -(cX - tx)) : Math.atan2(-(cY - ty), cX - tx);
      trot = lerp(0, up, k);
    }
    a.hx = lerp(a.hx, tx, Math.min(1, dt * ease));
    a.hy = lerp(a.hy, ty, Math.min(1, dt * ease));
    a.curl = lerp(a.curl, tcurl, Math.min(1, dt * 5));
    a.spread = lerp(a.spread == null ? tspread : a.spread, tspread, Math.min(1, dt * 4));
    a.rot = lerp(a.rot, trot, Math.min(1, dt * 6));
  });
}
// a point on a Catmull-Rom spline through pts at u in 0..1
function spline(pts, u){
  var n = pts.length - 1, f = u * n, i = Math.min(n - 1, Math.floor(f)), k = f - i;
  var p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n, i + 2)];
  var k2 = k * k, k3 = k2 * k;
  return {
    x: 0.5 * ((2*p1.x) + (-p0.x + p2.x)*k + (2*p0.x - 5*p1.x + 4*p2.x - p3.x)*k2 + (-p0.x + 3*p1.x - 3*p2.x + p3.x)*k3),
    y: 0.5 * ((2*p1.y) + (-p0.y + p2.y)*k + (2*p0.y - 5*p1.y + 4*p2.y - p3.y)*k2 + (-p0.y + 3*p1.y - 3*p2.y + p3.y)*k3)
  };
}
// rough hide: a tile of mottling and fine cracks, multiplied over the flesh
var hideTile = null, hidePattern = null;
function hidePatternGet(){
  if (hidePattern) return hidePattern;
  var N = 128, c = document.createElement('canvas'); c.width = c.height = N;
  var cx = c.getContext('2d'), img = cx.createImageData(N, N), d = img.data, i = 0;
  for (var y=0;y<N;y++) for (var x=0;x<N;x++){
    var n = FIRE.at(x * 1.1, y * 1.1) * 0.5 + FIRE.at(x * 3.3 + 50, y * 3.3 + 20) * 0.5;      // granular mottling
    var cr = FIRE.at(x * 1.9 + 200, y * 1.9 + 300), gate = FIRE.at(x * 0.6 + 400, y * 0.6 + 100);   // cracks: short, sparse
    var crack = (Math.abs(cr - 0.5) < 0.018 && gate > 0.52) ? 0.5 : 0;
    var a = Math.max(0, (0.5 - n)) * 1.1 + crack;
    d[i] = 22; d[i+1] = 2; d[i+2] = 2; d[i+3] = Math.min(255, a * 255) | 0; i += 4;
  }
  cx.putImageData(img, 0, 0);
  hideTile = c; hidePattern = ctx.createPattern(c, 'repeat');
  return hidePattern;
}
// the hide over a clipped shape: mottled, cracked, multiplied in
function hideOver(alpha){
  if (!Q.hide) return;                     // only the top tier pays for it
  ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = alpha;
  ctx.fillStyle = hidePatternGet(); ctx.fillRect(-500, -500, 1000, 1000);
  ctx.restore();
}
// One finger: a smooth arc, no joints drawn, but the knuckles swell hard and
// the flesh is gnarled; deep red at the root darkening to near-black at the
// tip where it meets a long hooked talon. Lit by fire from below: a warm rim
// on the lower edge, shadow above and between fingers.
// Local frame: +x toward the arena; -y is up. bendSign: +1 curls toward +y.
function drawFinger(x0, y0, a1, len, curl, r0, r1, bendSign, fire, thumb){
  var C = COLORS.claw, Cd = 'rgb(96,9,7)', Ct = 'rgb(46,5,7)';
  // the bend lives mostly in the last joints: a digit reaches out nearly
  // straight and hooks at the end rather than clenching from the root. A
  // thumb has two segments to a finger's three, and a far heavier base.
  var L = thumb ? [len*0.54, len*0.46] : [len*0.42, len*0.33, len*0.25];
  var W = thumb ? [0.55, 1.5] : [0.28, 0.95, 1.5];
  var bend = bendSign * curl * 1.05;
  var J = [{x:x0, y:y0}], ang = a1;
  for (var i=0;i<L.length;i++){ ang += bend * W[i]; J.push({ x: J[i].x + Math.cos(ang) * L[i], y: J[i].y + Math.sin(ang) * L[i] }); }
  var n = 22, pts = [], left = [], right = [], seed = x0 * 0.7 + y0 * 1.3;
  for (var k=0;k<=n;k++) pts.push(spline(J, k/n));
  for (k=0;k<=n;k++){
    var u = k/n, a = pts[Math.max(0, k-1)], b = pts[Math.min(n, k+1)];
    var tx = b.x - a.x, ty = b.y - a.y, tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    // knuckles: two hard swellings, bigger when flexed; gnarl: the field roughens the outline
    // three knuckles, swelling hard, with the flesh pinched between them
    var bunch = thumb
      ? (0.4 + 0.6 * curl) * (0.8 * Math.exp(-Math.pow((u - 0.12) / 0.1, 2)) + Math.exp(-Math.pow((u - 0.56) / 0.09, 2)))
      : (0.34 + 0.62 * curl) * (Math.exp(-Math.pow((u - 0.2) / 0.085, 2))
        + Math.exp(-Math.pow((u - 0.46) / 0.075, 2)) + 0.9 * Math.exp(-Math.pow((u - 0.72) / 0.07, 2)));
    var pinch = thumb ? 0.13 * Math.exp(-Math.pow((u - 0.34) / 0.06, 2))
                      : 0.16 * (Math.exp(-Math.pow((u - 0.33) / 0.05, 2)) + Math.exp(-Math.pow((u - 0.59) / 0.05, 2)));
    var gnarl = (FIRE.at(u * 34 + seed, seed * 3) - 0.5) * 0.2;
    var r = lerp(r0, r1, u) * (1 + bunch - pinch + gnarl);
    left.push({ x: pts[k].x + ty * r, y: pts[k].y - tx * r });
    right.push({ x: pts[k].x - ty * r, y: pts[k].y + tx * r });
  }
  var hook = thumb ? (0.14 + 0.16 * curl) : (0.2 + 0.24 * curl);
  var tipAng = ang + bendSign * hook, cl = len * (thumb ? 0.28 : 0.38);
  var tip = pts[n];
  function outline(ox, oy){
    ctx.beginPath();
    ctx.moveTo(left[0].x + ox, left[0].y + oy);
    for (var q=1;q<=n;q++) ctx.lineTo(left[q].x + ox, left[q].y + oy);
    for (q=n;q>=0;q--) ctx.lineTo(right[q].x + ox, right[q].y + oy);
    ctx.closePath();
  }
  // the shadow it throws upward onto whatever is behind it: fire is below
  outline(-2.5, -5); ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fill();
  // the flesh, darkening toward the tip until it is the talon's colour: the
  // claw grows out of the finger, it is not stuck on the end
  var fg = ctx.createLinearGradient(J[0].x, J[0].y, tip.x, tip.y);
  fg.addColorStop(0, C); fg.addColorStop(0.5, Cd); fg.addColorStop(0.82, Ct); fg.addColorStop(1, 'rgb(20,4,6)');
  outline(0, 0); ctx.fillStyle = fg; ctx.fill();
  ctx.save(); ctx.clip();
  hideOver(0.6);
  // lit from below: warm along the lowest edge, shadow along the top
  var ymin = Math.min(J[0].y, tip.y, J[1].y, J[2].y) - r0, ymax = Math.max(J[0].y, tip.y, J[1].y, J[2].y) + r0;
  var lg = ctx.createLinearGradient(0, ymin, 0, ymax);
  lg.addColorStop(0, 'rgba(0,0,0,.42)'); lg.addColorStop(0.5, 'rgba(0,0,0,0)'); lg.addColorStop(1, 'rgba(255,130,50,' + (0.12 + 0.3 * fire) + ')');
  ctx.fillStyle = lg; ctx.fillRect(-400, -400, 800, 800);
  // the knuckles catch the light on their crests
  [0.38, 0.7].forEach(function(u){
    var kk = Math.round(u * n), c = pts[kk];
    var kg = ctx.createRadialGradient(c.x, c.y + r0 * 0.5, 0.5, c.x, c.y, r0 * 1.7);
    kg.addColorStop(0, 'rgba(255,150,90,' + (0.1 + 0.2 * fire) + ')'); kg.addColorStop(0.5, 'rgba(0,0,0,0)'); kg.addColorStop(1, 'rgba(0,0,0,.35)');
    ctx.fillStyle = kg; ctx.beginPath(); ctx.arc(c.x, c.y, r0 * 1.7, 0, 6.2832); ctx.fill();
  });
  // the creases, only where the flesh folds — across the palm side, between
  // the knuckles, bowed toward the tip and fading out before the far edge
  var inner = bendSign > 0 ? right : left, outer = bendSign > 0 ? left : right;
  (thumb ? [0.34] : [0.33, 0.59]).forEach(function(u){
    var kk = Math.round(u * n), c = pts[kk], nxt = pts[Math.min(n, kk + 2)];
    var mid = { x: c.x + (nxt.x - c.x) * 1.5, y: c.y + (nxt.y - c.y) * 1.5 };
    var cg2 = ctx.createLinearGradient(outer[kk].x, outer[kk].y, inner[kk].x, inner[kk].y);
    cg2.addColorStop(0, 'rgba(10,0,0,0)'); cg2.addColorStop(0.45, 'rgba(10,0,0,' + (0.3 + 0.35 * curl) + ')');
    cg2.addColorStop(1, 'rgba(10,0,0,' + (0.42 + 0.4 * curl) + ')');
    ctx.strokeStyle = cg2; ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(lerp(outer[kk].x, c.x, 0.45), lerp(outer[kk].y, c.y, 0.45));
    ctx.quadraticCurveTo(mid.x, mid.y, inner[kk].x, inner[kk].y);
    ctx.stroke();
  });
  // the warm rim itself, a thin bright line on the lowest edge
  var low = left[n].y > right[n].y ? left : right;
  ctx.strokeStyle = 'rgba(255,150,70,' + (0.2 + 0.4 * fire) + ')'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(low[2].x, low[2].y); for (k=3;k<=n-1;k++) if (low[k].y >= low[k-1].y - 0.5) ctx.lineTo(low[k].x, low[k].y); else ctx.moveTo(low[k].x, low[k].y); ctx.stroke();
  ctx.restore();
  // the talon: long, hooked, thick at the root and tapering to a point; black
  // and glossy, with one small highlight
  var dx = Math.cos(tipAng), dy = Math.sin(tipAng), nx = -dy, ny = dx, curve = bendSign * 0.42;
  var tb = r1 * 1.05;
  // start it a little way back inside the flesh and blend the root in
  tip = { x: tip.x - dx * r1 * 0.7, y: tip.y - dy * r1 * 0.7 };
  var rootg = ctx.createRadialGradient(tip.x, tip.y, r1 * 0.2, tip.x, tip.y, r1 * 1.9);
  rootg.addColorStop(0, 'rgba(11,3,5,.95)'); rootg.addColorStop(1, 'rgba(11,3,5,0)');
  ctx.fillStyle = rootg;
  ctx.beginPath(); ctx.arc(tip.x, tip.y, r1 * 1.9, 0, 6.2832); ctx.fill();
  ctx.fillStyle = '#0b0305';
  ctx.beginPath();
  ctx.moveTo(tip.x + nx * tb, tip.y + ny * tb);
  ctx.quadraticCurveTo(tip.x + dx * cl * 0.5 + nx * tb * 0.9, tip.y + dy * cl * 0.5 + ny * tb * 0.9,
                       tip.x + dx * cl + nx * curve * cl, tip.y + dy * cl + ny * curve * cl);
  ctx.quadraticCurveTo(tip.x + dx * cl * 0.55 - nx * tb * 0.1, tip.y + dy * cl * 0.55 - ny * tb * 0.1,
                       tip.x - nx * tb, tip.y - ny * tb);
  ctx.closePath(); ctx.fill();
  // gloss: a curved light along the outer curve, and a spot near the root
  ctx.strokeStyle = 'rgba(255,190,170,.45)'; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(tip.x + nx * tb * 0.55, tip.y + ny * tb * 0.55);
  ctx.quadraticCurveTo(tip.x + dx * cl * 0.45 + nx * tb * 0.55, tip.y + dy * cl * 0.45 + ny * tb * 0.55, tip.x + dx * cl * 0.8 + nx * curve * cl * 0.75, tip.y + dy * cl * 0.8 + ny * curve * cl * 0.75);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,230,220,.7)';
  ctx.beginPath(); ctx.ellipse(tip.x + dx * cl * 0.18 + nx * tb * 0.35, tip.y + dy * cl * 0.18 + ny * tb * 0.35, 1.6, 0.9, tipAng, 0, 6.2832); ctx.fill();
  // BTD_SPINE: debug. The digit's skeleton and where its claw actually points.
  if (window.BTD_SPINE){
    (window.__DIG = window.__DIG || []).push({ thumb: !!thumb, rootX: Math.round(J[0].x), rootY: Math.round(J[0].y), tipX: Math.round(tip.x), tipY: Math.round(tip.y), aimDeg: Math.round(tipAng * 180 / Math.PI) });
    ctx.save();
    ctx.strokeStyle = thumb ? '#00ffe0' : '#7fd0ff'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(J[0].x, J[0].y);
    for (var q=1;q<J.length;q++) ctx.lineTo(J[q].x, J[q].y);
    ctx.stroke();
    ctx.fillStyle = thumb ? '#00ffe0' : '#7fd0ff';
    ctx.beginPath(); ctx.arc(J[0].x, J[0].y, 2.6, 0, 6.2832); ctx.fill();          // the root
    ctx.strokeStyle = '#ffee00'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(tip.x, tip.y); ctx.lineTo(tip.x + dx * 26, tip.y + dy * 26); ctx.stroke();   // where the claw points
    ctx.beginPath(); ctx.arc(tip.x + dx * 26, tip.y + dy * 26, 2.2, 0, 6.2832); ctx.fill();
    ctx.restore();
  }
  return J;
}
// His right hand enters from the screen's left, his left from the right: he
// faces the player, so the two are mirror images across the centreline. In
// the local frame +x reaches into the arena toward the heart, -y is up. The
// palm faces the heart; the thumb rides the upper edge and curls over the
// top; the four fingers hang from the lower edge and curl down and in, talons
// hooking toward the heart. Dark red hide, thick muscled wrist, tendons and
// veins raised across the back. No straight edge anywhere.
// An arm's shape changes only with curl, spread and the fire on it; its
// position and rotation change every frame. So the shape is rendered once
// into a sprite in its local frame and re-rendered only when the pose moves,
// and each frame just places the sprite. The lights that depend on where it
// is (the held heart, fire spill) are drawn live over it.
var ARM_Y0 = -130, ARM_W = 620, ARM_H = 270, armRenderedAt = -1;
// the body runs from the shoulder (behind) to the talons (ahead), so the box
// sits mostly behind the wrist — on whichever side the arm comes in from
function armX0(reach){ return reach > 0 ? -490 : -130; }
function armSprite(a){
  var S = cvs.width / LW, reach = a.reach;
  var c = a.sprite || (a.sprite = { canvas: document.createElement('canvas'), curl: -1, spread: -1, fire: -1, S: 0 });
  // the pose is quantised so the idle sway does not re-render every few frames;
  // a slam crosses several steps and re-renders as it goes
  var qc = Q.hide ? 0.06 : 0.1, curl = Math.round(a.curl / qc) * qc, spread = Math.round((a.spread == null ? 0.6 : a.spread) / 0.1) * 0.1;
  var fire = window.BTD_LIGHT ? 1 : Math.round(clamp(fireLight(a.hx, a.hy).k * 1.4, 0, 1) * 4) / 4;
  var ch = Math.round((a.char || 0) * 8) / 8;
  var stale = c.S !== S || c.curl !== curl || c.spread !== spread || c.fire !== fire || c.hide !== Q.hide || c.reach !== reach || c.char !== ch;
  // at most one arm re-renders per frame
  if (stale && c.S !== 0 && armRenderedAt === PERF.total) return c.canvas;
  if (stale){
    armRenderedAt = PERF.total;
    if (c.S !== S){ c.canvas.width = Math.ceil(ARM_W * S); c.canvas.height = Math.ceil(ARM_H * S); c.S = S; }
    c.curl = curl; c.spread = spread; c.fire = fire; c.hide = Q.hide; c.reach = reach; c.char = ch;
    var cx = c.canvas.getContext('2d');
    cx.setTransform(1, 0, 0, 1, 0, 0); cx.clearRect(0, 0, c.canvas.width, c.canvas.height);
    cx.setTransform(S, 0, 0, S, -armX0(reach) * S, -ARM_Y0 * S);
    var saved = ctx; ctx = cx;
    drawArmBody(reach, curl, spread, fire, ch);
    ctx = saved;
  }
  return c.canvas;
}
// Each hand is drawn for its own side of the screen. Nothing is mirrored:
// a flip would hand the far arm a light source from the wrong side of a world
// that has one fire in it, and it makes the two hands one shape with two
// spellings rather than two hands.
function drawArm(a){
  var sp = armSprite(a);
  ctx.save();
  ctx.translate(a.hx, a.hy);
  ctx.rotate(a.reach > 0 ? a.rot : -a.rot);
  ctx.drawImage(sp, armX0(a.reach), ARM_Y0, ARM_W, ARM_H);
  // the held heart underlights the fingers
  var TT = G.mode === 'ending' ? (G.taken || G.freed) : null;
  if (TT && TT.grabbed){
    var hl = G.heart.light * (TT.glow == null ? 1 : TT.glow);
    if (hl > 0.02){
      var wx = G.player.x - a.hx, wy = G.player.y - a.hy;
      var rr = a.reach > 0 ? -a.rot : a.rot;
      var cr = Math.cos(rr), sr = Math.sin(rr), lx2 = wx * cr - wy * sr, ly2 = wx * sr + wy * cr;
      var hg3 = ctx.createRadialGradient(lx2, ly2, 3, lx2, ly2, 110);
      hg3.addColorStop(0, col('heart', 0.55 * hl)); hg3.addColorStop(1, col('heart', 0));
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = hg3; ctx.fillRect(lx2 - 110, ly2 - 110, 220, 220); ctx.restore();
    }
  }
  // light spill: brighter and warm-rimmed on the side facing a fire
  var fl = fireLight(a.hx, a.hy);
  if (fl.k > 0.03){
    var lx = fl.dx * 70, ly = fl.dy * 70;      // world direction: the fire does not mirror
    var sg = ctx.createRadialGradient(lx, ly, 4, lx * 0.3, ly * 0.3, 130);
    sg.addColorStop(0, 'rgba(255,150,50,' + (0.45 * fl.k) + ')');
    sg.addColorStop(1, 'rgba(255,90,20,0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = sg;
    ctx.fillRect(-140, -90, 260, 180);
  }
  ctx.restore();
  if (window.BTD_LIGHT){
    ctx.save();
    ctx.font = "7px 'Press Start 2P', monospace"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('HIS ' + a.hand.toUpperCase() + ' HAND', clamp(a.hx, 70, LW - 70), a.hy - 96);
    ctx.font = "6px 'Press Start 2P', monospace"; ctx.fillStyle = 'rgba(255,255,255,.7)';
    ctx.fillText('enters from ' + (a.side < 0 ? 'screen left' : 'screen right'), clamp(a.hx, 78, LW - 78), a.hy - 84);
    ctx.restore();
  }
}
// The hand, described rather than transformed.
//   reach  +1 = it reaches toward screen right (the arm entering from the
//               left: his right hand), -1 = toward screen left (his left).
//   thumb  always the top edge, -y, for both hands.
//   fingers always the bottom edge, curling toward the centre and up.
// X() places a distance along the reach; A() aims an angle along it; B()
// turns a curl direction into the one that closes this hand. Shading that
// depends on the world — the fire below, the heart's light at the centre —
// is written in world terms and is NOT flipped with the geometry.
function drawArmBody(reach, curl, spread, fire, char){
  function X(v){ return reach * v; }
  function A(a){ return reach > 0 ? a : Math.PI - a; }
  function B(sgn){ return reach > 0 ? sgn : -sgn; }
  var C = COLORS.claw, Cd = 'rgb(96,9,7)', Cdd = 'rgb(26,2,2)';
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // --- forearm: two muscle groups swelling from a thick wrist, shaded darker below
  var wr = 34;
  var ag = ctx.createLinearGradient(0, -100, 0, 110);
  ag.addColorStop(0, 'rgb(120,20,12)'); ag.addColorStop(0.25, C); ag.addColorStop(0.62, Cd); ag.addColorStop(1, Cdd);
  ctx.fillStyle = ag;
  ctx.beginPath();
  ctx.moveTo(X(-40), -wr);
  ctx.bezierCurveTo(X(-76), -wr - 22, X(-116), -84, X(-180), -92);      // the extensor rises
  ctx.bezierCurveTo(X(-250), -100, X(-344), -90, X(-444), -78);
  ctx.bezierCurveTo(X(-478), -36, X(-478), 56, X(-444), 92);
  ctx.bezierCurveTo(X(-340), 104, X(-240), 116, X(-170), 102);          // the flexor hangs below
  ctx.bezierCurveTo(X(-116), 90, X(-74), wr + 26, X(-40), wr + 4);
  ctx.bezierCurveTo(X(-22), wr - 10, X(-22), -wr + 8, X(-40), -wr);
  ctx.closePath(); ctx.fill();
  ctx.save(); ctx.clip();
  hideOver(0.55);
  // the crease between the two muscles, and the underside falling to black
  ctx.strokeStyle = 'rgba(14,1,1,.6)'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(X(-66), 14); ctx.bezierCurveTo(X(-150), 4, X(-250), -6, X(-380), 12); ctx.stroke();
  var und = ctx.createLinearGradient(0, -90, 0, 110);
  und.addColorStop(0, 'rgba(0,0,0,.4)'); und.addColorStop(0.45, 'rgba(0,0,0,0)'); und.addColorStop(0.8, 'rgba(0,0,0,0)'); und.addColorStop(1, 'rgba(255,120,50,' + (0.1 + 0.3 * fire) + ')');
  ctx.fillStyle = und; ctx.fillRect(reach > 0 ? -500 : -20, -120, 520, 240);
  // veins standing on the extensor: each wanders, forks once, a ridge lit above and shadowed below
  [[-56, -40, -300, -58, 14], [-70, -8, -330, -26, -12]].forEach(function(v, i){
    var x0 = v[0], y0 = v[1], x1 = v[2], y1 = v[3], wob = v[4];
    function vein(off, style, w){
      ctx.strokeStyle = style; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(X(x0), y0 + off);
      ctx.bezierCurveTo(X(x0 - 60), y0 + off - wob, X(x0 - 110), y0 + off + wob * 1.4, X(x0 - 160), y0 + off + wob * 0.3);
      ctx.bezierCurveTo(X(x0 - 210), y0 + off - wob, X(x1 + 60), y1 + off + wob * 0.8, X(x1), y1 + off);
      ctx.moveTo(X(x0 - 120), y0 + off + wob * 0.9);                       // a branch
      ctx.bezierCurveTo(X(x0 - 150), y0 + off + wob * 2.2, X(x0 - 190), y0 + off + wob * 2.6 + 12, X(x0 - 230), y0 + off + wob * 1.6 + 22);
      ctx.stroke();
    }
    vein(2, 'rgba(0,0,0,.34)', 2.6);
    vein(-1.2, 'rgba(255,140,120,.2)', 1.3);
  });
  ctx.restore();
  // --- the back of the hand. His fingers close away from us, into a palm we
  //     never see, so this surface carries what a back carries: the knuckles
  //     the fingers root in, the tendons running out to them over the bones,
  //     and the heavy mound of the thumb at the top by the wrist.
  var hg = ctx.createLinearGradient(-20, -50, 30, 48);
  hg.addColorStop(0, 'rgb(168,42,24)'); hg.addColorStop(0.35, 'rgb(150,30,18)'); hg.addColorStop(0.75, C); hg.addColorStop(1, 'rgb(96,16,10)');
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.moveTo(X(-40), -wr + 2);
  ctx.bezierCurveTo(X(-26), -44, X(-6), -52, X(12), -46);       // the thumb's mound, top and back
  ctx.bezierCurveTo(X(32), -40, X(44), -26, X(48), -10);        // over to the first knuckle
  ctx.bezierCurveTo(X(52), 10, X(46), 32, X(34), 44);           // the knuckle line, the fingers' edge
  ctx.bezierCurveTo(X(16), 54, X(-14), 52, X(-40), wr + 2);
  ctx.bezierCurveTo(X(-24), wr - 10, X(-24), -wr + 8, X(-40), -wr + 2);
  ctx.closePath(); ctx.fill();
  ctx.save(); ctx.clip();
  hideOver(0.55);
  // the bones of the hand: tendons standing out from the wrist to each knuckle
  var kn = [[X(42), -8], [X(45), 8], [X(42), 24], [X(34), 37]];
  for (var i=0;i<4;i++){
    var ext = 1 - curl;
    ctx.strokeStyle = 'rgba(0,0,0,' + (0.2 + 0.16 * ext) + ')'; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(X(-26), -10 + i * 7); ctx.bezierCurveTo(X(0), -6 + i * 9, X(18), kn[i][1] - 8, kn[i][0] - X(4), kn[i][1] - 1); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,150,120,' + (0.1 + 0.14 * ext) + ')'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(X(-26), -12 + i * 7); ctx.bezierCurveTo(X(0), -8 + i * 9, X(18), kn[i][1] - 10, kn[i][0] - X(4), kn[i][1] - 3); ctx.stroke();
  }
  // the knuckles themselves, swelling as the hand closes
  kn.forEach(function(k){
    var kg = ctx.createRadialGradient(k[0] - X(3), k[1] - 4, 1, k[0], k[1], 12);
    kg.addColorStop(0, 'rgba(255,150,110,' + (0.18 + 0.22 * curl) + ')');
    kg.addColorStop(0.55, 'rgba(0,0,0,0)'); kg.addColorStop(1, 'rgba(0,0,0,' + (0.3 + 0.2 * curl) + ')');
    ctx.fillStyle = kg; ctx.beginPath(); ctx.arc(k[0], k[1], 12, 0, 6.2832); ctx.fill();
  });
  // the thumb's mound, a mass of muscle at the top by the wrist
  var tm = ctx.createRadialGradient(X(10), -30, 2, X(10), -28, 26);
  tm.addColorStop(0, 'rgba(255,140,100,.22)'); tm.addColorStop(0.6, 'rgba(255,120,80,.05)'); tm.addColorStop(1, 'rgba(0,0,0,.35)');
  ctx.fillStyle = tm; ctx.beginPath(); ctx.arc(X(10), -28, 26, 0, 6.2832); ctx.fill();
  // a vein wandering over the bones, and the hollow between them
  ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(X(-34), -6); ctx.bezierCurveTo(X(-12), 0, X(6), -10, X(24), -2); ctx.bezierCurveTo(X(34), 2, X(38), 10, X(40), 18); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,150,120,.16)'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(X(-34), -9); ctx.bezierCurveTo(X(-12), -3, X(6), -13, X(24), -5); ctx.stroke();
  // fire from below: warm along the lower edge, the top in shadow
  var pg = ctx.createLinearGradient(0, -60, 0, 52);
  pg.addColorStop(0, 'rgba(0,0,0,.3)'); pg.addColorStop(0.5, 'rgba(0,0,0,0)'); pg.addColorStop(1, 'rgba(255,130,50,' + (0.16 + 0.3 * fire) + ')');
  ctx.fillStyle = pg; ctx.fillRect(reach > 0 ? -60 : -100, -80, 160, 160);
  ctx.restore();
  // --- the four fingers: they leave the hand's leading edge pointing into
  //     the arena (local +x is toward the heart), stacked down the lower half,
  //     and curl downward and inward so the talons hook back toward it. The
  //     rearmost is drawn first so the nearest overlaps it.
  // [root x, root y, fan angle, length, base radius, how far back it sits]
  // He is on the far side facing us, so his palm is turned this way and the
  // fingers close UP into it, against the thumb coming down from above. They
  // splay like a bird's foot and only hook at the tip; a full curl would fold
  // them into a fist and they would braid together.
  // Each finger leaves the hand aimed down and inward, past where the heart
  // is, and the curl carries it back UP — so the talon ends hooked upward and
  // inward, closing on the heart from below. Aimed level, the same curl would
  // just roll the tips backwards over the hand.
  var fingers = [
    [34, 37, 0.86, 54, 7.4, 0.55],     // the outermost, rooted furthest back
    [42, 24, 0.70, 68, 8.2, 0.25],
    [45,  8, 0.56, 78, 8.8, 0.0],      // the longest, nearest the thumb
    [42, -8, 0.40, 66, 8.2, 0.3]
  ];
  var grip = 0.2 + 0.28 * curl;                                 // never a fist, never past the vertical
  if (!window.BTD_THUMB_ONLY) fingers.forEach(function(f){
    ctx.save();
    if (f[5] > 0) ctx.globalAlpha = 1 - 0.18 * f[5];            // set back in the shade
    drawFinger(X(f[0]), f[1], A(f[2] * (0.7 + 0.5 * spread)), f[3], grip, f[4], 5.2, B(-1), fire);
    if (f[5] > 0){                                              // and a little darker still
      ctx.globalAlpha = 0.26 * f[5];
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.ellipse(X(f[0] + f[3] * 0.45), f[1] + f[3] * 0.18, f[3] * 0.6, f[3] * 0.5, 0, 0, 6.2832); ctx.fill();
    }
    ctx.restore();
  });
  // --- the thumb. It is not a fifth finger: it leaves the mound at the top
  //     BY THE WRIST, well behind the knuckles, swings up and forward away
  //     from the hand, then folds down over it so its talon comes to meet the
  //     fingers rising from below. Two segments, a base half again as thick as
  //     a finger's, and barely two-thirds the length.
  // It has to close on something. Rooted back by the wrist its tip finished
  // 80 px behind the fingertips, hooking down into nothing — which is what
  // makes a thumb look bent the wrong way. It sits forward on the top edge
  // now, over the knuckles, so its claw comes down onto the fingers rising to
  // meet it and the two make a ring.
  drawFinger(X(22), -32, A(0.2 + 0.12 * spread), 58, 0.2 + 0.2 * curl, 15, 9, B(1), fire, true);
  // with him gone they burn to ash: the hide greys over, and the last of the
  // fire in them shows through the cracks before it goes out
  if (char > 0){
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(46,40,37,' + (0.9 * char) + ')';
    ctx.fillRect(-620, -220, 1240, 440);
    var R = seeded(reach > 0 ? 71 : 97), glow = char * (1 - 0.6 * char);
    for (var ci = 0; ci < 16; ci++){
      var x0 = X(-430 + R() * 540), y0 = -60 + R() * 120, len = 26 + R() * 50, ang = R() * 6.2832;
      var qx = x0 + Math.cos(ang) * len * 0.5 + (R() - 0.5) * 22, qy = y0 + Math.sin(ang) * len * 0.5 + (R() - 0.5) * 22;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(qx, qy, x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len);
      ctx.strokeStyle = 'rgba(255,110,30,' + (0.7 * glow) + ')'; ctx.lineWidth = 3.2; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,225,160,' + (0.9 * glow) + ')'; ctx.lineWidth = 1.1; ctx.stroke();
    }
  }
  ctx.restore();
}
var armsLayer = makeLayer(), devilLayer = makeLayer();
function drawArms(front){
  var A = G.arms, T = G.mode === 'ending' ? (G.taken || G.freed) : null;
  if (A.present <= 0) return;
  var busy = A.l.mode !== 'idle' || A.r.mode !== 'idle' || T;
  if (Q.armsEvery > 1 && !busy){
    // idle sway may lag a frame or two; a slam or a reach never does
    armsLayer.draw(Math.floor(PERF.total / Q.armsEvery), function(){ drawArm(A.l); drawArm(A.r); });
    return;
  }
  drawArm(A.l);
  if (!(T && T.point > 0)) drawArm(A.r);       // the right hand is busy pointing
  if (front && T && T.grabbed){
    // the beat, seen through the closed hands
    var pg = ctx.createRadialGradient(T.hand.x, T.hand.y, 2, T.hand.x, T.hand.y, 44);
    pg.addColorStop(0, col('heart', 0.45 * G.heart.pulse));
    pg.addColorStop(1, col('heart', 0));
    ctx.fillStyle = pg;
    ctx.fillRect(T.hand.x - 50, T.hand.y - 50, 100, 100);
  }
}
// his other hand, pointing straight out of the screen: the arm up from the
// lower right, a fist of curled fingers, the index foreshortened toward you
// as shrinking curved segments ending in a talon.
function drawPointingHand(k){
  if (k <= 0) return;
  var s = 0.35 + 1.25 * k, C = COLORS.claw, Cd = 'rgb(96,9,7)', Cdd = 'rgb(26,2,2)';
  var cx = lerp(LW + 60, LW/2 + 30, k), cy = lerp(LH * 0.7, LH * 0.5, k);
  ctx.save();
  ctx.globalAlpha = Math.min(1, k * 3);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // the arm from the lower right corner, muscled, narrowing to the wrist
  var ang = Math.atan2(cy - (LH + 60), cx - (LW + 120));
  ctx.save();
  ctx.translate(cx, cy); ctx.rotate(ang);
  var ag = ctx.createLinearGradient(0, -60 * s, 0, 60 * s);
  ag.addColorStop(0, 'rgb(150,26,14)'); ag.addColorStop(0.3, C); ag.addColorStop(0.7, Cd); ag.addColorStop(1, Cdd);
  ctx.fillStyle = ag;
  ctx.beginPath();
  ctx.moveTo(0, -26 * s);
  ctx.bezierCurveTo(-60 * s, -40 * s, -140 * s, -64 * s, -260 * s, -60 * s);
  ctx.bezierCurveTo(-300 * s, -30 * s, -300 * s, 40 * s, -260 * s, 66 * s);
  ctx.bezierCurveTo(-150 * s, 78 * s, -60 * s, 48 * s, 0, 28 * s);
  ctx.bezierCurveTo(14 * s, 10 * s, 14 * s, -14 * s, 0, -26 * s);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(255,160,140,.18)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-40 * s, -30 * s); ctx.quadraticCurveTo(-150 * s, -58 * s, -240 * s, -54 * s); ctx.stroke();
  ctx.restore();
  // the fist: a curved back of the hand with the three lesser fingers curled under
  ctx.save();
  ctx.translate(cx + 16 * s, cy + 18 * s);
  ctx.scale(s, s);
  var fg = ctx.createRadialGradient(-10, -14, 4, 4, 6, 60);
  fg.addColorStop(0, C); fg.addColorStop(0.7, Cd); fg.addColorStop(1, Cdd);
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.moveTo(-40, -22);
  ctx.bezierCurveTo(-20, -48, 30, -46, 46, -22);
  ctx.bezierCurveTo(58, -2, 54, 26, 36, 40);
  ctx.bezierCurveTo(10, 52, -30, 50, -44, 26);
  ctx.bezierCurveTo(-54, 8, -52, -8, -40, -22);
  ctx.closePath(); ctx.fill();
  for (var i=0;i<3;i++){
    var ky = -6 + i * 16;
    drawFinger(40, ky, 0.5 + i * 0.15, 46 - i * 3, 1.0, 8, 5.2, 1, 0.5);
  }
  // the thumb across the curled fingers
  drawFinger(-6, 30, 0.3, 40, 0.9, 8.5, 5.4, -1, 0.5);
  ctx.restore();
  // the index, foreshortened toward the viewer: curved segments growing toward the tip
  var segs = [[0, 22], [0.45, 26], [0.85, 30]];
  segs.forEach(function(sg){
    var fx = cx - 8 * s * sg[0], fy = cy - 16 * s * sg[0], r = sg[1] * s * 0.6;
    var g = ctx.createRadialGradient(fx - r * 0.35, fy - r * 0.45, 1, fx, fy, r);
    g.addColorStop(0, 'rgb(190,40,24)'); g.addColorStop(0.55, C); g.addColorStop(1, 'rgb(60,6,5)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(fx, fy, r, r * 0.86, -0.3, 0, 6.2832); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(fx, fy, r, r * 0.86, -0.3, 0.3, 2.4); ctx.stroke();   // the crease beneath
  });
  // the fingertip and its talon, coming straight at you
  var tx = cx - 8 * s, ty = cy - 16 * s, tr = 19 * s;
  var tg = ctx.createRadialGradient(tx - tr * 0.4, ty - tr * 0.4, 1, tx, ty, tr);
  tg.addColorStop(0, 'rgb(200,48,30)'); tg.addColorStop(0.6, C); tg.addColorStop(1, 'rgb(70,8,6)');
  ctx.fillStyle = tg;
  ctx.beginPath(); ctx.ellipse(tx, ty, tr, tr * 0.9, -0.3, 0, 6.2832); ctx.fill();
  ctx.fillStyle = '#150406';
  ctx.beginPath();
  ctx.moveTo(tx - 9 * s, ty - 2 * s);
  ctx.bezierCurveTo(tx - 6 * s, ty - 14 * s, tx + 6 * s, ty - 14 * s, tx + 9 * s, ty - 2 * s);
  ctx.bezierCurveTo(tx + 5 * s, ty - 7 * s, tx - 5 * s, ty - 7 * s, tx - 9 * s, ty - 2 * s);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,170,150,.28)';
  ctx.beginPath(); ctx.ellipse(tx - 6 * s, ty - 8 * s, 4 * s, 2.2 * s, -0.6, 0, 6.2832); ctx.fill();
  ctx.restore();
}

function drawQuiver(){
  // five bolts, right-aligned under the HI score, all the same
  var x0 = LW - 12 - 4, y = 47;
  for (var i=0;i<AMMO;i++){
    var x = x0 - (AMMO - 1 - i) * 13;
    ctx.save();
    if (i >= G.ammo){
      ctx.strokeStyle = 'rgba(253,248,240,.2)';
      ctx.lineWidth = 1;
      boltShape(x, y, 0.75);
      ctx.stroke();
    } else {
      drawGlow(x, y + 4, 12, RGB.heart, 0.7, 20, 30);
      ctx.fillStyle = '#eefaff';
      boltShape(x, y, 0.75);
      ctx.fill();
    }
    ctx.restore();
  }
}

// an offscreen layer at device resolution, drawn with drawImage; render()
// is called again only when key changes
function makeLayer(){
  var c = document.createElement('canvas'), cx = c.getContext('2d');
  return {
    canvas: c, key: null,
    draw: function(key, render){
      if (c.width !== cvs.width || c.height !== cvs.height){ c.width = cvs.width; c.height = cvs.height; this.key = null; }
      if (key !== this.key){
        this.key = key;
        cx.setTransform(1, 0, 0, 1, 0, 0); cx.clearRect(0, 0, c.width, c.height);
        cx.setTransform(cvs.width / LW, 0, 0, cvs.height / LH, 0, 0);
        var saved = ctx; ctx = cx; render(); ctx = saved;
      }
      ctx.drawImage(c, 0, 0, c.width, c.height, 0, 0, LW, LH);
    }
  };
}
var hudLayer = makeLayer(), vignetteLayer = makeLayer(), mistStrip = null;
function drawHUD(){
  var alive = G.devil ? livingEyes(G.devil).length : 0, open = G.devil ? anyEyeOpen(G.devil) : false;
  var label = openPhase() ? 'S' : (G.devil && !G.devil.dying && (G.devil.state === 'open' || G.devil.state === 'attack') ? (open ? 'O' : 'C') : '-');
  var W = G.warden;
  if (W){ alive = 2 - W.hits; label = !W.dying && (W.state === 'open' || W.state === 'attack') ? (W.state === 'open' ? 'O' : 'C') : '-'; }
  var key = [Math.floor(runSeconds()), hiScore(), G.ammo, G.phase, Math.round(clamp(G.surv / G.SURV, 0, 1) * 200), alive, label].join('|');
  hudLayer.draw(key, drawHUDStatic);

  // lives, beating too
  for (var i=0;i<G.lives;i++) drawGem(18 + i*20, 44, 6.5 * (1 + (G.heart.scale - 1) * 0.6), { alpha: 0.9, pulse: G.heart.pulse * 0.5 });
  if (G.level === 2) drawSoulTally();
}
// The touch controls, on their own layer in css px: cleared and drawn only
// while there is a game to play.
function drawControls(){
  var live = G.mode === 'play' && !G.paused && !skip('ctl');
  var key = live ? [Math.round(stick.kx), Math.round(stick.ky), stick.id != null ? 1 : 0, Math.round(stick.jx * 20), Math.round(stick.jy * 20),
                    Math.round(fireBtn.press * 24), G.ammo].join('|') : '';
  if (key === ctlLayer.key) return;               // nothing on it has changed
  ctlLayer.key = key;
  var c = cctx;
  c.setTransform(ctlLayer.dpr, 0, 0, ctlLayer.dpr, -ctlLayer.x * ctlLayer.dpr, -ctlLayer.y * ctlLayer.dpr);
  c.clearRect(ctlLayer.x, ctlLayer.y, ctlLayer.W, ctlLayer.H);
  if (!live) return;
  var saved = ctx; ctx = c;                       // the shapes below draw on ctx
  drawStick(); drawFireBtn();
  ctx = saved;
}
// The joystick: the same dark glass and cyan rim as the fire button, with four
// chevrons so it reads as a stick at a glance. Held, the rim brightens and
// lights toward the push; the knob follows the thumb and springs home.
function drawStick(){
  var s = stick, R = s.R, held = s.id != null, kr = R * 0.44;
  var push = Math.hypot(s.jx, s.jy);
  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = 'rgba(10,6,32,' + (held ? 0.64 : 0.52) + ')';
  ctx.beginPath(); ctx.arc(s.x, s.y, R, 0, 6.2832); ctx.fill();
  ctx.lineWidth = held ? 3 : 2;
  ctx.strokeStyle = col('heart', held ? 0.95 : 0.72);
  ctx.stroke();
  // the dead zone, faintly
  ctx.lineWidth = 1; ctx.strokeStyle = col('heart', 0.18);
  ctx.beginPath(); ctx.arc(s.x, s.y, R * 0.56, 0, 6.2832); ctx.stroke();
  // four chevrons just inside the rim
  ctx.fillStyle = col('heart', held ? 0.3 : 0.5);
  for (var i=0;i<4;i++){
    var a = i * Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a), c = R * 0.8, w = R * 0.1;
    ctx.beginPath();
    ctx.moveTo(s.x + ca * (c + w), s.y + sa * (c + w));
    ctx.lineTo(s.x + ca * (c - w * 0.6) - sa * w * 1.1, s.y + sa * (c - w * 0.6) + ca * w * 1.1);
    ctx.lineTo(s.x + ca * (c - w * 0.6) + sa * w * 1.1, s.y + sa * (c - w * 0.6) - ca * w * 1.1);
    ctx.closePath(); ctx.fill();
  }
  // the rim lights where the thumb is pushing, brighter the harder
  if (held && push > 0){
    var pa = Math.atan2(s.jy, s.jx);
    ctx.strokeStyle = col('heart', 0.35 + 0.6 * push); ctx.lineWidth = 3 + 4 * push;
    ctx.beginPath(); ctx.arc(s.x, s.y, R + 1, pa - 0.55, pa + 0.55); ctx.stroke();
  }
  // the knob
  var kg = ctx.createRadialGradient(s.kx - kr * 0.3, s.ky - kr * 0.35, 1, s.kx, s.ky, kr);
  kg.addColorStop(0, held ? '#ffffff' : col('heart', 0.95));
  kg.addColorStop(0.55, col('heart', held ? 0.9 : 0.6));
  kg.addColorStop(1, col('heart', held ? 0.5 : 0.28));
  ctx.fillStyle = kg;
  ctx.beginPath(); ctx.arc(s.kx, s.ky, kr, 0, 6.2832); ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = col('heart', 0.85); ctx.stroke();
  ctx.restore();
}
function drawFireBtn(){
  var b = fireBtn, r = b.r, k = b.press;
  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = 'rgba(10,6,32,' + (0.55 + 0.25 * k) + ')';
  ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, 6.2832); ctx.fill();
  ctx.lineWidth = 2 + 2 * k;
  ctx.strokeStyle = G.ammo > 0 ? col('heart', 0.75 + 0.25 * k) : 'rgba(253,248,240,.25)';
  ctx.stroke();
  if (k > 0){ ctx.strokeStyle = col('heart', 0.5 * k); ctx.lineWidth = 6 * k; ctx.beginPath(); ctx.arc(b.x, b.y, r + 4 + 6 * k, 0, 6.2832); ctx.stroke(); }
  // a bolt, and the count beside it
  ctx.fillStyle = G.ammo > 0 ? '#eefaff' : 'rgba(253,248,240,.3)';
  boltShape(b.x - r * 0.32, b.y + r * 0.02, r / 24);
  ctx.fill();
  ctx.font = Math.round(r * 0.55) + "px 'Press Start 2P', monospace";
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(G.ammo), b.x + r * 0.26, b.y + 2);
  ctx.restore();
}
function drawHUDStatic(){
  ctx.save();
  ctx.font = "10px 'Press Start 2P', monospace";
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(253,248,240,.9)';
  ctx.textAlign = 'left';
  ctx.fillText('TIME ' + clock(runSeconds()), 12, 12);       // the clock that scores
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(199,154,143,.9)';
  ctx.fillText('HI ' + String(hiScore()).padStart(5,'0'), LW - 12, 12);   // the world's, when it answers

  drawQuiver();

  // meter
  var bx = 12, bw = LW - 24, by = 68, bh = 6;
  ctx.strokeStyle = 'rgba(253,248,240,.28)';
  ctx.lineWidth = 1;
  ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
  if (openPhase()){
    var k = clamp(G.surv / G.SURV, 0, 1);
    var mg = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    mg.addColorStop(0, COLORS.ember);
    mg.addColorStop(1, COLORS.sulfur);
    ctx.fillStyle = mg;
    ctx.fillRect(bx + 1, by + 1, (bw - 2) * k, bh - 2);
    ctx.font = "7px 'Press Start 2P', monospace";
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(199,154,143,.85)';
    ctx.fillText(G.phase === 'rescue' ? 'HE IS COMING' : 'SURVIVE', LW/2, by + 12);
  } else if (G.warden && !G.warden.dying){
    var Wd = G.warden;
    ctx.fillStyle = COLORS.ember;
    ctx.fillRect(bx + 1, by + 1, (bw - 2) * ((2 - Wd.hits) / 2), bh - 2);
    ctx.font = "7px 'Press Start 2P', monospace";
    ctx.textAlign = 'center';
    if (Wd.state === 'open' || Wd.state === 'attack'){
      var wl = Wd.state === 'open' ? 'THE LANTERN IS OPEN' : 'IT IS SHUTTERED', wtw = ctx.measureText(wl).width;
      ctx.fillStyle = 'rgba(4,1,10,.7)';
      ctx.fillRect(LW/2 - wtw/2 - 5, by + 9, wtw + 10, 13);
      ctx.fillStyle = Wd.state === 'open' ? 'rgba(255,195,33,.95)' : 'rgba(199,154,143,.85)';
      ctx.fillText(wl, LW/2, by + 12);
    }
  } else if (G.devil && !G.devil.dying){
    var alive = livingEyes(G.devil).length;
    ctx.fillStyle = COLORS.ember;
    ctx.fillRect(bx + 1, by + 1, (bw - 2) * (alive / 2), bh - 2);
    ctx.font = "7px 'Press Start 2P', monospace";
    ctx.textAlign = 'center';
    var open = anyEyeOpen(G.devil);
    if (G.devil.state === 'open' || G.devil.state === 'attack'){
      var label = open ? 'HIS EYE IS OPEN' : 'HIS EYES ARE SHUT';
      var tw = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(4,1,10,.7)';
      ctx.fillRect(LW/2 - tw/2 - 5, by + 9, tw + 10, 13);
      ctx.fillStyle = open ? 'rgba(255,195,33,.95)' : 'rgba(199,154,143,.85)';
      ctx.fillText(label, LW/2, by + 12);
    }
  }
  ctx.restore();
}

function drawTexts(){
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  G.texts.forEach(function(tx){
    var k = tx.t / tx.life;
    ctx.globalAlpha = k < 0.6 ? 1 : (1 - k) / 0.4;
    ctx.font = tx.size + "px 'Press Start 2P', monospace";
    ctx.fillStyle = 'rgba(4,1,10,.7)';
    ctx.fillText(tx.text, tx.x + 1, tx.y + 1);
    ctx.fillStyle = tx.c;
    ctx.fillText(tx.text, tx.x, tx.y);
  });
  ctx.restore();
}

function drawHerald(){
  var k = clamp(G.herald / 2.0, 0, 1);
  ctx.save();
  ctx.globalAlpha = k < 0.3 ? k / 0.3 : 1;
  ctx.font = "20px 'Press Start 2P', monospace";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = COLORS.heart; ctx.shadowBlur = shadowR(24);
  ctx.fillStyle = COLORS.title;
  var jx = rnd(-1,1) * 2, jy = rnd(-1,1) * 2;
  ctx.fillText(G.level === 2 ? 'THE WARDEN' : "HE'S HERE", LW/2 + jx, LH*0.5 + jy);
  ctx.restore();
}

function drawLightning(){
  var k = G.lightning;
  ctx.save();
  var sky = ctx.createLinearGradient(0, 0, 0, LH * 0.8);
  sky.addColorStop(0, 'rgba(255,230,200,' + (k * 0.14) + ')');
  sky.addColorStop(1, 'rgba(255,230,200,0)');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, LW, LH * 0.8);
  if (k > 0.55 && G.boltPath){
    ctx.globalAlpha = (k - 0.55) / 0.45;
    ctx.strokeStyle = '#fff4e0';
    ctx.shadowColor = '#ffffff'; ctx.shadowBlur = shadowR(14);
    ctx.lineWidth = 2;
    ctx.beginPath();
    G.boltPath.forEach(function(pt, i){ if (i) ctx.lineTo(pt.x, pt.y); else ctx.moveTo(pt.x, pt.y); });
    ctx.stroke();
  }
  ctx.restore();
}

// ---------- the light ----------
// the shaft of light, rendered once: a trapezoid widening downward, white at
// its core and gold at its soft edges, brightest under the roof, fading out
// at its foot
var beamCanvas = null;
function beamSprite(){
  if (beamCanvas) return beamCanvas;
  var W = 128, Hs = 256, c = document.createElement('canvas'); c.width = W; c.height = Hs;
  var cx = c.getContext('2d'), img = cx.createImageData(W, Hs), d = img.data, gr = RGB.grace, i = 0;
  for (var y = 0; y < Hs; y++){
    var v = y / (Hs - 1), hw = W * lerp(0.2, 0.5, v), inten = (1 - 0.5 * v) * (v > 0.82 ? (1 - v) / 0.18 : 1);
    for (var x = 0; x < W; x++){
      var e = Math.abs(x + 0.5 - W / 2) / hw, a = e < 1 ? Math.pow(1 - e * e, 1.6) : 0;
      d[i]   = 255;
      d[i+1] = lerp(gr[1] - 50, gr[1] + 4, a);      // gold at the edges, near white in the core
      d[i+2] = lerp(gr[2] - 114, gr[2] + 6, a);
      d[i+3] = 180 * a * inten;
      i += 4;
    }
  }
  cx.putImageData(img, 0, 0);
  return beamCanvas = c;
}
// The roof of the pit splits over the heart and a shaft of light comes down:
// nested shafts layered for a soft edge, brightest at the roof, rays drifting
// across it, a pool where it meets the floor, and the pit darkening around it.
function drawHeaven(){
  var H = G.heaven, p = G.player, x = H.x, t = G.t, i;
  ctx.save();
  if (H.wash > 0){ ctx.fillStyle = 'rgba(3,1,0,' + (0.4 * H.wash) + ')'; ctx.fillRect(-20, -20, LW + 40, LH + 40); }
  ctx.globalCompositeOperation = 'lighter';
  // the crack in the roof
  var cw = 8 + 52 * H.crack;
  drawGlow(x, 2, 60, RGB.grace, 0.9 * H.crack, cw * 3 + 50, 90);
  ctx.fillStyle = col('grace', 0.95 * H.crack);
  ctx.beginPath(); ctx.moveTo(x - cw, -2);
  for (i = 0; i <= 8; i++) ctx.lineTo(x - cw + 2 * cw * i / 8, (i % 2 ? 5 : 11) * H.crack * (1 - Math.abs(i - 4) / 6));
  ctx.lineTo(x + cw, -2); ctx.closePath(); ctx.fill();
  if (H.beam > 0){
    // the shaft: one soft sprite stretched to reach, so its leading edge is soft as it comes down
    var bot = lerp(40, LH + 30, H.beam), bw = 96;
    ctx.globalAlpha = 0.95;
    ctx.drawImage(beamSprite(), x - bw, 0, bw * 2, bot);
    ctx.globalAlpha = 1;
    for (i = 0; i < 4; i++){                   // rays drifting across it
      var off = Math.sin(t * 0.6 + i * 1.9) * 26, rw = 3 + 3 * FIRE.at(i * 40, t * 8);
      ctx.fillStyle = col('grace', (0.05 + 0.06 * FIRE.at(i * 70 + 5, t * 12)) * H.beam);
      ctx.beginPath(); ctx.moveTo(x + off * 0.3 - rw * 0.4, 0); ctx.lineTo(x + off * 0.3 + rw * 0.4, 0); ctx.lineTo(x + off + rw, bot); ctx.lineTo(x + off - rw, bot); ctx.closePath(); ctx.fill();
    }
    if (H.beam > 0.9){                         // where it lands
      var pg = ctx.createRadialGradient(x, FLOOR, 2, x, FLOOR, 110);
      pg.addColorStop(0, col('grace', 0.4 * (H.beam - 0.9) * 10)); pg.addColorStop(1, col('grace', 0));
      ctx.fillStyle = pg; ctx.beginPath(); ctx.ellipse(x, FLOOR, 110, 26, 0, 0, 6.2832); ctx.fill();
    }
  }
  ctx.restore();
}

// ---------- the pit ----------
// The arena is the bowels of hell: a cavern of dark rock under a roof of
// stalactites, crags standing black against the glow, a crust of floor over
// magma, and veins of fire through the rock that pulse with the heartbeat.
// The rock is rendered once into a layer and the veins into another; only
// their brightness and the far fires move. It stays DARK where the play is:
// every hazard is fire too, and it has to be the brightest thing on screen.
var pitLayer = makeLayer(), veinLayer = makeLayer(), pitRock = null;
// a repeatable sequence, so it is the same cavern every time it is drawn
function seeded(seed){
  var s = seed >>> 0 || 1;
  return function(){ s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
}
// strata and mottling from the noise field; integer scales so the tile is seamless
function pitRockPattern(){
  if (pitRock) return pitRock;
  var N = 128, c = document.createElement('canvas'); c.width = c.height = N;
  var cx = c.getContext('2d'), img = cx.createImageData(N, N), d = img.data, i = 0;
  for (var y=0;y<N;y++) for (var x=0;x<N;x++){
    var v = FIRE.at(x, y * 2) * 0.5 + FIRE.at(x * 2 + 40, y * 2 + 90) * 0.32 + FIRE.at(x * 4 + 7, y * 4 + 3) * 0.18;
    if (v < 0.5){ d[i] = 3; d[i+1] = 0; d[i+2] = 0; d[i+3] = Math.min(200, (0.5 - v) * 520); }
    else if (v > 0.7){ d[i] = 92; d[i+1] = 26; d[i+2] = 12; d[i+3] = Math.min(90, (v - 0.7) * 380); }
    i += 4;
  }
  cx.putImageData(img, 0, 0);
  return pitRock = ctx.createPattern(c, 'repeat');
}
function renderPit(){
  var R = seeded(666), i;
  // the far wall: black under the roof, a dull red toward the floor the magma lights
  var g = ctx.createLinearGradient(0, 0, 0, LH);
  g.addColorStop(0, 'rgb(5,1,1)'); g.addColorStop(0.45, 'rgb(12,3,2)'); g.addColorStop(0.8, 'rgb(28,6,3)'); g.addColorStop(1, 'rgb(54,11,4)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, LW, LH);
  ctx.fillStyle = pitRockPattern(); ctx.fillRect(0, 0, LW, LH);
  // crags in the middle distance, rising from the floor, black against the glow
  for (i = 0; i < 6; i++){
    var x = 20 + i * 76 + (R() - 0.5) * 40, h = 50 + R() * (i === 0 || i === 5 ? 170 : 90), w = 22 + h * 0.2;
    ctx.beginPath();
    ctx.moveTo(x - w, FLOOR + 2);
    ctx.quadraticCurveTo(x - w * 0.8, FLOOR - h * 0.5, x - w * 0.18, FLOOR - h);
    ctx.quadraticCurveTo(x + w * 0.1, FLOOR - h * 1.05, x + w * 0.3, FLOOR - h * 0.86);
    ctx.quadraticCurveTo(x + w * 0.8, FLOOR - h * 0.4, x + w, FLOOR + 2);
    ctx.closePath();
    var cg = ctx.createLinearGradient(0, FLOOR - h, 0, FLOOR);
    cg.addColorStop(0, 'rgba(7,2,1,.9)'); cg.addColorStop(1, 'rgba(16,4,2,.96)');
    ctx.fillStyle = cg; ctx.fill();
    ctx.strokeStyle = 'rgba(255,90,20,.14)'; ctx.lineWidth = 1.4; ctx.stroke();   // their edges catch the magma
  }
  // the side walls, jagged, their inner edge lit more the nearer the floor
  [-1, 1].forEach(function(side){
    var x0 = side < 0 ? -2 : LW + 2, pts = [];
    for (var y = -10; y <= LH + 12; y += 18) pts.push([x0 - side * (6 + 16 * FIRE.at(y * 0.3 + (side > 0 ? 400 : 0), 30) + (y > LH * 0.75 ? 8 : 0)), y]);
    ctx.beginPath(); ctx.moveTo(x0, -10);
    pts.forEach(function(q){ ctx.lineTo(q[0], q[1]); });
    ctx.lineTo(x0, LH + 12); ctx.closePath();
    ctx.fillStyle = 'rgb(6,1,1)'; ctx.fill();
    var eg = ctx.createLinearGradient(0, 0, 0, LH);
    eg.addColorStop(0, 'rgba(255,80,20,0)'); eg.addColorStop(0.6, 'rgba(255,80,20,.1)'); eg.addColorStop(1, 'rgba(255,110,30,.35)');
    ctx.strokeStyle = eg; ctx.lineWidth = 1.5;
    ctx.beginPath(); pts.forEach(function(q, k){ if (k) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }); ctx.stroke();
  });
  // the roof: stalactites
  for (i = 0; i < 18; i++){
    var sx = R() * LW, sl = 8 + R() * 40, sw = 4 + R() * 10;
    ctx.beginPath();
    ctx.moveTo(sx - sw, -2);
    ctx.quadraticCurveTo(sx - sw * 0.35, sl * 0.6, sx + (R() - 0.5) * 5, sl);
    ctx.quadraticCurveTo(sx + sw * 0.35, sl * 0.6, sx + sw, -2);
    ctx.closePath();
    ctx.fillStyle = 'rgb(3,1,1)'; ctx.fill();
  }
  // the floor: a crust of dark rock over the magma
  var fg = ctx.createLinearGradient(0, FLOOR, 0, LH);
  fg.addColorStop(0, 'rgb(30,7,3)'); fg.addColorStop(1, 'rgb(9,2,1)');
  ctx.fillStyle = fg; ctx.fillRect(0, FLOOR, LW, LH - FLOOR);
}
// the veins: cracks of magma through the lower wall, the walls and the crust.
// Drawn in light only; the frame decides how bright they are.
function renderVeins(){
  var R = seeded(1313), i;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // a fissure: jagged (rock splits, it does not flow), hot at the core and
  // tapering, with a wide dim glow around it
  function vein(x, y, ang, len, w, depth){
    var pts = [[x, y]], a = ang, n = 6;
    for (var k = 0; k < n; k++){ a += (R() - 0.5) * 1.1; x += Math.cos(a) * len / n; y += Math.sin(a) * len / n; pts.push([x, y]); }
    [[7, 'rgba(255,50,8,.08)'], [3.2, 'rgba(255,90,16,.26)'], [1.5, 'rgba(255,150,50,.7)'], [0.7, 'rgba(255,230,170,.95)']].forEach(function(s){
      for (var q = 0; q < n; q++){                  // each segment thinner than the last
        ctx.strokeStyle = s[1]; ctx.lineWidth = s[0] * w * (1 - 0.7 * q / n);
        ctx.beginPath(); ctx.moveTo(pts[q][0], pts[q][1]); ctx.lineTo(pts[q+1][0], pts[q+1][1]); ctx.stroke();
      }
    });
    if (depth < 1 && R() < 0.6) vein(pts[2][0], pts[2][1], a + (R() < 0.5 ? 0.8 : -0.8), len * 0.45, w * 0.65, depth + 1);
  }
  for (i = 0; i < 6; i++) vein(R() * LW, FLOOR + 3 + R() * 3, R() < 0.5 ? 0.04 : Math.PI - 0.04, 60 + R() * 70, 1.4, 0);   // in the crust
  for (i = 0; i < 5; i++) vein(30 + i * 85 + (R() - 0.5) * 40, FLOOR, -Math.PI / 2 + (R() - 0.5) * 1.1, 30 + R() * 70, 1.5, 0);   // up from the floor
  for (i = 0; i < 4; i++){ var sd = i % 2 ? 1 : -1; vein(sd < 0 ? 6 : LW - 6, 380 + R() * 220, -Math.PI / 2 + sd * (0.2 + R() * 0.4), 50 + R() * 60, 1.2, 0); }   // in the side walls
  // the seam where crust meets magma
  var sg = ctx.createLinearGradient(0, FLOOR - 12, 0, FLOOR + 6);
  sg.addColorStop(0, 'rgba(255,80,20,0)'); sg.addColorStop(0.7, 'rgba(255,110,30,.35)'); sg.addColorStop(1, 'rgba(255,170,80,.5)');
  ctx.fillStyle = sg; ctx.fillRect(0, FLOOR - 12, LW, 18);
}
function drawPit(prog, pulse){
  pitLayer.draw('pit', renderPit);
  // fires burning far off behind the crags, each on its own slow flicker
  var t = G.t;
  [[70, 0.9], [236, 0.7], [352, 1]].forEach(function(f, i){
    var fk = 0.55 + 0.45 * FIRE.at(t * 9 + i * 40, i * 70);
    drawGlow(f[0], FLOOR - 36, 60, [255, 80, 16], (0.22 + 0.12 * prog) * fk * f[1], 150, 120);
  });
  // the veins: the rock's pulse is the heart's, and it runs hotter as the phase wears on
  if (Q.glow){
    var hv = G.heaven ? 1 - 0.8 * G.heaven.wash : 1;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = (0.32 + 0.4 * pulse + 0.25 * prog) * hv;
    veinLayer.draw('veins', renderVeins);
    ctx.restore();
  }
}

// darkness closes in over the survive phase: radius 0.72 → 0.5
function drawVignette(){
  if (window.BTD_LIGHT) return;
  var step = Math.round(G.prog * 40);
  vignetteLayer.draw(step, function(){
    var r = lerp(0.72, 0.5, step / 40);
    var g = ctx.createRadialGradient(LW/2, LH/2, LH * r * 0.55, LW/2, LH/2, LH * (r + 0.1));
    g.addColorStop(0, col('void', 0));
    g.addColorStop(1, col('void', 0.86));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, LW, LH);
  });
  if (G.lives === 1 && (G.mode === 'play' || G.mode === 'ending')){
    var a = 0.10 + 0.2 * G.heart.pulse;
    var rg = ctx.createRadialGradient(LW/2, LH/2, LH*0.3, LW/2, LH/2, LH*0.7);
    rg.addColorStop(0, 'rgba(255,42,0,0)');
    rg.addColorStop(1, 'rgba(255,42,0,' + a + ')');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, LW, LH);
  }
}

function draw(){
  var prog = G.prog, pulse = G.heart.pulse;
  if (G.black >= 1){
    ctx.fillStyle = '#000'; ctx.fillRect(-20, -20, LW+40, LH+40);
    return;
  }
  // the fire textures, once per frame
  var needFire = G.flames.length || (G.devil && G.devil.state !== 'wait' && !G.devil.dead);
  var fireTick = Q.fireEvery === 1 || (PERF.total % Q.fireEvery) === 0;
  if (needFire && fireTick){ colFire.render(G.t, 'column'); }

  ctx.save();
  if (G.shake > 0){
    ctx.translate(rnd(-1,1) * G.shake * 7, rnd(-1,1) * G.shake * 7);
  }

  // the pit: the cavern, its veins pulsing with the heart, fires far off
  var M = RGB.midnight;
  if (!skip('pit')) drawPit(prog, pulse);
  else { ctx.fillStyle = COLORS.void; ctx.fillRect(-20, -20, LW+40, LH+40); }
  // heat haze above the magma floor, breathing with the heart; fire warms it once he is here
  var mist = 0.4 + 0.25 * pulse;
  if (!skip('mist')){
  if (!mistStrip){
    mistStrip = document.createElement('canvas'); mistStrip.width = 4; mistStrip.height = 280;
    var mc = mistStrip.getContext('2d'), hg = mc.createLinearGradient(0, 280, 0, 20);
    hg.addColorStop(0, rgba(M[0], M[1], M[2], 1)); hg.addColorStop(1, rgba(M[0], M[1], M[2], 0));
    mc.fillStyle = hg; mc.fillRect(0, 0, 4, 280);
  }
  ctx.globalAlpha = mist; ctx.drawImage(mistStrip, -20, LH - 260, LW + 40, 280); ctx.globalAlpha = 1;
  if (G.inferno || G.phase === 'devil'){
    var fglow = (G.inferno ? 0.32 : 0.12) + 0.16 * pulse;
    var fg2 = ctx.createLinearGradient(0, LH, 0, LH - (G.inferno ? 300 : 200));
    fg2.addColorStop(0, col('ember', fglow));
    fg2.addColorStop(1, col('ember', 0));
    ctx.fillStyle = fg2;
    ctx.fillRect(-20, LH - 300, LW + 40, 320);
  }
  }
  if (G.level === 2 && !skip('pit')){ dungeonLayer.draw('dungeon', renderDungeon); drawShaft(); }
  if (window.BTD_LIGHT){ ctx.fillStyle = '#6d6774'; ctx.fillRect(-20, -20, LW + 40, LH + 40); }
  if (G.mode === 'title') drawTitleHearts();

  // embers
  ctx.save();
  for (var i=0;i<G.embers.length;i++){
    var em = G.embers[i];
    ctx.globalAlpha = 0.2 + 0.35 * Math.abs(Math.sin(G.t + em.p)) + 0.25 * pulse;
    ctx.fillStyle = prog < 0.5 ? '#ff7a10' : '#e0501a';
    ctx.beginPath();
    ctx.arc(em.x, em.y, em.r, 0, 6.2832);
    ctx.fill();
  }
  ctx.restore();

  // blood on the floor, dark, drying
  if (G.splats.length){
    ctx.save();
    G.splats.forEach(function(sp2){
      var k = 1 - sp2.t / sp2.life;
      ctx.globalAlpha = 0.75 * Math.min(1, k * 2.5);
      ctx.fillStyle = k > 0.5 ? BLOOD : BLOOD_DARK;
      ctx.beginPath(); ctx.ellipse(sp2.x, sp2.y, sp2.r * (1 + 0.4 * (1 - k)), sp2.r * 0.32, 0, 0, 6.2832); ctx.fill();
      if (sp2.seed < 0.5){ ctx.beginPath(); ctx.ellipse(sp2.x + sp2.r * 1.3, sp2.y, sp2.r * 0.35, sp2.r * 0.16, 0, 0, 6.2832); ctx.fill(); }
    });
    ctx.restore();
  }
  // the floor's molten seam
  ctx.strokeStyle = G.inferno ? col('ember', 0.4 + 0.4 * pulse) : col('magma', 0.3 + 0.4 * pulse);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, FLOOR); ctx.lineTo(LW, FLOOR);
  ctx.stroke();

  if (G.lightning > 0 && G.phase === 'devil' && !skip('lightning')) drawLightning();
  if (G.watch && !skip('watch')) drawWatch();

  var taken = G.taken && G.mode === 'ending', gripped = G.freed && G.mode === 'ending';
  if (G.warden && !skip('devil')){ drawWarden(G.warden); drawWardenBeam(G.warden); }
  if (G.devil && !skip('devil')){
    // on lower tiers he is redrawn every 2nd or 3rd frame; the eyes and beams
    // are attack telegraphs, and a frame of lag is well inside their windows
    if (Q.devilEvery > 1 && !G.devil.dead) devilLayer.draw(Math.floor(PERF.total / Q.devilEvery), function(){ drawDevil(G.devil); });
    else drawDevil(G.devil);
  }
  if (G.arms && !taken && !gripped && !skip('arms')) drawArms();
  if (G.level === 2){ G.cages.forEach(drawCage); drawKnights(); }
  if (!skip('flames')) G.flames.forEach(drawFlame);
  G.forks.forEach(drawFork);
  G.loose.forEach(function(L){
    ctx.save(); ctx.translate(L.x, L.y); ctx.rotate(L.rot); ctx.globalAlpha = Math.max(0, 1 - L.t / 3);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#c85a24'; ctx.lineWidth = 3; forkShape(); ctx.restore();
  });
  if (G.heaven) drawHeaven();                     // the light, behind the heart
  G.bolts.forEach(drawBolt);

  // particles; blood droplets are drawn as small drops, with a short tail while falling
  G.parts.forEach(function(q){
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - q.t / q.life);
    ctx.fillStyle = q.c;
    if (q.blood){
      var vl = Math.hypot(q.vx, q.vy), tl = Math.min(6, vl * 0.02);
      ctx.beginPath(); ctx.ellipse(q.x, q.y, q.r * 0.7, q.r * 0.7 + tl * 0.5, Math.atan2(q.vy, q.vx) - Math.PI/2, 0, 6.2832); ctx.fill();
    } else ctx.fillRect(q.x - q.r/2, q.y - q.r/2, q.r, q.r);
    ctx.restore();
  });

  if (G.level === 2) drawSouls();
  var playerVisible = G.mode === 'play' || (G.mode === 'ending' && G.ending.kind !== 'dead');
  if (taken && G.taken.grabbed){ if (G.arms) drawArms(true); drawPlayer(); }   // cupped: the heart over the fingers
  else { if (playerVisible) drawPlayer(); if ((taken || gripped) && G.arms) drawArms(true); }
  if (taken) drawPointingHand(G.taken.point);
  if (G.cagedEnd && G.mode === 'ending') drawCagedEnd();
  drawTexts();

  ctx.restore();

  if (G.mode !== 'title' && !skip('vignette')) drawVignette();
  if (G.mode === 'play' && !skip('hud')) drawHUD();
  if (DEV.on){ ctx.font = "6px 'Press Start 2P', monospace"; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = col('title', 0.85); ctx.fillText('DEV', 6, LH - 6); }
  if (G.herald > 0) drawHerald();
  if (G.flash > 0){
    ctx.fillStyle = 'rgba(255,42,0,' + (G.flash * 0.4) + ')';
    ctx.fillRect(0, 0, LW, LH);
  }
  if (G.white > 0){
    ctx.fillStyle = 'rgba(255,255,255,' + (G.white * 0.55) + ')';
    ctx.fillRect(0, 0, LW, LH);
  }
}

// ---------- frame-time telemetry ----------
// A ring of the last 120 frames: the rAF interval (what the player feels) and
// the time spent in update+draw (what this code costs). Drawn as an overlay
// with #debug, read by BTD_PERF() and by the adaptive quality step.
var PERF = { N: 120, frame: new Float32Array(120), work: new Float32Array(120), i: 0, n: 0, total: 0, errors: 0 };
var perfShow = /debug/.test(location.hash);      // #debug shows the overlay on load; the backtick toggles it
function perfPush(frameMs, workMs){
  PERF.frame[PERF.i] = frameMs; PERF.work[PERF.i] = workMs;
  PERF.i = (PERF.i + 1) % PERF.N; if (PERF.n < PERF.N) PERF.n++; PERF.total++;
}
function perfStats(){
  var n = PERF.n, f = [], w = 0, mx = 0;
  for (var i=0;i<n;i++){ f.push(PERF.frame[i]); w += PERF.work[i]; if (PERF.frame[i] > mx) mx = PERF.frame[i]; }
  if (!n) return { n: 0 };
  f.sort(function(a, b){ return a - b; });
  var sum = 0; for (i=0;i<n;i++) sum += f[i];
  return { n: n, total: PERF.total, errors: PERF.errors, shown: perfShow, avg: sum / n, p95: f[Math.min(n - 1, Math.floor(n * 0.95))], max: mx, work: w / n };
}
function drawPerf(){
  var st = perfStats(); if (!st.n) return;
  ctx.save(); ctx.setTransform(cvs.width / LW, 0, 0, cvs.height / LH, 0, 0);
  ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(4, LH - 40, 236, 36);
  ctx.fillStyle = st.avg > 20 ? '#ff5a1f' : '#9fe8ff'; ctx.font = '7px monospace';
  // fps from the same window as the frame average; the low from its longest frame
  ctx.fillText('fps ' + Math.round(1000 / st.avg) + ' (low ' + Math.round(1000 / Math.max(1, st.max)) + ')  frame ' + st.avg.toFixed(1) + 'ms  p95 ' + st.p95.toFixed(1) + '  max ' + st.max.toFixed(0), 8, LH - 29);
  ctx.fillText('work ' + st.work.toFixed(1) + 'ms  dpr ' + (cvs.width / parseFloat(cvs.style.width)).toFixed(2) + '  parts ' + G.parts.length + '  fl ' + G.flames.length, 8, LH - 18);
  ctx.fillText('touch ' + (isTouch ? 1 : 0) + '  ' + cvs.width + 'x' + cvs.height, 8, LH - 7);
  ctx.restore();
}
// adaptive quality: a rolling one-second average over 20 ms asks for the next
// tier down. The request is applied by applyTier() only when it is safe.
var slowAcc = 0, slowN = 0, slowT = 0;
function adapt(frameMs){
  if (frameMs > 250) return;                       // a tab switch, not a slow frame
  if (window.BTD_LOCK_TIER) return;               // measuring: hold the tier
  slowAcc += frameMs; slowN++; slowT += frameMs;
  if (slowT < 1000) return;
  var avg = slowAcc / slowN;
  slowAcc = 0; slowN = 0; slowT = 0;
  if (avg > 20 && wantTier === tier && tier < QUALITY.length - 1) wantTier = tier + 1;
}
function applyTier(){
  if (wantTier === tier) return;
  var d = G.devil || G.warden, safe = G.mode !== 'play' || openPhase() || !d || d.state === 'wait' || d.state === 'open' || d.dead;
  if (safe) setTier(wantTier);
}
if (/debug/.test(location.hash)){
  window.BTD_TIER = setTier;
  window.BTD_WANT = function(n){ wantTier = n; };   // ask for a tier the safe way, as adapt() does
  // reset: true clears the ring so the next read covers only what follows
  window.BTD_PERF = function(reset){ var st = perfStats(); if (reset){ PERF.i = PERF.n = PERF.total = 0; } return st; };
}

// ---------- loop ----------
var last = performance.now();
function frame(now){
  var dt = Math.min(0.033, (now - last) / 1000);
  var frameMs = now - last, t0 = performance.now();
  last = now;
  try {
    if (!G.paused && !window.BTD_FREEZE) update(DEV.on && DEV.slow ? dt * 0.35 : dt);   // BTD_FREEZE: debug, holds the state for a screenshot
    draw();
  } catch(err){
    PERF.errors++;
    console.error(err);
  }
  if (isTouch) drawControls();
  pauseUI();
  if (brief) briefTick();
  perfPush(frameMs, performance.now() - t0);
  adapt(frameMs);
  if (perfShow) drawPerf();
  if (window.BTD_ZOOM){ var Z = window.BTD_ZOOM, S = cvs.width / LW; ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(cvs, Z.x * S, Z.y * S, Z.w * S, Z.h * S, 0, 0, cvs.width, cvs.height); ctx.restore(); }   // BTD_ZOOM: debug magnifier, {x,y,w,h} logical
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

})();
