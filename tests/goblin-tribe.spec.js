// tests/goblin-tribe.spec.js
// The Skarn-tooth goblin tribe: camp placement, the Elder's quest gate, all
// three resolution paths (assault, stealth/assassination-succession,
// goblin-reputation diplomacy + its betrayal branch), and Aldric's separate
// rescue, recruitment, and attitude systems.
const { test, expect } = require('@playwright/test');
const { createCharacter } = require('./helpers');

test.describe('the Skarn-tooth goblin camp', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
    });

    test('the camp exists a long way from the crossroads, with huts, a dirt clearing, and all named goblins + the captive Paladin', async ({ page }) => {
        const result = await page.evaluate(() => {
            const cp = window.campaign2Landmarks.crossroads;
            const center = window.campaign2GoblinCampCenter;
            const names = ['Chief Skarnub', 'Nix Sharpear', 'Gralk the Bonecaster', 'Ser Aldric Thorne'];
            const found = {};
            names.forEach(n => found[n] = window.entities.some(e => e.name === n));
            return {
                distanceFromCrossroads: window.distance(cp, center),
                found,
                guardCount: window.entities.filter(e => e.title === 'Goblin Warrior' || e.title === 'Goblin Skulker').length,
                dirtAtCenter: window.getTerrainAt(center.q, center.r).name,
                hasHuts: Object.values(window.tileObjects).some(o => o.type === 'hut'),
                hasChiefHut: Object.values(window.tileObjects).some(o => o.type === 'hut_large'),
                chiefFaction: window.entities.find(e => e.name === 'Chief Skarnub').factionId,
                allNeutralByDefault: window.entities.filter(e => ['Chief Skarnub', 'Nix Sharpear', 'Gralk the Bonecaster'].includes(e.name)).every(e => e.side === 'neutral'),
            };
        });
        expect(result.distanceFromCrossroads).toBeGreaterThan(120); // "a long way" — 1.5 world-hexes out on the east road
        expect(result.found).toEqual({ 'Chief Skarnub': true, 'Nix Sharpear': true, 'Gralk the Bonecaster': true, 'Ser Aldric Thorne': true });
        expect(result.guardCount).toBeGreaterThanOrEqual(3);
        expect(result.dirtAtCenter).toBe('Dirt');
        expect(result.hasHuts).toBe(true);
        expect(result.hasChiefHut).toBe(true);
        expect(result.chiefFaction).toBe('goblin_tribe');
        expect(result.allNeutralByDefault).toBe(true); // assault/stealth/diplomacy all still open
    });

    test('Elder Marta only introduces the goblin threat after 2+ Hollowmere quests are completed', async ({ page }) => {
        const tooEarly = await page.evaluate(() => {
            window.questLog = [{ id: 'elder_locket', status: 'completed' }];
            window.npcDialogueTrees.marta_wynfield(window.entities.find(e => e.name === 'Elder Marta Wynfield'));
            return document.getElementById('dialogue-message').innerText;
        });
        expect(tooEarly.toLowerCase()).not.toContain('goblin');

        const readyNow = await page.evaluate(() => {
            window.questLog = [{ id: 'elder_locket', status: 'completed' }, { id: 'oskars_wager', status: 'completed' }];
            window.npcDialogueTrees.marta_wynfield(window.entities.find(e => e.name === 'Elder Marta Wynfield'));
            return document.getElementById('dialogue-message').innerText;
        });
        expect(readyNow.toLowerCase()).toContain('goblin');
    });
});

test.describe('goblin tribe resolution paths', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
        await page.evaluate(() => {
            window.questLog = [{ id: 'goblin_threat', title: 'The Skarn-tooth Tribe', giver: 'Elder Marta Wynfield', status: 'active', description: '' }];
        });
    });

    test('assault: killing the chief resolves the quest, frees Aldric without conscripting him, and swings reputation/region stats', async ({ page }) => {
        const before = await page.evaluate(() => ({
            human: window.factions.silverhart_kingdom.standing,
            goblin: window.factions.goblin_tribe.standing,
            security: window.regions.hollowmere.security,
        }));
        const result = await page.evaluate(() => {
            window.entities.find(e => e.name === 'Chief Skarnub').alive = false;
            window.checkGoblinAssaultResolution();
            const aldric = window.entities.find(e => e.name === 'Ser Aldric Thorne');
            const aldricState = window.aldricIndependentRecruitment.state();
            return {
                resolution: window.questLog.find(q => q.id === 'goblin_threat').resolution,
                paladinInParty: window.party.some(p => p.name === 'Ser Aldric Thorne'),
                aldricFreed: aldricState.freed,
                aldricStage: aldricState.stage,
                aldricTiedUp: aldric?.tiedUp,
                aldricSide: aldric?.side,
                human: window.factions.silverhart_kingdom.standing,
                goblin: window.factions.goblin_tribe.standing,
                security: window.regions.hollowmere.security,
            };
        });
        expect(result.resolution).toBe('assault');
        expect(result.paladinInParty).toBe(false);
        expect(result.aldricFreed).toBe(true);
        expect(result.aldricStage).toBe('reddale');
        expect(result.aldricTiedUp).toBe(false);
        expect(result.aldricSide).toBe('neutral');
        expect(result.human).toBeGreaterThan(before.human);
        expect(result.goblin).toBeLessThan(before.goblin);
        expect(result.security).toBeGreaterThan(before.security);
    });

    test('stealth/assassination: killing the chief unaware opens a peaceful succession with Nix and frees Aldric without auto-recruiting him', async ({ page }) => {
        await page.evaluate(() => {
            const chief = window.entities.find(e => e.name === 'Chief Skarnub');
            window.handleChiefAssassination(chief);
        });
        const chiefState = await page.evaluate(() => {
            const chief = window.entities.find(e => e.name === 'Chief Skarnub');
            return { alive: chief.alive, assassinated: chief.diedByAssassination };
        });
        expect(chiefState.alive).toBe(false);
        expect(chiefState.assassinated).toBe(true);

        await page.evaluate(() => window.npcDialogueTrees.nix_sharpear(window.entities.find(e => e.name === 'Nix Sharpear')));
        const nixMessage = await page.evaluate(() => document.getElementById('dialogue-message').innerText);
        expect(nixMessage.toLowerCase()).toContain('killed him');

        await page.click('#dialogue-options button'); // "Take your people and go."
        const result = await page.evaluate(() => {
            const aldric = window.entities.find(e => e.name === 'Ser Aldric Thorne');
            const aldricState = window.aldricIndependentRecruitment.state();
            return {
                resolution: window.questLog.find(q => q.id === 'goblin_threat').resolution,
                paladinInParty: window.party.some(p => p.name === 'Ser Aldric Thorne'),
                aldricFreed: aldricState.freed,
                aldricStage: aldricState.stage,
                aldricTiedUp: aldric?.tiedUp,
                aldricSide: aldric?.side,
            };
        });
        expect(result.resolution).toBe('stealth_succession');
        expect(result.paladinInParty).toBe(false);
        expect(result.aldricFreed).toBe(true);
        expect(result.aldricStage).toBe('reddale');
        expect(result.aldricTiedUp).toBe(false);
        expect(result.aldricSide).toBe('neutral');
    });

    test('assassination does not trigger the ordinary assault resolution path', async ({ page }) => {
        await page.evaluate(() => {
            const chief = window.entities.find(e => e.name === 'Chief Skarnub');
            window.handleChiefAssassination(chief);
            window.checkGoblinAssaultResolution(); // should no-op — diedByAssassination guards it
        });
        const resolution = await page.evaluate(() => window.questLog.find(q => q.id === 'goblin_threat').resolution);
        expect(resolution).toBeUndefined();
    });

    test('goblin-reputation diplomacy: enough favors unlock a peaceful departure and frees Aldric without silently recruiting him', async ({ page }) => {
        await page.evaluate(() => window.npcDialogueTrees.chief_skarnub(window.entities.find(e => e.name === 'Chief Skarnub')));
        await page.click('#dialogue-options button'); // "I could help you, for the right price."
        await page.click('#dialogue-options button'); // "What do you need?"
        await page.click('#dialogue-options button'); // "Scout the human village's patrols for you."

        const afterFavor = await page.evaluate(() => ({
            goblin: window.factions.goblin_tribe.standing,
            human: window.factions.silverhart_kingdom.standing,
            security: window.regions.hollowmere.security,
        }));
        expect(afterFavor.goblin).toBeGreaterThan(0);
        expect(afterFavor.human).toBeLessThan(5);

        // Push goblin standing to the diplomacy threshold directly (repeating the favor
        // dialogue flow many times would be equivalent but slower/flakier to drive).
        await page.evaluate(() => window.adjustReputation(window.factions.goblin_tribe, 40, 0));
        await page.evaluate(() => window.npcDialogueTrees.chief_skarnub(window.entities.find(e => e.name === 'Chief Skarnub')));
        const offerMsg = await page.evaluate(() => document.getElementById('dialogue-message').innerText);
        expect(offerMsg.toLowerCase()).toContain('move on');

        await page.click('#dialogue-options button'); // "Agreed. Take what you need and go."
        const result = await page.evaluate(() => {
            const aldric = window.entities.find(e => e.name === 'Ser Aldric Thorne');
            const aldricState = window.aldricIndependentRecruitment.state();
            return {
                resolution: window.questLog.find(q => q.id === 'goblin_threat').resolution,
                paladinInParty: window.party.some(p => p.name === 'Ser Aldric Thorne'),
                aldricFreed: aldricState.freed,
                aldricStage: aldricState.stage,
                aldricTiedUp: aldric?.tiedUp,
                aldricSide: aldric?.side,
            };
        });
        expect(result.resolution).toBe('goblin_diplomacy');
        expect(result.paladinInParty).toBe(false);
        expect(result.aldricFreed).toBe(true);
        expect(result.aldricStage).toBe('reddale');
        expect(result.aldricTiedUp).toBe(false);
        expect(result.aldricSide).toBe('neutral');
    });

    test('betrayal: helping the goblins raid Hollowmere devastates human reputation and makes recruited Aldric leave immediately', async ({ page }) => {
        await page.evaluate(() => {
            window.rescuePaladin();
            window.recruitAldric(); // betrayal behaviour only applies once he has actually chosen to join
            window.adjustReputation(window.factions.goblin_tribe, 25, 0); // clears the raid option's rep gate
        });
        const before = await page.evaluate(() => ({ human: window.factions.silverhart_kingdom.standing }));
        const result = await page.evaluate(() => {
            window.resolveGoblinFavor('raid');
            return {
                resolution: window.questLog.find(q => q.id === 'goblin_threat').resolution,
                human: window.factions.silverhart_kingdom.standing,
                goblin: window.factions.goblin_tribe.standing,
                attitude: window.companionAttitude['Ser Aldric Thorne'],
                paladinInParty: window.party.some(p => p.name === 'Ser Aldric Thorne'),
            };
        });
        expect(result.resolution).toBe('betrayal');
        expect(result.human).toBeLessThan(before.human - 30);
        expect(result.attitude).toBe(0);
        expect(result.paladinInParty).toBe(false); // he leaves immediately, regardless of prior attitude
    });
});

test.describe('Ser Aldric Thorne: rescue, construction, and attitude', () => {
    test.beforeEach(async ({ page }) => {
        await createCharacter(page);
    });

    test('can be freed without recruitment, then explicitly joins as the canonical fighter/cleric hybrid', async ({ page }) => {
        await page.evaluate(() => {
            window.npcDialogueTrees.ser_aldric_captive(window.entities.find(e => e.name === 'Ser Aldric Thorne' && e.tiedUp));
        });
        await page.waitForFunction(() => document.getElementById('dialogue-modal').style.display === 'block');
        await page.getByRole('button', { name: "I'll free you now." }).click();

        const freed = await page.evaluate(() => ({
            inParty: window.party.some(p => p.name === 'Ser Aldric Thorne'),
            tiedUp: window.entities.find(e => e.name === 'Ser Aldric Thorne')?.tiedUp,
            stage: window.aldricIndependentRecruitment.state().stage,
        }));
        expect(freed.inParty).toBe(false);
        expect(freed.tiedUp).toBe(false);
        expect(freed.stage).toBe('camp');

        await page.getByRole('button', { name: 'Come with me.' }).click();
        const paladin = await page.evaluate(() => {
            const p = window.party.find(p2 => p2.name === 'Ser Aldric Thorne');
            const ent = window.entities.find(e => e.name === 'Ser Aldric Thorne');
            return {
                inParty: !!p,
                hasSwordSkills: !!p && p.skills.sword_hit > 0 && p.skills.sword_dmg > 0,
                hasHealSkill: !!p && p.skills.learn_heal > 0,
                classSequence: p?.classLevelSequence || [],
                side: ent?.side,
                attitudeSeeded: window.companionAttitude['Ser Aldric Thorne'] > 0,
                stage: window.aldricIndependentRecruitment.state().stage,
            };
        });
        expect(paladin.inParty).toBe(true);
        expect(paladin.hasSwordSkills).toBe(true);
        expect(paladin.hasHealSkill).toBe(true);
        expect(paladin.classSequence).toEqual(['fighter', 'cleric']);
        expect(paladin.side).toBe('player');
        expect(paladin.attitudeSeeded).toBe(true);
        expect(paladin.stage).toBe('recruited');
    });

    test('attitude decays very slowly from inaction once recruited, and eventually causes departure at 0', async ({ page }) => {
        const result = await page.evaluate(() => {
            window.rescuePaladin();
            window.recruitAldric();
            if (!window.questLog) window.questLog = [];
            window.questLog.push({ id: 'goblin_threat', title: 'The Skarn-tooth Tribe', giver: 'Elder Marta Wynfield', status: 'active', description: '' });
            window.companionAttitude['Ser Aldric Thorne'] = 60;

            window.tickCompanionPatience(24 * 3600); // 1 in-game day
            const after1Day = window.companionAttitude['Ser Aldric Thorne'];

            window.tickCompanionPatience(24 * 3600 * 500); // 500 more in-game days — should exhaust patience
            return {
                after1Day,
                afterALongTime: window.companionAttitude['Ser Aldric Thorne'],
                stillInParty: window.party.some(p => p.name === 'Ser Aldric Thorne'),
            };
        });
        expect(result.after1Day).toBeLessThan(60);
        expect(result.after1Day).toBeGreaterThan(58); // "very slow" — not a meaningful drop in one day
        expect(result.afterALongTime).toBe(0);
        expect(result.stillInParty).toBe(false);
    });

    test('attitude decay stops once the goblin problem is resolved', async ({ page }) => {
        const result = await page.evaluate(() => {
            window.rescuePaladin();
            window.recruitAldric();
            window.questLog = [{ id: 'goblin_threat', status: 'completed', resolution: 'assault' }];
            window.companionAttitude['Ser Aldric Thorne'] = 60;
            window.tickCompanionPatience(24 * 3600 * 1000);
            return window.companionAttitude['Ser Aldric Thorne'];
        });
        expect(result).toBe(60); // unchanged — resolved, nothing left to be impatient about
    });

    test('regression: attitude decay also stops once the chief is assassinated, even before the succession conversation with Nix happens', async ({ page }) => {
        const result = await page.evaluate(() => {
            window.rescuePaladin();
            window.recruitAldric();
            window.questLog = [{ id: 'goblin_threat', status: 'active', chiefAssassinated: true }]; // no .resolution yet
            window.companionAttitude['Ser Aldric Thorne'] = 60;
            window.tickCompanionPatience(24 * 3600 * 1000);
            return window.companionAttitude['Ser Aldric Thorne'];
        });
        expect(result).toBe(60); // the goblin problem is effectively dealt with; decay isn't a debt to pay off later
    });

    test('the attitude meter is visible in the Quest Log UI once Aldric is recruited', async ({ page }) => {
        const visible = await page.evaluate(() => {
            window.rescuePaladin();
            window.recruitAldric();
            window.companionAttitude['Ser Aldric Thorne'] = 73;
            window.renderQuestLog();
            return document.getElementById('quest-log-list').innerText;
        });
        expect(visible).toContain('Ser Aldric Thorne');
        expect(visible).toContain('73');
    });
});
