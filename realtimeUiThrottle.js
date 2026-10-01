// realtimeUiThrottle.js
// Outside combat the initiative/party strip does not need 50+ structural
// checks per second. Keep combat immediate, but cap exploration updates to a
// few Hz; HP/mana text remains responsive while avoiding repeated entity
// filtering and appearance-signature work in renderHotPathCache.js.
(() => {
    'use strict';

    const REALTIME_UI_INTERVAL_MS = 200; // 5 Hz
    const INSTALL_RETRY_MS = 500;
    const stats = window.realtimeUiThrottleStats = {
        installed:false,
        calls:0,
        executed:0,
        skipped:0,
        combatCalls:0,
    };

    const now = () => (typeof performance !== 'undefined' && typeof performance.now === 'function')
        ? performance.now()
        : Date.now();

    let lastRealtimeRun = -Infinity;

    function install() {
        const current = window.updateTurnIndicator;
        if (typeof current !== 'function') return false;
        if (current.__realtimeUiThrottle) { stats.installed=true; return true; }
        // renderHotPathCache replaces updateTurnIndicator with its stable-card
        // implementation asynchronously. Wait for that final layer so this
        // throttle cannot be immediately overwritten during startup.
        if (!current.__stableTurnCards) return false;

        const wrapped = function(...args) {
            stats.calls++;
            if (window.isInCombat) {
                stats.combatCalls++;
                stats.executed++;
                return current.apply(this,args);
            }
            const t = now();
            if (t - lastRealtimeRun < REALTIME_UI_INTERVAL_MS) {
                stats.skipped++;
                return;
            }
            lastRealtimeRun = t;
            stats.executed++;
            return current.apply(this,args);
        };
        wrapped.__realtimeUiThrottle = true;
        wrapped.__original = current;
        window.updateTurnIndicator = wrapped;
        stats.installed = true;
        return true;
    }

    window.RealtimeUiThrottle = { install, stats, REALTIME_UI_INTERVAL_MS };
    if (!install()) {
        const timer = setInterval(() => { if (install()) clearInterval(timer); }, INSTALL_RETRY_MS);
    }
})();

// This script is the last normal presentation entry in name.js. Bootstrap the
// NPC composite cache from here so it wraps the completed humanoid/weapon/hair
// renderer chain rather than being overwritten by a later presentation module.
(() => {
    if (document.querySelector('script[data-humanoid-sprite-cache]')) return;
    const script = document.createElement('script');
    script.src = `humanoidSpriteCache.js?build=${encodeURIComponent(window.PRESENTATION_BUILD || 'npc-sprite-cache-v1')}`;
    script.dataset.humanoidSpriteCache = 'true';
    script.async = false;
    document.head.appendChild(script);
})();
