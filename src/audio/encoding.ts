// Which of the two shipped encodings a browser should be handed.
//
// Every audio asset in the build exists as both MP3 and OGG, because no single
// format is safe everywhere: Safari has never shipped Vorbis, and some Linux
// builds of Firefox ship without the MP3 decoder. The choice is made once per
// element, from the browser's own answer, rather than sniffed from the UA.

export function prefersMp3(element: Pick<HTMLAudioElement, 'canPlayType'>): boolean {
  return Boolean(element.canPlayType && element.canPlayType('audio/mpeg'));
}

/** Pick the playable source of an asset that ships in both encodings. */
export function pickSource(asset: {mp3: string; ogg: string}, preferMp3: boolean): string {
  return preferMp3 ? asset.mp3 : asset.ogg;
}
