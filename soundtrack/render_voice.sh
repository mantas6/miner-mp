#!/usr/bin/env bash
#
# Render the "Golden Signal" lyric voice-overs used by the intro screen.
#
# One file per lyric line, in a robot voice, encoded to MP3 + OGG exactly like
# the music assets. The committed files under `public/assets/voice/` are build
# products of this script; re-run it after editing a line.
#
# The chain is:
#   espeak-ng   formant synthesis with the `klatt3` variant (a hard, machine-like
#               timbre to begin with), pitched low and read slightly slow.
#   ffmpeg      phase flattening (`afftfilt` with every bin's phase forced to
#               zero) for the classic vocoder/robot buzz, a short metallic
#               slapback echo, a band-pass for the PA-speaker feel, and
#               `loudnorm` so no line is louder than the soundtrack.
#
# Usage:
#   soundtrack/render_voice.sh                # render into public/assets/voice
#   soundtrack/render_voice.sh --out-dir /tmp/x --keep-wav
#
# espeak-ng does not have to be installed: on NixOS the default invocation
# below fetches it on demand. Override it if you have your own binary:
#   ESPEAK="espeak-ng" soundtrack/render_voice.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$REPO_ROOT/public/assets/voice"
KEEP_WAV=0

# `nix run` needs the `--` separator before the program's own arguments.
ESPEAK="${ESPEAK:-nix run nixpkgs#espeak-ng --}"
FFMPEG="${FFMPEG:-ffmpeg}"

# Slug and text of every line, in song order. The slugs become the file names
# and must stay in sync with `VOICE_LINES` in `src/audio/voice-lines.ts`.
LINES=(
  "golden-signal-line-1|Golden signal, shining bright"
  "golden-signal-line-2|Lift us through the neon night"
  "golden-signal-line-3|Golden signal, hold the line"
  "golden-signal-line-4|We are sparks in silver time"
)

# Low pitch (-p 25), slightly slow (-s 132) and a small inter-word gap (-g 6):
# deliberate enough to stay intelligible once the robot effect is on top.
ESPEAK_ARGS=(-v en-us+klatt3 -s 132 -p 25 -a 190 -g 6)

# `afftfilt` keeps each bin's magnitude and throws its phase away, which is what
# makes the voice sound synthetic without smearing the words. `adelay`/`apad`
# give the encoders a little silence to breathe in, and `loudnorm` lands every
# line at -26 LUFS -- just under the soundtrack's -27 LUFS at its higher
# playback volume, so the lyrics never shout over the music.
FILTERS="highpass=f=170"
FILTERS+=",afftfilt=real='hypot(re,im)*cos(0)':imag='hypot(re,im)*sin(0)':win_size=512:overlap=0.75"
FILTERS+=",aecho=0.85:0.75:26|43:0.28|0.16"
FILTERS+=",lowpass=f=6800"
FILTERS+=",adelay=120,apad=pad_dur=0.35"
FILTERS+=",afade=t=in:st=0:d=0.05"
FILTERS+=",loudnorm=I=-26:TP=-2:LRA=9"
FILTERS+=",aresample=44100"

while [ $# -gt 0 ]; do
  case "$1" in
    --out-dir) OUT_DIR="$2"; shift 2 ;;
    --keep-wav) KEEP_WAV=1; shift ;;
    -h|--help) sed -n '2,25p' "$0" | cut -c3-; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/golden-signal-voice.XXXXXX")"
trap 'rm -rf "$WORK_DIR"' EXIT

mkdir -p "$OUT_DIR"

for entry in "${LINES[@]}"; do
  slug="${entry%%|*}"
  text="${entry#*|}"
  raw="$WORK_DIR/$slug.raw.wav"
  wav="$OUT_DIR/$slug.wav"

  echo "Rendering \"$text\" -> $slug"
  # shellcheck disable=SC2086
  $ESPEAK "${ESPEAK_ARGS[@]}" -w "$raw" "$text"
  "$FFMPEG" -y -hide_banner -loglevel error -i "$raw" \
    -ac 1 -ar 44100 -af "$FILTERS" -c:a pcm_s16le "$wav"

  # Mono speech does not need the stereo soundtrack's bitrate, but the pair of
  # formats (and the naming) match `public/assets/music/`.
  "$FFMPEG" -y -hide_banner -loglevel error -i "$wav" \
    -codec:a libmp3lame -b:a 128k "$OUT_DIR/$slug.mp3"
  "$FFMPEG" -y -hide_banner -loglevel error -i "$wav" \
    -codec:a libvorbis -b:a 96k "$OUT_DIR/$slug.ogg"

  [ "$KEEP_WAV" -eq 1 ] || rm -f "$wav"

  duration="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT_DIR/$slug.mp3")"
  printf '  %s.{mp3,ogg}  %.2fs  %s / %s bytes\n' \
    "$slug" "$duration" \
    "$(stat -c%s "$OUT_DIR/$slug.mp3")" "$(stat -c%s "$OUT_DIR/$slug.ogg")"
done

echo "Done. Wrote $(( ${#LINES[@]} * 2 )) files to $OUT_DIR"
