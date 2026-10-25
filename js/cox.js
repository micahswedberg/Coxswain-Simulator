// Coxswain (phone) controller: pick scenario + boat, set oars and rudder, take strokes, see win/fail.
(async () => {
  const $ = id => document.getElementById(id), cv = $('cv');
  const cfg = await U.json('config/config.json'), idx = await U.json('scenarios/index.json');
  const map = L.map('map', { zoomControl: true, dragging: true, touchZoom: true, scrollWheelZoom: true, doubleClickZoom: true, boxZoom: false, keyboard: false, zoomSnap: 0, maxZoom: 23 });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxNativeZoom: 19, maxZoom: 23, attribution: '© OpenStreetMap' }).addTo(map);
  const ACT = { easy: 'Easy', row: 'Row', back: 'Back', hold: 'Hold', check: 'Check' }, ORDER = Object.keys(ACT);
  let sc, boat, env, type = '8+', scale = 6, busy = false, done = false;

  function draw() {
    const c = Physics.center(boat), o = sc.origin;
    map.setView(U.w2ll(o, c), U.zoomFor(o.lat, scale), { animate: false });
    Render.fit(cv); Render.draw(cv, { cx: c.x, cy: c.y, scale }, sc, { boat });
    $('spd').textContent = Math.hypot(boat.state.vx, boat.state.vy).toFixed(1) + ' m/s';
  }
  function seatsUI() {
    const box = $('seats'); box.innerHTML = '<i>Port</i><i>Starboard</i>';
    for (let p = 0; p < boat.seats.length / 2; p++) for (const id of [2 * p + 2, 2 * p + 1]) {
      const q = boat.seats[id - 1], b = document.createElement('button');
      b.className = 'seat a-' + q.action; b.textContent = `${id}  ${ACT[q.action]}`;
      b.onclick = () => { q.action = ORDER[(ORDER.indexOf(q.action) + 1) % ORDER.length]; seatsUI(); draw(); };
      box.append(b);
    }
  }
  function reset() {
    const s = sc.start || { x: 0, y: 0, heading: 0 };
    boat = Physics.create(cfg, type, { x: s.x, y: s.y, heading: s.heading * U.D }); env = U.env(sc); busy = done = false;
    $('modal').hidden = true; $('rud').value = 0; $('rv').textContent = 'Center'; seatsUI(); map.invalidateSize(); draw();
  }
  async function load(file) { sc = U.fill(await U.json('scenarios/' + file)); reset(); }
  function end(r) {
    busy = false; done = true; draw();
    const win = r.status === 'Win', f = (x, m) => x.toFixed(2) + ' m/s' + (m != null ? ` (limit ${m})` : '');
    $('modal').className = win ? 'win' : 'fail'; $('m-t').textContent = win ? 'Docked' : 'Failed'; $('m-r').textContent = r.reason;
    $('m-s').innerHTML = `Forward ${f(Math.abs(r.v.vF), r.C && r.C.maxFwd)}<br>Sideways ${f(Math.abs(r.v.vL), r.C && r.C.maxLat)}` + (r.C ? `<br>Angle off ${r.ang.toFixed(0)}° (limit ${r.C.maxAngle}°)` : '');
    $('modal').hidden = false;
  }
  function stroke() {                     // one stroke = strokeSeconds of simulated time, animated over ~40 substeps
    if (busy || done) return; busy = true; const dt = cfg.physics.strokeSeconds / 40; let n = 0;
    (function frame() {
      for (let j = 0; j < 2; j++) { const v = Physics.step(boat, env, cfg, dt), r = World.check(boat, sc, cfg, v); n++; if (r) return end(r); }
      draw(); if (n < 40) requestAnimationFrame(frame); else busy = false;
    })();
  }
  idx.scenarios.forEach(s => $('scn').add(new Option(s.name, s.file)));
  $('scn').onchange = e => load(e.target.value);
  document.querySelectorAll('#boatsel button').forEach(b => b.onclick = () => { type = b.dataset.t; document.querySelectorAll('#boatsel button').forEach(x => x.classList.toggle('on', x === b)); reset(); });
  document.querySelectorAll('#presets button').forEach(b => b.onclick = () => { boat.seats.forEach(q => q.action = b.dataset.a); seatsUI(); draw(); });
  $('rud').oninput = e => { const v = +e.target.value; boat.state.rudder = v; $('rv').textContent = v ? Math.abs(v) + '° ' + (v > 0 ? 'right' : 'left') : 'Center'; };
  $('go').onclick = stroke; $('reset').onclick = reset; $('m-retry').onclick = reset; $('m-close').onclick = () => $('modal').hidden = true;
  $('zin').onclick = () => { scale = Math.min(20, scale * 1.3); draw(); }; $('zout').onclick = () => { scale = Math.max(1.5, scale / 1.3); draw(); };
  addEventListener('resize', () => { map.invalidateSize(); if (boat) draw(); });
  const want = new URLSearchParams(location.search).get('s') || idx.scenarios[0].file;
  $('scn').value = want; await load(want);
})().catch(e => { document.body.insertAdjacentHTML('afterbegin', `<p style="padding:12px;color:#fca5a5">Could not start: ${e.message}</p>`); });
