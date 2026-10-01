const { test, expect } = require('@playwright/test');

test('core runtime modules load without startup errors', async ({ page, request }) => {
  const pageErrors = [];
  const failedRequests = [];

  page.on('pageerror', error => {
    pageErrors.push(error && (error.stack || error.message) ? (error.stack || error.message) : String(error));
  });
  page.on('requestfailed', req => {
    failedRequests.push(`${req.url()} :: ${req.failure()?.errorText || 'request failed'}`);
  });

  const factionResponse = await request.get('/factions.js?v=5');
  expect(factionResponse.status(), 'factions.js should be served by the game server').toBe(200);
  expect(await factionResponse.text()).toContain('window.factions =');

  await page.goto('/');
  await page.waitForLoadState('load');

  const runtime = await page.evaluate(() => ({
    factions: typeof window.factions,
    silverhart: !!window.factions?.silverhart_kingdom,
    adjustReputation: typeof window.adjustReputation,
    seedFactionStandings: typeof window.seedFactionStandings,
    drawPlayerCharacter: typeof window.drawPlayerCharacter,
  }));

  expect(
    { runtime, pageErrors, failedRequests },
    `startup diagnostics:\n${JSON.stringify({ runtime, pageErrors, failedRequests }, null, 2)}`,
  ).toEqual({
    runtime: {
      factions: 'object',
      silverhart: true,
      adjustReputation: 'function',
      seedFactionStandings: 'function',
      drawPlayerCharacter: 'function',
    },
    pageErrors: [],
    failedRequests: [],
  });
});
