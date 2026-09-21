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
- Burnt: 115 % speed with ±0.45 input jitter, clinging flame, panicked beat.
  A burn replaces an embedded fork (it burns away).
- Both leave a permanent scar on the heart (crack / char) that persists across
  lives. That is cosmetic and never affects movement.

**Why.** A penalty that lasts past invulnerability is a second hit the player
did nothing to earn: they come out of the flashing state still slow, get hit
again, and it feels like the game cheated. A penalty shorter than
invulnerability wastes the point — the impairment is the *cost* of the free
seconds. Tying them to a single number means neither can drift. 2.0 s is long
enough to get clear of a column, short enough that a fork volley thrown at
the start of it is still a threat at the end.

**In code.** `hurt()` sets both; the movement block in `update()` checks `if (G.invuln <= 0)`
and only then clears `G.penalty` (calling `releaseFork()` if needed). Never
give `G.penalty` its own duration.

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

**In code.** `ceilingY()`, `flameLimit()`, `spawnWalker()`,
`moveHazards()` (`fl.hmax = Math.min(fl.hmax, flameLimit())`).

---

## 4. The three-stage telegraph contract (forks and jets)

**Rule.** Every aimed attack goes **aim → lock → fire**, and the player can
always see which stage it is in.

| | aim | lock | fire |
|---|---|---|---|
| Pitchfork | thin line tracks the heart, 0.45 s | line snaps solid, flashes, 0.22 s; target = heart position led by `vx*0.35` | fixed vector at 520 px/s; sticks in the floor 1.5 s |
| Wall jet | vent glows, line tracks, 0.9 s | line locks and flashes, 0.22 s; target = heart position **at lock, not led** | lance 40×450 px along that vector, 0.3 s out, 0.5 s hold, retract; 15–35° above horizontal |

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
Catmull-Rom splines. No `lineTo` in a limb, no polygonal knuckles, no
tendons or joint circles. Fingers are `drawFinger` curls tapering to a talon;
the forearm is two muscle groups with a crease between them and a curved rim
light; the hand is a curved back with fingers curled under.

**Why.** The first arms were segmented — jointed tubes with drawn knuckles —
and read as a cartoon robot. The horror comes from the arms looking like
flesh moving under its own power: muscle, not mechanism. Straight edges and
visible joints make it a diagram. This rule was applied twice (the arena
arms, then the pointing hand at the ending), and both times it was the thing
that fixed the look.

**In code.** `makeArms/updateArms/drawArm/drawFinger`, `spline()`,
`drawPointingHand()`.

---

## 7. Touch: one finger moves, the button fires

**Rule.** On touch devices the only way to fire is the round button in the
bottom-right corner (≥ 72 css px, thumb reach, showing the bolts left). It
fires on press. Pointers are tracked by id for their whole life: one that
lands on the button never moves the heart, the first to land anywhere else is
the move pointer and never fires, and a tap away from the button does
nothing. The heart rides ≥ 90 px above the finger. A drag is a *target* the
heart moves toward at its normal speed, so every movement penalty (rule 2)
applies to touch exactly as to keys.

**Why.** Tap-to-fire on a drag surface meant every hesitant touch spent a
bolt, and with five bolts for the whole run (rule 1) that is a lost game, not
a mistake. Firing on press keeps the shot where the eye is. Tracking by id is
what makes two thumbs work: without it a second finger either fired the drag
or dragged the fire. The offset keeps the thumb off the heart, and the
target-not-teleport movement keeps rule 2 honest — an earlier version let a
drag move the heart 1:1, which made the embed penalty vanish on a phone.

**In code.** `pointers`, `movePtr`, `drag`, `fireBtn`, `onFireBtn()`, the
`pointerdown/move/up` handlers and the drag block in `update()`; the button is
`drawFireBtn()` in the HUD.

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
  `G.heart`. Hits stop it for 200 ms, then arrhythmia. In the mix the heart
  must always be audible: `HEART_GAIN 1.3`, fire ducks under every lub, and
  the laugh ducks everything but leaves the heart at 50 %.
- **All audio is synthesised.** No asset files; Web Audio only. Sound counts
  are capped (thuds 3, fire voices 4) so the mix cannot clip.
- **The palette lives in `style.css`.** JS reads the custom properties once
  (`COLORS`, `col()`); no hardcoded hex in draw calls.
- **The ending is silent about the score.** No HUD once the heart is taken;
  the panel sits in the lower third, in his light.
- **No references to any source material.** The title is "Beat the Devil"
  and that is all. No author, book, series, year or "based on" — in the UI,
  the README, or code comments.

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
6. `python dev/perf.py --software --rates 4` before and after anything that
   touches drawing; the numbers in the README are the reference.
