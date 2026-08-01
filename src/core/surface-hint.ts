// The depot keyboard prompt: what one press of Space would do while parked on
// the surface.
//
// The key runs `surfaceService()` in `src/game/actions.ts`, which does exactly
// one job per press in a fixed order — sell, else refuel, else repair — so the
// hint names every job still waiting, in that same order. Keeping the wording
// derived from state (rather than a fixed "sell and refuel" label) means the
// prompt never offers something the next press would refuse.
//
// Nothing pending means no prompt at all: a topped-up ship at the depot gets a
// quiet HUD.

export interface SurfaceHintInput {
  atSurface: boolean;
  gameOver: boolean;
  /** What the cargo bay would fetch right now. */
  cargoValue: number;
  cash: number;
  fuel: number;
  fuelMax: number;
  hull: number;
  hullMax: number;
}

/**
 * Indexed by the pending-service bitmask below, so a hint costs a lookup rather
 * than a joined string: this is evaluated once per animation frame.
 */
const HINT_BY_PENDING: readonly (string | null)[] = [
  null,
  'Space: repair',
  'Space: refuel',
  'Space: refuel & repair',
  'Space: sell',
  'Space: sell & repair',
  'Space: sell & refuel',
  'Space: sell, refuel & repair'
];

const SELL = 0b100;
const REFUEL = 0b010;
const REPAIR = 0b001;

/** The depot prompt for this ship, or `null` when there is nothing to prompt for. */
export function formatSurfaceActionHint({
  atSurface,
  gameOver,
  cargoValue,
  cash,
  fuel,
  fuelMax,
  hull,
  hullMax
}: SurfaceHintInput): string | null {
  if (!atSurface || gameOver) return null;

  const canSell = cargoValue > 0;
  // Fuel and repairs are bought, so an empty wallet with nothing to sell makes
  // them unavailable — pressing Space would only say "no cash".
  const canPay = cash > 0 || canSell;

  const pending = (canSell ? SELL : 0)
    | (canPay && fuel < fuelMax ? REFUEL : 0)
    | (canPay && hull < hullMax ? REPAIR : 0);

  return HINT_BY_PENDING[pending];
}
