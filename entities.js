// entities.js
class Entity {
  constructor(name, color, hex, initiative) {
    this.id = Date.now() + Math.random();
    this.name = name;
    this.color = color;
    this.hex = hex;
    this.initiative = initiative;
    this.initialTimePoints = 0;
    this.timePoints = this.initialTimePoints;
    this.timePointsPerTick = 1;
    this.maxTimePoints = 120; // Allow going over 100
    this.alive = true;
    this.hp = 10;
    this.maxHp = 10;
    this.currentMana = 0;
    this.maxMana = 0;
    this.baseDamage = 1;
    this.baseReduction = 0;
    this.toHitMelee = 0;
    this.toHitRanged = 0;
    this.toHitSpell = 0;
    this.passiveDodge = 0;
    this.visionRange = 30; // Vision Cap
    this.visionBonus = 0;
    this.aiState = 'idle'; // idle, combat
    this.hasBeenSeenByPlayer = false; 
    this.destination = null; // {q, r} or null
    this.parriesRemaining = 3;
    this.sidestepsRemaining = 3;
    this.offhandAttackAvailable = false;
    this.side = 'enemy'; // 'player' or 'enemy'
    this.canLoot = true;
    this.totalTPSpent = 0;
    this.maxTPAllowed = 0; 
    this.extraHexes = []; // Array of relative {q, r} offsets
    this.skills = {};
    this.tags = [];
    this.awakeSeconds = 0;
    this.sleepRemainingSeconds = 0;
    this.isStealthed = false;
    this.stealthScore = 0; // Calculated when stealthing
    this.lastMoveTime = 0; // To track movement penalties
    
    // NEW SYSTEM STATS
    this.forcedMoveResistance = 0; // % chance to resist shove/trip
    this.reactionBlocked = false; // Cannot take reactions until next action
    this.visionPenaltyStacks = 0; // Stacks of vision reduction
    this.dmgPenaltyStacks = 0; // Stacks of damage reduction
    this.healingReduction = 0; // % reduction in incoming healing
    
    // Riding properties
    this.riderSize = 0;
    this.mountSize = 0;
    this.riding = null; // Reference to mount entity
    this.rider = null;  // Reference to rider entity

    // Visual Interpolation
    this.visualQ = hex.q;
    this.visualR = hex.r;
  }

  // Helper to get all hexes occupied by this entity
  getAllHexes() {
      const hexes = [{ q: this.hex.q, r: this.hex.r }];
      this.extraHexes.forEach(offset => {
          hexes.push({ q: this.hex.q + offset.q, r: this.hex.r + offset.r });
      });
      return hexes;
  }
}

class Enemy extends Entity {
    constructor(name, color, hex, initiative, hp, expValue = 0) {
        super(name, color, hex, initiative);
        this.hp = hp;
        this.maxHp = hp;
        this.expValue = expValue;
        this.gold = 0;
        this.inventory = [];
        this.createdSpells = [];
        this.equipped = { weapon: null, offhand: null, armor: null, helmet: null };
        this.lastSeenTargetHex = null;
    }

    applySkills() {
        for (const skillKey in this.skills) {
            const rank = this.skills[skillKey];
            const skill = window.skills[skillKey];
            if (skill && skill.apply) {
                // Apply the effect multiple times based on rank
                for (let i = 0; i < rank; i++) {
                    skill.apply(this);
                }
            }
        }
    }
}

let entities = [];
let currentTurnEntity = null;

// Expose globals
window.Entity = Entity;
window.Enemy = Enemy;
window.entities = entities;
window.currentTurnEntity = currentTurnEntity;
