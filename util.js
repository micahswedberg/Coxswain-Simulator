// Shared helpers: JSON IO, geo <-> local-metre conversion. World frame: +x east, +y south, metres, heading 0 = north (clockwise +).
const U = {
  D: Math.PI / 180, MPH: 0.44704,
  json: async u => { const r = await fetch(u); if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); },
  save(name, obj) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' })); a.download = name; a.click(); },
  w2ll: (o, p) => ({ lat: o.lat - p.y / 111111, lng: o.lon + p.x / (111111 * Math.cos(o.lat * Math.PI / 180)) }),
  ll2w: (o, ll) => ({ x: (ll.lng - o.lon) * 111111 * Math.cos(o.lat * Math.PI / 180), y: -(ll.lat - o.lat) * 111111 }),
  zoomFor: (lat, px) => Math.log2(px * 156543.03392 * Math.cos(lat * Math.PI / 180)),   // px per metre -> Leaflet zoom
  scaleFor: (lat, z) => 2 ** z / (156543.03392 * Math.cos(lat * Math.PI / 180)),
  env: sc => ({ windSpeed: sc.wind.mph * U.MPH, windDir: sc.wind.dirDeg * U.D }),         // dirDeg = direction wind blows TOWARD
  fill: sc => Object.assign({ docks: [], buoys: [], keepouts: [], stakeboats: [], boats: [], wind: { mph: 0, dirDeg: 0 } }, sc)
};
