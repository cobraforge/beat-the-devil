# Beat the Devil

Single-screen canvas arcade game in violet and fire. A cyan glass
heart dodges pitchforks and hellfire on a violet night, then takes on the Devil
himself, whose clawed red arms frame the arena. You have five bolts for the
whole run, and two of them are for his eyes.

## Rules

- **Five bolts, no refills.** A bolt that misses is gone. A bolt that kills a
  pitchfork is gone too. Nothing stops you spending all five; the title card's
  "two are for his eyes" is the only warning you get.
- **One bolt per eye.** In the fight he opens one eye at a time, briefly, and
  sways: lead your shot. A bolt into a shut eye or the brow is wasted.
- At zero bolts with an eye still open, he takes it. One bolt and two eyes is
  already lost, and it plays on: take an eye, watch him rage, and know.
- Grazing a pitchfork pays 50, killing one pays 100, an eye pays 3000. Bolts
  you still hold at the end pay 1500 each.

## How it plays

- **The heartbeat is the clock.** The heart beats at 68 bpm at rest and races
  toward 150 as hazards close in and the meter fills. The floor glow, the
  embers, his aura and the music all pulse off the same beat. A hit gives one
  oversized beat and two seconds of arrhythmia.
- **Pitchforks are thrown, not dropped.** A thin aim line tracks you for
  0.45 s, snaps solid on lock (aimed where you will be), then the fork flies on
  a fixed vector at 520 px/s. Dodge after the lock. They stick in the floor and
  stay dangerous for 1.5 s. Variants: single, three-fork fan, bracket volley.
- **Fire hunts, then stops.** A column ignites at the floor with its target x
  locked to where the heart is (at most 140 px away), walks there at 100 px/s
  and never moves again; it rises to full height over 0.8 s so the danger
  visibly climbs. If the heart is directly above it, it erupts (a flare, not a
  climb). Heights are clamped so 80 px of air always remains above the heart's
  ceiling: the heart can climb to a quarter of the screen in the survive phase
  (columns ≤ 400 px) and to just under his chin in the fight (columns ≤ ~290
  px). At least 40 % of the width is always flame-free; a spawn that would
  break that is skipped. In the fight his mouth glows a second ahead of a sheet of flame down one half of
  the arena.
- **The fire itself.** Column edges are three octaves of curl noise scrolling
  up at different rates; embers shed from the tops and drift on the same
  turbulence; thin smoke darkens the violet above each column; heat shimmer
  displaces whatever is seen through or just above a flame; and fire light
  spills onto the floor, the heart and his arms, brightest on the side facing
  it.
- **Flame jets.** Angled lances from the left and right walls, on the fork
  contract: the vent glows and an aim line tracks the heart for 0.6 s, the line
  locks and flashes, then a 40 px lance fires 450 px along that fixed vector in
  0.3 s, holds 0.5 s and retracts. Always 15–35° above horizontal, aimed at the
  heart's position at lock time, not led. A jet never fires on a half where a
  floor column is still rising; they alternate. None in the first 40 % of the
  survive meter, then one every 7 s, tightening to 4.5 s in the last quarter;
  every 2.5 s in the fight. Never more than one jet at a time.
- **Hazard cap.** During the survive phase no more than two hazards of any
  kind are live at once (a fork volley counts as one). A spawn that would
  exceed it is skipped, never queued.
- **Fireballs.** Thrown from the dark above (from his mouth in the fight) at
  where the heart is, not led: a white-hot core, an orange body, a tail
  streaming behind, embers shedding off it, a soft halo, and a tumble. Where
  it lands it scorches a ring into the floor that brightens and contracts over
  1.2 s, then detonates.
- **His arrival.** The instant he lands his mouth opens, goes white, and nine
  pitchforks erupt in a fan: run, don't dodge. The fire steps up for good.
- **Losing.** At zero bolts with eyes left, input is cut. The heart keeps
  beating, slowing, and drifts. His two hands come in from the sides and close
  on it; the beat goes on, muffled, inside them. He turns, points at you, the
  beat stops, black. Two seconds of nothing, then the panel.
- **He arrives before he appears.** Twice, his eyes open in the dark and watch.
  The vignette tightens, the colour drains, the embers speed up, something
  breathes under the music, and whispers rise past 70 % on the meter. Then a
  moment of silence, a skipped beat, and he lands.

## Look

- The palette is CSS custom properties on `:root` in `style.css` (`--void`,
  `--midnight`, `--heart`, `--claw`, `--title`, ...). `game.js` reads them once
  at start into `COLORS` / `RGB` and never hardcodes hex in draw calls. Fire
  keeps its own orange-to-white palette.
- The game sits inside a monitor bezel (`#monitor`): beige-grey plastic, a
  recessed rim, a power LED. Everything scales with `--s`; `resize()` solves for
  it with the bezel included, and the safe-area insets still apply.
- His face is a skull under the fire skin: a brow ridge, cheekbones, a
  narrowing jaw and a chin, every anchor drifting on the noise field; the brow,
  cheeks, jaw and chin are shaded as separate planes. Brows are heavy ridges,
  lit on top. Eyes are recessed sockets in the brow's shadow with a dull ember
  far inside that brightens before an attack. The mouth is an irregular
  opening wider than tall, dark throat at the back and hot at the front edge,
  with the fangs drawn over it so they silhouette against the glow.
- After he takes the heart, the HUD is gone; the hands lift it to just below
  his mouth, larger, still glowing, cracked and charred, beating slowly and
  dimming until it goes out, underlighting the fingers and the fangs. The
  panel then sits in the empty lower third.
- His arms: four fingers and an opposed thumb, each finger three tapering
  segments along one smooth arc (Catmull-Rom spine, no visible joints) ending
  in a curved black talon a third of its length; a thick muscled forearm
  narrowing at the wrist and widening across the back of the hand; dark red
  flesh shaded to near-black in the creases and undersides with a dull sheen
  on top. Knuckles bunch when the hand flexes, tendons ridge when it extends.
  The fingers track the heart, spreading when it is far and curling toward it
  when near (never quite closing); the hands breathe, scrape the frame edge now
  and then, and creep 24 px further in with every life lost. They are not
  hazards. One attack (`claw`) winds a hand up high on your side for a second,
  then slams the floor on that side. At the end these hands close around the
  heart.
- The heart is alive: an asymmetric squash on every beat and a settle after,
  a faint drift so it is never still, vein tracery that brightens outward from
  the centre on each beat, an internal glow breathing on its own slower cycle,
  a light trail and a lean when it moves fast, and an involuntary double-beat
  if it sits still for three seconds.
- Damage persists. Three lives: clean cyan, steady beat. Two: dimmer glow, an
  occasional stumble. One: colour drained toward grey-blue, glow guttering, a
  beat never regular again. Every hit stops the beat dead for 200 ms, restarts
  it with a hard irregular thump, and sheds light the heart never recovers.
- **Penalties last exactly 2.0 s** — the invulnerability window — and end the
  instant the heart can be hit again. Nothing impairs it while it is
  vulnerable.
  - A **pitchfork** embeds at the angle it arrived, quivering, then works loose
    and tumbles away. Embedded: speed 65 %, the heart drags along the fork's
    line, the beat is slow and labored with a hitch, light leaks from the
    wound. It leaves a permanent crack running in from the wound.
  - **Fire** scorches: speed 115 % with a random jitter on input, a flame
    clinging to the struck side and shrinking as the timer runs, a fast
    shallow panicked beat, orange flooding the cyan for 0.6 s, smoke trailing
    as it moves. It leaves a permanent charred patch at the impact point. A
    burn while a fork is embedded burns the fork away early.

## On a phone

- **Touch controls.** A virtual joystick for the left thumb, a fire button
  for the right, mirrored. The joystick floats: touch anywhere in the left
  40 % of the lower screen and the base (radius 60 px) lands under the thumb;
  a faint outline marks where it rests. The knob (28 px) follows the thumb,
  clamps to the base's edge, and is analog — a 12 % dead zone, full speed at
  the edge (the keyboard speed), linear between. Release and it springs home
  and the heart stops. The fire button (44 px radius) fires on press and shows
  the bolts left. Pointers are tracked by id: the joystick thumb never fires,
  the fire thumb never steers, and both work at once. The joystick's vector
  simply adds to the keys', so the embed and burn penalties apply as the same
  multipliers.
- **Layout.** On screens under 600 px the bezel goes and the glass takes the
  whole width. Where the aspect ratio leaves a band of at least 150 px below
  the playfield, the playfield sits at the top and both controls live in the
  band, so thumbs never cover the game; otherwise they overlay the bottom
  corners at 60 % opacity. The mute button sits between them.
- **Performance.** Touch devices cap the device pixel ratio at 1.5. Three
  quality tiers (`QUALITY` in `game.js`: full, medium, low) trade heat
  shimmer, smoke, glow sprites, particle share, flame edge detail, fire
  texture resolution and how often his face and the arms are redrawn. The
  game starts at full and steps down when the rolling one-second frame average
  passes 20 ms, applied only in the survive phase or between his attacks,
  never mid-attack. Nothing in the tiers changes the rules.

## Files

- `index.html` — page shell: canvas, title / game-over / win overlays, mute button
- `style.css`  — layout, CRT overlay, overlay screens (scales via `--s`)
- `audio.js`   — Web Audio synth: sound effects and the music sequencer, which
                 is slaved to the heartbeat (survive, devil, title, dirge, win)
- `game.js`    — the game: heartbeat clock, fire renderer, input, hazards, devil AI, endings, rendering
- `build.py`   — bundles everything into `dist/index.html`; `dist/` is the deployable site root
- `dev/bot.js` — the imperfect playtest bot; `dev/perf.py` — frame-time measurement under throttling

No build step, no assets. Plain HTML/CSS/JS; all audio is synthesised at runtime.

## Run

The game reads `localStorage` for the high score, so serve it over HTTP rather
than opening the file directly:

```
python -m http.server 8080 --bind 127.0.0.1
```

Then open http://localhost:8080/.

## Playtesting

`dev/bot.js` is a deliberately imperfect player for the survive phase (150 ms
reaction delay, skips 20 % of frames, coarse dodging). Load it on a `#debug`
page and run `BTD_BOT(8)`; it reports lives on reaching the devil and what
was nearest at each hit. Used to confirm the phase is completable without
perfect play.

## Debugging

Open `http://localhost:8080/#debug` and the console gets `BTD_G` (the state
object), `BTD_STEP(dt)` (advance one frame by hand) and `BTD_VERSION`. Set
`window.BTD_FREEZE = true` to hold the state without the pause overlay, and
`window.BTD_HEART_SCALE = 5` to magnify the heart for a look at its damage.
Handy for jumping to the fight: `BTD_G.surv = 41.9`.

With `#debug` a frame-time overlay sits in the bottom-left: rolling average,
p95 and max rAF interval, time in update+draw, device pixel ratio, particle
and flame counts. `BTD_PERF()` returns the same numbers (`BTD_PERF(true)`
resets the ring), `BTD_TIER(n)` pins a quality tier, `BTD_CTL` is the touch controls' layout in css px, `BTD_WANT(n)` requests
one the safe way, `window.BTD_LOCK_TIER = true` stops the adaptive step,
`window.BTD_NOSHADOW = true` and `window.BTD_SKIP = {devil: true}` leave
effects or drawing blocks out to measure their cost.

## Measuring performance

`dev/perf.py` drives a separate Chrome (its own throwaway profile) over the
DevTools protocol: 390×844 at 3× DPR, touch, CPU throttled 1×/4×/6×, and a
thumb working the joystick in circles while it reads `BTD_PERF()`. Needs the
dev server running and `pip install websocket-client`.

```
python dev/perf.py --rates 1,4,6 --scenes survive,boss --label after
python dev/perf.py --software --tier 0 --profile --scenes boss
```

`--software` runs the 2D canvas without the GPU so raster cost lands on the
throttled thread (a pessimistic stand-in for a weak phone GPU; DevTools
throttling alone leaves a desktop GPU doing the blurs for free). `--profile`
prints self time by function with native canvas calls charged to their
callers. `--tier`, `--noshadow`, `--skip` and `--css` pin or remove things
for A/B attribution.

What it found: the heat shimmer drew the canvas onto itself in ~90 strips per
column per frame, each forcing a full-canvas snapshot — 85 % of the frame.
It now copies the region behind the flame once into a buffer. After that,
in software raster at 4×: the survive phase went from 154 ms a frame to 17
and the fight from 49 to 19; on the GPU path the game never leaves the top
tier.

## Sound

All synthesised in `audio.js`, no asset files. Buses: sfx, music, the
heartbeat (its own bus, lowpass-muffled inside his fist), and fire.

- **Impacts.** A thrown fork striking the floor or a wall: a ~70 Hz sine pitched
  down fast plus a filtered clatter, ±15 % pitch and level per hit, panned by
  x, tighter and higher for walls, capped at three at once.
- **Explosions** (fireball detonations, eruptions, the arrival volley): a sub
  drop 50 → 25 Hz over 0.4 s, a noise body through a lowpass that opens then
  closes, a bright crack on the front. The music ducks under each one, and the
  screen shakes in proportion to distance from the heart.
- **Fire.** Every burning column, lance and breath gets a voice: bandpassed
  noise around 800–1200 Hz with the frequency and gain on slow LFOs so it roars
  and breathes. Volume follows height and falls off with distance from the
  heart; at most four voices. A rising whoosh at ignition, sparse pops as it
  dies. The fire bus ducks briefly under every heartbeat.
- **His laugh** on arrival: two sawtooth voices (a fifth apart, the lower one
  detuned) through a lowpass and a formant band, amplitude-modulated in five
  bursts that slow and drop in pitch, into a synthesised 2.6 s reverb. The
  mouth moves with the bursts; the volley fires as the laugh ends. Everything
  else ducks while it plays.
- **Mix.** Measured live with the bus meters (`BTD_AUDIO.meter()`) in the
  fight with three columns, a lance and a nine-fork volley over the boss
  track: master peaks 0.38 before the compressor, the heartbeat is the loudest
  element (peak 0.84) and in its own windows matches the sum of everything
  else; fire and music sit level at ~0.08 RMS.

## Music

Patterns live in `audio.js` under `TRACKS`, 16 steps per bar and four steps per
heartbeat, written as note names (`D2 . Eb2 .`) or drum hits (`x` / `o` / `.`).
There is no kick: the heartbeat is the kick, and the tempo is the heart rate.
Each track has `bars` and optional `drone` (MIDI note), `bed` (low rumble) and
`breath` (the breathing layer plus the whisper layer). A sanity check at load
throws if a pattern's length doesn't match `bars * 16`.

## Single-file build

```
python build.py
```

writes `dist/index.html` with the CSS and both scripts inlined. Point a static
host (Cloudflare Pages, etc.) at `dist/` and that one file is the whole site.
