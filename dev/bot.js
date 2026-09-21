// A deliberately imperfect player for the survive phase.
// - reacts to a 150 ms old snapshot of the hazards
// - skips 20 % of frames entirely
// - scores only 9 candidate positions, coarsely
(function(){
  const LW = 420, LH = 640, FLOOR = 632;
  const press = (key, code) => window.dispatchEvent(new KeyboardEvent('keydown', {key, code, bubbles: true}));
  const errors = [];
  function step(){ try { BTD_STEP(1/60); } catch(e){ if (errors.length < 5) errors.push(String(e.stack || e).slice(0, 300)); } }
  function distSeg(px, py, ax, ay, bx, by){
    const vx = bx - ax, vy = by - ay, L2 = vx*vx + vy*vy || 1;
    const k = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / L2));
    return Math.hypot(px - (ax + vx * k), py - (ay + vy * k));
  }
  // how close a point is to danger, given a snapshot of hazards
  function danger(x, y, snap){
    let worst = 0;
    for (const h of snap){
      let d = 1e9;
      if (h.kind === 'fork'){
        if (h.state === 'fly') d = distSeg(x, y, h.x, h.y, h.x + h.vx * 0.6, h.y + h.vy * 0.6) - 14;
        else { const ang = Math.atan2(h.ty - h.oy, h.tx - h.ox) + h.spread; d = distSeg(x, y, h.ox, h.oy, h.ox + Math.cos(ang) * 900, h.oy + Math.sin(ang) * 900) - 14; if (h.state === 'aim') d += 40; }
      } else if (h.kind === 'walker'){
        const a = Math.min(h.x, h.targetX) - h.w / 2 - 10, b = Math.max(h.x, h.targetX) + h.w / 2 + 10, top = LH - h.hmax - 10;
        const dx = x < a ? a - x : (x > b ? x - b : 0), dy = y < top ? top - y : 0;
        d = Math.hypot(dx, dy);
      } else if (h.kind === 'jet'){
        const dir = { x: -h.side * Math.cos(h.ang || 0.44), y: -Math.sin(h.ang || 0.44) };
        if (h.state === 'aim'){ const a2 = Math.atan2(h.oy - h.ty, Math.max(1, Math.abs(h.tx - h.ox))); const cl = Math.max(0.26, Math.min(0.61, a2)); dir.x = -h.side * Math.cos(cl); dir.y = -Math.sin(cl); }
        d = distSeg(x, y, h.ox, h.oy, h.ox + dir.x * 460, h.oy + dir.y * 460) - 22; if (h.state === 'aim') d += 30;
      } else if (h.kind === 'ember'){
        if (h.state === 'fly') d = distSeg(x, y, h.x, h.y, h.tx, h.ty) - 16;
        else d = Math.hypot(x - h.tx, y - h.ty) - 42;
      }
      const threat = Math.max(0, 1 - Math.max(0, d) / 90);
      if (threat > worst) worst = threat;
    }
    return worst;
  }
  function snapshot(){
    const s = [];
    for (const f of BTD_G.forks) if (f.t >= 0) s.push({ kind: 'fork', state: f.state, x: f.x, y: f.y, vx: f.vx, vy: f.vy, ox: f.ox, oy: f.oy, tx: f.tx, ty: f.ty, spread: f.spread });
    for (const f of BTD_G.flames){
      if (f.type === 'walker' && f.state !== 'die') s.push({ kind: 'walker', x: f.x, targetX: f.targetX, w: f.w, hmax: f.hmax });
      else if (f.type === 'jet') s.push({ kind: 'jet', state: f.state, side: f.side, ox: f.ox, oy: f.oy, tx: f.tx, ty: f.ty, ang: f.ang });
      else if (f.type === 'ember') s.push({ kind: 'ember', state: f.state, x: f.x, y: f.y, tx: f.tx, ty: f.ty });
    }
    return s;
  }
  window.BTD_BOT = function(runs, opts){
    opts = opts || {};
    const delay = opts.delay == null ? 9 : opts.delay, skip = opts.skip == null ? 0.2 : opts.skip;
    const results = [], causes = [];
    for (let r = 0; r < runs; r++){
      if (!opts.resume){ BTD_G.endT = 1; if (BTD_G.mode !== 'play') press(' ', 'Space'); step(); }
      BTD_G.paused = false;
      const history = []; let frames = 0, hits = 0, lastLives = BTD_G.lives, goal = { x: 210, y: 500 };
      const stopAt = opts.stopAtLives == null ? -1 : opts.stopAtLives;
      const maxFrames = opts.frames || 60 * 60;
      while (BTD_G.mode === 'play' && BTD_G.phase === 'survive' && BTD_G.lives > stopAt && frames++ < maxFrames){
        BTD_G.paused = false;
        history.push(snapshot()); if (history.length > delay + 1) history.shift();
        const snap = history[0];
        const p = BTD_G.player;
        if (Math.random() >= skip && frames % 4 === 0){
          // pick the safest of nine coarse candidates, mildly preferring the middle
          let best = null;
          for (const [dx, dy] of [[0,0],[-60,0],[60,0],[0,-60],[0,60],[-60,-60],[60,-60],[-60,60],[60,60],[-120,0],[120,0]]){
            const cx = Math.max(16, Math.min(LW - 16, p.x + dx)), cy = Math.max(LH * 0.25, Math.min(LH - 30, p.y + dy));
            const score = danger(cx, cy, snap) * 10 + Math.abs(cx - 210) / 420 + Math.abs(cy - 460) / 640 + (dx || dy ? 0.05 : 0);
            if (!best || score < best.score) best = { score, x: cx, y: cy };
          }
          goal = best;
        }
        // move toward the goal at player speed (keys are held for the frame)
        const mx = goal.x - p.x, my = goal.y - p.y, m = Math.hypot(mx, my);
        if (m > 3){ p.x += mx / m * Math.min(m, 265 / 60); p.y += my / m * Math.min(m, 265 / 60); }
        if (BTD_G.lives < lastLives){
          hits++; lastLives = BTD_G.lives;
          // what was nearest when it happened
          let near = { kind: '?', d: 1e9 };
          for (const f of BTD_G.forks){ const d = Math.hypot(p.x - f.x, p.y - f.y); if (d < near.d) near = { kind: 'fork:' + f.state, d: d | 0 }; }
          for (const f of BTD_G.flames){
            let d = 1e9, kind = f.type + (f.state ? ':' + f.state : '');
            if (f.type === 'walker') d = Math.hypot(Math.max(0, Math.abs(p.x - f.x) - f.w / 2), Math.max(0, (LH - f.h) - p.y));
            else if (f.type === 'jet' && f.len > 0){ const dir = { x: -f.side * Math.cos(f.ang), y: -Math.sin(f.ang) }; d = distSeg(p.x, p.y, f.ox, f.oy, f.ox + dir.x * f.len, f.oy + dir.y * f.len); }
            else if (f.type === 'ember') d = f.state === 'fly' ? Math.hypot(p.x - f.x, p.y - f.y) : Math.hypot(p.x - f.tx, p.y - f.ty);
            if (d < near.d) near = { kind, d: d | 0 };
          }
          causes.push({ run: r, t: (frames / 60).toFixed(1), near, live: BTD_G.forks.length + 'f/' + BTD_G.flames.map(f => f.type).join(',') });
        }
        step();
      }
      results.push({ run: r, reached: BTD_G.phase === 'devil' && BTD_G.mode === 'play', lives: BTD_G.lives, hits, secs: (frames / 60) | 0, mode: BTD_G.mode, surv: BTD_G.surv.toFixed(1) });
      if (opts.keep) break;   // leave the game where it is
      // let the devil phase end quickly so the next run can start
      if (BTD_G.mode === 'play'){ BTD_G.lives = 0; BTD_G.invuln = 0; BTD_G.flames.push({ type: 'ember', state: 'bloom', x: BTD_G.player.x, y: BTD_G.player.y, tx: BTD_G.player.x, ty: BTD_G.player.y, t: 0, fuse: 1.2 }); for (let k = 0; k < 200; k++) step(); }
      for (let k = 0; k < 200; k++) step();
    }
    try { localStorage.removeItem('btd.hi'); } catch(e){}
    return { errors, results, causes };
  };
})();
