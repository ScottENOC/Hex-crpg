// reynaEmptyBlind.js
// Reyna Fletcher's first post-recruitment companion quest.
//
// The quest grows out of Campaign 2's existing border-war breadcrumbs. Orc
// scouts have been carrying Silverhart levy gear; Reyna recognises distinctive
// frontier fletching and traces it to civilian trackers contracted around
// Northwatch. One is Tamsin Vale, an old hunting partner. The trackers were
// captured, coerced into giving up patrol routes, then became too frightened of
// hanging to return. The player decides whether to prosecute them, protect them
// as witnesses, use them as double agents, or help them disappear.
(() => {
    'use strict';

    const BUILD = '20260930-reyna-empty-blind-v1';
    const REYNA_NAME = 'Reyna Fletcher';
    const QUEST_ID = 'reyna_empty_blind';
    const PERSONAL_DIALOGUE_ID = 'companion_reyna_fletcher';

    const CLUES = Object.freeze({
        frontier_fletching: Object.freeze({
            label: 'Reyna recognises frontier fletching on captured raider arrows',
            text: 'The arrows recovered from the border scouts use a three-cut goose-feather pattern Reyna knows from a small circle of independent trackers who work the Reddale–Northwatch country. Her old hunting partner Tamsin Vale used the same pattern.'
        }),
        missing_trackers: Object.freeze({
            label: 'Three civilian trackers stopped reporting to Northwatch',
            text: 'Quartermaster Voss confirms that Tamsin Vale and two other civilian trackers were contracted to map safe approaches around Northwatch. All three vanished shortly before the raiders began moving around patrols with unusual precision.'
        }),
        leaked_routes: Object.freeze({
            label: 'The raiders have been using leaked patrol routes',
            text: 'Commander Hart’s patrol logs show repeated attacks through gaps that only someone with current route information should have known. The timing matches the disappearance of Reyna’s trackers.'
        }),
        coercion: Object.freeze({
            label: 'Tamsin admits the trackers were captured and coerced',
            text: 'Tamsin says the three trackers were captured while scouting. They gave up routes to keep one another alive, then continued supplying information because returning to Northwatch looked like a certain hanging. They now know enough about the raiders’ movements to be useful witnesses—or dangerous double agents.'
        }),
    });

    let suppressDecoration = 0;
    const party = () => Array.isArray(window.party) ? window.party : [];
    const reyna = () => party().find((member, index) => index > 0 && member?.name === REYNA_NAME) || null;
    const quest = () => (window.questLog || []).find(entry => entry?.id === QUEST_ID) || null;

    function clampAxis(value) {
        const n = Number(value);
        return Math.max(-100, Math.min(100, Number.isFinite(n) ? Math.round(n) : 0));
    }

    function relationshipReady() {
        return typeof window.getCompanionRelationship === 'function' &&
            typeof window.setCompanionRelationship === 'function' &&
            typeof window.adjustCompanionRelationship === 'function';
    }

    function ensureReynaStart() {
        const companion = reyna();
        if (!companion) return false;
        companion.companionRelationshipStart = {
            ...(companion.companionRelationshipStart || {}),
            familiarity: 16,
            trust: 20,
            approval: 55,
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
                familiarity: 16,
                trust: 20,
                ...(window.companionAttitude?.[REYNA_NAME] === undefined ? { approval: 55 } : {}),
            }, 'authored_start:reyna_bear_hunt_recruitment');
        } else {
            window.getCompanionRelationship(companion);
        }
        return true;
    }

    function ensureArc() {
        const companion = reyna();
        if (!companion) return null;
        const existing = companion.reynaCharacterArc || {};
        companion.reynaCharacterArc = {
            // Negative = "I work alone because relying on people gets people hurt".
            // Positive = willing to share burdens and deliberately depend on a team.
            interdependence: clampAxis(existing.interdependence ?? -25),
            // Negative = institutions are liabilities; solve problems privately.
            // Positive = institutions can be made accountable and worth using.
            institutionalTrust: clampAxis(existing.institutionalTrust ?? -20),
            knownEventKeys: Array.isArray(existing.knownEventKeys) ? existing.knownEventKeys : [],
            dialogueChoiceKeys: Array.isArray(existing.dialogueChoiceKeys) ? existing.dialogueChoiceKeys : [],
            history: Array.isArray(existing.history) ? existing.history : [],
        };
        return companion.reynaCharacterArc;
    }

    function getArcState() {
        const arc = ensureArc();
        if (!arc) return null;
        let reliance = 'self_reliant';
        if (arc.interdependence >= 40) reliance = 'team_bound';
        else if (arc.interdependence >= 10) reliance = 'learning_to_rely';
        else if (arc.interdependence <= -45) reliance = 'lone_hunter';

        let institutions = 'wary';
        if (arc.institutionalTrust >= 40) institutions = 'institutionally_engaged';
        else if (arc.institutionalTrust >= 10) institutions = 'conditional_trust';
        else if (arc.institutionalTrust <= -45) institutions = 'deeply_distrustful';
        return {
            interdependence: arc.interdependence,
            institutionalTrust: arc.institutionalTrust,
            reliance,
            institutions,
        };
    }

    function applyArcChange(key, delta = {}, reason = null) {
        const arc = ensureArc();
        if (!arc || !key) return null;
        const stableKey = String(key);
        if (arc.knownEventKeys.includes(stableKey)) return getArcState();
        arc.knownEventKeys.push(stableKey);
        if (arc.knownEventKeys.length > 100) arc.knownEventKeys.splice(0, arc.knownEventKeys.length - 100);
        arc.interdependence = clampAxis(arc.interdependence + Number(delta.interdependence || 0));
        arc.institutionalTrust = clampAxis(arc.institutionalTrust + Number(delta.institutionalTrust || 0));
        arc.history.push({
            key: stableKey,
            reason: reason || stableKey,
            worldSeconds: Number(window.worldSeconds || 0),
            interdependence: arc.interdependence,
            institutionalTrust: arc.institutionalTrust,
        });
        if (arc.history.length > 80) arc.history.splice(0, arc.history.length - 80);
        return getArcState();
    }

    function borderContext() {
        const eyes = (window.questLog || []).find(q => q?.id === 'eyes_on_border');
        const war = (window.questLog || []).find(q => q?.id === 'border_war');
        return {
            eyes,
            war,
            ready: !!eyes || !!war || !!window.borderWarSallyActive,
        };
    }

    function ensureQuest() {
        window.questLog = window.questLog || [];
        let q = quest();
        if (!q) {
            q = {
                id: QUEST_ID,
                title: 'The Empty Blind',
                giver: REYNA_NAME,
                status: 'active',
                resolution: null,
                description: 'Follow the frontier fletching Reyna recognised on the border scouts and find out what happened to Tamsin Vale and the missing civilian trackers.',
                clues: {},
                clueOrder: [],
                offeredAt: Number(window.worldSeconds || 0),
            };
            window.questLog.push(q);
            window.showMessage?.('Companion quest added: The Empty Blind.');
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
        q.description = canConfront(q)
            ? 'The trail points to Reyna’s old hunting partner. Confront Tamsin and decide what to do with the trackers.'
            : 'Trace the missing frontier trackers through Northwatch’s records and the raiders’ leaked patrol routes.';
        window.showMessage?.(`Clue found: ${spec.label}.`);
        return true;
    }

    function canConfront(q = quest()) {
        return !!(q?.clues?.frontier_fletching && q?.clues?.missing_trackers && q?.clues?.leaked_routes);
    }

    function canResolve(q = quest()) {
        return !!(q && q.status === 'active' && q.clues?.coercion);
    }

    function startQuest() {
        const companion = reyna();
        if (!companion) return false;
        ensureReynaStart();
        ensureArc();
        const q = ensureQuest();
        if (!q.clues.frontier_fletching) {
            addClue('frontier_fletching', borderContext().eyes ? 'arrows recovered during Eyes on the Border' : 'border-raider gear');
            window.noteCompanionConversation?.(companion, 'reyna:empty_blind_opened', 3);
        }
        return q;
    }

    function withSuppressedDecoration(fn) {
        suppressDecoration++;
        try { return fn(); }
        finally { suppressDecoration--; }
    }

    function showQuestOpening() {
        const companion = reyna();
        if (!companion || typeof window.showDialogue !== 'function') return false;
        startQuest();
        withSuppressedDecoration(() => window.showDialogue(companion,
            'Reyna turns one of the recovered border arrows between her fingers. “See the feathers? Three cuts, shallow on the left. Tamsin Vale taught half the independent trackers east of Reddale to fletch like that.”\n\nHer jaw tightens. “She and I hunted together for years. If her arrows are with raiders, I want to know whether she sold them, lost them, or is lying in a ditch somewhere.”',
            [
                { label: '“Then we find her.”', action: () => {} },
                { label: '“You think she would help the raiders?”', action: () => withSuppressedDecoration(() => window.showDialogue(companion, '“I think people do ugly things when they think they’re alone.” Reyna looks at the arrow again. “Tamsin included. Me included.”', [{ label: 'Fair.', action: () => {} }])) },
            ]
        ));
        return true;
    }

    function investigateQuartermaster(npc = null) {
        startQuest();
        addClue('missing_trackers', npc?.name || 'Northwatch quartermaster records');
        if (npc && typeof window.showDialogue === 'function') {
            withSuppressedDecoration(() => window.showDialogue(npc,
                'Voss checks the civilian contract roll. “Tamsin Vale, Orren Pike, Sella Marr. Hired to map safe approaches and water points. All three stopped reporting within the same week.” He taps the margin. “Then the raiders started finding every patrol gap we left.”',
                [{ label: 'So they vanished before the leaks started.', action: () => {} }]
            ));
        }
        return true;
    }

    function investigateCommander(npc = null) {
        startQuest();
        addClue('leaked_routes', npc?.name || 'Northwatch patrol logs');
        if (npc && typeof window.showDialogue === 'function') {
            withSuppressedDecoration(() => window.showDialogue(npc,
                'Hart spreads three patrol maps across a table. Each marked raid passed through a route the garrison had changed only days earlier. “This is current information,” she says. “Not luck. Someone with access to the trackers’ maps has been talking.”',
                [{ label: 'Reyna knows who might have had them.', action: () => {} }]
            ));
        }
        return true;
    }

    function confrontTamsin() {
        const companion = reyna();
        const q = quest();
        if (!companion || !q || !canConfront(q)) return false;
        addClue('coercion', 'Tamsin Vale at the abandoned hunting blind');
        withSuppressedDecoration(() => window.showDialogue(companion,
            'Reyna leads you to an old hunting blind above the east road. Tamsin Vale steps out before Reyna can call her name, bow lowered but strung.\n\n“We were taken,” Tamsin says. “Three days in an orc stockade. They wanted the patrol routes. Orren had two broken fingers before we gave them anything.” Her voice goes flat. “Afterward we could not walk back into Northwatch and explain why soldiers were dead because we talked. So we kept talking. Bought time. Bought our lives. Made it worse.”\n\nReyna says nothing for a long moment. Then: “You should have come to me.”\n\nTamsin laughs once, without humour. “You? Reyna, you disappear for six months rather than ask someone to hold the other end of a rope.”',
            [{ label: 'We need to decide what happens now.', action: () => resolutionDialogue() }]
        ));
        return true;
    }

    function companionViewLines() {
        const lines = [];
        const has = name => party().some((member, index) => index > 0 && member?.name === name);

        if (has('Ser Aldric Thorne')) {
            const broken = (window.questLog || []).find(q => q?.id === 'aldric_broken_vigil');
            if (broken?.resolution === 'spare_patrol') {
                lines.push({ name: 'Ser Aldric Thorne', text: '“They gave information that got people hurt. That matters. So does being captured and tortured into the first betrayal. Hold them accountable for what they chose after that—not for pretending fear never existed.”' });
            } else if (broken?.resolution === 'public_accountability') {
                lines.push({ name: 'Ser Aldric Thorne', text: '“Bring the truth into the open. Coercion explains a choice; it does not make the dead less dead. But judgement belongs after the facts, not before them.”' });
            } else {
                lines.push({ name: 'Ser Aldric Thorne', text: '“Bring them in alive. Truth first, judgement second. I have learned the cost of reversing that order.”' });
            }
        }

        if (has('Fenn Oakheart')) {
            const state = window.fennLivingBoundary?.getArcState?.();
            const text = state?.stewardship >= 10
                ? '“They are part of the problem now, which also means they can be part of repairing it. Give them a way to change what happens next instead of only deciding what they deserve for yesterday.”'
                : '“Cornered animals make ugly choices. People too. I would give them a path out if we can do it without putting everyone else back in the trap.”';
            lines.push({ name: 'Fenn Oakheart', text });
        }

        if (has('Mirabel Quill')) {
            const state = window.mirabelUnquietConcordance?.getArcState?.();
            const text = state?.restraint >= 15
                ? '“Do not keep coercing people simply because the previous coercer made them useful. Protection for testimony is defensible. Turning them straight back into tools is rather less so.”'
                : '“They have current access to the raiders and the raiders still trust their maps. Morally complicated, yes. Also an intelligence asset we would be fools not to notice.”';
            lines.push({ name: 'Mirabel Quill', text });
        }

        if (has('Wren Talbot')) {
            const state = window.getWrenCharacterState?.();
            const personal = Number(state?.personalLoyalty ?? 0);
            const mercy = Number(state?.mercy ?? 0);
            const text = personal >= 25 && mercy < 0
                ? '“If Tamsin is Reyna’s, give her one chance to make this right. One. If she sells us out again, I stop caring why.”'
                : mercy >= 20
                    ? '“They were frightened and then got trapped inside the first bad choice. Give them a way to tell the truth without pretending nobody was hurt.”'
                    : '“I would not trust them because they are sorry. I might trust them because we know exactly what they are afraid of now.”';
            lines.push({ name: 'Wren Talbot', text });
        }
        return lines;
    }

    function showCompanionView(line) {
        const speaker = party().find(p => p?.name === line.name) || { name: line.name };
        withSuppressedDecoration(() => window.showDialogue(speaker, line.text, [{ label: 'Back to Reyna.', action: () => resolutionDialogue() }]));
    }

    function outcomeSpec(resolution) {
        if (resolution === 'turn_in') return {
            relationship: { approval: 4, trust: 6, familiarity: 4 },
            affinity: { friendship: 3, romanticBond: 1 },
            arc: { interdependence: 4, institutionalTrust: 16 },
            line: 'Reyna watches Tamsin surrender her bow to the Northwatch guard. “I hate it,” she says quietly. “But I also hate pretending the people killed because of those maps do not get a say. Hart can judge it in daylight.”',
        };
        if (resolution === 'witness_deal') return {
            relationship: { approval: 10, trust: 12, familiarity: 6 },
            affinity: { friendship: 8, romanticBond: 3, attraction: 1 },
            arc: { interdependence: 15, institutionalTrust: 12 },
            line: 'When Hart agrees to protection in exchange for everything the trackers know, Reyna looks genuinely startled. “Huh. Ask for help before everything is on fire and sometimes people actually help.” Her mouth twists. “Do not look pleased with yourself.”',
        };
        if (resolution === 'double_agent') return {
            relationship: { approval: 7, trust: 5, familiarity: 5 },
            affinity: { friendship: 4, attraction: 2 },
            arc: { interdependence: -4, institutionalTrust: -12 },
            line: 'Reyna studies the false route you and Tamsin mark for the raiders. “Risky. Clever.” She exhales. “And exactly the sort of plan I would have made before deciding nobody else needed to know. I am not sure that is praise.”',
        };
        return {
            relationship: { approval: -5, trust: -7, familiarity: 4 },
            affinity: { friendship: -3, romanticBond: -2 },
            arc: { interdependence: -9, institutionalTrust: -15 },
            line: 'Reyna watches Tamsin disappear into the trees. “Part of me is relieved.” Her eyes stay on the empty trail. “The other part is counting how many soldiers will walk routes she helped compromise without ever knowing why.”',
        };
    }

    function completeQuest(resolution) {
        const companion = reyna();
        const q = quest();
        if (!companion || !q || q.status === 'completed' || !canResolve(q)) return false;
        const valid = new Set(['turn_in', 'witness_deal', 'double_agent', 'let_disappear']);
        if (!valid.has(resolution)) return false;
        const spec = outcomeSpec(resolution);
        q.status = 'completed';
        q.resolution = resolution;
        q.completedAt = Number(window.worldSeconds || 0);
        q.trackersProtected = resolution === 'witness_deal';
        q.trackersProsecuted = resolution === 'turn_in';
        q.doubleAgents = resolution === 'double_agent';
        q.trackersEscaped = resolution === 'let_disappear';
        window.reynaBorderTrackerOutcome = resolution;

        window.adjustCompanionRelationship?.(companion, spec.relationship, `reyna_empty_blind:${resolution}`);
        window.adjustCompanionAffinity?.(companion, spec.affinity, `resolved Reyna's missing-trackers problem: ${resolution}`, `reyna_empty_blind:${resolution}`);
        applyArcChange(`empty_blind:${resolution}`, spec.arc, `resolved The Empty Blind: ${resolution}`);

        withSuppressedDecoration(() => window.showDialogue(companion, spec.line, [
            { label: '“And what does that make us?”', action: () => openAftermath() },
            { label: 'Leave it there.', action: () => {} },
        ]));
        window.showMessage?.('Companion quest completed: The Empty Blind.');
        return true;
    }

    function resolutionDialogue() {
        const companion = reyna();
        if (!companion || !canResolve()) return false;
        const options = [
            { label: 'Turn the trackers over to Northwatch for trial.', action: () => completeQuest('turn_in') },
            { label: 'Ask Hart for protection in exchange for full testimony and intelligence.', action: () => completeQuest('witness_deal') },
            { label: 'Keep this off the books. Have them feed false routes to the raiders.', action: () => completeQuest('double_agent') },
            { label: 'Help Tamsin and the others disappear. End it here.', action: () => completeQuest('let_disappear') },
        ];
        for (const line of companionViewLines()) {
            options.push({ label: `Ask ${line.name.split(' ')[0] === 'Ser' ? 'Aldric' : line.name.split(' ')[0]} what they think.`, action: () => showCompanionView(line) });
        }
        options.push({ label: 'Not yet.', action: () => {} });
        withSuppressedDecoration(() => window.showDialogue(companion,
            'Reyna keeps her voice low. “Tamsin and the others got people killed. They were also prisoners when this started, and now they know the raiders’ routes better than half the garrison. There is no version where I get my old hunting partner back untouched. So: what do we do with the person she is now?”',
            options
        ));
        return true;
    }

    function aftermathMode() {
        const companion = reyna();
        if (!companion) return 'none';
        const affinity = window.getCompanionAffinity?.(companion) || companion.playerAffinity || {};
        const rel = window.getCompanionRelationship?.(companion) || {};
        const friendship = Number(affinity.friendship || 0);
        const romance = Number(affinity.romanticBond || 0);
        const attraction = Number(affinity.attraction || 0);
        if (romance >= 35 && friendship >= 40 && Number(rel.trust || 0) >= 30) return 'romantic';
        if (friendship >= 50 && attraction >= 35 && romance < 30) return 'friends_with_benefits';
        if (attraction >= 50 && friendship < 40 && romance < 25) return 'casual';
        if (friendship >= 45) return 'close_friend';
        return 'guarded';
    }

    function openAftermath() {
        const companion = reyna();
        if (!companion || typeof window.showDialogue !== 'function') return false;
        const mode = aftermathMode();
        if (mode === 'romantic') {
            withSuppressedDecoration(() => window.showDialogue(companion,
                'Reyna looks uncomfortable in the particular way she gets when the thing in front of her cannot be solved with a clean shot. “I love my freedom. I am not asking you to belong to me, and I do not want to belong to you like property.” She meets your eyes. “But open does not mean optional. If we say we are there for each other, I need that sentence to mean something.”',
                [
                    { label: '“It does. Freedom doesn’t make you disposable.”', action: () => {
                        window.adjustCompanionAffinity?.(companion, { friendship: 3, romanticBond: 5 }, 'affirmed Reyna’s non-possessive commitment', 'reyna_aftermath:commitment');
                        window.companionAffinity?.setRomanceState?.(companion, 'mutual_interest_open', 'Reyna and the player acknowledged a serious consensually non-monogamous romantic bond');
                    }},
                    { label: '“I care about you, but I can’t promise that kind of reliance.”', action: () => {
                        window.adjustCompanionAffinity?.(companion, { friendship: 2, romanticBond: -3 }, 'answered Reyna honestly about limits', 'reyna_aftermath:limits');
                        window.companionAffinity?.setRomanceState?.(companion, 'friends_by_choice', 'player chose not to deepen romance with Reyna');
                    }},
                ]
            ));
            return true;
        }
        if (mode === 'friends_with_benefits') {
            withSuppressedDecoration(() => window.showDialogue(companion,
                'Reyna gives you a sidelong look. “We work well together. I trust you. I also happen to enjoy looking at you.” A quick grin. “Those facts can coexist without us inventing ownership. If friends and sex is what we want, say it plainly and keep it honest.”',
                [
                    { label: '“Plainly: yes.”', action: () => window.companionAffinity?.setRomanceState?.(companion, 'friends_with_benefits_open', 'Reyna and the player agreed to an open friends-with-benefits relationship') },
                    { label: '“I’d rather keep the friendship uncomplicated.”', action: () => window.companionAffinity?.setRomanceState?.(companion, 'friends_by_choice', 'player kept Reyna relationship platonic') },
                ]
            ));
            return true;
        }
        if (mode === 'casual') {
            withSuppressedDecoration(() => window.showDialogue(companion,
                'Reyna catches your eye and does not look away. “You are attractive. I am attracted. That is enough information for one evening.” She shrugs. “If we ever act on it, I am not going to pretend one night is a marriage proposal.”',
                [{ label: '“Works for me.”', action: () => window.companionAffinity?.setRomanceState?.(companion, 'casual_interest', 'Reyna and the player acknowledged casual attraction') }]
            ));
            return true;
        }
        if (mode === 'close_friend') {
            withSuppressedDecoration(() => window.showDialogue(companion,
                'Reyna sits beside you in companionable silence. “I used to think hunting alone meant fewer mistakes. Mostly it meant nobody was close enough to notice mine.” She nudges your boot. “You are inconveniently observant.”',
                [{ label: '“You’re stuck with me noticing.”', action: () => window.adjustCompanionAffinity?.(companion, { friendship: 3 }, 'affirmed close friendship with Reyna', 'reyna_aftermath:friendship') }]
            ));
            return true;
        }
        withSuppressedDecoration(() => window.showDialogue(companion,
            '“Tamsin was right about one thing,” Reyna says. “I am very good at disappearing before I need anybody. I have not decided whether travelling with you is curing that or just making it harder.”',
            [{ label: 'Give her space.', action: () => {} }]
        ));
        return true;
    }

    function companionDialogue(npc) {
        const companion = reyna() || npc;
        if (!companion) return;
        const q = quest();
        const border = borderContext();
        const options = [];
        if (!q && border.ready) {
            options.push({ label: 'You’ve been staring at those border arrows. Recognise something?', action: () => showQuestOpening() });
        } else if (!q) {
            options.push({ label: 'How are you finding travelling with a group?', action: () => withSuppressedDecoration(() => window.showDialogue(companion,
                '“Noisier. Slower around doors. More people to tell me I am bleeding before I have decided whether it counts.” Reyna’s mouth twitches. “Ask me again after we’ve had to trust each other with something expensive.”',
                [{ label: 'I will.', action: () => {} }]
            )) });
        } else if (q.status === 'active' && canResolve(q)) {
            options.push({ label: 'About Tamsin and the trackers…', action: () => resolutionDialogue() });
        } else if (q.status === 'active' && canConfront(q)) {
            options.push({ label: 'We know enough to find Tamsin.', action: () => confrontTamsin() });
        } else if (q.status === 'active') {
            options.push({ label: 'About the missing trackers…', action: () => withSuppressedDecoration(() => window.showDialogue(companion,
                q.clues.missing_trackers
                    ? '“Voss confirms they vanished. Hart’s patrol logs should tell us whether the raiders started using their routes afterward.”'
                    : q.clues.leaked_routes
                        ? '“Hart confirms somebody leaked current routes. Voss’s civilian contracts will tell us whether Tamsin was in a position to know them.”'
                        : '“Voss has the tracker contracts. Hart has the patrol logs. Between them we find out whether I am chasing a memory or a traitor.”',
                [{ label: 'Right.', action: () => {} }]
            )) });
        } else {
            options.push({ label: 'What did Tamsin change for you?', action: () => openAftermath() });
        }
        options.push({ label: 'Nothing right now.', action: () => {} });
        withSuppressedDecoration(() => window.showDialogue(companion, '“Yeah?”', options));
    }

    function installPersonalDialogueTree() {
        const trees = window.npcDialogueTrees;
        if (!trees || trees[PERSONAL_DIALOGUE_ID]?.__reynaEmptyBlindPersonal) return false;
        const existing = trees[PERSONAL_DIALOGUE_ID];
        const tree = function(npc) { return companionDialogue(npc); };
        tree.__reynaEmptyBlindPersonal = true;
        tree.__previousReynaPersonal = existing;
        trees[PERSONAL_DIALOGUE_ID] = tree;
        return true;
    }

    function ensureDialogueIdentity() {
        const companion = reyna();
        if (!companion) return false;
        companion.dialogueId = PERSONAL_DIALOGUE_ID;
        for (const entity of (window.entities || [])) {
            if (entity?.name === REYNA_NAME && entity.side === 'player') entity.dialogueId = PERSONAL_DIALOGUE_ID;
        }
        return true;
    }

    function questMenu(npc, prompt, options, original) {
        const merged = [...options, { label: 'Other business.', action: () => original.call(window.npcDialogueTrees, npc) }];
        withSuppressedDecoration(() => window.showDialogue(npc, prompt, merged));
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
        installNpcWrapper('border_war_quartermaster', '__reynaEmptyBlindQuartermaster', (npc, original) => {
            const q = quest();
            if (q.clues.missing_trackers) return false;
            return questMenu(npc, 'Reyna lays one of the distinctive arrows on Voss’s table.', [
                { label: 'Ask about civilian trackers who stopped reporting.', action: () => investigateQuartermaster(npc) }
            ], original);
        });
        installNpcWrapper('northwatch_commander', '__reynaEmptyBlindCommander', (npc, original) => {
            const q = quest();
            if (q.clues.leaked_routes) return false;
            return questMenu(npc, 'Reyna asks to see the patrol routes hit since the civilian trackers vanished.', [
                { label: 'Compare the recent raid sites with Northwatch’s changing patrol routes.', action: () => investigateCommander(npc) }
            ], original);
        });
    }

    function refresh() {
        if (!reyna()) return;
        ensureReynaStart();
        ensureArc();
        ensureDialogueIdentity();
        installPersonalDialogueTree();
        installNpcHooks();
    }

    window.reynaEmptyBlind = {
        build: BUILD,
        questId: QUEST_ID,
        clues: CLUES,
        ensureReynaStart,
        ensureArc,
        getArcState,
        applyArcChange,
        borderContext,
        ensureQuest,
        startQuest,
        addClue,
        canConfront,
        canResolve,
        showQuestOpening,
        investigateQuartermaster,
        investigateCommander,
        confrontTamsin,
        companionViewLines,
        resolutionDialogue,
        completeQuest,
        aftermathMode,
        openAftermath,
        refresh,
    };

    refresh();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh, { once: true });
    setInterval(refresh, 1000);
    window.REYNA_EMPTY_BLIND_BUILD = BUILD;
})();