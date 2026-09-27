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
warning is the title card, and the same line on the level's briefing (rule
13): *"You have five bolts. Two are for his eyes."* It is never repeated
during play: no pips changing colour, no "save
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
aimed attack must use the same three states and the same lock length; level
2's chains, spearmen and crossbowmen do (rule 11).

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
sound button sits at the top centre, and in play the pause button beside it
(a phone has no Esc or P); they are buttons, not controls, and a tap on either
does nothing else. Paused, a tap anywhere but the pause screen's buttons
resumes. A mouse keeps drag-to-move and click-to-fire, and only on the
picture.

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
  `G.heart`. **When a boss comes the heart races**: in the devil's fight and
  the Warden's its danger never drops below 0.72 (127 bpm), against the survive
  phase's slow build from 68, so the fight's music (`devil`, `warden`: a bass
  pumping sixteenths, an arpeggio, a riff, snare with ghosts and rolls,
  sixteenth hats) runs faster and harder than anything before it. The choir changes chord on the bar and the music box plays on
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
- **All audio is synthesised**, with one exception. No asset files; Web
  Audio only. Sound counts are capped (thuds 3, fire voices 4) so the mix
  cannot clip. The exception is the narrator (rule 13): his six story lines
  are recordings of a neural voice, rendered offline from the game's own text
  (`dev/voice.py`, `voice/`, a quarter of a megabyte), because no browser's
  built-in voice was good enough to tell the story. They still play through
  Web Audio, so mute and pause hold them.
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

The second level, and the only way into it is through the first: there is
no choosing a level. Every run starts in the pit; beat the devil and the win
panel's next step (space, or a tap) goes *back down for them*. From anywhere
else — the title, any loss, level 2's own win — the next run is the pit
again, so losing in the dungeon means starting over from the beginning.
Level 2 starts with five hearts and five bolts of its own. Everything above
holds in it — five bolts, five hearts, the 2.0 s penalty, the telegraph
contract, two hazards at most — except where this section says otherwise.

**The premise.** The light will not take you alone. Below the pit is his
dungeon: cages hang from the roof, each holding a stolen soul (a small, dim
heart), and the floor is a crust over magma. A shaft of light comes down at
the top centre. You free the souls and carry them up into it.

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
| Chain | a spiked ball waits in a clamp under the roof girder (`CHAIN.ROOF = 97`, under the HUD), its chain run to a pulley; a pale path shows its drop and the arc it will swing, 0.9 s; the chain's length tracks the heart | path snaps solid, flashes, 0.22 s; the arc passes through the heart **at lock, not led** | the clamp opens; the ball falls (gravity 1300 px/s²) until the chain runs out, catches, and swings as a pendulum for 3.0 s, striking the walls and coming off them at half speed; then it is hauled up in 0.5 s, harmless |
| Spear attack | 1–3 spearmen of the patrol (the nearest free) stride under the heart at 75 px/s, 64 px apart; a pale line over each pike shows its reach (the heart's height + 50, 150–360 px above the floor), 0.9 s | lines solid, flash, 0.22 s, then a further 0.18 s per knight, left to right | each drives his pike straight up in 0.1 s, holds 0.4 s, pulls it back 0.3 s, and after 0.5 s marches on; the pike is a plain hit within 13 px of its shaft |
| Crossbow attack | a crossbowman of the patrol stops, raises his crossbow to his shoulder (0.3 s) and aims up at the heart along a pale line, 0.7 s | line solid, flashes, 0.22 s; **at lock, not led** | a quarrel along that line at 720 px/s, into the roof or a wall; a plain hit |

The chain's ball hurts from the moment it is let go (within 19 px of the
heart's centre); its chain hurts once it swings (within 11 px). **What hurts
is on fire**: the ball heats in its clamp through the aim and lock (a glow,
then flames), and from the moment it is let go the ball burns — flames
streaming back from its motion, embers shedding — and the chain glows and
burns along its length; the fire dies down as it is hauled up, when it no
longer hurts. His flail burns the same way. **One swinging
chain at a time.** It is let go on the far side of the heart when there is
room (down through the bottom and up through the heart), or dropped beyond
it on the heart's own side, whichever carries the swing past it.
**The patrol.** Dark knights march in from the sides as the meter fills (a
spearman as the level's card clears, another at 20 %, a crossbowman at 40 %,
a spearman at 70 %; four at most) and pace the floor at 30 px/s, turning at
the walls, every 4–7 s, and short of each other, their helms turned up to
follow the heart. **Touching one is a hit** (within 20 px of his middle, below
the top of his helm, 100 px up). The patrol itself is not a hazard for the cap
of two; its attacks are — a spear attack is one group, a crossbow attack (and
its quarrel in flight) another. Spear attacks come from 20 % of the phase (one
spearman before 45 %, two before 75 %, then three), every 6.5 s easing to
4.5 s; a crossbow attack from 40 %, every 8–10.5 s (a little sooner as the
meter fills); a chain is tried every 3.4–4.4 s.
**A ball that meets a hanging cage smashes it** — if it is moving hard (over
220 px/s) — and the soul spills out. It does not wait: it sinks toward the
crust at 22 px/s, guttering in its last 1.6 s, and after 4.5 s the pit takes
it back to be caged again (*LOST*). The heart collects it by touching it, if
there is room to carry it. A ball through a shade ends the shade.
**Shades** come while you carry souls or while a spilled soul waits, and go
for your last soul, or failing that the nearest spilled one: a dark swirl gathers at a wall for
0.8 s, then drifts at 85 px/s (the heart moves at 265) toward your *last*
soul. Touching the soul takes it back to a cage; touching the heart does
nothing. A shade lasts 6 s, and a bolt ends one — a bolt spent there is a
bolt not spent on the lantern.

**The Warden** arrives when the meter fills: the cages are hoisted out of
reach (spilled souls are taken back up with them), the ceiling drops to
`LH*0.42` as in the fight, and he comes down out of the dark. He is a knight
in black iron, his legs lost in a tattered cloak: a horned great helm with a
fire in its slit (it lights as he arrives, then he roars), peaked and spiked
pauldrons, ribs worked into his breastplate with a fire in the grooves, the
keys to every cage at his hip. **His lantern hangs from his left fist** on a
chain and swings with his movement (a pendulum, like everything that hangs in
this level), so a shot at it is led; it is the target, shuttered except in its
open windows (1.9 s, 0.3 s shorter per hit), when he raises it. **Two hits
break it.** *"You have five bolts. Two are for his lantern."* is said once, on
the level's briefing (rule 13), and never again; once play starts, a grace of
`STOLEN.INTRO = 1.5` s passes before its hazards. His attacks cycle: his **flail** (the
chain from his right fist, wound back along its arc through the aim and lock
and let fly, 110–520 px long, swinging 2.6 s — he stands still while it is
out); his **lantern beam** (the lantern gathers its light for 0.9 s while a
pale line runs from its foot to the floor under the heart, tracking its x;
the line locks and flashes for 0.22 s; then a beam of energy stands along it
for 0.6 s, 10 px wide at the lantern and 40 px where it strikes — a burn); and
**his knights** (he sends the patrol at the heart: its spearmen as a rank of up
to three, then next time its crossbowmen, 0.35 s apart; and more march in
until there are three spearmen and two crossbowmen). **His crossbowmen also
shoot on their own** all through the fight: two march in as he comes, and one
of them looses at the heart every 3.2–4.4 s (0.4 s sooner for each hit on the
lantern), on top of his cycle. A quarrel through a heart that cannot be hurt
(just hit) flies on. A bolt on the shuttered lantern is *NOT YET*; on his armour (helm,
pauldrons, breastplate, faulds, arms), *WASTED*. Bolts pass through his cloak.

**Endings.** Break the lantern and every cage bursts: all the souls, caged
and carried, join the heart; his armour comes apart (the helm and pauldrons
fall into the crust) as he burns away, and his knights burn away with him; the roof splits, and the light takes
them up together, healing the heart as in rule 9. Run out of bolts with the
lantern whole, and he locks the heart in a cage with them.

**Score.** `hearts × 1000 + time bonus + 500 × souls you brought out` — those
delivered into the light during the rescue, plus those still with you when
the lantern breaks. The board is its own (level 2's top fifty), and the
title's counters add *souls returned*: every soul delivered, in any run, won
or lost.

**Why.** Level 1 is about not being hit; level 2 is about what you are willing
to risk while carrying something. Holding still to open a cage, flying up to
the light, choosing to carry one or three — each is a decision the hazards
price. A hit costing the souls you carry (not just a heart) is what makes
carrying three a gamble rather than a free speed-up. The chains were first a
line lashing out along the aim at 1400 px/s: it read as a laser, not iron. A
real pendulum is readable from its first moment (the path is drawn, and a
swing slows at its ends and is fastest at the bottom, as everyone knows), and
it turns a hazard into a gate to time: the ground inside its arc is open
between swings. Letting the ball smash cages makes the chain something to
use as well as dodge — stand by a cage and step away at the last moment, and
it opens the cage for you. The knights replaced a rising floor of lava that
did nothing but take half the arena away: a pike thrust is the jet's
vertical cousin (a column locked on the heart, dodged sideways), and a
crossbow is the fork's. They first rose out of the crust wherever the heart
was, with nothing to see before they came; as a patrol they are on the floor
the whole time, looking up at the heart, so the player can see which of them
will come and from where, and the floor is somewhere to keep away from rather
than a trapdoor. The lantern's beam was first a column standing at the
heart's x with a line bent to it from the lantern, and it seemed to come from
nowhere (or from his keys); a beam is a straight line from what makes it.
The Warden reuses the fight's grammar (windows, two hits, one line said once) so a player who beat the devil can read him at a glance; a
swinging lantern is the devil's sway, lead your shot. Making the dungeon
something you reach only by beating the pit keeps the story in order — you
go back down for them — and makes level 2 the reward, not a menu item.

**In code.** `G.level`, `nextLevel()`, `startGame(level)`, the `LEVEL 2`
section of `game.js`: `STOLEN`, `stolenReset()`, `lowerCage()`,
`updateStolen()`; `CHAIN`, `spawnChain()`, `chainPlan()`, `stepChain()`,
`ropeStep()`, `smashCage()`, `updateStrays()`; `KNIGHT`, `PATROL`,
`knightEnter()`, `knightAttack()`, `updateKnights()`; `WARDEN`, `makeWarden()`,
`wardenPose()`, `spawnFlail()`, `beamLine()`, `updateWarden()`, `wardenArmour()`,
`wardenBolt()`,
`updateWreck()`; the `released` and `caged` endings; and their drawing
(`drawChain()`, `drawKnight()`, the Warden's sprites `wardenBack()` /
`wardenFront()` and `drawWarden()`).

---

## 12. Dev mode

**Rule.** Five clicks on the cabinet's rainbow badge, then five on its orange
power lamp (no more than 3 s between clicks), turn dev mode on; the same
knock, or its own button, turns it off. It stays on across reloads on that
device (`btd.dev`). Its panel, over the page's top-left corner, starts either
level at once, jumps to the boss, kills him, and toggles no damage, endless
bolts, slow motion (0.35×) and the frame-time overlay; a small *DEV* shows in
the corner of the picture while it is on. A run is a **dev run** if dev mode
is on when it starts or is turned on at any moment during it (`G.dev`): **a
dev run never reaches the world board or the counters, and never becomes a
saved best** — its end is never sent, no name is asked for, and the win and
lose panels say *Dev run · not recorded*.

**Why.** Testing level 2 used to mean beating level 1 every time, and a test
run on the live site bumps the public counters. The knock is on the cabinet
because it is out of the way of play; the cabinet is not drawn on screens
under 600 px, so it is a computer's or a tablet's.

**In code.** `DEV`, `devKnock()`, `devToggle()`, `devRender()`, the `#dev`
panel in `index.html`; `G.dev` is set in `reset()` and by `devToggle()`, and
`worldStart()`, `runOver()` and `saveBest()` check it.

---

## 13. A briefing before each level

**Rule.** Every run from the title opens on level 1's **briefing**, and the way
down from level 1's win opens on level 2's: a panel with the level's name, its
story typed out a page at a time (38 letters a second, by the clock), then a
page of what to do — the level's rules in a few lines and the controls for this
device. Space, a click or a tap finishes a page still typing, turns a finished
one, and on the last page begins the level; *Skip* jumps to the rules, *Story*
goes back to the start, and Esc does the first (and from the rules, goes to the
title). **The story plays every run**, read aloud by the narrator (below).
**Every run starts from the main menu**: from a loss, or level 2's win, space
or a tap goes back to the title (its hint says so, and there is no Main menu
button where space already goes there). Level 1's win panel says plainly what
comes next — a boxed *NEXT · LEVEL II · THE STOLEN* with a line of
the story, which a tap follows, and *continue to Level II* on its hint.

**The story.** Level 1: a game in a shop that was not there last week; nights
lost to it, friends drifting off; tonight the white heart on the screen beats
with your own, and he wants it. Level 2: the light would not take you alone;
you were not the first to play, and the ones he beat before you hang in his
dungeon — seven stolen souls, and his Warden keeps the keys. It is told to
*you*, the player, and names no one; rule 9's no-references rule holds.

**The narrator.** Each story page is read aloud: a recording of a neural
voice (Piper's "cori", a British woman's voice from audiobook readings, public
domain), rendered offline from `BRIEF` itself by `dev/voice.py` — so the
recordings always say what the pages show; re-run it after changing the
story, and bump `VOICE_V`. Page 1 of each level begins with the level's spoken
name (its `say`). She reads with more life than the model's default (noise
0.82 / 0.95), a little slow (1.1), letting each sentence land (0.5 s); the
last line of a page with more than one paragraph is its sting — a held 0.9 s
before it, and drawn out (1.3). The lines play through Web Audio at 0.97
speed, with the long reverb around her and a ghost just behind her voice (the
same voice through a slowly wavering 28 ms delay, darker, at 0.3), the music
stepping back to a third under her. `voice/timings.json`
says when each paragraph is spoken and which letters it covers, and the page
types out in step, paragraph by paragraph. They are fetched once, just after
the page loads. The narrator is silent when the game is muted, and the
briefing's *Voice* button turns her off on the device (`btd.voice`);
starting the level, Skip, or the title stops her. (The first version used the
browser's own speech synthesis; on Windows it was the old desktop voice, and
it sounded cheap. The second was a man's voice, read flat.)

**Why.** A new player met the pit with no idea what it was for, and level 2
began with a four-second card over live play that could not teach its new
rules (cages, carrying, the light, the lantern). A briefing tells the story
and the rules before anything can hurt you; the story is what gives the heart
its weight (it is yours), and it gives level 2 its reason (you go back down for
them). Every run goes back through the menu and the story because the story
is the game's frame; *Skip* is there for anyone who knows it.

**In code.** `BRIEF`, `BRIEF_CONTROLS`, `openBrief()`, `briefRender()`,
`briefTick()`, `briefNext()`, `briefSkip()`, `briefSpeak()`, `NARRATOR`,
`narratorLoad()`, `hush()`, `AUDIO.narrator` (`narrLoad/Play/Stop` in
`audio.js`), `G.mode = 'brief'`, `tryStart()`; `#scr-brief` and `#win-next` in
`index.html`; `dev/voice.py` and `voice/`.

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
8. For level 2, turn on dev mode (rule 12) and use *Play II*, *Boss now* and
   *No damage*; watch a chain drop and swing, a rank of spearmen, a crossbow,
   his flail, the lantern windows, and both endings.
