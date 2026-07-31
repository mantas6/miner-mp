# Moleload

**Status:** public repo. The `main` build is deployed to GitHub Pages at
<https://mantas6.github.io/miner-mp/>; run it locally with Vite (`npm run dev`)
or build with `npm run build`.

A small browser-based Motherload-style mining game. Mine ore, return to the surface depot, sell cargo, upgrade the ship, and survive deeper hazards/enemies until you reach the Motherlode core.

The client is React + TypeScript around a canvas: React paints the chrome from a
zustand store, the canvas renders the mine, and the simulation runs in fixed
60 Hz steps so tick-based tuning behaves the same on any refresh rate. Booting
walks a UI phase machine — intro splash → lobby (solo or co-op) → playing.
Co-op adds a Node WebSocket relay in `server/` that owns the shared mine.

Underground fog of war is persistent. Movement initially reveals a 3x3 square; each Sensor Array level adds one tile to both dimensions, up to 8x8. For even sizes the ship is the top-left cell of the central 2x2, so 4x4 covers offsets `-1..2` horizontally and vertically. Surface rows are always visible. Co-op miners union and persist their explored tiles because terrain and enemies already use a shared-world model, while each miner's sensor level remains individual.

## Project structure

Unit tests live next to the code they cover as `*.test.ts` (or `*.test.tsx` for components) siblings.

```text
miner-mp/
├── README.md
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── .oxlintrc.json
├── init.sh
├── start.sh
├── test.sh
├── shared/
│   ├── constants.ts
│   ├── exploration-codec.ts
│   ├── protocol.ts
│   ├── protocol-fixtures.ts
│   ├── tile-key.ts
│   └── world-schema.ts
├── src/
│   ├── main.tsx
│   ├── persistence.ts
│   ├── core/
│   ├── world/
│   ├── game/
│   ├── net/
│   ├── render/
│   ├── audio/
│   ├── ui/
│   └── styles/
├── soundtrack_source.py
├── public/
│   └── assets/
│       ├── soviet-soundtrack.mp3
│       └── soviet-soundtrack.ogg
├── server/
│   ├── index.js
│   ├── world-state.js
│   └── test/
└── .github/
    └── workflows/
        ├── build.yml
        └── deploy-pages.yml
```

| Path | Purpose |
|---|---|
| `index.html` | Main game page and root mount node; loaded by Vite. |
| `shared/constants.ts` | World constants, camera scale (36px tiles), protocol limits, ore and artifact tables. Consumed by both the client and the relay server. |
| `shared/exploration-codec.ts` | Fog-of-war index math and the run-length encoding shared with persistence and the relay. |
| `shared/protocol.ts` | Zod schemas and derived types for every co-op message and the relay envelope. |
| `shared/protocol-fixtures.ts` | Shared message fixtures, so the client and relay protocol tests assert against the same payloads. |
| `shared/world-schema.ts` | Zod schemas and derived types for tiles, enemies, and the persisted world state. |
| `shared/tile-key.ts` | Canonical `"x,y"` coordinate key used by tile maps on both sides. |
| `src/main.tsx` | Vite entry point: imports global styles, renders the React app, then starts the game runtime. |
| `src/persistence.ts` | Local save/load of player progress and explored tiles (`localStorage`). |
| `src/core/` | Pure gameplay rules and types: balance, economy, upgrades, shop catalog, movement, weapon, dynamite, teleporter, enemies, objectives, extraction, scanner, fuel reserve, depth milestones, stats, danger, fixed-step clock, developer tools. |
| `src/world/` | World generation, shared world-state reset, and visible tile range. |
| `src/game/` | Gameplay orchestration (`game.ts`) plus its feature modules — `session.ts` (relay session), `enemies.ts`, `actions.ts`, `move.ts`, `run.ts`, `input.ts`, `world-grid.ts`, `viewport.ts`, `readouts.ts` — and the canvas handles (`dom.ts`). |
| `src/net/` | Relay client (partysocket, auto-reconnect), wire protocol codec, and multiplayer settings. |
| `src/render/` | Canvas drawing, terrain/fog chunk cache policy, and partner indicator. |
| `src/audio/` | Sound effects, music playback, synth fallback, and autoplay permission. |
| `src/ui/` | React components, the zustand UI store (`store.ts`), the command table the buttons dispatch into (`commands.ts`), and co-located CSS modules. |
| `src/styles/base.css` | Design tokens plus element-level styling (`button`, `ul`, `kbd`, `meter`, `canvas`, `#shell`, `#game-panel`). |
| `src/styles/icons.css` | Global equipment sprite sheet (`icon-*`), addressed by name from the shop catalog. |
| `src/styles/intro-art.css` | Global intro badge art. |
| `vite.config.ts` | Vite build config (relative `base`) and Vitest test config. |
| `.oxlintrc.json` | Lint rules for `src/`, `shared/` and `server/` (oxlint), with the reason behind every disabled rule. |
| `init.sh` | Installs dependencies and starts a background Vite dev server for smoke testing. |
| `start.sh` | Builds, then runs the relay and the preview server together for local co-op. |
| `test.sh` | Full check sequence: lint, client tests, typecheck, production build, relay tests. |
| `server/index.js` | Co-op multiplayer relay server (Node + `ws`). |
| `server/world-state.js` | Authoritative shared-mine state and its on-disk persistence. |
| `server/test/` | Relay tests (`node --test`): protocol parity with the client, relay behaviour, world-state persistence. |
| `.github/workflows/build.yml` | CI: lint and production build on pushes to `main` and pull requests. |
| `.github/workflows/deploy-pages.yml` | Scheduled/manual GitHub Pages deployment of `dist/`. |
| `soundtrack_source.py` | Editable source generator for the soundtrack. |
| `public/assets/soviet-soundtrack.mp3` | Browser music asset used when MP3 is supported. |
| `public/assets/soviet-soundtrack.ogg` | Browser music fallback asset. |

## Run locally

Install dependencies once:

```bash
npm install
```

Start the Vite development server (it binds `0.0.0.0`, so other devices on the
network can reach it too):

```bash
npm run dev
```

Then open the local URL printed by Vite, usually:

```text
http://localhost:5173/
```

`./init.sh` does the same thing unattended: it installs dependencies and starts
the dev server in the background, logging to `.vite-dev.log` and recording the
pid in `.vite-dev.pid`. Set `START_DEV_SERVER=0` to install only.

## Build

Create a production build in `dist/`:

```bash
npm run build
```

Preview the built site locally:

```bash
npm run preview
```

## Multiplayer (co-op)

Co-op play uses an authoritative WebSocket world server in `server/`. It is a
Node process built on the [`ws`](https://github.com/websockets/ws) library. It
imports the shared zod schemas in `shared/` directly, so it needs a Node release
with TypeScript type stripping (Node 22.18+ or newer).

For a one-command local session, `./start.sh` installs anything missing, builds
the client against the local relay URL, then runs the relay and `vite preview`
side by side until Ctrl-C (honouring `PORT`, default `8081`).

To run the pieces yourself, install the relay's dependencies once:

```bash
npm --prefix server install
```

Start the relay server:

```bash
node server/index.js
```

The server listens on the port given by the `PORT` environment variable and
defaults to `8081`:

```bash
PORT=9000 node server/index.js
```

A room holds exactly two miners — the first connection becomes the host, the
second the guest, and a third is told `room-full` and closed. The host simulates
the enemies; the guest replicates them.

The server persists the shared mine to `server/data/world-state.json` by
default. Set `WORLD_STATE_PATH` to a writable file on a durable mounted volume
for relay/container deployments whose application filesystem is ephemeral:

```bash
WORLD_STATE_PATH=/var/lib/moleload/world-state.json PORT=9000 node server/index.js
```

The ignored runtime file is versioned JSON (`version: 1`) containing the world
revision, generated non-air tile values, explicit air/dug overrides, active
world enemies, and shared exploration ranges. Input is schema-, coordinate-,
count-, and size-validated against `shared/world-schema.ts` — the same
definitions the client validates against, so neither side can accept a message
the other silently drops. Updates are written atomically with
[`write-file-atomic`](https://github.com/npm/write-file-atomic), and a failed
write is logged rather than crashing the relay. Clients receive this
authoritative snapshot before their pairing event, and every mutation carries a
world revision so traffic from before a reset cannot repopulate the new mine.

The relay pings each connection every 30 seconds and drops peers that miss two
pings, so a dead transport frees its room slot; it also rate limits each
connection to 200 messages per second. Clients reconnect automatically with
backoff (0.5 s, growing 1.5x per attempt, capped at 10 s) and re-hydrate through
the normal snapshot-then-pair handshake.

Player and shared-world reset controls are development-only tools. They are
omitted from normal local play and production builds. To expose the visibly
marked local developer tab while running Vite in development mode, opt in with:

```bash
VITE_ENABLE_DEVELOPER_TOOLS=true npm run dev
```

The shared-world reset regenerates terrain, enemies, caches, and fog while
preserving each player's cash, upgrades, inventory/cargo, stats, ship condition,
and settings. The flag is ignored by production builds.

The client connects to the relay via the `VITE_MP_SERVER_URL` environment
variable, which defaults to `ws://localhost:8081`. The lobby pre-fills that URL
and remembers whatever you last connected to, so it can also be changed without
rebuilding. Set it when running the dev server or building to change the
default:

```bash
VITE_MP_SERVER_URL=ws://localhost:9000 npm run dev
```

## Controls

Ship movement and aiming are keyboard-only. Pointer/touch input is used for UI
only (menus, buttons, modals, starting the run, restarting, audio unlock).

| Action | Keyboard | UI (click/tap) |
|---|---|---|
| Leave the intro | `Enter` or `Space` | Click/tap intro screen |
| Pick solo or co-op | — | Lobby: Play solo / Connect |
| Move / fly / dig | `WASD` or arrow keys | — |
| Sprint through open space | Hold `Shift` + direction | — |
| Sell cargo at the depot | `Enter` | Sell button |
| Depot service | `Space` (sells cargo first, then refuels, then repairs) | Shop & Equipment -> Refuel / Repair |
| Detonate dynamite | `E` | Detonate button |
| Teleporter round trip (100 m+) | `T` | Teleport button |
| Fire gun | `G` then a direction key | Arm Gun button, then a direction key |
| Cancel gun aim | `G` or `Escape` | Arm Gun button again |
| Cargo, stats and guides | — | Info / Cargo button |
| Close a dialog | `Escape` | × button or the backdrop |
| Redeploy mid-run | `R`, then `R` again within 3.5 s | — |
| Restart after game over | `R` | Click/tap outside the dialogs |
| Toggle sound | — | 🔊 button; a trusted pointer/touch gesture may auto-enable |
| Reset shared world (development opt-in only) | — | Info / Cargo -> Dev tools (local) -> Reset World State |

## Gameplay notes

- You start with limited cash, fuel, hull, cargo capacity, and drill power.
- Dig ore, return to the surface, and sell cargo for cash.
- Refuel and repair at the surface depot.
- The depot shop sells five upgrades — Cargo Bay, Fuel Tank, Hull, Drill, Sensor
  Array — plus dynamite, teleporters, the Linebreaker gun, and ammo. Upgrade
  prices rise with each level.
- Artifacts pay out immediately in cash and never take a cargo slot; dynamite
  and gunfire destroy valuables without any payout.
- Low fuel warnings appear below 25%; return to the surface quickly.
- The HUD reserve readout forecasts the climb home (safe/caution/urgent), the
  scanner reads the tile the drill is aimed at, and the depth readout counts
  down to the next landmark and toasts when you cross one.
- Drilling upward is blocked; use tunnels to fly back up.
- Side-drilling requires solid ground under the ship.
- Rock, magma pockets, depth, and enemies make deeper mining more dangerous:
  Tunnel Fiends first, then Skitterlings, Ironbacks, and Abyss Stalkers.
- Enemies wake when exposed nearby; drill them before they chew through the hull.
- The goal is the Motherlode core at 10,000 m: crack it, then return alive to the
  depot to bank the extraction. The mine continues below it.
- Progress (cash, upgrades, stats, explored tiles) is saved locally; death keeps
  all of it and costs you the cargo and your position.

## Soundtrack

The game currently plays:

```text
public/assets/soviet-soundtrack.mp3
public/assets/soviet-soundtrack.ogg
```

`src/audio/audio.ts` chooses MP3 when the browser supports it, otherwise it falls back to OGG:

```js
this.musicEl.src = canMp3 ? 'assets/soviet-soundtrack.mp3' : 'assets/soviet-soundtrack.ogg';
```

### Editable source

The soundtrack source is:

```text
soundtrack_source.py
```

It is a deterministic Python synthesizer for a looping Soviet/industrial mining theme. It renders WAV using the Python standard library, then uses `ffmpeg` when available to encode browser-friendly MP3 and OGG files.

Important editable constants near the top:

| Constant | Meaning |
|---|---|
| `SAMPLE_RATE` | Render sample rate, currently `44100`. |
| `BPM` | Track tempo, currently `125`. |
| `SEED` | Random seed for repeatable percussion/noise. |
| `BASS` | Bassline note pattern. |
| `LEAD` | Lead melody pattern. |
| `CHORDS` | Chord stab progression. |

### Smoke-test the soundtrack generator

Use a short render before replacing the real game assets:

```bash
python3 soundtrack_source.py --duration 8 --out-prefix public/assets/soviet-soundtrack-test --keep-wav
```

Expected outputs:

```text
public/assets/soviet-soundtrack-test.wav
public/assets/soviet-soundtrack-test.mp3
public/assets/soviet-soundtrack-test.ogg
```

Clean up the test files when done:

```bash
rm public/assets/soviet-soundtrack-test.wav \
   public/assets/soviet-soundtrack-test.mp3 \
   public/assets/soviet-soundtrack-test.ogg
```

### Re-render the in-game soundtrack assets

This overwrites the files the game uses:

```bash
python3 soundtrack_source.py --duration 175 --out-prefix public/assets/soviet-soundtrack
```

Outputs:

```text
public/assets/soviet-soundtrack.mp3
public/assets/soviet-soundtrack.ogg
```

`--keep-wav` can be added if you also want the intermediate WAV:

```bash
python3 soundtrack_source.py --duration 175 --out-prefix public/assets/soviet-soundtrack --keep-wav
```

## Audio/browser notes

- Browsers usually require a user gesture before music can play.
- The game exposes a sound toggle button for explicit activation.
- Pointer/touch input can also trigger audio startup.
- If the MP3/OGG assets are missing, `src/audio/audio.ts` falls back to procedural WebAudio notes.
- If you change the audio file names, update the `musicEl.src` line in `src/audio/audio.ts`.

## Development checklist

After making changes, run the full check sequence — `./test.sh` does all of it
(lint, unit tests, typecheck, production build, then the relay's own tests):

```bash
./test.sh
```

The individual commands, if you want them one at a time:

```bash
npm run lint        # oxlint over src/, shared/, server/ and vite.config.ts
npm run lint:fix    # same, applying the safe autofixes
npm test            # Vitest, co-located *.test.ts / *.test.tsx
npm run test:watch  # the same suite in watch mode
npm run typecheck   # tsc --noEmit
npm run build       # production build into dist/
npm --prefix server test        # relay tests (node --test)
npm --prefix server run typecheck   # node --check over the relay sources
```

Lint rules live in `.oxlintrc.json`: `correctness`, `suspicious` and `perf` are
errors, plus the React hooks rules for components and JSX a11y checks. Every
disabled rule carries a comment explaining the pattern it conflicts with; single
intentional exceptions are suppressed at the call site with
`// oxlint-disable-next-line <rule>` and a reason instead.

When touching the soundtrack generator:

```bash
python3 -m py_compile soundtrack_source.py
python3 soundtrack_source.py --duration 3 --out-prefix public/assets/soviet-soundtrack-smoke --keep-wav
rm public/assets/soviet-soundtrack-smoke.wav \
   public/assets/soviet-soundtrack-smoke.mp3 \
   public/assets/soviet-soundtrack-smoke.ogg
```

For browser smoke testing, build and preview the Vite app:

```bash
npm run build
npm run preview
# open the local URL printed by Vite
```

If URLs or asset names are changed, also check that these load successfully from the preview server:

```text
/
/assets/soviet-soundtrack.mp3
/assets/soviet-soundtrack.ogg
```

## Deployment

Two GitHub Actions workflows cover the client; the relay is not deployed by
either of them.

- `.github/workflows/build.yml` runs `npm ci`, `npm run lint` and `npm run build`
  on pushes to `main`, on pull requests, and on demand.
- `.github/workflows/deploy-pages.yml` builds and publishes `dist/` to GitHub
  Pages every Monday at 06:00 UTC, or when triggered manually.

`vite.config.ts` sets a relative `base`, so the same build works at a domain
root and under the `/miner-mp/` Pages project subpath. The deployed site is
solo play unless the lobby is pointed at a relay it can reach.
