// The Warden: a knight in black iron, looming out of the dark, his legs lost
// in his cloak. A horned great helm with a fire in its slit; a lantern
// hanging from his left fist (the target: shuttered but for its windows); a
// flail in his right. Both hang on chains, and both swing as he moves.
var WARDEN = { Y: 142, LAMP_FIST: [74, 42], FLAIL_FIST: [-94, 70], SHOULDER: [92, 16], BONES: [40, 38],
               LAMP_CHAIN: 20, LAMP_T: 22, LAMP_W: 17, FLAIL_LEN: 30, FLAIL_BALL: 13 };
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
    // the fire lights in his helm's slit, then he roars
    w.eyes = Math.min(1, w.st / 0.4);
    if (!w.lit && w.st > 0.12){ w.lit = true; w.flare = 1; sfx.wardenEyes(); }
    if (!w.roared && w.st > 0.75){ w.roared = true; sfx.roar(); G.shake = 0.8; w.lamp.om += 3; }
    if (w.st > 1.8){
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
      if (Math.abs(p.x - bm.x) < 18 + 8 && p.y > L.y) hurt('burn', bm.x, p.y - 30);
      if (bm.t >= 0.6) bm.state = 'done';
    }
    if (bm.state === 'done' && st > 2.2) wardenOpen(w);
  } else {
    // he calls up his knights: a rank of spears under the heart, or a pair of crossbows
    if (!w.summoned){ w.summoned = true; w.knightsN++; w.flare = 0.7; if (w.knightsN % 2) spawnSpears(3); else spawnXbows(2); }
    if (st > 2.4 && !G.flames.some(function(f){ return f.type === 'spears' || f.type === 'xbows'; })) wardenOpen(w);
  }
}
// is this point on his armour? (bolts go through his cloak)
function wardenArmour(w, x, y){
  var P = wardenPose(w), dx = x - P.x, dy = y - P.y, ax = Math.abs(dx);
  if (ax < 27 && dy > -104 && dy < -22) return true;                 // the helm
  if (ax > 18 && ax < 122 && dy > -44 && dy < 22) return true;       // the pauldrons
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
