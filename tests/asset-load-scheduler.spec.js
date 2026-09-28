const { test, expect } = require('@playwright/test');

test.describe('asset load scheduler', () => {
  test('uses conservative gameplay concurrency and a fresh cache token', async ({ page }) => {
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
      presentationBuild:'20260928-asset-loading-http2-v2',
    });
    expect(state.scriptSrc).toContain('assetLoadScheduler.js?build=20260928-asset-loading-http2-v2');
  });

  test('switches into gameplay scheduling before the game starts loading', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => !!window.__assetLoadScheduler);

    const before = await page.evaluate(() => window.__assetLoadScheduler.gameStarted);
    expect(before).toBe(false);

    await page.evaluate(() => window.__assetLoadScheduler.beginGameplayLoading());

    const after = await page.evaluate(() => ({
      gameStarted:window.__assetLoadScheduler.gameStarted,
      gameMaxConcurrent:window.__assetLoadScheduler.gameMaxConcurrent,
    }));
    expect(after).toEqual({ gameStarted:true, gameMaxConcurrent:4 });
  });
});