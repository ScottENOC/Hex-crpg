const { test, expect } = require('@playwright/test');

test.describe('asset load scheduler', () => {
  test('uses conservative gameplay concurrency and a versioned loader', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!window.__assetLoadScheduler);

    const state = await page.evaluate(() => {
      const scheduler = window.__assetLoadScheduler;
      const script = document.querySelector('script[data-asset-load-scheduler]');
      return {
        creatorMaxConcurrent:scheduler.creatorMaxConcurrent,
        gameMaxConcurrent:scheduler.gameMaxConcurrent,
        gameplayWarmupGraceMs:scheduler.gameplayWarmupGraceMs,
        transientRetryDelayMs:scheduler.transientRetryDelayMs,
        scriptSrc:script?.src || '',
        presentationBuild:window.PRESENTATION_BUILD,
      };
    });

    expect(state).toMatchObject({
      creatorMaxConcurrent:4,
      gameMaxConcurrent:4,
      gameplayWarmupGraceMs:750,
      transientRetryDelayMs:180,
    });
    expect(state.presentationBuild).toMatch(/^\d{8}-[a-z0-9-]+$/);
    expect(state.scriptSrc).toMatch(/assetLoadScheduler\.js\?build=[^&]+/);
  });

  test('switches into gameplay scheduling before the game starts loading', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!window.__assetLoadScheduler);

    expect(await page.evaluate(() => window.__assetLoadScheduler.gameStarted)).toBe(false);
    await page.evaluate(() => window.__assetLoadScheduler.beginGameplayLoading());

    const after = await page.evaluate(() => ({
      gameStarted:window.__assetLoadScheduler.gameStarted,
      gameMaxConcurrent:window.__assetLoadScheduler.gameMaxConcurrent,
    }));
    expect(after).toEqual({ gameStarted:true, gameMaxConcurrent:4 });
  });
});
