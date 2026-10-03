// realtimeTickCadence.js
// Keep combat's legacy 10 ms tick semantics, but stop running the entire
// exploration simulation 100 times per second. gameEngine.tick() already
// measures elapsed wall time and scales real-time movement/world time by dt,
// so coalescing exploration callbacks preserves speed while cutting repeated
// full-entity work roughly in half on mobile.
(() => {
    'use strict';

    const DRIVER_INTERVAL_MS = 10;
    const EXPLORATION_MIN_INTERVAL_MS = 18;
    const INSTALL_RETRY_MS = 1000;

    let installed = false;
    let originalTick = null;
    let originalInterval = null;
    let installTimer = null;
    let lastExplorationRunAt = -Infinity;
    let executedTicks = 0;
    let skippedExplorationTicks = 0;
    let installedAt = 0;

    const now = () => (typeof performance !== 'undefined' && typeof performance.now === 'function')
        ? performance.now()
        : Date.now();

    function install() {
        if (installed) return true;
        if (typeof window.tick !== 'function' || !window.tickInterval) return false;

        originalTick = window.tick;
        originalInterval = window.tickInterval;
        clearInterval(originalInterval);

        const driver = () => {
            const t = now();
            if (!window.isInCombat) {
                if (t - lastExplorationRunAt < EXPLORATION_MIN_INTERVAL_MS) {
                    skippedExplorationTicks++;
                    return;
                }
                lastExplorationRunAt = t;
            }
            executedTicks++;
            originalTick();
        };

        driver.__realtimeTickCadence = true;
        window.tickInterval = setInterval(driver, DRIVER_INTERVAL_MS);
        installed = true;
        installedAt = now();
        window.__realtimeTickCadenceInstalled = true;
        return true;
    }

    window.RealtimeTickCadence = {
        install,
        DRIVER_INTERVAL_MS,
        EXPLORATION_MIN_INTERVAL_MS,
        get stats() {
            return {
                installed,
                installedAt,
                executedTicks,
                skippedExplorationTicks,
                explorationTargetHz: Math.round(1000 / EXPLORATION_MIN_INTERVAL_MS),
            };
        },
    };

    if (!install()) {
        // name.js loads before gameEngine.js. Keep this very low-frequency
        // bootstrap alive until a campaign actually creates tickInterval; a
        // player can spend minutes in character creation, so a short timeout
        // here would make the optimisation randomly fail to install.
        installTimer = setInterval(() => {
            if (!install()) return;
            clearInterval(installTimer);
            installTimer = null;
        }, INSTALL_RETRY_MS);
    }
})();
