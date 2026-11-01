# OmaFire implementation notes

Target checked on 2026-10-31: Omarchy 4.0.0 (Quattro), Quickshell 0.3.2, Qt 6.12.0, Hyprland 0.57, HEADLESS-1 at 3456x2160 scale 2, bar on top.

## Layout

```
manifest.json            bar-widget, entry ui/OmaFireBar.qml
ui/OmaFireBar.qml        host integration: BarWidget + BarIconButton + KeyboardPanel
ui/FireSession.qml       singleton: one fire for all monitors, state file, IPC
ui/qmldir                singleton FireSession, OmaFireBar
ui/fire/                 plain QtQuick, no qs.* imports (renders standalone)
  fire.js                simulation + software renderer (.pragma library, node-loadable)
  panel.js               popup width, 3:2 height, corner-drag projection
  sound.js               fire layer gains from heat and boost
  night.js               cricket and frog scheduling
  FireState.qml          bindable wrapper around fire.js state, timers, sound toggle
  FirePopup.qml          header, scene, footer, keys
  FireScene.qml          Canvas, pointer input, toast
  FireButton.qml         footer button
  FireIcon.qml           12 x 12 bar campfire
  FireAudio.qml          QtMultimedia, created on first Sound press only
assets/                  campsite-approved.webp (unchanged), fire-*.wav and night calls (generated)
scripts/gen-fire.py      fire layers and one-shots (deterministic)
scripts/gen-night.py     cricket and frog calls (deterministic)
scripts/measure.js       CPU/RSS measurement in a live Wayland session
tests/                   see "Tests"
```

The host-independent components live in `ui/fire/` because a qmldir that declares a singleton importing `Quickshell` makes the engine resolve it when any sibling type is compiled, which broke standalone loading.

## Host integration contract (as found)

- `PluginRegistry.validateManifest` requires `schemaVersion: 1`, `id`, `name`, `version`, `kinds`, `entryPoints`; entry points must be relative with no `..`; `barWidget.defaultSection` must be one of `left`, `centerBegin`, `center`, `centerEnd`, `tray`, `right`. No category validation; first-party categories seen: Status, AI, Compositor, Audio, Layout, System, Network, Time, Files, Info, Media. OmaFire uses `Info`.
- The bar injects `bar`, `moduleName`, `settings`, `fixedEdge` into the widget (`qs.Ui/BarWidget`).
- Popup: `qs.Ui/KeyboardPanel` (a full-screen layer-shell PanelWindow, card placed inside). It handles top/bottom/left/right bars, clamps the card to the output with `Style.gapsOut` margins, dismisses on outside click (including other outputs), primes keyboard focus, and coordinates with `bar.requestPopout/releasePopout`. When another popup takes over, the bar calls `owner.closeForPopoutSwitch()`. OmaFire sets `padding: 0`, `borderSpec: Border.none()`, and draws its own border and square corners over the host card, so the themed card color and corner radius never show. `contentWidth` / `contentHeight` follow `panel.js` (default 390 x 381). The lower-left grip sets the width; the scene stays 3:2, so the height follows. The host centers the card on the icon and eases `drawnHeight` over 200 ms once the panel is open, so a drag turns that ease off (`heightLive = false`) and projects the pointer onto the corner's path (`-1/2` in x, `+2/3` in y per width pixel, or the slope measured once the card hits the screen). Width clamps to 300–960.
- Palette: the default look is the reference's fixed colors, so `Commons.Color` is not used. `Style.reduceMotion` is read for reduced motion.
- IPC: on Omarchy 4.5, `ShellIpc` from `qs.Commons` (an `IpcHandler` that `omarchy-shell` can also answer over the shell's socket), in `ui/FireIpcShell.qml`. 4.0.x has no `ShellIpc`, so `FireSession` creates that file at runtime and falls back to `ui/FireIpcPlain.qml`, a bare `IpcHandler` that `qs ipc` reaches (4.0.x's `omarchy-shell` uses `qs ipc`). Both files hold the same calls. It lives in the singleton, so there is one handler no matter how many bars exist.
- Omarchy 4.0.x support: QML checks types and property names when it parses a file, so no file the bar loads may name 4.5-only API. The popup is a plain child `Loader` of `KeyboardPanel` (both versions take children; only 4.5 has the lazy `content` slot), and `Style.reduceMotion` (4.5 only) is read as `=== true`. `tests/compat.test.js` guards this.
- State: `FileView.setText` exists in Quickshell 0.3.2, `atomicWrites` defaults to true, and it creates missing parent directories (checked with a scratch config).
- `omarchy plugin validate` passes. `omarchy plugin add <url> --enable` is the form used by the comparable omastorm README; I could not run `omarchy plugin --help` in this environment to confirm the flag.

## Simulation and timing

Ported from `reference/animation.js` with identical arithmetic and random draw order (seed 5919). The parity test runs the original script and `fire.js` through the same frame clock and inputs and compares every drawn frame outside the native moonlight bounds (`218 <= x < 309`, `90 <= y < 143`). The fire simulation and reference rendering there remain unchanged.

- Fuel decays 0.00125/s: full load 800 s, initial 0.68 lasts 544 s, one log adds 200 s.
- While the popup is open the simulation steps every 16 ms (the reference stepped every animation frame) with dt capped at 0.08 s, and the scene draws every 50 ms (180 ms with reduced motion).
- Any time beyond the 0.08 s cap, and all time while the popup is closed, is applied analytically: fuel linearly, boost linearly, heat by the closed-form solution of `h' = 0.75 (max(0, fuel - 0.015) - h)` (the reference's Euler step converges to it; tested within 0.003 of the stepped result). No particle catch-up.
- A wall-clock gap over 1 s (suspend, a stalled shell) is applied once, analytically.
- Particle caps (new): 160 sparks, 40 smoke; oldest dropped first.

## Persistence

`$XDG_STATE_HOME/omafire/state.json`, else `~/.local/state/omafire/state.json` (`OMAFIRE_STATE` overrides, for tests):

```json
{"version":1,"fuel":0.83,"heat":0.79,"savedAt":1793462400000}
```

- Saved 0.5 s after any action, every 30 s while the fire isn't resting, on popup open/close, and on unload.
- On load, fuel and heat advance analytically by the time since `savedAt`. Absences over 6 h restore straight to Resting. A clock that went backwards counts as no time. Corrupt or out-of-range JSON starts the default fire (0.68/0.68).
- The scene clock (`elapsed`), particles, and toast are not saved.
- Sound is not saved: it starts off every session, matching "default off".
- Panel width is a sibling file, `panel.json` (`{"width":520}`), next to `state.json` (and next to `OMAFIRE_STATE` in tests). It is written when a corner drag ends. Missing, corrupt, or non-numeric JSON keeps 390. A number outside 300–960 is clamped. The fire document is not given a width field.

## Rendering

`fire.js` composites each frame into a 360 x 240 RGBA buffer using canvas 2D semantics: source-over with alpha, separable `screen` for the light pool, 4 x 4 supersampled coverage for the rotated log, area coverage for the 1 px dashed drop rectangle, nearest sampling of the 720 x 480 art. Chromium's nearest drawImage resolves exact pixel-boundary ties to the lower source pixel (the art is sampled at even coordinates); the port does the same and matches `reference/approved-scene.png` exactly away from the fire and native moonlight.

The native moonlight overlay leaves the original artwork unchanged. It gently brightens and dims the painted reflection and adds short silver-blue glints. A cached color mask restricts it to water and reflected light beneath the moon; the island and foreground pines occlude the effect. Animation uses `elapsed` and deterministic hashes without consuming the simulation's random stream. It runs through the existing scene timer and dirty-region copying path, so it stops drawing when the popup closes and follows the reduced-motion frame rate.

The scene Canvas is 360 x 240 logical and scaled to the 388 px interior with `smooth: false`. Qt 6.12 quirks found and worked around:

- `putImageData(img, x, y)` without the four dirty arguments draws nothing.
- With a non-zero dirty origin it crops the image and then offsets by the origin again, so the region lands in the wrong place. OmaFire puts whole 24 x 24 tile images at their own position with a 0,0 origin.
- `CanvasPixelArray` stores premultiplied pixels: set alpha before color.
- `putImageData` draws through the device-pixel-ratio scale, but `getImageData` reads raw device pixels, and a scaled `drawImage` filters. The background decoder canvas is therefore sized in device pixels and draws the art with `ctx.scale(1/dpr)`, which reproduces ImageMagick's decode exactly at 1x, 1.5x and 2x.
- The ratio has to come from the window. With fractional scaling on Wayland, `Screen.devicePixelRatio` reports 2 while the window uses 1.33 or 1.6, which left the art in the top-left of the scene when the decoder used the screen ratio. Offscreen runs can't show this because both values match there. A new layer-shell window also passes through other ratios (2, then 1, then 1.33) before it settles, so art decoded at a stale ratio is decoded again.

Per frame, fire.js flags the tiles it drew into; the scene recopies those and last frame's tiles, writing only pixels that changed.

## CPU and memory (measured)

`node scripts/measure.js 20` on an AMD Ryzen 7 6800U, Hyprland HEADLESS-1 at scale 2, standalone Quickshell process with the popup and icon in their own windows:

| State | CPU (one core) | Process RSS |
| --- | --- | --- |
| Popup open, scene at 20 fps | about 22-24% | about 280 MiB |
| Popup closed, bar icon at 5 fps | about 0.7-1% | about 280 MiB |

RSS is the whole standalone Quickshell process (Qt Quick and friends), not OmaFire's share inside the real shell. In-process timing: about 5.4 ms of JS render plus about 3 ms of tile copies per frame. Stepping the simulation at 20 Hz instead of 60 Hz made no measurable difference. These numbers need repeating on real hardware inside the live shell.

## Live measurements

Inside the live omarchy-shell on this VM, after the perf pass (9cbe5b6): `utime + stime` of the omarchy-shell process over 10 s, at 100 Hz clock ticks.

| State | CPU (one core) |
| --- | --- |
| Popup open | 21.5% (about 29-30% before the perf pass) |
| Popup closed | 0.9% |

RSS is about 480 MB for the whole shell, not OmaFire's share.

## Sound

`scripts/gen-fire.py` writes five files, all 22.05 kHz mono 16-bit with fixed seeds, so they regenerate byte for byte:

- `assets/fire-embers.wav` (6.1 s loop): brown noise lowpassed at 220 Hz with a fast flicker, a few quiet snaps.
- `assets/fire-crackle.wav` (9.1 s loop): the steady fire. Snaps, short runs of snaps, a rare pop.
- `assets/fire-roar.wav` (11.7 s loop): a deeper rumble, a soft flame whoosh, more snaps.
- `assets/fire-log.wav` (2.6 s): a dull knock, a scatter of embers, then crackles thickening as it catches.
- `assets/fire-stoke.wav` (2.2 s): noise rising through an opening filter, a few sparks.

A snap is a noise burst with a 1.2 ms onset and a 5-25 ms decay, through two broad bands (Q 1.3 and 1.6, about 0.9-1.9 kHz and 2-3.2 kHz) and, for big ones, a low knock band. Broad bands and the soft onset are what keep it from sounding like a pitched drip or like electrical static. Crackles come in flurries: the rate follows a slow random curve raised to the fourth power, so there are calm stretches between bursts. A quiet bed of tiny dark snaps sits under everything so no snap pops out of silence. Each loop is soft-limited, darkened at 5 kHz, and crossfaded over 0.8 s so it is seamless. The loops have different lengths so the mix doesn't repeat audibly.

Playback uses `MediaPlayer` + `AudioOutput`, not `SoundEffect`: SoundEffect refused the 22.05 kHz mono format on PipeWire because it doesn't resample. All three loops play while sound is on, each at `0.5 * gain` from `ui/fire/sound.js`: embers fade in by heat 0.08 and ease back 30% when hot, crackle rises from heat 0.08 to 0.55, roar comes in from 0.6 to 0.95 or with boost (a stoke or a fresh log). Levels ease over 0.6 s; on/off fades over 0.3 s. Adding a log (button, key, or drag) and a successful stoke play their one-shots at 0.2. Playing requires sound on and the popup open; closing fades out and stops the players, unload destroys them. No output device, a missing QtMultimedia, or a player error shows "Sound unavailable." and leaves it off.

Qt Multimedia ignores PipeWire's "Dummy Output" sink, so a machine with no sound hardware (a VM, a headless box reached over remote desktop) has no output and sound is unavailable. A null sink (`pactl load-module module-null-sink`) set as default gives Qt a device.

## Night sounds

`scripts/gen-night.py` writes three one-shots, same format as the fire: `assets/cricket.wav` (four 17 ms syllables near 4.4 kHz, falling slightly), `assets/peep.wav` (a soft up-slur from about 2.65 to 3.07 kHz), `assets/croak.wav` (a green frog's low "gunk" twice: a jittered pulse train near 110 Hz through throat resonances at 210, 480 and 1050 Hz). Each goes through a small Schroeder reverb (four damped combs, two allpasses) so it sounds off in the trees. Playback gain is about 0.04 to 0.06, and only while sound is on and the popup is open.

`ui/fire/night.js` schedules them. A cricket phrase is 4 to 7 chirps at one rate between 0.86 and 1.10 seconds, then a rest of at least 14 seconds (sometimes half a minute). About one phrase in a few gets a quieter answering chirp 0.30 to 0.38 seconds after a chirp. The first chirp waits 6 to 9.5 seconds so the fire is heard first. A frog calls on its own clock, first after 22 to 34 seconds, then every 28 seconds or longer, a peep about two thirds of the time and a croak the rest. A quarter of the calls double 1.1 to 1.45 seconds later. A frog that would start on the same instant as a chirp waits a fraction of a second.

## Font

The reference asks for `ui-monospace, SFMono-Regular, Consolas, monospace`. On the target, `fc-match monospace` is JetBrainsMono Nerd Font Regular, and both Chromium and Qt resolve the generic `monospace` to it, so the popup uses `font.family: "monospace"` at 12 px (11 px for status and hint), regular weight, 2 px letter spacing on OMAFIRE.

## Differences from the reference

- The lake reflection shimmers with native moonlight; reference pixel comparisons exclude only its fixed bounds, with separate animation and masking tests.
- Popup height is 381 px; the reference is 381.16 because its scene is 258.67 px tall. Here the scene is 259 px (rounded) and the hint box 16 px instead of 16.5, keeping borders on whole pixels. Text in the footer sits a fraction of a pixel differently.
- Text antialiasing differs slightly (Qt vs Chromium rasterizer); header/footer pixels are within 24 levels for about 96-98%.
- Hover brightens fill, border and text by 1.25 like CSS `brightness(1.25)`; press moves the button face down 1 px.
- Keyboard focus ring (new): 1 px amber outline 3 px outside the focused button, shown after Tab or Backtab and hidden by any pointer press. The popup cycles the buttons on Tab itself so it always sees the key.
- The bar glyph is a 12 x 12 pixel campfire driven by the same fuel/heat/boost (new; replaces the prototype's placeholder glyph). Crossed logs span the bottom two rows and the flame reaches row 2 at a steady burn and the top row when stoked, so it fills the same box as the bar's 12 px glyphs; each cell is one logical pixel (two device pixels at scale 2). Embers show only glowing coals, Resting only the logs.
- Hovering the bar icon shows "OmaFire: <status>" through `bar.showTooltip`/`bar.hideTooltip`, hidden while the popup is open.
- Wall-clock time while closed and across restarts, particle caps, persistence, IPC (new).
- Kept on purpose: the drop rectangle is drawn inside drawFire after the `flameH < 3` early return, so dragging over a fully cold fire shows no dashed target, as in the reference. Status can show Resting while heat is still fading, as in the reference.
- The reference's accelerated "Watch a burn cycle" mode is not included.

## Tests

`mise run test` (node 22+):

| File | What |
| --- | --- |
| `tests/parity.test.js` | original reference script on a canvas emulator vs fire.js outside moonlight bounds, every drawn frame, with add log, stoke, drag, poke, invalid drop; full dirty-tile coverage |
| `tests/chrome.test.js` | reference fragment in headless Chromium with a stubbed frame clock vs fire.js at the same frames, outside moonlight bounds |
| `tests/scene.test.js` | background and closest frame vs `reference/approved-scene.png` outside moonlight bounds; flame palette |
| `tests/moonlight.test.js` | deterministic lake shimmer, water masking and occlusion, animation bounds, unchanged simulation state |
| `tests/sim.test.js` | timings, actions, hit tests, status table, toast, dt cap, analytic advance, caps, persistence, icon |
| `tests/package.test.js` | art hash, no symlinks, no machine paths, manifest rules, sound file regenerates |
| `tests/qml.test.js` | qmltestrunner offscreen at 1x and 2x (`tests/qml/`): real mouse/key events, focus ring after a click (`tst_focus.qml`), geometry, grabs, no warnings; grabbed scene compared with fire.js pixel for pixel; `omarchy plugin validate` |
| `tests/integration.test.js` | real Quickshell with stand-ins for `qs.Ui`/`qs.Commons`, once per host API (4.0.x and 4.5): two bars share one fire, popup moves between bars, IPC route, save/restore, corrupt state, long absence |
| `tests/compat.test.js` | no 4.5-only host API at parse time; the two IPC files match |
| `tests/visual.test.js` | reference popup screenshots at 1x/2x vs the native grabs; side-by-sides in `tests/out/compare-*.png` |

The Chromium, Quickshell and qmltestrunner tests skip when those tools aren't installed. `tests/reference/` holds the prototype script and fragment with the inline image data removed, plus the approved capture.

## Not verified here

- Running inside the live omarchy-shell bar (installation was left to Wes). The integration test uses stand-ins for `BarWidget`, `BarIconButton`, `KeyboardPanel`, `ShellIpc`, `Style`, `Border`, one set per host API (`tests/integration/hosts/omarchy-4.0` and `omarchy-4.5`).
- Bottom/side bars, monitor edges, multiple real outputs, hot reload, and suspend on real hardware. The KeyboardPanel code handles these; OmaFire adds nothing that depends on bar position.
- Audio on real speakers.
