// wrenCrownQuietHand.js
// Wren Talbot, Chapter 3: The Crown's Quiet Hand.
//
// The Price of Silence established that Harl Venn ordered the Talbots' murder,
// Reddale moved the money, and somebody in Silverhart reimbursed the payment
// under Crown Transport Office "Central Discretion". This chapter follows that
// exact paper trail. It does not rewrite the murderer: the capital's wrongdoing
// was knowingly burying the deaths afterwards to protect a politically fragile
// relief contract and the Crown/Ironbond relationship around it.
(() => {
    'use strict';

    const BUILD = '20260930-wren-crown-quiet-hand-v1';
    const QUEST_ID = 'wren_crown_quiet_hand';
    const PREVIOUS_ID = 'wren_price_of_silence';
    const WREN = 'Wren Talbot';
    const ARCHIVIST = 'Crown Archivist Merra Vale';
    const COMPTROLLER = 'Elspeth Vane';
    const ARCHIVIST_DIALOGUE = 'wren_crown_archivist';
    const COMPTROLLER_DIALOGUE = 'wren_former_comptroller';

    const CLUES = Object.freeze({
        office_index: {
            label: 'The Central Discretion index survives',
            text: 'The Crown Transport Office index lists Venn’s Millbrook file under “Relief Continuity — Central Discretion”. The underlying docket was sealed rather than destroyed.'
        },
        royal_access: {
            label: 'The Queen authorises the old docket to be opened',
            text: 'The current Crown grants access to the sealed transport docket. Whatever a previous administration hid, the present Queen will not keep it closed merely because it is embarrassing.'
        },
        signed_docket: {
            label: 'Elspeth Vane authorised the reimbursement',
            text: 'The sealed docket bears former Crown Transport Comptroller Elspeth Vane’s countersign authorising reimbursement of Ironbond’s “witness settlement” to Harl Venn.'
        },
        suppression_order: {
            label: 'The Crown office knew the witnesses were dead',
            text: 'A later memorandum notes that “the two Millbrook civilian witnesses are deceased” and orders the matter absorbed into relief-contract losses to avoid interruption of grain shipments. The office did not order the murders, but knowingly buried them afterwards.'
        },
        confession: {
            label: 'Elspeth Vane admits why she buried the truth',
            text: 'Vane admits she learned Venn’s witnesses had been killed and concealed the reimbursement. She says exposing it during the shortage would have collapsed the Crown/Ironbond relief contract and delayed grain shipments; she chose institutional continuity over justice for two murdered people.'
        },
    });

    let suppress = 0;
    const party = () => Array.isArray(window.party) ? window.party : [];
    const player = () => party()[0] || null;
    const wren = () => party().find((m, i) => i > 0 && m?.name === WREN) || null;
    const questById = id => (window.questLog || []).find(q => q?.id === id) || null;
    const quest = () => questById(QUEST_ID);
    const previous = () => questById(PREVIOUS_ID);
    const now = () => Number(window.worldSeconds || 0);
    const maxPartySkill = id => party().reduce((best, m) => Math.max(best, Number(m?.skills?.[id] || 0)), 0);

    function canStart() {
        const p = previous();
        return !!wren() && p?.status === 'completed' && p?.stage === 'silverhart_lead';
    }

    function withSuppressed(fn) {
        suppress++;
        try { return fn(); }
        finally { suppress--; }
    }

    function ensureQuest({ announce = true } = {}) {
        if (!canStart()) return null;
        window.questLog = window.questLog || [];
        let q = quest();
        if (!q) {
            q = {
                id: QUEST_ID,
                title: "The Crown's Quiet Hand",
                giver: WREN,
                status: 'active',
                stage: 'find_archive',
                resolution: null,
                description: 'Take the “Central Discretion” lead to Silverhart and find the Crown Transport Office record that reimbursed Ironbond for Venn’s witness payment.',
                clues: {},
                clueOrder: [],
                choiceKeys: [],
                offeredAt: now(),
            };
            window.questLog.push(q);
            if (announce) window.showMessage?.("Companion quest added: The Crown's Quiet Hand.");
        }
        q.clues = q.clues || {};
        q.clueOrder = q.clueOrder || [];
        q.choiceKeys = q.choiceKeys || [];
        return q;
    }

    function addClue(id, source = null, { quiet = false } = {}) {
        const q = ensureQuest({ announce: false });
        const spec = CLUES[id];
        if (!q || !spec || q.clues[id]) return false;
        q.clues[id] = { found: true, source, text: spec.text, at: now() };
        q.clueOrder.push(id);
        if (id === 'office_index') {
            q.stage = 'seek_access';
            q.description = 'The old transport docket still exists under seal. Ask the Silverhart Crown for access to the “Relief Continuity — Central Discretion” file.';
        } else if (id === 'royal_access') {
            q.stage = 'read_docket';
            q.description = 'The Queen has authorised the sealed transport docket to be opened. Return to Crown Archivist Merra Vale.';
        } else if (id === 'suppression_order') {
            q.stage = 'confront_vane';
            q.description = 'The docket proves Elspeth Vane reimbursed Venn’s payment and later buried the Talbots’ deaths. Confront the former Crown Transport Comptroller in Silverhart.';
        } else if (id === 'confession') {
            q.stage = 'reckoning';
            q.description = 'Elspeth Vane admits she knowingly buried the Talbots’ murder to protect the relief contract. Decide with Wren what justice should mean now.';
        }
        if (!quiet) window.showMessage?.(`Clue found: ${spec.label}.`);
        return true;
    }

    function applyChoice(key, { development = null, disposition = null, affinity = null } = {}) {
        const q = quest();
        const companion = wren();
        if (!q || !companion || !key || q.choiceKeys.includes(key)) return false;
        q.choiceKeys.push(key);
        if (development) window.wrenCharacterArc?.applyDevelopmentEvent?.(`crown_quiet_hand:${key}`, development, 'chapter3');
        if (disposition) window.noteWrenDispositionEvent?.(`crown_quiet_hand:${key}`, disposition);
        if (affinity) window.adjustCompanionAffinity?.(companion, affinity, affinity.reason || key, `wren_crown:${key}`);
        return true;
    }

    function showIntro() {
        const companion = wren();
        const q = ensureQuest();
        if (!companion || !q) return false;
        q.introSeen = true;
        withSuppressed(() => window.showDialogue?.(companion,
            'Wren unfolds the Reddale copy on a Silverhart bench and taps the reimbursement line. “Crown Transport Office. Central Discretion. Funny name for paying back the people who paid to have Mum and Dad killed.” She looks toward the civic quarter. “I know Venn ordered it. I know Ironbond moved the money. I want the name of the person here who decided two dead people were an accounting problem.”',
            [
                { label: '“Then we follow the record all the way to the person who signed it.”', action: () => applyChoice('intro_record', {
                    development: { player: { personalLoyalty: -2, mercy: 2 }, wrenModel: { personalLoyalty: -2, mercy: 2 }, wrenImpact: { security: 3 }, reason: 'promised to finish Wren’s family investigation through evidence rather than assumption' },
                    disposition: { approval: 2, trust: 4, familiarity: 2, reason: 'kept treating Wren’s parents as people whose truth mattered' },
                    affinity: { friendship: 3, romanticBond: 2, reason: 'committed to finishing the difficult part of Wren’s search beside her' },
                }) },
                { label: '“This time, you decide what we do when we find them.”', action: () => applyChoice('intro_agency', {
                    development: { player: { mercy: 3 }, wrenModel: { mercy: 2 }, wrenImpact: { security: 7 }, reason: 'gave Wren ownership of what justice for her parents would mean' },
                    disposition: { approval: 3, trust: 7, familiarity: 3, reason: 'refused to take control of Wren’s grief at the moment it reached the Crown' },
                    affinity: { friendship: 5, romanticBond: 2, reason: 'trusted Wren to make her own choice about her family' },
                }) },
            ]
        ));
        return true;
    }

    function openArchivist(npc) {
        const q = ensureQuest({ announce: false });
        if (!q) return false;
        if (!q.clues.office_index) {
            addClue('office_index', ARCHIVIST);
            withSuppressed(() => window.showDialogue?.(npc,
                'Merra runs a finger down a cracked index volume until she stops on a faded entry. “There. Relief Continuity, Millbrook district. Central Discretion.” Her expression changes. “The file was not destroyed. It was transferred to the sealed Crown series.”\n\nWren lets out a humourless laugh. “So somebody thought it worth hiding properly.”',
                [{ label: 'Who can open a sealed Crown file?', action: () => window.showDialogue?.(npc, '“The monarch, the Chancellor, or a court order. For a file this old, the Queen is the cleanest route. If she says open it, I open it.”', [{ label: 'Then we ask her.', action: () => {} }]) }]
            ));
            return true;
        }
        if (!q.clues.royal_access) {
            const options = [
                { label: 'We will bring you Crown authority.', action: () => {} },
            ];
            if (maxPartySkill('knowledge') > 0 || maxPartySkill('persuasion') > 0) {
                options.unshift({ label: '[Knowledge/Persuasion] At least tell us whether the seal was routine.', action: () => {
                    applyChoice('archivist_context', {
                        disposition: { trust: 1, familiarity: 1, reason: 'kept pressure on the bureaucracy without asking the archivist to destroy evidence' },
                    });
                    withSuppressed(() => window.showDialogue?.(npc, 'Merra lowers her voice. “No. Routine transport files were never sealed this way. Someone used a Crown-level discretion power, and somebody after them chose to preserve the file under seal rather than erase it. That usually means they expected a future audit.”', [{ label: 'Useful.', action: () => {} }]));
                } });
            }
            withSuppressed(() => window.showDialogue?.(npc, '“I can show you the index. I cannot break a Crown seal because you have a compelling story.” Merra sounds apologetic rather than evasive. “Bring authority and I will put the whole ugly thing on the table.”', options));
            return true;
        }
        if (!q.clues.suppression_order) {
            addClue('signed_docket', 'Crown Transport sealed docket', { quiet: true });
            addClue('suppression_order', 'Crown Transport sealed docket');
            withSuppressed(() => window.showDialogue?.(npc,
                'The seal breaks with less drama than Wren seems to expect. The first page is an authorisation signed by Elspeth Vane, then Crown Transport Comptroller: reimburse Ironbond’s “witness settlement” and keep the Millbrook relief route uninterrupted.\n\nThe second page is worse. Dated after Mara and Galen’s deaths: “Two civilian witnesses deceased. No further local inquiry. Absorb settlement into relief-contract losses. Disclosure risks suspension of grain carriage.”\n\nMerra goes pale. Wren does not. “She knew,” Wren says. “Maybe not before. But after. She knew exactly what Venn had bought, and she buried it.”',
                [{ label: 'Where is Elspeth Vane now?', action: () => window.showDialogue?.(npc, '“Retired. Wealthy quarter. She still advises three transport charities and complains about the stairs at court.” Merra closes the file carefully. “She is very much alive.”', [{ label: 'Then we talk to her.', action: () => {} }]) }]
            ));
            return true;
        }
        withSuppressed(() => window.showDialogue?.(npc, 'Merra keeps the docket open on the desk. “Vane’s countersign and suppression memorandum are both here. No interpretation needed.”', [{ label: 'We have what we need.', action: () => {} }]));
        return true;
    }

    function grantRoyalAccess(npc) {
        const q = ensureQuest({ announce: false });
        if (!q || q.clues.royal_access) return false;
        addClue('royal_access', npc?.name || 'Silverhart Crown');
        q.royalAccessGranted = true;
        withSuppressed(() => window.showDialogue?.(npc,
            'The Queen reads the copied Reddale line twice. “This predates my administration. That is not a reason to protect it.” She writes a short order and seals it. “Merra Vale is authorised to open the transport docket in your presence. If a Crown office helped bury murder, I would rather learn it from the record than from the next scandal.”',
            [{ label: 'Thank you, Your Majesty.', action: () => {} }]
        ));
        return true;
    }

    function confrontVane(npc) {
        const q = ensureQuest({ announce: false });
        if (!q?.clues?.suppression_order) return false;
        if (q.clues.confession) {
            withSuppressed(() => window.showDialogue?.(npc, 'Elspeth Vane looks older than she did before the confrontation. “I signed it. I buried it. Nothing I say now makes those verbs smaller.”', [{ label: 'No. It does not.', action: () => {} }]));
            return true;
        }
        const insight = maxPartySkill('insight') > 0;
        withSuppressed(() => window.showDialogue?.(npc,
            'Vane does not deny the signature. “There were shortages in four districts. Ironbond was threatening to suspend carriage while the Crown investigated missing grain. Then Venn’s message arrived: his witnesses were dead, the local matter contained, the route could continue if his settlement was honoured.”\n\nWren’s voice is flat. “My parents. You mean my parents.”\n\nVane closes her eyes. “Yes.”',
            [
                { label: '“You knew they had been murdered and you paid the bill anyway.”', action: () => {
                    addClue('confession', 'Elspeth Vane, confronted with the sealed docket');
                    withSuppressed(() => window.showDialogue?.(npc,
                        '“I knew after they were dead,” Vane says. “I did not order it. I did not know Venn would kill them. And when I learned what he had done, I chose not to stop the grain contract long enough to expose it. I told myself thousands of people needed those wagons more than two dead people needed justice.”\n\nWren stares at her. “Mum would have hated that argument.”\n\n“I know,” Vane says quietly.',
                        [{ label: insight ? '[Insight] She is not lying about when she learned.' : 'The distinction is clear.', action: () => {} }]
                    ));
                } },
                { label: '“Would you make the same choice now?”', action: () => {
                    addClue('confession', 'Elspeth Vane, asked to account for the decision');
                    applyChoice('vane_regret', {
                        development: { player: { mercy: 2 }, wrenModel: { mercy: 2 }, wrenImpact: { security: 2 }, reason: 'made the person who buried the Talbots’ deaths account for the choice rather than reducing her to a monster' },
                        disposition: { trust: 3, familiarity: 2, reason: 'helped Wren hear a confession without confusing explanation for excuse' },
                    });
                    withSuppressed(() => window.showDialogue?.(npc, 'Vane answers slowly. “No. Not because fewer people would be hungry. Because I spent twenty years learning that every institution has a sentence for making the person in front of you disappear into a larger number. Mine was continuity of supply.”', [{ label: 'Wren has heard enough.', action: () => {} }]));
                } },
            ]
        ));
        return true;
    }

    function wrenDecision() {
        const arc = wren()?.characterArc || {};
        const mercy = Number(arc.mercy || 0);
        const loyalty = Number(arc.personalLoyalty || 0);
        if (mercy >= 25) return 'restore_names';
        if (loyalty >= 45 && mercy < 0) return 'public_inquiry';
        return 'public_inquiry';
    }

    function outcomeSpec(outcome) {
        if (outcome === 'public_inquiry') return {
            development: { player: { personalLoyalty: -4, mercy: 4 }, wrenModel: { personalLoyalty: -4, mercy: 4 }, wrenImpact: { security: 8 }, reason: 'chose a public record and institutional accountability for the Talbots’ cover-up' },
            disposition: { approval: 5, trust: 9, familiarity: 5, reason: 'helped Wren make the Crown answer publicly without inventing guilt beyond the evidence' },
            affinity: { friendship: 6, romanticBond: 3, reason: 'stood beside Wren while the truth about her parents became part of the public record' },
        };
        if (outcome === 'restore_names') return {
            development: { player: { personalLoyalty: -2, mercy: 8 }, wrenModel: { personalLoyalty: -2, mercy: 7 }, wrenImpact: { security: 9 }, reason: 'put the Talbots’ names and a sworn confession ahead of maximum punishment' },
            disposition: { approval: 6, trust: 10, familiarity: 5, reason: 'secured an official truth for Wren without making punishment the only measure of justice' },
            affinity: { friendship: 7, romanticBond: 3, reason: 'helped Wren reclaim her parents’ story instead of letting the cover-up define it' },
        };
        if (outcome === 'wren_decides') return {
            development: { player: { mercy: 3 }, wrenModel: {}, wrenImpact: { security: 11 }, reason: 'trusted Wren to choose what justice for her parents meant once she finally had the truth' },
            disposition: { approval: 7, trust: 12, familiarity: 6, reason: 'gave Wren real agency at the end of a search that began with other people deciding what she was allowed to know' },
            affinity: { friendship: 8, romanticBond: 4, reason: 'trusted Wren with the final choice instead of taking ownership of her grief' },
        };
        return {
            development: { player: { personalLoyalty: 2, mercy: -3 }, wrenModel: { personalLoyalty: 2, mercy: -2 }, wrenImpact: { security: -8 }, reason: 'accepted institutional stability as a reason to keep the Talbots’ cover-up out of the record' },
            disposition: { approval: -12, trust: -14, familiarity: 4, reason: 'asked Wren to accept the same logic that erased her parents in the first place' },
            affinity: { friendship: -8, romanticBond: -6, reason: 'put the Crown’s comfort ahead of the truth Wren spent years trying to recover' },
        };
    }

    function completeQuest(outcome) {
        const q = quest();
        const companion = wren();
        if (!q || !companion || q.status === 'completed' || !q.clues?.confession) return false;
        let effective = outcome;
        if (outcome === 'wren_decides') {
            effective = wrenDecision();
            q.wrenDecision = effective;
        }
        const spec = outcomeSpec(outcome);
        applyChoice(`resolution_${outcome}`, spec);
        q.status = 'completed';
        q.resolution = outcome;
        q.effectiveResolution = effective;
        q.completedAt = now();
        q.parentsOfficiallyRestored = outcome !== 'bury_for_stability';
        window.wrenTalbotNamesRestored = q.parentsOfficiallyRestored;

        if (effective === 'public_inquiry') {
            q.publicInquiry = true;
            window.crownTransportScandalExposed = true;
            window.adjustReputation?.(window.factions?.silverhart_kingdom, 3, 6);
            q.description = 'The Crown opens a formal inquiry into the old Transport Office cover-up. Mara and Galen Talbot are restored to the record as murdered witnesses, not missing travellers.';
        } else if (effective === 'restore_names') {
            q.swornConfession = true;
            q.description = 'Elspeth Vane gives a sworn confession and the Crown corrects the Talbots’ record. Wren chose truth and restoration without demanding the harshest possible punishment.';
        } else {
            q.coverupContinues = true;
            q.description = 'You chose not to expose the old Crown Transport cover-up. Wren finally knows what happened, but the official record remains a lie.';
        }

        window.gainExp?.(350);
        window.showMessage?.("Companion quest complete: The Crown's Quiet Hand.");
        setTimeout(showAftermath, 0);
        return true;
    }

    function openReckoning() {
        const companion = wren();
        const q = quest();
        if (!companion || !q?.clues?.confession) return false;
        withSuppressed(() => window.showDialogue?.(companion,
            'Outside Vane’s house, Wren finally looks shaken. “So that’s it. Venn killed them because they caught him. Ironbond carried the payment. Vane found out after and decided hungry strangers mattered more than two murdered witnesses.” She rubs both hands over her face. “I thought finding the last name would make this simple.”',
            [
                { label: '“We put everything before the Queen and ask for a public inquiry.”', action: () => completeQuest('public_inquiry') },
                { label: '“Make Vane swear the truth into the record. Restore your parents’ names. Punishment does not have to be the only point.”', action: () => completeQuest('restore_names') },
                { label: '“This is your family. You decide, and I will stand beside the choice.”', action: () => completeQuest('wren_decides') },
                { label: '“Exposing this now could damage relief work that has nothing to do with Vane. We know the truth; we can leave the institution intact.”', action: () => completeQuest('bury_for_stability') },
            ]
        ));
        return true;
    }

    function showAftermath() {
        const companion = wren();
        if (!companion) return false;
        const arc = companion.characterArc || {};
        const secure = Number(arc.security || 0) >= 15;
        const rel = window.companionRomance?.interpretRelationship?.(companion);
        const romantic = rel?.mode === 'romantic' || Number(rel?.romanticBond || 0) >= 45;
        const opening = 'Later, Wren turns Mara and Galen’s corrected record over in her hands. “They didn’t leave me.” She says it carefully, as if testing every word. “I know that sounds obvious now. But I spent years treating being left and having someone taken from you like they were the same thing. Like if I held on hard enough, I could stop either one happening.”';
        let ending;
        if (romantic && secure) {
            ending = ' She looks at you. “If I ever ask you to stay, I want it to be because we both choose it. Not because leaving would make you them, and not because staying proves you love me.”';
        } else if (romantic) {
            ending = ' Her fingers find yours. “I know loving somebody is not a contract against losing them. Knowing it and feeling it are apparently two different bloody skills. I’m working on the second one.”';
        } else if (secure) {
            ending = ' She gives a small, tired smile. “People can leave and still have loved you. People can stay and still fail you. I think I’m finally allowed to judge the actual thing instead of the fear underneath it.”';
        } else {
            ending = ' She exhales. “I know what happened now. I’m not promising that fixes every stupid thing I learned from not knowing. But at least I’m arguing with the truth instead of a ghost.”';
        }
        withSuppressed(() => window.showDialogue?.(companion, opening + ending, [{ label: 'Stay with her a while.', action: () => {} }]));
        return true;
    }

    function openWrenHub(npc = wren()) {
        const q = ensureQuest({ announce: false });
        if (!npc || !q) return false;
        if (!q.introSeen) return showIntro();
        if (q.stage === 'reckoning') return openReckoning();
        const directions = {
            find_archive: 'The Crown Transport records should be in Silverhart’s civic quarter. Find Crown Archivist Merra Vale.',
            seek_access: 'The sealed docket needs Crown authority. Ask the Queen to open the old “Relief Continuity — Central Discretion” file.',
            read_docket: 'Return to Crown Archivist Merra Vale with the Queen’s authority.',
            confront_vane: 'The docket names former Comptroller Elspeth Vane. She lives in Silverhart’s wealthy quarter.',
        };
        withSuppressed(() => window.showDialogue?.(npc,
            directions[q.stage] || q.description,
            [{ label: 'Review the evidence.', action: () => window.showDialogue?.(npc, (q.clueOrder || []).map(id => `• ${CLUES[id]?.label || id}`).join('\n') || 'No new evidence yet.', [{ label: 'Back.', action: () => openWrenHub(npc) }]) }]
        ));
        return true;
    }

    function openHexNear(center, offset = { q: 0, r: 0 }) {
        if (!center) return null;
        const start = { q: Math.round(center.q + offset.q), r: Math.round(center.r + offset.r) };
        const queue = [start];
        const seen = new Set();
        while (queue.length && seen.size < 80) {
            const h = queue.shift();
            const key = `${h.q},${h.r}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const terrain = window.getTerrainAt?.(h.q, h.r)?.name;
            const occupied = (window.entities || []).some(e => e?.alive && e.hex?.q === h.q && e.hex?.r === h.r);
            if (!occupied && !['Wall','Water','Palisade Wall','Keep Wall','Stone Wall'].includes(terrain)) return h;
            queue.push(...(window.getNeighbors?.(h.q, h.r) || []));
        }
        return start;
    }

    function spawnNamed(name, dialogueId, center, offset, gender, colour) {
        if (!center || typeof window.Entity !== 'function') return null;
        const existing = (window.entities || []).find(e => e?.name === name);
        if (existing) return existing;
        const hex = openHexNear(center, offset);
        if (!hex) return null;
        const e = new window.Entity(name, colour, hex, 10);
        e.side = 'neutral';
        e.isNPC = true;
        e.race = 'human';
        e.gender = gender;
        e.dialogueId = dialogueId;
        e.noAttack = true;
        e.tags = ['humanoid', 'silverhart', 'quest_npc'];
        e.visualQ = e.startQ = hex.q;
        e.visualR = e.startR = hex.r;
        window.entities.push(e);
        return e;
    }

    function ensureQuestNpcs() {
        const q = quest();
        if (!q || q.status !== 'active') return false;
        const palace = window.campaign2PalaceThroneCenter || window.campaign2SilverhartCenter;
        const civic = window.campaign2CivicQuarterCenter || (palace ? { q: palace.q + 10, r: palace.r - 40 } : null);
        const wealthy = window.campaign2WealthyQuarterCenter || (palace ? { q: palace.q + 38, r: palace.r - 14 } : null);
        spawnNamed(ARCHIVIST, ARCHIVIST_DIALOGUE, civic, { q: 2, r: 1 }, 'female', '#6a6577');
        spawnNamed(COMPTROLLER, COMPTROLLER_DIALOGUE, wealthy, { q: -2, r: 2 }, 'female', '#7a6a5d');
        return true;
    }

    function questMenu(npc, prompt, questOptions, original) {
        withSuppressed(() => window.showDialogue?.(npc, prompt, [
            ...questOptions,
            { label: 'Other business.', action: () => original.call(window.npcDialogueTrees, npc) },
        ]));
        return true;
    }

    function installWrenHook() {
        const trees = window.npcDialogueTrees;
        const original = trees?.companion_wren_talbot;
        if (typeof original !== 'function' || original.__wrenCrownQuietHandAware) return false;
        const wrapped = function(npc) {
            if (!canStart()) return original.call(this, npc);
            const q = quest();
            if (q?.status === 'completed') return original.call(this, npc);
            return questMenu(npc, q ? 'Wren keeps the Silverhart transport references tucked into her journal.' : 'Wren has not forgotten the Silverhart name at the end of the Reddale ledger.', [
                { label: q ? 'Talk about the Crown Transport trail.' : '“We’re in Silverhart. Let’s follow the Central Discretion lead.”', action: () => {
                    ensureQuest();
                    openWrenHub(npc);
                } },
            ], original);
        };
        wrapped.__wrenCrownQuietHandAware = true;
        wrapped.__previous = original;
        trees.companion_wren_talbot = wrapped;
        return true;
    }

    function installQueenHook() {
        const trees = window.npcDialogueTrees;
        const original = trees?.silverhart_queen;
        if (typeof original !== 'function' || original.__wrenCrownQuietHandAware) return false;
        const wrapped = function(npc) {
            const q = quest();
            if (!q || q.status !== 'active' || q.stage !== 'seek_access' || q.clues?.royal_access) return original.call(this, npc);
            return questMenu(npc, 'The Queen’s attention sharpens when Wren lays the old Crown Transport reference before her.', [
                { label: 'Ask her to open the sealed “Relief Continuity — Central Discretion” docket.', action: () => grantRoyalAccess(npc) },
            ], original);
        };
        wrapped.__wrenCrownQuietHandAware = true;
        wrapped.__previous = original;
        trees.silverhart_queen = wrapped;
        return true;
    }

    function installQuestNpcTrees() {
        window.npcDialogueTrees = window.npcDialogueTrees || {};
        window.npcDialogueTrees[ARCHIVIST_DIALOGUE] = npc => openArchivist(npc);
        window.npcDialogueTrees[COMPTROLLER_DIALOGUE] = npc => confrontVane(npc);
    }

    function refresh() {
        if (!window.npcDialogueTrees) return false;
        installQuestNpcTrees();
        installWrenHook();
        installQueenHook();
        ensureQuestNpcs();
        return true;
    }

    window.wrenCrownQuietHand = {
        build: BUILD,
        questId: QUEST_ID,
        clues: CLUES,
        canStart,
        ensureQuest,
        addClue,
        showIntro,
        openArchivist,
        grantRoyalAccess,
        confrontVane,
        openReckoning,
        completeQuest,
        showAftermath,
        openWrenHub,
        ensureQuestNpcs,
        refresh,
    };

    refresh();
    if (typeof document !== 'undefined' && document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh, { once: true });
    if (typeof document !== 'undefined') setInterval(refresh, 1500);
    window.WREN_CROWN_QUIET_HAND_BUILD = BUILD;
})();
