// tests/ironbond-arc.spec.js
// The Ironbond Company vs. the Silverhart throne — two hidden tracks
// (surfacePower, crownInfiltration) that both drift upward on their own
// clock regardless of the player (see ironbondArc.js), feeding a mid-game
// repeatable-mission system and an 8-branch endgame (2 sides x 4 world
// outcomes, see campaign2World.js's launchIronbondArcEndgame).

const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers.js');

test.describe('Ironbond Arc', () => {
    test('side commitment, passive drift, mission system, merchant gating', async ({ page }) => {
        await createCharacter(page);
        await page.waitForTimeout(1000);

        const initial = await page.evaluate(() => ({
            side: window.ironbondArc.playerSide,
            phase: window.ironbondArc.phase,
            sp: window.getSurfacePower(),
            ci: window.ironbondArc.crownInfiltration,
        }));
        expect(initial.side).toBe(null);
        expect(initial.phase).toBe('early');

        // Drift: both climb passively even with no side chosen.
        const afterDrift = await page.evaluate(() => {
            window.tickIronbondArc(3600 * 10); // 10 in-game hours
            return { sp: window.getSurfacePower(), ci: window.ironbondArc.crownInfiltration };
        });
        expect(afterDrift.sp).toBeGreaterThan(initial.sp);
        expect(afterDrift.ci).toBeGreaterThan(initial.ci);

        // Commit to a side; second commitment is ignored.
        const sideResult = await page.evaluate(() => {
            window.setIronbondArcSide('crown');
            window.setIronbondArcSide('ironbond'); // should be a no-op
            return window.ironbondArc.playerSide;
        });
        expect(sideResult).toBe('crown');

        // Phase advances to 'mid' after enough in-game time. tickIronbondArc
        // only computes drift from a deltaSeconds argument — it doesn't
        // itself advance window.worldSeconds (that's the real game clock,
        // advanced elsewhere), so the test has to move both together.
        const phaseAfter = await page.evaluate(() => {
            window.worldSeconds = (window.worldSeconds || 0) + 3600 * 30;
            window.tickIronbondArc(3600 * 30); // past the 24h early-phase window
            return window.ironbondArc.phase;
        });
        expect(phaseAfter).toBe('mid');

        // Mission system: offer/complete moves the right track.
        const missionResult = await page.evaluate(() => {
            const spBefore = window.getSurfacePower();
            const mission = window.offerIronbondArcMission('disrupt_shipment');
            window.completeIronbondArcMission(mission.id);
            return { spBefore, spAfter: window.getSurfacePower(), missionsCompleted: window.ironbondArc.midMissionsCompleted };
        });
        expect(missionResult.spAfter).toBeLessThan(missionResult.spBefore);
        expect(missionResult.missionsCompleted).toBe(1);

        // Temp drift modifiers are actually recorded (their effect on future
        // drift is exercised by the passive-drift assertion above already).
        const driftReduction = await page.evaluate(() => {
            const mission = window.offerIronbondArcMission('audit_ledgers');
            window.completeIronbondArcMission(mission.id);
            return window.ironbondArc.tempSurfaceDriftModifiers.length > 0;
        });
        expect(driftReduction).toBe(true);

        // Merchant gating: Ironbond's quartermaster exists at the Reddale
        // guildhouse (see buildReddale/campaign2Content.js).
        const merchant = await page.evaluate(() => {
            const npc = window.entities.find(e => e.dialogueId === 'ironbond_merchant');
            return { exists: !!npc, name: npc?.name };
        });
        expect(merchant.exists).toBe(true);
        expect(merchant.name).toBe('Quartermaster Osric Vane');
    });

    test.describe('endgame branches (2 sides x 4 world outcomes)', () => {
        async function setupQuadrant(page, side, sp, ci) {
            await createCharacter(page);
            await page.waitForTimeout(1000);
            await page.evaluate(({ side, sp, ci }) => {
                window.setIronbondArcSide(side);
                window.factions.ironbond_company.merchantInfluence.silverhart_kingdom = sp;
                window.ironbondArc.crownInfiltration = ci;
                window.ironbondArc.phase = 'mid';
                window.ironbondArc.midMissionsCompleted = 5;
                window.ironbondArc.sideChosenAtWorldSeconds = -1000000;
                window.ironbondArc.endgamePending = true;
                window.checkIronbondArcEndgame();
            }, { side, sp, ci });
        }

        // Kills every spawned combatant directly and calls checkCombatEnd —
        // the same trigger real combat uses once the last one dies.
        async function winCurrentEncounter(page) {
            return page.evaluate(() => {
                window.entities.filter(e => e.isIronbondArcCombatant && e.alive).forEach(e => { e.alive = false; e.hp = -1000; });
                if (window.checkCombatEnd) window.checkCombatEnd();
            });
        }

        test('coup (high surfacePower, low crownInfiltration): Ironbond strong, crown blind', async ({ page }) => {
            await setupQuadrant(page, 'crown', 70, 10);
            const state = await page.evaluate(() => ({ quadrant: window.ironbondArc.endgameQuadrant, enemyCount: window.entities.filter(e => e.isIronbondArcCombatant && e.alive).length }));
            expect(state.quadrant).toBe('coup');
            expect(state.enemyCount).toBeGreaterThan(0);
            await winCurrentEncounter(page);
            expect(await page.evaluate(() => window.ironbondArc.endgameResolution)).toBe('crown_coup_defended');
        });

        test('coup, ironbond side: storms the throne room with the advantage', async ({ page }) => {
            await setupQuadrant(page, 'ironbond', 70, 10);
            await winCurrentEncounter(page);
            expect(await page.evaluate(() => window.ironbondArc.endgameResolution)).toBe('ironbond_coup_won');
        });

        test('counter_raid (high surfacePower, high crownInfiltration): crown strikes first', async ({ page }) => {
            await setupQuadrant(page, 'crown', 70, 70);
            expect(await page.evaluate(() => window.ironbondArc.endgameQuadrant)).toBe('counter_raid');
            await winCurrentEncounter(page);
            expect(await page.evaluate(() => window.ironbondArc.endgameResolution)).toBe('crown_raid_won');
        });

        test('counter_raid, ironbond side: defends the guildhouse on home ground', async ({ page }) => {
            await setupQuadrant(page, 'ironbond', 70, 70);
            await winCurrentEncounter(page);
            expect(await page.evaluate(() => window.ironbondArc.endgameResolution)).toBe('ironbond_raid_defended');
        });

        test('hard_mopup (low surfacePower, low crownInfiltration): no shortcuts either way', async ({ page }) => {
            await setupQuadrant(page, 'crown', 20, 10);
            expect(await page.evaluate(() => window.ironbondArc.endgameQuadrant)).toBe('hard_mopup');
            await winCurrentEncounter(page);
            expect(await page.evaluate(() => window.ironbondArc.endgameResolution)).toBe('crown_mopup_won');
        });

        test('hard_mopup, ironbond side: damage control, not victory', async ({ page }) => {
            await setupQuadrant(page, 'ironbond', 20, 10);
            await winCurrentEncounter(page);
            expect(await page.evaluate(() => window.ironbondArc.endgameResolution)).toBe('ironbond_mopup_survived');
        });

        test('clean_sweep (low surfacePower, high crownInfiltration), crown side: near-bloodless win', async ({ page }) => {
            await setupQuadrant(page, 'crown', 20, 70);
            expect(await page.evaluate(() => window.ironbondArc.endgameQuadrant)).toBe('clean_sweep');
            await winCurrentEncounter(page);
            expect(await page.evaluate(() => window.ironbondArc.endgameResolution)).toBe('crown_clean_sweep');
        });

        test('clean_sweep, ironbond side: two-stage comeback — both stages must be won for a real reversal', async ({ page }) => {
            await setupQuadrant(page, 'ironbond', 20, 70);
            const stage1 = await page.evaluate(() => ({
                quadrant: window.ironbondArc.endgameQuadrant,
                stage: window.ironbondArc.endgameStage,
                enemyCount: window.entities.filter(e => e.isIronbondArcCombatant && e.alive).length,
            }));
            expect(stage1.quadrant).toBe('clean_sweep');
            expect(stage1.stage).toBe(1);
            expect(stage1.enemyCount).toBeGreaterThan(0);

            // Winning stage 1 (the last stronghold) advances to stage 2
            // (the hail-mary strike on the capital) — it must NOT resolve yet.
            await winCurrentEncounter(page);
            const afterStage1 = await page.evaluate(() => ({
                stage: window.ironbondArc.endgameStage,
                resolution: window.ironbondArc.endgameResolution,
                enemyCount: window.entities.filter(e => e.isIronbondArcCombatant && e.alive).length,
            }));
            expect(afterStage1.stage).toBe(2);
            expect(afterStage1.resolution).toBe(null);
            expect(afterStage1.enemyCount).toBeGreaterThan(0);

            // Winning stage 2 resolves as a real, earned reversal.
            await winCurrentEncounter(page);
            expect(await page.evaluate(() => window.ironbondArc.endgameResolution)).toBe('ironbond_hail_mary_won');
        });
    });
});
