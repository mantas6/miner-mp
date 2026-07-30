import { describe, expect, it, vi } from 'vitest';
import { FIXED_STEP_MS, MAX_STEPS_PER_FRAME, createFixedStepper } from './fixed-step';

function run(stepper: {advance(now: number): number}, timestamps: number[]): number {
  return timestamps.reduce((total, now) => total + stepper.advance(now), 0);
}

describe('fixed-step accumulator', () => {
  it('anchors the clock on the first frame without stepping', () => {
    const step = vi.fn();
    const stepper = createFixedStepper(step);

    expect(stepper.advance(1000)).toBe(0);
    expect(step).not.toHaveBeenCalled();
  });

  it('drains whole steps and carries the remainder into the next frame', () => {
    const step = vi.fn();
    const stepper = createFixedStepper(step);

    stepper.advance(0);
    // 32 ms is not quite two 16.667 ms steps, so one runs now and the leftover
    // pushes the next frame over the line for two.
    expect(stepper.advance(32)).toBe(1);
    expect(stepper.pending).toBeCloseTo(32 - FIXED_STEP_MS, 6);
    expect(stepper.advance(64)).toBe(2);
    expect(step).toHaveBeenCalledTimes(3);
  });

  it('runs exactly two steps per 32 ms frame at an explicit 16 ms step', () => {
    const step = vi.fn();
    const stepper = createFixedStepper(step, {stepMs: 16});

    stepper.advance(0);
    expect(stepper.advance(32)).toBe(2);
    expect(stepper.pending).toBe(0);
  });

  it('advances the same number of steps per second on 60 Hz and 120 Hz frames', () => {
    const sixty = vi.fn();
    const oneTwenty = vi.fn();
    const sixtyStepper = createFixedStepper(sixty);
    const oneTwentyStepper = createFixedStepper(oneTwenty);

    run(sixtyStepper, Array.from({length: 61}, (_, frame) => frame * (1000 / 60)));
    run(oneTwentyStepper, Array.from({length: 121}, (_, frame) => frame * (1000 / 120)));

    expect(sixty).toHaveBeenCalledTimes(60);
    expect(oneTwenty).toHaveBeenCalledTimes(60);
  });

  it('clamps a long stall to the per-frame step budget instead of replaying it', () => {
    const step = vi.fn();
    const stepper = createFixedStepper(step);

    stepper.advance(0);
    expect(stepper.advance(5_000)).toBe(MAX_STEPS_PER_FRAME);
    expect(stepper.pending).toBeCloseTo(0, 6);
    // The dropped time must not resurface on later frames.
    expect(stepper.advance(5_016)).toBe(0);
  });

  it('honours a custom step budget', () => {
    const step = vi.fn();
    const stepper = createFixedStepper(step, {stepMs: 10, maxSteps: 2});

    stepper.advance(0);
    expect(stepper.advance(1_000)).toBe(2);
  });

  it('ignores backwards clocks and non-finite timestamps', () => {
    const step = vi.fn();
    const stepper = createFixedStepper(step);

    stepper.advance(1_000);
    expect(stepper.advance(900)).toBe(0);
    expect(stepper.advance(Number.NaN)).toBe(0);
    expect(step).not.toHaveBeenCalled();
    // The rewind re-anchored at 900, so 900 -> 920 is a normal 20 ms frame.
    expect(stepper.advance(920)).toBe(1);
  });

  it('drops pending time on reset', () => {
    const step = vi.fn();
    const stepper = createFixedStepper(step);

    stepper.advance(0);
    stepper.advance(10);
    expect(stepper.pending).toBe(10);

    stepper.reset();
    expect(stepper.pending).toBe(0);
    // Re-anchors, so the frame right after a reset never steps.
    expect(stepper.advance(10_000)).toBe(0);
    expect(stepper.advance(10_000 + FIXED_STEP_MS)).toBe(1);
  });
});
