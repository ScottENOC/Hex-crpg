// performanceDiagnostics.js
// Thin loader: keep the proven diagnostics implementation byte-for-byte in
// performanceDiagnosticsCore.js, then add the entity-render probe without
// rewriting index.html or the large diagnostics file.
(() => {
    'use strict';
    function load(src, done) {
        const s = document.createElement('script');
        s.src = src;
        s.onload = () => done && done();
        s.onerror = () => console.warn('[perf-diag] failed to load', src);
        document.head.appendChild(s);
    }
    load('performanceDiagnosticsCore.js?v=20261002-core1', () => {
        load('entityRenderInstrumentation.js?v=20261002-2');
    });
})();
