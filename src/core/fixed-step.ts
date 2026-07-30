// Frame-rate independence for the simulation.
//
// The game loop is driven by requestAnimationFrame, which fires at the display's
// refresh rate (60, 90, 120, 144 Hz...). Advancing the simulation once per frame
// therefore made every tick-based cooldown, key-repeat window and per-step easing
// factor run twice as fast on a 120 Hz monitor. This stepper decouples the two:
// real elapsed time is accumulated and drained in whole 60 Hz steps, so one tick
// always means 1/60 s no matter how often the browser paints.

/** Logic step length. Every tick-based constant in the game is tuned against this. */
export const FIXED_STEP_MS = 1000 / 60;

/**
 * Longest burst a single frame may replay. A hidden tab, a blocked main thread or
 * a paused debugger can hand us seconds of elapsed time; replaying all of it would
 * make the frame even later and feed back into itself ("spiral of death"), so the
 * surplus is dropped instead.
 */
export const MAX_STEPS_PER_FRAME = 5;

export interface FixedStepper {
  /**
   * Runs zero or more fixed steps for the time elapsed since the previous call and
   * returns how many ran. The first call only anchors the clock.
   */
  advance(now: number): number;
  /** Drops unconsumed time and re-anchors the clock, e.g. when a tab becomes visible again. */
  reset(now?: number): void;
  /** Real time carried over to the next frame, in ms. */
  readonly pending: number;
}

export interface FixedStepperOptions {
  stepMs?: number;
  maxSteps?: number;
}

// A 1/60 s step is not representable in binary floating point, so summing frame
// timestamps drifts by fractions of a nanosecond. Without this tolerance the
// accumulator would occasionally land a hair under a full step and silently drop
// one logic tick per second.
const EPSILON_MS = 1e-6;

export function createFixedStepper(step: () => void, options: FixedStepperOptions = {}): FixedStepper {
  const stepMs = options.stepMs !== undefined && options.stepMs > 0 ? options.stepMs : FIXED_STEP_MS;
  const maxSteps = Math.max(1, Math.floor(options.maxSteps ?? MAX_STEPS_PER_FRAME));
  let previous: number | null = null;
  let accumulated = 0;

  return {
    advance(now: number): number {
      if (!Number.isFinite(now)) return 0;
      if (previous === null) {
        previous = now;
        return 0;
      }
      const elapsed = now - previous;
      previous = now;
      // A clock that moved backwards must never rewind or flood the simulation.
      if (elapsed > 0) accumulated += elapsed;

      let steps = 0;
      while (steps < maxSteps && accumulated + EPSILON_MS >= stepMs) {
        accumulated = Math.max(0, accumulated - stepMs);
        step();
        steps++;
      }
      // Whatever a long stall left over is discarded rather than replayed later.
      if (steps === maxSteps && accumulated + EPSILON_MS >= stepMs) accumulated = 0;
      return steps;
    },
    reset(now?: number): void {
      accumulated = 0;
      previous = typeof now === 'number' && Number.isFinite(now) ? now : null;
    },
    get pending(): number {
      return accumulated;
    }
  };
}
