// audio.js — Web Audio synthesis for Beat the Devil.
// Sound effects and a chiptune sequencer that is slaved to the game's
// heartbeat: the game calls music.beat() on every "lub" and the sequencer
// schedules one beat's worth of steps from that moment. Everything is
// generated at runtime; there are no audio assets. Exposes window.BTD_AUDIO.
(function(){
"use strict";

var actx = null, master = null, sfxBus = null, musicBus = null, noiseBuf = null;
var heartBus = null, heartFilter = null;   // the heartbeat has its own bus so it can be muffled
var muted = false;
var MASTER_GAIN = 0.28, MUSIC_GAIN = 0.5, HEART_GAIN = 1.3;

function ctx(){
  if (!actx){
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      actx = new AC();
      var comp = actx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 5;
      comp.attack.value = 0.004; comp.release.value = 0.18;
      comp.connect(actx.destination);
      master = actx.createGain();
      master.gain.value = muted ? 0 : MASTER_GAIN;
      master.connect(comp);
      sfxBus = actx.createGain(); sfxBus.gain.value = 1;   sfxBus.connect(master);
      musicBus = actx.createGain(); musicBus.gain.value = MUSIC_GAIN; musicBus.connect(master);
      heartFilter = actx.createBiquadFilter(); heartFilter.type = 'lowpass'; heartFilter.frequency.value = 20000;
      heartBus = actx.createGain(); heartBus.gain.value = HEART_GAIN; heartBus.connect(heartFilter); heartFilter.connect(master);
      noiseBuf = actx.createBuffer(1, actx.sampleRate, actx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i=0;i<d.length;i++) d[i] = Math.random()*2 - 1;
    } catch(e){ return null; }
  }
  if (actx.state === 'suspended') actx.resume();
  return actx;
}
function running(){ return actx && actx.state === 'running'; }

// ---------- primitives ----------
// tone({freq, dur, vol, type, slide, attack, filter, q, detune, t, bus})
function tone(o){
  var a = ctx(); if (!a) return;
  var t = o.t == null ? a.currentTime : o.t;
  var osc = a.createOscillator();
  osc.type = o.type || 'square';
  osc.frequency.setValueAtTime(o.freq, t);
  if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slide), t + o.dur);
  if (o.detune) osc.detune.value = o.detune;
  var g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(o.vol == null ? 0.3 : o.vol, t + (o.attack || 0.004));
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  var node = osc;
  if (o.filter){
    var f = a.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = o.filter; f.Q.value = o.q || 0.7;
    osc.connect(f); node = f;
  }
  node.connect(g); g.connect(o.bus || sfxBus);
  osc.start(t); osc.stop(t + o.dur + 0.05);
}
// noise({dur, vol, type, freq, q, slide, attack, t, bus})
function noise(o){
  var a = ctx(); if (!a) return;
  var t = o.t == null ? a.currentTime : o.t;
  var src = a.createBufferSource();
  src.buffer = noiseBuf; src.loop = true;
  var f = a.createBiquadFilter();
  f.type = o.type || 'lowpass'; f.frequency.value = o.freq || 1400;
  if (o.q) f.Q.value = o.q;
  if (o.slide) f.frequency.exponentialRampToValueAtTime(o.slide, t + o.dur);
  var g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(o.vol == null ? 0.3 : o.vol, t + (o.attack || 0.004));
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  src.connect(f); f.connect(g); g.connect(o.bus || sfxBus);
  src.start(t, Math.random()*0.5); src.stop(t + o.dur + 0.05);
}
function later(ms, fn){ setTimeout(fn, ms); }

// ---------- sound effects ----------
var sfx = {
  shoot: function(){
    noise({dur:0.05, vol:0.18, type:'highpass', freq:3000});
    tone({freq:700, slide:2400, dur:0.07, vol:0.16});
    tone({freq:180, slide:60, dur:0.09, vol:0.22, type:'triangle'});
  },
  click: function(){
    tone({freq:1400, dur:0.03, vol:0.12});
    tone({freq:300, slide:120, dur:0.05, vol:0.12, type:'triangle'});
  },
  pop: function(){
    noise({dur:0.12, vol:0.28});
    tone({freq:320, slide:120, dur:0.08, vol:0.2});
  },
  // pitchfork: aim whine, lock tick, throw whoosh, stick thud
  aim:   function(){ tone({freq:1800, slide:2600, dur:0.4, vol:0.05, type:'sine', attack:0.15}); },
  lock:  function(){ tone({freq:2200, dur:0.04, vol:0.14}); tone({freq:1100, dur:0.06, vol:0.1, type:'triangle'}); },
  throwFork: function(){ noise({dur:0.22, vol:0.2, type:'highpass', freq:900, slide:4000}); },
  stick: function(){ noise({dur:0.07, vol:0.14, freq:500}); tone({freq:140, slide:50, dur:0.09, vol:0.14, type:'sine'}); },
  graze: function(){ tone({freq:2400, slide:3400, dur:0.05, vol:0.11, type:'sine'}); },
  lost:  function(){ tone({freq:640, slide:180, dur:0.28, vol:0.16}); },
  clank: function(){
    noise({dur:0.08, vol:0.25, type:'bandpass', freq:3000});
    tone({freq:1800, slide:900, dur:0.1, vol:0.18});
  },
  hurt: function(){
    tone({freq:200, slide:50, dur:0.35, vol:0.5, type:'sawtooth'});
    noise({dur:0.3, vol:0.4});
  },
  // a short wet thud under the hit: a low body, a squelch through a closing lowpass
  wet: function(){
    tone({freq:95, slide:42, dur:0.14, vol:0.45, type:'sine'});
    noise({dur:0.09, vol:0.3, type:'lowpass', freq:700, slide:140, q:1.6, attack:0.006});
    noise({dur:0.05, vol:0.14, type:'bandpass', freq:420, q:3});
  },
  grab: function(){ noise({dur:0.6, vol:0.22, freq:600, slide:120, attack:0.2}); tone({freq:70, slide:38, dur:0.7, vol:0.3, type:'sine', attack:0.15}); },
  volley: function(){ explosion(210, 1.3); noise({dur:0.5, vol:0.5, type:'highpass', freq:800, slide:5000}); },
  // fire: ignite crackle, eruption, breath warning growl, breath roar, ember hiss, bloom
  ignite: function(x){ whoosh(x); },
  crackle: function(x){ crackle(x); },
  erupt:  function(x){ explosion(x, 0.8); },
  impact: function(x, wall){ forkImpact(x, wall); },
  laughter: function(){ return laughter(); },
  breathWarn: function(){ tone({freq:48, slide:110, dur:1.0, vol:0.35, type:'sawtooth', filter:300, attack:0.3}); },
  breath: function(){ noise({dur:0.9, vol:0.45, freq:2200, slide:300, attack:0.03}); },
  jet: function(){ noise({dur:0.85, vol:0.36, type:'bandpass', freq:1400, q:0.8, slide:500, attack:0.02}); tone({freq:160, slide:70, dur:0.5, vol:0.2, type:'sawtooth', filter:400}); },
  emberLand: function(){ noise({dur:0.15, vol:0.08, type:'highpass', freq:5000}); },
  bloom: function(x){ explosion(x, 1); },
  eyeOpen: function(){
    tone({freq:300, slide:1400, dur:0.18, vol:0.2});
    noise({dur:0.12, vol:0.1, type:'highpass', freq:4000});
  },
  watch: function(){ tone({freq:55, dur:1.2, vol:0.18, type:'sine', attack:0.4}); noise({dur:1.1, vol:0.04, type:'bandpass', freq:2600, q:6, attack:0.3}); },
  eye: function(){
    tone({freq:1200, slide:300, dur:0.12, vol:0.4});
    noise({dur:0.1, vol:0.3});
  },
  roar: function(){
    tone({freq:120, slide:45, dur:0.7, vol:0.5, type:'sawtooth'});
    tone({freq:180, slide:60, dur:0.5, vol:0.3, type:'sawtooth'});
    noise({dur:0.6, vol:0.45, freq:900, slide:200});
  },
  laugh: function(){
    [230, 205, 180, 160, 145].forEach(function(f, i){
      later(i*150, function(){
        tone({freq:f, slide:f*0.8, dur:0.12, vol:0.3, type:'sawtooth', filter:1200});
      });
    });
  },
  kill: function(){
    tone({freq:110, slide:40, dur:1.2, vol:0.5, type:'sawtooth'});
    noise({dur:1.1, vol:0.5});
  },
  thunder: function(){ noise({dur:1.4, vol:0.5, freq:500, slide:60}); },
  boss: function(){
    tone({freq:70, slide:45, dur:1.4, vol:0.55, type:'sawtooth'});
    noise({dur:1.4, vol:0.5, freq:500, slide:60});
  },
  pause: function(){ tone({freq:440, dur:0.08, vol:0.15}); },
  win: function(){
    [523,659,784,1046].forEach(function(f,i){ later(i*150, function(){ tone({freq:f, dur:0.28, vol:0.35}); }); });
  },
  over: function(){
    [392,330,262,175].forEach(function(f,i){ later(i*200, function(){ tone({freq:f, dur:0.4, vol:0.35, type:'sawtooth'}); }); });
  }
};

// ---------- music ----------
// Patterns are 16 steps per bar, 4 steps per heartbeat. Tokens: note names
// (D2, Eb2 ...), '.' rest, and for drums 'x' (hit) / 'o' (soft hit).
// There is no kick: the heartbeat is the kick.
var NOTE = {C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11};
function midi(n){ return 440 * Math.pow(2, (n - 69) / 12); }
function parse(bars){
  return bars.join(' ').split(/\s+/).filter(Boolean).map(function(tok){
    if (tok === '.') return 0;
    if (tok === 'x') return 1;
    if (tok === 'o') return 0.55;
    var m = /^([A-G][b#]?)(\d)$/.exec(tok);
    if (!m) throw new Error('bad note token: ' + tok);
    return 12 * (parseInt(m[2], 10) + 1) + NOTE[m[1]];
  });
}

var TRACKS = {
  // Survive phase: sparse D Phrygian. Quiet and patient at a resting pulse,
  // driving once the heart races.
  survive: {
    bars: 4, bed: true, breath: true,
    bass: parse([
      'D2 . . . D2 . . . D2 . . . F2 . Eb2 .',
      'D2 . . . D2 . . . D2 . . . Bb2 . A2 .',
      'F2 . . . F2 . . . F2 . . . G2 . F2 .',
      'A2 . . . Bb2 . . . G2 . F2 . Eb2 . D2 .'
    ]),
    lead: parse([
      'D4 . . . . . . . A4 . . . . . . .',
      'D4 . . . . . . . Eb5 . . . D5 . . .',
      'F4 . . . . . . . C5 . . . . . . .',
      'Eb4 . . . . . . . D5 . . . A4 . . .'
    ]),
    snare: parse([
      '. . . . . . . . x . . . . . . .',
      '. . . . . . . . x . . . . . . .',
      '. . . . . . . . x . . . . . . .',
      '. . . . . . . . x . . . . . x .'
    ]),
    hat: parse([
      '. . o . . . o . . . o . . . o .',
      '. . o . . . o . . . o . . . o .',
      '. . o . . . o . . . o . . . o .',
      '. . o . . . o . . . o . . . o .'
    ])
  },
  // Devil fight: tritones, a sawtooth drone and the rumble underneath.
  devil: {
    bars: 4, bed: true, breath: true, drone: 38, leadType: 'sawtooth', leadDur: 3.2,
    bass: parse([
      'D2 D2 . D2 D2 D2 . Ab2 D2 D2 . D2 Ab2 . A2 .',
      'D2 D2 . D2 D2 D2 . Ab2 F2 F2 . F2 Eb2 . D2 .',
      'D2 D2 . D2 D2 D2 . Ab2 D2 D2 . D2 Ab2 . A2 .',
      'Bb2 Bb2 . Bb2 A2 A2 . A2 Ab2 Ab2 . Ab2 G2 . F2 .'
    ]),
    lead: parse([
      'D5 . . . Eb5 . . . D5 . . . Ab4 . . .',
      'A4 . . . Ab4 . F4 . Eb4 . . . D4 . . .',
      'D5 . . . Eb5 . . . F5 . . . Ab4 . A4 .',
      'Bb4 . . . A4 . . . Ab4 . . . G4 . F4 .'
    ]),
    snare: parse([
      '. . . . x . . . . . . . x . . .',
      '. . . . x . . . . . . . x . . .',
      '. . . . x . . . . . . . x . . .',
      '. . . . x . . . . . . . x . x x'
    ]),
    hat: parse([
      'x . o . x . o . x . o . x . o .',
      'x . o . x . o . x . o . x . o .',
      'x . o . x . o . x . o . x . o .',
      'x . o . x . o . x . o . x o x o'
    ])
  },
  // Title: drone and sparse bells.
  title: {
    bars: 4, drone: 38,
    bell: parse([
      'D5 . . . . . . . . . . . . . . .',
      '. . . . . . . . Ab4 . . . . . . .',
      'F4 . . . . . . . . . . . . . . .',
      '. . . . . . . . Eb4 . . . D4 . . .'
    ])
  },
  // Game over: a slow dirge.
  dirge: {
    bars: 2, drone: 26, bassDur: 7,
    bass: parse([
      'D2 . . . . . . . Ab2 . . . . . . .',
      'F2 . . . . . . . Eb2 . . . . . . .'
    ]),
    bell: parse([
      'D5 . . . . . . . . . . . Ab4 . . .',
      '. . . . F4 . . . . . . . Eb4 . . .'
    ])
  },
  // Victory: bright loop in D.
  win: {
    bars: 2, leadDur: 1.8,
    bass: parse([
      'D2 . . . D2 . . . G2 . . . A2 . . .',
      'D2 . . . D2 . . . Bb2 . . . A2 . . .'
    ]),
    lead: parse([
      'D5 . F#5 . A5 . D6 . B4 . D5 . G5 . A5 .',
      'D5 . F#5 . A5 . D6 . Bb4 . D5 . F5 . A5 .'
    ]),
    hat: parse([
      'o . x . o . x . o . x . o . x .',
      'o . x . o . x . o . x . o . x .'
    ])
  }
};
// sanity: every pattern must span bars*16 steps
Object.keys(TRACKS).forEach(function(k){
  var tr = TRACKS[k], len = tr.bars * 16;
  ['bass','lead','bell','snare','hat'].forEach(function(p){
    if (tr[p] && tr[p].length !== len) throw new Error('track ' + k + '.' + p + ' has ' + tr[p].length + ' steps, expected ' + len);
  });
});

// ----- instruments -----
function bass(t, n, dur){
  tone({freq:midi(n),    t:t, dur:dur, vol:0.34, type:'square',   filter:700, bus:musicBus});
  tone({freq:midi(n-12), t:t, dur:dur, vol:0.22, type:'triangle', bus:musicBus});
}
function lead(t, n, dur, type){
  tone({freq:midi(n), t:t, dur:dur, vol:0.10, type:type||'square', detune:-6, filter:2600, bus:musicBus});
  tone({freq:midi(n), t:t, dur:dur, vol:0.10, type:type||'square', detune: 6, filter:2600, bus:musicBus});
}
function bell(t, n){
  tone({freq:midi(n),   t:t, dur:1.6, vol:0.16, type:'sine', attack:0.01, bus:musicBus});
  tone({freq:midi(n)*3, t:t, dur:0.7, vol:0.04, type:'sine', attack:0.01, bus:musicBus});
}
function snare(t, v){
  noise({t:t, dur:0.14, vol:0.28*v, type:'bandpass', freq:1900, bus:musicBus});
  tone({freq:210, slide:110, t:t, dur:0.09, vol:0.22*v, type:'triangle', bus:musicBus});
}
function hat(t, v){ noise({t:t, dur:0.035, vol:0.12*v, type:'highpass', freq:7000, bus:musicBus}); }
// the heartbeat itself: lub, then a softer dub
function thump(t, v){
  tone({freq:64, slide:36, t:t, dur:0.24, vol:0.75*v, type:'sine', bus:heartBus});
  noise({t:t, dur:0.05, vol:0.06*v, freq:300, bus:heartBus});
}

// ----- sustained layers (drone, rumble bed, breathing, whispers) -----
var layers = [], whisperGain = null;
function layer(nodes, g){ layers.push({ nodes: nodes, g: g }); }
function startDrone(n){
  var a = actx, now = a.currentTime;
  var g = a.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.linearRampToValueAtTime(0.13, now + 1.5);
  var f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 220; f.Q.value = 3;
  var lfo = a.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.13;
  var lg = a.createGain(); lg.gain.value = 140; lfo.connect(lg); lg.connect(f.frequency);
  var o1 = a.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = midi(n);
  var o2 = a.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = midi(n); o2.detune.value = 7;
  var o3 = a.createOscillator(); o3.type = 'square';   o3.frequency.value = midi(n-12);
  o1.connect(f); o2.connect(f); o3.connect(f); f.connect(g); g.connect(musicBus);
  o1.start(); o2.start(); o3.start(); lfo.start();
  layer([o1,o2,o3,lfo], g);
}
function startBed(){
  var a = actx, now = a.currentTime;
  var g = a.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.linearRampToValueAtTime(0.09, now + 2);
  var f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 160;
  var src = a.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  src.connect(f); f.connect(g); g.connect(musicBus); src.start();
  layer([src], g);
}
// something large breathing in the dark, ~0.3 Hz
function startBreath(){
  var a = actx, now = a.currentTime;
  var g = a.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.linearRampToValueAtTime(0.05, now + 3);
  var lfo = a.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.3;
  var lg = a.createGain(); lg.gain.value = 0.045; lfo.connect(lg); lg.connect(g.gain);
  var f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 380; f.Q.value = 1.2;
  var src = a.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  src.connect(f); f.connect(g); g.connect(musicBus); src.start(); lfo.start();
  layer([src, lfo], g);
  // whispers: filtered noise the game fades in late in the survive phase
  var w = a.createGain(); w.gain.value = 0.0001;
  var wf = a.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 2400; wf.Q.value = 10;
  var wl = a.createOscillator(); wl.type = 'sine'; wl.frequency.value = 0.7;
  var wlg = a.createGain(); wlg.gain.value = 700; wl.connect(wlg); wlg.connect(wf.frequency);
  var ws = a.createBufferSource(); ws.buffer = noiseBuf; ws.loop = true;
  ws.connect(wf); wf.connect(w); w.connect(musicBus); ws.start(); wl.start();
  layer([ws, wl], w);
  whisperGain = w;
}
function stopLayers(fade){
  whisperGain = null;
  if (!layers.length) return;
  var a = actx, now = a.currentTime, old = layers; layers = [];
  fade = fade == null ? 0.8 : fade;
  old.forEach(function(L){
    L.g.gain.cancelScheduledValues(now);
    L.g.gain.setValueAtTime(L.g.gain.value, now);
    L.g.gain.linearRampToValueAtTime(0.0001, now + fade);
  });
  later(fade * 1000 + 100, function(){ old.forEach(function(L){ L.nodes.forEach(function(n){ try { n.stop(); } catch(e){} }); }); });
}

// ---------- impacts, explosions, fire voices, his laugh ----------
// pan by arena x (0..420)
function panner(x){
  if (!actx.createStereoPanner) return null;
  var pn = actx.createStereoPanner();
  pn.pan.value = Math.max(-1, Math.min(1, (x / 420) * 2 - 1)) * 0.7;
  return pn;
}
// a pitchfork striking stone: a low sine pitched down fast, a filtered
// clatter. ±15 % pitch and level per hit, panned by x, tighter for walls.
// Never more than three at once.
var thudsLive = 0;
function forkImpact(x, wall){
  if (!running() || thudsLive >= 3) return;
  thudsLive++; later(260, function(){ thudsLive--; });
  var v = 0.85 + Math.random() * 0.3, pv = 0.85 + Math.random() * 0.3;
  var pn = panner(x), bus = sfxBus;
  if (pn){ pn.connect(sfxBus); bus = pn; }
  var f0 = (wall ? 92 : 70) * pv, dur = wall ? 0.14 : 0.22;
  tone({freq: f0, slide: f0 * 0.42, dur: dur, vol: 0.55 * v, type: 'sine', bus: bus});
  noise({dur: wall ? 0.05 : 0.08, vol: 0.28 * v, type: 'bandpass', freq: (wall ? 3200 : 2400) * pv, q: 1.4, bus: bus});
  noise({dur: 0.03, vol: 0.18 * v, type: 'highpass', freq: 5000, bus: bus});
}
// an explosion with weight: sub drop, a mid body through a lowpass that opens
// then closes, a bright crack on the front. Ducks the music underneath.
function explosion(x, size){
  if (!running()) return;
  size = size == null ? 1 : size;
  var a = actx, t = a.currentTime, pn = panner(x == null ? 210 : x), bus = sfxBus;
  if (pn){ pn.connect(sfxBus); bus = pn; }
  tone({freq: 50, slide: 25, dur: 0.4 * size, vol: 0.9 * size, type: 'sine', bus: bus});
  // the body: noise through a lowpass that opens over 60 ms and closes over 400
  var src = a.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  var f = a.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 0.9;
  f.frequency.setValueAtTime(220, t); f.frequency.linearRampToValueAtTime(2600, t + 0.06); f.frequency.exponentialRampToValueAtTime(180, t + 0.5 * size);
  var g = a.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.7 * size, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55 * size);
  src.connect(f); f.connect(g); g.connect(bus); src.start(t, Math.random() * 0.5); src.stop(t + 0.6 * size);
  noise({dur: 0.03, vol: 0.5, type: 'highpass', freq: 3500, bus: bus});
  duckMusic(0.3, 0.05, 0.35);
}
function duckMusic(to, hold, release){
  var t = actx.currentTime;
  musicBus.gain.cancelScheduledValues(t);
  musicBus.gain.setTargetAtTime(MUSIC_GAIN * to, t, 0.01);
  musicBus.gain.setTargetAtTime(MUSIC_GAIN, t + hold, release);
}
// ----- fire voices: each active flame breathes through its own bandpass -----
var fireBus = null, fireVoices = {}, FIRE_MAX = 4;
function fireBusGet(){
  if (!fireBus){ fireBus = actx.createGain(); fireBus.gain.value = 0.7; fireBus.connect(master); }
  return fireBus;
}
function makeFireVoice(x){
  var a = actx, t = a.currentTime;
  var src = a.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  var f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900 + Math.random() * 300; f.Q.value = 0.9;
  var lfo = a.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.25 + Math.random() * 0.4;
  var lg = a.createGain(); lg.gain.value = 260; lfo.connect(lg); lg.connect(f.frequency);
  var g = a.createGain(); g.gain.value = 0.0001;
  var glfo = a.createOscillator(); glfo.type = 'sine'; glfo.frequency.value = 0.4 + Math.random() * 0.5;
  var glg = a.createGain(); glg.gain.value = 0.35; glfo.connect(glg);   // breathes: applied to a second gain stage
  var breathe = a.createGain(); breathe.gain.value = 1; glg.connect(breathe.gain);
  var pn = panner(x);
  src.connect(f); f.connect(g); g.connect(breathe);
  if (pn){ breathe.connect(pn); pn.connect(fireBusGet()); } else breathe.connect(fireBusGet());
  src.start(t, Math.random() * 0.5); lfo.start(); glfo.start();
  return { src: src, f: f, g: g, pn: pn, nodes: [src, lfo, glfo], level: 0 };
}
function killFireVoice(v){
  var a = actx, t = a.currentTime;
  v.g.gain.cancelScheduledValues(t); v.g.gain.setTargetAtTime(0.0001, t, 0.25);
  later(900, function(){ v.nodes.forEach(function(n){ try { n.stop(); } catch(e){} }); });
}
// entries: [{id, x, h (0..1 of full height), dist (px from the heart)}]
function fireUpdate(entries){
  if (!running()) return;
  var a = actx, t = a.currentTime, want = {};
  // the bandpass keeps only a sliver of the noise, so the level sits well above unity
  entries.forEach(function(e){ e.level = e.h * (1 - Math.min(1, e.dist / 520)) * 1.4; });
  entries.sort(function(u, v){ return v.level - u.level; }).slice(0, FIRE_MAX).forEach(function(e){ want[e.id] = e; });
  Object.keys(fireVoices).forEach(function(id){ if (!want[id]){ killFireVoice(fireVoices[id]); delete fireVoices[id]; } });
  Object.keys(want).forEach(function(id){
    var e = want[id], v = fireVoices[id];
    if (!v){ v = fireVoices[id] = makeFireVoice(e.x); }
    v.g.gain.setTargetAtTime(Math.max(0.0001, e.level), t, 0.12);
    if (v.pn) v.pn.pan.setTargetAtTime(Math.max(-1, Math.min(1, (e.x / 420) * 2 - 1)) * 0.7, t, 0.2);
  });
}
// a rising whoosh at ignition, and sparse pops as a fire dies
function whoosh(x){
  if (!running()) return;
  var a = actx, t = a.currentTime, pn = panner(x), bus = sfxBus;
  if (pn){ pn.connect(sfxBus); bus = pn; }
  var src = a.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  var f = a.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
  f.frequency.setValueAtTime(260, t); f.frequency.exponentialRampToValueAtTime(3200, t + 0.35);
  var g = a.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.32, t + 0.12); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
  src.connect(f); f.connect(g); g.connect(bus); src.start(t, Math.random() * 0.5); src.stop(t + 0.55);
}
function crackle(x){
  if (!running()) return;
  var pn = panner(x), bus = sfxBus;
  if (pn){ pn.connect(sfxBus); bus = pn; }
  for (var i=0;i<7;i++){
    var dt = Math.random() * 0.7;
    noise({t: actx.currentTime + dt, dur: 0.012 + Math.random() * 0.02, vol: 0.12 + Math.random() * 0.14, type: 'highpass', freq: 2500 + Math.random() * 3000, bus: bus});
  }
}
// ----- his laugh: a low voice in bursts, a fifth below it detuned, a long tail -----
var reverb = null;
function reverbGet(){
  if (reverb) return reverb;
  var a = actx, len = Math.floor(a.sampleRate * 2.6), buf = a.createBuffer(2, len, a.sampleRate);
  for (var c=0;c<2;c++){ var d = buf.getChannelData(c); for (var i=0;i<len;i++) d[i] = (Math.random()*2-1) * Math.pow(1 - i/len, 2.6) * (i < 400 ? i/400 : 1); }
  var cv = a.createConvolver(); cv.buffer = buf;
  var wet = a.createGain(); wet.gain.value = 0.55; cv.connect(wet); wet.connect(master);
  reverb = { input: cv };
  return reverb;
}
// returns the laugh's length in seconds
function laughter(){
  if (!running()) return 2.4;
  var a = actx, t0 = a.currentTime + 0.02;
  var out = a.createGain(); out.gain.value = 1; out.connect(master); out.connect(reverbGet().input);
  var bursts = [[0.0, 0.2, 108], [0.3, 0.22, 104], [0.64, 0.26, 98], [1.04, 0.3, 90], [1.52, 0.4, 82]];
  [1, 2/3].forEach(function(ratio, vi){
    var o = a.createOscillator(); o.type = 'sawtooth';
    var o2 = a.createOscillator(); o2.type = 'square';
    var lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520; lp.Q.value = 1.2;
    var fm = a.createBiquadFilter(); fm.type = 'bandpass'; fm.frequency.value = 640; fm.Q.value = 2.2;   // a rough "ah"
    var g = a.createGain(); g.gain.setValueAtTime(0.0001, t0);
    o.connect(lp); o2.connect(lp); lp.connect(fm); fm.connect(g); g.connect(out);
    bursts.forEach(function(b){
      var bt = t0 + b[0], bd = b[1], f = b[2] * ratio;
      o.frequency.setValueAtTime(f * 1.06, bt); o.frequency.exponentialRampToValueAtTime(f * 0.94, bt + bd);
      o2.frequency.setValueAtTime(f * 1.06 * (vi ? 1.004 : 1), bt); o2.frequency.exponentialRampToValueAtTime(f * 0.94 * (vi ? 1.004 : 1), bt + bd);
      g.gain.setValueAtTime(0.0001, bt); g.gain.linearRampToValueAtTime(vi ? 0.4 : 0.6, bt + 0.04);
      g.gain.setValueAtTime(vi ? 0.4 : 0.6, bt + bd * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, bt + bd);
    });
    o.start(t0); o2.start(t0); o.stop(t0 + 2.3); o2.stop(t0 + 2.3);
  });
  // duck everything else while it plays
  [sfxBus, musicBus, heartBus].forEach(function(b, i){
    var base = i === 0 ? 1 : (i === 1 ? MUSIC_GAIN : HEART_GAIN);
    b.gain.cancelScheduledValues(t0); b.gain.setTargetAtTime(base * (i === 2 ? 0.5 : 0.22), t0, 0.05);
    b.gain.setTargetAtTime(base, t0 + 2.0, 0.4);
  });
  if (fireBus){ fireBus.gain.setTargetAtTime(0.15, t0, 0.05); fireBus.gain.setTargetAtTime(0.7, t0 + 2.0, 0.4); }
  return 2.3;
}
// bus meters for the mix check: peak of each bus over the last buffer
var meters = null;
function meter(){
  if (!running()) return null;
  if (!meters){
    meters = {};
    [['master', master], ['music', musicBus], ['sfx', sfxBus], ['heart', heartBus], ['fire', fireBusGet()]].forEach(function(p){
      var an = actx.createAnalyser(); an.fftSize = 2048; p[1].connect(an); meters[p[0]] = an;
    });
  }
  var out = {}, buf = new Float32Array(2048);
  Object.keys(meters).forEach(function(k){ meters[k].getFloatTimeDomainData(buf); var pk = 0, rms = 0; for (var i=0;i<buf.length;i++){ var v = Math.abs(buf[i]); if (v > pk) pk = v; rms += buf[i]*buf[i]; } out[k] = { peak: +pk.toFixed(3), rms: +Math.sqrt(rms / buf.length).toFixed(3) }; });
  return out;
}

// ----- sequencer (heartbeat-driven) -----
var seq = { name:null, track:null, step:0 };
var music = {};
function scheduleStep(tr, step, t, spb){
  var n;
  if (tr.bass  && (n = tr.bass[step]))  bass(t, n, spb * (tr.bassDur || 1.6));
  if (tr.lead  && (n = tr.lead[step]))  lead(t, n, spb * (tr.leadDur || 1.6), tr.leadType);
  if (tr.bell  && (n = tr.bell[step]))  bell(t, n);
  if (tr.snare && (n = tr.snare[step])) snare(t, n);
  if (tr.hat   && (n = tr.hat[step]))   hat(t, n);
}
music.play = function(name, force){
  var a = ctx(); if (!a) return;
  if (seq.name === name && !force) return;
  music.stop();
  var tr = TRACKS[name]; if (!tr) return;
  seq.name = name; seq.track = tr; seq.step = 0;
  if (tr.drone) startDrone(tr.drone);
  if (tr.bed) startBed();
  if (tr.breath) startBreath();
};
music.stop = function(fade){
  seq.name = null; seq.track = null;
  stopLayers(fade);
};
music.current = function(){ return seq.name; };
// One heartbeat. period: seconds until the next beat; dub: seconds until the
// second, softer thump; strength: 0..1.6 (a hit sends an oversized beat).
// The track advances four sixteenths from this beat.
music.beat = function(period, dub, strength, silent){
  if (!running()) return;
  var t0 = actx.currentTime + 0.03;
  if (!silent){
    thump(t0, 0.35 + 0.65 * Math.min(1, strength));
    thump(t0 + dub, 0.22 + 0.4 * Math.min(1, strength));
    // the fire ducks under every beat so the heart is never drowned
    if (fireBus){ fireBus.gain.setTargetAtTime(0.28, t0, 0.008); fireBus.gain.setTargetAtTime(0.7, t0 + 0.14, 0.09); }
  }
  var tr = seq.track; if (!tr) return;
  var spb = period / 4, len = tr.bars * 16;
  for (var k=0;k<4;k++){
    scheduleStep(tr, seq.step, t0 + k*spb, spb);
    seq.step = (seq.step + 1) % len;
  }
};
// whispers: 0..1
music.whisper = function(k){
  if (!whisperGain || !running()) return;
  whisperGain.gain.setTargetAtTime(Math.max(0.0001, k * 0.06), actx.currentTime, 0.4);
};
var pausedName = null;
music.pause  = function(){ pausedName = seq.name; music.stop(0.2); };
music.resume = function(){ if (pausedName) music.play(pausedName, true); pausedName = null; };

window.BTD_AUDIO = {
  sfx: sfx,
  music: music,
  unlock: ctx,
  fire: { update: fireUpdate },
  meter: meter,
  setMuted: function(m){ muted = !!m; if (master) master.gain.value = muted ? 0 : MASTER_GAIN; },
  // the beat heard from inside a closed fist
  muffle: function(on){
    if (!heartFilter || !running()) return;
    heartFilter.frequency.setTargetAtTime(on ? 220 : 20000, actx.currentTime, 0.15);
    heartBus.gain.setTargetAtTime(HEART_GAIN * (on ? 0.8 : 1), actx.currentTime, 0.15);
  },
  isMuted: function(){ return muted; }
};

})();
