// Coxswain (phone) controller: pick scenario + boat, set oars and rudder, take strokes, see win/fail.
(async () => {
  const $ = id => document.getElementById(id), cv = $('cv');
  const cfg = await U.json('config/config.json'), idx = await U.json('scenarios/index.json');
  const map = L.map('map', { zoomControl: false, attributionControl: false, dragging: false, touchZoom: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, zoomAnimation: false, fadeAnimation: false, zoomSnap: 0, maxZoom: 23 });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxNativeZoom: 19, maxZoom: 23, attribution: '© OpenStreetMap' }).addTo(map);
  const ACT = { easy: 'Sit easy', row: 'Row', back: 'Back', hold: 'Hold', check: 'Light check' }, ORDER = Object.keys(ACT);
  let sc, boat, env, type = '8+', busy = false, done = false, follow = true;
  const view = { cx: 0, cy: 0, scale: 6, rot: 0 }, gi = { all: 0, bow: 0, stern: 0 };
  let active = null;                       // the group button last used; only one group is active at a time

  function draw() {
    if (follow) { const c = Physics.center(boat); view.cx = c.x; view.cy = c.y; }
    Camera.syncMap(map, $('map'), view, sc.origin);
    Render.fit(cv); Render.draw(cv, view, sc, { boat });
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
  const GROUPS = { bow: ['Bow pair', q => q.id <= 2], all: ['All seats', () => true], stern: ['Stern pair', (q, n) => q.id > n - 2] };
  const groupsUI = () => document.querySelectorAll('#presets button[data-g]').forEach(b => b.textContent = GROUPS[b.dataset.g][0] + '\n' + ACT[ORDER[gi[b.dataset.g]]]);
  const clearGroups = () => { Object.keys(gi).forEach(k => gi[k] = 0); active = null; };
  function reset() {
    const s = sc.start || { x: 0, y: 0, heading: 0 };
    boat = Physics.create(cfg, type, { x: s.x, y: s.y, heading: s.heading * U.D }); env = U.env(sc); busy = done = false;
    $('modal').hidden = true; $('rud').value = 0; $('rv').textContent = 'Center'; clearGroups(); follow = true; seatsUI(); groupsUI(); draw();
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
  document.querySelectorAll('#presets button[data-g]').forEach(b => b.onclick = () => {
    const g = b.dataset.g;
    if (active !== g) { boat.seats.forEach(q => q.action = 'easy'); clearGroups(); active = g; }   // switching groups: every seat sits easy, other buttons reset, new group starts at Row
    gi[g] = (gi[g] + 1) % ORDER.length;
    boat.seats.filter(q => GROUPS[g][1](q, boat.seats.length)).forEach(q => q.action = ORDER[gi[g]]); seatsUI(); groupsUI(); draw();
  });
  $('wenough').onclick = () => { boat.seats.forEach(q => q.action = 'easy'); clearGroups(); seatsUI(); groupsUI(); draw(); };   // "Weigh enough": everyone sits easy
  $('rud').oninput = e => { const v = +e.target.value; boat.state.rudder = v; $('rv').textContent = v ? Math.abs(v) + '° ' + (v > 0 ? 'right' : 'left') : 'Center'; };
  $('go').onclick = stroke; $('reset').onclick = reset; $('m-retry').onclick = reset; $('m-close').onclick = () => $('modal').hidden = true;
  const zoom = f => { view.scale = Math.min(40, Math.max(1, view.scale * f)); draw(); };
  $('zin').onclick = () => zoom(1.3); $('zout').onclick = () => zoom(1 / 1.3);
  $('north').onclick = () => { view.rot = 0; draw(); }; $('fol').onclick = () => { follow = true; draw(); };
  Camera.attach(cv, view, { limits: [1, 40], change: k => { if (k === 'pan') follow = false; }, draw: () => boat && draw() });
  addEventListener('resize', () => { map.invalidateSize(); if (boat) draw(); });
  const want = new URLSearchParams(location.search).get('s') || idx.scenarios[0].file;
  $('scn').value = want; await load(want);
})().catch(e => { document.body.insertAdjacentHTML('afterbegin', `<p style="padding:12px;color:#fca5a5">Could not start: ${e.message}</p>`); });
