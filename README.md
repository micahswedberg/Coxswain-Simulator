# Coxswain trainer

Static site for GitHub Pages (no build step). Open it through a web server (GitHub Pages or `python3 -m http.server`); `fetch` does not work from `file://`.

## Files

- `index.html` coxswain view (phone). `?s=file.json` opens a scenario directly.
- `coach.html` coach studio (laptop).
- `config/config.json` global settings: boats, docking limits, physics constants. Coach: Settings tab > Download config.json > commit over this file.
- `scenarios/*.json` + `scenarios/index.json` published scenarios. Coach: Download scenario + Download index.json > commit both into `scenarios/`.
- `js/physics.js` boat model (from the original app.js), `js/world.js` collision and win/fail rules, `js/camera.js` pan / zoom / rotate for both views, `js/render.js` drawing, `js/cox.js` and `js/coach.js` the two UIs, `js/util.js` helpers.

Scenario angles are degrees. Wind direction is the direction the wind blows toward (0 = north, 90 = east).

## Requirements

1. The app shall contain a coxswain UI, optimized for cell phone use.
2. The app shall contain a coach UI, optimized for laptop use.
3. The coach UI shall allow the coach to design and push scenarios to users.
4. The app will be uploaded to GitHub and accessible through GitHub Pages; scenarios may be files exported by the web app and separately uploaded to GitHub for published access.
5. The coach UI shall allow the coach to place docks, buoys, keep-out zones, multi-lane stakeboat starting lines, and other boats that must be avoided by the coxswain under training.
6. The coxswain UI shall allow the coxswain to select a coach-provided scenario to simulate.
7. The coxswain UI shall allow the coxswain to designate what each rower is doing with their oar: row forward, back, hold water, or light check.
8. The coach UI shall allow the coach to designate the direction and strength of the wind.
9. The coach UI shall be agnostic when placing the coxed boat (8+ or 4+). The coxswain UI shall allow choosing a 4+ or an 8+, and the physics engine shall use accurate weight, center of mass, and oar-power offset for the boat chosen.
10. The coach UI shall allow a map and geolocation to be selected for the scenario.
11. The coxswain UI shall show a win popup when the long side of the boat approaches the long side of a dock within the coach-specified angle and speed.
12. The coach UI shall provide a settings tab with global variables (length and weight of 4s and 8s, acceptable dock approach angle and speed, and so on). The configuration file shall be downloadable for upload to GitHub, and all logic that needs coach-defined variables shall read them from it.
13. The coxswain UI shall show a win popup when the tail end of the boat approaches a stakeboat starting dock within the coach-specified angle and speed.
14. The coach UI shall allow a buffer zone so that win conditions can be achieved within a meter or two of the dock, for ease in gamification.
15. The coxswain UI shall show a failure popup when a dock is approached too quickly or outside the coach-configured angle.
16. The coxswain UI shall show a failure popup when a stakeboat starting dock is approached outside the angle or speed limits.
17. The map view shall be draggable with touch controls by both the coach and coxswain.
18. The map view shall be pinchable for zooming by both the coach and coxswain.
19. The map view shall be rotatable by touch controls by both the coach and coxswain.
20. The map view shall be zoomable with a mouse scroll wheel by the coach and coxswain.

## Controls

- One finger or left mouse drags the map. Two fingers pinch to zoom and twist to rotate. The wheel zooms. Shift-drag or right-drag rotates with a mouse. **N** is a toggle in the coxswain view: N = north-up (you can rotate freely); tap it and it becomes **B** = bow-up, where the map is locked to the boat and turns with it so the bow always points to the top of the screen (rotate gestures are ignored); tap again for north-up. In the coach view **N** just turns the map north-up; **◎** (coxswain view) re-centers on the boat after you have panned away.
- Coach view: with the Select tool, dragging an object moves it and dragging empty map pans.
- Seat buttons cycle Sit easy, Row, Back, Hold, Light check. The Port and Starboard headings above the seats cycle every port or every starboard seat (they carry a small ↓ and a dotted underline to show they are tappable). The first tap on a side sets every other seat to Sit easy; after that, Port and Starboard can be set independently of each other (for example all ports Row and all starboards Back), and tapping any other group button clears them both. The Bow pair, All seats and Stern pair buttons cycle their seats through the same list, one group at a time: tapping a different group first sets every seat to Sit easy and resets the other group buttons, then starts the new group at Row. **Weigh enough** sets every seat to Sit easy.
- Power (Full, Half, Paddle) sets how hard the rowing seats pull: 100%, 50% and 10% of full oar force, editable under `power` in `config.json`. It applies to Row and Back; Hold and Light check are not affected. While any seat is backing, every rowing seat's force is also multiplied by `backingPowerMultiplier` in `config.json` (0.7 to start); with no seat backing it isn't applied.
- Wind: tap the wind compass (top right) to type a wind speed (0 to 25 mph) and spin the direction arrow with the slider. The arrow points where the wind blows toward. This only changes the coxswain's own run; **Reset** returns the wind to the scenario's default.

## Physics notes

- Hull drag along the boat is linear plus quadratic (`waterDragLinear`, `waterDragQuad`). The quadratic term is calibrated so an 8+ with every seat rowing at full power levels off at 2000 m / 7:00 = 4.76 m/s; the linear term keeps low-speed maneuvering as it was. The 4+ `dragScale` is set so a 4+ tops out around 90% of that.

- Yaw inertia is computed from the actual mass layout (hull, rowers, cox about the centre of mass) times `yawInertiaScale`, which stands in for the water the hull carries along.
- Yaw damping comes from the same lateral drag (`waterDragLat`) acting along the whole hull length, scaled by `yawDampScale`. A single bow-seat stroke's yaw is nearly gone about a second after the stroke ends.
