[README.md](https://github.com/user-attachments/files/33937994/README.md)
# Coxswain trainer

Static site for GitHub Pages (no build step).

- `index.html` coxswain view (phone). `?s=file.json` opens a scenario directly.
- `coach.html` coach studio (laptop).
- `config/config.json` global settings (boats, docking limits, physics constants). Coach: Settings tab > Download config.json > commit over this file.
- `scenarios/*.json` + `scenarios/index.json` published scenarios. Coach: Download scenario + Download index.json > commit both into `scenarios/`.
- `js/physics.js` boat model (from the original app.js), `js/world.js` collision and win/fail rules, `js/render.js` drawing, `js/cox.js` / `js/coach.js` the two UIs.

Scenario angles are degrees. Wind direction is the direction the wind blows toward (0 = north, 90 = east).
Open through a web server (GitHub Pages or `python3 -m http.server`); `fetch` does not work from file://.
