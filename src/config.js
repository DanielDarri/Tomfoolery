export const BASE_SPEED = 6.5;   // m/s
export const GRAVITY = 22;
export const JUMP_VEL = 7.5;     // ~1.28m jump height (enough to hop onto crates)
export const ROUNDS_TO_WIN = 3;

// stats.* are 0-10 values only used for the menu bars
export const WEAPONS = {
  sword: {
    id: 'sword', name: 'Sword', icon: '🗡️', type: 'melee',
    damage: 100, range: 2.7, cooldown: 0.7, windup: 0.1,
    speedMult: 1.45, maxHealth: 200, doubleJump: true,
    extra: { key: 'SPACE ×2', icon: '🪽', name: 'Double Jump', desc: 'Passive: jump again in mid-air.' },
    role: 'Duelist', color: '#00e5ff',
    desc: 'Huge 100 damage per swing and +45% movement speed. Fast, fragile, deadly.',
    stats: { damage: 10, speed: 10, health: 4, range: 4 },
    abilities: {
      shift: { name: 'Swift Dash', icon: '💨', cd: 4, desc: 'Dash forward, slicing through the enemy for 50 damage.' },
      e: { name: 'Deflect', icon: '🌀', cd: 8, desc: 'For 1.2s, reflect bullets back at the shooter and parry melee (stuns the attacker).' },
      q: { name: 'Blade Fury', icon: '🔥', desc: '7s: +1.5m reach, very fast swings, +25% speed, dash recharges in 1s.' },
    },
  },
  fists: {
    id: 'fists', name: 'Fists', icon: '👊', type: 'melee',
    damage: 75, range: 2.3, cooldown: 0.45, windup: 0.08,
    speedMult: 1.35, maxHealth: 300,
    role: 'Brawler', color: '#ff8a3d',
    desc: 'Rapid punches and lots of health. Gets in your face and stays there.',
    stats: { damage: 7, speed: 9, health: 7, range: 3 },
    abilities: {
      shift: { name: 'Rocket Punch', icon: '🚀', cd: 6, desc: 'Charge forward. On contact: 45 damage, knockback and a short stun.' },
      e: { name: 'Iron Skin', icon: '🪨', cd: 10, desc: 'Gain a 120 HP shield for 4s.' },
      q: { name: 'Meteor Slam', icon: '☄️', desc: 'Leap to where you aim and slam down: 70 damage + 1.5s stun in a 5.5m radius.' },
    },
  },
  pistol: {
    id: 'pistol', name: 'Pistol', icon: '🔫', type: 'gun',
    damage: 16, headMult: 2, cooldown: 0.1, auto: true,
    mag: 24, reload: 1.1, spread: 0.007, moveSpread: 0.009,
    speedMult: 1.15, maxHealth: 250, fan: { cooldown: 0.045, spread: 0.035 },
    extra: { key: 'RMB', icon: '🌪️', name: 'Fan Fire', desc: 'Empty your whole magazine in a rapid, less accurate burst.' }, tracer: 0xffd36b,
    role: 'Gunslinger', color: '#ffd23f',
    desc: 'Hold to fire a fast, accurate stream of bullets. Big magazine, quick reload, mobile.',
    stats: { damage: 4, speed: 7, health: 5, range: 7 },
    abilities: {
      shift: { name: 'Combat Roll', icon: '🤸', cd: 4, desc: 'Roll in your move direction and instantly reload.' },
      e: { name: 'Flashbang', icon: '💥', cd: 9, desc: 'Throw a grenade: blinds and stuns for 1.3s + 35 damage in a 5.5m radius.' },
      q: { name: 'Deadeye', icon: '💀', desc: '5s: infinite ammo, +50% fire rate, shots lock on to enemies near your crosshair.' },
    },
  },
  sniper: {
    id: 'sniper', name: 'Sniper', icon: '🎯', type: 'gun',
    damage: 80, headDamage: 9999, cooldown: 1.3, auto: false,
    mag: 5, reload: 2.4, spread: 0.045, scopedSpread: 0, moveSpread: 0.025,
    speedMult: 0.85, maxHealth: 200, scope: true, tracer: 0x7fd8ff,
    role: 'Marksman', color: '#b388ff',
    desc: 'Headshots are an instant kill. Right-click to scope.',
    stats: { damage: 10, speed: 4, health: 4, range: 10 },
    abilities: {
      shift: { name: 'Grapple', icon: '🪝', cd: 7, desc: 'Fire a grappling hook where you aim (up to 30m) and zip to it.' },
      e: { name: 'Recon Pulse', icon: '📡', cd: 12, desc: 'Reveal the enemy through walls for 6s.' },
      q: { name: 'Railgun', icon: '⚡', desc: '8s: shots pierce walls, bolt cycles 2x faster, enemy revealed.' },
    },
  },
  hammer: {
    id: 'hammer', name: 'Hammer', icon: '🔨', type: 'melee', heavy: true,
    damage: 90, range: 3.0, cooldown: 1.0, windup: 0.22,
    speedMult: 1.15, maxHealth: 400,
    role: 'Juggernaut', color: '#ff4d6d',
    desc: 'Slow, crushing overhead swings and the most health in the arena. Hard to stop.',
    stats: { damage: 9, speed: 5, health: 10, range: 5 },
    abilities: {
      shift: { name: 'Shockwave', icon: '🌋', cd: 6, desc: 'Slam the ground: 40 damage, knockback and a short stun to anyone within 5.5m in front of you.' },
      e: { name: 'Fire Wave', icon: '🔥', cd: 9, desc: 'Slam out a 3m-wide wall of fire that rolls 20m forward: 30 damage and burns for 24 more over 3s.' },
      q: { name: 'Juggernaut', icon: '🛡️', desc: '7s: immune to stuns and knockback, take 50% less damage, +30% speed, swings hit all around you.' },
    },
  },
  shotgun: {
    id: 'shotgun', name: 'Shotgun', icon: '💥', type: 'gun', scale: 1.25,
    cooldown: 0.85, auto: true, mag: 6, reload: 2.0, moveSpread: 0.01,
    speedMult: 0.9, maxHealth: 600, tracer: 0xffb35c,
    // LMB: wide close-range blast. RMB: tight choke shot for range.
    blast: { pellets: 10, damage: 15, spread: 0.085, falloff: [5, 16], minMult: 0.25 },
    choke: { pellets: 6, damage: 10, spread: 0.022, falloff: [20, 40], minMult: 0.5 },
    headMult: 1.5,
    role: 'Heavy', color: '#9ccc65',
    desc: 'A huge brawler with a huge gun. Left click: devastating point-blank blast. Bigger target, but 600 HP.',
    stats: { damage: 10, speed: 3.5, health: 10, range: 4.5 },
    extra: { key: 'RMB', icon: '🎯', name: 'Choke Shot', desc: 'Tight, longer-range spread: less damage per shot, no falloff until 20m.' },
    abilities: {
      shift: { name: 'Chain Hook', icon: '⛓️', cd: 7, desc: 'Throw a hook (22m). If it catches an enemy: 20 damage and they get yanked right up to you.' },
      e: { name: 'Patch Up', icon: '🩹', cd: 14, desc: 'Instantly heal 300 HP.' },
      q: { name: "Dragon's Breath", icon: '🐉', desc: '6s: no reloading, 40% faster pumps, every pellet hit sets the target on fire.' },
    },
  },
};

// Ultimate charge (0-100): per second, per point of damage dealt, per point of damage taken
export const ULT_RATE = { passive: 2.2, dealt: 0.45, taken: 0.25 };

// AI tuning per difficulty
export const DIFFICULTY = {
  easy: {
    reaction: 0.8, track: 2.5, lead: 0, aimErr: 0.03, turnRate: 4,
    sniperAim: 1.8, headChance: 0.15, fireRateMult: 1.8, speedMult: 0.85,
    meleeWindup: 0.32, zigFreq: 2, abilityChance: 0.35, respectDeflect: false,
  },
  normal: {
    reaction: 0.45, track: 4.5, lead: 0.6, aimErr: 0.018, turnRate: 7,
    sniperAim: 1.25, headChance: 0.35, fireRateMult: 1.3, speedMult: 0.95,
    meleeWindup: 0.24, zigFreq: 3, abilityChance: 0.7, respectDeflect: true,
  },
  hard: {
    reaction: 0.25, track: 7, lead: 0.9, aimErr: 0.01, turnRate: 11,
    sniperAim: 0.85, headChance: 0.6, fireRateMult: 1.0, speedMult: 1.0,
    meleeWindup: 0.16, zigFreq: 4, abilityChance: 1, respectDeflect: true,
  },
};
