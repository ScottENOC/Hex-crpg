# Performance benchmark

Run with:

```bash
node perf/benchmark.js
```

This is a synthetic CPU benchmark for the scaling-heavy entity occupancy path and render-request coalescing model. It is deliberately **not** presented as an iPhone GPU/FPS benchmark.

For real-device testing, open the game with `?perf=1` (or call `setPerformanceOverlay(true)` in the console). The overlay shows entity count, zoom, last/average measured render time, and how many render requests were coalesced.

Recommended stress checks:

1. Normal play at 1.0x zoom.
2. Dense settlement at 0.5x zoom.
3. Maximum zoom-out while continuously panning.
4. Continuous pinch zoom for 10 seconds.
5. Dense combat with 100+, 250+, and 500+ entities where practical.
