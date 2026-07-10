export interface AutoAudioGestureState {
  wantsSound: boolean;
  enabled: boolean;
  eventType?: string;
  isTrusted?: boolean;
}

export function shouldAttemptAutoAudio({
  wantsSound,
  enabled,
  eventType,
  isTrusted
}: AutoAudioGestureState): boolean {
  return Boolean(
    wantsSound &&
    !enabled &&
    isTrusted &&
    (eventType === 'pointerdown' || eventType === 'touchstart')
  );
}
