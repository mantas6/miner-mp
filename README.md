# Moleload

**Status:** private repo; run locally with Vite (`npm run dev`) or build with `npm run build`.

A small browser-based Motherload-style mining game. Mine ore, return to the surface depot, sell cargo, upgrade the ship, and survive deeper hazards/enemies until you reach the Motherlode core.

Underground fog of war is persistent. Movement initially reveals a 3x3 square; each Sensor Array level adds one tile to both dimensions, up to 8x8. For even sizes the ship is the top-left cell of the central 2x2, so 4x4 covers offsets `-1..2` horizontally and vertically. Surface rows are always visible. Co-op miners union and persist their explored tiles because terrain and enemies already use a shared-world model, while each miner's sensor level remains individual.

## Project structure

```text
miner/
├── README.md
├── index.html
├── package.json
├── vite.config.js
├── src/
│   ├── main.js
│   ├── styles.css
│   ├── constants.js
│   ├── dom.js
│   ├── state.js
│   ├── audio.js
│   ├── renderer.js
│   └── game.js
├── soundtrack_source.py
├── public/
│   └── assets/
│       ├── soviet-soundtrack.mp3
│       └── soviet-soundtrack.ogg
└── server/
    └── index.js
```

| Path | Purpose |
|---|---|
| `index.html` | Main game page, canvas, HUD, intro/help overlay, shop buttons; loaded by Vite. |
| `src/main.js` | Vite entry point that imports styles and starts the game. |
| `src/styles.css` | Visual styling, responsive/mobile HUD layout, intro art. |
| `src/constants.js` | Shared game constants and ore definitions. |
| `src/dom.js` | DOM/canvas element lookups and input key set. |
| `src/state.js` | Initial game state factory. |
| `src/audio.js` | Sound effects, music file playback, and synth fallback. |
| `src/renderer.js` | Canvas drawing code for terrain, enemies, ship, surface, and overlays. |
| `src/game.js` | Gameplay orchestration: world generation, mining, enemies, shop, input, HUD, and loop. |
| `vite.config.js` | Vite config. |
| `server/index.js` | Co-op multiplayer relay server (Node + `ws`). |
| `soundtrack_source.py` | Editable source generator for the soundtrack. |
| `public/assets/soviet-soundtrack.mp3` | Browser music asset used when MP3 is supported. |
| `public/assets/soviet-soundtrack.ogg` | Browser music fallback asset. |

## Run locally

Install dependencies once:

```bash
npm install
```

Start the Vite development server:

```bash
npm run dev
```

Then open the local URL printed by Vite, usually:

```text
http://127.0.0.1:5173/
```

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
Node process built on the [`ws`](https://github.com/websockets/ws) library.

Start the relay server:

```bash
node server/index.js
```

The server listens on the port given by the `PORT` environment variable and
defaults to `8081`:

```bash
PORT=9000 node server/index.js
```

The server persists the shared mine to `server/data/world-state.json` by
default. Set `WORLD_STATE_PATH` to a writable file on a durable mounted volume
for relay/container deployments whose application filesystem is ephemeral:

```bash
WORLD_STATE_PATH=/var/lib/moleload/world-state.json PORT=9000 node server/index.js
```

The ignored runtime file is versioned JSON (`version: 1`) containing the world
revision, generated non-air tile values, explicit air/dug overrides, active
world enemies, and shared exploration ranges. Input is schema-, coordinate-,
count-, and size-validated; updates are written through a same-directory
temporary file and atomic rename. Clients receive this authoritative snapshot
before their pairing event, and every mutation carries a world revision so
traffic from before a reset cannot repopulate the new mine.

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
variable, which defaults to `ws://localhost:8081` in development. Set it when
running the dev server or building to point at a different relay:

```bash
VITE_MP_SERVER_URL=ws://localhost:9000 npm run dev
```

## Controls

| Action | Desktop | Touch/mobile |
|---|---|---|
| Start game | `Enter`, `Space`, or click/tap intro | Tap intro screen |
| Move / dig | `WASD` or arrow keys | Tap/hold around the ship |
| Sell cargo | `Enter` or Sell button | Sell button |
| Surface service | `Space` repairs first, then refuels | Repair / Refuel buttons |
| Restart after game over | `R` or tap/click | Tap anywhere |
| Reset shared world (development opt-in only) | Info / Cargo -> Dev tools (local) -> Reset World State | Same |
| Toggle sound | Sound button | Sound button or first touch gesture may auto-enable |

## Gameplay notes

- You start with limited cash, fuel, hull, cargo capacity, and drill power.
- Dig ore, return to the surface, and sell cargo for cash.
- Refuel and repair at the surface depot.
- Buy cargo, fuel tank, and drill upgrades as prices rise.
- Low fuel warnings appear below 25%; return to the surface quickly.
- Drilling upward is blocked; use tunnels to fly back up.
- Side-drilling requires solid ground under the ship.
- Rock, magma, depth, and tunnel fiends make deeper mining more dangerous.
- Enemies wake when exposed nearby; drill them before they chew through the hull.

## Soundtrack

The game currently plays:

```text
public/assets/soviet-soundtrack.mp3
public/assets/soviet-soundtrack.ogg
```

`game.js` chooses MP3 when the browser supports it, otherwise it falls back to OGG:

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
- The game exposes a `Sound: off/on` button for explicit activation.
- Pointer/touch input can also trigger audio startup.
- If the MP3/OGG assets are missing, `game.js` falls back to procedural WebAudio notes.
- If you change the audio file names, update the `musicEl.src` line in `game.js`.

## Development checklist

After making changes:

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
