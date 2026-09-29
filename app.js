// ==========================================
// 1. STATE & CONSTANTS
// ==========================================
const canvas = document.getElementById('lakeCanvas');
const ctx = canvas.getContext('2d');
let width, height;

// Camera & Touch State
let cameraX = 0, cameraY = 0, scale = 3;
let cameraFollowsBoat = true;
let isDragging = false, lastDragX = 0, lastDragY = 0;
let lastTouchX = 0, lastTouchY = 0;
let initialPinchDistance = null;

let isDraggingTool = false;
let draggedToolType = null;
let isEraserMode = false;

// Maps
const mapLocations = {
    'blackwell': { lat: 36.1252, lon: -97.2048 },
    'okc': { lat: 35.4542, lon: -97.5152 },
    'charles': { lat: 42.3590, lon: -71.1000 }
};
let activeLocation = 'blackwell';
let refLat = mapLocations['blackwell'].lat, refLon = mapLocations['blackwell'].lon;
let bgMap = null; 

let selectedEntity = null, movingEntity = null;

// Physics Constants
const env = { windSpeed: 5.36, windDirection: Math.PI, currentSpeed: 0.0, currentDirection: 0 };
const TIME_STEP = 4.0;
const BOAT_MASS = 950, BOAT_LENGTH = 17.5, BOAT_WIDTH = 0.6;
const MOI = (1/12) * BOAT_MASS * (Math.pow(BOAT_LENGTH, 2) + Math.pow(BOAT_WIDTH, 2)) * 5;

const FORCE_ROW = 300, FORCE_BACK = 200, DRAG_CHECK_LINEAR = 300, DRAG_CHECK_ROTATIONAL = 4000;
const WATER_DRAG_LINEAR = 200, WATER_DRAG_ROTATIONAL = 8000, WATER_DRAG_LATERAL = 3000;
const RUDDER_AREA = 3 * 0.00064516, RUDDER_OFFSET_Y = -8.0, RUDDER_MAX_COP_X = 0.0254;
const WATER_DENSITY = 1000, WIND_TORQUE_COEFF = 1.8;
const SAFE_SPEED_LATERAL = 0.3, SAFE_SPEED_LONGITUDINAL = 0.5, SAFE_DOCK_ANGLE = 15;

// Entities
let obstacles = [];
let objectives = [];
let boat = getInitialBoatState();

function getInitialBoatState() {
    return { x: 0, y: 0, vx: 0, vy: 0, heading: 0, angularVelocity: 0, rudderAngle: 0, hidden: false };
}

const LAT_DIST = 1.2;
const seats = [
    { id: 2, name: "Seat 2", side: "Port", xOff: -LAT_DIST, yOff: 4.5, action: "easy" },
    { id: 1, name: "Bow (1)", side: "Starboard", xOff: LAT_DIST, yOff: 6, action: "easy" },
    { id: 4, name: "Seat 4", side: "Port", xOff: -LAT_DIST, yOff: 1.5, action: "easy" },
    { id: 3, name: "Seat 3", side: "Starboard", xOff: LAT_DIST, yOff: 3, action: "easy" },
    { id: 6, name: "Seat 6", side: "Port", xOff: -LAT_DIST, yOff: -1.5, action: "easy" },
    { id: 5, name: "Seat 5", side: "Starboard", xOff: LAT_DIST, yOff: 0, action: "easy" },
    { id: 8, name: "Stroke (8)", side: "Port", xOff: -LAT_DIST, yOff: -4.5, action: "easy" },
    { id: 7, name: "Seat 7", side: "Starboard", xOff: LAT_DIST, yOff: -3, action: "easy" }
];

// ==========================================
// 2. PHYSICS ENGINE & COLLISION
// ==========================================
window.simulateStroke = function() {
    const SUB_STEPS = 40; 
    const dt = TIME_STEP / SUB_STEPS; 
    
    for(let step = 0; step < SUB_STEPS; step++) {
        let forceForward = 0, forceLateral = 0, torque = 0;
        const hCos = Math.cos(boat.heading), hSin = Math.sin(boat.heading);
        
        const localVelocityForward = boat.vx * hSin - boat.vy * hCos;
        const localVelocityLateral = boat.vx * hCos + boat.vy * hSin;
        
        // Oar Forces
        seats.forEach(seat => {
            let seatF_y = 0; 
            if (seat.action === 'row') seatF_y = FORCE_ROW;
            else if (seat.action === 'back') seatF_y = -FORCE_BACK;
            else if (seat.action === 'check') {
                const localPointVelocity = localVelocityForward + (boat.angularVelocity * seat.xOff);
                seatF_y = -DRAG_CHECK_LINEAR * localPointVelocity;
                torque -= boat.angularVelocity * Math.abs(seat.yOff) * DRAG_CHECK_ROTATIONAL;
            }
            forceForward += seatF_y;
            torque -= seatF_y * seat.xOff; 
        });

        // Rudder Physics
        const rudderRad = (boat.rudderAngle || 0) * (Math.PI / 180); 
        if (Math.abs(rudderRad) > 0.001 && Math.abs(localVelocityForward) > 0.01) {
            const qWater = 0.5 * WATER_DENSITY * localVelocityForward * Math.abs(localVelocityForward);
            const Cl = 1.2 * Math.sin(rudderRad);
            const Cd = 0.05 + 1.2 * Math.sin(rudderRad) * Math.sin(rudderRad);
            
            const rudderLift = -qWater * RUDDER_AREA * Cl; 
            const rudderDrag = -qWater * RUDDER_AREA * Cd; 
            const copX = Math.sin(rudderRad / (Math.PI / 4)) * RUDDER_MAX_COP_X;

            forceForward += rudderDrag;
            forceLateral += rudderLift;
            torque += (rudderLift * RUDDER_OFFSET_Y) + (rudderDrag * copX);
        }

        // Wind Physics
        const windVx = Math.sin(env.windDirection) * env.windSpeed;
        const windVy = -Math.cos(env.windDirection) * env.windSpeed;
        const localWindFwd = windVx * hSin - windVy * hCos;
        const localWindLat = windVx * hCos + windVy * hSin;
        
        forceForward += Math.sign(localWindFwd) * (localWindFwd * localWindFwd) * 2.0;
        forceLateral += Math.sign(localWindLat) * (localWindLat * localWindLat) * 20.0;
        torque += Math.sign(localWindLat) * (localWindLat * localWindLat) * WIND_TORQUE_COEFF;

        // Hydrodynamic Drag
        forceForward -= localVelocityForward * WATER_DRAG_LINEAR;
        forceLateral -= localVelocityLateral * WATER_DRAG_LATERAL; 
        torque -= boat.angularVelocity * WATER_DRAG_ROTATIONAL;

        // Acceleration
        const totalFx = forceForward * hSin + forceLateral * hCos;
        const totalFy = -forceForward * hCos + forceLateral * hSin; 

        boat.vx += (totalFx / BOAT_MASS) * dt;
        boat.vy += (totalFy / BOAT_MASS) * dt;
        boat.angularVelocity += (torque / MOI) * dt;

        boat.x += (boat.vx + Math.sin(env.currentDirection) * env.currentSpeed) * dt;
        boat.y += (boat.vy - Math.cos(env.currentDirection) * env.currentSpeed) * dt;
        boat.heading += boat.angularVelocity * dt;
        
        const state = checkGameState(localVelocityForward, localVelocityLateral);
        if (state) {
            boat.heading = boat.heading % (2 * Math.PI);
            updateUI();
            draw();
            setTimeout(() => {
                alert(`${state.status}: ${state.reason}\n\nLongitudinal Speed: ${state.fwd.toFixed(2)} m/s\nLateral Speed: ${state.lat.toFixed(2)} m/s`);
            }, 50); 
            return; 
        }
    }
    
    boat.heading = boat.heading % (2 * Math.PI);
    cameraFollowsBoat = true;
    updateUI();
    draw();
}

function checkGameState(vFwd, vLat) {
    const baseThreshold = (BOAT_WIDTH / 2) + 0.5; 
    
    for (let i = -1; i <= 1; i += 0.25) { 
        let px = boat.x + Math.sin(boat.heading) * (BOAT_LENGTH/2) * i;
        let py = boat.y - Math.cos(boat.heading) * (BOAT_LENGTH/2) * i;
        let currentThreshold = baseThreshold * (1 - 0.6 * Math.abs(i));
        
        for (let obs of obstacles) {
            if (Math.hypot(px - obs.x, py - obs.y) < currentThreshold) {
                return { status: 'Failure', reason: 'You hit a buoy!', fwd: vFwd, lat: vLat };
            }
        }
        
        for (let dock of objectives.filter(o => o.type === 'dock')) {
            let dw = dock.w || 20, dh = dock.h || 60, dang = dock.angle || 0;
            let dx = px - dock.x, dy = py - dock.y;
            let cosA = Math.cos(-dang), sinA = Math.sin(-dang);
            let localPx = dx * cosA - dy * sinA, localPy = dx * sinA + dy * cosA;
            
            let hw = dw / 2, hh = dh / 2;
            let cx = Math.max(-hw, Math.min(localPx, hw));
            let cy = Math.max(-hh, Math.min(localPy, hh));
            let hitActual = Math.hypot(localPx - cx, localPy - cy) < currentThreshold;

            let winZoneHW = hw + 2.5; // Oar length
            let wx = Math.max(-winZoneHW, Math.min(localPx, winZoneHW));
            let wy = Math.max(-hh, Math.min(localPy, hh)); 
            let inWinZone = Math.hypot(localPx - wx, localPy - wy) < currentThreshold;

            let isBow = i > 0.75, isStern = i < -0.75, isBody = !isBow && !isStern;
            
            let boatDeg = (boat.heading * 180 / Math.PI) % 180; if (boatDeg < 0) boatDeg += 180;
            let dockDeg = (dang * 180 / Math.PI) % 180; if (dockDeg < 0) dockDeg += 180;
            let alignmentDiff = Math.min(Math.abs(boatDeg - dockDeg), 180 - Math.abs(boatDeg - dockDeg));
            let safeSpeedAndAngle = Math.abs(vLat) <= SAFE_SPEED_LATERAL && Math.abs(vFwd) <= SAFE_SPEED_LONGITUDINAL && alignmentDiff <= SAFE_DOCK_ANGLE;

            if (hitActual) {
                let hitShortSide = (cy === -hh || cy === hh), hitLongSide = (cx === -hw || cx === hw);
                if (hitLongSide) return { status: 'Failure', reason: isBody ? 'Crashed into long side! (Approach slower to park)' : 'Hit long side with bow/stern.', fwd: vFwd, lat: vLat };
                else if (hitShortSide) {
                    if (isBow) return { status: 'Failure', reason: 'Bow touched short side.', fwd: vFwd, lat: vLat };
                    if (isStern) {
                        if (vFwd > -SAFE_SPEED_LONGITUDINAL && vFwd < 0) return { status: 'Win', reason: 'Successfully backed in.', fwd: vFwd, lat: vLat };
                        else return { status: 'Failure', reason: `Backed in too hard. Safe speed < ${SAFE_SPEED_LONGITUDINAL} m/s.`, fwd: vFwd, lat: vLat };
                    }
                    if (isBody) return { status: 'Failure', reason: 'Broadsided short end.', fwd: vFwd, lat: vLat };
                }
            } else if (inWinZone && isBody && safeSpeedAndAngle) {
                if (wx === -winZoneHW || wx === winZoneHW) return { status: 'Win', reason: 'Successfully parked alongside dock.', fwd: vFwd, lat: vLat };
            }
        }
    }
    return null;
}

// ==========================================
// 3. RENDERING & UI MENUS
// ==========================================
window.draw = function() {
    if (activeLocation === 'empty') {
        ctx.fillStyle = '#0c4a6e'; ctx.fillRect(0, 0, width, height);
    } else {
        ctx.clearRect(0, 0, width, height);
        if (bgMap) {
            const centerLat = refLat - (cameraY / 111111);
            const centerLon = refLon + (cameraX / (111111 * Math.cos(refLat * Math.PI / 180)));
            bgMap.setView([centerLat, centerLon], 17 + Math.log2(scale), { animate: false });
        }
    }

    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.scale(scale, scale);
    ctx.translate(-cameraX, -cameraY);

    objectives.forEach(obj => {
        ctx.save(); ctx.translate(obj.x, obj.y); ctx.rotate(obj.angle || 0);
        if(obj.type === 'dock') {
            ctx.fillStyle = '#8b5a2b'; ctx.fillRect(-(obj.w||20)/2, -(obj.h||60)/2, obj.w||20, obj.h||60);
            if (selectedEntity === obj) { ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2/scale; ctx.strokeRect(-(obj.w||20)/2, -(obj.h||60)/2, obj.w||20, obj.h||60); }
        }
        ctx.restore();
    });

    obstacles.forEach(obs => {
        ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(obs.x, obs.y, 2, 0, Math.PI * 2); ctx.fill();
        if (selectedEntity === obs) { ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2/scale; ctx.stroke(); }
    });

    if(!boat.hidden) {
        ctx.save();
        ctx.translate(boat.x, boat.y);
        ctx.rotate(boat.heading);
        ctx.fillStyle = '#fef08a';
        ctx.beginPath(); ctx.ellipse(0, 0, BOAT_WIDTH/2, BOAT_LENGTH/2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = (selectedEntity === boat) ? '#38bdf8' : '#ca8a04'; 
        ctx.lineWidth = (selectedEntity === boat) ? 2/scale : 0.2; ctx.stroke();
        
        seats.forEach(seat => {
            ctx.fillStyle = '#334155'; ctx.beginPath(); ctx.arc(0, -seat.yOff, 0.3, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 0.15; ctx.beginPath();
            ctx.moveTo(seat.xOff > 0 ? 0.3 : -0.3, -seat.yOff);
            let oarAngle = seat.action === 'row' ? -0.5 : seat.action === 'back' ? 0.5 : seat.action === 'check' ? 0 : 1.2;
            if(seat.side === 'Port') oarAngle = -oarAngle;
            ctx.lineTo((seat.xOff > 0 ? 0.3 : -0.3) + Math.cos(oarAngle) * 2.5, -seat.yOff + Math.sin(oarAngle) * 2.5);
            ctx.stroke();
        });
        ctx.restore();
    }

    ctx.restore();
    drawWindOverlay();
}

function drawWindOverlay() {
    const x = width - 60, y = 60, r = 30;
    ctx.fillStyle = document.getElementById('wind-dialog').style.display === 'block' ? 'rgba(30, 41, 59, 0.9)' : 'rgba(15, 23, 42, 0.7)';
    ctx.beginPath(); ctx.arc(x, y, r + 10, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2; ctx.stroke();
    
    ctx.fillStyle = '#f8fafc'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(`${(env.windSpeed * 2.23694).toFixed(0)} mph`, x, y + r + 25);

    if (env.windSpeed > 0) {
        ctx.save(); ctx.translate(x, y); ctx.rotate(env.windDirection - Math.PI/2); 
        ctx.strokeStyle = '#f8fafc'; ctx.fillStyle = '#f8fafc';
        ctx.beginPath(); ctx.moveTo(-15, 0); ctx.lineTo(10, 0); ctx.stroke(); 
        ctx.beginPath(); ctx.moveTo(15, 0); ctx.lineTo(5, -5); ctx.lineTo(5, 5); ctx.fill(); 
        ctx.restore();
    }
}

// Menu Toggles
window.toggleSettingsMenu = function() {
    document.getElementById('settings-options').classList.toggle('open');
    if (document.getElementById('build-options').classList.contains('open')) {
        document.getElementById('build-options').classList.remove('open');
        if (isEraserMode) toggleEraser();
    }
};

window.toggleBuildMenu = function() {
    const menu = document.getElementById('build-options');
    menu.classList.toggle('open');
    if (!menu.classList.contains('open') && isEraserMode) toggleEraser(); 
    if (document.getElementById('settings-options').classList.contains('open')) {
        document.getElementById('settings-options').classList.remove('open');
    }
};

window.toggleEraser = function() {
    isEraserMode = !isEraserMode;
    document.getElementById('btn-eraser').classList.toggle('active', isEraserMode);
    if (!isEraserMode) document.getElementById('eraser-cursor').style.display = 'none';
};

window.clearMap = function() { obstacles = []; objectives = []; draw(); };
window.resetSim = function() {
    boat = getInitialBoatState();
    cameraFollowsBoat = true;
    seats.forEach(s => s.action = 'easy');
    document.getElementById('rudder').value = 0;
    updateUI(); draw();
};

window.saveScenario = function() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({ env, obstacles, objectives, boat, loc: activeLocation }));
    const dl = document.createElement('a');
    dl.href = dataStr; dl.download = "cox_scenario.json"; dl.click();
};

window.loadScenario = function(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const data = JSON.parse(e.target.result);
        if(data.env) {
            document.getElementById('wind-speed-slider').value = Math.round(data.env.windSpeed * 2.23694);
            document.getElementById('wind-dir-slider').value = Math.round(data.env.windDirection * 180 / Math.PI);
            onWindSliderChange();
        }
        if(data.obstacles) obstacles = data.obstacles;
        if(data.objectives) objectives = data.objectives;
        if(data.boat) boat = data.boat;
        if(data.loc && document.getElementById('location-select')) {
            document.getElementById('location-select').value = data.loc;
            document.getElementById('location-select').dispatchEvent(new Event('change'));
        }
        cameraFollowsBoat = true; updateUI(); draw();
    };
    reader.readAsText(file);
    event.target.value = ''; // Reset input
};

// ==========================================
// 4. INPUT & EVENT LISTENERS
// ==========================================
function getWorldCoords(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return { x: cameraX + (clientX - rect.left - width / 2) / scale, y: cameraY + (clientY - rect.top - height / 2) / scale };
}

// Drag & Drop
document.querySelectorAll('.tool-drag').forEach(btn => {
    btn.addEventListener('touchstart', (e) => {
        isDraggingTool = true; draggedToolType = btn.getAttribute('data-type');
        if (draggedToolType === 'boat') { boat.hidden = true; draw(); }
        else if (draggedToolType === 'dock') { objectives = objectives.filter(o => o.type !== 'dock'); draw(); }
        
        const ghost = document.getElementById('drag-ghost');
        ghost.innerText = btn.innerText; 
        ghost.style.display = 'block';
        ghost.style.left = e.touches[0].clientX + 'px'; ghost.style.top = e.touches[0].clientY + 'px';
        document.getElementById('build-options').classList.remove('open');
        e.preventDefault(); 
    }, {passive: false});
});

document.addEventListener('touchend', (e) => {
    if (isEraserMode) document.getElementById('eraser-cursor').style.display = 'none';
    if (isDraggingTool) {
        isDraggingTool = false;
        document.getElementById('drag-ghost').style.display = 'none';
        
        const touch = e.changedTouches[0];
        const rect = canvas.getBoundingClientRect();
        
        // 1. Get the toolbar rectangle to check if the touch ended over the controls
        const controls = document.getElementById('controls-container');
        const controlsRect = controls ? controls.getBoundingClientRect() : null;
        
        const isOverControls = controlsRect && (
            touch.clientX >= controlsRect.left &&
            touch.clientX <= controlsRect.right &&
            touch.clientY >= controlsRect.top &&
            touch.clientY <= controlsRect.bottom
        );

        // 2. Only place the entity if it is INSIDE the canvas AND NOT over the toolbar
        if (!isOverControls && touch.clientX >= rect.left && touch.clientX <= rect.right && touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
            const coords = getWorldCoords(touch.clientX, touch.clientY);
            if (draggedToolType === 'boat') { 
                boat.x = coords.x; boat.y = coords.y; boat.vx = 0; boat.vy = 0; boat.angularVelocity = 0; boat.hidden = false; 
            } 
            else if (draggedToolType === 'dock') { 
                objectives.push({ type: 'dock', x: coords.x, y: coords.y, w: 3, h: 30, angle: 0 }); 
            } 
            else if (draggedToolType === 'buoy') { 
                obstacles.push({ type: 'buoy', x: coords.x, y: coords.y, radius: 2 }); 
            }
            draw();
        } else if (draggedToolType === 'boat') {
            boat.hidden = false; 
            draw(); // Reset cancelled drag
        }
    }
});

// Canvas Interaction (Pan & Tooltip)
canvas.addEventListener('pointerdown', (e) => {
    const rect = canvas.getBoundingClientRect();
    if (Math.hypot((e.clientX - rect.left) - (width - 60), (e.clientY - rect.top) - 60) < 50) {
        document.getElementById('wind-dialog').style.display = 'block';
        document.getElementById('entity-tooltip').style.display = 'none';
        selectedEntity = null; draw(); return;
    }

    const w = getWorldCoords(e.clientX, e.clientY);
    if (movingEntity) { movingEntity.x = w.x; movingEntity.y = w.y; movingEntity = null; draw(); return; }

    document.getElementById('wind-dialog').style.display = 'none';
    let hit = getEntityAt(w.x, w.y);
    if (hit) { showTooltip(hit, e.clientX, e.clientY); } 
    else { closeTooltip(); isDragging = true; lastDragX = e.clientX; lastDragY = e.clientY; cameraFollowsBoat = false; }
    draw();
});

window.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    cameraX -= (e.clientX - lastDragX) / scale;
    cameraY -= (e.clientY - lastDragY) / scale;
    lastDragX = e.clientX; lastDragY = e.clientY;
    draw();
});
window.addEventListener('pointerup', () => isDragging = false);

// Touch Interactions (Mobile Pan & Zoom & Erase)
canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
        lastTouchX = e.touches[0].clientX;
        lastTouchY = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
        cameraFollowsBoat = false;
        initialPinchDistance = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    }
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
    if (isDraggingTool) {
        const ghost = document.getElementById('drag-ghost');
        ghost.style.left = e.touches[0].clientX + 'px'; ghost.style.top = e.touches[0].clientY + 'px';
        e.preventDefault(); return;
    }

    if (e.touches.length === 1) {
        cameraX -= (e.touches[0].clientX - lastTouchX) / scale;
        cameraY -= (e.touches[0].clientY - lastTouchY) / scale;
        lastTouchX = e.touches[0].clientX; lastTouchY = e.touches[0].clientY;
        draw(); e.preventDefault();
    }
    
    if (isEraserMode) {
        const touch = e.touches[0], rect = canvas.getBoundingClientRect();
        const cursor = document.getElementById('eraser-cursor');
        cursor.style.display = 'block'; cursor.style.left = touch.clientX + 'px'; cursor.style.top = touch.clientY + 'px';
        
        const w = getWorldCoords(touch.clientX, touch.clientY);
        obstacles = obstacles.filter(obs => Math.hypot(obs.x - w.x, obs.y - w.y) > (30/scale));
        objectives = objectives.filter(obj => Math.hypot(obj.x - w.x, obj.y - w.y) > (30/scale));
        draw(); e.preventDefault(); return;
    }
}, { passive: false });

// Scroll Wheel Zoom
canvas.addEventListener('wheel', (e) => {
    e.preventDefault(); cameraFollowsBoat = false;
    scale *= Math.exp((e.deltaY < 0 ? 1 : -1) * 0.1);
    scale = Math.max(0.2, Math.min(scale, 10)); draw();
}, { passive: false });

// ==========================================
// 5. TOOLTIPS & HELPERS
// ==========================================
function getEntityAt(wX, wY) {
    if (Math.hypot(wX - boat.x, wY - boat.y) < BOAT_LENGTH/2) return { type: 'boat', ref: boat };
    for (let b of obstacles) { if (Math.hypot(wX - b.x, wY - b.y) < 5/scale) return { type: 'buoy', ref: b }; }
    for (let d of objectives.filter(o => o.type === 'dock')) {
        let dx = wX - d.x, dy = wY - d.y, ang = d.angle || 0;
        let lx = dx * Math.cos(-ang) - dy * Math.sin(-ang), ly = dx * Math.sin(-ang) + dy * Math.cos(-ang);
        if (Math.abs(lx) <= (d.w||20)/2 && Math.abs(ly) <= (d.h||60)/2) return { type: 'dock', ref: d };
    }
    return null;
}

window.showTooltip = function(entityData, clientX, clientY) {
    const t = document.getElementById('entity-tooltip');
    selectedEntity = entityData.ref;
    t.style.display = 'block';
    t.style.left = Math.min(clientX + 10, window.innerWidth - 270) + 'px';
    t.style.top = Math.min(clientY + 10, window.innerHeight - 260) + 'px';
    
    let html = '', act = `<button class="btn" onclick="movingEntity = selectedEntity; closeTooltip()">Move</button>`;
    
    if (entityData.type === 'dock') {
        document.getElementById('tooltip-title').innerText = 'Edit Dock';
        let curAng = Math.round(((selectedEntity.angle || 0) * 180 / Math.PI) % 360); if (curAng < 0) curAng += 360;
        html += `<div style="margin-bottom:8px;"><div class="popup-row"><span>Rotation:</span><strong id="val-rot">${curAng}°</strong></div>
                 <div style="display:flex; gap:6px;"><input type="range" id="slider-rot" min="0" max="360" step="5" value="${curAng}" style="flex:1;" oninput="updateEntityProp('angle', this.value)"></div></div>`;
        act += `<button class="btn danger" onclick="deleteSelected()">Remove</button>`;
    } else if (entityData.type === 'boat') {
        document.getElementById('tooltip-title').innerText = 'Edit Boat';
        let curAng = Math.round(((boat.heading || 0) * 180 / Math.PI) % 360); if (curAng < 0) curAng += 360;
        html += `<div style="margin-bottom:8px;"><div class="popup-row"><span>Heading:</span><strong id="val-rot">${curAng}°</strong></div>
                 <div style="display:flex; gap:6px;"><input type="range" id="slider-rot" min="0" max="360" step="5" value="${curAng}" style="flex:1;" oninput="updateBoatHeading(this.value)"></div></div>`;
    } else if (entityData.type === 'buoy') {
        document.getElementById('tooltip-title').innerText = 'Edit Buoy';
        act += `<button class="btn danger" onclick="deleteSelected()">Remove</button>`;
    }

    act += `<button class="btn" style="background:#475569" onclick="closeTooltip()">Done</button>`;
    document.getElementById('tooltip-content').innerHTML = html;
    document.getElementById('tooltip-actions').innerHTML = act;
    draw();
}

window.updateEntityProp = function(prop, val) {
    if (!selectedEntity) return;
    let newVal = parseFloat(val);
    if (prop === 'angle') { selectedEntity.angle = newVal * Math.PI / 180; document.getElementById('val-rot').innerText = `${Math.round(newVal)}°`; }
    draw();
};
window.updateBoatHeading = function(val) { boat.heading = parseFloat(val) * Math.PI / 180; document.getElementById('val-rot').innerText = `${Math.round(val)}°`; draw(); };
window.closeTooltip = function() { document.getElementById('entity-tooltip').style.display = 'none'; selectedEntity = null; draw(); }
window.deleteSelected = function() { obstacles = obstacles.filter(o => o !== selectedEntity); objectives = objectives.filter(o => o !== selectedEntity); closeTooltip(); }

window.onWindSliderChange = function() {
    const speed = parseInt(document.getElementById('wind-speed-slider').value);
    const dir = parseInt(document.getElementById('wind-dir-slider').value);
    document.getElementById('wind-speed-val').innerText = `${speed} mph`;
    document.getElementById('wind-dir-val').innerText = `${dir}°`;
    env.windSpeed = speed * 0.44704; env.windDirection = dir * (Math.PI / 180); draw();
}
window.adjustWindSpeed = function(d) { const s = document.getElementById('wind-speed-slider'); s.value = Math.max(0, Math.min(40, parseInt(s.value) + d)); onWindSliderChange(); }
window.adjustWindDir = function(d) { const s = document.getElementById('wind-dir-slider'); s.value = (parseInt(s.value) + d + 360) % 360; onWindSliderChange(); }

// ==========================================
// 6. INITIALIZATION
// ==========================================
function updateUI() {
    document.getElementById('speed-display').innerText = `${Math.hypot(boat.vx, boat.vy).toFixed(2)} m/s`;
    seats.forEach((seat, idx) => { document.getElementById(`seat-${idx}`).value = seat.action; });
    if (cameraFollowsBoat) { cameraX = boat.x; cameraY = boat.y; }
}

function initUI() {
    bgMap = L.map('map-background', { zoomSnap: 0, zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, touchZoom: false, keyboard: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 22 }).addTo(bgMap);

    document.getElementById('location-select').addEventListener('change', (e) => {
        activeLocation = e.target.value;
        if (activeLocation === 'empty') document.getElementById('map-background').style.display = 'none';
        else { document.getElementById('map-background').style.display = 'block'; refLat = mapLocations[activeLocation].lat; refLon = mapLocations[activeLocation].lon; }
        resetSim();
    });

    const container = document.getElementById('seats-container');
    seats.forEach((seat, idx) => {
        const div = document.createElement('div'); div.className = 'seat-card';
        div.innerHTML = `<div style="font-weight:bold; color: ${seat.side==='Port'?'#ef4444':'#22c55e'}">${seat.name}</div>
                         <select id="seat-${idx}"><option value="easy">Sit Easy</option><option value="row">Row</option><option value="check">Check</option><option value="back">Back</option></select>`;
        container.appendChild(div);
        document.getElementById(`seat-${idx}`).addEventListener('change', (e) => { seats[idx].action = e.target.value; draw(); });
    });

    document.getElementById('rudder').addEventListener('input', (e) => {
        boat.rudderAngle = parseFloat(e.target.value);
        document.getElementById('rudder-val').innerText = boat.rudderAngle > 0 ? `Stbd ${boat.rudderAngle}°` : (boat.rudderAngle < 0 ? `Port ${Math.abs(boat.rudderAngle)}°` : 'Center');
    });

    window.addEventListener('resize', () => {
        width = canvas.width = document.getElementById('water-container').clientWidth;
        height = canvas.height = document.getElementById('water-container').clientHeight;
        if (bgMap) bgMap.invalidateSize(); draw();
    });
    window.dispatchEvent(new Event('resize'));
    updateUI();
}

window.addEventListener('DOMContentLoaded', initUI);