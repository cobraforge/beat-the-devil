# Handoff: the typing game

A brief for whoever builds this next: a fresh Claude Code session or a
developer. It says what to build, why, what to reuse from *Beat the Devil*,
and what is still undecided. Read it all before writing code.

---

## 1. Why this game, and why first

This came out of a review of nine app ideas (LSAT, SAT, Japanese, spelling,
typing, a notes marketplace, the BC driving test, gas prices, a campus crush
app). The typing game ranked first because:

- **It fits the author's proven skill.** *Beat the Devil* is a polished,
  single-file canvas arcade game. A typing game is the same kind of thing,
  with the keyboard as the weapon.
- **It's the only idea that belongs on Steam, Windows and Mac.** It needs a
  real keyboard, which is what those platforms have.
- **The content is easy to get right.** Nobody needs an expert to check the
  questions, as they would for SAT or LSAT prep.
- **The legal risk is very low.** The only things to watch are word-list
  licences, font licences and children's privacy (section 7).
- **The market has a gap.** Monkeytype and TypeRacer are free, fast and
  plain; Nitro Type and TypingClub own schools; *Epistory* shows that a real
  game built on typing sells on Steam. Most typing tools feel like drills.
  **A typing game that is actually fun to play** is the opening.
- **The engine can be reused.** It can later drive two more products: an
  ESL spelling mode (type the word you hear) and a Japanese kana mode (type
  romaji, kana appear).

Second in line, as a separate quick project, is a BC driving-knowledge-test
app. It's not part of this handoff.

---

## 2. What v1 is

A short, polished **browser arcade game where typing words is how you
fight**. The player gets faster and more accurate without noticing they're
practising.

**v1 must have:**

1. **A core loop that's fun in the first 30 seconds.** Enemies arrive
   carrying words. Typing a word correctly destroys its enemy. Enemies that
   reach the player cost a life.
2. **Honest typing stats** after every run:
   - WPM (words per minute, counted as characters ÷ 5 per minute);
   - accuracy (%);
   - the keys missed most often.
3. **Progression that teaches.** Early levels use home-row letters only,
   then add rows, then capitals and punctuation. A player who can't type yet
   can still start.
4. **Difficulty that adapts to the player.** Speed follows the player's
   measured WPM, so fast and slow typists both get a challenge (section 5).
5. **A title screen, pause, a results screen and a local best score.**
6. **A single-file web build.** `python build.py` writes `dist/index.html`,
   exactly as in *Beat the Devil*.

**v1 does not have** (later milestones): the spelling mode, the Japanese
mode, a mobile version, accounts, multiplayer, or any live AI in the game.

**Definition of done for v1:**

- It's deployed on the web.
- A stranger can play from the title screen to a results screen without
  instructions.
- A 20 WPM typist and an 80 WPM typist both call it "a bit hard but fair".

---

## 3. Theme: decide before building (open question)

The theme sets who the game can be sold to. Here are three directions:

| Option | For | Against |
|---|---|---|
| **A. Beat the Devil universe.** Type incantations to banish the devil's minions. | Same brand and art style; cross-promotes the first game; the author already has the look, sound and voice pipeline. | A hell theme will put off schools and some parents, which closes the classroom market. |
| **B. A friendly original world.** Space, ocean or a wizard school. | Works for schools and kids; sells to a broad Steam audience. | Needs new art and sound from scratch. |
| **C. A stylish, abstract neon arcade.** | Fastest to build, appeals to adults, no characters to draw. | Less memorable, and less appealing to kids. |

**Recommendation: B**, if selling to schools matters (a teacher licence is
the best recurring money a typing game can earn). **A** if the goal is to
launch fastest to the audience *Beat the Devil* already has.
**The author decides.**

---

## 4. What to reuse from Beat the Devil

The repository `cobraforge/beat-the-devil` is the reference. The typing game
is a **new repository**; copy these patterns across rather than sharing code
between the two:

| Beat the Devil | Reuse for |
|---|---|
| `build.py`: inlines CSS and JS into one `dist/index.html` | the same build, unchanged in spirit |
| `index.html` / `style.css`: fixed logical canvas size, scaled with `--s`; overlays for title, pause and end screens | the same screen structure |
| `audio.js`: Web Audio sound effects and a step-sequencer music engine (`TRACKS`, 16 steps a bar) with the tempo tied to the heartbeat | tie the tempo to **typing rhythm** instead: music that speeds up with the player's WPM is the obvious signature |
| `functions/api/[[route]].js`: Cloudflare Pages Function plus a D1 database; the server times the run and computes the score; rate limits; name cleaning | the world leaderboard (v1.1). Same anti-cheat idea: the server times the run, and the client only reports results |
| Dev mode (secret knock), `#debug` hooks (`BTD_G`, `BTD_STEP`, `BTD_START`), frame-time overlay | same idea, with a new prefix |
| `dev/bot.js`: a deliberately imperfect bot player | a **typing bot** with a target WPM, error rate and reaction delay, to check difficulty at 20, 40, 60 and 100 WPM |
| `dev/perf.py`: frame-time measurement with the CPU throttled | as-is, pointed at the new game |
| `dev/voice.py` + Piper voices (public-domain `en_GB-cori-high`) | narrator lines, and later **the spelling mode's spoken words** |
| `GAME_VERSION` / cache-busting `?v=` / `COFFEE_URL` | same release habits |
| `DESIGN.md` (the rules and why) vs `README.md` (how it's built), and `CLAUDE.md` saying "read DESIGN.md first; keep the numbers in sync" | **start the new repo with all three files on day one** |

---

## 5. Draft design rules (seed for the new DESIGN.md)

These are starting points to prove or change in playtesting. The numbers are
guesses marked **(tune)**. Keep the *Beat the Devil* habit: every rule
states why it exists, and a change that breaks one is a regression.

1. **Typing is the only way to play.** No mouse is needed from the title
   screen to the results screen. Menus work from the keyboard.
   *Why:* the game trains typing, so every interaction should.
2. **Every word is reachable.** A word enters with enough time to type it
   at the player's current target WPM plus a margin of **1.5 s (tune)**.
   Words on screen never overlap. A loss always means the player was too
   slow or made a mistake; the game never makes it impossible.
   *Why:* same contract as *Beat the Devil*'s telegraphs. Unfair deaths
   teach nothing.
3. **Mistakes cost time, not progress.** A wrong key flashes and plays a
   sound, but the word keeps what was already typed correctly. No
   backspacing needed in v1 **(decide)**. Accuracy is scored and shown.
   *Why:* punishing typos by wiping the word teaches players to go slow and
   hate the game.
4. **Accuracy beats speed.** The score multiplier is based on accuracy.
   Below **90 % (tune)** the multiplier falls away.
   *Why:* speed built on bad habits doesn't last; every real typing teacher
   says so.
5. **Difficulty follows the player.** Keep a rolling WPM over the last
   **20 words (tune)**. Enemy speed aims at **110 % (tune)** of it, and
   drops back quickly after a lost life.
   *Why:* one fixed curve bores fast typists and crushes slow ones.
6. **Only letters the player has learned appear.** In the lesson track,
   words use only the keys unlocked so far: home row first, then top row,
   then bottom row, then capitals, then punctuation.
   *Why:* this is how typing is taught.
7. **Targeting is automatic and never ambiguous.** The first letter typed
   locks on to the nearest word starting with that letter. No two words on
   screen start with the same letter **(tune; limits the word pool)**.
   *Why:* the player should never wonder which word they're typing.
8. **The keyboard layout is never the player's fault.** Read `event.key`
   (the character), never `keyCode` or `event.code` (the physical key).
   QWERTY, AZERTY, QWERTZ and Dvorak must all work. Ignore modifier and
   dead keys correctly.
   *Why:* a typing game that breaks on a French keyboard gets refund
   requests and bad reviews.
9. **Stats are honest.** WPM = (correct characters ÷ 5) ÷ minutes, the
   standard way to measure it. Don't inflate it to make players feel good.
   *Why:* players compare it with Monkeytype; if it's inflated, the game
   loses their trust.

---

## 6. Content

- **Word lists:** use a word-frequency list whose licence allows commercial
  use, **check the licence and note it in the README**, or write the lists
  with Claude and check them by hand. Group words by which keys they use,
  for rule 6.
- **Offensive-word filter:** run every list through a blocklist. Kids will
  play this, and a random-word game that shows a slur is the worst possible
  review.
- **Later modes:** phrases and sentences; code snippets (a niche Steam
  audience likes this); the spelling-dictation mode (a Piper voice speaks
  the word and the player types it); Japanese kana (romaji to kana; needs
  a native speaker's check; if the free JMdict dictionary data is used, its
  licence requires attribution and share-alike for the data).
- **Fonts:** only fonts under the SIL Open Font License (OFL) or a similar
  licence, **bundled into the build** (*Beat the Devil* loads Google Fonts at
  runtime, which a Steam build shouldn't depend on).

---

## 7. Legal and privacy checklist

- [ ] Word-list and font licences recorded in the README.
- [ ] No trademarks in the name or the store page (no "…of the Dead" riffs,
      nothing close to "Nitro Type", "TypingClub" or "Monkeytype").
- [ ] **Children's privacy:** the web game has no accounts and no tracking.
      Leaderboard names are optional, filtered and capped at 12 characters,
      like *Beat the Devil*. If it's ever sold to schools or as a kids' app,
      the COPPA rules (US children's privacy law) and app-store kids-category
      rules apply: no third-party ads or analytics.
- [ ] A short privacy policy page. Steam and the app stores ask for one, and
      it's easy to write when nothing is collected.
- [ ] Any Piper voices used are public domain or MIT (as in *Beat the
      Devil*); keep the voice model licence in the README.

---

## 8. Platforms, packaging and money

| Platform | How | Money | Notes |
|---|---|---|---|
| **Web** (own site on Cloudflare Pages) | `dist/` as-is | free demo (first levels), a coffee or support link | the funnel: search, Reddit, teachers |
| **itch.io** | upload the zip of `dist/` | pay-what-you-want, $3 suggested | a same-week launch, and it tests the price |
| **Steam** (Windows, Mac, Linux) | wrap in **Tauri** (small download) or **Electron** (easier) | **$4.99–7.99** | $100 Steam Direct fee, paid back after $1,000 in sales. Valve has waiting periods between paying the fee, showing a "coming soon" page and releasing, so **check the current Steamworks rules and start the store page early** to collect wishlists. A free demo during a Steam Next Fest is the biggest free boost. Steam achievements are optional in v1. |
| **Mac outside Steam** | notarised build | same price | needs the $99-a-year Apple developer account; skip for v1 |
| **Phones** | not in v1 | — | the game needs a hardware keyboard; revisit for iPad with a keyboard |
| **Schools** (later) | web plus a class code | $30–100 per teacher per year | only with theme B; needs a teacher dashboard and stronger privacy work |

---

## 9. Milestones

| # | Milestone | Done when |
|---|---|---|
| M0 | New repo: `CLAUDE.md`, `DESIGN.md` (section 5), `README.md`, `build.py`, empty canvas | `python build.py` produces a page that runs |
| M1 | **Core prototype**: words arrive, typing destroys them, lives, WPM and accuracy | it's fun with placeholder art; the typing bot finishes at 40 WPM |
| M2 | Lesson track (rule 6) and adaptive difficulty (rule 5) | bot runs at 20, 40, 60 and 100 WPM each find it hard but fair |
| M3 | Theme, art, sound effects, music tied to typing rhythm, title/pause/results screens | a stranger plays without instructions |
| M4 | **Web launch** plus itch.io | live link; first real players |
| M5 | World leaderboard (Pages Function + D1, server-timed runs) | same anti-cheat as *Beat the Devil* |
| M6 | **Steam**: desktop wrapper, store page, demo, Next Fest | on sale |
| M7 | Spelling-dictation mode (Piper voices) | the ESL spelling product |
| M8 | Japanese kana mode | checked by a native speaker |

**M1 is the real test.** If typing words at enemies isn't fun with
rectangles for art, no art will save it. Iterate there before M3.

---

## 10. Open questions for the author

1. **Theme:** A, B or C (section 3)?
2. **Name** of the game and the new repo.
3. **Typos:** do they need backspace, or does the word just wait for the
   right key (rule 3)?
4. **Schools:** a real goal (which means theme B and COPPA care), or
   consumers and Steam only?
5. **Price** on Steam, and how many levels the free web demo includes.

---

## 11. How to start the next session

Create the new repository first (for example `cobraforge/<game-name>`),
open a Claude Code session on it with `cobraforge/beat-the-devil` also
attached for reference, and begin with:

> Read `handoff/typing-game.md` on the `claude/cool-albattani-pmcbis`
> branch of cobraforge/beat-the-devil. My answers to its open questions:
> theme __, name __, typos __, schools __, price __. Do milestone M0,
> then M1. Use Beat the Devil's `build.py`, `audio.js`, `DESIGN.md` and
> `dev/bot.js` as the patterns to follow.
