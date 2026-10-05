# 24 Cameras, One Living Japanese Street

An interactive three.js film of one Tokyo shōtengai street (Akari-chō 3-chōme) at 19:42 on a Saturday in October, eleven minutes after the rain stopped. The street is built once; 24 physical cameras sit inside it and watch the same moment. Live, private artifact: https://claude.ai/artifact/HEs7znBaMGyWRLvMp4VHTw (republish `dist/artifact.html` to keep that URL).

## Build and run

- `node build.mjs` concatenates `src/js/*.js` (sorted by filename) into the `/*__JS__*/` slot of `src/page.html` and writes:
  - `index.html`, a standalone document. Open it directly in Chrome (file:// works).
  - `dist/artifact.html`, a body fragment for publishing as a claude.ai Artifact (no doctype/html/head/body; `<title>` first).
- No bundler, no npm dependencies. three.js r170 loads from `https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js`; fonts come from Google Fonts. Artifact rules: external scripts only from cdnjs/jsdelivr/unpkg, stylesheets only from Google Fonts, and the page stays well under 16 MB (it's about 530 KB).
- Always rebuild after editing `src/`. The JS files share one module scope, so a top-level `const` in one file is visible to later files.
- URL params: `?q=low|med|high` (quality preset, otherwise auto-detected), `?test=1` (test mode: no animation loop, exposes test hooks). Deep links: `#cam01` … `#cam24`.

## Source map (`src/js`)

| File | What it holds |
| --- | --- |
| 10_core | `mat()`, `boxM()`, unit geometries `G`, `Batch`/`BatchSet` (merges static geometry per material and 48 m zone), RNG (`reseed`, `rnd`), `QUALITY` presets, easing |
| 20_textures | canvas painters, fonts (`FONTS`, `jt()` registers glyphs to preload, `drawText`), atlases |
| 30_materials | `std()`/`basic()`, `patchStd` shader patches (baked 2D light field, wet ground with puddles and planar reflection, wind, instanced UVs, cable width), uniforms `U` |
| 40_layout | the plan: road/kerb constants, `HERO`, `BUILDINGS` specs (W1–W10 west side, E1–E12 east side), `groundY(x,z)` |
| 41_buildings | facades, roofs, signs on buildings, billboards, `COLLIDERS` (world AABBs) |
| 42_signs / 43_shops | vertical tenant signs; shop interiors (ramen, kissaten, izakaya, conbini, records …), the macro props (cream soda, ramen bowl) |
| 44_street | ground, poles and cables, lamps, the arch, signals, parked bikes, coin parking; thin colliders for poles |
| 45_landmarks | shrine, Akari Yokochō alley, train viaduct and trains, back blocks, skyline, sky |
| 46_light | baked 2D light field (`addLight2D`) |
| 50_people | instanced crowd rig, walker timelines (`buildTimeline`, `walkerAt`, `personAt`), spots, companions |
| 51_vehicles | vehicle models (with the `VATL` atlas: bus interiors, LED boards, plates, taxi lamps), IDM traffic sim precomputed for the loop, `vehicleState(id, T)`, bikes with fixed instance slots |
| 52_hero | the man under the sign: sculpted head, hair shell, coat; `heroPose(T)` animation; parts merged per material |
| 60_fx | drizzle, drips, steam, halos, lanterns, signal lamps |
| 70_render | `pipeline`: MSAA HDR scene RT, planar reflection, half-res DOF, bloom, motion blur, grade, grain, CCTV/glitch/wipe/fade looks |
| 80_cameras | `SHOTS` (the 24 cameras), `SEQ_TRANS` (transition per cut), sequencer, move planner (`planMove`, `glideCandidates`, `lifeHit`), explore camera |
| 90_ui | UI wiring, HUD, minimap, ambience audio (`buildAmbience`, `audioTargets`) |
| 98_film | offline film export (`filmInit`, `filmFrame`, `filmAudio`) |
| 99_main | boot sequence, frame loop, `renderNow`, adaptive resolution, test hooks |

## Core ideas to preserve

- **One deterministic world clock.** Traffic, signals, walkers, trains and the hero are pure functions of world time `T` (`SEQ.world`), looping every `SIM_T = 900` s. Any camera at any `T` sees the same moment. Never add `Math.random()` to anything visible; use the seeded RNG.
- **Traffic is precomputed** (IDM with signals) in `simulateTraffic()`; `vehicleState(id, T)` interpolates samples.
- **Camera moves are planned against reality.** `planMove` builds Bezier candidates that avoid `COLLIDERS` (with 30 cm clearance), the `HERO_KEEP` box and poles, rejects moves that stare into a wall, and times the move so no vehicle or person meets the lens (checked against the deterministic future). If nothing is clean, it falls back to a rack-focus dissolve.
- **Shader programs are shared:** only structural flags go into `customProgramCacheKey`; numbers travel as uniforms. Keep the program count low (around 67).
- **Performance budget:** about 8–10 ms per frame at 1920×803 on an RTX 3050 Ti laptop, with adaptive resolution. Merge static geometry into batches and keep dynamic things instanced.

## Testing (headless Chrome over CDP, Node 24 global WebSocket)

- `node tools/probe.mjs "<expr>"` evaluates in the page (test mode). Hooks: `__shot(cam, u, t)`, `__trans(cam, k, t)`, `__perf(cam, n, t)`, `__explore(pos, target, t)`, `__eval(src)` (runs in module scope, so it can reach `SEQ`, `SHOTS`, `planMove`, …).
- `node tools/shoot.mjs <outDir> '<json shots>'` takes stills.
- Shots with attachments (taxi CAM 16, bike CAM 17) depend on world time, so advance `t` together with `u`: `t = t0 + u * dur`.
- Set `CHROME=/path/to/chrome` on non-Windows machines. Rendering needs a GPU; on a GPU-less machine WebGL falls back to SwiftShader and is very slow.

## Film export

`node tools/film.mjs [out.mp4] --crf 20` steps the whole sequence at 24 fps (`window.__film`), renders at 2400×1005, downsamples to 1920×804 (2.39:1), burns in the title, camera cards, CCTV overlay and end card, pipes JPEG frames to ffmpeg (libx264), renders the ambience offline and muxes AAC. A full run is 6154 frames (4:16) and takes about 11 minutes on the 3050 Ti; output is about 500 MB. Output goes to `export/`, which is git-ignored. Requires ffmpeg on PATH.

## Known weak spots

- Crowd figures are stylised mannequins up close; vehicles are boxy.
- Heavy traffic sometimes turns road-crossing glides into focus dissolves (by design).
- The bike shot passes the hero in about 19 of 24 sampled start times.

## Next up (requested by the owner)

1. **Playable explore mode:** a character you can walk around the street with (move, run, jump, maybe crouch), with gravity, collision against `COLLIDERS` and kerbs (`groundY`), and mouse-look plus touch controls. The existing explore mode is only a free orbit camera (`EXP` in 80_cameras).
2. **Day and night modes.** The look is currently built for blue hour: baked light field, emissive signs and windows, fog, sky, exposure. Day needs a sun directional light, a day sky, signs and windows dimmed, the night light field turned down, and a different grade.
3. **At least 7 switchable filter effects** in the post pipeline (`70_render`), for example: none/cinematic, film noir B&W, VHS, 8-bit/pixel, anime/cel, thermal, night vision, sepia/vintage, tilt-shift. The reference the owner pointed at has 5.
4. Keep the 24-camera mode working alongside the new modes.

## Owner notes

The owner talks to Claude in the "Nyx" voice (see their global CLAUDE.md). Keep code minimal and comment only what isn't obvious.
