# Moleload

**Play online:** https://alfred687b.github.io/miner/

A small browser-based Motherload-style mining game. Mine ore, return to the surface depot, sell cargo, upgrade the ship, and survive deeper hazards/enemies until you reach the Motherlode core.

## Project structure

```text
miner/
├── README.md
├── index.html
├── style.css
├── game.js
├── soundtrack_source.py
└── assets/
    ├── soviet-soundtrack.mp3
    └── soviet-soundtrack.ogg
```

| Path | Purpose |
|---|---|
| `index.html` | Main game page, canvas, HUD, intro/help overlay, shop buttons. |
| `style.css` | Visual styling, responsive/mobile HUD layout, intro art. |
| `game.js` | Game logic: world generation, mining, movement, enemies, shop, HUD, sound. |
| `soundtrack_source.py` | Editable source generator for the soundtrack. |
| `assets/soviet-soundtrack.mp3` | Browser music asset used when MP3 is supported. |
| `assets/soviet-soundtrack.ogg` | Browser music fallback asset. |

## Play online

GitHub Pages build:

```text
https://alfred687b.github.io/miner/
```

## Run locally

From the repository directory, start any static file server. For example, with Python:

```bash
python3 -m http.server 8080
```

Then open:

```text
http://127.0.0.1:8080/
```

If `8080` is busy, choose another port:

```bash
python3 -m http.server 8090
```

## Controls

| Action | Desktop | Touch/mobile |
|---|---|---|
| Start game | `Enter`, `Space`, or click/tap intro | Tap intro screen |
| Move / dig | `WASD` or arrow keys | Tap/hold around the ship |
| Sell cargo | `Enter` or Sell button | Sell button |
| Surface service | `Space` repairs first, then refuels | Repair / Refuel buttons |
| Restart after game over | `R` or tap/click | Tap anywhere |
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
assets/soviet-soundtrack.mp3
assets/soviet-soundtrack.ogg
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
python3 soundtrack_source.py --duration 8 --out-prefix assets/soviet-soundtrack-test --keep-wav
```

Expected outputs:

```text
assets/soviet-soundtrack-test.wav
assets/soviet-soundtrack-test.mp3
assets/soviet-soundtrack-test.ogg
```

Clean up the test files when done:

```bash
rm assets/soviet-soundtrack-test.wav \
   assets/soviet-soundtrack-test.mp3 \
   assets/soviet-soundtrack-test.ogg
```

### Re-render the in-game soundtrack assets

This overwrites the files the game uses:

```bash
python3 soundtrack_source.py --duration 175 --out-prefix assets/soviet-soundtrack
```

Outputs:

```text
assets/soviet-soundtrack.mp3
assets/soviet-soundtrack.ogg
```

`--keep-wav` can be added if you also want the intermediate WAV:

```bash
python3 soundtrack_source.py --duration 175 --out-prefix assets/soviet-soundtrack --keep-wav
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
python3 soundtrack_source.py --duration 3 --out-prefix assets/soviet-soundtrack-smoke --keep-wav
rm assets/soviet-soundtrack-smoke.wav \
   assets/soviet-soundtrack-smoke.mp3 \
   assets/soviet-soundtrack-smoke.ogg
```

For browser smoke testing, serve the folder and confirm the page loads:

```bash
python3 -m http.server 8080
# open http://127.0.0.1:8080/
```

If URLs or asset names are changed, also check that these load successfully:

```text
http://127.0.0.1:8080/
http://127.0.0.1:8080/game.js
http://127.0.0.1:8080/style.css
http://127.0.0.1:8080/assets/soviet-soundtrack.mp3
http://127.0.0.1:8080/assets/soviet-soundtrack.ogg
```
