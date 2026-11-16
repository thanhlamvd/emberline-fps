# EMBERLINE — a round-based tactical FPS

A Counter-Strike-style tactical shooter that runs in a desktop browser from
static files. You are EMBER (orange) with two AI teammates, attacking the
ASHEN defenders (blue) on FOUNDRY YARD, a 36 × 28 m dusk industrial yard with
two bomb sites. Win rounds by eliminating the enemy team or by planting the
charge and holding the site until it detonates. First to 5 rounds (max 9)
takes the match.

Built for the make.fun bounty **"Make the best three.js tactical FPS"**
(`threejs-fps-02`) on three.js 0.187.0. No build step, no network requests:
the game is plain ES modules plus the vendored three.js files under `game/`.

## How to run

Serve the `game/` folder with any static server and open it in desktop
Chrome (or any Chromium with WebGL):

```sh
cd game
python3 -m http.server 8124
# open http://localhost:8124/
```

Click **Deploy** (or press Enter) to lock the mouse and start. Click again
on the pause overlay to re-lock after dying or pressing Esc.

## Controls

| Input | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look (pointer lock) · Click: fire |
| 1 – 4 | Weapons (P9 / VK-47 / Rook-9 / Longbow .50) |
| R | Reload |
| G | Throw flashbang |
| E | Plant the charge (hold inside a site) |
| Ctrl | Crouch |
| Shift | Walk (quiet, slower) |
| Space | Jump |
| B | Buy menu (during the buy phase) |

## The match

- **Rounds:** 15 s buy phase, then a 100 s round. First to 5 rounds wins
  the match (max 9 rounds).
- **Objective:** plant the charge at site A **Furnace** (west) or site B
  **Crane** (east) — hold **E** for 3.2 s inside a site — then hold it for
  the 35 s detonation timer. Defenders can defuse (5 s channel) to stop it.
  Eliminating the other team also wins the round.
- **Money:** start $800 · kill +$300 · plant +$300 · round win +$3250 ·
  round loss +$1900 plus $500 per consecutive loss (max +$1500).
- **Arsenal:** P9 Sidearm (free), VK-47 Carbine ($2700), Rook-9 SMG ($1500),
  Longbow .50 bolt sniper ($4750, right-click scope), Flashbang ($200,
  blinds bots in line of sight), Kevlar vest ($650, absorbs 50% damage).
- **Gunplay:** headshots deal ×4 damage; recoil and spread punish firing
  while moving; crouching steadies aim; walking is quiet.
- **Bots:** 2 EMBER teammates + 4 ASHEN defenders. Bots follow a waypoint
  graph (BFS routing), hold positions, patrol, investigate gunfire, react to
  sight and sound, strafe in fights, retreat at low health, and go to defuse
  a planted charge. Die and you spectate a living teammate until the round
  ends.

## HUD

Health / armor, ammunition, money, round timer, match score, alive pips for
both teams, bomb status, kill feed, damage direction indicator, hitmarker,
and a crosshair that spreads with movement and fire.

## Sound

All sound is synthesized with WebAudio (shots, hits, footsteps, plant,
explosion, round win/loss). There are no audio files and no network requests.

## Files

```
main.ts                  # builds /output: copies game/ + screenshots/, writes dossier.json
vendor/makefun-threejs.ts# make.fun dossier library (verbatim from the competition kit)
game/                    # the playable game (static files, ES modules)
  index.html             # import map: "three" -> ./vendor/three/three.module.min.js
  src/                   # one module per job: world, player, bots, weapons,
                         # game (match controller), hud, input, audio, effects,
                         # motion (shared collision), palette
  vendor/three/          # three.js 0.187.0 (three.module.min.js + three.core.min.js,
                         # byte-for-byte from the kit)
screenshots/             # 1-combat.jpg (cover), 2-menu.jpg, 3-buy.jpg, 4-plant.jpg
LICENSE                  # MIT
```

`main.ts` is the kit's program: run `mkdir -p out && MAKEFUN_OUTPUT_DIR=out
node main.ts` (Node 22+) to produce the submission bundle in `out/`.

## Screenshots

The four screenshots in `screenshots/` are real renders of this game's own
code (1280×720), captured with `?shot=menu|combat|buy|plant&seed=1`, a
deterministic staging mode that sets up one frozen frame per shot. See
`BUILD_NOTES.md` for how they were taken and what each one shows.
