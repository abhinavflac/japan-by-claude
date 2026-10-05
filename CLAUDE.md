# 24 Cameras, One Living Japanese Street

An interactive three.js film of one Tokyo shōtengai street (Akari-chō 3-chōme) at 19:42 on a Saturday in October, eleven minutes after the rain stopped. The street is built once; 24 physical cameras sit inside it and watch the same moment. Around the film: a day mode (the same minute at 08:42 in a sun shower), nine looks for the picture, a free orbit camera, and a walk mode where you play a person in the street. Live, private artifact: https://claude.ai/artifact/HEs7znBaMGyWRLvMp4VHTw (republish `dist/artifact.html` to keep that URL).

## Build and run

- `node build.mjs` concatenates `src/js/*.js` (sorted by filename) into the `/*__JS__*/` slot of `src/page.html` and writes:
  - `index.html`, a standalone document. Open it directly in Chrome (file:// works).
  - `dist/artifact.html`, a body fragment for publishing as a claude.ai Artifact (no doctype/html/head/body; `<title>` first).
- No bundler, no npm dependencies. three.js r170 loads from `https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js`; fonts come from Google Fonts. Artifact rules: external scripts only from cdnjs/jsdelivr/unpkg, stylesheets only from Google Fonts, and the page stays well under 16 MB (it's about 570 KB).
- Always rebuild after editing `src/`. The JS files share one module scope, so a top-level `const` in one file is visible to later files.
- URL params: `?q=low|med|high` (quality preset, otherwise auto-detected), `?test=1` (test mode: no animation loop, exposes test hooks). Deep links: `#cam01` … `#cam24`.
- Keys: Space play, ← → cameras, W walk, E orbit camera, V next look (Shift back), N day or night, ? the full list.

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
| 46_light | baked 2D light field (`addLight2D`), the real lights (`LIGHTS`; `LIGHTS.sun` is the moon by night), `SUN` and `bakeSunMap()` (building shadows for day), environment capture |
| 47_day | `setDay(on)`: everything that changes between 19:42 and 08:42 (lights, glow table, sky, fog, receivers, cached environment maps); `updateSun(cam)` keeps the sun's shadow map on the camera; `clockAt(T)` |
| 50_people | instanced crowd rig, walker timelines (`buildTimeline`, `walkerAt`, `personAt`), spots, companions |
| 51_vehicles | vehicle models (with the `VATL` atlas: bus interiors, LED boards, plates, taxi lamps), IDM traffic sim precomputed for the loop, `vehicleState(id, T)`, bikes with fixed instance slots |
| 52_hero | the man under the sign: sculpted head, hair shell, coat; `heroPose(T)` animation; parts merged per material |
| 60_fx | drizzle, drips, steam, halos, lanterns, signal lamps |
| 70_render | `pipeline`: MSAA HDR scene RT, planar reflection, half-res DOF, bloom, motion blur, grade, grain, CCTV/glitch/wipe/fade looks; `FILTERS` and the looks pass (`FILTER_FS`), the thermal heat pass (`tagWarmBodies`, `renderHeat`) |
| 80_cameras | `SHOTS` (the 24 cameras), `SEQ_TRANS` (transition per cut), sequencer, move planner (`planMove`, `glideCandidates`, `lifeHit`), explore (orbit) camera |
| 85_walk | walk mode: the player (`playerAgent`, one more crowd rig agent), `updateWalk` physics (gravity, kerbs via `walkGround`, `walkSolids`, traffic and people), `playerPose`, `walkCameraPose`, pointer lock and touch input |
| 90_ui | UI wiring, HUD, minimap, ambience audio (`buildAmbience`, `audioTargets`) |
| 98_film | offline film export (`filmInit`, `filmFrame`, `filmAudio`) |
| 99_main | boot sequence, frame loop, `renderNow`, adaptive resolution, test hooks |

## Core ideas to preserve

- **One deterministic world clock.** Traffic, signals, walkers, trains and the hero are pure functions of world time `T` (`SEQ.world`), looping every `SIM_T = 900` s. Any camera at any `T` sees the same moment. Never add `Math.random()` to anything visible; use the seeded RNG.
- **Traffic is precomputed** (IDM with signals) in `simulateTraffic()`; `vehicleState(id, T)` interpolates samples.
- **Camera moves are planned against reality.** `planMove` builds Bezier candidates that avoid `COLLIDERS` (with 30 cm clearance), the `HERO_KEEP` box and poles, rejects moves that stare into a wall, and times the move so no vehicle or person meets the lens (checked against the deterministic future). If nothing is clean, it falls back to a rack-focus dissolve.
- **Shader programs are shared:** only structural flags go into `customProgramCacheKey`; numbers travel as uniforms. Keep the program count low (around 67).
- **Performance budget:** about 8–10 ms per frame at 1920×803 on an RTX 3050 Ti laptop, with adaptive resolution. Merge static geometry into batches and keep dynamic things instanced.
- **Night is the reference.** Day, the looks and walk mode must leave the default night film pixel-identical (check with a 24-camera still comparison against the previous build). The moon light casts shadows in both modes (with zero shadow intensity at night) so switching never recompiles a shader; the looks pass only runs when a look other than Cinema is on.
- **Day shadows come in two parts.** Blocks, back lots, the arch and the viaduct deck are baked once into the sun map (the height below which each point of the plan is in shadow); people, cars, posts and lamp heads go into the sun's real-time shadow map, which follows the camera. The plan's north is +x and east is +z, so the street runs east to west and the morning sun shines down it.
- **The walker is not part of the deterministic world.** Traffic can't stop for it, so cars brush it aside; its look is fixed so it draws nothing from the seeded generator.

## Testing (headless Chrome over CDP, Node 24 global WebSocket)

- `tools/cdp.mjs` launches headless Chrome for the tools: GPU flags per platform, `--no-sandbox` as root, and three.js served from `tools/three170.js`, so tests run without the CDN.
- `node tools/probe.mjs "<expr>" [query]` evaluates in the page (test mode). Hooks: `__shot(cam, u, t, opts)` (opts: `hideUI`, `filter`, `day`, `dof`, `raw`, …), `__trans(cam, k, t)`, `__perf(cam, n, t)`, `__explore(pos, target, t)`, `__walk(x, z, yaw, pitch, dist, t, opts)` (opts: `v`, `phase`, `crouch`, `air`, `body`, `day`, `filter`), `__walkSim([[keys, seconds], …])` (holds keys at 60 Hz without rendering and reports positions), `__eval(src)` (runs in module scope, so it can reach `SEQ`, `SHOTS`, `planMove`, `WALK`, …).
- `node tools/shoot.mjs <outDir> '<json shots>' [w] [h] [query]` takes stills: `{ cam, u, t, opts }`, `{ explore: [pos, target] }` or `{ walk: [x, z, yaw, pitch, dist] }`, plus an optional `eval` run before the capture.
- Shots with attachments (taxi CAM 16, bike CAM 17) depend on world time, so advance `t` together with `u`: `t = t0 + u * dur`.
- Set `CHROME=/path/to/chrome` on non-Windows machines. Rendering needs a GPU; on a GPU-less machine WebGL falls back to SwiftShader (a 1280×536 still takes about 10 s, boot about 15 s), so timings there mean nothing.
- Without the frame loop (test mode) the walk physics only runs through `__walkSim`; to drive the real input path, start the loop with `__eval('requestAnimationFrame(t => { lastFrame = t; frame(t); })')` and send keys or touches over CDP.

## Film export

`node tools/film.mjs [out.mp4] --crf 20` steps the whole sequence at 24 fps (`window.__film`), renders at 2400×1005, downsamples to 1920×804 (2.39:1), burns in the title, camera cards, CCTV overlay and end card, pipes JPEG frames to ffmpeg (libx264), renders the ambience offline and muxes AAC. A full run is 6154 frames (4:16) and takes about 11 minutes on the 3050 Ti; output is about 500 MB. Output goes to `export/`, which is git-ignored. Requires ffmpeg on PATH.

## Known weak spots

- Crowd figures are stylised mannequins up close; vehicles are boxy.
- Heavy traffic sometimes turns road-crossing glides into focus dissolves (by design).
- The bike shot passes the hero in about 19 of 24 sampled start times.
- Day shops are open at 08:42 and the drizzle keeps falling (a sun shower). Awnings and signs cast no sun shadows; only boxes do.
- Walk mode: shop interiors are solid (the colliders fill each building), and the player is the crowd's mannequin. Day mode and the looks were tuned headless on SwiftShader, so check them on a real GPU.

## Done (requested by the owner)

1. Walk mode: move, run, jump, crouch, gravity, kerbs, walls, posts, parked and moving traffic, people; pointer-lock mouse-look (drag if the lock is refused), third person with the wheel to go first person, a thumbstick and buttons on touch screens.
2. Day and night modes (N, or the button by the clock).
3. Nine looks (V, or the Look menu by the clock): Cinema, Noir, Vintage, VHS, 8-bit, Anime, Thermal, Night Vision, Tilt-Shift.
4. The 24-camera film is unchanged at night with the default look.

## Owner notes

The owner talks to Claude in the "Nyx" voice (see their global CLAUDE.md). Keep code minimal and comment only what isn't obvious.
