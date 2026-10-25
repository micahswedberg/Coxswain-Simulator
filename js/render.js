// Canvas drawing shared by the coxswain and coach views. The canvas sits over a Leaflet map; both share one metre-based camera.
const Render = {
  fit(cv) { const r = cv.parentElement.getBoundingClientRect(), k = devicePixelRatio || 1, w = Math.round(r.width * k), h = Math.round(r.height * k); if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; } },
  hull(c, L, W, fill, line, k) { c.beginPath(); c.ellipse(0, 0, Math.max(W, 7 / k) / 2, L / 2, 0, 0, 7); if (fill) { c.fillStyle = fill; c.fill(); } c.lineWidth = 1.5 / k; c.strokeStyle = line; c.stroke(); },
  draw(cv, view, sc, o = {}) {
    const c = cv.getContext('2d'), r = devicePixelRatio || 1, W = cv.width / r, H = cv.height / r, k = view.scale, sel = o.sel && o.sel.o, SEL = '#7fd1c7';
    c.setTransform(r, 0, 0, r, 0, 0); c.clearRect(0, 0, W, H); c.save();
    c.translate(W / 2, H / 2); c.scale(k, k); c.translate(-view.cx, -view.cy);
    const poly = (z, close) => { c.beginPath(); z.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); if (close) c.closePath(); };
    for (const z of sc.keepouts) { poly(z, true); c.fillStyle = 'rgba(239,68,68,.35)'; c.fill(); c.lineWidth = (z === sel ? 3 : 1.5) / k; c.strokeStyle = z === sel ? SEL : '#ef4444'; c.stroke(); }
    if (o.draft && o.draft.length) { poly(o.draft, false); c.strokeStyle = '#fff'; c.lineWidth = 2 / k; c.stroke(); o.draft.forEach(p => { c.beginPath(); c.arc(p.x, p.y, 3 / k, 0, 7); c.fillStyle = '#fff'; c.fill(); }); }
    for (const d of sc.docks) { c.save(); c.translate(d.x, d.y); c.rotate(d.angle * U.D); c.fillStyle = '#8b5a2b'; c.fillRect(-d.w / 2, -d.h / 2, d.w, d.h); if (d === sel) { c.strokeStyle = SEL; c.lineWidth = 2 / k; c.strokeRect(-d.w / 2, -d.h / 2, d.w, d.h); } c.restore(); }
    for (const s of sc.stakeboats) {
      const Ls = World.lanes(s);
      Ls.forEach(p => { c.save(); c.translate(p.x, p.y); c.rotate(s.angle * U.D); c.fillStyle = '#a16207'; c.fillRect(-0.9, 0, 1.8, 2.5); c.restore(); });
      c.beginPath(); c.moveTo(Ls[0].x, Ls[0].y); c.lineTo(Ls[Ls.length - 1].x, Ls[Ls.length - 1].y); c.strokeStyle = s === sel ? SEL : '#fff'; c.lineWidth = 2 / k; c.stroke();
    }
    for (const u of sc.buoys) { c.beginPath(); c.arc(u.x, u.y, Math.max(0.5, 5 / k), 0, 7); c.fillStyle = '#ff7a1a'; c.fill(); if (u === sel) { c.strokeStyle = SEL; c.lineWidth = 2 / k; c.stroke(); } }
    for (const b of sc.boats) { c.save(); c.translate(b.x, b.y); c.rotate(b.heading * U.D); Render.hull(c, b.len, 0.6, '#a78bfa', b === sel ? SEL : '#6d28d9', k); c.restore(); }
    if (sc.start && !o.boat) { c.save(); c.translate(sc.start.x, sc.start.y); c.rotate(sc.start.heading * U.D); c.setLineDash([4 / k, 3 / k]); Render.hull(c, o.startLen || 17.5, 0.6, 'rgba(254,240,138,.3)', sc.start === sel ? SEL : '#fef08a', k); c.restore(); }
    if (o.boat) {
      const b = o.boat, ct = Physics.center(b), L = b.spec.length, COL = { row: '#4ade80', back: '#60a5fa', hold: '#ef4444', check: '#fbbf24', easy: '#cbd5e1' };
      c.save(); c.translate(ct.x, ct.y); c.rotate(b.state.heading);
      Render.hull(c, L, b.spec.width, '#fef08a', '#ca8a04', k);
      for (const q of b.seats) {
        const dir = q.xOff > 0 ? 1 : -1, a = { row: -0.5, back: 0.5, hold: 0, check: 0, easy: 1.2 }[q.action], x0 = dir * 0.3, y0 = -q.y;
        c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0 + dir * Math.cos(a) * 2.5, y0 + Math.sin(a) * 2.5);
        c.strokeStyle = COL[q.action]; c.lineWidth = Math.max(0.18, 2.5 / k); c.stroke();
      }
      [[0, L / 2 - 0.4, '#fff'], [-0.6, -L / 2 + 0.6, '#ef4444'], [0.6, -L / 2 + 0.6, '#22c55e']].forEach(([x, y, f]) => { c.beginPath(); c.arc(x, y, 0.3, 0, 7); c.fillStyle = f; c.fill(); });   // stern white, bow port red / starboard green
      c.restore();
    }
    c.restore();
    const x = W - 46, y = 46;                                   // wind compass: arrow points where the wind blows toward
    c.fillStyle = 'rgba(11,37,48,.8)'; c.beginPath(); c.arc(x, y, 30, 0, 7); c.fill();
    c.save(); c.translate(x, y); c.rotate(sc.wind.dirDeg * U.D - Math.PI / 2); c.strokeStyle = c.fillStyle = '#e6f4f1'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(-16, 0); c.lineTo(8, 0); c.stroke(); c.beginPath(); c.moveTo(16, 0); c.lineTo(6, -6); c.lineTo(6, 6); c.fill(); c.restore();
    c.fillStyle = '#e6f4f1'; c.font = '12px system-ui'; c.textAlign = 'center'; c.fillText(sc.wind.mph + ' mph', x, y + 46);
  }
};
