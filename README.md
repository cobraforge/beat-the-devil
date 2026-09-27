# Beat the Devil

Single-screen canvas arcade game in the bowels of hell. A cyan glass
heart dodges pitchforks and hellfire in a cavern of magma and rock, then takes on the Devil
himself, whose clawed red arms frame the arena. You have five bolts for the
whole run, and two of them are for his eyes.

## Rules

- **Five bolts, no refills.** A bolt that misses is gone. A bolt that kills a
  pitchfork is gone too. Nothing stops you spending all five; the title card's
  "two are for his eyes" (repeated on the level's briefing) is the only
  warning you get.
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
  turbulence; thin smoke darkens the rock above each column; heat shimmer
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

- **The cabinet.** A 13-inch composite monitor of the early-80s home-computer
  kind: cream shell with vents pressed into the top, a deep surround with the
  tube recessed behind it, and a dark lower panel carrying the maker's plate,
  a control door with four knobs and the power lamp. The glass has a curved
  sheen, a shadow mask and dark corners. `BEZEL_X`/`BEZEL_Y` in `game.js` must
  match the cabinet's padding in `style.css`.
- **Fire.** Not a pillar: three layers of tongues (dull red outer, orange,
  yellow-white core), each tapering hard and wandering on the curl field,
  each fading toward its tip so there is no hard edge; a white-hot bed at the
  floor, licks that pinch off and rise, and sparks. The hot layers fill the
  hitbox (see `DESIGN.md` rule 3).
- **The heart.** It fills slowly between beats, squeezes hard on the lub,
  again smaller on the dub, then rings out like jelly; each squeeze throws off
  a pressure wave. Veins brighten outward with the beat.

- **His face.** Red muscle over bone, not a skull: a static fibre texture
  under a heavy brow shelf with a furrow, small eyes burning deep beneath it
  (a red slit when open), flared nostrils, a snarl of long canines over rows
  of teeth with a fire-lit throat, thick ridged horns sweeping out from the
  temples and hooking down past the cheeks, and the traps and shoulders
  fading into the dark behind. The head is cached as a sprite keyed on its
  pose (`headSprite`); the eyes, the throat's flash, the aura and the beams
  are drawn live over it.
- **His hands.** Mirror images: thumb over the top, four fingers hanging from
  the lower edge and hooking toward the heart. Each arm is rendered once into
  a local-frame sprite and re-rendered only when its pose steps
  (`armSprite`), so its sway costs nothing.
- **A fork hit.** The fork's momentum shoves the heart along its line (~72 px
  over 0.35 s, controls dimmed not cut, clamped only at the playfield's
  edges — into fire is allowed), blood sprays along it, drips while the fork
  is in and leaves splats on the floor, and a stain stays on the heart. A wet
  thud sits under the hit.

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
- Five hearts (`LIVES`). Damage persists, in three stages: untouched, clean
  cyan and a steady beat; wounded, a dimmer glow and an occasional stumble;
  the last heart, colour drained toward grey-blue, glow guttering, a beat
  never regular again. His arms creep further in with every heart lost. Every hit stops the beat dead for 200 ms, restarts
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

## The pit

The arena is the bowels of hell, drawn by `drawPit()` in `game.js`: a cavern
of dark rock (a noise-field strata texture) under a roof of stalactites,
jagged walls lit at their inner edge, crags standing black against the glow,
a crust of floor over magma, and fissures of magma through the lower wall,
the walls and the crust. The rock is rendered once into a layer and the
fissures into another, drawn in light each frame at a brightness that pulses
with the heartbeat and runs hotter as the survive phase wears on; a few fires
flicker far off behind the crags. It stays dark through the middle, where the
play is, because every hazard is fire too. The palette is in `style.css`:
`--void`, `--midnight` (the heat haze), `--rock`, `--magma`, and `--grace`
for the light at the end.

## The win

When the second eye goes he burns, cracks and sinks; his hands make one last
grab and close on the heart; with him gone they burn to ash and crumble; the
roof splits and a shaft of light comes down; in it the heart heals and rises
out of the pit. The timeline is `FREE` in `game.js`, the light is
`drawHeaven()`, and the panel then sits low, under it.

## Level 2: The Stolen

Below the pit is his dungeon, and the only way down is to beat him: there is
no level select. Every run starts in the pit; after a win the panel's next
step (space, or a tap) goes *back down for them*, and a loss in the dungeon
starts again from the pit. The rules are DESIGN.md rule 11; in short:

- **The rescue** (50 s; the meter reads *HE IS COMING*). Seven stolen souls
  hang in cages from the roof, four at most at a time. Hold the heart by a
  cage for a second to open it; the soul follows in a trail. Carry up to
  three (each slows you 6 %) and fly them up into the shaft of light at the
  top centre to set them free. **A hit drags every soul you carry back into a
  cage.**
- **Chains.** A spiked iron ball waits in a clamp under the roof girder, its
  chain run to a pulley, while a pale path shows where it will drop and the
  arc it will swing (through the heart, at the lock). Let go, it falls until
  the chain runs out, catches with a jolt, and swings as a real pendulum,
  clanging off the walls, then is hauled back up. The chain is a rope of
  links (a Verlet rope pinned at the pulley and the ball) that bows and trails
  as it swings. What hurts is on fire: the ball glows in its clamp as it
  heats, and once let go it burns, flames streaming off it and along the
  chain, until it is hauled back up. A ball that meets a hanging cage
  **smashes it**, spilling the soul for you to pick up; it ends a shade too.
- **Dark knights** march in from the sides and patrol the floor, their helms
  turned up to follow the heart; touching one is a hit. Now and then they
  attack: spearmen stride under the heart, a pale line over each pike showing
  its reach, lock, and drive their pikes straight up one after another; a
  crossbowman stops, raises his crossbow along a pale line to the heart, and
  looses a quarrel along it.
- **Shades** gather at a wall while you carry souls and drift after the last
  one; a bolt ends a shade, at the cost of the bolt.
- **The Warden** arrives when the meter fills: a knight in black iron with a
  horned helm and a fire in its slit, his cloak in tatters. The cages are
  hoisted out of reach, and his lantern is the target: it hangs from his fist
  on a chain and swings as he moves, shuttered except in brief windows; two
  hits break it. He swings his flail at you (the same pendulum, from his
  fist), fires a beam of energy from the lantern to the floor where the heart
  was when it locked, and sends his knights at you (calling in more). Bolts on his armour are wasted; they pass
  through his cloak.
- **Endings.** Break the lantern and every cage bursts; his armour falls apart
  into the crust, his knights burn away, and the souls join the heart as the light takes them all
  up. Run out of bolts first and he locks the heart in a cage with them.
- **Score** adds 500 for each soul you brought out (delivered, plus those still
  with you when the lantern breaks), on a board of its own.

In `game.js` it is the `LEVEL 2` section (`STOLEN`, `updateStolen()`, the
chains, the knights, the Warden, the `released` and `caged` endings) and its
drawing; `G.level` picks the level and `nextLevel()` which one comes next.
The shared systems (the heartbeat, bolts, penalties, hazard cap, the release
into the light) serve both. The Warden's body is drawn once into two sprites
at the canvas's resolution (behind his arms and in front of them); his arms,
eyes, lantern and flail are drawn live. The music is `stolen` (the souls'
music box heard through the bars) and `warden` (a march in iron).

## The briefings

Before each level, a **briefing**: the level's story typed out a page at a
time, then what to do and the controls (DESIGN.md rule 13). From the title it
opens level 1's; after level 1 is won, the win panel shows **NEXT · LEVEL II ·
THE STOLEN** and space (or a tap on it) opens level 2's. The story shows the
first time on a device and after that the briefing opens on its rules (with a
*Story* button to read it again); *Skip* jumps to the rules. A retry after a
loss goes straight in. The words are in `BRIEF` in `game.js`.

## Pause, the menu, the version

**P** or **Esc** pauses on a keyboard; on a phone, the **II** button beside
*Sound* at the top (shown only in play). The pause screen has **Resume** and
**Main menu** (**Q** on a keyboard), which abandons the run and goes back to
the title. The title shows the game's version in its bottom-left corner:
`GAME_VERSION` in `game.js` (bump it for a release; `BTD_VERSION` counts
builds and busts caches).

## Dev mode

Click the cabinet's rainbow **beat the devil** badge five times, then its
orange power lamp five times (no more than three seconds between clicks). A
panel opens in the page's top-left corner: **Play I**, **Play II**, **Boss
now**, **Kill the boss**, **No damage**, **Endless bolts**, **Slow motion**,
**Frame times** and **Leave dev mode**. It stays on across reloads on that
device until it is left (or knocked for again). A run that dev mode touches
(on when it starts, or turned on during it) is a dev run: it never reaches
the world board or its counters and never becomes a saved best; its panels
say *Dev run · not recorded*. The cabinet is not drawn under 600 px, so the knock
is for a computer or a tablet.

## The world board

Only a completed run scores: **hearts left × 1,000, plus up to 2,500 for
speed** (`(300 − seconds) × 10`), so a heart is worth a hundred seconds. The
clock runs from the first step into the pit to the killing bolt and never
stops. The HUD shows the clock and `HI`, the world's best when the server
answers (the device's own best otherwise). A run that places in the world's
top fifty asks for a name on the win panel; the title shows all fifty, ten
at a time in a list that scrolls (to the player's own place, if they have one),
with score, hearts, time and date, and a counter of souls stolen (games lost
worldwide), freed (won) and returned (level 2's souls brought out, in any
run). Each level has its own board, with a tab for each.

It is a Cloudflare Pages Function, `functions/api/[[route]].js`, over a D1
database:

| | |
|---|---|
| `GET /api/board?level=1\|2` | that level's top fifty and the counters |
| `POST /api/start {level}` | a run begins; returns its id |
| `POST /api/end {run, outcome, hearts, saved}` | `freed` or `stolen`; the server times it and scores it (`saved`, 0–7, level 2 only) |
| `POST /api/name {run, name}` | a placing winner's name |

The server's own clock times the run and it computes the score; the client
sends only the outcome, the hearts left and (level 2) the souls saved. Wins
under 50 s (55 s in level 2) are refused,
starts are limited to 12 a minute per player (by a hash of the address), and
names are cleaned to 12 upper-case characters.

**Setting it up** (once, in the Cloudflare dashboard):

1. **Storage & Databases → D1 → Create database**, name it `beat-the-devil`.
2. **Workers & Pages → beat-the-devil → Settings → Bindings → Add → D1
   database**: variable name `DB`, database `beat-the-devil`. Add it for
   Production (and Preview, if you want the board on preview builds).
3. Redeploy: **Deployments → the latest → Retry deployment**, or push a commit.

The tables create themselves on the first request, and columns added since
(`level`, `saved`) are added to an existing database the same way. Until the binding exists
`/api/*` answers 503 and the game hides the board and plays as before.

**Testing it locally** without Cloudflare: `dev/api-sim.js` runs the real
function in the page over SQLite compiled to wasm and routes the game's
`/api/*` calls to it. On a `#debug` page:

```
var s = document.createElement('script'); s.src = '/dev/api-sim.js'; document.head.appendChild(s);
await BTD_API_SIM()               // then play; the board and counters come alive
BTD_API_SIM.skew(60e3)            // move the server's clock on, for a plausible win
BTD_API_SIM.sql('SELECT * FROM runs')
```

## On a phone

- **Touch controls.** A joystick for the left thumb and the fire button for
  the right, the same size (76 css px across), always visible during play,
  and **off the picture**: the layout reserves a band under the picture (or
  either side of it, held sideways) and shrinks the picture to leave it, so
  no thumb ever covers the arena. The joystick is a fixed circle with four
  chevrons and a knob that follows the thumb, stops at the rim and springs
  home; the rim lights toward the push. It is analog from its centre: a 12 %
  dead zone, then linear to the keys' full speed at the rim. The fire button
  fires on press and shows the bolts left. Pointers are tracked by id: the
  stick thumb never fires, the fire thumb never steers, both work at once, and
  a touch anywhere else does nothing. The stick adds to the key vector, so
  the embed and burn penalties apply to touch exactly as to keys. They are
  drawn on their own layer, `#ctl`, a strip around the two controls redrawn
  only when it changes. A mouse still drags and clicks on the picture.
- **Layout.** On screens under 600 px the bezel goes and the glass takes the
  whole width; on touch the sound button sits at the top centre.
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
                 is slaved to the heartbeat (survive, devil, title, dirge, win,
                 stolen, warden)
- `game.js`    — the game: heartbeat clock, fire renderer, input, hazards, devil AI, endings, rendering
- `build.py`   — bundles everything into `dist/index.html`; `dist/` is the deployable site root
- `dev/bot.js` — the imperfect playtest bot; `dev/perf.py` — frame-time measurement under throttling

No build step, no assets. Plain HTML/CSS/JS; all audio is synthesised at runtime.

## Run

The game reads `localStorage` for the best score, so serve it over HTTP rather
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
Handy for jumping to the fight: `BTD_G.surv = 41.9`. `BTD_STICK` and
`BTD_FIREBTN` are the touch controls (centre, radius, knob and the analog
vector, in css px), and
`BTD_AUDIO.choirLevel(v)` sets the choir's level live for balancing it.

The scripts and the stylesheet are loaded with a `?v=` query. A browser will
keep serving the cached copy while that number is unchanged, so an edit can
look like it did nothing — bump `?v=` in `index.html` (and `BTD_VERSION` in
`game.js`, which is what the page reports) when a change refuses to appear.

With `#debug` a frame-time overlay sits in the bottom-left (the backtick key
toggles it without reloading): fps with the window's low, rolling average,
p95 and max rAF interval, time in update+draw, device pixel ratio, particle
and flame counts. `BTD_PERF()` returns the same numbers (`BTD_PERF(true)`
resets the ring), `BTD_TIER(n)` pins a quality tier, `BTD_WANT(n)` requests
one the safe way, `window.BTD_LOCK_TIER = true` stops the adaptive step,
`window.BTD_NOSHADOW = true` and `window.BTD_SKIP = {devil: true}` leave
effects or drawing blocks out to measure their cost, and
`window.BTD_ZOOM = {x, y, w, h}` magnifies a region of the canvas for a look.

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

**On an iPhone** audio starts only from inside a touch that has *ended* (or
a click) — a touchstart or pointerdown does not count, and a resume from
anywhere else is ignored — so every touchend, pointerup, click and key tries
to unlock it until it runs, playing one silent sample inside the gesture.
The ringer switch mutes Web Audio unless the page's audio session is
`playback`, which is set on the same gesture (Safari 16.4+).

The win has its own music and sounds: his death cry (three sawtooth voices a
fifth and an octave apart falling through a closing formant, into the long
reverb), the crumble of his hands to ash, and the roof splitting open (a
bright crack and a ringing that hangs in the air). As the light comes down the
`win` track starts: the choir open and full in D major — the pit's D minor
turned — I, IV, vi, V, over high bells, carrying on under the panel.

The eerie part of the score is two layers over the chiptune:

- **A choir.** Four voices of two detuned sawtooths each, alternate voices on
  slightly different vibratos, all through one "mouth" of three formant
  filters that drift between *oo* and *ah* over about fifteen seconds (the
  fight holds it open on *ah*). It changes chord on every bar, each voice
  gliding to its note in the next chord, with a small swell as it lands: Dm,
  Gm, F minor, Eb in the survive phase; the tritone chord, a minor ninth and a
  diminished seventh in the fight; a lullaby's Dm, Bb, Ebmaj7, A on the title.
- **A music box with a bent tine.** A pure tone with a quick inharmonic tick,
  its pitch sagging a hair as it rings, and every F a quarter-tone flat, so
  the lullaby is close to right and never quite. It plays a four-bar lullaby
  on the title and a few sparse notes high over the survive phase.

Both sit between 200 Hz and 3 kHz, where a phone speaker actually plays; the
drone, rumble and bass below that are felt on headphones and lost on a phone.
The choir is balanced as a bed (`CHOIR = 0.25`, ~0.056 RMS against the
heart's ~0.085).

The music runs through two sends — a dotted-eighth delay that darkens as it
repeats, and a short plate — fed by the lead, the bell, the snare and the
arpeggio. The bass is a plucked square over a sub sine with a filter that
opens and shuts; the lead is three detuned voices with a fifth beneath; the
bell has inharmonic partials; hats open at random. Every voice is nudged a few
milliseconds and a few percent either way so nothing lands machine-exact. The
fight adds a sixteenth-note arpeggio. The heartbeat itself is a sine that
drops fast, a shorter second body and the valve's slap.


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
Each track has `bars` and optional `drone` (MIDI note), `bed` (low rumble),
`breath` (the breathing layer plus the whisper layer), `choir` (one
four-voice chord per bar, via `chords([...])`, with `choirOpen` for the *ah*
vowel, `choirLevel` for its level) and `box` (a music-box pattern). A sanity check at load throws if a
pattern's length doesn't match `bars * 16` or a choir isn't one four-note
chord per bar.

The title plays `title`. It is asked for as the page loads, so a browser
that lets a page make sound before a tap plays it at once; otherwise it comes
in with the first touch or key that doesn't start a game (scrolling the
board or its tabs, or *Sound on*, which before any sound has played
lets it in rather than muting). Both end panels have **Main menu** (Esc on a
keyboard), back to the title and its music with the
board fetched fresh; there, space or a tap starts level I.

## Single-file build

```
python build.py
```

writes `dist/index.html` with the CSS and both scripts inlined. Point a static
host (Cloudflare Pages, etc.) at `dist/` and that one file is the whole site.
