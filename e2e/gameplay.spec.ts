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
    await expect(page.locator('#teleporterBtn')).toBeHidden();
    // The live region is at the depot until the ship is actually below it.
    await expect(page.locator('#game-status')).toHaveText('At the surface depot.');

    await drillDown(page);
    await drillDown(page);
    await expect(page.locator('#depth')).toHaveText('10 m');

    await expect(page.locator('#shopBtn')).toBeHidden();
    await expect(page.locator('#sell')).toBeHidden();
    await expect(page.locator('#teleporterBtn')).toBeVisible();
    await expect(page.locator('#game-status')).toHaveText('In the mine.');
    // The depth tracker counts down to the next landmark rather than up from zero.
    await expect(page.locator('#depthTarget')).toContainText('m to');
  });

  /**
   * The scanner's whole control surface is the slot that holds it, so this walks
   * the browser path the unit tests cannot: a restored save putting one in the
   * bay, a real purchase stacking onto it, and the armed state a press and an
   * Escape move it between.
   *
   * The wallet and the first device are seeded through the save file rather than
   * earned, because everything under test here happens at the depot and mining
   * $200 of ore first would test the drill instead.
   */
  test('a bought scanner is carried in the bay and arms from its own slot', async ({page}) => {
    await page.addInitScript(() => {
      localStorage.setItem('moleload-progress-v1', JSON.stringify({version: 6, cash: 5000, scanners: 1}));
    });
    await startSoloRun(page);

    const slot = page.locator('#scannerSlotBtn');
    await expect(slot).toHaveText('Scanner×1');
    await expect(slot).toHaveAttribute('aria-pressed', 'false');

    await page.locator('#shopBtn').click();
    await page.locator('#shopScannerBtn').click();
    await expect(page.locator('[data-shop-item="scanner"] [data-shop-current]')).toHaveText('Carried: 2');
    await page.keyboard.press('Escape');
    await expect(page.locator('#shop-screen')).toBeHidden();

    await expect(slot).toHaveText('Scanner×2');
    await slot.click();
    await expect(slot).toHaveAttribute('aria-pressed', 'true');

    // A press on the mine is answered by the tile it actually landed on: halfway
    // down the canvas is deep, unsurveyed rock, and a refusal costs nothing.
    const canvas = page.locator('#game');
    const box = (await canvas.boundingBox())!;
    await canvas.click({position: {x: box.width * 0.55, y: box.height * 0.5}});
    await expect(page.locator('#toast')).toContainText('already explored');
    await expect(slot).toHaveText('Scanner×2');
    await expect(slot).toHaveAttribute('aria-pressed', 'true');

    // Escape stands the pointer down again without spending the device.
    await page.keyboard.press('Escape');
    await expect(slot).toHaveAttribute('aria-pressed', 'false');
    await expect(slot).toHaveText('Scanner×2');
  });

  /**
   * The other half of the gesture: a press on the mine puts the device on the
   * tile that was pressed. The save below hollows out and surveys rows 5–20 of
   * the whole mine, so every point in the middle of the canvas is a legal target
   * whatever size the browser window happens to be — the test is about the
   * screen-to-tile conversion, not about aiming.
   */
  test('a press on the mine deploys the armed scanner and spends it', async ({page}) => {
    await page.addInitScript(() => {
      const worldWidth = 90;
      const tiles = [];
      for (let y = 5; y <= 20; y++) {
        for (let x = 0; x < worldWidth; x++) tiles.push({x, y, tile: {type: 'air'}});
      }
      localStorage.setItem('moleload-progress-v1', JSON.stringify({
        version: 6,
        scanners: 1,
        explored: `${5 * worldWidth}-${21 * worldWidth - 1}`,
        tiles
      }));
    });
    await startSoloRun(page);

    const slot = page.locator('#scannerSlotBtn');
    await slot.click();
    await expect(slot).toHaveAttribute('aria-pressed', 'true');

    const canvas = page.locator('#game');
    const box = (await canvas.boundingBox())!;
    await canvas.click({position: {x: box.width * 0.55, y: box.height * 0.5}});

    await expect(page.locator('#toast')).toContainText('Scanner deployed');
    // The device left the bay with the press, and the slot with it.
    await expect(page.locator('#scannerSlotBtn')).toHaveCount(0);
    await expect(page.locator('#inventoryToggleBtn')).toContainText('0/5');
    // The keyboard is back on the mine, so play resumes without a second click.
    await expect(canvas).toBeFocused();
  });

  /**
   * Dynamite is placed the same way, but it is the fuse that makes it worth an
   * end-to-end test: the stick has to leave the bay on the press, sit on the tile
   * for five real seconds, and then go off on its own with nothing else touching
   * it. The same hollowed-out, surveyed mine as the scanner test above.
   */
  test('a planted stick leaves the bay, burns its fuse, and blows on its own', async ({page}) => {
    await page.addInitScript(() => {
      const worldWidth = 90;
      const tiles = [];
      for (let y = 5; y <= 20; y++) {
        for (let x = 0; x < worldWidth; x++) tiles.push({x, y, tile: {type: 'air'}});
      }
      localStorage.setItem('moleload-progress-v1', JSON.stringify({
        version: 7,
        dynamite: 2,
        explored: `${5 * worldWidth}-${21 * worldWidth - 1}`,
        tiles
      }));
    });
    await startSoloRun(page);

    // E is the shortcut for the slot, and Escape stands it down again.
    const slot = page.locator('#dynamiteSlotBtn');
    await expect(slot).toHaveText('Dynamite×2');
    await page.keyboard.press('e');
    await expect(slot).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await expect(slot).toHaveAttribute('aria-pressed', 'false');

    await slot.click();
    await expect(slot).toHaveAttribute('aria-pressed', 'true');

    const canvas = page.locator('#game');
    const box = (await canvas.boundingBox())!;
    await canvas.click({position: {x: box.width * 0.55, y: box.height * 0.5}});

    await expect(page.locator('#toast')).toContainText('Fuse lit');
    // The stick left the bay with the press; the other one is still aboard.
    await expect(slot).toHaveText('Dynamite×1');
    await expect(canvas).toBeFocused();

    // Nothing else happens in between: the fuse runs on the simulation's clock.
    await expect(page.locator('#toast')).toContainText('Dynamite', {timeout: 15_000});
  });

  test('the canvas keeps the keyboard while mining', async ({page}) => {
    await startSoloRun(page);
    await drillDown(page);
    await expect(page.locator('#game')).toBeFocused();
  });
});
