// Coach (laptop) controller: pick a place, build a scenario, set wind, edit global settings, export JSON files for GitHub.
(async () => {
  const $ = id => document.getElementById(id), cv = $('cv');
  let cfg = await U.json('config/config.json');
  const blank = () => ({ name: 'New scenario', origin: null, wind: { mph: 8, dirDeg: 180 }, start: null, docks: [], buoys: [], keepouts: [], stakeboats: [], boats: [] });
  let sc = blank(), sel = null, tool = 'select', draft = [], drag = null;
  const map = L.map('map', { zoomSnap: 0, zoomDelta: 0.5, maxZoom: 23, doubleClickZoom: false }).setView([36.1252, -97.2048], 17);
  const base = { Map: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxNativeZoom: 19, maxZoom: 23, attribution: '© OpenStreetMap' }),
    Satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxNativeZoom: 19, maxZoom: 23, attribution: 'Esri' }) };
  base.Map.addTo(map); L.control.layers(base).addTo(map);

  const KIND = { dock: 'docks', buoy: 'buoys', stake: 'stakeboats', boat: 'boats' };
  const HINT = { select: 'Click an object to edit it, drag to move it. Drag empty map to pan.', start: 'Click where the boat starts.', dock: 'Click to place a dock.', buoy: 'Click to place a buoy.',
    keepout: 'Click each corner along the shoreline or hazard, then Finish shape (or press Enter).', stake: 'Click to place the stakeboat line. Set lanes and spacing on the right.', boat: 'Click to place a boat to avoid.' };
  const FIELDS = { docks: ['w', 'h', 'angle'], stakeboats: ['angle', 'lanes', 'spacing'], boats: ['len', 'heading'], start: ['heading'] };
  const origin = () => sc.origin || { lat: map.getCenter().lat, lon: map.getCenter().lng };
  const pxm = () => U.scaleFor(origin().lat, map.getZoom());

  function draw() {
    const o = origin(), c = U.ll2w(o, map.getCenter());
    Render.fit(cv); Render.draw(cv, { cx: c.x, cy: c.y, scale: pxm() }, sc, { sel, draft, startLen: cfg.boats['8+'].length });
  }
  function pick(p) {
    const r = 12 / pxm(), dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    if (sc.start && dist(p, sc.start) < Math.max(r, 4)) return { kind: 'start', o: sc.start };
    for (const o of sc.buoys) if (dist(p, o) < Math.max(r, 1.5)) return { kind: 'buoys', o };
    for (const o of sc.docks) { const l = World.toLocal(p, o, o.angle); if (Math.abs(l.x) <= o.w / 2 + r && Math.abs(l.y) <= o.h / 2 + r) return { kind: 'docks', o }; }
    for (const o of sc.stakeboats) if (World.lanes(o).some(q => dist(p, q) < Math.max(r, 2.5))) return { kind: 'stakeboats', o };
    for (const o of sc.boats) if (dist(p, o) < Math.max(o.len / 2, r)) return { kind: 'boats', o };
    for (const o of sc.keepouts) if (World.inPoly(p, o)) return { kind: 'keepouts', o };
    return null;
  }
  function inspect() {
    const box = $('insp'); box.innerHTML = '';
    if (!sel) { box.textContent = 'Nothing selected.'; return; }
    (FIELDS[sel.kind] || []).forEach(f => {
      const l = document.createElement('label'), i = document.createElement('input'); l.textContent = f + (f === 'angle' || f === 'heading' ? ' (deg)' : f === 'lanes' ? '' : ' (m)');
      i.type = 'number'; i.step = 'any'; i.value = sel.o[f];
      i.oninput = () => { sel.o[f] = f === 'lanes' ? Math.max(1, Math.round(+i.value) || 1) : +i.value; draw(); }; l.append(i); box.append(l);
    });
    const b = document.createElement('button'); b.textContent = 'Delete'; b.onclick = del; if (sel.kind !== 'start') box.append(b); else { b.onclick = del; box.append(b); }
  }
  function del() { if (!sel) return; if (sel.kind === 'start') sc.start = null; else sc[sel.kind] = sc[sel.kind].filter(x => x !== sel.o); sel = null; inspect(); draw(); }
  function setTool(t) {
    tool = t; draft = []; document.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
    $('hint').textContent = HINT[t]; $('fin').classList.toggle('show', t === 'keepout'); map.getContainer().style.cursor = t === 'select' ? '' : 'crosshair'; draw();
  }
  function finish() { if (draft.length >= 3) { sc.keepouts.push(draft); sel = { kind: 'keepouts', o: draft }; } draft = []; setTool('select'); inspect(); }
  function place(p) {
    if (tool === 'select') return;
    if (tool === 'keepout') { draft.push(p); return draw(); }
    if (tool === 'start') { sc.start = { x: p.x, y: p.y, heading: 0 }; sel = { kind: 'start', o: sc.start }; }
    else {
      const o = { dock: { x: p.x, y: p.y, w: 3, h: 25, angle: 0 }, buoy: { x: p.x, y: p.y }, stake: { x: p.x, y: p.y, angle: 0, lanes: 4, spacing: 5 }, boat: { x: p.x, y: p.y, heading: 0, len: 13 } }[tool];
      sc[KIND[tool]].push(o); sel = { kind: KIND[tool], o };
    }
    setTool('select'); inspect();
  }
  const mv = (o, dx, dy) => Array.isArray(o) ? o.forEach(q => { q.x += dx; q.y += dy; }) : (o.x += dx, o.y += dy);
  map.on('click', e => { const o = origin(), p = U.ll2w(o, e.latlng); if (tool !== 'select') sc.origin = sc.origin || o; place(p); });
  map.on('mousedown', e => { if (tool !== 'select') return; const p = U.ll2w(origin(), e.latlng); sel = pick(p); if (sel) { drag = p; map.dragging.disable(); } inspect(); draw(); });
  map.on('mousemove', e => { if (!drag) return; const p = U.ll2w(origin(), e.latlng); mv(sel.o, p.x - drag.x, p.y - drag.y); drag = p; draw(); });
  map.on('mouseup', () => { drag = null; map.dragging.enable(); });
  map.on('move zoom resize', draw);
  addEventListener('keydown', e => {
    if (/INPUT|SELECT/.test(e.target.tagName)) return;
    if (e.key === 'Delete' || e.key === 'Backspace') del(); else if (e.key === 'Enter' && tool === 'keepout') finish(); else if (e.key === 'Escape') setTool('select');
  });

  const syncUI = () => { $('nm').value = sc.name; $('wmph').value = sc.wind.mph; $('wdir').value = sc.wind.dirDeg; wind(); };
  const wind = () => { sc.wind.mph = +$('wmph').value; sc.wind.dirDeg = +$('wdir').value; $('wm').textContent = sc.wind.mph + ' mph'; $('wd').textContent = sc.wind.dirDeg + '°'; draw(); };
  $('wmph').oninput = $('wdir').oninput = wind;
  $('nm').oninput = e => sc.name = e.target.value;
  document.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => setTool(b.dataset.tool));
  $('fin').onclick = finish;
  document.querySelectorAll('nav button').forEach(b => b.onclick = () => { document.querySelectorAll('.tab').forEach(t => t.hidden = t.id !== b.dataset.tab); document.querySelectorAll('nav button').forEach(x => x.classList.toggle('on', x === b)); });

  // Location: search (OpenStreetMap Nominatim) or device geolocation. Pick the place BEFORE placing objects; the first object fixes the scenario origin.
  $('go').onclick = async () => { const r = await (await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent($('q').value))).json(); if (r[0]) map.setView([+r[0].lat, +r[0].lon], 17); else alert('No match found.'); };
  $('loc').onclick = () => navigator.geolocation.getCurrentPosition(p => map.setView([p.coords.latitude, p.coords.longitude], 17), () => alert('Location unavailable.'));

  // Files
  const slug = () => sc.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'scenario';
  const adopt = o => { sc = U.fill(o); sel = null; draft = []; syncUI(); inspect(); if (sc.origin) map.setView(U.w2ll(sc.origin, sc.start || { x: 0, y: 0 }), 18); draw(); };
  const published = async () => { try { return await U.json('scenarios/index.json'); } catch { return { scenarios: [] }; } };
  (await published()).scenarios.forEach(s => $('pub').add(new Option(s.name, s.file)));
  $('pub').onchange = async e => { if (e.target.value) adopt(await U.json('scenarios/' + e.target.value)); };
  $('new').onclick = () => adopt(blank());
  $('open').onclick = () => $('file').click();
  $('file').onchange = e => { const f = e.target.files[0]; if (f) f.text().then(t => adopt(JSON.parse(t))); e.target.value = ''; };
  $('dl').onclick = () => { if (!sc.origin) return alert('Place at least one object first so the scenario has a location.'); if (!sc.start) alert('Tip: this scenario has no Start position yet.'); U.save(slug() + '.json', sc); };
  $('dli').onclick = async () => { const idx = await published(), f = slug() + '.json'; if (!idx.scenarios.some(s => s.file === f)) idx.scenarios.push({ name: sc.name, file: f }); U.save('index.json', idx); };

  // Settings tab: every numeric value in config.json becomes an input.
  function form(obj, path, host) {
    for (const [k, v] of Object.entries(obj)) {
      if (v && typeof v === 'object') { const h = document.createElement('h4'); h.textContent = path + k; host.append(h); form(v, path + k + '.', host); continue; }
      const l = document.createElement('label'), s = document.createElement('span'), i = document.createElement('input'); s.textContent = k; i.type = 'number'; i.step = 'any'; i.value = v; i.oninput = () => obj[k] = +i.value; l.append(s, i); host.append(l);
    }
  }
  const renderForm = () => { $('form').innerHTML = ''; form(cfg, '', $('form')); };
  $('dlc').onclick = () => U.save('config.json', cfg);
  $('ldc').onclick = () => $('cfile').click();
  $('cfile').onchange = e => { const f = e.target.files[0]; if (f) f.text().then(t => { cfg = JSON.parse(t); renderForm(); draw(); }); e.target.value = ''; };

  renderForm(); syncUI(); inspect(); setTool('select'); map.invalidateSize(); draw();
})().catch(e => alert('Could not start: ' + e.message));
