// ----- chains: a spiked iron ball on a real chain (rules 4 and 11) -----
// From the roof it waits in a hatch, its chain run along the roof to a
// pulley; let go, it falls until the chain runs out, catches with a jolt and
// swings. From the Warden's fist he winds it back along its arc and lets it
// fly. Either way, from the moment it is let go the ball is a pendulum under
// gravity: it slows at the top of each swing, strikes the walls and comes
// back off them, and its chain is a rope of links that trails and bows.
var CHAIN = { G: 1300, BALL: 11, HIT_BALL: 19, HIT_LINK: 11, SWING: 3.0, REEL: 0.5, NODES: 18, BOUNCE: 0.5, DAMP: 0.08, AIM: 0.9, LOCK: 0.22 };
function chainLive(from){ return G.flames.some(function(f){ return f.type === 'chain' && f.from === from; }); }
function spawnChain(){
  var p = G.player, s = p.x < LW / 2 ? 1 : -1;       // the pulley over the heart, toward the middle
  if (Math.random() < 0.35) s = -s;
  var ax = clamp(p.x + s * rnd(40, 150), 26, LW - 26);
  var fl = { type: 'chain', from: 'roof', ax: ax, ay: 9, lmin: 150, lmax: 600, r: CHAIN.BALL, ts: 1, swingT: CHAIN.SWING,
             state: 'aim', t: 0, aimT: CHAIN.AIM, lockT: CHAIN.LOCK, th: 0, om: 0, len: 0, L: 200, A: 1, th0: 0.8, side: 1,
             hx: ax, bx: ax, by: 12, vy: 0, nodes: null, spin: 0, lastTh: 0, wheel: 0, seed: Math.random() };
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
  var p = G.player, sdt = dt * fl.ts;
  if (fl.state === 'aim'){
    if (live) chainPlan(fl);                          // tracks, then freezes at lock: not led
    if (fl.from === 'fist'){
      var e = smooth(fl.t / fl.aimT);                 // he winds it back along its arc
      fl.len = lerp(fl.len0, fl.L, e); fl.th = lerp(fl.thI, fl.th0, e); ballFromAngle(fl);
      ropeStep(fl, dt, 1.02);
    } else { fl.bx = fl.hx + Math.sin(fl.t * 47) * 0.9 * (fl.t / fl.aimT); fl.by = fl.ay + 3; }   // it trembles in its hatch
    if (fl.t >= fl.aimT){ fl.state = 'lock'; fl.t = 0; sfx.lock(); }
  } else if (fl.state === 'lock'){
    if (fl.from === 'roof'){ fl.bx = fl.hx + rnd(-1, 1) * 1.3; }
    else ropeStep(fl, dt, 1.02);
    if (fl.t >= fl.lockT){
      fl.t = 0;
      if (fl.from === 'roof'){
        fl.state = 'drop'; fl.vy = 0; fl.bx = fl.hx; fl.by = fl.ay + 3; fl.len = Math.abs(fl.hx - fl.ax);
        ropeInit(fl, fl.ax, fl.ay, fl.hx, fl.ay + 3);
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
  if (out){
    // it smashes a cage it meets (the soul spills out) and ends a shade
    if (G.cages) G.cages.forEach(function(c){ if (c.state === 'hang' && c.soul && Math.hypot(c.x - fl.bx, c.y - fl.by) < fl.r + 18) smashCage(c, fl); });
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
// souls spilled from a smashed cage wait where they fell, bobbing, to be picked up
function updateStrays(dt){
  var p = G.player;
  for (var i = G.strays.length - 1; i >= 0; i--){
    var s = G.strays[i], damp = Math.max(0, 1 - 3 * dt);
    s.t += dt; s.vx *= damp; s.vy *= damp;
    s.x = clamp(s.x + s.vx * dt, 14, LW - 14);
    s.y = clamp(s.y + s.vy * dt + Math.sin(s.t * 2.4 + s.seed * 6) * 8 * dt, LH * 0.25 + 8, FLOOR - 20);
    if (G.mode !== 'play' || Math.hypot(p.x - s.x, p.y - s.y) > 18){ s.warned = false; continue; }
    if (G.carried.length < STOLEN.CARRY){ G.carried.push({ x: s.x, y: s.y, t: 0, seed: s.seed }); G.strays.splice(i, 1); sfx.cageOpen(); }
    else if (!s.warned){ s.warned = true; addText(p.x, p.y - 30, 'CARRY THEM UP', COLORS.sulfur, 1.1, 7); }
  }
}

// ----- the knights: dark knights rising out of the crust (rules 4 and 11) -----
// Spearmen come up through the floor under the heart and wade after it, a
// pale line over each spear showing how high it will reach; they brace,
// then drive their pikes straight up, one after another. Crossbowmen rise
// off to one side and aim up at it along a pale line; locked, they loose a
// quarrel along that line. Neither leads the heart: it is where the heart
// was at the lock.
var KNIGHT = { RISE: 0.5, AIM: 0.9, LOCK: 0.22, THRUST: 0.1, HOLD: 0.4, PULL: 0.3, SINK: 0.5, GAP: 64, TRACK: 70, STAGGER: 0.18,
               REST: 96, REACH_MIN: 130, REACH_MAX: 360, XAIM: 0.6, QUARREL: 720, SHAFT: 13, SPEAR_DX: 9 };
function spawnSpears(n){
  var p = G.player, offs = n <= 1 ? [0] : (n === 2 ? [0, (Math.random() < 0.5 ? -1 : 1) * KNIGHT.GAP] : [-KNIGHT.GAP, 0, KNIGHT.GAP]);
  var ks = offs.map(function(o){ return { off: o, x: clamp(p.x + o - KNIGHT.SPEAR_DX, 20, LW - 30), st: 'aim', t: 0, rise: 0, reach: 200, tip: KNIGHT.REST, delay: 0, seed: Math.random() }; });
  ks.slice().sort(function(a, b){ return a.x - b.x; }).forEach(function(k, i){ k.delay = i * KNIGHT.STAGGER; });   // left to right, a beat apart
  G.flames.push({ type: 'spears', knights: ks, t: 0 });
  sfx.knightRise(p.x); sfx.aim();
  return true;
}
function spawnXbows(n){
  var p = G.player, ks = [];
  for (var i = 0; i < n; i++){
    var side = (i % 2 ? -1 : 1) * (p.x < LW / 2 ? 1 : -1);
    ks.push({ x: clamp(p.x + side * rnd(90, 170), 24, LW - 24), st: 'aim', t: -i * 0.35, rise: 0, tx: p.x, ty: p.y, ang: -Math.PI / 2, seed: Math.random() });
  }
  G.flames.push({ type: 'xbows', knights: ks, quarrels: [], t: 0 });
  sfx.knightRise(ks[0].x);
  return true;
}
function spearX(k){ return k.x + KNIGHT.SPEAR_DX; }
function xbowAt(k){ return { x: k.x + 3, y: FLOOR - 40 + (1 - k.rise) * 70 }; }
function knightMagma(x){
  for (var i = 0; i < 6; i++) addPart({ x: x + rnd(-14, 14), y: FLOOR - 2, vx: rnd(-40, 40), vy: rnd(-160, -60), life: rnd(0.3, 0.7), t: 0, c: Math.random() < 0.5 ? '#ffb060' : '#ff6a10', r: rnd(1, 2.2), g: 400 });
}
// one frame of a rank or a pair; true when they are gone
function stepKnights(fl, dt, live){
  var p = G.player, done = true;
  fl.knights.forEach(function(k, idx){
    k.t += dt;
    if (k.t < 0){ done = false; return; }                     // waiting its turn under the crust
    if (k.st === 'aim' && k.rise === 0) knightMagma(k.x);
    if (fl.type === 'spears'){
      if (k.st === 'aim'){
        k.rise = Math.min(1, k.rise + dt / KNIGHT.RISE);
        if (live){
          var tx = clamp(p.x + k.off - KNIGHT.SPEAR_DX, 20, LW - 30);
          k.x += clamp(tx - k.x, -KNIGHT.TRACK * dt, KNIGHT.TRACK * dt);
          k.reach = clamp(FLOOR - p.y + 50, KNIGHT.REACH_MIN, KNIGHT.REACH_MAX);
        }
        if (k.t >= KNIGHT.AIM){ k.st = 'lock'; k.t = 0; if (idx === 0) sfx.lock(); }
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
        if (k.t >= KNIGHT.PULL){ k.st = 'sink'; k.t = 0; k.rise0 = k.rise; }
      } else {
        k.rise = Math.max(0, (k.rise0 == null ? 1 : k.rise0) * (1 - k.t / KNIGHT.SINK));
      }
      // the pike, from its tip down into the crust, while it is driven and held
      if (live && (k.st === 'thrust' || k.st === 'hold') && Math.abs(p.x - spearX(k)) < KNIGHT.SHAFT && p.y > FLOOR - k.tip - 6)
        hurt(null, spearX(k), p.y + 20);
    } else {
      var X = xbowAt(k);
      if (k.st === 'aim'){
        k.rise = Math.min(1, k.t / KNIGHT.RISE);
        if (live){ k.tx = p.x; k.ty = p.y; }
        k.ang = Math.atan2(k.ty - X.y, k.tx - X.x);
        if (k.t >= KNIGHT.RISE + KNIGHT.XAIM){ k.st = 'lock'; k.t = 0; sfx.lock(); }
      } else if (k.st === 'lock'){
        if (k.t >= KNIGHT.LOCK){
          k.st = 'shot'; k.t = 0;
          var c = Math.cos(k.ang), s = Math.sin(k.ang);
          fl.quarrels.push({ x: X.x + c * 16, y: X.y + s * 16, vx: c * KNIGHT.QUARREL, vy: s * KNIGHT.QUARREL, ang: k.ang, stuck: false, t: 0 });
          if (live) sfx.xbowTwang(X.x);
        }
      } else if (k.st === 'shot'){
        if (k.t >= 0.45){ k.st = 'sink'; k.t = 0; k.rise0 = k.rise; }
      } else {
        k.rise = Math.max(0, (k.rise0 == null ? 1 : k.rise0) * (1 - k.t / KNIGHT.SINK));
      }
    }
    if (!(k.st === 'sink' && k.rise <= 0)) done = false;
  });
  if (fl.quarrels){
    for (var i = fl.quarrels.length - 1; i >= 0; i--){
      var q = fl.quarrels[i];
      if (q.stuck){ q.t += dt; if (q.t > 1.2) fl.quarrels.splice(i, 1); continue; }
      var ox = q.x, oy = q.y;
      q.x += q.vx * dt; q.y += q.vy * dt;
      if (live && distToSeg(p.x, p.y, ox, oy, q.x, q.y) < 12){ hurt(null, q.x, q.y); fl.quarrels.splice(i, 1); continue; }
      if (q.y < 6 || q.x < 4 || q.x > LW - 4){
        q.stuck = true; q.t = 0; q.x = clamp(q.x, 4, LW - 4); q.y = Math.max(6, q.y);
        if (live) sfx.quarrelThunk(q.x);
      } else if (q.y > LH + 20) fl.quarrels.splice(i, 1);
    }
    if (fl.quarrels.length) done = false;
  }
  return done;
}
