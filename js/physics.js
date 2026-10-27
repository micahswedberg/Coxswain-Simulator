// Boat physics, ported from the original app.js simulateStroke() with identical force models.
// Differences: no DOM; mass, MOI, centre of mass, seat layout and all constants come from config.json and the chosen boat.
const Physics = (() => {
  function create(cfg, type, start) {
    const s = cfg.boats[type], n = s.seats, seats = [];
    let mass = s.hullMass + n * s.rowerMass + s.coxMass, mom = s.coxMass * s.coxY;
    for (let k = 1; k <= n; k++) {            // seat 1 = bow = starboard, alternating port/starboard toward the stern
      const y = s.bowSeatY - (k - 1) * 1.5, stbd = k % 2 === 1;
      mom += s.rowerMass * y;
      seats.push({ id: k, side: stbd ? 'Starboard' : 'Port', xOff: (stbd ? 1 : -1) * cfg.physics.oarOffsetX, y, action: 'easy' });
    }
    const com = mom / mass, h = start.heading || 0;
    seats.forEach(q => q.yOff = q.y - com);   // oar position relative to centre of mass
    return { type, spec: s, seats, mass, com, moi: cfg.physics.yawInertiaScale * (s.hullMass * ((s.length ** 2 + s.width ** 2) / 12 + com ** 2) + s.coxMass * (s.coxY - com) ** 2 + seats.reduce((a, q) => a + s.rowerMass * q.yOff ** 2, 0)),   // yaw inertia from the actual mass layout, x scale for water carried along
      rudderY: -(s.length / 2 - 0.75) - com, power: 1,   // power: fraction of full oar force for Row and Back (set from config.power)
      state: { x: start.x + Math.sin(h) * com, y: start.y - Math.cos(h) * com, vx: 0, vy: 0, heading: h, w: 0, rudder: 0 } };
  }
  const center = b => ({ x: b.state.x - Math.sin(b.state.heading) * b.com, y: b.state.y + Math.cos(b.state.heading) * b.com });

  function step(b, env, cfg, dt) {
    const P = cfg.physics, st = b.state, k = b.spec.dragScale;
    const hc = Math.cos(st.heading), hs = Math.sin(st.heading);
    const vF = st.vx * hs - st.vy * hc, vL = st.vx * hc + st.vy * hs;
    let fF = 0, fL = 0, T = 0;
    for (const q of b.seats) {                                   // oars
      let f = 0;
      if (q.action === 'row') f = P.forceRow * b.power;
      else if (q.action === 'back') f = -P.forceBack * b.power;
      else if (q.action === 'hold' || q.action === 'check') {    // hold = original "check" drag; light check = scaled
        const m = q.action === 'hold' ? 1 : P.lightCheckMult;
        f = -P.holdDragLinear * m * (vF + st.w * q.xOff);
        T -= st.w * Math.abs(q.yOff) * P.holdDragRot * m;
      }
      fF += f; T -= f * q.xOff;
    }
    const rr = st.rudder * Math.PI / 180;                        // rudder
    if (Math.abs(rr) > 0.001 && Math.abs(vF) > 0.01) {
      const qW = 0.5 * P.waterDensity * vF * Math.abs(vF), Cl = 1.2 * Math.sin(rr), Cd = 0.05 + 1.2 * Math.sin(rr) ** 2;
      const lift = -qW * P.rudderArea * Cl, drag = -qW * P.rudderArea * Cd, cop = Math.sin(rr / (Math.PI / 4)) * P.rudderMaxCopX;
      fF += drag; fL += lift; T += lift * b.rudderY + drag * cop;
    }
    const wx = Math.sin(env.windDir) * env.windSpeed, wy = -Math.cos(env.windDir) * env.windSpeed;   // wind
    const wF = wx * hs - wy * hc, wL = wx * hc + wy * hs;
    fF += Math.sign(wF) * wF * wF * 2; fL += Math.sign(wL) * wL * wL * 20; T += Math.sign(wL) * wL * wL * P.windTorque;
    fF -= vF * P.waterDragLinear * k; fL -= vL * P.waterDragLat * k; T -= st.w * P.waterDragLat * k * (b.spec.length ** 2 / 12) * P.yawDampScale;   // hydrodynamic drag; yaw damping = the same lateral drag acting along the whole hull length
    st.vx += (fF * hs + fL * hc) / b.mass * dt; st.vy += (-fF * hc + fL * hs) / b.mass * dt; st.w += T / b.moi * dt;
    st.x += st.vx * dt; st.y += st.vy * dt; st.heading += st.w * dt;
    return { vF, vL };
  }
  return { create, center, step };
})();
if (typeof module !== 'undefined') module.exports = Physics;
