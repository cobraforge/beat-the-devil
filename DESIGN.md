# Beat the Devil — design rules

These are the rules the game is built on, and why each one exists. They were
arrived at by playtesting and argument, not by accident; a change that breaks
one of them is a regression even if nothing crashes. Read this before touching
`game.js`, `audio.js` or `style.css`. Numbers quoted here are the ones in the
code as of the version stamped `BTD_VERSION` in `game.js`; if you change a
number, change it here too.

The arena is a logical 420×640 canvas (`LW`, `LH`), floor at `LH - 8`.

---

## 1. The five-bolt rule

**Rule.** `AMMO = 5`, no reserve, no lockout. All five can be spent in the
survive phase. The devil needs a bolt through each eye, so a player who
arrives with fewer than two cannot win — and nothing stops them. The only
warning is the title card: *"You have five bolts. Two are for his eyes."*
That line is never repeated during play: no pips changing colour, no "save
two", no click when the fourth is fired.

**Why.** An earlier version reserved two bolts (`RESERVE = 2`) and refused to
fire them. That made the reserve a UI mechanic rather than a decision; the
player could stop thinking about it. The game's tension is that the bolts are
finite and the player has to *remember*. Being told once, and then being
allowed to fail, is the design. A 1-bolt run against the devil is allowed to
happen and is allowed to be hopeless.

**In code.** `AMMO` in `game.js`; `STORY` sets the title-card line. The HUD
draws five identical pips. Don't add ammo pickups, refunds, or warnings.

---

## 2. The 2.0 s penalty window equals invulnerability

**Rule.** Every hit does exactly the same three things: `G.lives--`,
`G.invuln = 2.0`, and a movement penalty of the same length. The penalty
(`G.penalty`) expires *because* `G.invuln` reached zero, not on its own
timer. There is no penalty that outlives invulnerability and no
invulnerability without its penalty.

- Fork embedded: 65 % speed, drags the fork, laboured beat. Released at 2.0 s.
  On impact the fork's momentum also **shoves** the heart along its line of
  travel: 380 px/s decaying exponentially (e-folding 0.25 s, cut at 0.35 s),
  about 72 px in all, with the controls dimmed to 40 % at the start of it and
  never cut. The shove replaces the old constant drift; they do not stack.
  It is clamped only at the playfield's edges (the walls, the ceiling, the
  safe lower edge) — **it may carry the heart into a standing flame.** That is
  deliberate: where you are when a fork lands is part of the decision the
  lock stage (rule 4) asks for, and a shove that politely stopped short of
  fire would make the fork's direction meaningless. The wound bleeds: a spray
  along the fork's direction, a drip that tapers as the fork works loose,
  splats on the floor, and a stain that stays.
- Burnt: 115 % speed with ±0.45 input jitter, clinging flame, panicked beat.
  A burn replaces an embedded fork (it burns away).
- Both leave a permanent scar on the heart (crack / char) that persists across
  lives. That is cosmetic and never affects movement.

There are five lives (`LIVES = 5`, raised from three). How hurt the heart looks
and sounds stays three stages whatever the count — whole, wounded, last life
(`wounds()`) — so the last-life state (guttering, arrhythmic, the red
vignette) always means exactly one more hit ends it. His arms creep in by
the fraction of lives lost (`armCreep()`), reaching the same furthest point
on the last life as they did with three.

**Why.** A penalty that lasts past invulnerability is a second hit the player
did nothing to earn: they come out of the flashing state still slow, get hit
again, and it feels like the game cheated. A penalty shorter than
invulnerability wastes the point — the impairment is the *cost* of the free
seconds. Tying them to a single number means neither can drift. 2.0 s is long
enough to get clear of a column, short enough that a fork volley thrown at
the start of it is still a threat at the end.

**In code.** `hurt()` sets both; the movement block in `update()` checks `if (G.invuln <= 0)`
and only then clears `G.penalty` (calling `releaseFork()` if needed). Never
give `G.penalty` its own duration. The shove is `G.shove` with `SHOVE_V`,
`SHOVE_TAU`, `SHOVE_T`; the blood is `bleed()`, `woundPoint()`, the `blood`
flag on particles and `G.splats`.

---

## 3. Flame height vs. the player ceiling

**Rule.** The heart may fly no higher than `ceilingY()`: `LH*0.25` in the
survive phase, `LH*0.42` in the fight (below his chin). A floor flame may
never reach within 80 px of that ceiling: `flameLimit() = LH - ceilingY() - 80`.
Every column's `hmax` is clamped against `flameLimit()` on spawn *and every
frame*, because the ceiling drops when he arrives and columns lit before that
would otherwise stand through the new limit.

Related: columns rise over 0.8 s (visibly, not instantly); they walk toward a
target locked at ignition — the heart's x, at most 140 px away — at 100 px/s
and then never move again; an eruption is a flare of light, never a gain in
height.

**Why.** If a flame can touch the ceiling the only escape is horizontal, and
with two columns on screen that can mean no escape at all. The 80 px of air
is a promise: over any column there is always a gap the heart fits through.
The frame-by-frame clamp exists because the promise was once broken exactly
at the phase transition. The locked target exists because a column that
tracks the heart is a homing attack the player cannot outthink; once it
stands, dodging is a matter of geometry.

**The picture must match the box.** A column's danger is the rectangle
`|x - fl.x| < w/2`, from `LH - h` to the floor. The fire is drawn as tongues,
so the *hot* part — the orange and yellow layers — has to reach close to `h`
and stay inside `w`; only the dull red outer layer dissolves above it. A
prettier fire that burned lower than its hitbox would be a trap.

**In code.** `ceilingY()`, `flameLimit()`, `spawnWalker()`,
`moveHazards()` (`fl.hmax = Math.min(fl.hmax, flameLimit())`), and the layer
heights in `flameColumn()`.

---

## 4. The three-stage telegraph contract (forks and jets)

**Rule.** Every aimed attack goes **aim → lock → fire**, and the player can
always see which stage it is in.

| | aim | lock | fire |
|---|---|---|---|
| Pitchfork | thin line tracks the heart, 0.45 s | line snaps solid, flashes, 0.22 s; target = heart position led by `vx*0.35` | fixed vector at 520 px/s; sticks in the floor 1.5 s |
| Wall jet | vent glows, line tracks, 0.9 s | line locks and flashes, 0.22 s; target = heart position **at lock, not led** | lance 40×450 px along that vector, 0.3 s out, 0.5 s hold, retract; 15–35° above horizontal |

The aim line is pale (`COLORS.bone`) and dashed; the lock line is solid
sulfur and flashes. The aim line used to be ember red, and against the pit's
red rock it all but vanished — the stage the player most needs to see.

Once locked, nothing re-aims. Fan and bracket forks share the same stages
(bracket pins ±64 px of where you are at throw time, so committing before the
lock is the counter).

**Why.** Danger the player cannot read is not difficulty, it is noise. The
aim stage tells you *what* is coming, the lock stage tells you *where* and
gives a fixed moment to commit, the fire stage is a consequence you chose.
The fork leads the heart because the fork is the game's basic threat and
standing still must not be safe; the jet does *not* lead because a leading
lance across half the arena would punish the correct dodge. The stick time
turns a miss into terrain for a moment, which is what makes fans and
brackets interesting.

**In code.** `throwFork()` (`aimT 0.45`, `lockT 0.22`), `spawnJet()`
(`aimT 0.9`, `lockT 0.22`), the state machines in `moveHazards()`. Any new
aimed attack must use the same three states and the same lock length.

---

## 5. Hazard limits in the survive phase

**Rule.**
- **At most two hazards** of any kind exist at once (`hazardCount() < 2`;
  a fork volley counts as one, a dying column as none). Spawns are
  *skipped*, never queued — a blocked spawn is gone.
- **At least 40 % of the arena width is flame-free** at all times
  (`flameFreeOK`: the union of every live column's walk span ≤ `0.6*LW`).
  A column that would break it is not lit.
- **Wall jets**: none before 40 % of the phase; then one every 7 s, easing to
  4.5 s in the last quarter; only one at a time; never fired into a half
  where a column is still rising; prefer the half opposite the last column.
- Embers start at 25 %, forks and columns from the start, all on their own
  timers that shorten with progress.

**Why.** The survive phase has to be completable *without perfect play* —
this was checked with an imperfect bot (150 ms reaction, 20 % dropped
frames) that reaches the devil every run. The cap of two is what makes that
true: a third simultaneous hazard is where the bot, and the player, stops
having a correct answer. The 40 % invariant is the horizontal version of the
80 px ceiling: there is always ground to stand on. Jets were originally on a
4 s timer from the start and stacked with columns; cutting them to one-at-
a-time, late, and off rising halves was what brought the phase back from
unfair. "Skip, don't queue" matters because a queue turns a quiet moment
into a burst the moment it clears.

**In code.** `hazardCount()`, `mayspawn()`, `flameFreeOK()`, `walkerSpan()`,
`risingHalves()`, `jetHalves()`, and the survive-phase timers in `update()`. The bot
is `dev/bot.js` (`BTD_BOT(runs, opts)`); rerun it after any change here.

---

## 6. No straight lines on the claws and arms

**Rule.** His arms, hands, fingers, the pointing hand and everything that
closes around the heart are drawn with curves only — beziers, quadratics and
Catmull-Rom splines. No `lineTo` in a limb, no polygonal knuckles drawn as
shapes. Knuckles are swellings of the finger's own outline; tendons and veins
are raised ridges (a light line over a shadow line), never joints.

**Orientation.** He faces the player, so the arm from the screen's left is
his right hand and the arm from the right is his left; the two are mirror
images across the centreline. On both: the palm faces the heart, the thumb
rides the upper edge and curls over the top, the four fingers hang from the
lower edge and curl down and in, talons hooking toward the heart. The same
holds when the hands close on the heart at the ending — thumb over its top,
fingers wrapping beneath. (The first version rooted the thumb on the lower
edge, so both hands were upside down before mirroring.)

**Anatomy.** Long gnarled fingers with pronounced knuckle bulges; a thick
muscled wrist and forearm; rough cracked hide (the `hideOver` multiply, top
tier only); deep red darkening to the fingertips; long black glossy hooked
talons, at least a third of the finger; lit from the fire below — warm rim on
the lower edges, deep shadow between the fingers.

**Why.** The first arms were segmented — jointed tubes with drawn knuckles —
and read as a cartoon robot. The horror comes from the arms looking like
flesh moving under its own power: muscle, not mechanism. Straight edges and
visible joints make it a diagram. This rule was applied twice (the arena
arms, then the pointing hand at the ending), and both times it was the thing
that fixed the look.

**In code.** `makeArms/updateArms/drawArm/drawFinger`, `spline()`,
`drawPointingHand()`.

---

## 7. Touch: two thumbs, off the picture

**Rule.** On touch devices there are exactly two controls, the same size
(76 css px across, `CTL_R = 38`), always drawn during play, and **never over
the arena**: they have ground of their own. `resize()` reserves a band of
`CTL_BAND` (104 css px) under the picture, or a band either side of it on a
phone held sideways — whichever costs the picture less — and the picture
shrinks to leave it (on a tall phone it does not shrink at all; on a short
one, about 2 %).

- **The joystick**, left: a fixed, visible circle with a knob that follows the
  thumb and stops at the rim. Analog, measured from the circle's fixed centre:
  a 12 % dead zone, then linear to full speed at the rim — and full speed is
  exactly the keys' 265 px/s. A thumb that lands within 2 × R takes it. Let go
  and the heart stops and the knob springs home.
- **The fire button**, right, mirroring it, showing the bolts left. It fires
  on press; a thumb within 1.35 × r counts.

Pointers are tracked by id for their whole life: one that lands on the button
never steers, one that lands on the stick never fires, and a touch anywhere
else — including on the picture — does nothing at all. Both thumbs work at
once. The stick's vector is added to the keys' vector, so the speed and every
movement penalty (rule 2) are the same multipliers on touch as on keys. The
sound button sits at the top centre. A mouse keeps drag-to-move and
click-to-fire, and only on the picture.

**Why.** Drag-anywhere made the player chase the heart with a finger that
covered it. The first stick sat in the playfield's bottom-left corner, and a
thumb there hid exactly what comes out of that corner: the wall jets fire
diagonally from vents as low as the floor, and their aim line starts at the
wall (rule 4). Making the stick smaller would not have helped — the thumb is
the same size — so the controls moved off the picture entirely. A *visible*
fixed circle tells a new player where the left thumb lives; an earlier
floating stick that only appeared under the thumb did not read as a control.
The stick thumb can never fire and stray touches do nothing, because with five
bolts for the run (rule 1) a hesitant touch that fired would be a lost game.
Adding the stick to the key vector keeps rule 2 honest.

**In code.** `CTL_R`, `CTL_BAND`, `ctlMode` and the band in `resize()`;
`layoutControls()`, `stick`, `fireBtn`, `onStick()`, `onFireBtn()`,
`stickTo()`, `stickRelease()`, the window's `pointerdown/move/up` handlers,
the `mx += stick.jx` line and `mag` in `update()`. They are drawn by
`drawControls()` onto their own layer, `#ctl` — a strip just around the two
controls, redrawn only when something on it changes. (A full-screen layer
redrawn every frame cost ~5 ms a frame at 4× throttle.)

---

## 8. Quality tiers never touch the rules

**Rule.** `QUALITY` has three tiers (full, medium, low). They change only
what is drawn: shimmer, smoke, glow sprites, particle share, flame edge
detail, fire texture resolution, how often his face and the arms are redrawn.
The game starts at full and steps down when the rolling one-second frame
average exceeds 20 ms — applied only in the survive phase or while he is
between attacks (`open`), never mid-attack. Tiers never step up during a run.

**Why.** A frame-time stutter mid-attack is bad; a *visual change* mid-attack
is worse, because the telegraph contract (rule 4) depends on the player
reading the same picture from aim to fire. So the step waits. Nothing that
affects hit-testing, speeds, timers or spawns may live in a tier, or the game
would play differently on a slow phone.

**In code.** `QUALITY`, `Q`, `setTier()`, `adapt()`, `applyTier()`,
`addPart()`, `shadowR()`, `drawGlow()`, `makeLayer()`.

---

## 9. Rules that cut across everything

- **The heartbeat is the master clock.** 68 bpm at rest to 150 at full
  danger; the floor glow, embers, aura and the music sequencer all pulse from
  `G.heart`. The choir changes chord on the bar and the music box plays on
  the steps, so the eerie score speeds up with the heart too. Hits stop it
  for 200 ms, then arrhythmia. In the mix the heart must always be audible:
  `HEART_GAIN 1.3`, fire ducks under every lub, and the laugh ducks
  everything but leaves the heart at 50 %.
- **The score is a bed, not a lead.** The choir (`CHOIR = 0.25`) sits at
  ~0.056 RMS on the music bus, under the heart's ~0.085; at 0.9 it was 2.5×
  the heart and buried it. The choir and music box live between 200 Hz and
  3 kHz on purpose: a phone speaker plays almost nothing below 200 Hz, where
  the drone, rumble and bass live, so without them a phone heard little
  music at all.
- **All audio is synthesised.** No asset files; Web Audio only. Sound counts
  are capped (thuds 3, fire voices 4) so the mix cannot clip.
- **The palette lives in `style.css`.** JS reads the custom properties once
  (`COLORS`, `col()`); no hardcoded hex in draw calls.
- **The pit stays dark where the play is.** The arena is the bowels of hell
  (`drawPit`): black under the roof, red only toward the magma floor, crags
  and walls near-black, veins of magma that pulse with the heart but sit low
  and along the walls. Every hazard is fire too; if the background glowed in
  the middle of the arena, fire would stop reading as danger.
- **The ending is silent about the score.** No HUD once the heart is taken;
  the panel sits in the lower third, in his light.
- **The win is a release, and it is seen whole.** When the second eye goes
  (`FREE` in `game.js`): he burns, cracks and sinks; his hands make one last
  grab and close on the heart — its beat muffled inside them, as in the
  losing ending; with him gone they burn to ash and crumble, letting it go;
  the roof splits and a shaft of light comes down; in it the heart heals
  (scars fade, colour returns, the beat slows to a calm, regular 60) and
  rises out of the pit. Then the panel, low, under the light: *Your soul is
  free.* The losing ending is the same grasp that never lets go — the two
  mirror each other, and the win has to *show* the release to mean it. Its
  hands keep rule 6: the ash cracks are curves.
- **No references to any source material.** The title is "Beat the Devil"
  and that is all. No author, book, series, year or "based on" — in the UI,
  the README, or code comments.

---

## 10. The score is the finish, and the world keeps it

**Rule.** Only a completed run scores — the devil beaten. Its score is
`hearts × 1000 + max(0, round((300 − seconds) × 10))`: a heart is worth a
hundred seconds, and speed tops out at 2,500 more. The clock runs from the
first step into the pit to the bolt that kills him and **never stops**, not
for a pause. Nothing else earns points: grazes are marked (`CLOSE`) but pay
nothing, and the HUD shows the clock and the world's high score, not a
running total.

The board is the world's: a Cloudflare Pages Function over a D1 database
(`functions/api/[[route]].js`). **The server keeps the time.** A run starts
with `/api/start` and is decided with `/api/end`, sent the moment the devil
dies or the heart is lost; the seconds are the server's own clock between the
two, and the server computes the score. The client sends only the outcome
and the hearts left, checked for range; a win under 50 s is refused (the
fastest real one is about 55; in level 2, under 55 s, since its rescue alone
is 50). The fifty best *named* runs make the board; a
run that places gets fifteen minutes to take a name (twelve characters,
upper case). Each is stored with its date. Every game counts toward the
soul counters on the title: *stolen* (every loss — the heart gave out or he
took it) and *freed* (every win).

The game never waits on the world. Every call times out in 6 s; if there is
no server — a static host answering with a page, or no database bound (503)
— the board and counters are hidden and the game plays exactly the same,
with a best score kept on the device.

**Why.** The old points (ten a second of survival, fifty a graze, a hundred a
fork, three thousand an eye, bonuses at the end) rewarded dawdling: a slow,
careful run outscored a fast one, and the number meant nothing to anyone but
the player. The board ranks what the game is about — getting out, fast, with
the heart whole. A time the client reported would be a number anyone could
type; the server's clock cannot be made to run faster than real time, which
is why pauses count (the server cannot see them). The hearts are still the
client's word: someone determined can post a fake win. The rate limit (12
starts a minute per player, by a hash of the address, never the address) and
the time floor keep that to deliberate effort, not a script.

**In code.** `boardScore()`, `runSeconds()`, `runOver()`, `WORLD`, `api()`,
`worldLoad/Start/End()`, `renderWorld()`, the name form; on the server
`scoreFor()`, `MIN_SECONDS`, `TOP`, `NAME_MS`, `STARTS_PER_MINUTE`.

---

## 11. Level 2: The Stolen

The second level. It opens once level 1 has been beaten on the device (or a
best score is already saved there). Everything above holds in it — five
bolts, five hearts, the 2.0 s penalty, the telegraph contract, two hazards at
most — except where this section says otherwise.

**The premise.** The light will not take you alone. Below the pit is his
dungeon: cages hang from the roof, each holding a stolen soul (a small, dim
heart), and the floor is a river of lava under a crust. A shaft of light
comes down at the top centre. You free the souls and carry them up into it.

**The rescue phase** lasts `G.SURV = 50` s; the meter reads *HE IS COMING*.
- **Seven souls**, in cages at most four at a time (a new cage lowers when
  one is emptied), 190–420 px down. **To open one**, hold the heart within
  30 px of it for 1.0 s; leaving drains the lock back at twice the rate.
- **Freed souls follow** in a short trail. You can carry **three**; each slows
  you 6 % (a multiplier like the penalties, so rule 2 still holds).
- **To deliver**, carry them into the light: 88 px wide at the top centre,
  reached by flying to within 44 px of the ceiling there.
- **A hit drags every soul you carry back into a cage.** Lives, invulnerability
  and the penalty are the same as ever.

**Its hazards**, two groups at most, skipped not queued:

| | aim | lock | fire |
|---|---|---|---|
| Chain | anchored in the roof, a pale line tracks the heart, 0.45 s | snaps solid, flashes, 0.22 s; target = heart **at lock, not led** | lashes along that vector at 1400 px/s to the floor or a wall, lies there 1.0 s, retracts 0.3 s; a hit is a plain hit |
| Lava | one half of the floor bubbles and glows, 1.5 s | — (the half is fixed from the first bubble) | rises 0.4 s to 80 px, holds 2.2 s, falls 0.6 s; a burn |

Lava never rises on both halves, never on the same half twice running, and
not before 20 % of the phase; 80 px leaves the rest of the arena to stand in.
**Shades** come only while you carry souls: a dark swirl gathers at a wall for
0.8 s, then drifts at 85 px/s (the heart moves at 265) toward your *last*
soul. Touching the soul takes it back to a cage; touching the heart does
nothing. A shade lasts 6 s, and a bolt ends one — a bolt spent there is a
bolt not spent on the lantern.

**The Warden** arrives when the meter fills: the cages are hoisted out of
reach, the ceiling drops to `LH*0.42` as in the fight, and his lantern is the
target. It is shuttered except in its open windows (1.9 s, 0.3 s shorter per
hit); **two hits break it**. *"You have five bolts. Two are for his lantern."*
is said once, at the start of the level, and never again. His attacks cycle:
three chains (the same chain, from his hands, staggered 0.5 s); a lava rise;
and his **lantern beam** — the light tracks the heart's x across the floor for
0.9 s, locks and flashes for 0.22 s, then a 36 px column of it stands at the
locked x for 0.6 s (a burn). A bolt on the shuttered lantern is *NOT YET*; on
his body, *WASTED*.

**Endings.** Break the lantern and every cage bursts: all the souls, caged
and carried, join the heart, the roof splits, and the light takes them up
together, healing the heart as in rule 9. Run out of bolts with the lantern
whole, and he locks the heart in a cage with them.

**Score.** `hearts × 1000 + time bonus + 500 × souls you brought out` — those
delivered into the light during the rescue, plus those still with you when
the lantern breaks. The board is its own (level 2's top fifty), and the
title's counters add *souls returned*: every soul delivered, in any run, won
or lost.

**Why.** Level 1 is about not being hit; level 2 is about what you are willing
to risk while carrying something. Holding still to open a cage, flying up to
the light, choosing to carry one or three — each is a decision the hazards
price. A hit costing the souls you carry (not just a heart) is what makes
carrying three a gamble rather than a free speed-up. Shades hunting the souls
instead of the heart give the player something to protect, not only
something to dodge. The Warden reuses the fight's grammar (windows, two
hits, one line said once) so a player who beat the devil can read him at a
glance, and the chains reuse the jet's unled lock so the dodge is geometry.

**In code.** `G.level`, `startGame(level)`, the `LEVEL 2` section of
`game.js`: `STOLEN`, `stolenReset()`, `lowerCage()`, `updateStolen()`, `spawnChain()`,
`spawnLava()`, `spawnShade()`, `makeWarden()`, `updateWarden()`,
`wardenBolt()`, the `released` and `caged` endings, and their drawing.

---

## Checking a change

1. `python build.py` must produce a single-file `dist/index.html`.
2. Run the bot: with `#debug`, `BTD_BOT(8)` should reach the devil every run;
   losses should be column hits, never jets or forks stacked past the cap.
3. Step the penalty: `hurt('fork')`, then `BTD_STEP` 2.0 s; `G.penalty` and
   `G.invuln` must clear on the same frame.
4. Light two columns and check `flameFreeOK` still rejects a third that would
   cover more than 60 %.
5. Screenshot the arms; if you can find a straight edge, it's wrong.
   Step through the win (`FREE`) too: the grasp, the ash, the light.
6. `python dev/perf.py --software --rates 4` before and after anything that
   touches drawing; the numbers in the README are the reference.
7. For anything touching the board, load `dev/api-sim.js` on a `#debug` page
   and play a run through the real server code (see the README).
