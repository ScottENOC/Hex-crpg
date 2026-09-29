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
    // Every test pays a sizeable game/bootstrap cost when it calls createCharacter().
    // Local runs use three workers so one core remains available for the dev server.
    workers: process.env.CI ? undefined : 3,
    // Broad CI retries doubled the cost of deterministic failures and obscured how
    // many tests were genuinely stale. Flaky tests should be fixed or explicitly
    // isolated rather than retrying the entire suite by default.
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
