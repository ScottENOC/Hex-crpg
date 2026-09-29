// playwright.config.js
const fs = require('fs');
const { defineConfig } = require('@playwright/test');

// Some sandboxed environments pre-install only the full Chromium binary, not
// the separate "headless shell" build @playwright/test defaults to. Fall
// back to it when present; otherwise let Playwright resolve its own default.
const sandboxChromium = '/opt/pw-browsers/chromium';
const launchOptions = fs.existsSync(sandboxChromium) ? { executablePath: sandboxChromium } : {};

module.exports = defineConfig({
    testDir: './tests',
    timeout: 30000,
    fullyParallel: true,
    // Each worker boots a browser page while the local game server runs alongside it.
    // GitHub's default was only using two workers per shard; three materially reduces
    // the long-tail shard without saturating the runner or starving the dev server.
    workers: 3,
    // Broad CI retries doubled deterministic failures and hid stale tests. Flaky
    // tests should be fixed or explicitly isolated rather than retried globally.
    retries: 0,
    reporter: process.env.CI ? 'github' : 'list',
    use: {
        baseURL: 'http://localhost:3000',
        headless: true,
        screenshot: 'only-on-failure',
        video: 'off',
        trace: 'retain-on-failure',
        launchOptions,
    },
    projects: [
        { name: 'chromium', use: { channel: undefined, launchOptions } },
    ],
    webServer: {
        command: 'node server.js',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 15000,
    },
});
