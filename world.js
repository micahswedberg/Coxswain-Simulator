// Collision, shoreline (keep-out) and win/fail rules. Every threshold is read from config.json.
const World = (() => {
  const D = Math.PI / 180;
  const toLocal = (p, o, deg) => { const a = -deg * D, c = Math.cos(a), s = Math.sin(a), dx = p.x - o.x, dy = p.y - o.y; return { x: dx * c - dy * s, y: dx * s + dy * c }; };
  const inPoly = (p, z) => { let r = false; for (let i = 0, j = z.length - 1; i < z.length; j = i++) { const a = z[i], b = z[j]; if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) r = !r; } return r; };
  const lanes = st => Array.from({ length: st.lanes }, (_, i) => { const t = (i - (st.lanes - 1) / 2) * st.spacing, a = st.angle * D; return { x: st.x + Math.cos(a) * t, y: st.y + Math.sin(a) * t }; });
  const pts = (b, n = 17) => { const c = Physics.center(b), h = b.state.heading, L = b.spec.length / 2; return Array.from({ length: n }, (_, j) => { const i = -1 + 2 * j / (n - 1); return { i, x: c.x + Math.sin(h) * L * i, y: c.y - Math.cos(h) * L * i }; }); };
  const a180 = (a, b) => { const d = (((a - b) % 180) + 180) % 180; return Math.min(d, 180 - d); };
  const a360 = (a, b) => Math.abs((((a - b) % 360) + 540) % 360 - 180);

  function check(b, sc, cfg, v) {
    const P = pts(b), hd = b.state.heading / D;
    const res = (status, reason, C, ang) => ({ status, reason, v, ang, C });
    const bad = (C, ang) => ang > C.maxAngle, fast = C => Math.abs(v.vF) > C.maxFwd || Math.abs(v.vL) > C.maxLat;
    const why = (C, ang) => ((fast(C) ? 'Approached too fast.' : '') + (bad(C, ang) ? ' Approach angle is outside the limit.' : '')).trim();
    for (const p of P) {
      for (const z of sc.keepouts) if (inPoly(p, z)) return res('Failure', 'Aground: you entered a keep-out zone.');
      for (const u of sc.buoys) if (Math.hypot(p.x - u.x, p.y - u.y) < 0.8) return res('Failure', 'You hit a buoy.');
      for (const o of sc.boats) for (let j = -4; j <= 4; j++) {
        const q = { x: o.x + Math.sin(o.heading * D) * o.len / 8 * j, y: o.y - Math.cos(o.heading * D) * o.len / 8 * j };
        if (Math.hypot(p.x - q.x, p.y - q.y) < 1.2) return res('Failure', 'You collided with another boat.');
      }
    }
    for (const d of sc.docks) {                                   // long-side docking
      const C = cfg.dock, hw = d.w / 2, hh = d.h / 2, R = b.spec.width / 2 + 0.2, ang = a180(hd, d.angle), ok = !fast(C) && !bad(C, ang);
      let near = 0, side = false, end = '';
      const mid = P.filter(p => Math.abs(p.i) <= 0.5).length;
      for (const p of P) {
        const l = toLocal(p, d, d.angle), ex = Math.max(Math.abs(l.x) - hw, 0), ey = Math.max(Math.abs(l.y) - hh, 0), dist = Math.hypot(ex, ey);
        if (dist < R) { if (Math.abs(p.i) <= 0.75 && ey === 0) side = true; else end = Math.abs(p.i) > 0.75 ? 'Bow or stern struck the dock.' : 'You hit the end of the dock.'; }
        if (Math.abs(p.i) <= 0.5 && ey === 0 && dist < R + C.buffer) near++;
      }
      if (side) return ok ? res('Win', 'Parked alongside the dock.', C, ang) : res('Failure', why(C, ang), C, ang);   // long side touched
      if (end) return res('Failure', end, C, ang);
      if (near === mid && ok) return res('Win', 'Parked alongside the dock.', C, ang);   // buffer-zone win
    }
    for (const st of sc.stakeboats) {                             // stern-first stakeboat start
      const C = cfg.stake, ang = a360(hd, st.angle), ok = !fast(C) && !bad(C, ang), S = P[0];
      for (const q of lanes(st)) {
        const dd = Math.hypot(S.x - q.x, S.y - q.y);
        if (dd < 0.5) return ok ? res('Win', 'Stern is on the stakeboat.', C, ang) : res('Failure', why(C, ang), C, ang);
        if (dd < 0.5 + C.buffer && ok) return res('Win', 'Stern is on the stakeboat.', C, ang);
      }
    }
    return null;
  }
  return { check, toLocal, inPoly, lanes };
})();
if (typeof module !== 'undefined') module.exports = World;
