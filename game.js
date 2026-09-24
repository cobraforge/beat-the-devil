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
var BEZEL_X = 32 * 2, BEZEL_Y = 30 + 76;

var isTouch = (window.matchMedia && window.matchMedia('(pointer:coarse)').matches) ||
              ('ontouchstart' in window);

// on a small screen the bezel goes and the glass takes the whole screen
var bare = false;
function resize(){
  bare = Math.min(window.innerWidth, window.innerHeight) < 600;
  document.body.classList.toggle('bare', bare);
  var pad = bare ? 0 : 12, bx = bare ? 0 : BEZEL_X, by = bare ? 0 : BEZEL_Y;
  var aw = wrap.clientWidth - pad, ah = wrap.clientHeight - pad;
  scale = Math.min(aw / (LW + bx), ah / (LH + by));
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
  layoutFireBtn();
  ctx.setTransform(cvs.width / LW, 0, 0, cvs.height / LH, 0, 0);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', function(){ setTimeout(resize, 120); });
resize();

var STORY = 'He wants your heart.<br>You have five bolts.<br>Two are for his eyes.<br><br>';
document.getElementById('tip').innerHTML = STORY + (isTouch
  ? 'Drag anywhere to move<br>The round button fires'
  : 'Arrows / WASD to move<br>Space to fire<br>P pause &middot; M mute');
if (isTouch){
  document.body.classList.add('touch');
  document.getElementById('start-hint').textContent = 'Tap to start';
  document.getElementById('over-hint').textContent = 'Tap to try again';
  document.getElementById('win-hint').textContent = 'Tap to play again';
}

// ---------- storage ----------
var hi = 0;
try { var v = localStorage.getItem('btd.hi'); if (v) hi = parseInt(v,10) || 0; } catch(e){}
function saveHi(){ try { localStorage.setItem('btd.hi', String(hi)); } catch(e){} }

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
var BOLT_SPEED = 640;
var FORK_SPEED = 520;
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
  title:    cssColor('--title', '#ff5a1f')
};
var RGB = {}; Object.keys(COLORS).forEach(function(k){ RGB[k] = hexRgb(COLORS[k]); });
function col(name, a){ var c = RGB[name]; return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
var FLOOR = LH - 8;
// how high the heart may fly: more room in the survive phase, below his chin in the fight
function ceilingY(){ return G.phase === 'survive' ? LH * 0.25 : LH * 0.42; }
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
function reset(){
  G.mode = 'title';           // title | play | ending | over | won
  G.tier = tier;
  G.t = 0;
  G.score = 0;
  G.lives = 3;
  G.ammo = AMMO;
  G.phase = 'survive';        // survive | devil
  G.surv = 0;
  G.SURV = 42;
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
  window.BTD_VERSION = 18;
  window.BTD_STEP = function(dt){ update(dt); draw(); };
}

// ---------- input ----------
var keys = {};
var fireQueued = false;
// Pointers are tracked by id from the moment they land. One that lands on the
// fire button is a 'fire' pointer for its whole life and never moves the
// heart; the first to land anywhere else is the 'move' pointer and never
// fires. Fingers that arrive while the move pointer is held do nothing.
var pointers = {}, movePtr = null, drag = null;
var downT = 0, moved = 0;                         // mouse only: a tap fires
// the fire button: bottom right, in thumb reach, at least 72 css px across
var fireBtn = { x: 0, y: 0, r: 40, press: 0 };
function layoutFireBtn(){
  if (!fireBtn) return;                           // resize() runs once before this block
  fireBtn.r = clamp(38 / Math.max(0.2, scale), 30, 64);
  fireBtn.x = LW - 10 - fireBtn.r; fireBtn.y = LH - 10 - fireBtn.r;
}
layoutFireBtn();
function onFireBtn(x, y){ return isTouch && Math.hypot(x - fireBtn.x, y - fireBtn.y) <= fireBtn.r * 1.15; }

window.addEventListener('keydown', function(e){
  var k = e.key, space = k === ' ' || e.code === 'Space';
  if (k === '`' || e.code === 'Backquote'){ if (!e.repeat) perfShow = !perfShow; e.preventDefault(); return; }   // the overlay, and nothing else
  if (space || ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].indexOf(k) >= 0) e.preventDefault();
  if (e.repeat) return;
  var lk = k.toLowerCase();
  keys[lk] = true;
  if (lk === 'm'){ toggleMute(); return; }
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
window.addEventListener('blur', function(){ keys = {}; pointers = {}; movePtr = null; drag = null; });
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
stage.addEventListener('pointerdown', function(e){
  if (e.target === muteBtn) return;
  try { stage.setPointerCapture(e.pointerId); } catch(err){}   // synthetic pointers have no capture
  var p = toLogical(e);
  if (G.mode !== 'play'){ tryStart(); return; }
  if (G.paused){ togglePause(); return; }
  if (onFireBtn(p.x, p.y)){
    pointers[e.pointerId] = { kind: 'fire' };
    fireBtn.press = 1; fireQueued = true;          // on press, not release
    return;
  }
  if (movePtr != null) return;
  movePtr = e.pointerId;
  pointers[e.pointerId] = { kind: 'move', x: p.x, y: p.y };
  // the heart rides above the finger: whatever offset it lands with eases
  // to one that keeps it clear of the thumb
  drag = { ox: G.player.x - p.x, oy: G.player.y - p.y, t: 0 };
  downT = performance.now(); moved = 0;
  G.idleT = 0;
});
stage.addEventListener('pointermove', function(e){
  var pt = pointers[e.pointerId];
  if (!pt || pt.kind !== 'move') return;
  var p = toLogical(e);
  moved += Math.abs(p.x - pt.x) + Math.abs(p.y - pt.y);
  pt.x = p.x; pt.y = p.y;
});
function endPointer(e){
  var pt = pointers[e.pointerId];
  delete pointers[e.pointerId];
  if (!pt || pt.kind !== 'move') return;
  // a mouse tap (no button on screen) fires; a finger never does
  if (!isTouch && G.mode === 'play' && !G.paused && moved < 10 && performance.now() - downT < 300) fireQueued = true;
  movePtr = null; drag = null;
}
stage.addEventListener('pointerup', endPointer);
stage.addEventListener('pointercancel', endPointer);

var muteBtn = document.getElementById('mute');
function toggleMute(){
  AUDIO.unlock();
  AUDIO.setMuted(!AUDIO.isMuted());
  muteBtn.textContent = AUDIO.isMuted() ? 'Sound off' : 'Sound on';
  if (G.mode === 'title') music.play('title');
}
muteBtn.addEventListener('click', function(e){ e.stopPropagation(); toggleMute(); });

function togglePause(){
  if (G.mode !== 'play') return;
  G.paused = !G.paused;
  keys = {}; fireQueued = false;
  sfx.pause();
  if (G.paused) music.pause(); else music.resume();
}

var scrTitle = document.getElementById('scr-title');
var scrOver  = document.getElementById('scr-over');
var scrWin   = document.getElementById('scr-win');

function tryStart(){
  AUDIO.unlock();
  if (G.mode === 'title' || G.mode === 'over' || G.mode === 'won'){
    if (G.mode !== 'title' && G.endT < 0.9) return;
    startGame();
  }
}
function startGame(){
  reset();
  AUDIO.muffle(false);
  G.mode = 'play';
  scrTitle.hidden = true; scrOver.hidden = true; scrWin.hidden = true;
  music.play('survive');
}
function showTitle(){
  document.getElementById('hi-title').textContent = hi ? ('Best ' + hi) : '';
  scrTitle.hidden = false;
}
showTitle();

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
  return best;
}
function updateHeart(dt){
  var h = G.heart, target;
  if (h.override >= 0) target = h.override;
  else if (G.mode === 'play' || G.mode === 'ending'){
    var danger = 1 - clamp((nearestHazard() - 30) / 220, 0, 1);
    if (G.phase === 'survive') danger = Math.max(danger, G.prog * 0.55);
    else danger = Math.max(danger, 0.45);
    if (G.lives === 1) danger = Math.max(danger, 0.55);
    h.danger = danger;
    target = 68 + 82 * danger;
    if (G.penalty && G.penalty.kind === 'burn') target += 55;            // panicked
    if (G.penalty && G.penalty.kind === 'fork') target *= 0.72;          // labored
    if (G.ending && G.ending.kind === 'dead') target = 0;
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
    var dmg = (G.mode === 'play' || G.mode === 'ending') ? 3 - G.lives : 0;
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
  return n;
}
// survive phase: never more than two hazards of any kind at once. Skip, never queue.
function mayspawn(){ return G.phase !== 'survive' || hazardCount() < 2; }
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
  G.ammo--;
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
function loseHeart(){
  var d = G.devil;
  beginEnding('taken', 9.8);
  d.state = 'taken';
  d.eyes.forEach(function(e){ e.open = false; e.wide = 0; });
  G.taken = { t: 0, bpm: G.heart.bpm, hand: { x: G.player.x, y: G.player.y, close: 0 }, point: 0, grabbed: false, stopped: false };
  if (G.arms){ G.arms.l.mode = 'reach'; G.arms.r.mode = 'reach'; G.arms.reach = 0; }
  // everything on screen burns out
  G.forks.forEach(function(f){ burst(f.x, f.y, '#ff6a1f', 3, 90); });
  G.forks.length = 0;
  G.flames.forEach(function(fl){
    if (fl.type === 'walker'){ fl.state = 'die'; fl.t = 0; }
    else if (fl.type === 'ember'){ fl.state = 'bloom'; fl.t = fl.fuse + 0.5; }
    else if (fl.type === 'jet'){ if (fl.len > 0){ fl.state = 'retract'; fl.t = 0; } else { fl.state = 'retract'; fl.t = 1; } }
    else fl.t = fl.warn + fl.burn;
  });
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
  beginEnding('dead', 1.9);
  G.shake = 1.4;
  music.stop();
}
function devilDies(){
  var d = G.devil;
  d.dying = true; d.dieT = 0;
  beginEnding('devil', 2.8);
  G.white = 1; G.shake = 1.6;
  music.stop();
  sfx.kill();
  sfx.roar();
}
function updateEnding(dt){
  var E = G.ending, d = G.devil;
  E.t += dt;
  if (E.kind === 'taken'){ updateTaken(dt); return; }
  if (d && !d.dying){ d.sway += dt; d.x = LW/2 + Math.sin(d.sway * 0.55) * d.swayAmp; }
  if (E.kind === 'devil'){
    d.dieT = E.t;
    G.shake = Math.max(G.shake, 0.5);
    if (Math.random() < 0.35)
      burst(d.x + rnd(-110,110), d.y + rnd(-70,100), Math.random()<0.5 ? COLORS.ember : COLORS.sulfur, 2, 220, 60);
    if (E.t > E.dur - 0.3 && !d.dead){ d.dead = true; G.white = 1; burst(d.x, d.y, COLORS.bone, 30, 420, 0); }
  }
  if (E.t >= E.dur){
    G.ending = null;
    if (E.kind === 'devil') victory();
    else gameOver('Your heart gave out.');
  }
}
function gameOver(why, quiet){
  G.mode = 'over';
  G.endT = 0;
  G.score = Math.floor(G.score);
  if (G.score > hi){ hi = G.score; saveHi(); }
  document.getElementById('over-why').textContent = why;
  scrOver.classList.toggle('low', !!quiet);
  document.getElementById('over-score').textContent = 'Score ' + G.score;
  document.getElementById('over-hi').textContent = 'Best ' + hi;
  scrOver.hidden = false;
  if (!quiet) sfx.over();
  setTimeout(function(){ if (G.mode === 'over'){ AUDIO.muffle(false); G.heart.override = -1; music.play('dirge'); } }, quiet ? 2500 : 1000);
}
function victory(){
  G.mode = 'won';
  G.endT = 0;
  var spare = G.ammo;
  G.score = Math.floor(G.score + 10000 + G.lives * 2500 + spare * 1500);
  if (G.score > hi){ hi = G.score; saveHi(); }
  document.getElementById('win-why').textContent = spare
    ? ('Two eyes. ' + spare + ' bolt' + (spare > 1 ? 's' : '') + ' to spare.')
    : 'Two eyes. Not a bolt to spare.';
  document.getElementById('win-score').textContent = 'Score ' + G.score;
  document.getElementById('win-hi').textContent = 'Best ' + hi;
  scrWin.hidden = false;
  sfx.win();
  setTimeout(function(){ if (G.mode === 'won') music.play('win'); }, 900);
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
  if (G.herald > 0) G.herald -= dt;
  if (G.hold > 0) G.hold -= dt;
  if (G.devil) G.devil.kick = decay(G.devil.kick, 3, dt);
  updateHeart(dt);

  // embers rise faster as the phase darkens and with every beat
  var emberK = 1 + G.prog * 1.3 + 0.8 * G.heart.pulse + (G.phase === 'devil' ? 0.6 : 0);
  for (var i=0;i<G.embers.length;i++){
    var em = G.embers[i];
    em.y -= em.v * emberK * dt;
    em.x += Math.sin(G.t*1.5 + em.p) * 10 * dt;
    if (em.y < -6){ em.y = LH + 6; em.x = rnd(0, LW); }
  }
  stepParticles(dt);
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
  if (keys['arrowleft'] || keys['a']) mx -= 1;
  if (keys['arrowright']|| keys['d']) mx += 1;
  if (keys['arrowup']   || keys['w']) my -= 1;
  if (keys['arrowdown'] || keys['s']) my += 1;
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
    var m = Math.hypot(mx,my) || 1;
    p.x += mx/m * sp * dt * (1 - 0.6 * shoveK);
    p.y += my/m * sp * dt * (1 - 0.6 * shoveK);
    G.idleT = 0;
  } else if (movePtr == null){
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
    G.score += dt * 10;
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
        G.score += 100;
        burst(f.x, f.y, '#ff6a1f', 6, 180);
        addText(f.x, f.y - 10, '+100', COLORS.ash, 0.6, 7);
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
    // graze: a near miss pays
    if (f.state === 'fly' && !f.grazed && G.invuln <= 0 && Math.hypot(p.x - f.x, p.y - f.y) < f.r + 8 + 16){
      f.grazed = true;
      G.score += 50;
      addText(p.x, p.y - 26, '+50', COLORS.sulfur, 0.6, 7);
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
  if (G.invuln > 0 || G.mode !== 'play') return;
  var p = G.player;
  G.lives--;
  G.invuln = 2.0;
  G.shake = 1.1;
  G.flash = 1;
  burst(p.x, p.y, COLORS.bone, 14, 260);
  sfx.hurt();
  G.forks.length = 0;
  // the beat stops dead, restarts with a hard irregular thump, then arrhythmia;
  // and it sheds light it will not get back
  var h = G.heart;
  h.stop = 0.2; h.big = true; h.arr = 2.0; h.next = h.since + rnd(0.05, 0.25);
  h.light = Math.max(0.35, h.light - 0.22);
  for (var li=0; li<16; li++)
    addPart({ x: p.x, y: p.y, vx: rnd(-90, 90), vy: rnd(-120, 20), life: rnd(0.5, 1.1), t: 0,
                   c: Math.random() < 0.5 ? COLORS.heart : '#ffffff', r: rnd(1, 2.6), g: -10, turb: 30 });
  if (G.arms) G.arms.creep = Math.max(0, 3 - G.lives);
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
  G.score += 3000;
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
  var y = p.y + G.recoil * 3, s = 11 * (window.BTD_HEART_SCALE || 1) * (held ? 1.8 : 1);   // BTD_HEART_SCALE: debug magnifier
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
  drawGem(p.x + dx, y + dy, s, {
    pulse: h.pulse, lit: lit, dmg: 3 - G.lives, light: h.light * (G.taken && G.taken.glow != null ? G.taken.glow : 1), fire: fire, scars: G.scars,
    burnK: burn ? Math.max(0, 1 - pen.t / 0.6) : 0,
    sx: sx, sy: sy, rot: rot, veins: true, leak: G.lives <= 1 || (pen && pen.kind === 'fork'),
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
    ctx.strokeStyle = locked ? COLORS.sulfur : COLORS.ember;
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
// thin smoke above the tip, darkening the violet behind it
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
  drawGlow(x, LH - h * 0.42, 40, [255, 96, 20], glowK, w * 2.8 + 30, h + 90);

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
    ctx.fillStyle = 'rgba(255,230,170,' + (0.35 * fl) + ')';
    ctx.beginPath(); ctx.ellipse(x, LH - h * 0.3, w * 1.1, h * 0.55, 0, 0, 6.2832); ctx.fill();
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
    ctx.strokeStyle = locked ? COLORS.sulfur : '#ff6a10';
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
  var dieK = d.dying ? clamp(d.dieT / 2.5, 0, 1) : 0;
  if (d.dying){ cx += rnd(-1,1) * 6 * dieK; cy += rnd(-1,1) * 4 * dieK; }
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

  // cracks as he dies
  if (dieK > 0.15){
    ctx.strokeStyle = 'rgba(255,255,255,' + Math.min(1, dieK * 1.4) + ')';
    ctx.lineWidth = 2;
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
    ctx.stroke();
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
  var H = RGB.heart, grey = [143, 160, 176], k = dmg >= 2 ? 0.6 : (dmg === 1 ? 0.2 : 0);
  var core = [lerp(H[0], grey[0], k), lerp(H[1], grey[1], k), lerp(H[2], grey[2], k)];
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
  // the scars
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
    present: 0, reach: 0, creep: Math.max(0, 3 - G.lives),   // each life lost, they come further in
    l: { side: -1, hx: -140, hy: LH*0.56, rot: 0, curl: 0.3, spread: 0.6, mode: 'idle', k: 0, breath: rnd(0, 6) },
    r: { side:  1, hx: LW + 140, hy: LH*0.56, rot: 0, curl: 0.3, spread: 0.6, mode: 'idle', k: 0, breath: rnd(0, 6) }
  };
}
function updateArms(dt){
  var A = G.arms, p = G.player, T = G.taken;
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
function drawFinger(x0, y0, a1, len, curl, r0, r1, bendSign, fire){
  var C = COLORS.claw, Cd = 'rgb(96,9,7)', Ct = 'rgb(46,5,7)';
  // the bend lives mostly in the last two joints: the finger reaches out
  // nearly straight and hooks at the end, rather than clenching from the root
  var L = [len*0.42, len*0.33, len*0.25], bend = bendSign * curl * 1.05;
  var W = [0.28, 0.95, 1.5];
  var J = [{x:x0, y:y0}], ang = a1;
  for (var i=0;i<3;i++){ ang += bend * W[i]; J.push({ x: J[i].x + Math.cos(ang) * L[i], y: J[i].y + Math.sin(ang) * L[i] }); }
  var n = 22, pts = [], left = [], right = [], seed = x0 * 0.7 + y0 * 1.3;
  for (var k=0;k<=n;k++) pts.push(spline(J, k/n));
  for (k=0;k<=n;k++){
    var u = k/n, a = pts[Math.max(0, k-1)], b = pts[Math.min(n, k+1)];
    var tx = b.x - a.x, ty = b.y - a.y, tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    // knuckles: two hard swellings, bigger when flexed; gnarl: the field roughens the outline
    // three knuckles, swelling hard, with the flesh pinched between them
    var bunch = (0.34 + 0.62 * curl) * (Math.exp(-Math.pow((u - 0.2) / 0.085, 2))
              + Math.exp(-Math.pow((u - 0.46) / 0.075, 2)) + 0.9 * Math.exp(-Math.pow((u - 0.72) / 0.07, 2)));
    var pinch = 0.16 * (Math.exp(-Math.pow((u - 0.33) / 0.05, 2)) + Math.exp(-Math.pow((u - 0.59) / 0.05, 2)));
    var gnarl = (FIRE.at(u * 34 + seed, seed * 3) - 0.5) * 0.2;
    var r = lerp(r0, r1, u) * (1 + bunch - pinch + gnarl);
    left.push({ x: pts[k].x + ty * r, y: pts[k].y - tx * r });
    right.push({ x: pts[k].x - ty * r, y: pts[k].y + tx * r });
  }
  var tip = pts[n], tipAng = ang + bendSign * (0.35 + curl * 0.55), cl = len * 0.38;
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
  [0.33, 0.59].forEach(function(u){
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
  var dx = Math.cos(tipAng), dy = Math.sin(tipAng), nx = -dy, ny = dx, hook = bendSign * 0.42;
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
                       tip.x + dx * cl + nx * hook * cl, tip.y + dy * cl + ny * hook * cl);
  ctx.quadraticCurveTo(tip.x + dx * cl * 0.55 - nx * tb * 0.1, tip.y + dy * cl * 0.55 - ny * tb * 0.1,
                       tip.x - nx * tb, tip.y - ny * tb);
  ctx.closePath(); ctx.fill();
  // gloss: a curved light along the outer curve, and a spot near the root
  ctx.strokeStyle = 'rgba(255,190,170,.45)'; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(tip.x + nx * tb * 0.55, tip.y + ny * tb * 0.55);
  ctx.quadraticCurveTo(tip.x + dx * cl * 0.45 + nx * tb * 0.55, tip.y + dy * cl * 0.45 + ny * tb * 0.55, tip.x + dx * cl * 0.8 + nx * hook * cl * 0.75, tip.y + dy * cl * 0.8 + ny * hook * cl * 0.75);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,230,220,.7)';
  ctx.beginPath(); ctx.ellipse(tip.x + dx * cl * 0.18 + nx * tb * 0.35, tip.y + dy * cl * 0.18 + ny * tb * 0.35, 1.6, 0.9, tipAng, 0, 6.2832); ctx.fill();
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
var ARM_X0 = -490, ARM_Y0 = -130, ARM_W = 620, ARM_H = 270, armRenderedAt = -1;
function armSprite(a){
  var S = cvs.width / LW, key = a.side < 0 ? 'l' : 'r';
  var c = a.sprite || (a.sprite = { canvas: document.createElement('canvas'), curl: -1, spread: -1, fire: -1, S: 0 });
  // the pose is quantised so the idle sway does not re-render every few frames;
  // a slam crosses several steps and re-renders as it goes
  var qc = Q.hide ? 0.06 : 0.1, curl = Math.round(a.curl / qc) * qc, spread = Math.round((a.spread == null ? 0.6 : a.spread) / 0.1) * 0.1;
  var fire = Math.round(clamp(fireLight(a.hx, a.hy).k * 1.4, 0, 1) * 4) / 4;
  var stale = c.S !== S || c.curl !== curl || c.spread !== spread || c.fire !== fire || c.hide !== Q.hide;
  // at most one arm re-renders per frame
  if (stale && c.S !== 0 && armRenderedAt === PERF.total) return c.canvas;
  if (stale){
    armRenderedAt = PERF.total;
    if (c.S !== S){ c.canvas.width = Math.ceil(ARM_W * S); c.canvas.height = Math.ceil(ARM_H * S); c.S = S; }
    c.curl = curl; c.spread = spread; c.fire = fire; c.hide = Q.hide;
    var cx = c.canvas.getContext('2d');
    cx.setTransform(1, 0, 0, 1, 0, 0); cx.clearRect(0, 0, c.canvas.width, c.canvas.height);
    cx.setTransform(S, 0, 0, S, -ARM_X0 * S, -ARM_Y0 * S);
    var saved = ctx; ctx = cx;
    drawArmBody(curl, spread, fire);
    ctx = saved;
  }
  return c.canvas;
}
function drawArm(a){
  var sp = armSprite(a);
  ctx.save();
  ctx.translate(a.hx, a.hy);
  ctx.scale(a.side < 0 ? 1 : -1, 1);      // local +x reaches into the arena
  ctx.rotate(a.rot);
  ctx.drawImage(sp, ARM_X0, ARM_Y0, ARM_W, ARM_H);
  // the held heart underlights the fingers
  if (G.taken && G.taken.grabbed && G.mode === 'ending'){
    var hl = G.heart.light * (G.taken.glow == null ? 1 : G.taken.glow);
    if (hl > 0.02){
      var wx = G.player.x - a.hx, wy = G.player.y - a.hy; if (a.side > 0) wx = -wx;
      var cr = Math.cos(-a.rot), sr = Math.sin(-a.rot), lx2 = wx * cr - wy * sr, ly2 = wx * sr + wy * cr;
      var hg3 = ctx.createRadialGradient(lx2, ly2, 3, lx2, ly2, 110);
      hg3.addColorStop(0, col('heart', 0.55 * hl)); hg3.addColorStop(1, col('heart', 0));
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = hg3; ctx.fillRect(lx2 - 110, ly2 - 110, 220, 220); ctx.restore();
    }
  }
  // light spill: brighter and warm-rimmed on the side facing a fire
  var fl = fireLight(a.hx, a.hy);
  if (fl.k > 0.03){
    var lx = fl.dx * (a.side < 0 ? 1 : -1) * 70, ly = fl.dy * 70;
    var sg = ctx.createRadialGradient(lx, ly, 4, lx * 0.3, ly * 0.3, 130);
    sg.addColorStop(0, 'rgba(255,150,50,' + (0.45 * fl.k) + ')');
    sg.addColorStop(1, 'rgba(255,90,20,0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = sg;
    ctx.fillRect(-140, -90, 260, 180);
  }
  ctx.restore();
}
// the arm's shape, in its local frame: +x reaches into the arena, -y is up
function drawArmBody(curl, spread, fire){
  var C = COLORS.claw, Cd = 'rgb(96,9,7)', Cdd = 'rgb(26,2,2)';
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // --- forearm: two muscle groups swelling from a thick wrist, shaded darker below
  var wr = 34;
  var ag = ctx.createLinearGradient(0, -100, 0, 110);
  ag.addColorStop(0, 'rgb(120,20,12)'); ag.addColorStop(0.25, C); ag.addColorStop(0.62, Cd); ag.addColorStop(1, Cdd);
  ctx.fillStyle = ag;
  ctx.beginPath();
  ctx.moveTo(-40, -wr);
  ctx.bezierCurveTo(-76, -wr - 22, -116, -84, -180, -92);      // the extensor rises
  ctx.bezierCurveTo(-250, -100, -344, -90, -444, -78);
  ctx.bezierCurveTo(-478, -36, -478, 56, -444, 92);
  ctx.bezierCurveTo(-340, 104, -240, 116, -170, 102);          // the flexor hangs below
  ctx.bezierCurveTo(-116, 90, -74, wr + 26, -40, wr + 4);
  ctx.bezierCurveTo(-22, wr - 10, -22, -wr + 8, -40, -wr);
  ctx.closePath(); ctx.fill();
  ctx.save(); ctx.clip();
  hideOver(0.55);
  // the crease between the two muscles, and the underside falling to black
  ctx.strokeStyle = 'rgba(14,1,1,.6)'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(-66, 14); ctx.bezierCurveTo(-150, 4, -250, -6, -380, 12); ctx.stroke();
  var und = ctx.createLinearGradient(0, -90, 0, 110);
  und.addColorStop(0, 'rgba(0,0,0,.4)'); und.addColorStop(0.45, 'rgba(0,0,0,0)'); und.addColorStop(0.8, 'rgba(0,0,0,0)'); und.addColorStop(1, 'rgba(255,120,50,' + (0.1 + 0.3 * fire) + ')');
  ctx.fillStyle = und; ctx.fillRect(-500, -120, 520, 240);
  // veins standing on the extensor: each wanders, forks once, a ridge lit above and shadowed below
  [[-56, -40, -300, -58, 14], [-70, -8, -330, -26, -12]].forEach(function(v, i){
    var x0 = v[0], y0 = v[1], x1 = v[2], y1 = v[3], wob = v[4];
    function vein(off, style, w){
      ctx.strokeStyle = style; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(x0, y0 + off);
      ctx.bezierCurveTo(x0 - 60, y0 + off - wob, x0 - 110, y0 + off + wob * 1.4, x0 - 160, y0 + off + wob * 0.3);
      ctx.bezierCurveTo(x0 - 210, y0 + off - wob, x1 + 60, y1 + off + wob * 0.8, x1, y1 + off);
      ctx.moveTo(x0 - 120, y0 + off + wob * 0.9);                          // a branch
      ctx.bezierCurveTo(x0 - 150, y0 + off + wob * 2.2, x0 - 190, y0 + off + wob * 2.6 + 12, x0 - 230, y0 + off + wob * 1.6 + 22);
      ctx.stroke();
    }
    vein(2, 'rgba(0,0,0,.34)', 2.6);
    vein(-1.2, 'rgba(255,140,120,.2)', 1.3);
  });
  ctx.restore();
  // --- the palm, turned toward the heart: a broad pad narrowing to the wrist,
  //     the thumb's mount swelling off the upper edge. Because this is the
  //     inner surface, there are no knuckles here — those show on the fingers
  //     themselves — only the mounts at their roots, the heel, and the creases.
  var hg = ctx.createLinearGradient(-20, -46, 30, 50);
  hg.addColorStop(0, 'rgb(96,16,10)'); hg.addColorStop(0.4, Cd); hg.addColorStop(0.75, C); hg.addColorStop(1, 'rgb(150,34,20)');
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.moveTo(-40, -wr + 2);
  ctx.bezierCurveTo(-18, -46, 6, -50, 24, -38);                 // the thumb's mount, on top
  ctx.bezierCurveTo(40, -24, 46, -12, 46, -2);                  // out to the root of the first finger
  ctx.bezierCurveTo(50, 12, 46, 32, 36, 44);                    // the edge the fingers leave from
  ctx.bezierCurveTo(18, 54, -14, 54, -40, wr + 2);
  ctx.bezierCurveTo(-24, wr - 10, -24, -wr + 8, -40, -wr + 2);
  ctx.closePath(); ctx.fill();
  ctx.save(); ctx.clip();
  hideOver(0.55);
  // the hollow of the palm: darker in the middle, the mounts around it lit
  var hollow = ctx.createRadialGradient(6, -4, 2, 6, -4, 46);
  hollow.addColorStop(0, 'rgba(0,0,0,.5)'); hollow.addColorStop(0.7, 'rgba(0,0,0,.12)'); hollow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = hollow; ctx.fillRect(-60, -60, 130, 120);
  // the mount at the base of each finger, and the thumb's, and the heel
  [[34, 0, 13], [36, 16, 13], [33, 32, 12], [26, 44, 10], [-2, -28, 18], [-26, 18, 16]].forEach(function(m){
    var mg = ctx.createRadialGradient(m[0], m[1] + m[2] * 0.3, 1, m[0], m[1], m[2]);
    mg.addColorStop(0, 'rgba(255,140,100,' + (0.2 + 0.14 * fire) + ')'); mg.addColorStop(0.6, 'rgba(255,120,80,.05)'); mg.addColorStop(1, 'rgba(0,0,0,.3)');
    ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(m[0], m[1], m[2], 0, 6.2832); ctx.fill();
  });
  // the two creases that fold when the hand closes, deepening with the curl
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,' + (0.3 + 0.35 * curl) + ')'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(38, -16); ctx.quadraticCurveTo(6, -6, -18, -6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(30, 34); ctx.quadraticCurveTo(0, 22, -22, 6); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,150,120,' + (0.12 + 0.12 * curl) + ')'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(38, -19); ctx.quadraticCurveTo(6, -9, -18, -9); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(30, 31); ctx.quadraticCurveTo(0, 19, -22, 3); ctx.stroke();
  // the wrist's cords, running in under the heel
  ctx.strokeStyle = 'rgba(0,0,0,.28)'; ctx.lineWidth = 3;
  [-10, 0, 10].forEach(function(o){ ctx.beginPath(); ctx.moveTo(-52, o - 4); ctx.quadraticCurveTo(-30, o, -14, o + 6); ctx.stroke(); });
  // fire from below: warm along the lower edge, shadow along the top
  var pg = ctx.createLinearGradient(0, -60, 0, 52);
  pg.addColorStop(0, 'rgba(255,140,60,' + (0.1 + 0.16 * fire) + ')'); pg.addColorStop(0.45, 'rgba(0,0,0,0)'); pg.addColorStop(1, 'rgba(0,0,0,.4)');
  ctx.fillStyle = pg; ctx.fillRect(-60, -80, 160, 160);
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
    [30, 34, 0.86, 54, 7.4, 0.55],     // the outermost, rooted furthest back
    [40, 22, 0.70, 68, 8.2, 0.25],
    [46,  8, 0.56, 78, 8.8, 0.0],      // the longest, nearest the thumb
    [42, -8, 0.40, 66, 8.2, 0.3]
  ];
  var grip = 0.24 + 0.34 * curl;                                // never a fist
  fingers.forEach(function(f){
    ctx.save();
    if (f[5] > 0) ctx.globalAlpha = 1 - 0.18 * f[5];            // set back in the shade
    drawFinger(f[0], f[1], f[2] * (0.7 + 0.5 * spread), f[3], grip, f[4], 5.2, -1, fire);
    if (f[5] > 0){                                              // and a little darker still
      ctx.globalAlpha = 0.26 * f[5];
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.ellipse(f[0] + f[3] * 0.45, f[1] + f[3] * 0.18, f[3] * 0.6, f[3] * 0.5, 0, 0, 6.2832); ctx.fill();
    }
    ctx.restore();
  });
  // --- the thumb: short, thick and opposed. It comes off the mount on the
  //     upper edge and closes DOWN onto the fingers coming up: the two meet,
  //     which is what makes it a grip rather than a paw.
  drawFinger(18, -36, 0.16 + 0.16 * spread, 48, 0.3 + 0.4 * curl, 11.5, 6.6, 1, fire);
  ctx.restore();
}
var armsLayer = makeLayer(), devilLayer = makeLayer();
function drawArms(front){
  var A = G.arms, T = G.taken && G.mode === 'ending' ? G.taken : null;
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
  var label = G.phase === 'survive' ? 'S' : (G.devil && !G.devil.dying && (G.devil.state === 'open' || G.devil.state === 'attack') ? (open ? 'O' : 'C') : '-');
  var key = [Math.floor(G.score), hi, G.ammo, G.phase, Math.round(clamp(G.surv / G.SURV, 0, 1) * 200), alive, label].join('|');
  hudLayer.draw(key, drawHUDStatic);
  if (isTouch) drawFireBtn();
  // lives, beating too
  for (var i=0;i<G.lives;i++) drawGem(18 + i*20, 44, 6.5 * (1 + (G.heart.scale - 1) * 0.6), { alpha: 0.9, pulse: G.heart.pulse * 0.5 });
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
  boltShape(b.x - r * 0.32, b.y + r * 0.02, r / 26);
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
  ctx.fillText(String(Math.floor(G.score)).padStart(6,'0'), 12, 12);
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(199,154,143,.9)';
  ctx.fillText('HI ' + String(hi).padStart(6,'0'), LW - 12, 12);

  drawQuiver();

  // meter
  var bx = 12, bw = LW - 24, by = 68, bh = 6;
  ctx.strokeStyle = 'rgba(253,248,240,.28)';
  ctx.lineWidth = 1;
  ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
  if (G.phase === 'survive'){
    var k = clamp(G.surv / G.SURV, 0, 1);
    var mg = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    mg.addColorStop(0, COLORS.ember);
    mg.addColorStop(1, COLORS.sulfur);
    ctx.fillStyle = mg;
    ctx.fillRect(bx + 1, by + 1, (bw - 2) * k, bh - 2);
    ctx.font = "7px 'Press Start 2P', monospace";
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(199,154,143,.85)';
    ctx.fillText('SURVIVE', LW/2, by + 12);
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
  ctx.fillText("HE'S HERE", LW/2 + jx, LH*0.5 + jy);
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

// darkness closes in over the survive phase: radius 0.72 → 0.5
function drawVignette(){
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

function drawPaused(){
  ctx.save();
  ctx.fillStyle = 'rgba(4,1,10,.72)';
  ctx.fillRect(0, 0, LW, LH);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = "14px 'Press Start 2P', monospace";
  ctx.fillStyle = COLORS.sulfur;
  ctx.shadowColor = COLORS.sulfur; ctx.shadowBlur = shadowR(12);
  ctx.fillText('PAUSED', LW/2, LH/2 - 12);
  ctx.shadowBlur = 0;
  ctx.font = "7px 'Press Start 2P', monospace";
  ctx.fillStyle = COLORS.ash;
  ctx.fillText(isTouch ? 'Tap to resume' : 'P to resume', LW/2, LH/2 + 14);
  ctx.restore();
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

  // background: the violet night drains toward black as the phase wears on
  var V = RGB.void, M = RGB.midnight;
  ctx.fillStyle = rgba(lerp(V[0], 2, prog), lerp(V[1], 0, prog), lerp(V[2], 8, prog), 1);
  ctx.fillRect(-20, -20, LW+40, LH+40);
  // violet mist above the floor line, breathing with the heart; fire warms it once he is here
  var mist = 0.55 + 0.25 * pulse;
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
  // the floor line
  ctx.strokeStyle = G.inferno ? col('ember', 0.4 + 0.4 * pulse) : col('heart', 0.18 + 0.3 * pulse);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, FLOOR); ctx.lineTo(LW, FLOOR);
  ctx.stroke();

  if (G.lightning > 0 && G.phase === 'devil' && !skip('lightning')) drawLightning();
  if (G.watch && !skip('watch')) drawWatch();

  var taken = G.taken && G.mode === 'ending';
  if (G.devil && !skip('devil')){
    // on lower tiers he is redrawn every 2nd or 3rd frame; the eyes and beams
    // are attack telegraphs, and a frame of lag is well inside their windows
    if (Q.devilEvery > 1 && !G.devil.dead) devilLayer.draw(Math.floor(PERF.total / Q.devilEvery), function(){ drawDevil(G.devil); });
    else drawDevil(G.devil);
  }
  if (G.arms && !taken && !skip('arms')) drawArms();
  if (!skip('flames')) G.flames.forEach(drawFlame);
  G.forks.forEach(drawFork);
  G.loose.forEach(function(L){
    ctx.save(); ctx.translate(L.x, L.y); ctx.rotate(L.rot); ctx.globalAlpha = Math.max(0, 1 - L.t / 3);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#c85a24'; ctx.lineWidth = 3; forkShape(); ctx.restore();
  });
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

  var playerVisible = G.mode === 'play' || (G.mode === 'ending' && G.ending.kind !== 'dead');
  if (taken && G.taken.grabbed){ if (G.arms) drawArms(true); drawPlayer(); }   // cupped: the heart over the fingers
  else { if (playerVisible) drawPlayer(); if (taken && G.arms) drawArms(true); }
  if (taken) drawPointingHand(G.taken.point);
  drawTexts();

  ctx.restore();

  if (G.mode !== 'title' && !skip('vignette')) drawVignette();
  if (G.mode === 'play' && !skip('hud')) drawHUD();
  if (G.herald > 0) drawHerald();
  if (G.flash > 0){
    ctx.fillStyle = 'rgba(255,42,0,' + (G.flash * 0.4) + ')';
    ctx.fillRect(0, 0, LW, LH);
  }
  if (G.white > 0){
    ctx.fillStyle = 'rgba(255,255,255,' + (G.white * 0.55) + ')';
    ctx.fillRect(0, 0, LW, LH);
  }
  if (G.paused) drawPaused();
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
  var d = G.devil, safe = G.mode !== 'play' || G.phase === 'survive' || !d || d.state === 'wait' || d.state === 'open' || d.dead;
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
    if (!G.paused && !window.BTD_FREEZE) update(dt);   // BTD_FREEZE: debug, holds the state for a screenshot
    draw();
  } catch(err){
    PERF.errors++;
    console.error(err);
  }
  perfPush(frameMs, performance.now() - t0);
  adapt(frameMs);
  if (perfShow) drawPerf();
  if (window.BTD_ZOOM){ var Z = window.BTD_ZOOM, S = cvs.width / LW; ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(cvs, Z.x * S, Z.y * S, Z.w * S, Z.h * S, 0, 0, cvs.width, cvs.height); ctx.restore(); }   // BTD_ZOOM: debug magnifier, {x,y,w,h} logical
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

})();
