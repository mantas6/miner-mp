// Keyboard mining: the loop, the input layer and the HUD, end to end.
//
// The fuel numbers below are exact on purpose. They are the only way a test can
// tell "one keypress charged the ship once" apart from "one keypress charged it
// twice", which is what a second set of keyboard listeners on one runtime, or a
// fixed stepper that replays an impulse, would produce. The arithmetic is:
//
//   base move  0.25  + vertical 0.08              = 1 tile of travel
//   drilling   + 0.90 surcharge, then x1.5        = 1.845 fuel per drill hit
//
// and the HUD rounds up, so 100 → 98.155 reads `99/100` and 96.31 reads `97/100`.
// The surface shaft's first tile is dirt with 2 hp against a starting drill of 1,
// so it takes exactly two hits to clear and the ship then stands one tile down —
// 10 m. If balance moves, these constants move with it.

import { expect, test } from '@playwright/test';
import { collectPageFailures, drillDown, readDepth, readFuel, startSoloRun } from './support/game';

test.describe('gameplay', () => {
  test('one keypress is charged exactly once and clears exactly one tile', async ({page}) => {
    await startSoloRun(page);
    const depth = page.locator('#depth');
    const fuel = page.locator('#fuelLabel');
    await expect(depth).toHaveText('0 m');
    await expect(fuel).toHaveText('100/100');

    await drillDown(page);
    // First hit: the tile has 1 hp left, so the ship has not moved yet — but it
    // has paid for exactly one drill hit.
    await expect(fuel).toHaveText('99/100');
    await expect(depth).toHaveText('0 m');

    await drillDown(page);
    // Second hit clears the tile and the ship advances one tile: 10 m, not 20.
    await expect(fuel).toHaveText('97/100');
    await expect(depth).toHaveText('10 m');
  });

  test('mining downward increases depth and burns fuel', async ({page}) => {
    const failures = collectPageFailures(page);
    await startSoloRun(page);

    let fuel = await readFuel(page);
    // Ten hits are more than enough to get clear of the surface shaft, whatever
    // the generator put under it.
    for (let hit = 0; hit < 10; hit++) {
      await drillDown(page);
      const remaining = await readFuel(page);
      expect(remaining).toBeLessThan(fuel);
      fuel = remaining;
    }

    expect(await readDepth(page)).toBeGreaterThanOrEqual(20);
    expect(failures).toEqual([]);
  });

  test('leaving the surface swaps the depot actions for the underground ones', async ({page}) => {
    await startSoloRun(page);
    await expect(page.locator('#shopBtn')).toBeVisible();
    await expect(page.locator('#dynamiteBtn')).toBeHidden();
    // The live region is at the depot until the ship is actually below it.
    await expect(page.locator('#game-status')).toHaveText('At the surface depot.');

    await drillDown(page);
    await drillDown(page);
    await expect(page.locator('#depth')).toHaveText('10 m');

    await expect(page.locator('#shopBtn')).toBeHidden();
    await expect(page.locator('#sell')).toBeHidden();
    await expect(page.locator('#dynamiteBtn')).toBeVisible();
    await expect(page.locator('#game-status')).toHaveText('In the mine.');
    // The depth tracker counts down to the next landmark rather than up from zero.
    await expect(page.locator('#depthTarget')).toContainText('m to');
  });

  test('the canvas keeps the keyboard while mining', async ({page}) => {
    await startSoloRun(page);
    await drillDown(page);
    await expect(page.locator('#game')).toBeFocused();
  });
});
