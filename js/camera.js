// Shared camera. view = { cx, cy (world metres at screen centre), scale (px per metre), rot (radians, clockwise) }.
// Drives the Leaflet backdrop (rotated with CSS) and handles touch / mouse gestures for both the coxswain and coach pages.
const Camera = {
  toWorld(v, el, sx, sy) { const r = el.getBoundingClientRect(), x = sx - r.width / 2, y = sy - r.height / 2, c = Math.cos(-v.rot), s = Math.sin(-v.rot); return { x: v.cx + (x * c - y * s) / v.scale, y: v.cy + (x * s + y * c) / v.scale }; },
  anchor(v, el, wp, sx, sy) { const r = el.getBoundingClientRect(), x = sx - r.width / 2, y = sy - r.height / 2, c = Math.cos(-v.rot), s = Math.sin(-v.rot); v.cx = wp.x - (x * c - y * s) / v.scale; v.cy = wp.y - (x * s + y * c) / v.scale; },
  // Leaflet sits in an oversized, CSS-rotated box so no corner shows through when the map is turned.
  syncMap(map, el, v, base) {
    const p = el.parentElement.getBoundingClientRect(), D = Math.ceil(Math.hypot(p.width, p.height));
    Object.assign(el.style, { width: D + 'px', height: D + 'px', left: (p.width - D) / 2 + 'px', top: (p.height - D) / 2 + 'px', transform: `rotate(${v.rot}rad)` });
    if (el._D !== D) { el._D = D; map.invalidateSize(false); }
    map.setView(U.w2ll(base, { x: v.cx, y: v.cy }), U.zoomFor(base.lat, v.scale), { animate: false });
  },
  // Handlers h: { lockRot()->bool (true ignores rotate gestures), limits:[min,max], grab(world,e)->dragFn(dxWorld,dyWorld)|null, tap(world,e), change(kind), draw() }
  // One finger / left mouse: drag object (if grab returns one) else pan. Two fingers: pinch zoom + twist rotate. Wheel: zoom. Shift-drag or right-drag: rotate.
  attach(el, v, h = {}) {
    const P = new Map(), lim = h.limits || [0.1, 60]; let g = null;
    const rel = e => { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const w = s => Camera.toWorld(v, el, s.x, s.y), clamp = x => Math.min(lim[1], Math.max(lim[0], x));
    const mid = ([a, b]) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }), dist = ([a, b]) => Math.hypot(b.x - a.x, b.y - a.y), ang = ([a, b]) => Math.atan2(b.y - a.y, b.x - a.x);
    const change = k => h.change && h.change(k), redraw = () => h.draw && h.draw();
    el.style.touchAction = 'none';
    el.addEventListener('contextmenu', e => e.preventDefault());
    el.addEventListener('pointerdown', e => {
      el.setPointerCapture(e.pointerId); const s = rel(e); P.set(e.pointerId, s);
      if (P.size === 1) { const rot = e.button === 2 || e.shiftKey; g = { moved: 0, rotate: rot, drag: !rot && h.grab ? h.grab(w(s), e) : null }; }
      else { g.drag = null; g.moved = 99; }
    });
    el.addEventListener('pointermove', e => {
      const old = P.get(e.pointerId); if (!old) return; const s = rel(e);
      if (P.size === 1) {
        g.moved += Math.hypot(s.x - old.x, s.y - old.y);
        if (g.rotate) { if (!(h.lockRot && h.lockRot())) { v.rot += (s.x - old.x) * 0.01; change('rot'); } }
        else if (g.drag) { const a = w(old), b = w(s); g.drag(b.x - a.x, b.y - a.y); }
        else if (g.moved > 3) { Camera.anchor(v, el, w(old), s.x, s.y); change('pan'); }
      } else if (P.size === 2) {
        const ids = [...P.keys()], o = ids.map(i => P.get(i)); P.set(e.pointerId, s); const n = ids.map(i => P.get(i)), a = w(mid(o)), m = mid(n);
        if (dist(o) > 0) { v.scale = clamp(v.scale * dist(n) / dist(o)); if (!(h.lockRot && h.lockRot())) v.rot += ang(n) - ang(o); }
        Camera.anchor(v, el, a, m.x, m.y); change('pinch');
      }
      P.set(e.pointerId, s); redraw();
    });
    const up = e => { if (!P.has(e.pointerId)) return; const s = rel(e); P.delete(e.pointerId); if (P.size === 0 && g.moved < 6 && !g.rotate && e.type === 'pointerup' && h.tap) h.tap(w(s), e); else if (P.size === 1) g.moved = 99; };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', e => { e.preventDefault(); const s = rel(e), a = w(s); v.scale = clamp(v.scale * Math.exp(-e.deltaY * 0.0015)); Camera.anchor(v, el, a, s.x, s.y); change('zoom'); redraw(); }, { passive: false });
  }
};
if (typeof module !== 'undefined') module.exports = Camera;
