from pathlib import Path

# One-shot patch helper for the performance follow-up. It deliberately uses
# exact replacements and aborts if current development no longer matches the
# expected code, so concurrent work cannot be silently overwritten.

hex_path = Path('hexMap.js')
hex_text = hex_path.read_text()
hex_original = hex_text

old_header = """function findPath(start, target, availableTP, entity, ignoreTP = false, preferredPath = null) {
    // Built once per call instead of re-scanning window.entities (a linear"""
new_header = """function findPath(start, target, availableTP, entity, ignoreTP = false, preferredPath = null) {
    const pathFloor = entity.floor || 0;
    const isPlayer = entity.side === 'player';

    // Trivial/known-impossible targets should never fan out into a 5000-node
    // A* search. Preserve fog-of-war semantics: an unexplored wall is still
    // treated as unknown to the player, exactly as it is in the neighbour
    // expansion below.
    if (start.q === target.q && start.r === target.r) return [start];
    const targetIsKnown = !isPlayer || window.isHexExplored(target.q, target.r);
    if (targetIsKnown && window.getTerrainAtFloor(target.q, target.r, pathFloor).impassable) return null;

    // These values depend only on the moving entity, not on each of the six
    // neighbours of every expanded node. Hoisting them removes thousands of
    // repeated equipment/skill lookups from longer searches.
    const isLightOrNoArmorEntity = !entity.equipped || !entity.equipped.armor || window.items[entity.equipped.armor]?.id === 'light_armor';
    let movementBaseCost = 5;
    if (entity.skills) {
        if (entity.skills.fastMovement && isLightOrNoArmorEntity) movementBaseCost -= entity.skills.fastMovement;
        if (entity.skills.swift_step) {
            const offhand = entity.equipped?.offhand;
            const isUnarmored = !entity.equipped?.armor && (!offhand || window.items[offhand]?.type !== 'shield');
            if (isUnarmored) movementBaseCost -= 1;
        }
    }
    movementBaseCost = Math.max(1, movementBaseCost);

    // Built once per call instead of re-scanning window.entities (a linear"""
if new_header not in hex_text:
    if old_header not in hex_text:
        raise SystemExit('findPath header changed; refusing to patch')
    hex_text = hex_text.replace(old_header, new_header, 1)

# Remove the now-duplicate pathFloor declaration later in the existing comment.
old_floor = """    const pathFloor = entity.floor || 0;
    const occupantsByHex = new Map();"""
new_floor = """    const occupantsByHex = new Map();"""
if old_floor in hex_text:
    hex_text = hex_text.replace(old_floor, new_floor, 1)

old_loop = """            // TASK 2: Knowledge-based pathing for player
            const isPlayer = (entity.side === 'player');
            const isVisible = window.isVisibleToPlayer(next);
            const isExplored = window.isHexExplored(next.q, next.r);

            // Check for ENEMY obstacles (Living enemies only)"""
new_loop = """            // TASK 2: Knowledge-based pathing for player. NPCs have full
            // terrain knowledge, so do not pay for an exploration lookup for
            // every expanded neighbour when the caller is not a player.
            const isExplored = !isPlayer || window.isHexExplored(next.q, next.r);
            const terrain = window.getTerrainAtFloor(next.q, next.r, pathFloor);

            // Check for ENEMY obstacles (Living enemies only)"""
if new_loop not in hex_text:
    if old_loop not in hex_text:
        raise SystemExit('findPath neighbour prelude changed; refusing to patch')
    hex_text = hex_text.replace(old_loop, new_loop, 1)

old_occupant = """            const isLightOrNoArmorEntity = !entity.equipped || !entity.equipped.armor || window.items[entity.equipped.armor]?.id === 'light_armor';
            let acrobaticsCost = 0;
            if (occupant) {
                const isKnownObstacle = !isPlayer || isVisible;"""
new_occupant = """            let acrobaticsCost = 0;
            if (occupant) {
                // Visibility only matters when there is actually an occupant.
                // The real-time player fast path deliberately has no blocking
                // occupants, so this removes what used to be one visibility
                // function call per neighbour from its hottest A* loop.
                const isKnownObstacle = !isPlayer || window.isVisibleToPlayer(next);"""
if new_occupant not in hex_text:
    if old_occupant not in hex_text:
        raise SystemExit('findPath occupant block changed; refusing to patch')
    hex_text = hex_text.replace(old_occupant, new_occupant, 1)

old_cost = """            // Calculate cost
            let baseCost = 5;
            if (entity.skills) {
                if (entity.skills['fastMovement'] && isLightOrNoArmorEntity) {
                    baseCost -= entity.skills['fastMovement'];
                }
                if (entity.skills['swift_step']) {
                    const isUnarmored = (!entity.equipped || !entity.equipped.armor) && (!entity.equipped || !entity.equipped.offhand || window.items[entity.equipped.offhand].type !== 'shield');
                    if (isUnarmored) baseCost -= 1;
                }
            }
            baseCost = Math.max(1, baseCost) + acrobaticsCost;

            // PREFERRED PATH DISCOUNT (Stay Together)"""
new_cost = """            // Calculate cost from the entity-wide base computed once above.
            let baseCost = movementBaseCost + acrobaticsCost;

            // PREFERRED PATH DISCOUNT (Stay Together)"""
if new_cost not in hex_text:
    if old_cost not in hex_text:
        raise SystemExit('findPath base-cost block changed; refusing to patch')
    hex_text = hex_text.replace(old_cost, new_cost, 1)

old_terrain = """            const terrain = window.getTerrainAtFloor(next.q, next.r, pathFloor);
            // Impassable-terrain check (Wall, and now the keep's Keep Wall)"""
new_terrain = """            // Impassable-terrain check (Wall, and now the keep's Keep Wall)"""
if old_terrain in hex_text:
    hex_text = hex_text.replace(old_terrain, new_terrain, 1)

if hex_text != hex_original:
    hex_path.write_text(hex_text)
    print('Applied safe findPath hot-loop optimisations')
else:
    print('findPath optimisations already applied')

perf_path = Path('performanceMonitor.js')
perf_text = perf_path.read_text()
perf_original = perf_text

old_decls = """        const p = window.performancePathfindingStats || {};
        const totalVis = (v.hits || 0) + (v.misses || 0);
        const hitRate = totalVis ? (100 * (v.hits || 0) / totalVis).toFixed(1) : '0.0';
        const pathAvg = p.calls ? (p.totalMs || 0) / p.calls : 0;"""
new_decls = """        const p = window.performancePathfindingStats || {};
        const npcCache = window.humanoidSpriteCacheStats || {};
        const totalVis = (v.hits || 0) + (v.misses || 0);
        const hitRate = totalVis ? (100 * (v.hits || 0) / totalVis).toFixed(1) : '0.0';
        const pathAvg = p.calls ? (p.totalMs || 0) / p.calls : 0;
        const npcCacheLookups = (npcCache.hits || 0) + (npcCache.misses || 0);
        const npcCacheHitRate = npcCacheLookups ? (100 * (npcCache.hits || 0) / npcCacheLookups).toFixed(1) : '0.0';
        const activeRenderInterval = window._getRenderIntervalMs ? Number(window._getRenderIntervalMs()) : 0;
        const activeRenderTarget = activeRenderInterval > 0 ? `${Math.round(1000 / activeRenderInterval)}fps/${activeRenderInterval}ms` : 'unknown';"""
if new_decls not in perf_text:
    if old_decls not in perf_text:
        raise SystemExit('performanceMonitor environment declarations changed; refusing to patch')
    perf_text = perf_text.replace(old_decls, new_decls, 1)

old_frame_line = """            `Frame-rate mode: ${window.frameRateMode || 'unknown'} | render scale: ${window.renderScale || 1} | foliage: ${window.foliageDetail || 'unknown'}`,"""
new_frame_line = """            `Frame-rate mode: ${window.frameRateMode || 'unknown'} | active target: ${activeRenderTarget} | render scale: ${window.renderScale || 1} | foliage: ${window.foliageDetail || 'unknown'}`,"""
if new_frame_line not in perf_text:
    if old_frame_line not in perf_text:
        raise SystemExit('performanceMonitor frame-rate line changed; refusing to patch')
    perf_text = perf_text.replace(old_frame_line, new_frame_line, 1)

old_render_line = """            `Render last: map=${fmt(r.lastMapMs || 0)} ms, map-other=${fmt(r.lastMapOtherMs || 0)} ms, entities=${fmt(r.lastEntitiesMs || 0)} ms, entityOnlyFrames=${r.entityOnlyFrames || 0}`,"""
new_render_line = """            `Render last: map=${fmt(r.lastMapMs || 0)} ms, map-other=${fmt(r.lastMapOtherMs || 0)} ms, entities=${fmt(r.lastEntitiesMs || 0)} ms, entityOnlyFrames=${r.entityOnlyFrames || 0}`,
            `NPC composite cache: installed=${!!npcCache.installed}, hits=${npcCache.hits || 0}, misses=${npcCache.misses || 0}, hitRate=${npcCacheHitRate}%, builds=${npcCache.builds || 0}, failed=${npcCache.failedBuilds || 0}, rewraps=${npcCache.rewraps || 0}`,"""
if new_render_line not in perf_text:
    if old_render_line not in perf_text:
        raise SystemExit('performanceMonitor render line changed; refusing to patch')
    perf_text = perf_text.replace(old_render_line, new_render_line, 1)

if perf_text != perf_original:
    perf_path.write_text(perf_text)
    print('Added active render target and NPC cache stats to profiler report')
else:
    print('performanceMonitor reporting patch already applied')
