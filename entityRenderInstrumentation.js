// entityRenderInstrumentation.js
// Temporary/low-overhead diagnostics for isolating entity rendering cost on iOS.
(() => {
  'use strict';
  if (window.__entityRenderInstrumentationInstalled) return;
  window.__entityRenderInstrumentationInstalled = true;

  const stats = window.entityRenderInstrumentationStats = {
    installed: false,
    calls: 0,
    totalMs: 0,
    maxMs: 0,
    humanoidCalls: 0,
    humanoidMs: 0,
    humanoidMaxMs: 0,
    customCalls: 0,
    customMs: 0,
    customMaxMs: 0,
    creatureCalls: 0,
    creatureMs: 0,
    creatureMaxMs: 0,
    otherCalls: 0,
    otherMs: 0,
    otherMaxMs: 0,
    samples: [],
    installs: 0,
  };

  function classify(entity) {
    if (!entity) return 'other';
    if (entity.customImage) return 'custom';
    if (entity.race && entity.gender) return 'humanoid';
    if (entity.image || entity.sprite || entity.race || entity.type) return 'creature';
    return 'other';
  }

  function record(kind, ms, entity) {
    stats.calls++;
    stats.totalMs += ms;
    stats.maxMs = Math.max(stats.maxMs, ms);
    const callsKey = `${kind}Calls`;
    const msKey = `${kind}Ms`;
    const maxKey = `${kind}MaxMs`;
    stats[callsKey]++;
    stats[msKey] += ms;
    stats[maxKey] = Math.max(stats[maxKey], ms);
    if (ms >= 1) {
      stats.samples.push({
        ms,
        kind,
        name: entity?.name || entity?.id || entity?.type || entity?.race || 'unknown',
        race: entity?.race || '',
        gender: entity?.gender || '',
        side: entity?.side || '',
        customImage: entity?.customImage || '',
      });
      stats.samples.sort((a,b) => b.ms - a.ms);
      if (stats.samples.length > 30) stats.samples.length = 30;
    }
  }

  function installDrawProbe() {
    const current = window.drawPlayerCharacter;
    if (typeof current !== 'function') return false;
    if (current.__entityRenderInstrumentation) return true;

    const wrapped = function(ctx, entity, ...rest) {
      const kind = classify(entity);
      const t0 = performance.now();
      try {
        return current.call(this, ctx, entity, ...rest);
      } finally {
        record(kind, performance.now() - t0, entity);
      }
    };
    wrapped.__entityRenderInstrumentation = true;
    wrapped.__original = current;
    for (const marker of ['__stableNpcCompositeCache','__directHumanoidCompositor']) {
      if (current[marker]) wrapped[marker] = current[marker];
    }
    window.drawPlayerCharacter = wrapped;
    // Bind the global identifier too: gameEngine uses it directly on Safari.
    window.__hexInstrumentedDrawPlayerCharacter = wrapped;
    try { (0, eval)('drawPlayerCharacter = window.__hexInstrumentedDrawPlayerCharacter'); } catch (_) {}
    stats.installs++;
    stats.installed = true;
    return true;
  }

  function fmt(total, calls) {
    return calls ? `${(total/calls).toFixed(2)}ms avg / ${calls}` : `0.00ms avg / 0`;
  }

  function report() {
    const lines = [
      '',
      'ENTITY RENDER INSTRUMENTATION',
      '=============================',
      `drawPlayerCharacter calls=${stats.calls} total=${stats.totalMs.toFixed(1)}ms avg=${stats.calls ? (stats.totalMs/stats.calls).toFixed(2) : '0.00'}ms max=${stats.maxMs.toFixed(1)}ms`,
      `humanoid: ${fmt(stats.humanoidMs,stats.humanoidCalls)} max=${stats.humanoidMaxMs.toFixed(1)}ms`,
      `custom-image: ${fmt(stats.customMs,stats.customCalls)} max=${stats.customMaxMs.toFixed(1)}ms`,
      `creature: ${fmt(stats.creatureMs,stats.creatureCalls)} max=${stats.creatureMaxMs.toFixed(1)}ms`,
      `other: ${fmt(stats.otherMs,stats.otherCalls)} max=${stats.otherMaxMs.toFixed(1)}ms`,
      `probe installs=${stats.installs}`,
    ];
    if (stats.samples.length) {
      lines.push('Slowest character draws:');
      for (const s of stats.samples.slice(0,15)) {
        lines.push(`- ${s.ms.toFixed(1)}ms ${s.kind} ${s.name}${s.race ? ` [${s.race}/${s.gender || '?'}]` : ''}${s.side ? ` side=${s.side}` : ''}`);
      }
    }
    return lines.join('\n');
  }

  function installReport() {
    const current = window.getPerformanceReport;
    if (typeof current !== 'function') return false;
    if (current.__entityRenderInstrumentationReport) return true;
    const wrapped = function(...args) { return `${current.apply(this,args)}\n${report()}`; };
    wrapped.__entityRenderInstrumentationReport = true;
    wrapped.__original = current;
    window.getPerformanceReport = wrapped;
    return true;
  }

  function installAll() {
    const a = installDrawProbe();
    const b = installReport();
    return a && b;
  }

  installAll();
  const timer = setInterval(() => {
    const draw = window.drawPlayerCharacter;
    if (!draw?.__entityRenderInstrumentation) installDrawProbe();
    installReport();
  }, 1000);

  window.EntityRenderInstrumentation = { stats, report, install:installAll, stop(){clearInterval(timer);} };
})();
