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
├── soundtrack/
│   ├── engine.py
│   ├── render.py
│   ├── render_voice.sh
│   └── tracks/
│       ├── __init__.py
│       └── golden_signal.py
├── public/
│   └── assets/
│       ├── music/
│       │   ├── golden-signal.mp3
│       │   └── golden-signal.ogg
│       └── voice/
│           ├── golden-signal-line-1.mp3
│           ├── golden-signal-line-1.ogg
│           └── ...  (one pair per lyric line)
├── src/
│   ├── main.tsx
│   ├── persistence.ts
│   ├── core/
│   ├── world/
│   ├── game/
│   ├── net/
│   ├── render/
│   ├── audio/
│   │   ├── audio.ts
│   │   ├── audio-permission.ts
│   │   ├── encoding.ts
│   │   ├── intro-voice.ts
│   │   ├── tracks.ts
│   │   └── voice-lines.ts
│   ├── ui/
│   └── styles/
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
| `src/game/` | Gameplay orchestration (`game.ts`) plus its feature modules — `session.ts` (relay session), `enemies.ts`, `actions.ts`, `move.ts`, `run.ts`, `input.ts`, `world-grid.ts`, `viewport.ts`, `zoom.ts` (wheel/pinch camera zoom maths), `readouts.ts` — and the canvas handles (`dom.ts`). |
| `src/net/` | Relay client (partysocket, auto-reconnect), wire protocol codec, and multiplayer settings. |
| `src/render/` | Canvas drawing, terrain/fog chunk cache policy, and partner indicator. |
| `src/audio/` | Web Audio graph, sound effects, soundtrack playback, the intro voice-over, and autoplay permission. |
| `src/audio/tracks.ts` | Track registry for playback: the `TrackId` union, `TRACKS` (title plus mp3/ogg URLs), `DEFAULT_TRACK_ID`. |
| `src/audio/encoding.ts` | `prefersMp3()`/`pickSource()`: the one place that decides mp3 or ogg for an asset that ships as both. |
| `src/audio/voice-lines.ts` | Lyric voice-over registry plus the pure scheduling maths — `pickVoiceLine()` (random, never an immediate repeat) and `nextVoiceGapMs()`. |
| `src/audio/intro-voice.ts` | The splash-screen voice-over loop: one `<audio>` element, the gap timer, mute handling, and blocked-autoplay retries. |
| `soundtrack/engine.py` | Track-agnostic synth/render/encode engine (stdlib only): oscillators, envelope, note names, event bucketing, 44.1 kHz stereo WAV mixdown, `tanh` saturation, loop-edge fades, and the ffmpeg mp3/ogg encode. |
| `soundtrack/tracks/golden_signal.py` | "Golden Signal", the built-in Soviet/industrial mining march: patterns, voices, tempo, seed. Also the template for new tracks. |
| `soundtrack/tracks/__init__.py` | Generator-side registry: the `TRACKS` dict keyed by slug and `get_track()`. |
| `soundtrack/render.py` | CLI that renders registered tracks into `public/assets/music/`. |
| `soundtrack/render_voice.sh` | espeak-ng + ffmpeg pipeline that renders the robot lyric voice-overs into `public/assets/voice/`. |
| `public/assets/music/` | The shipped soundtrack assets (`golden-signal.mp3`, `golden-signal.ogg`) — build products of `soundtrack/render.py`, copied verbatim into `dist/` by Vite. |
| `public/assets/voice/` | The shipped lyric voice-overs (`golden-signal-line-1..4.{mp3,ogg}`) — build products of `soundtrack/render_voice.sh`, copied verbatim into `dist/` by Vite. |
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
only (menus, buttons, modals, starting the run, restarting, audio unlock) plus
zooming the camera with the wheel or a trackpad.

| Action | Keyboard | UI (click/tap) |
|---|---|---|
| Leave the intro | `Enter` or `Space` | Click/tap intro screen |
| Pick solo or co-op | — | Lobby: Play solo / Connect |
| Move / fly / dig | `WASD` or arrow keys | — |
| Sprint through open space | Hold `Shift` + direction | — |
| Zoom the camera (0.5x–2x) | — | Wheel scroll or trackpad pinch over the mine |
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

The music is a pair of ordinary audio files shipped in the repo —
`public/assets/music/golden-signal.mp3` (~3.5 MB) and `.ogg` (~2.0 MB) — served
as static assets, so the browser only downloads and loops them. They are build
products: the source of truth is the `soundtrack/` Python package, which
synthesizes the audio from scratch (stdlib only) and encodes it with ffmpeg.

The built-in track is **Golden Signal** (slug `golden-signal`): an A-minor
Soviet/industrial mining march at 125 BPM — bassline, lead, chord stabs, kick,
snare and hats, all seeded from `1917`, rendered 175 s long by default.

### Generator

| Module | Role |
|---|---|
| `soundtrack/engine.py` | Track-agnostic engine: oscillators (`sine`/`saw`/`tri`/`square`), the attack/sustain/release envelope, note-name helper, event bucketing, stereo panning, `tanh` bus saturation, and the per-sample mixdown into a 44.1 kHz 16-bit stereo WAV. `encode_with_ffmpeg()` then writes mp3 (160 kbps, libmp3lame) and ogg (128 kbps, libvorbis) beside it. |
| `soundtrack/tracks/golden_signal.py` | The music itself — patterns, note choices and per-voice timbres — exported as an `engine.Track`. Copy this file to start a new track. |
| `soundtrack/tracks/__init__.py` | The `TRACKS` registry keyed by slug, plus `get_track()`. |
| `soundtrack/render.py` | The CLI: track selection, duration/output overrides, and the render loop. |

Rendering is deterministic: the same track and duration always produce a
byte-identical WAV (the shared `random.Random` stream is seeded from the track).
The mp3/ogg bytes additionally depend on the ffmpeg build doing the encode.

The engine fades the first and last 1.25 s of every render, so the loop point is
quiet rather than seamless.

### Re-rendering

```bash
python3 soundtrack/render.py --list                 # registered tracks
python3 soundtrack/render.py golden-signal          # overwrite the shipped assets
python3 soundtrack/render.py --all                  # every registered track
```

Output goes to `public/assets/music/` unless `--out-dir DIR` says otherwise, and
`--duration N` overrides the track's default length. ffmpeg must be on `PATH`
for the mp3/ogg encode — without it the script writes the WAV and stops. The
intermediate WAV is deleted once both encodes exist; pass `--keep-wav` to keep
it.

The mixdown is a pure-Python per-sample loop, so the default 175 s render costs
roughly a minute of CPU; use `--duration` with a throwaway `--out-dir` when you
only want to check an arrangement.

### Adding a new track

1. Copy `soundtrack/tracks/golden_signal.py` to
   `soundtrack/tracks/<slug_with_underscores>.py` and edit its metadata
   (`NAME`, `SLUG`, `BPM`, `SEED`, `DEFAULT_DURATION`), `build_events()` and
   `render_sample()`.
2. Register it in `soundtrack/tracks/__init__.py` by adding
   `<module>.SLUG: <module>.TRACK` to `TRACKS`.
3. Render it: `python3 soundtrack/render.py <slug>` — this writes
   `public/assets/music/<slug>.mp3` and `.ogg`, which are committed.
4. Add the id to the `TrackId` union and an entry to `TRACKS` in
   `src/audio/tracks.ts` (title plus the two asset URLs). `TRACKS` is a
   `Record<TrackId, MusicTrack>`, so it will not compile until every id has an
   entry.

### Playback

`src/audio/audio.ts` plays the soundtrack through a plain `HTMLAudioElement`,
outside the Web Audio graph the sound effects use. On the first `init()` it
picks the encoding once via `canPlayType('audio/mpeg')` — mp3 where supported,
ogg otherwise — then sets `loop` and `volume = 0.36`.

Nothing plays until a trusted user gesture — either HUD audio button, or a
trusted `pointerdown`/`touchstart` (see `src/audio/audio-permission.ts`). If the
browser still rejects `play()`,
`startSynthMusic()` takes over with a small Web Audio chiptune loop routed
through the music gain (0.065) under the 0.55 master, so the run is not left
silent. Muting the music pauses the element and clears the fallback timer.

`setTrack(trackId)` swaps the element's `src` to another registered track and
restarts playback from that track's beginning if music was already running.

## Intro voice-over

While the splash screen is up, a robot voice reads the song's lyrics — one
short clip per line, chosen at random with a few seconds of silence between
them:

```
Golden signal, shining bright
Lift us through the neon night
Golden signal, hold the line
We are sparks in silver time
```

### Rendering the clips

`soundtrack/render_voice.sh` writes `public/assets/voice/golden-signal-line-N.mp3`
and `.ogg` (N = 1..4). It is a shell pipeline rather than part of the Python
generator because the synthesis is espeak-ng's, not ours:

1. **espeak-ng** (`-v en-us+klatt3 -s 132 -p 25 -a 190 -g 6`) — the `klatt`
   variants are formant synthesis, so the timbre is machine-like before any
   effect is applied. Low pitch, slightly slow, small inter-word gap.
2. **ffmpeg** — `afftfilt` forces every FFT bin's phase to zero while keeping its
   magnitude, which is the classic robot/vocoder buzz and leaves the words
   intact; a short two-tap `aecho` adds a metallic slapback; a 170 Hz–6.8 kHz
   band gives it the PA-speaker feel; `loudnorm` lands each line at −26 LUFS so
   it never shouts over the −27 LUFS soundtrack.
3. Encoded to mp3 (128 kbps) and ogg (96 kbps) mono — the format pair and the
   naming match `public/assets/music/`.

```bash
soundtrack/render_voice.sh                        # overwrite the shipped clips
soundtrack/render_voice.sh --out-dir /tmp/x --keep-wav
ESPEAK="espeak-ng" soundtrack/render_voice.sh     # use a locally installed binary
```

The default invocation runs espeak-ng through `nix run nixpkgs#espeak-ng`, so
nothing has to be installed; `ESPEAK` and `FFMPEG` override the two binaries.
The clips are ~3.5–4.0 s each and are committed like the soundtrack is.

### Playback

`src/audio/intro-voice.ts` owns one `<audio>` element at `volume = 0.3` (under
the soundtrack's 0.36) and loops: wait, pick a line, speak it, wait again.
`src/audio/voice-lines.ts` holds the registry and the two pure decisions —
`pickVoiceLine()` never returns the line that just played, and
`nextVoiceGapMs()` picks a 2.6–6.2 s gap — which is where the co-located tests
aim.

The loop is scoped to the overlay: `Intro.tsx` calls `startIntroVoice()` on
mount and `stopIntroVoice()` on unmount (`src/ui/commands.ts`), and
`dismissIntro()` stops it before the gesture starts the soundtrack, so a line
can never talk over the first bar or leak into the lobby. Because the splash is
rendered before `game/game.ts` is even imported, `initGame()` also starts the
loop if the phase is still `intro`; `start()` on a running loop does nothing.

The lyrics are part of the song, so they follow the **music** toggle, not the
sound-effects one. They deliberately do not go through the `AudioContext`: that
graph needs a trusted gesture to resume and the only gesture on the splash is
the one that dismisses it, whereas a media element can be allowed to play on its
own. If `play()` is rejected the scheduler simply asks again every 2 s, so the
voice starts the moment the browser (or the player un-muting) allows it, and a
blocked attempt does not use up a turn in the no-repeat rotation.

## Audio/browser notes

- Browsers usually require a user gesture before audio can start.
- The HUD exposes two toggles for explicit activation: `musicBtn` for the
  soundtrack and `sfxBtn` for the sound effects. Each one mutes only its own
  side, and both preferences are stored under `moleload:audio-settings:v1`
  (`src/audio/audio-settings.ts`).
- `audio.enabled` means the shared `AudioContext` is unlocked; `musicEnabled` and
  `sfxEnabled` are the player's two switches. Pressing either button while the
  context is still locked retries the unlock, so a blocked autoplay recovers.
- Pointer/touch input can also trigger audio startup; a key press cannot.
- Sound effects and the soundtrack are independent: the effects run on Web Audio,
  the music on an `<audio>` element, and a rejected autoplay only downgrades the
  music to the synth fallback.
- The intro voice-over is a third `<audio>` element that follows the music
  toggle. It starts before any gesture has been spent, so it is expected to be
  refused on a first visit and to be heard on later ones; it retries rather than
  giving up, and stops with the splash either way.

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

When touching the audio TypeScript (`src/audio/`):

```bash
npx vitest run src/audio
npx tsc --noEmit
npx oxlint
```

When touching the soundtrack generator (`soundtrack/`), byte-compile it and do a
short smoke render into a throwaway directory — never overwrite the shipped
assets with a truncated render:

```bash
python3 -m py_compile soundtrack/*.py soundtrack/tracks/*.py
python3 soundtrack/render.py golden-signal --duration 3 --out-dir /tmp/soundtrack-smoke
```

For browser smoke testing, build and preview the Vite app:

```bash
npm run build
npm run preview
# open the local URL printed by Vite
```

In the browser, press the music button and confirm the soundtrack starts, then check the
network panel: it should fetch `/assets/music/golden-signal.mp3` (or
`.ogg` on browsers without mp3 support) and loop it. Chiptune instead of the
march means autoplay was rejected and the synth fallback took over.

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
