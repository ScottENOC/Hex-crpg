// playwright.config.js
const fs = require('fs');
const { defineConfig } = require('@playwright/test');

// Some sandboxed environments pre-install only the full Chromium binary, not
// the separate "headless shell" build @playwright/test defaults to. Fall
// back to it when present; otherwise let Playwright resolve its own default
// (a normal `npx playwright install` on a dev machine or in CI already
// provides the expected binary in its usual location).
const sandboxChromium = '/opt/pw-browsers/chromium';
const launchOptions = fs.existsSync(sandboxChromium) ? { executablePath: sandboxChromium } : {};

module.exports = defineConfig({
    testDir: './tests',
    timeout: 30000,
    fullyParallel: true,
    retries: process.env.CI ? 1 : 0,
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
