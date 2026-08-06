// The visible failure surface. A runtime that cannot start used to leave a dead
// black rectangle; the only honest way to reproduce that is to break the browser
// API the boot depends on, which is what the init script below does.

import { expect, test, type Page } from '@playwright/test';
import { collectPageFailures } from './support/game';

/** Refuse every 2D context, the way a blocked/exhausted canvas backend would. */
async function breakCanvasContext(page: Page): Promise<void> {
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.getContext =
      (() => null) as typeof HTMLCanvasElement.prototype.getContext;
  });
}

test.describe('runtime failure', () => {
  test('a refused canvas context shows the Mine offline notice', async ({page}) => {
    const failures = collectPageFailures(page);
    await breakCanvasContext(page);
    await page.goto('/');

    const notice = page.locator('#runtime-failure');
    await expect(notice).toBeVisible();
    await expect(notice).toHaveAttribute('role', 'alert');
    await expect(notice).toContainText('Mine offline');
    // The detail line is whatever was thrown, verbatim.
    await expect(notice).toContainText('2D canvas rendering context is unavailable.');
    await expect(notice.getByRole('button', {name: 'Reload'})).toBeVisible();

    // The HUD chrome is still mounted behind the notice — only the simulation is
    // missing — and the crash boundary was not involved.
    await expect(page.locator('#app-failure')).toHaveCount(0);
    await expect(page.locator('#hud')).toBeAttached();

    // A refused boot is logged, not swallowed.
    expect(failures.some(entry => entry.includes('Game runtime failed to start'))).toBe(true);
  });

  test('the Reload button reloads the page', async ({page}) => {
    await breakCanvasContext(page);
    await page.goto('/');
    await expect(page.locator('#runtime-failure')).toBeVisible();

    await Promise.all([
      page.waitForEvent('load'),
      page.locator('#runtime-failure').getByRole('button', {name: 'Reload'}).click()
    ]);
    // The stub survives the navigation, so the notice is the honest result again.
    await expect(page.locator('#runtime-failure')).toBeVisible();
  });

  test('a working canvas shows no notice at all', async ({page}) => {
    await page.goto('/');
    await expect(page.locator('#intro')).toBeVisible();
    await expect(page.locator('#runtime-failure')).toHaveCount(0);
    await expect(page.locator('#app-failure')).toHaveCount(0);
  });
});
