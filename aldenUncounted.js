// aldenUncounted.js
// Brother Alden's first post-recruitment companion quest.
//
// After surviving Northwatch, Alden realises that several people he helped carry
// from the wall never became people in the official memorial at all: civilian
// auxiliaries were reduced to a count, unknown dead were grouped together, and
// one body listed for transfer to Silverhart never reached the Grand Cathedral.
// The quest asks whether monastic detachment means names and particular bonds are
// unimportant, or whether refusing to reduce people to categories is itself a
// form of compassion. It also leaves a clean breadcrumb into the necromancer arc.
(() => {
    'use strict';

    const BUILD = '20260930-alden-uncounted-v1';
    const ALDEN_NAME = 'Brother Alden';
    const QUEST_ID = 'alden_uncounted';
    const PERSONAL_DIALOGUE_ID = 'companion_brother_alden';

    const CLUES = Object.freeze({
        alden_memory: Object.freeze({
            label: 'Alden remembers six dead who never appeared on the memorial',
            text: 'Alden helped carry six bodies from the Northwatch breach that were not named on the garrison memorial: civilian auxiliaries and people whose identity tokens were missing.'
        }),
        garrison_roll: Object.freeze({
            label: 'Northwatch counted only sworn garrison in its public memorial',
            text: 'Commander Hart confirms that the formal memorial was built from the military roll. Six non-garrison dead were recorded separately as auxiliaries or unknowns and sent onward for burial.'
        }),
        quartermaster_names: Object.freeze({
            label: 'The quartermaster can restore three auxiliary names',
            text: 'Rurik Voss identifies three of the six from ration and equipment chits: Maelin Tor, Joss Harrow and Pera Wint. They fought and died at Northwatch without ever being entered on the soldier roll.'
        }),
        cathedral_receipt: Object.freeze({
            label: 'Only five of the six uncounted bodies reached Silverhart',
            text: 'The Grand Cathedral burial register expected six unclaimed Northwatch dead but records only five received. The road-transfer note for the sixth was closed administratively without a body ever reaching the cathedral.'
        }),
        necromancy_parallel: Object.freeze({
            label: 'The missing body resembles other disappearances around the necromancer investigation',
            text: 'Once the Vessel-Seeker investigation is considered alongside the burial register, the missing Northwatch body stops looking like mere wartime confusion. Recent reports of disturbed graves and missing remains make deliberate corpse-taking plausible.'
        }),
    });

    const party = () => Array.isArray(window.party) ? window.party : [];
    const alden = () => party().find((member, index) => index > 0 && member?.name === ALDEN_NAME) || null;
    const quest = () => (window.questLog || []).find(entry => entry?.id === QUEST_ID) || null;
    const namedQuest = id => (window.questLog || []).find(entry => entry?.id === id) || null;

    function clampAxis(value) {
        const n = Number(value);
        return Math.max(-100, Math.min(100, Number.isFinite(n) ? Math.round(n) : 0));
    }

    function relationshipReady() {
        return typeof window.getCompanionRelationship === 'function' &&
            typeof window.setCompanionRelationship === 'function' &&
            typeof window.adjustCompanionRelationship === 'function';
    }

    function ensureAldenStart() {
        const companion = alden();
        if (!companion) return false;
        companion.companionRelationshipStart = {
            ...(companion.companionRelationshipStart || {}),
            familiarity: 18,
            trust: 28,
            approval: 58,
        };
        if (!relationshipReady()) return false;
        const current = companion.playerRelationship;
        const history = Array.isArray(current?.history) ? current.history : [];
        const untouchedGeneric = !current || (
            Number(current.familiarity ?? 10) === 10 &&
            Number(current.trust ?? 10) === 10 &&
            history.length === 0
        );
        if (untouchedGeneric) {
            window.setCompanionRelationship(companion, {
                familiarity: 18,
                trust: 28,
                ...(window.companionAttitude?.[ALDEN_NAME] === undefined ? { approval: 58 } : {}),
            }, 'authored_start:alden_northwatch_survivor');
        } else {
            window.getCompanionRelationship(companion);
        }
        return true;
    }

    function ensureArc() {
        const companion = alden();
        if (!companion) return null;
        const existing = companion.aldenCharacterArc || {};
        companion.aldenCharacterArc = {
            // Negative = contemplative distance / minimise worldly entanglement.
            // Positive = active compassionate engagement even when it creates pain.
            engagement: clampAxis(existing.engagement ?? -20),
            // Negative = universalist abstraction: names/status/bonds are secondary.
            // Positive = particular people, names and chosen bonds matter in themselves.
            particularity: clampAxis(existing.particularity ?? -25),
            knownEventKeys: Array.isArray(existing.knownEventKeys) ? existing.knownEventKeys : [],
            dialogueChoiceKeys: Array.isArray(existing.dialogueChoiceKeys) ? existing.dialogueChoiceKeys : [],
            history: Array.isArray(existing.history) ? existing.history : [],
        };
        return companion.aldenCharacterArc;
    }

    function getArcState() {
        const arc = ensureArc();
        if (!arc) return null;
        let engagement = 'contemplative';
        if (arc.engagement >= 40) engagement = 'actively_engaged';
        else if (arc.engagement >= 10) engagement = 'engaged';
        else if (arc.engagement <= -45) engagement = 'withdrawn';

        let particularity = 'universalist';
        if (arc.particularity >= 40) particularity = 'people_as_particular';
        else if (arc.particularity >= 10) particularity = 'names_matter';
        else if (arc.particularity <= -45) particularity = 'radically_detached';
        return {
            engagement: arc.engagement,
            particularity: arc.particularity,
            engagementState: engagement,
            particularityState: particularity,
        };
    }

    function applyArcChange(key, delta = {}, reason = null) {
        const arc = ensureArc();
        if (!arc || !key) return null;
        const stableKey = String(key);
        if (arc.knownEventKeys.includes(stableKey)) return getArcState();
        arc.knownEventKeys.push(stableKey);
        if (arc.knownEventKeys.length > 100) arc.knownEventKeys.splice(0, arc.knownEventKeys.length - 100);
        arc.engagement = clampAxis(arc.engagement + Number(delta.engagement || 0));
        arc.particularity = clampAxis(arc.particularity + Number(delta.particularity || 0));
        arc.history.push({
            key: stableKey,
            reason: reason || stableKey,
            worldSeconds: Number(window.worldSeconds || 0),
            engagement: arc.engagement,
            particularity: arc.particularity,
        });
        if (arc.history.length > 80) arc.history.splice(0, arc.history.length - 80);
        return getArcState();
    }

    function hasReligionTraining() {
        return party().some(member => Number(member?.skills?.knowledge_religion || 0) > 0 || Number(member?.skills?.divine || 0) > 1);
    }

    function hasNecromancyContext() {
        return !!(
            namedQuest('necromancer_hunt') || namedQuest('necromancer_lichdom') ||
            window.discipleSuspected || window.phylacteryReturned || window.mirabelEchoTechniqueLearned ||
            window.player?.inventory?.includes?.('phylactery_shard')
        );
    }

    function ensureQuest() {
        window.questLog = window.questLog || [];
        let q = quest();
        if (!q) {
            q = {
                id: QUEST_ID,
                title: 'The Uncounted',
                giver: ALDEN_NAME,
                status: 'active',
                resolution: null,
                description: 'Compare Alden’s memory of the Northwatch dead with the garrison and cathedral records, and find out why some people never became names on the memorial.',
                clues: {},
                clueOrder: [],
                offeredAt: Number(window.worldSeconds || 0),
            };
            window.questLog.push(q);
            window.showMessage?.('Companion quest added: The Uncounted.');
        }
        q.clues = q.clues || {};
        q.clueOrder = q.clueOrder || [];
        return q;
    }

    function addClue(id, source = null) {
        const spec = CLUES[id];
        if (!spec) return false;
        const q = ensureQuest();
        if (q.clues[id]) return false;
        q.clues[id] = { found: true, source, text: spec.text, at: Number(window.worldSeconds || 0) };
        q.clueOrder.push(id);
        q.description = canResolve(q)
            ? 'You know how Northwatch’s uncounted dead fell out of the official story, and that one body never reached Silverhart. Talk to Alden about what should be done.'
            : 'Compare Northwatch’s military, supply and cathedral burial records with Alden’s memory of the dead.';
        window.showMessage?.(`Clue found: ${spec.label}.`);
        return true;
    }

    function canResolve(q = quest()) {
        return !!(q && q.status === 'active' && q.clues?.garrison_roll && q.clues?.quartermaster_names && q.clues?.cathedral_receipt);
    }

    function startQuest() {
        const companion = alden();
        if (!companion) return false;
        ensureAldenStart();
        ensureArc();
        const q = ensureQuest();
        if (!q.clues.alden_memory) {
            addClue('alden_memory', 'Alden’s memory of the Northwatch breach');
            window.noteCompanionConversation?.(companion, 'alden:uncounted_opened', 3);
        }
        return q;
    }

    function showQuestOpening() {
        const companion = alden();
        if (!companion || typeof window.showDialogue !== 'function') return false;
        startQuest();
        window.showDialogue(companion,
            'Alden is quiet for long enough that the silence becomes deliberate. “After Northwatch, I helped carry the dead from the breach. I remember six who had no place on the garrison roll. A carter. Two hired trackers. Three I could not name.”\n\nHe looks at his hands. “The memorial names only soldiers. I told myself a name is a worldly thing and the dead are beyond it. I am no longer certain whether that was wisdom or convenience.”',
            [
                { label: '“Then let’s find out who was left out.”', action: () => {} },
                { label: '“The dead may not care, but the living might.”', action: () => {} },
            ]
        );
        return true;
    }

    function investigateCommander(npc = null) {
        const q = ensureQuest();
        if (!q.clues.garrison_roll) addClue('garrison_roll', npc?.name || 'Commander Hart’s casualty roll');
        window.showDialogue?.(npc || alden(),
            'Commander Hart does not evade the question. “The memorial is the sworn garrison roll. That is what the army can certify. Six more died inside our lines, but they were hired hands, carters or simply unknown. I put them on the transfer sheet. I did not invent names I could not prove.”',
            [{ label: '“Where did the transfer sheet go?”', action: () => {} }]
        );
        return q;
    }

    function investigateQuartermaster(npc = null) {
        const q = ensureQuest();
        if (!q.clues.quartermaster_names) addClue('quartermaster_names', npc?.name || 'Rurik Voss’s issue ledger');
        window.showDialogue?.(npc || alden(),
            'Rurik works backward through ration chits, arrow bundles and a mule-hire mark. “Maelin Tor. Joss Harrow. Pera Wint. None were enlisted, all three drew supplies from us that week.” He taps the page. “If they died on that wall, write them down as people, not inventory loss.”',
            [{ label: '“That gives us three names.”', action: () => {} }]
        );
        return q;
    }

    function investigateCathedral(npc = null) {
        const q = ensureQuest();
        if (!q.clues.cathedral_receipt) {
            addClue('cathedral_receipt', npc?.name || 'Grand Cathedral burial register');
            window.aldenMissingNorthwatchBody = true;
        }
        if (hasNecromancyContext() && !q.clues.necromancy_parallel) {
            addClue('necromancy_parallel', 'Northwatch transfer register compared with the necromancer investigation');
            q.necromancerLinked = true;
            window.aldenNecromancerBodyTrail = true;
        }
        const extra = q.clues.necromancy_parallel
            ? ' Adelram’s expression hardens when the recent grave disturbances are mentioned. “Then I would no longer call the missing body a clerical error.”'
            : '';
        window.showDialogue?.(npc || alden(),
            `High Cleric Adelram finds the winter burial folio. “Six unclaimed dead were expected from Northwatch. Five arrived.” One line is marked closed after a road clerk reported the sixth transfer missing. “No name, no family inquiry, and the war was still burning. It was treated as transport confusion.”${extra}`,
            [{ label: '“One person became easy to lose because nobody knew who they were.”', action: () => {} }]
        );
        return q;
    }

    function syncNecromancyParallel() {
        const q = quest();
        if (!q || q.status === 'completed' || !q.clues?.cathedral_receipt || q.clues?.necromancy_parallel || !hasNecromancyContext()) return false;
        addClue('necromancy_parallel', 'later comparison with the Vessel-Seeker investigation');
        q.necromancerLinked = true;
        window.aldenNecromancerBodyTrail = true;
        return true;
    }

    function companionViewLines() {
        const lines = [];
        const wren = party().find(p => p?.name === 'Wren Talbot');
        if (wren) {
            const parents = namedQuest('wren_parents');
            lines.push({ name: 'Wren Talbot', text: parents?.resolution === 'restore_names'
                ? 'Wren’s voice is flat. “I had to dig through half a village to get my parents’ names put back where they belonged. Do not tell me a name is just ink. ‘Unknown’ is how people become easy to stop caring about.”'
                : 'Wren folds her arms. “Maybe the dead do not care about names. The people who loved them do. And if nobody loved them, that seems like more reason to make sure somebody remembers they existed.”' });
        }
        const aldric = party().find(p => p?.name === 'Ser Aldric Thorne');
        if (aldric) {
            const broken = namedQuest('aldric_broken_vigil');
            lines.push({ name: 'Ser Aldric Thorne', text: broken?.resolution === 'spare_patrol'
                ? 'Aldric nods toward the ledger. “A uniform is not a person and neither is the absence of one. I learned that late. Put the names back, and keep the record of who decided they did not count.”'
                : 'Aldric’s answer is immediate. “If six people held the line, the record should say six people held the line. Institutions become very good at forgetting whoever does not fit their form.”' });
        }
        const mirabel = party().find(p => p?.name === 'Mirabel Quill');
        if (mirabel) {
            const mq = namedQuest('mirabel_unquiet_concordance');
            lines.push({ name: 'Mirabel Quill', text: mq?.status === 'completed'
                ? 'Mirabel turns a page of the burial book. “The Concordance taught me that memory is not a soul. Fine. But records are how the living distinguish a person from raw material. Given what we have seen of necromancers, I suddenly care rather a lot about that distinction.”'
                : 'Mirabel taps the blank beside one transfer mark. “Names are metadata, not souls. Metadata is still how you notice when one human body quietly disappears from a system.”' });
        }
        const fenn = party().find(p => p?.name === 'Fenn Oakheart');
        if (fenn) {
            lines.push({ name: 'Fenn Oakheart', text: 'Fenn considers it. “The dead do not need a stone to know who they were. The living might. Give the bodies decent rites either way; give the names back where you can. Those are different jobs.”' });
        }
        const reyna = party().find(p => p?.name === 'Reyna Fletcher');
        if (reyna) {
            const rq = namedQuest('reyna_empty_blind');
            lines.push({ name: 'Reyna Fletcher', text: rq?.resolution === 'witness_deal'
                ? 'Reyna frowns at the ledger. “If a system only helps people it has already named correctly, it is not much of a safety net. Fix the record and make someone own the missing transfer.”'
                : 'Reyna shrugs once. “Lists are dull right up until you need to prove someone was there. I would rather have too many names written down than one person vanish because nobody bothered.”' });
        }
        return lines;
    }

    function showCompanionCounsel() {
        const lines = companionViewLines();
        if (!lines.length || typeof window.showDialogue !== 'function') return false;
        const companion = alden();
        const options = lines.map(line => ({
            label: `Hear ${line.name === 'Ser Aldric Thorne' ? 'Aldric' : line.name.split(' ')[0]}.`,
            action: () => window.showDialogue(party().find(p => p?.name === line.name) || { name: line.name }, line.text, [
                { label: 'Back to Alden.', action: () => showCompanionCounsel() }
            ])
        }));
        options.push({ label: 'Enough. I have heard them.', action: () => {} });
        window.showDialogue(companion, 'Alden looks around the group. “I have spent too much of this question inside my own head. What do the rest of you think?”', options);
        return true;
    }

    function outcomeSpec(resolution) {
        if (resolution === 'restore_names') return {
            relationship: { approval: 10, trust: 12, familiarity: 5 },
            affinity: { friendship: 7, romanticBond: 3 },
            arc: { engagement: 16, particularity: 18 },
            line: 'Alden writes the three restored names slowly, then leaves three separate blank lines beneath them rather than one line reading “unknown”. “A universal compassion that cannot make room for particular people is only tidy thinking,” he says. “I think I have been too fond of tidy thinking.”',
        };
        if (resolution === 'quiet_memorial') return {
            relationship: { approval: 7, trust: 9, familiarity: 5 },
            affinity: { friendship: 6, romanticBond: 2 },
            arc: { engagement: 10, particularity: 12 },
            line: 'Alden copies the names into his own book and asks Adelram to keep six candles rather than one collective entry. “Not everything needs a proclamation,” he says. “But quiet is not the same as forgetting.”',
        };
        if (resolution === 'hunt_missing') return {
            relationship: { approval: 5, trust: 8, familiarity: 4 },
            affinity: { friendship: 4, romanticBond: 1 },
            arc: { engagement: 13, particularity: -5 },
            line: 'Alden closes the memorial book and keeps the transfer slip. “Then the living danger comes first. One body went missing; if someone is collecting the dead, we find out why. We can argue about monuments after we stop them making more.”',
        };
        return {
            relationship: { approval: 2, trust: 5, familiarity: 4 },
            affinity: { friendship: 3 },
            arc: { engagement: 2, particularity: -16 },
            line: 'Alden bows his head. “Names are for the living. Rites are for acknowledging that a life ended, named or not.” He does not sound entirely convinced, but neither does he sound ashamed. “We report the missing transfer. We do not pretend a carved stone can repair every absence.”',
        };
    }

    function completeQuest(resolution) {
        const companion = alden();
        const q = quest();
        if (!companion || !q || q.status === 'completed' || !canResolve(q)) return false;
        if (!['restore_names', 'quiet_memorial', 'hunt_missing', 'rites_over_names'].includes(resolution)) return false;
        const spec = outcomeSpec(resolution);
        q.status = 'completed';
        q.resolution = resolution;
        q.completedAt = Number(window.worldSeconds || 0);
        q.namesRestored = resolution === 'restore_names' || resolution === 'quiet_memorial';
        q.missingTransferReported = true;
        q.corpseTrailPrioritised = resolution === 'hunt_missing';
        window.aldenUncountedOutcome = resolution;
        if (resolution === 'hunt_missing') window.aldenNecromancerBodyTrail = true;

        window.adjustCompanionRelationship?.(companion, spec.relationship, `alden_uncounted:${resolution}`);
        window.adjustCompanionAffinity?.(companion, spec.affinity, `resolved The Uncounted: ${resolution}`, `alden_uncounted:${resolution}`);
        applyArcChange(`uncounted:${resolution}`, spec.arc, `resolved The Uncounted: ${resolution}`);

        window.showDialogue?.(companion, spec.line, [
            { label: '“And what does that mean for you?”', action: () => showAftermath() },
            { label: 'Leave it there.', action: () => {} },
        ]);
        window.showMessage?.('Companion quest completed: The Uncounted.');
        return true;
    }

    function resolutionDialogue() {
        const companion = alden();
        const q = quest();
        if (!companion || !q || !canResolve(q) || typeof window.showDialogue !== 'function') return false;
        const options = [
            { label: 'Restore every name we can, record the remaining unknowns separately, and demand the missing transfer be investigated.', action: () => completeQuest('restore_names') },
            { label: 'Make a private memorial and fix the burial register without turning this into a public fight.', action: () => completeQuest('quiet_memorial') },
            { label: 'The missing body is the urgent part. Trace it before whoever took it gets another.', action: () => completeQuest('hunt_missing') },
            { label: 'Names matter to the living, but rites matter more. Report the missing body and let the rest remain unknown.', action: () => completeQuest('rites_over_names') },
        ];
        if (companionViewLines().length) options.push({ label: 'Ask what the others think.', action: () => showCompanionCounsel() });
        options.push({ label: 'Not yet.', action: () => {} });
        window.showDialogue(companion,
            'Alden lays the garrison roll beside the cathedral book. “Three names recovered. Three still unknown. One body missing between here and Silverhart.” He looks up. “The monastery taught me not to cling to names, titles or bodies. I am beginning to wonder when letting go becomes an excuse not to hold anyone accountable.”',
            options
        );
        return true;
    }

    function aftermathMode() {
        const companion = alden();
        if (!companion) return 'none';
        const affinity = window.getCompanionAffinity?.(companion) || companion.playerAffinity || {};
        const rel = window.getCompanionRelationship?.(companion) || {};
        const friendship = Number(affinity.friendship || 0);
        const romance = Number(affinity.romanticBond || 0);
        if (romance >= 35 && friendship >= 40 && Number(rel.trust || 0) >= 35) return 'romantic';
        if (friendship >= 45) return 'close_friend';
        return 'contemplative';
    }

    function showAftermath() {
        const companion = alden();
        if (!companion || typeof window.showDialogue !== 'function') return false;
        const mode = aftermathMode();
        if (mode === 'romantic') {
            window.showDialogue(companion,
                'Alden folds his hands, then deliberately unfolds them. “There is something I should say plainly before silence makes you guess. I do not desire you sexually. I do not experience that desire for anyone.”\n\nHe meets your eyes. “But I look for you when you leave a room. I imagine decisions with you still present in them. I want your happiness to matter to the shape of my life. If that is love, then I love you. It is not a lesser version of something else.”',
                [
                    { label: '“It isn’t lesser to me either. I want this as it is.”', action: () => {
                        window.adjustCompanionAffinity?.(companion, { friendship: 3, romanticBond: 5 }, 'accepted Alden’s asexual romantic love as complete in itself', 'alden_aftermath:romance_reciprocated');
                        window.companionAffinity?.setRomanceState?.(companion, 'mutual_interest', 'Alden and the player acknowledged an asexual romantic bond');
                    } },
                    { label: '“I want us, but sex matters to me too.”', action: () => window.showDialogue(companion,
                        'Alden nods. “Then I would not ask you to amputate that part of yourself to make me comfortable. Romantic faithfulness matters to me. Sexual exclusivity does not, provided we agree honestly and nobody is hidden or used.”',
                        [{ label: '“Then we can work out what honesty looks like together.”', action: () => {
                            window.adjustCompanionRelationship?.(companion, { trust: 4 }, 'discussed sexual needs honestly with Alden');
                            window.adjustCompanionAffinity?.(companion, { romanticBond: 4, friendship: 2 }, 'negotiated an asexual romance with sexual openness', 'alden_aftermath:open_sex_romance');
                            window.companionAffinity?.setRomanceState?.(companion, 'mutual_interest_open_sex', 'Alden and the player chose romantic exclusivity with negotiated sexual openness');
                        } }]
                    ) },
                    { label: '“I love you, but I think friendship is what fits us.”', action: () => {
                        window.companionAffinity?.setRomanceState?.(companion, 'friends_by_choice', 'the player and Alden chose a deeply affectionate friendship');
                        window.adjustCompanionAffinity?.(companion, { friendship: 4 }, 'answered Alden’s love with an honest friendship boundary', 'alden_aftermath:friendship_boundary');
                    } },
                ]
            );
            return true;
        }
        if (mode === 'close_friend') {
            window.showDialogue(companion,
                'Alden gives you a small smile. “I was taught that attachment clouds judgement. Perhaps it can. But friendship may also be a discipline: choosing to know one particular person well enough that their pain cannot become an abstraction.”',
                [{ label: '“I’m glad you chose this friendship.”', action: () => window.adjustCompanionAffinity?.(companion, { friendship: 3 }, 'affirmed close friendship with Alden', 'alden_aftermath:close_friend') }]
            );
            return true;
        }
        window.showDialogue(companion,
            'Alden closes the burial register. “I joined you because Northwatch was over and the road seemed preferable to another wall. I had not expected the road to make my old answers less convenient.”',
            [{ label: '“That may be what roads are for.”', action: () => {} }]
        );
        return true;
    }

    function companionDialogue(npc) {
        const companion = alden() || npc;
        if (!companion) return;
        const q = quest();
        const options = [];
        if (!q) options.push({ label: 'You keep thinking about Northwatch. What is it?', action: () => showQuestOpening() });
        else if (q.status === 'active' && canResolve(q)) options.push({ label: 'About the people missing from the Northwatch memorial…', action: () => resolutionDialogue() });
        else if (q.status === 'active') options.push({ label: 'About the uncounted dead…', action: () => window.showDialogue(companion,
            q.clues?.garrison_roll && q.clues?.quartermaster_names
                ? '“We have the military side. The Grand Cathedral should have the burial transfer. If the six truly became nameless there, I want to see it written rather than assume.”'
                : '“Commander Hart has the casualty roll. Rurik Voss has the supply records. Between them, we may be able to turn at least some of six bodies back into people.”',
            [{ label: 'Right.', action: () => {} }]
        ) });
        else options.push({ label: 'What did the uncounted dead change for you?', action: () => showAftermath() });
        options.push({ label: 'Do you miss the monastery?', action: () => window.showDialogue(companion,
            '“Sometimes. It is easier to believe you have achieved serenity when the same bell rings at the same hour every day.” Alden’s mouth twitches. “The road is less cooperative.”',
            [{ label: 'Fair.', action: () => {} }]
        ) });
        options.push({ label: 'Nothing right now.', action: () => {} });
        window.showDialogue(companion, 'Alden inclines his head. “I’m listening.”', options);
    }

    function questMenu(npc, prompt, options, original) {
        window.showDialogue(npc, prompt, [...options, { label: 'Other business.', action: () => original.call(window.npcDialogueTrees, npc) }]);
        return true;
    }

    function installNpcWrapper(id, marker, builder) {
        const trees = window.npcDialogueTrees;
        const original = trees?.[id];
        if (typeof original !== 'function' || original[marker]) return false;
        const wrapped = function(npc) {
            const q = quest();
            if (!q || q.status !== 'active') return original.call(this, npc);
            return builder(npc, original) || original.call(this, npc);
        };
        wrapped[marker] = true;
        wrapped.__previous = original;
        trees[id] = wrapped;
        return true;
    }

    function installNpcHooks() {
        installNpcWrapper('northwatch_commander', '__aldenUncountedCommander', (npc, original) => {
            const q = quest();
            if (q.clues?.garrison_roll) return false;
            return questMenu(npc, 'Alden asks Commander Hart to pull the casualty roll from the siege.', [
                { label: 'Ask about the six dead missing from the public memorial.', action: () => investigateCommander(npc) }
            ], original);
        });
        installNpcWrapper('border_war_quartermaster', '__aldenUncountedQuartermaster', (npc, original) => {
            const q = quest();
            if (q.clues?.quartermaster_names) return false;
            return questMenu(npc, 'Rurik Voss glances from Alden to the old supply chest.', [
                { label: 'Ask whether supply records can identify the civilian dead.', action: () => investigateQuartermaster(npc) }
            ], original);
        });
        installNpcWrapper('high_cleric', '__aldenUncountedCleric', (npc, original) => {
            const q = quest();
            if (q.clues?.cathedral_receipt && (!hasNecromancyContext() || q.clues?.necromancy_parallel)) return false;
            return questMenu(npc, 'High Cleric Adelram listens as Alden explains the discrepancy at Northwatch.', [
                { label: q.clues?.cathedral_receipt ? 'Compare the missing transfer with the necromancer reports.' : 'Ask to see the Northwatch burial transfer register.', action: () => investigateCathedral(npc) }
            ], original);
        });
    }

    function installPersonalDialogueTree() {
        const trees = window.npcDialogueTrees;
        if (!trees || trees[PERSONAL_DIALOGUE_ID]?.__aldenUncountedPersonal) return false;
        const previous = trees[PERSONAL_DIALOGUE_ID];
        const tree = function(npc) { return companionDialogue(npc); };
        tree.__aldenUncountedPersonal = true;
        tree.__previousAldenPersonal = previous;
        trees[PERSONAL_DIALOGUE_ID] = tree;
        return true;
    }

    function ensureAldenDialogueIdentity() {
        const companion = alden();
        if (!companion) return false;
        companion.dialogueId = PERSONAL_DIALOGUE_ID;
        for (const entity of (window.entities || [])) {
            if (entity?.name === ALDEN_NAME && entity.side === 'player') entity.dialogueId = PERSONAL_DIALOGUE_ID;
        }
        return true;
    }

    function refresh() {
        if (!alden()) return;
        ensureAldenStart();
        ensureArc();
        ensureAldenDialogueIdentity();
        installPersonalDialogueTree();
        installNpcHooks();
        syncNecromancyParallel();
    }

    window.aldenUncounted = {
        build: BUILD,
        questId: QUEST_ID,
        clues: CLUES,
        ensureAldenStart,
        ensureArc,
        getArcState,
        applyArcChange,
        ensureQuest,
        startQuest,
        addClue,
        canResolve,
        hasNecromancyContext,
        investigateCommander,
        investigateQuartermaster,
        investigateCathedral,
        syncNecromancyParallel,
        companionViewLines,
        showCompanionCounsel,
        resolutionDialogue,
        completeQuest,
        aftermathMode,
        showAftermath,
        refresh,
    };

    refresh();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh, { once: true });
    setInterval(refresh, 1000);
    window.ALDEN_UNCOUNTED_BUILD = BUILD;
})();