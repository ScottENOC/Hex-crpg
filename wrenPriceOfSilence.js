// wrenPriceOfSilence.js
// Wren Talbot, Chapter 2: The Price of Silence.
//
// The Long Silence answers what happened to Mara and Galen. This chapter asks
// who helped Harl Venn pay for it and who had enough power to make the paper
// trail disappear. It deliberately reuses Reddale's existing Ironbond/Baron
// politics and the generic stealth-mission system rather than building a
// parallel investigation minigame.
(() => {
    'use strict';

    const BUILD = '20260929-wren-price-of-silence-v1';
    const QUEST_ID = 'wren_price_of_silence';
    const INFILTRATION_ID = 'wren_price_infiltration';
    const PARENTS_QUEST_ID = 'wren_parents';

    const CLUES = Object.freeze({
        reddale_mark: {
            label: 'A Reddale routing mark',
            text: 'One of Venn’s old payment references carries an Ironbond routing mark used by the Reddale factor’s office. Someone here processed money connected to the Talbots’ deaths.'
        },
        nella_drover: {
            label: 'Venn’s sealed packets came through Reddale',
            text: 'Nella remembers an old freight drover who complained that Venn’s sealed Millbrook packets were always taken through the Reddale guildhouse side door after dark, bypassing the public counter.'
        },
        routing_stencil: {
            label: 'The same routing stencil survives in Reddale',
            text: 'A faded crate behind the inn bears the same obsolete Reddale routing stencil as Venn’s payment reference. The mark belonged to Ironbond’s internal freight accounting, not a public road office.'
        },
        night_watch: {
            label: 'The watch was told not to inspect Ironbond wagons',
            text: 'Bram remembers old night-watch orders: sealed Ironbond freight wagons were to pass unsearched. One such wagon arrived from Millbrook in the week the Talbots vanished.'
        },
        baron_tariff_roll: {
            label: 'A Silverhart exemption covered the shipment',
            text: 'The Baron’s old tariff roll records Venn’s Millbrook consignment as exempt from local inspection under “Central Discretion — Silverhart”. The protection came from above Reddale.'
        },
        petra_recognition: {
            label: 'Petra recognises the old code',
            text: 'Petra Voss tries to dismiss the code, but her reaction gives her away. She recognises “Central Discretion” and is frightened of where it leads, rather than surprised by the accusation.'
        },
        guild_archive: {
            label: 'Ironbond reimbursed Venn’s witness payment',
            text: 'The private Reddale archive records “H. Venn — witness settlement” in the same week Mara and Galen died. The payment was reimbursed to Reddale under “Central Discretion, Silverhart — Crown Transport Office”. Reddale moved the money; someone in Silverhart authorised it.'
        },
    });

    const party = () => Array.isArray(window.party) ? window.party : [];
    const player = () => party()[0] || null;
    const wren = () => party().find((member, index) => index > 0 && member?.name === 'Wren Talbot') || null;
    const questById = id => (window.questLog || []).find(entry => entry?.id === id) || null;
    const quest = () => questById(QUEST_ID);
    const parentsQuest = () => questById(PARENTS_QUEST_ID);
    const maxPartySkill = id => party().reduce((best, member) => Math.max(best, Number(member?.skills?.[id] || 0)), 0);
    const hasStealthTraining = () => party().some(member => Number(member?.skills?.stealth_rogue || 0) > 0 || Number(member?.skills?.stealth_agility || 0) > 0);

    function canStart() {
        return !!wren() && parentsQuest()?.status === 'completed';
    }

    function evidenceCount(q = quest()) {
        if (!q) return 0;
        return Object.keys(q.clues || {}).filter(id => id !== 'reddale_mark').length;
    }

    function ensureQuest({ announce = true } = {}) {
        if (!canStart()) return null;
        window.questLog = window.questLog || [];
        let q = quest();
        if (!q) {
            q = {
                id: QUEST_ID,
                title: 'The Price of Silence',
                giver: 'Wren Talbot',
                status: 'active',
                stage: 'investigate_reddale',
                description: 'Follow the Reddale Ironbond routing mark in Harl Venn’s records and find out who helped pay to silence Wren’s parents.',
                clues: {},
                clueOrder: [],
                introSeen: false,
                choiceKeys: [],
                offeredAt: Number(window.worldSeconds || 0),
            };
            window.questLog.push(q);
            if (announce) window.showMessage?.('Companion quest added: The Price of Silence.');
        }
        q.clues = q.clues || {};
        q.clueOrder = q.clueOrder || [];
        q.choiceKeys = q.choiceKeys || [];
        if (!q.clues.reddale_mark) addClue('reddale_mark', 'Venn’s surviving Millbrook records', { quiet: true, q });
        return q;
    }

    function addClue(id, source = null, { quiet = false, q = quest() } = {}) {
        const spec = CLUES[id];
        if (!spec || !q) return false;
        q.clues = q.clues || {};
        q.clueOrder = q.clueOrder || [];
        if (q.clues[id]) return false;
        q.clues[id] = { found: true, source, text: spec.text, at: Number(window.worldSeconds || 0) };
        q.clueOrder.push(id);
        if (id === 'guild_archive') {
            q.stage = 'reckoning';
            q.description = 'The Reddale archive proves Ironbond reimbursed Venn’s witness payment under a Silverhart Crown Transport Office authorisation. Talk to Wren about what comes next.';
        } else {
            q.description = `Trace Venn’s Reddale payment trail. Evidence found: ${evidenceCount(q)}. The private Ironbond archive would settle who processed the money.`;
        }
        if (!quiet) window.showMessage?.(`Clue found: ${spec.label}.`);
        return true;
    }

    function clueSummary(q = quest()) {
        if (!q) return 'No investigation is active.';
        return (q.clueOrder || []).map(id => `• ${CLUES[id]?.label || id}`).join('\n') || 'No solid evidence yet.';
    }

    function applyChoice(key, { development = null, disposition = null, affinity = null } = {}) {
        const q = quest();
        const companion = wren();
        if (!q || !companion || !key) return false;
        const stable = String(key);
        if (q.choiceKeys.includes(stable)) return false;
        q.choiceKeys.push(stable);

        if (development) {
            window.wrenCharacterArc?.applyDevelopmentEvent?.(`price_of_silence:${stable}`, development, 'chapter2');
        }
        if (disposition) {
            window.noteWrenDispositionEvent?.(`price_of_silence:${stable}`, disposition);
        }
        if (affinity && typeof window.adjustCompanionAffinity === 'function') {
            window.adjustCompanionAffinity(companion, affinity, affinity.reason || stable, `wren_price:${stable}`);
        }
        return true;
    }

    function introChoice(kind) {
        if (kind === 'proof') {
            return applyChoice('intro_proof', {
                development: {
                    player: { personalLoyalty: -2, mercy: 3 },
                    wrenModel: { personalLoyalty: -2, mercy: 2 },
                    wrenImpact: { security: 2 },
                    reason: 'promised Wren that evidence, not anger, would lead the Reddale investigation',
                },
                disposition: { approval: 1, trust: 3, reason: 'took Wren’s search seriously without feeding her anger' },
                affinity: { friendship: 2, romanticBond: 1, reason: 'treated Wren’s search for answers as something worth doing carefully' },
            });
        }
        if (kind === 'vengeance') {
            return applyChoice('intro_vengeance', {
                development: {
                    player: { personalLoyalty: 5, mercy: -5 },
                    wrenModel: { personalLoyalty: 4, mercy: -4 },
                    wrenImpact: { security: 1 },
                    reason: 'promised retaliation against anyone who helped kill Wren’s parents',
                },
                disposition: { approval: 2, trust: 1, reason: 'made Wren’s enemies personal' },
                affinity: { friendship: 1, attraction: 1, reason: 'answered Wren’s anger with protective anger of your own' },
            });
        }
        return applyChoice('intro_wren_leads', {
            development: {
                player: { personalLoyalty: 2, mercy: 3 },
                wrenModel: { mercy: 2 },
                wrenImpact: { security: 5 },
                reason: 'let Wren decide what she needed from the investigation',
            },
            disposition: { approval: 2, trust: 5, reason: 'gave Wren control over a deeply personal investigation' },
            affinity: { friendship: 4, romanticBond: 2, reason: 'made room for Wren to decide what she needed' },
        });
    }

    function showIntro() {
        const companion = wren();
        const q = ensureQuest();
        if (!companion || !q || q.introSeen || typeof window.showDialogue !== 'function') return false;
        q.introSeen = true;
        window.showDialogue(companion,
            'Wren catches your sleeve before you get far into Reddale. “I kept looking at Venn’s figures. That little forked mark beside the payment? It’s here — Reddale Ironbond routing. If he paid people to kill Mum and Dad, somebody in this town moved the money. I don’t want to guess anymore. I want to know who knew.”',
            [
                { label: '“Then we follow the evidence, not our anger.”', action: () => introChoice('proof') },
                { label: '“If someone here helped kill them, we make them pay.”', action: () => introChoice('vengeance') },
                { label: '“This is your investigation. Tell me what you need from me.”', action: () => introChoice('wren_leads') },
            ]
        );
        return true;
    }

    function playerEntity() {
        const pc = player();
        return (window.entities || []).find(entity => entity?.side === 'player' && pc && entity?.name === pc.name)
            || (window.entities || []).find(entity => entity?.side === 'player' && !entity?.rider)
            || null;
    }

    function nearReddale() {
        const pcEntity = playerEntity();
        const center = window.campaign2ReddaleInnCenter || window.campaign2ReddaleGuildhouseCenter || window.campaign2ReddaleReeveHouseCenter;
        if (!pcEntity?.hex || !center || typeof window.distance !== 'function') return false;
        return window.distance(pcEntity.hex, center) <= 30;
    }

    function maybeInitiateAtReddale() {
        if (!canStart() || !nearReddale()) return false;
        const q = ensureQuest();
        syncExistingReddaleEvidence();
        if (!q?.introSeen && !window.isInCombat) return showIntro();
        return false;
    }

    function investigateNella(npc) {
        const q = ensureQuest();
        if (!q) return false;
        addClue('nella_drover', 'Nella Brook');
        window.showDialogue?.(npc,
            'Nella rubs at an old stain on the bar. “Venn? Gods, that’s a name I haven’t heard in years. One of the old freight drovers used to curse him. Said Venn’s sealed packets never went through the front desk — side door of the Ironbond guildhouse, after dark, straight to the factor’s people.”',
            [{ label: '“Who was on the night watch then?”', action: () => window.showMessage?.('Nella suggests asking Watchman Bram; he was a junior watchman even then.') }]
        );
        return true;
    }

    function inspectRoutingStencil(npc) {
        const q = ensureQuest();
        if (!q) return false;
        addClue('routing_stencil', 'Keen Perception');
        window.showDialogue?.(npc,
            'Your eye catches a nearly weathered-away forked stencil on an old freight crate behind the inn. It matches the mark beside Venn’s payment exactly. Nella confirms the crate came from Ironbond’s Reddale warehouse, not a public carrier.',
            [{ label: 'That narrows it down.', action: () => {} }]
        );
        return true;
    }

    function investigateBram(npc, method = 'ordinary') {
        const q = ensureQuest();
        if (!q) return false;
        const trained = method === 'persuasion';
        addClue('night_watch', trained ? 'Persuasion' : 'Watchman Bram Oswick');
        const text = trained
            ? 'Bram starts with “don’t remember”, but you walk him through the dates and the routing mark until the lie becomes harder than the truth. “Fine. We had written orders: sealed Ironbond wagons passed untouched. One came in from Millbrook that week, late. We were told not to write down the cargo.”'
            : 'Bram stares at the routing mark for a long while. “I was barely old enough for the watch then. We had orders not to inspect sealed Ironbond wagons. I remember one from Millbrook because it came after midnight. Everyone acted like not seeing it was part of the job.”';
        window.showDialogue?.(npc, text, [{ label: 'Who authorised the exemption?', action: () => window.showMessage?.('Bram says the old tariff authority sat with the Baron’s office.') }]);
        return true;
    }

    function inspectBaronRecords(npc) {
        const q = ensureQuest();
        if (!q) return false;
        addClue('baron_tariff_roll', 'Baron Aldervale’s tariff rolls');
        window.showDialogue?.(npc,
            'The Baron has no love for Ironbond and needs little persuasion to pull an old tariff roll. Venn’s Millbrook consignment is there — but the inspection column is crossed out. Beside it: “Central Discretion — Silverhart.” The Baron’s expression hardens. “That is not my authority. Someone above this barony wanted that wagon left alone.”',
            [{ label: 'So Reddale was protected from above.', action: () => {} }]
        );
        return true;
    }

    function readPetra(npc) {
        const q = ensureQuest();
        if (!q) return false;
        addClue('petra_recognition', 'Insight');
        window.showDialogue?.(npc,
            'You mention “Central Discretion” and watch Petra rather than the papers. Her face does not show confusion. It shows fear. “That phrase predates me,” she says too quickly. “And if you’re sensible, you’ll let it stay buried with the people who used it.”',
            [{ label: 'You know where the records are.', action: () => {} }]
        );
        return true;
    }

    function revealGuildArchive(npc, source = 'Reddale Ironbond private archive') {
        const q = ensureQuest();
        if (!q) return false;
        addClue('guild_archive', source);
        window.showDialogue?.(npc || wren(),
            'The old private ledger is brutally plain once you know which line to read: “H. Venn — witness settlement.” The date is the week Mara and Galen died. Reddale reimbursed the payment, then billed it upward under “Central Discretion, Silverhart — Crown Transport Office.” Ironbond carried the money. Someone in Silverhart authorised the silence.',
            [{ label: 'Take this to Wren.', action: () => {} }]
        );
        return true;
    }

    function confrontPetra(npc, method = 'evidence') {
        const q = ensureQuest();
        if (!q) return false;
        const canPress = method === 'persuasion'
            || !!q.clues.petra_recognition
            || (!!q.clues.nella_drover && !!q.clues.night_watch && !!q.clues.baron_tariff_roll)
            || evidenceCount(q) >= 4;
        if (!canPress) {
            window.showDialogue?.(npc, 'Petra’s expression closes. “You have a routing mark and a dead man’s accusation. Bring me something that actually ties this office to it.”', [{ label: 'We will.', action: () => {} }]);
            return false;
        }
        const lead = method === 'persuasion'
            ? 'You give Petra a way out: help expose a predecessor’s records instead of becoming part of the cover-up herself.'
            : 'You lay the independent pieces out one by one until denial would require Petra to call half of Reddale liars.';
        window.showDialogue?.(npc,
            `${lead} She swears under her breath, unlocks a narrow iron cabinet, and pulls out a ledger wrapped in oilcloth. “This is older than my tenure. You did not get it from me.”`,
            [{ label: 'Read the old ledger.', action: () => revealGuildArchive(npc, method === 'persuasion' ? 'Petra Voss, persuaded to open the archive' : 'Petra Voss, confronted with the evidence') }]
        );
        return true;
    }

    function ensureArchiveEvidence() {
        const center = window.campaign2ReddaleGuildhouseCenter;
        if (!center || !window.tileObjects) return null;
        if (window.campaign2WrenFreightArchiveHex) return window.campaign2WrenFreightArchiveHex;
        const candidates = [
            { q: center.q + 1, r: center.r + 1 },
            { q: center.q + 2, r: center.r + 1 },
            { q: center.q + 2, r: center.r - 1 },
            { q: center.q - 1, r: center.r + 1 },
        ];
        const chosen = candidates.find(hex => !window.tileObjects[`${hex.q},${hex.r}`]);
        if (!chosen) return null;
        window.tileObjects[`${chosen.q},${chosen.r}`] = { type: 'evidence', evidenceKey: 'wren_reddale_archive' };
        window.campaign2WrenFreightArchiveHex = chosen;
        return chosen;
    }

    function infiltrationSuccess() {
        const sub = questById(INFILTRATION_ID);
        if (sub) {
            sub.status = 'completed';
            sub.description = 'You recovered the old Reddale freight archive without relying on Ironbond’s cooperation.';
        }
        const companion = wren();
        const q = ensureQuest();
        if (!companion || !q) return;
        addClue('guild_archive', 'Stealth: Reddale guildhouse archive');
        window.showDialogue?.(companion,
            'Wren scans the stolen page twice. “Witness settlement. That’s what they called Mum and Dad.” Her thumb stops on the Silverhart reimbursement code. “And there. Somebody above Reddale paid them back for it.”',
            [{ label: 'We have our next lead.', action: () => {} }]
        );
    }

    function startInfiltration() {
        const q = ensureQuest();
        if (!q) return false;
        if (q.clues.guild_archive) {
            window.showMessage?.('You already have the Reddale archive evidence.');
            return false;
        }
        if (window.activeStealthMission && window.activeStealthMission.questId !== INFILTRATION_ID) {
            window.showMessage?.('Finish your current infiltration before starting another.');
            return false;
        }
        const evidenceHex = ensureArchiveEvidence();
        if (!evidenceHex || typeof window.startStealthMission !== 'function') {
            window.showMessage?.('The Reddale guildhouse archive is not accessible yet.');
            return false;
        }
        window.questLog = window.questLog || [];
        let sub = questById(INFILTRATION_ID);
        if (!sub) {
            sub = {
                id: INFILTRATION_ID,
                title: 'The Price of Silence: Private Records',
                giver: 'Wren Talbot',
                status: 'active',
                hidden: true,
                description: 'Enter the Reddale Ironbond guildhouse unseen and search the old private archive.'
            };
            window.questLog.push(sub);
        } else {
            sub.status = 'active';
        }
        window.startStealthMission({
            questId: INFILTRATION_ID,
            guardName: 'Guild Watchman Corley',
            evidenceKey: 'wren_reddale_archive',
            itemId: 'wren_reddale_archive_evidence',
            evidenceFlavor: 'an old Reddale freight ledger with Venn’s payment line',
            factionSpiedOn: 'ironbond_company',
            failStandingHit: -8,
            objectiveText: 'Search the Reddale Ironbond private archive without being seen.',
            onSuccess: infiltrationSuccess,
        });
        window.showMessage?.('Wren will wait outside while you search the Ironbond archive.');
        return true;
    }

    function syncExistingReddaleEvidence() {
        const q = quest();
        if (!q || q.status !== 'active') return false;
        let changed = false;
        const spyGuild = questById('spy_on_guild');
        const spyBaron = questById('spy_on_baron');
        const inventory = player()?.inventory || [];
        if (!q.clues.guild_archive && (spyGuild?.status === 'completed' || inventory.includes('guild_ledger_evidence'))) {
            changed = addClue('guild_archive', 'Ironbond ledgers already stolen for the Baron', { q }) || changed;
            if (changed) window.showMessage?.('Wren cross-references the Ironbond ledgers you already stole and finds Venn’s old reimbursement line.');
        }
        if (!q.clues.baron_tariff_roll && (spyBaron?.status === 'completed' || inventory.includes('baron_tariff_evidence'))) {
            changed = addClue('baron_tariff_roll', 'Baron tariff evidence already in your possession', { q }) || changed;
        }
        return changed;
    }

    function canResolve(q = quest()) {
        return !!q && q.status === 'active' && !!q.clues.guild_archive;
    }

    function outcomeSpec(outcome, companion) {
        const mercy = Number(companion?.characterArc?.mercy || 0);
        const loyalty = Number(companion?.characterArc?.personalLoyalty || 0);
        if (outcome === 'proof') {
            return {
                development: {
                    player: { personalLoyalty: -3, mercy: 4 },
                    wrenModel: { personalLoyalty: -3, mercy: 3 },
                    wrenImpact: { security: 4 },
                    reason: 'chose to follow the Silverhart evidence before taking revenge',
                },
                disposition: { approval: 2, trust: 5, reason: 'kept Wren focused on finding the person actually responsible' },
                affinity: { friendship: 4, romanticBond: 3, reason: 'stayed beside Wren while refusing to turn grief into a convenient target' },
            };
        }
        if (outcome === 'protect_petra') {
            return {
                development: {
                    player: { personalLoyalty: -2, mercy: 7 },
                    wrenModel: { personalLoyalty: -2, mercy: 6 },
                    wrenImpact: { security: 5 },
                    reason: 'protected a frightened witness instead of punishing the nearest Ironbond face',
                },
                disposition: { approval: mercy >= 15 ? 4 : 1, trust: 5, reason: 'distinguished the witness from the people who ordered the killing' },
                affinity: { friendship: 5, romanticBond: 3, reason: 'helped Wren seek justice without manufacturing another victim' },
            };
        }
        if (outcome === 'vengeance') {
            return {
                development: {
                    player: { personalLoyalty: 6, mercy: -9 },
                    wrenModel: { personalLoyalty: 5, mercy: -7 },
                    wrenImpact: { security: 1 },
                    reason: 'promised blood for whoever authorised the Talbots’ murder',
                },
                disposition: {
                    approval: mercy <= -15 || loyalty >= 35 ? 5 : mercy >= 25 ? -2 : 2,
                    trust: mercy >= 30 ? -1 : 2,
                    reason: 'made vengeance for Wren’s parents a personal promise'
                },
                affinity: { friendship: 2, attraction: 2, reason: 'answered Wren’s grief with fierce personal loyalty' },
            };
        }
        return {
            development: {
                player: { personalLoyalty: 4, mercy: -4 },
                wrenModel: { personalLoyalty: 3, mercy: -3 },
                wrenImpact: { security: -1 },
                reason: 'treated the evidence as leverage against Ironbond before pursuing the truth',
            },
            disposition: { approval: loyalty >= 30 ? 2 : -1, trust: -2, reason: 'put strategic leverage ahead of immediately following Wren’s family trail' },
            affinity: { friendship: -1, romanticBond: -1, reason: 'made Wren’s family evidence part of a political bargain' },
        };
    }

    function aftermathMode() {
        const companion = wren();
        if (!companion) return 'none';
        const conflict = window.companionRomance?.wrenConflictState?.();
        if (conflict?.active) return 'love_desire_conflict';
        const interpretation = window.companionRomance?.interpretRelationship?.(companion);
        if (interpretation?.mode === 'romantic') return 'romantic';
        if (interpretation?.mode === 'close_friend') return 'close_friend';
        if (interpretation?.mode === 'attracted' || interpretation?.attraction >= 40) return 'attracted';
        if (Number(interpretation?.romanticBond || 0) >= 35) return 'romantic_unresolved';
        if (Number(interpretation?.friendship || 0) >= 50) return 'friend';
        return 'reserved';
    }

    function showAftermath() {
        const companion = wren();
        if (!companion || typeof window.showDialogue !== 'function') return false;
        const mode = aftermathMode();
        const agreement = window.companionRomance?.ensureAgreement?.(companion);

        if (mode === 'love_desire_conflict') {
            window.showDialogue(companion,
                'Later, away from the guildhouse, Wren sits close enough that your shoulders touch. “You’ve been there for every ugly part of this. There’s something else I’ve been avoiding because I didn’t have words for it. I think I do now. Mostly.”',
                [
                    { label: '“Then tell me.”', action: () => window.companionRomance?.openWrenConflictConversation?.() },
                    { label: '“You don’t have to tonight.”', action: () => {
                        applyChoice('aftermath_give_space', {
                            disposition: { trust: 2, reason: 'gave Wren room to speak about love and desire in her own time' },
                            affinity: { friendship: 2, romanticBond: 1, reason: 'did not push Wren to resolve complicated feelings on demand' },
                        });
                    } },
                ]
            );
            return true;
        }

        if (mode === 'romantic') {
            if (agreement && ['dating', 'committed'].includes(agreement.state)) {
                window.showDialogue(companion,
                    'Wren catches your hand as you turn away. “Not solving anything else tonight. Just stay here a minute.” For once, she doesn’t make a joke out of needing you close.',
                    [{ label: 'Stay with her.', action: () => {} }]
                );
            } else {
                window.showDialogue(companion,
                    'Wren looks at you for a long moment. “You keep being the person I want beside me when things are worst. And I’m getting tired of pretending I don’t want you beside me when they aren’t.” She swallows. “Can I kiss you?”',
                    [
                        { label: '“Yes.”', action: () => {
                            window.companionAffinity?.setRomanceState?.(companion, 'mutual_interest', 'Wren and the player acknowledged mutual romantic interest after Reddale');
                            window.adjustCompanionAffinity?.(companion, { romanticBond: 4, attraction: 2 }, 'shared a first acknowledged romantic moment', 'wren_price:first_kiss');
                            window.showDialogue(companion, 'Wren smiles, nervous for perhaps the first time you have ever seen, and kisses you. When she draws back: “Right. Good. Definitely should have done that before investigating murder accounts.”', [{ label: 'Probably.', action: () => {} }]);
                        } },
                        { label: '“Not tonight.”', action: () => window.showDialogue(companion, 'Wren nods immediately. “Not tonight.” She stays beside you anyway.', [{ label: 'Stay a while.', action: () => {} }]) },
                    ]
                );
            }
            return true;
        }

        if (mode === 'attracted') {
            window.showDialogue(companion,
                'Wren exhales and bumps her shoulder against yours. “There is a thing between us. I’m not blind. But I’m not turning today into some stupid, desperate tumble just because I’m angry and you’re attractive. If it ever means something, I want it to mean something.”',
                [{ label: 'Fair.', action: () => {} }]
            );
            return true;
        }

        if (mode === 'close_friend' || mode === 'friend') {
            window.showDialogue(companion,
                'Wren is quiet, then leans into you for a brief, fierce hug. “You’re the person I wanted here for this. That’s all. Just… thanks for being here.”',
                [{ label: 'Always.', action: () => {} }]
            );
            return true;
        }

        if (mode === 'romantic_unresolved') {
            window.showDialogue(companion,
                'Wren starts to say something, stops, and gives you a crooked smile instead. “There are things I want to tell you when I’ve worked out whether they’re real or just today talking. Give me a little time.”',
                [{ label: 'Take it.', action: () => {} }]
            );
            return true;
        }

        window.showDialogue(companion,
            'Wren folds the copied ledger page carefully. “Thanks for helping me get this far. I need some quiet before we go chasing the next name.”',
            [{ label: 'I’ll give you space.', action: () => {} }]
        );
        return true;
    }

    function resolveChapter(outcome = 'proof') {
        const q = quest();
        const companion = wren();
        if (!q || !companion || !canResolve(q) || q.status === 'completed') return false;
        const specs = outcomeSpec(outcome, companion);
        applyChoice(`resolution_${outcome}`, specs);
        q.status = 'completed';
        q.stage = 'silverhart_lead';
        q.resolution = outcome;
        q.completedAt = Number(window.worldSeconds || 0);
        q.silverhartLead = 'Crown Transport Office — Central Discretion';
        q.description = 'The Reddale trail leads to Silverhart: a Crown Transport Office “Central Discretion” authorisation reimbursed Ironbond for Venn’s witness payment. Find who authorised it.';
        window.showMessage?.('Companion quest chapter complete: The Price of Silence. New lead: Silverhart.');
        window.gainExp?.(300);
        setTimeout(() => showAftermath(), 0);
        return true;
    }

    function openReckoning() {
        const companion = wren();
        const q = quest();
        if (!companion || !canResolve(q) || typeof window.showDialogue !== 'function') return false;
        window.showDialogue(companion,
            'Wren lays the copied ledger beside Venn’s old tally. The dates line up. So do the amounts. “Reddale paid him back for having my parents killed, then somebody in Silverhart paid Reddale back. Petra says the code belongs to the Crown Transport Office.” Her jaw tightens. “Tell me what we do with that.”',
            [
                { label: '“We find who authorised it. Evidence first, then judgement.”', action: () => resolveChapter('proof') },
                { label: '“Petra didn’t kill them. We protect her as a witness and take this to Silverhart.”', action: () => resolveChapter('protect_petra') },
                { label: '“We find whoever signed it, and they answer in blood.”', action: () => resolveChapter('vengeance') },
                { label: '“First we use this against Ironbond. Then we follow the Silverhart trail.”', action: () => resolveChapter('leverage') },
            ]
        );
        return true;
    }

    function openWrenHub(npc = wren()) {
        const q = ensureQuest();
        if (!npc || !q || typeof window.showDialogue !== 'function') return false;
        syncExistingReddaleEvidence();
        if (canResolve(q)) return openReckoning();
        const options = [
            { label: 'Review what we know.', action: () => window.showDialogue(npc, clueSummary(q), [{ label: 'Back.', action: () => openWrenHub(npc) }]) },
        ];
        if (hasStealthTraining() && !q.clues.guild_archive) {
            options.push({ label: '[Stealth] “We can get into the Ironbond archive ourselves.”', action: () => startInfiltration() });
        }
        options.push({ label: 'Keep asking around Reddale.', action: () => window.showMessage?.('Nella at the inn, Watchman Bram, Baron Aldervale and Guildmaster Petra Voss may each know part of the old freight trail.') });
        window.showDialogue(npc, '“Somebody in Reddale moved Venn’s money. We keep pulling until we know where the other end of the rope goes.”', options);
        return true;
    }

    function questMenu(npc, prompt, options, original) {
        const merged = [...options, { label: 'Other business.', action: () => original.call(window.npcDialogueTrees, npc) }];
        window.showDialogue(npc, prompt, merged);
        return true;
    }

    function installNpcWrapper(id, marker, builder) {
        const trees = window.npcDialogueTrees;
        const original = trees?.[id];
        if (typeof original !== 'function' || original[marker]) return false;
        const wrapped = function(npc) {
            const q = quest();
            if (!q || q.status !== 'active' || q.stage !== 'investigate_reddale') return original.call(this, npc);
            return builder(npc, original) || original.call(this, npc);
        };
        wrapped[marker] = true;
        wrapped.__previous = original;
        trees[id] = wrapped;
        return true;
    }

    function installNpcHooks() {
        installNpcWrapper('reddale_innkeeper', '__wrenPriceNella', (npc, original) => {
            const q = quest();
            const options = [];
            if (!q.clues.nella_drover) options.push({ label: 'Ask about Harl Venn’s old freight runs.', action: () => investigateNella(npc) });
            if (maxPartySkill('keen_perception') > 0 && !q.clues.routing_stencil) options.push({ label: '[Keen Perception] Examine the old freight markings around the inn.', action: () => inspectRoutingStencil(npc) });
            return options.length ? questMenu(npc, 'Nella lowers her voice when Wren mentions old Millbrook freight.', options, original) : false;
        });

        installNpcWrapper('reddale_guard', '__wrenPriceBram', (npc, original) => {
            const q = quest();
            const options = [];
            if (!q.clues.night_watch && (q.clues.nella_drover || q.clues.routing_stencil || npc.bribed)) {
                options.push({ label: 'Ask about the night watch when Venn’s wagons came through.', action: () => investigateBram(npc, 'ordinary') });
            }
            if (!q.clues.night_watch && maxPartySkill('persuasion') > 0) {
                options.push({ label: '[Persuasion] Press Bram about old orders protecting Ironbond wagons.', action: () => investigateBram(npc, 'persuasion') });
            }
            return options.length ? questMenu(npc, 'Bram looks uncomfortable when the conversation turns to old Ironbond traffic.', options, original) : false;
        });

        installNpcWrapper('reddale_baron', '__wrenPriceBaron', (npc, original) => {
            const q = quest();
            if (q.clues.baron_tariff_roll || evidenceCount(q) < 2) return false;
            return questMenu(npc, 'The Baron’s interest sharpens when he realises the question might embarrass Ironbond.', [
                { label: 'Ask to see the old tariff rolls for Venn’s Millbrook shipments.', action: () => inspectBaronRecords(npc) }
            ], original);
        });

        installNpcWrapper('reddale_guildmaster', '__wrenPricePetra', (npc, original) => {
            const q = quest();
            const options = [];
            if (maxPartySkill('insight') > 0 && !q.clues.petra_recognition) {
                options.push({ label: '[Insight] Mention “Central Discretion” and watch Petra’s reaction.', action: () => readPetra(npc) });
            }
            const ordinaryReady = !!q.clues.nella_drover && !!q.clues.night_watch && !!q.clues.baron_tariff_roll;
            if (!q.clues.guild_archive && ordinaryReady) {
                options.push({ label: 'Lay out the Reddale evidence and demand to see the old private ledger.', action: () => confrontPetra(npc, 'evidence') });
            }
            if (!q.clues.guild_archive && maxPartySkill('persuasion') > 0 && (q.clues.baron_tariff_roll || q.clues.petra_recognition || evidenceCount(q) >= 2)) {
                options.push({ label: '[Persuasion] Give Petra a chance to help expose the old cover-up.', action: () => confrontPetra(npc, 'persuasion') });
            }
            if (hasStealthTraining() && !q.clues.guild_archive) {
                options.push({ label: '[Stealth] Leave without showing Petra how much you know.', action: () => {
                    window.showMessage?.('Wren quietly suggests returning for the private archive without asking permission. Talk to Wren to plan the break-in.');
                } });
            }
            return options.length ? questMenu(npc, 'Petra Voss goes very still when Wren puts Venn’s old routing mark on her desk.', options, original) : false;
        });

        installNpcWrapper('companion_wren_talbot', '__wrenPriceWren', (npc, original) => {
            const q = quest();
            if (!q || q.status !== 'active') return false;
            return questMenu(npc, 'Wren has Venn’s copied figures folded into the back of her journal.', [
                { label: 'Talk about the Reddale trail.', action: () => openWrenHub(npc) }
            ], original);
        });
    }

    function refresh() {
        ensureArchiveEvidence();
        installNpcHooks();
        if (quest()?.status === 'active') syncExistingReddaleEvidence();
        maybeInitiateAtReddale();
    }

    window.wrenPriceOfSilence = {
        build: BUILD,
        questId: QUEST_ID,
        infiltrationQuestId: INFILTRATION_ID,
        clues: CLUES,
        canStart,
        ensureQuest,
        addClue,
        evidenceCount,
        clueSummary,
        introChoice,
        showIntro,
        nearReddale,
        maybeInitiateAtReddale,
        investigateNella,
        inspectRoutingStencil,
        investigateBram,
        inspectBaronRecords,
        readPetra,
        revealGuildArchive,
        confrontPetra,
        ensureArchiveEvidence,
        startInfiltration,
        syncExistingReddaleEvidence,
        canResolve,
        openReckoning,
        resolveChapter,
        aftermathMode,
        showAftermath,
        openWrenHub,
        refresh,
    };

    refresh();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh, { once: true });
    setInterval(refresh, 1000);
    window.WREN_PRICE_OF_SILENCE_BUILD = BUILD;
})();