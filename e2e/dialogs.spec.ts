// The overlays, which is where the browser does the work: native modal
// `<dialog>`s contain Tab, make the page behind them inert, and answer Escape with
// a close request. None of that exists in a jsdom/happy-dom unit test.

import { expect, test } from '@playwright/test';
import {
  activeElementId,
  collectPageFailures,
  openIntro,
  openMultiplayer,
  openOverlayDirectly,
  startSoloRun
} from './support/game';

test.describe('shop dialog', () => {
  test('opens focused inside itself and Escape restores focus to the trigger', async ({page}) => {
    const failures = collectPageFailures(page);
    await startSoloRun(page);

    await page.locator('#shopBtn').click();
    await expect(page.locator('#shop-screen')).toBeVisible();
    // The dialog focuses its own close button, so the first Tab and the first
    // Escape both act on the shop rather than on the mine behind it.
    await expect(page.locator('#shopCloseBtn')).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(page.locator('#shop-screen')).toBeHidden();
    await expect(page.locator('#shopBtn')).toBeFocused();
    expect(failures).toEqual([]);
  });

  test('the × button closes it and restores focus too', async ({page}) => {
    await startSoloRun(page);
    await page.locator('#shopBtn').click();
    await page.locator('#shopCloseBtn').click();
    await expect(page.locator('#shop-screen')).toBeHidden();
    await expect(page.locator('#shopBtn')).toBeFocused();
  });

  test('a press on the dimmed area around the card closes it', async ({page}) => {
    await startSoloRun(page);
    await page.locator('#shopBtn').click();
    await expect(page.locator('#shop-screen')).toBeVisible();
    // The very top-left of the dialog box is padding, never the card.
    await page.locator('#shop-screen').click({position: {x: 4, y: 4}});
    await expect(page.locator('#shop-screen')).toBeHidden();
  });

  test('Tab cannot walk out of the dialog into the HUD behind it', async ({page}) => {
    await startSoloRun(page);
    await page.locator('#shopBtn').click();
    await expect(page.locator('#shopCloseBtn')).toBeFocused();

    // Everything outside a modal `<dialog>` is inert, so the cycle can only ever
    // visit the dialog's own enabled controls — Chromium routes the wrap-around
    // through the document itself, which is why `:wrap` is an accepted stop.
    const visited: string[] = [];
    for (let step = 0; step < 12; step++) {
      await page.keyboard.press('Tab');
      visited.push(await page.evaluate(() => {
        const active = document.activeElement;
        if (!active || active === document.body || active === document.documentElement) return ':wrap';
        return active.closest('#shop-screen') ? `shop:${active.id}` : `outside:${active.id}`;
      }));
    }

    expect(visited.filter(stop => stop.startsWith('outside:'))).toEqual([]);
    // And it really did move: the cycle is not one element standing still.
    expect(new Set(visited).size).toBeGreaterThan(1);
  });
});

test.describe('info dialog', () => {
  test('opens focused inside itself and Escape restores focus to the trigger', async ({page}) => {
    await startSoloRun(page);

    await page.locator('#infoBtn').click();
    await expect(page.locator('#info-screen')).toBeVisible();
    await expect(page.locator('#infoCloseBtn')).toBeFocused();
    // Info always opens on its first tab.
    await expect(page.locator('#info-objective')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.locator('#info-screen')).toBeHidden();
    await expect(page.locator('#infoBtn')).toBeFocused();
  });

  test('the tablist swaps panels by click and moves focus with the arrow keys', async ({page}) => {
    await startSoloRun(page);
    await page.locator('#infoBtn').click();

    await page.locator('#info-tab-controls').click();
    await expect(page.locator('#info-controls')).toBeVisible();
    // Only the selected panel is mounted, so the previous one is gone rather than
    // hidden — and only the selected tab is a tab stop.
    await expect(page.locator('#info-objective')).toHaveCount(0);
    await expect(page.locator('#info-tab-controls')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#info-tab-objective')).toHaveAttribute('tabindex', '-1');

    // Roving focus wraps: Controls is the last tab, so → lands back on the first.
    await page.keyboard.press('ArrowRight');
    expect(await activeElementId(page)).toBe('info-tab-objective');
    await page.keyboard.press('Enter');
    await expect(page.locator('#info-objective')).toBeVisible();
  });
});

test.describe('overlay exclusivity', () => {
  test('requesting info while the shop is up hands the screen over', async ({page}) => {
    await startSoloRun(page);
    await page.locator('#shopBtn').click();
    await expect(page.locator('#shop-screen')).toBeVisible();

    await openOverlayDirectly(page, 'info');
    await expect(page.locator('#info-screen')).toBeVisible();
    // The outgoing dialog's own close request must not have cleared the incoming
    // one's claim on the screen.
    await expect(page.locator('#shop-screen')).toBeHidden();
    await expect(page.locator('#shop-card')).toHaveCount(0);
    await expect(page.locator('#infoCloseBtn')).toBeFocused();

    // And the surviving overlay still closes normally.
    await page.keyboard.press('Escape');
    await expect(page.locator('#info-screen')).toBeHidden();
  });

  test('requesting the shop while info is up hands the screen back', async ({page}) => {
    await startSoloRun(page);
    await page.locator('#infoBtn').click();
    await expect(page.locator('#info-screen')).toBeVisible();

    await openOverlayDirectly(page, 'shop');
    await expect(page.locator('#shop-screen')).toBeVisible();
    await expect(page.locator('#info-screen')).toBeHidden();
    await expect(page.locator('#info-card')).toHaveCount(0);
  });
});

test.describe('lobby dialog', () => {
  test('contains Tab inside the relay panel', async ({page}) => {
    await openIntro(page);
    await openMultiplayer(page);

    // The URL, Connect and Back are the whole tab ring: the HUD of a run that has
    // not started is behind an inert page, and Tab must not reach it. (Chromium
    // routes the wrap-around through the document itself, as in the shop above.)
    await page.keyboard.press('Tab');
    expect(await activeElementId(page)).toBe('connectBtn');
    await page.keyboard.press('Tab');
    expect(await activeElementId(page)).toBe('lobbyBackBtn');

    const visited: string[] = [];
    for (let step = 0; step < 8; step++) {
      await page.keyboard.press('Tab');
      visited.push(await page.evaluate(() => {
        const active = document.activeElement;
        if (!active || active === document.body || active === document.documentElement) return ':wrap';
        return active.closest('#lobby-screen') ? `lobby:${active.id}` : `outside:${active.id}`;
      }));
    }

    expect(visited.filter(stop => stop.startsWith('outside:'))).toEqual([]);
  });

  /**
   * Escape is taken out of the browser's hands here: left alone it is a close
   * request, which would drop the card behind the phase machine's back and leave a
   * mine that has not started on screen. It steps back to the splash instead — and
   * the splash still starts a run, so nothing is stranded.
   */
  test('Escape steps back to the splash, which still starts a run', async ({page}) => {
    await openIntro(page);
    await openMultiplayer(page);

    await page.keyboard.press('Escape');
    await expect(page.locator('#lobby-screen')).toHaveCount(0);
    await expect(page.locator('#intro')).toBeVisible();

    await page.keyboard.press('Enter');
    await expect(page.locator('#intro')).toHaveCount(0);
    await expect(page.locator('#game')).toBeFocused();
  });

  test('the Back button leaves multiplayer the same way', async ({page}) => {
    await openIntro(page);
    await openMultiplayer(page);

    await page.locator('#lobbyBackBtn').click();
    await expect(page.locator('#lobby-screen')).toHaveCount(0);
    await expect(page.locator('#intro')).toBeVisible();
  });
});
