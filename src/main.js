import * as THREE from 'three';
import './style.css';
import { WEAPONS, DIFFICULTY, BASE_SPEED, GRAVITY, JUMP_VEL, ROUNDS_TO_WIN, ULT_RATE } from './config.js';
import { buildArena, buildLights } from './arena.js';
import { createCharacter } from './character.js';
import { ViewModel } from './viewmodel.js';
import { AIController } from './ai.js';
import { Effects } from './effects.js';
import { Abilities, resetAbilities, ultActive, SLOTS } from './abilities.js';
import { sfx, initAudio } from './audio.js';
import { EYE, HEAD_Y, RADIUS, rayVsEntity, resolveCircle, groundHeight, blockedAt, sizeOf } from './physics.js';

// ---------------------------------------------------------------- setup
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.autoClear = false;
document.getElementById('app').appendChild(renderer.domElement);
const canvas = renderer.domElement;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0e1c);
scene.fog = new THREE.Fog(0x0b0e1c, 35, 90);

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 300);
camera.rotation.order = 'YXZ';
scene.add(camera);

buildLights(scene);
const duelArena = buildArena(scene, 'duel');
const practiceArena = buildArena(scene, 'practice');
practiceArena.group.visible = false;
let arena = duelArena;
function useArena(a) {
  arena = a;
  duelArena.group.visible = a === duelArena;
  practiceArena.group.visible = a === practiceArena;
}
const effects = new Effects(scene);
const viewModel = new ViewModel();
const raycaster = new THREE.Raycaster();
const ARENA_HALF = 20.4;

const laser = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshBasicMaterial({ color: 0xff2030, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }),
);
laser.visible = false;
laser.renderOrder = 998;
scene.add(laser);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  viewModel.resize(innerWidth / innerHeight);
  renderer.setSize(innerWidth, innerHeight);
});

// ---------------------------------------------------------------- entities
function makeEntity() {
  const e = {
    pos: new THREE.Vector3(), vel: new THREE.Vector3(), grounded: true,
    yaw: 0, pitch: 0, health: 1000, maxHealth: 1000, weapon: WEAPONS.sword,
    ammo: 0, cooldown: 0, reloadT: 0, alive: true, steerSide: 1,
  };
  resetAbilities(e, false);
  return e;
}
const player = makeEntity();
player.scopeAmt = 0;
player.moving = false;
player.deathT = 0;
const enemy = makeEntity();
enemy.model = createCharacter(0xe0413b);
scene.add(enemy.model.group);
const ai = new AIController(enemy);

// ---------------------------------------------------------------- practice mode
let mode = 'duel'; // 'duel' | 'practice'
const DUMMY_HP = 500;
const dummies = [];
let lastDummy = null;
const practice = { combo: 0, comboStart: 0, lastHit: -99, best: 0 };
function makeDummy(home) {
  const d = makeEntity();
  d.dummy = true;
  d.home = home.clone();
  d.model = createCharacter(0xc9a26b);
  d.model.setWeapon('none');
  d.model.group.visible = false;
  scene.add(d.model.group);
  return d;
}
function resetDummy(d) {
  d.pos.copy(d.home);
  d.vel.set(0, 0, 0);
  d.maxHealth = d.health = DUMMY_HP;
  d.alive = true;
  resetAbilities(d, false);
  d.model.reset();
}
function opponentsOf(ent) {
  if (ent === player) return mode === 'practice' ? dummies : [enemy];
  return [player];
}
function allEntities() {
  return mode === 'practice' ? [player, enemy, ...dummies] : [player, enemy];
}

// ---------------------------------------------------------------- UI
const $ = (id) => document.getElementById(id);
const ui = {
  hud: $('hud'), menu: $('menu'), pause: $('pause'), end: $('end'),
  crosshair: $('crosshair'), hitmarker: $('hitmarker'), scope: $('scope'), vignette: $('vignette'),
  flash: $('flash'), tint: $('tint'), status: $('status'), feed: $('feed'),
  scoreP: $('score-p'), scoreA: $('score-a'), roundLabel: $('round-label'),
  enemyWeapon: $('enemy-weapon'), enemyHp: $('enemy-hp'), enemyShield: $('enemy-shield'), enemyStatus: $('enemy-status'),
  hpText: $('hp-text'), hpFill: $('hp-fill'), shieldFill: $('shield-fill'), weaponName: $('weapon-name'), ammo: $('ammo'),
  center: $('center'), centerMain: $('center-main'), centerSub: $('center-sub'),
  lockHint: $('lock-hint'), endTitle: $('end-title'), endSub: $('end-sub'),
  ppStats: $('pp-stats'), dmgLayer: $('dmg-layer'), enemyLabel: $('enemy-label'),
};
const abEls = {};
for (const s of SLOTS) {
  const el = document.querySelector(`.ab[data-slot="${s}"]`);
  abEls[s] = { el, cd: el.querySelector('.cd'), ico: el.querySelector('.ico'), num: el.querySelector('.num'), nm: el.querySelector('.nm') };
}

const settings = { playerWeapon: 'sword', aiWeapon: 'random', difficulty: 'normal', sens: 1, assist: 'off' };
try { Object.assign(settings, JSON.parse(localStorage.getItem('arena-duel-settings') || '{}')); } catch {}
function saveSettings() {
  try { localStorage.setItem('arena-duel-settings', JSON.stringify(settings)); } catch {}
}

const KEY_LABEL = { shift: 'SHIFT', e: 'E', q: 'Q' };
const WEAPON_IDS = Object.keys(WEAPONS);
if (!WEAPONS[settings.playerWeapon]) settings.playerWeapon = 'sword';
if (settings.aiWeapon !== 'random' && !WEAPONS[settings.aiWeapon]) settings.aiWeapon = 'random';

function buildMenu() {
  const roster = $('roster');
  for (const w of Object.values(WEAPONS)) {
    const el = document.createElement('button');
    el.className = 'tile';
    el.dataset.id = w.id;
    el.style.setProperty('--c', w.color);
    el.innerHTML = `<div class="tile-icon">${w.icon}</div><div class="tile-name">${w.name}</div><div class="tile-role">${w.role}</div>`;
    el.onclick = () => { settings.playerWeapon = w.id; refreshMenu(); };
    roster.append(el);
  }
  const opp = $('ai-weapon');
  for (const [val, icon, label, color] of [['random', '🎲', 'Random', '#8b93b8'], ...Object.values(WEAPONS).map((w) => [w.id, w.icon, w.name, w.color])]) {
    const b = document.createElement('button');
    b.dataset.val = val;
    b.style.setProperty('--c', color);
    b.innerHTML = `<span>${icon}</span>${label}`;
    b.onclick = () => { settings.aiWeapon = val; refreshMenu(); };
    opp.append(b);
  }
  const diff = $('difficulty');
  for (const [val, label] of [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']]) {
    const b = document.createElement('button');
    b.textContent = label;
    b.dataset.val = val;
    b.onclick = () => { settings.difficulty = val; refreshMenu(); };
    diff.append(b);
  }
  const assist = $('assist');
  for (const [val, label] of [['off', 'Off'], ['light', 'Light'], ['strong', 'Strong']]) {
    const b = document.createElement('button');
    b.textContent = label;
    b.dataset.val = val;
    b.onclick = () => { settings.assist = val; refreshMenu(); };
    assist.append(b);
  }
  const sens = $('sens');
  sens.value = settings.sens;
  sens.oninput = () => { settings.sens = +sens.value; refreshMenu(); };
  addEventListener('keydown', (e) => {
    if (state !== 'menu' || (e.code !== 'ArrowLeft' && e.code !== 'ArrowRight')) return;
    const i = WEAPON_IDS.indexOf(settings.playerWeapon) + (e.code === 'ArrowRight' ? 1 : -1);
    settings.playerWeapon = WEAPON_IDS[(i + WEAPON_IDS.length) % WEAPON_IDS.length];
    refreshMenu();
  });
  refreshMenu();
}

let shownFighter = null;
function renderFighter(w) {
  const host = $('fighter');
  host.style.setProperty('--c', w.color);
  const stat = (label, v) =>
    `<div class="stat"><span>${label}</span><div class="pips">${Array.from({ length: 10 }, (_, i) =>
      `<i class="${i < Math.floor(v) ? 'on' : i < v ? 'half' : ''}"></i>`).join('')}</div></div>`;
  const abl = SLOTS.map((s) => {
    const a = w.abilities[s];
    const cd = s === 'q' ? 'ULTIMATE' : `${a.cd}s`;
    return `<div class="ability${s === 'q' ? ' ult' : ''}">
      <div class="ability-icon">${a.icon}<kbd>${KEY_LABEL[s]}</kbd></div>
      <div class="ability-text"><div class="ability-top"><b>${a.name}</b><small>${cd}</small></div><p>${a.desc}</p></div>
    </div>`;
  }).join('');
  host.innerHTML = `
    <div class="portrait">
      <div class="portrait-icon">${w.icon}</div>
      <div class="portrait-info">
        <div class="portrait-name">${w.name}</div>
        <div class="chips"><span class="chip role">${w.role}</span><span class="chip">${w.maxHealth} HP</span><span class="chip">${w.type === 'melee' ? 'Melee' : 'Ranged'}</span></div>
        <p class="portrait-desc">${w.desc}</p>
        <div class="stats">${stat('Damage', w.stats.damage)}${stat('Speed', w.stats.speed)}${stat('Health', w.stats.health)}${stat('Range', w.stats.range)}</div>
      </div>
    </div>
    <div class="abilities-list">${abl}${w.extra ? `<div class="ability extra">
      <div class="ability-icon">${w.extra.icon}<kbd>${w.extra.key}</kbd></div>
      <div class="ability-text"><div class="ability-top"><b>${w.extra.name}</b><small>${w.extra.key === 'RMB' ? 'RIGHT CLICK' : 'PASSIVE'}</small></div><p>${w.extra.desc}</p></div>
    </div>` : ''}</div>`;
  host.classList.remove('enter');
  void host.offsetWidth; // restart the entrance animation
  host.classList.add('enter');
}

function refreshMenu() {
  document.querySelectorAll('#roster .tile').forEach((c) => c.classList.toggle('selected', c.dataset.id === settings.playerWeapon));
  document.querySelectorAll('#ai-weapon button').forEach((b) => b.classList.toggle('active', b.dataset.val === settings.aiWeapon));
  document.querySelectorAll('#difficulty button').forEach((b) => b.classList.toggle('active', b.dataset.val === settings.difficulty));
  document.querySelectorAll('#assist button').forEach((b) => b.classList.toggle('active', b.dataset.val === settings.assist));
  $('sens-val').textContent = (+settings.sens).toFixed(1);
  if (shownFighter !== settings.playerWeapon) {
    shownFighter = settings.playerWeapon;
    renderFighter(WEAPONS[shownFighter]);
  }
  saveSettings();
}
buildMenu();

let centerT = 0;
function showCenter(main, sub = '', cls = '', duration = 0) {
  ui.centerMain.textContent = main;
  ui.centerSub.textContent = sub;
  ui.center.className = 'show ' + cls;
  centerT = duration;
}
function hideCenter() { ui.center.className = ''; }

let hitT = 0;
function showHitmarker(big) {
  ui.hitmarker.className = 'show' + (big ? ' kill' : '');
  hitT = big ? 0.3 : 0.12;
}

function feed(text, cls = '') {
  const el = document.createElement('div');
  el.className = 'msg ' + cls;
  el.textContent = text;
  ui.feed.prepend(el);
  while (ui.feed.children.length > 4) ui.feed.lastChild.remove();
  setTimeout(() => el.classList.add('fade'), 2200);
  setTimeout(() => el.remove(), 2700);
}

// ---------------------------------------------------------------- input
const keys = {};
const CLICK_BUFFER = 0.3; // seconds a semi-auto click stays queued
// Keyboard fire keys, so TrackPoint / touchpad players don't have to click while steering the camera
const FIRE_KEY = 'KeyF', ALT_KEY = 'KeyC';
const fireHeld = () => mouseDown || !!keys[FIRE_KEY];
const altHeld = () => rightDown || !!keys[ALT_KEY];
let triggerT = 0;
let mouseDown = false, rightDown = false, triggerQueued = false, rightQueued = false, jumpQueued = false;
let devLock = false; // dev-only: lets automated tests act without pointer lock
const isLocked = () => devLock || document.pointerLockElement === canvas;
const ABILITY_KEYS = { ShiftLeft: 'shift', ShiftRight: 'shift', KeyE: 'e', KeyQ: 'q' };

function lockPointer() {
  try {
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  } catch {}
}

addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys[e.code] = true;
  if (e.code === 'Space') { e.preventDefault(); jumpQueued = true; }
  if (e.code === 'Backquote') { e.preventDefault(); toggleAimbot(); }
  if (e.code === FIRE_KEY) triggerQueued = true;
  if (e.code === ALT_KEY) rightQueued = true;
  if (state !== 'playing') return;
  if (e.code === 'KeyR') { player.dumpLeft = 0; startReload(player); }
  if (mode === 'practice' && /^Digit[1-9]$/.test(e.code)) {
    const id = Object.keys(WEAPONS)[+e.code.slice(5) - 1];
    if (id) switchPlayerWeapon(id);
  }
  const slot = ABILITY_KEYS[e.code];
  if (slot && player.alive) abilities.use(player, slot, { dir: playerMoveDir(true) });
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouseDown = rightDown = false; });
addEventListener('contextmenu', (e) => e.preventDefault());

addEventListener('mousedown', (e) => {
  if (!isLocked()) return;
  if (e.button === 0) { mouseDown = true; triggerQueued = true; }
  if (e.button === 2) { rightDown = true; rightQueued = true; }
});
addEventListener('mouseup', (e) => {
  if (e.button === 0) mouseDown = false;
  if (e.button === 2) rightDown = false;
});
addEventListener('mousemove', (e) => {
  if (!isLocked() || !player.alive) return;
  const s = 0.0022 * settings.sens * (player.scopeAmt > 0.5 ? 0.3 : 1) * assistSlow;
  player.yaw -= e.movementX * s;
  player.pitch = Math.max(-1.5, Math.min(1.5, player.pitch - e.movementY * s));
  viewModel.sway(e.movementX, e.movementY);
});

canvas.addEventListener('click', () => {
  if (['playing', 'countdown', 'roundEnd'].includes(state) && !isLocked()) lockPointer();
});

document.addEventListener('pointerlockchange', () => {
  if (isLocked()) {
    ui.lockHint.classList.add('hidden');
    if (state === 'paused') resume();
  } else {
    mouseDown = rightDown = false;
    if (['playing', 'countdown', 'roundEnd'].includes(state)) pause();
  }
});

$('start').onclick = () => {
  initAudio();
  ui.menu.classList.add('hidden');
  ui.hud.classList.remove('hidden');
  startMatch();
  lockPointer();
};
$('practice').onclick = () => {
  initAudio();
  ui.menu.classList.add('hidden');
  ui.hud.classList.remove('hidden');
  startPractice();
  lockPointer();
};
$('resume').onclick = () => lockPointer();
$('quit').onclick = () => toMenu();
$('rematch').onclick = () => {
  ui.end.classList.add('hidden');
  ui.hud.classList.remove('hidden');
  startMatch();
  lockPointer();
};
$('to-menu').onclick = () => toMenu();

/** Movement-key direction in world XZ (forward if none and fallbackForward). */
function playerMoveDir(fallbackForward) {
  const f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
  const s = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
  let x = -sin * f + cos * s, z = -cos * f - sin * s;
  const l = Math.hypot(x, z);
  if (l > 0) return [x / l, z / l];
  return fallbackForward ? [-sin, -cos] : [0, 0];
}

// ---------------------------------------------------------------- game state
let state = 'menu';
let prevState = null;
let stateT = 0;
let round = 0;
let lastBeep = 0;
const score = { player: 0, ai: 0 };
let pending = [];   // delayed melee strikes
let hurtFlash = 0;
let flashAmt = 0;
let camKick = 0;
let shakeAmt = 0;
let fovKick = 0;
let wasUltReady = false;

function pause() {
  prevState = state;
  state = 'paused';
  ui.pause.classList.remove('hidden');
}
function resume() {
  if (state !== 'paused') return;
  state = prevState;
  ui.pause.classList.add('hidden');
}
function toMenu() {
  state = 'menu';
  if (isLocked()) document.exitPointerLock();
  ui.pause.classList.add('hidden');
  ui.end.classList.add('hidden');
  ui.hud.classList.add('hidden');
  ui.menu.classList.remove('hidden');
  laser.visible = false;
  abilities.clear();
  enemy.model.setStatus({});
  hideCenter();
  setMode('duel');
  clearDmgNumbers();
}

function setMode(m) {
  mode = m;
  const p = m === 'practice';
  useArena(p ? practiceArena : duelArena);
  for (const d of dummies) d.model.group.visible = p;
  enemy.model.group.visible = !p;
  ui.hud.classList.toggle('practice', p);
}

function startPractice() {
  if (!dummies.length) for (const h of practiceArena.dummies) dummies.push(makeDummy(h));
  setMode('practice');
  for (const d of dummies) resetDummy(d);
  lastDummy = null;
  Object.assign(practice, { combo: 0, comboStart: 0, lastHit: -99, best: 0 });
  enemy.alive = false;
  enemy.pos.set(0, -50, 0);
  resetEntity(player, settings.playerWeapon, practiceArena.spawns[0], 0);
  player.ult = 100;
  player.scopeAmt = 0;
  player.deathT = 0;
  pending = [];
  effects.clear();
  abilities.clear();
  clearDmgNumbers();
  hurtFlash = flashAmt = 0;
  laser.visible = false;
  applyPlayerWeaponUI();
  ui.roundLabel.textContent = 'PRACTICE RANGE';
  ui.enemyWeapon.textContent = '🎯 Training dummy';
  state = 'playing';
  wasUltReady = true;
  showCenter('PRACTICE', `Dummies can't die · 1–${WEAPON_IDS.length} switch fighter · Ult charges fast`, 'fight', 2.5);
}

/** Practice only: swap fighter on the spot. */
function switchPlayerWeapon(id) {
  if (player.weapon.id === id) return;
  const w = WEAPONS[id];
  player.weapon = w;
  player.maxHealth = player.health = w.maxHealth;
  player.ammo = w.mag || 0;
  player.cooldown = player.reloadT = 0;
  player.force = null;
  resetAbilities(player, true);
  settings.playerWeapon = id;
  refreshMenu();
  applyPlayerWeaponUI();
  feed(`${w.icon} ${w.name.toUpperCase()}`, 'good');
}

function applyPlayerWeaponUI() {
  viewModel.set(player.weapon.id);
  ui.crosshair.className = player.weapon.type === 'melee' ? 'melee' : player.weapon.id;
  for (const s of SLOTS) {
    const a = player.weapon.abilities[s];
    abEls[s].ico.textContent = a.icon;
    abEls[s].nm.textContent = a.name;
  }
  ui.weaponName.textContent = `${player.weapon.icon} ${player.weapon.name.toUpperCase()}`;
}

function pickAiWeapon() {
  if (settings.aiWeapon !== 'random') return settings.aiWeapon;
  const ids = Object.keys(WEAPONS);
  return ids[Math.floor(Math.random() * ids.length)];
}

function resetEntity(ent, weaponId, spawn, yaw) {
  const w = WEAPONS[weaponId];
  ent.weapon = w;
  ent.maxHealth = ent.health = w.maxHealth;
  ent.ammo = w.mag || 0;
  ent.cooldown = 0;
  ent.reloadT = 0;
  ent.alive = true;
  ent.pos.copy(spawn);
  ent.vel.set(0, 0, 0);
  ent.yaw = yaw;
  ent.pitch = 0;
  ent.grounded = true;
  resetAbilities(ent, true); // ult charge carries over between rounds
}

function startMatch() {
  setMode('duel');
  clearDmgNumbers();
  score.player = score.ai = 0;
  round = 0;
  player.ult = enemy.ult = 0;
  startRound();
}

function startRound() {
  round++;
  // swap sides every round
  const flip = round % 2 === 0;
  const [sp, se] = flip ? [arena.spawns[1], arena.spawns[0]] : [arena.spawns[0], arena.spawns[1]];
  resetEntity(player, settings.playerWeapon, sp, flip ? 0 : Math.PI);
  resetEntity(enemy, pickAiWeapon(), se, flip ? Math.PI : 0);
  player.scopeAmt = 0;
  player.deathT = 0;
  enemy.model.reset();
  enemy.model.setWeapon(enemy.weapon.id);
  viewModel.set(player.weapon.id);
  ai.reset(DIFFICULTY[settings.difficulty]);
  pending = [];
  effects.clear();
  abilities.clear();
  hurtFlash = flashAmt = 0;
  laser.visible = false;
  state = 'countdown';
  stateT = 3;
  lastBeep = 4;
  wasUltReady = player.ult >= 100;
  applyPlayerWeaponUI();
  updateScoreUI();
}

function endRound(winner, head, weapon) {
  score[winner]++;
  state = 'roundEnd';
  stateT = 3;
  laser.visible = false;
  const won = winner === 'player';
  const how = (head ? 'HEADSHOT · ' : '') + (won ? `You beat the AI with the ${weapon.name}` : `The AI got you with the ${weapon.name}`);
  showCenter(won ? 'ROUND WON' : 'ROUND LOST', how, won ? 'win' : 'lose');
  won ? sfx.roundWin() : sfx.roundLose();
  updateScoreUI();
}

function endMatch() {
  state = 'matchEnd';
  hideCenter();
  if (isLocked()) document.exitPointerLock();
  const won = score.player > score.ai;
  ui.endTitle.textContent = won ? 'VICTORY' : 'DEFEAT';
  ui.endTitle.className = won ? 'win' : 'lose';
  ui.endSub.textContent = `You ${score.player} — ${score.ai} AI  ·  ${settings.difficulty.toUpperCase()}`;
  ui.hud.classList.add('hidden');
  ui.end.classList.remove('hidden');
  won ? sfx.win() : sfx.lose();
}

function updateScoreUI() {
  ui.scoreP.textContent = score.player;
  ui.scoreA.textContent = score.ai;
  ui.roundLabel.textContent = `ROUND ${round}`;
  ui.enemyWeapon.textContent = `${enemy.weapon.icon} ${enemy.weapon.name}`;
  ui.weaponName.textContent = `${player.weapon.icon} ${player.weapon.name.toUpperCase()}`;
}

// ---------------------------------------------------------------- physics helpers
function moveEntity(ent, wishX, wishZ, speed, wantJump, dt) {
  if (ent.stunT > 0) { wishX = wishZ = 0; wantJump = false; }
  const f = ent.force;
  if (f) {
    f.t -= dt;
    if (f.type === 'grapple') {
      const dx = f.point.x - ent.pos.x, dy = f.point.y - ent.pos.y, dz = f.point.z - ent.pos.z;
      const d = Math.hypot(dx, dy, dz);
      if (d < 1.2 || f.t <= 0) {
        ent.force = null;
        ent.vel.multiplyScalar(0.35);
        ent.vel.y = 5;
      } else {
        ent.vel.set((dx / d) * 24, (dy / d) * 24, (dz / d) * 24);
      }
    } else if (f.type === 'leap') {
      ent.vel.x = f.vx;
      ent.vel.z = f.vz;
      if (f.t <= 0) ent.force = null;
    } else if (f.type === 'pull') {
      // yanked toward the hook's owner until right in front of them
      const o = f.owner;
      const dx = o.pos.x - ent.pos.x, dz = o.pos.z - ent.pos.z;
      const d = Math.hypot(dx, dz);
      const stop = RADIUS * (sizeOf(o) + sizeOf(ent)) + 0.9;
      if (d <= stop + 0.05 || f.t <= 0 || !o.alive) {
        ent.force = null;
        ent.vel.x *= 0.15;
        ent.vel.z *= 0.15;
      } else {
        const sp = Math.min(24, (d - stop) / Math.max(dt, 1e-3)); // don't overshoot the stop point
        ent.vel.x = (dx / d) * sp;
        ent.vel.z = (dz / d) * sp;
      }
    } else {
      ent.vel.x = f.vx;
      ent.vel.z = f.vz;
      if (f.vy) ent.vel.y = f.vy;
      if (f.t <= 0) {
        ent.force = null;
        ent.vel.x *= 0.3;
        ent.vel.z *= 0.3;
        if (f.vy) ent.vel.y *= 0.3;
      }
    }
  } else {
    const k = 1 - Math.exp(-(ent.grounded ? 14 : 3) * dt);
    ent.vel.x += (wishX * speed - ent.vel.x) * k;
    ent.vel.z += (wishZ * speed - ent.vel.z) * k;
    const airJump = ent.airJump;
    ent.airJump = false;
    if (wantJump && ent.grounded) {
      ent.vel.y = JUMP_VEL;
      ent.grounded = false;
    } else if (airJump && !ent.grounded && ent.weapon.doubleJump && !ent.doubleUsed && ent.stunT <= 0) {
      ent.vel.y = JUMP_VEL;
      ent.doubleUsed = true;
      effects.ring(ent.pos, 0x9fe8ff, 1.3, 0.3);
      sfx.dash(ent === player ? 0.5 : Math.max(0.15, 0.5 - ent.pos.distanceTo(player.pos) / 60));
    }
  }
  const noGravity = ent.force && (ent.force.type === 'grapple' || ent.force.vy);
  if (!noGravity) ent.vel.y -= GRAVITY * dt;
  ent.pos.x += ent.vel.x * dt;
  ent.pos.z += ent.vel.z * dt;
  const rad = RADIUS * sizeOf(ent);
  resolveCircle(ent.pos, rad, arena.colliders);
  ent.pos.x = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, ent.pos.x));
  ent.pos.z = Math.max(-ARENA_HALF, Math.min(ARENA_HALF, ent.pos.z));
  const prevY = ent.pos.y;
  ent.pos.y += ent.vel.y * dt;
  const g = groundHeight(ent.pos, prevY, rad, arena.colliders);
  if (ent.pos.y <= g) {
    ent.pos.y = g;
    if (ent.vel.y < 0) ent.vel.y = 0;
    ent.grounded = true;
    ent.doubleUsed = false;
  } else {
    ent.grounded = false;
  }
  // meteor slam landing
  const lf = ent.force;
  if (lf && lf.type === 'leap') {
    if (!ent.grounded) lf.air = true;
    else if (lf.air) {
      ent.force = null;
      ent.vel.x = ent.vel.z = 0;
      lf.onLand();
    }
  }
}

function separate(a, b) {
  const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
  const d = Math.hypot(dx, dz);
  const min = RADIUS * (sizeOf(a) + sizeOf(b));
  if (d < min && d > 1e-4 && Math.abs(a.pos.y - b.pos.y) < 1.7) {
    const push = (min - d) / 2;
    a.pos.x -= (dx / d) * push; a.pos.z -= (dz / d) * push;
    b.pos.x += (dx / d) * push; b.pos.z += (dz / d) * push;
  }
}

const STEER = [0.45, 0.9, 1.4, 2.0, 2.6];
function steer(ent, dx, dz) {
  const tryDir = (a, far) => {
    const c = Math.cos(a), s = Math.sin(a);
    const x = dx * c - dz * s, z = dx * s + dz * c;
    if (blockedAt(ent.pos.x + x * 0.9, ent.pos.z + z * 0.9, ent.pos.y, RADIUS + 0.05, arena.colliders)) return null;
    if (far && blockedAt(ent.pos.x + x * 1.8, ent.pos.z + z * 1.8, ent.pos.y, RADIUS, arena.colliders)) return null;
    return [x, z];
  };
  for (const far of [true, false]) {
    const r = tryDir(0, far);
    if (r) return r;
    for (const a of STEER) {
      for (const side of [ent.steerSide, -ent.steerSide]) {
        const r2 = tryDir(a * side, far);
        if (r2) { ent.steerSide = side; return r2; }
      }
    }
  }
  return [dx, dz];
}

const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _m = new THREE.Vector3();
const _end = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

function worldHit(origin, dir, far) {
  raycaster.set(origin, dir);
  raycaster.far = far;
  const h = raycaster.intersectObjects(arena.meshes, false);
  return h.length ? h[0] : null;
}

function clearLine(from, to) {
  _c.subVectors(to, from);
  const dist = _c.length();
  if (dist < 0.01) return true;
  _c.divideScalar(dist);
  return !worldHit(from, _c, dist - 0.05);
}

function canSee(from, ent, h) {
  _a.set(ent.pos.x, ent.pos.y + h, ent.pos.z);
  return clearLine(from, _a);
}

function jitter(dir, amount) {
  if (amount <= 0) return dir;
  const r = () => (Math.random() + Math.random() + Math.random() - 1.5) * 0.8;
  dir.x += r() * amount; dir.y += r() * amount; dir.z += r() * amount;
  return dir.normalize();
}

/** Is `def` facing toward `att` (for deflect / parry)? */
function facing(def, att) {
  const dx = att.pos.x - def.pos.x, dz = att.pos.z - def.pos.z;
  const d = Math.hypot(dx, dz) || 1;
  return (dx * -Math.sin(def.yaw) + dz * -Math.cos(def.yaw)) / d > 0.2;
}

// ---------------------------------------------------------------- abilities context
const abilities = new Abilities({
  scene, effects, player, enemy,
  opponents: opponentsOf,
  entities: allEntities,
  ultMult: () => (mode === 'practice' ? 8 : 1),
  applyDamage: (t, dmg, a, head) => applyDamage(t, dmg, a, head),
  worldHit, clearLine,
  aimRay(ent, o, d) {
    if (ent === player) {
      camera.updateMatrixWorld();
      camera.getWorldPosition(o);
      camera.getWorldDirection(d);
    } else {
      o.set(ent.pos.x, ent.pos.y + EYE * sizeOf(ent), ent.pos.z);
      d.set(-Math.sin(ent.yaw) * Math.cos(ent.pitch), Math.sin(ent.pitch), -Math.cos(ent.yaw) * Math.cos(ent.pitch));
    }
  },
  ropeOrigin(ent, out) {
    if (ent === player) return camera.localToWorld(out.set(0.25, -0.3, -0.4));
    return enemy.model.getMuzzle(out);
  },
  flash(a) { flashAmt = Math.max(flashAmt, a); },
  shake(a) { shakeAmt = Math.max(shakeAmt, a); },
  feed,
  vmAttack: () => viewModel.attack(),
});

// ---------------------------------------------------------------- combat
function addUlt(ent, amount) {
  if (!ultActive(ent)) ent.ult = Math.min(100, ent.ult + amount);
}

function applyDamage(target, dmg, attacker, head) {
  if (!target.alive || state !== 'playing') return;
  if (target.juggT > 0) dmg *= 0.5;
  let rem = dmg;
  if (target.shield > 0) {
    const absorbed = Math.min(target.shield, rem);
    target.shield -= absorbed;
    rem -= absorbed;
  }
  target.health = Math.max(0, target.health - rem);
  target.lastHurtT = 0;
  const charge = Math.min(dmg, 100);
  if (attacker && attacker !== target) addUlt(attacker, charge * ULT_RATE.dealt);
  addUlt(target, charge * ULT_RATE.taken);

  let killed = target.health <= 0;
  if (target !== player) {
    showHitmarker(killed || head);
    head ? sfx.headshot() : sfx.hitmark();
    target.model.flash();
    spawnDmgNumber(target, dmg, head);
  } else {
    hurtFlash = Math.min(1, hurtFlash + 0.3 + rem / 120);
    camKick += 0.02;
    sfx.hurt();
  }
  if (target.dummy) {
    lastDummy = target;
    const now = performance.now() / 1000;
    if (now - practice.lastHit > 2) { practice.combo = 0; practice.comboStart = now; }
    practice.combo += dmg;
    practice.lastHit = now;
    practice.best = Math.max(practice.best, practice.combo);
    if (killed) {
      target.health = target.maxHealth;
      effects.burst(new THREE.Vector3(target.pos.x, target.pos.y + 1.2, target.pos.z), 0x3dffa2, 20, 5);
      feed('DUMMY "KILLED" — HP RESET', 'good');
    }
    return;
  }
  if (mode === 'practice' && target === player) { target.health = Math.max(1, target.health); return; }
  if (killed) {
    target.alive = false;
    target.force = null;
    if (target === enemy) enemy.model.die();
    endRound(attacker === player ? 'player' : 'ai', head, attacker.weapon);
  }
}

function fireHitscan(shooter, origin, dir, muzzle, extraWidth = 1) {
  const w = shooter.weapon;
  const pierce = shooter.railT > 0;
  const wh = worldHit(origin, dir, 300);
  let eh = null, target = null;
  for (const t of opponentsOf(shooter)) {
    if (!t.alive) continue;
    const h = rayVsEntity(origin, dir, t);
    if (h && (!eh || h.dist < eh.dist)) { eh = h; target = t; }
  }
  const sniper = w.id === 'sniper';
  const color = pierce ? 0xc07bff : w.tracer;
  const width = (pierce ? 0.06 : sniper ? 0.035 : 0.014) * extraWidth;

  if (eh && (pierce || !wh || eh.dist < wh.distance)) {
    _end.copy(eh.point);
    const head = eh.part === 'head';
    if (target.deflectT > 0 && facing(target, shooter)) {
      // Deflect: send the bullet back at the shooter (body damage)
      effects.tracer(muzzle, _end, color, 0.06, width);
      _a.set(shooter.pos.x, shooter.pos.y + 1.2, shooter.pos.z);
      effects.tracer(_end, _a, 0x66f0ff, 0.15, 0.03);
      effects.burst(_end, 0x66f0ff, 10, 3);
      sfx.deflect();
      if (shooter === player) feed('DEFLECTED!', 'bad');
      applyDamage(shooter, w.damage, target, false);
      return;
    }
    const dmg = head ? (w.headDamage ?? w.damage * w.headMult) : w.damage;
    effects.burst(_end, head ? 0xfff080 : 0xff2a3a, head ? 16 : 7, 3);
    applyDamage(target, dmg, shooter, head);
  } else if (wh) {
    _end.copy(wh.point);
    effects.burst(_end, 0xbfd6ff, 5, 2);
  } else {
    _end.copy(origin).addScaledVector(dir, 300);
  }
  effects.tracer(muzzle, _end, color, sniper ? 0.3 : 0.06, width);
}

/** Shotgun: many pellets, each with distance falloff; damage is summed per target and applied once. */
const _pd = new THREE.Vector3();
function fireShotgun(shooter, origin, dir, muzzle, mode) {
  const w = shooter.weapon, cfg = w[mode] || w.blast;
  const fire = shooter.breathT > 0;
  const totals = new Map();
  for (let i = 0; i < cfg.pellets; i++) {
    _pd.copy(dir);
    jitter(_pd, cfg.spread);
    const wh = worldHit(origin, _pd, 120);
    let eh = null, target = null;
    for (const t of opponentsOf(shooter)) {
      if (!t.alive) continue;
      const h = rayVsEntity(origin, _pd, t);
      if (h && (!eh || h.dist < eh.dist)) { eh = h; target = t; }
    }
    let end;
    if (eh && (!wh || eh.dist < wh.distance)) {
      end = eh.point;
      const [near, far] = cfg.falloff;
      const k = Math.min(1, Math.max(0, (eh.dist - near) / (far - near)));
      const head = eh.part === 'head';
      const dmg = cfg.damage * (1 - (1 - cfg.minMult) * k) * (head ? w.headMult : 1);
      const tot = totals.get(target) || { dmg: 0, head: false };
      tot.dmg += dmg;
      tot.head = tot.head || head;
      totals.set(target, tot);
      effects.burst(end, fire ? 0xff7a1a : head ? 0xfff080 : 0xff2a3a, 3, 2.5);
    } else if (wh) {
      end = wh.point.clone();
      effects.burst(end, fire ? 0xff7a1a : 0xbfd6ff, 2, 1.5);
    } else {
      end = origin.clone().addScaledVector(_pd, 120);
    }
    effects.tracer(muzzle, end, fire ? 0xff5a1a : w.tracer, 0.07, mode === 'choke' ? 0.014 : 0.011);
  }
  for (const [t, { dmg, head }] of totals) {
    if (t.deflectT > 0 && facing(t, shooter)) {
      _a.set(shooter.pos.x, shooter.pos.y + 1.2, shooter.pos.z);
      _b.set(t.pos.x, t.pos.y + 1.2, t.pos.z);
      effects.tracer(_b, _a, 0x66f0ff, 0.15, 0.03);
      effects.burst(_b, 0x66f0ff, 12, 3);
      sfx.deflect();
      if (shooter === player) feed('DEFLECTED!', 'bad');
      applyDamage(shooter, dmg * 0.5, t, false);
      continue;
    }
    if (fire) abilities.ignite(t, shooter);
    applyDamage(t, dmg, shooter, head);
  }
}

function startReload(ent) {
  const w = ent.weapon;
  if (!w.mag || ent.reloadT > 0 || ent.ammo >= w.mag || ent.stormT > 0 || ent.breathT > 0) return;
  ent.reloadT = w.reload;
  if (ent === player) sfx.reload();
}

function meleeRange(ent) {
  return ent.weapon.range + (ent.furyT > 0 ? 1.5 : 0) + (ent.juggT > 0 ? 0.6 : 0);
}

function resolveMelee(a, t) {
  if (!a.alive || !t.alive || a.stunT > 0) return;
  const w = a.weapon;
  const dx = t.pos.x - a.pos.x, dz = t.pos.z - a.pos.z, dy = t.pos.y - a.pos.y;
  const dist = Math.hypot(dx, dz);
  const volume = a === player ? 1 : Math.max(0.15, 1 - dist / 25);
  if (a !== player) (w.id === 'fists' ? sfx.punch(volume) : sfx.swing(volume));
  if (dist > meleeRange(a) + RADIUS * sizeOf(t) || Math.abs(dy) > 1.5) return;
  const fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw);
  if (dist > 0.5 && a.juggT <= 0 && (dx * fx + dz * fz) / dist < 0.5) return;
  _o.set(a.pos.x, a.pos.y + 1.2, a.pos.z);
  _m.set(t.pos.x, t.pos.y + 1.2, t.pos.z);
  _d.subVectors(_m, _o);
  const len = _d.length();
  _d.divideScalar(len || 1);
  if (worldHit(_o, _d, len)) return;
  if (t.deflectT > 0 && facing(t, a)) {
    a.stunT = Math.max(a.stunT, 1);
    effects.burst(_m, 0x66f0ff, 14, 3);
    sfx.parry();
    feed(a === player ? 'PARRIED — STUNNED!' : 'PARRY!', a === player ? 'bad' : 'good');
    return;
  }
  effects.burst(_m, 0xff2a3a, w.heavy ? 20 : 12, w.heavy ? 5 : 3.5);
  w.id === 'sword' ? sfx.slash() : sfx.thud();
  if (w.heavy) shakeAmt = Math.max(shakeAmt, t === player ? 0.45 : 0.2);
  applyDamage(t, w.damage, a, false);
}

function gunCooldown(ent) {
  const w = ent.weapon;
  if (ent.railT > 0) return 0.6;
  if (ent.breathT > 0) return w.cooldown * 0.6;
  if (ent.stormT > 0) return w.cooldown / 1.5;
  return w.cooldown;
}

/** fan: true = Pistol Fan Fire shot; 'blast' / 'choke' = Shotgun fire mode. */
function playerAttack(fan = false) {
  const w = player.weapon;
  if (player.cooldown > 0 || player.reloadT > 0 || player.stunT > 0 || player.deflectT > 0) return;
  if (w.type === 'melee') {
    player.cooldown = player.furyT > 0 ? 0.4 : w.cooldown;
    viewModel.attack();
    w.id === 'fists' ? sfx.punch() : sfx.swing();
    pending.push({ attacker: player, target: null, t: w.windup });
    return;
  }
  if (player.ammo <= 0) {
    player.dumpLeft = 0;
    sfx.empty();
    startReload(player);
    return;
  }
  if (player.stormT <= 0 && player.breathT <= 0) player.ammo--;
  player.cooldown = fan === true ? w.fan.cooldown : gunCooldown(player);
  if (w.blast) {
    camera.updateMatrixWorld();
    camera.getWorldPosition(_o);
    camera.getWorldDirection(_d);
    if (player.moving) jitter(_d, w.moveSpread);
    viewModel.getMuzzleWorld(_m, camera);
    fireShotgun(player, _o, _d, _m, fan);
    viewModel.recoil();
    camKick += fan === 'choke' ? 0.035 : 0.055;
    shakeAmt = Math.max(shakeAmt, 0.12);
    sfx.shotgun();
    if (player.ammo > 0 || player.breathT > 0) sfx.pump();
    if (player.ammo <= 0) startReload(player);
    return;
  }
  camera.updateMatrixWorld();
  camera.getWorldPosition(_o);
  camera.getWorldDirection(_d);
  const SCOPED = 0.6; // same threshold that shows the scope overlay
  let spread = w.scope && player.scopeAmt > SCOPED ? w.scopedSpread : w.spread;
  if (player.moving) spread += w.moveSpread;
  if (!player.grounded) spread += w.moveSpread * 2;
  if (fan) { spread += w.fan.spread; player.dumpLeft--; }

  // Deadeye: lock on to the target closest to the crosshair
  if (player.stormT > 0) {
    let best = Math.cos(0.3);
    for (const t of opponentsOf(player)) {
      if (!t.alive) continue;
      _c.set(t.pos.x, t.pos.y + 1.0 * sizeOf(t), t.pos.z).sub(_o).normalize();
      const dot = _c.dot(_d);
      if (dot > best) {
        const dirToT = _c.clone(); // canSee() reuses the scratch vectors
        if (canSee(_o, t, 1.0)) { best = dot; _b.copy(dirToT); }
      }
    }
    if (best > Math.cos(0.3)) { _d.copy(_b); spread = 0.004; }
  }
  if (aimbot) spread = 0;
  jitter(_d, spread);
  if (player.scopeAmt > 0.6) camera.localToWorld(_m.set(0.06, -0.15, -0.5));
  else viewModel.getMuzzleWorld(_m, camera);
  fireHitscan(player, _o, _d, _m, fan ? 1.4 : 1);
  viewModel.recoil();
  camKick += w.id === 'sniper' ? 0.06 : fan ? 0.022 : 0.012;
  if (player.railT > 0) sfx.rail(); else w.id === 'pistol' ? sfx.pistol() : sfx.sniper();
  if (player.ammo <= 0) { player.dumpLeft = 0; startReload(player); }
}

function enemyShoot(fan = false, mode = 'blast') {
  const w = enemy.weapon, d = ai.d;
  if (enemy.stormT <= 0 && enemy.breathT <= 0) enemy.ammo--;
  if (w.blast) {
    enemy.cooldown = gunCooldown(enemy);
    _o.set(enemy.pos.x, enemy.pos.y + EYE * sizeOf(enemy), enemy.pos.z);
    _d.subVectors(ai.aimPoint, _o).normalize();
    jitter(_d, d.aimErr);
    enemy.model.getMuzzle(_m);
    fireShotgun(enemy, _o, _d, _m, mode);
    enemy.model.recoil();
    const v = Math.max(0.25, 1 - enemy.pos.distanceTo(player.pos) / 50);
    sfx.shotgun(v);
    if (enemy.ammo > 0 || enemy.breathT > 0) sfx.pump(v);
    if (enemy.ammo <= 0) startReload(enemy);
    return;
  }
  enemy.cooldown = fan ? w.fan.cooldown : gunCooldown(enemy) * (w.id === 'pistol' && enemy.stormT <= 0 ? d.fireRateMult : 1);
  if (fan) enemy.dumpLeft--;
  _o.set(enemy.pos.x, enemy.pos.y + EYE * sizeOf(enemy), enemy.pos.z);
  if (enemy.stormT > 0 && canSee(_o, player, 1.0)) {
    _d.set(player.pos.x, player.pos.y + 1.0, player.pos.z).sub(_o).normalize();
    jitter(_d, 0.006);
  } else {
    _d.subVectors(ai.aimPoint, _o).normalize();
    jitter(_d, d.aimErr + (w.id === 'pistol' ? w.spread : 0) + (fan ? w.fan.spread : 0));
  }
  enemy.model.getMuzzle(_m);
  fireHitscan(enemy, _o, _d, _m, fan ? 1.4 : 1);
  enemy.model.recoil();
  const vol = Math.max(0.25, 1 - enemy.pos.distanceTo(player.pos) / 50);
  if (enemy.railT > 0) sfx.rail(vol); else w.id === 'pistol' ? sfx.pistol(vol) : sfx.sniper(vol);
  if (enemy.ammo <= 0) { enemy.dumpLeft = 0; startReload(enemy); }
}

// ---------------------------------------------------------------- per-frame updates
// ---------------------------------------------------------------- aim assist
// Light/Strong: the camera slows down while the crosshair is over a target ("sticky" aim)
// and, while you're firing, gently pulls toward the nearest target close to the crosshair.
const ASSIST = {
  off: null,
  light: { slow: 0.6, cone: 0.06, pull: 3 },
  strong: { slow: 0.4, cone: 0.11, pull: 7 },
};
let assistSlow = 1;
const wrapAng = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// Secret aimbot (toggle with the ` key). Session-only, never saved or shown in the menu.
let aimbot = false;
function toggleAimbot() {
  aimbot = !aimbot;
  document.getElementById('bot-dot').classList.toggle('on', aimbot);
}
function runAimbot(dt) {
  const s = sizeOf(player);
  _o.set(player.pos.x, player.pos.y + EYE * s, player.pos.z);
  const w = player.weapon;
  let best = null, bestErr = Infinity, aimYaw = 0, aimPitch = 0;
  for (const t of opponentsOf(player)) {
    if (!t.alive) continue;
    const ts = sizeOf(t);
    // guns go for the head (shotgun goes center-mass so the whole spread lands), melee for the chest
    const h = (w.type === 'gun' && !w.blast ? HEAD_Y : 1.1) * ts;
    if (!canSee(_o, t, h)) continue;
    const dx = t.pos.x - _o.x, dz = t.pos.z - _o.z, dist = Math.hypot(dx, dz);
    const yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(t.pos.y + h - _o.y, Math.max(0.01, dist));
    const err = Math.hypot(wrapAng(yaw - player.yaw), pitch - player.pitch);
    if (err < bestErr) { best = t; bestErr = err; aimYaw = yaw; aimPitch = pitch; }
  }
  if (!best) return;
  const k = Math.min(1, 30 * dt); // very fast, but not a one-frame teleport
  player.yaw += wrapAng(aimYaw - player.yaw) * k;
  player.pitch += (aimPitch - player.pitch) * k;
}

function aimAssist(dt, act) {
  assistSlow = 1;
  if (aimbot && act && state === 'playing') { runAimbot(dt); return; }
  const cfg = ASSIST[settings.assist];
  if (!cfg || !act || state !== 'playing') return;
  const s = sizeOf(player);
  _o.set(player.pos.x, player.pos.y + EYE * s, player.pos.z);
  let best = null, bestErr = Infinity, bestYaw = 0, bestPitch = 0, bestRadius = 0;
  for (const t of opponentsOf(player)) {
    if (!t.alive) continue;
    const ts = sizeOf(t);
    const dx = t.pos.x - _o.x, dz = t.pos.z - _o.z, dist = Math.hypot(dx, dz);
    if (dist < 0.5 || dist > 60) continue;
    const yaw = Math.atan2(-dx, -dz);
    const pitch = Math.atan2(t.pos.y + 1.1 * ts - _o.y, dist);
    const dyaw = wrapAng(yaw - player.yaw), dpitch = pitch - player.pitch;
    const err = Math.hypot(dyaw * Math.cos(player.pitch), dpitch);
    const radius = Math.atan2(0.55 * ts, dist); // angular size of the body
    if (err > radius + cfg.cone || err >= bestErr) continue;
    if (!canSee(_o, t, 1.1 * ts)) continue;
    best = t; bestErr = err; bestYaw = dyaw; bestPitch = dpitch; bestRadius = radius;
  }
  if (!best) return;
  if (bestErr < bestRadius * 1.2) assistSlow = cfg.slow;
  const firing = fireHeld() || (altHeld() && (player.weapon.blast || player.weapon.fan));
  if (firing) {
    const k = Math.min(1, cfg.pull * dt);
    player.yaw += bestYaw * k;
    player.pitch += bestPitch * k;
  }
}

function updatePlayer(dt, canAct) {
  const w = player.weapon;
  const act = canAct && player.alive && player.stunT <= 0;
  const [fx, fz] = act ? playerMoveDir(false) : [0, 0];
  const speed = BASE_SPEED * w.speedMult * (player.scopeAmt > 0.5 ? 0.55 : 1) * (player.furyT > 0 ? 1.25 : 1) * (player.juggT > 0 ? 1.3 : 1);
  player.airJump = act && jumpQueued;
  jumpQueued = false;
  moveEntity(player, fx, fz, speed, act && keys.Space, dt);
  const hs = Math.hypot(player.vel.x, player.vel.z);
  player.moving = hs > 1;

  player.cooldown -= dt;
  if (player.reloadT > 0) {
    player.reloadT -= dt;
    if (player.reloadT <= 0) { player.reloadT = 0; player.ammo = w.mag; }
  }

  const scoped = act && w.scope && altHeld() && player.reloadT <= 0 && !player.force;
  player.scopeAmt += ((scoped ? 1 : 0) - player.scopeAmt) * (1 - Math.exp(-16 * dt));

  // camera
  camKick *= Math.exp(-dt * 9);
  shakeAmt *= Math.exp(-dt * 6);
  const moving = player.force && player.force.type !== 'leap';
  fovKick += ((moving ? 14 : 0) - fovKick) * Math.min(1, dt * 12);
  if (!player.alive) player.deathT += dt;
  const deathF = Math.min(1, player.deathT / 0.7);
  const bob = player.moving && player.grounded ? Math.sin(performance.now() / 1000 * (8 + hs)) * 0.03 : 0;
  const sx = (Math.random() - 0.5) * shakeAmt * 0.3, sy = (Math.random() - 0.5) * shakeAmt * 0.3;
  camera.position.set(player.pos.x + sx, player.pos.y + EYE * sizeOf(player) + bob + sy - deathF * 1.2, player.pos.z);
  aimAssist(dt, act);
  camera.rotation.set(player.pitch + camKick, player.yaw, deathF * 0.7);
  const fov = 75 + (18 - 75) * player.scopeAmt + fovKick * (1 - player.scopeAmt);
  if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }

  if (!act) player.dumpLeft = 0;
  if (act && isLocked()) {
    // Fan Fire: right-click dumps the whole magazine
    if (w.fan && rightQueued && player.dumpLeft <= 0 && player.reloadT <= 0 && player.ammo > 0) {
      player.dumpLeft = player.stormT > 0 ? w.mag : player.ammo;
    }
    if (player.dumpLeft > 0) {
      playerAttack(true);
    } else if (w.blast) {
      if (fireHeld()) playerAttack('blast');
      else if (altHeld()) playerAttack('choke');
    } else if (w.type === 'gun' && !w.auto) {
      if (triggerQueued) triggerT = CLICK_BUFFER;
      if (triggerT > 0 && player.cooldown <= 0 && player.reloadT <= 0) { triggerT = 0; playerAttack(); }
    } else if (fireHeld()) {
      playerAttack();
    }
  }
  triggerQueued = false;
  rightQueued = false;
  triggerT = Math.max(0, triggerT - dt);
  if (!act) triggerT = 0;

  viewModel.setGlow(player.furyT > 0 || player.juggT > 0 ? 0xff3322 : 0x9fe8ff);
  viewModel.update(dt, {
    visible: player.alive,
    moving: player.moving && player.grounded,
    speed: hs,
    scopeAmt: player.scopeAmt,
    deflect: player.deflectT > 0,
    reloadFrac: player.reloadT > 0 ? 1 - player.reloadT / w.reload : -1,
  });
}

const _eye = new THREE.Vector3();
const aiCtx = {
  target: player,
  los() {
    _eye.set(enemy.pos.x, enemy.pos.y + EYE * sizeOf(enemy), enemy.pos.z);
    return canSee(_eye, player, HEAD_Y * sizeOf(player)) || canSee(_eye, player, 1.0);
  },
};

function updateAI(dt) {
  const w = enemy.weapon, d = ai.d;
  enemy.cooldown -= dt;
  if (enemy.reloadT > 0) {
    enemy.reloadT -= dt;
    if (enemy.reloadT <= 0) { enemy.reloadT = 0; enemy.ammo = w.mag; }
  }
  if (!enemy.alive) { moveEntity(enemy, 0, 0, 0, false, dt); laser.visible = false; return; }

  const out = ai.update(dt, aiCtx);
  if (out.ability) abilities.use(enemy, out.ability.slot, out.ability);

  let mx = out.moveX, mz = out.moveZ;
  const l = Math.hypot(mx, mz);
  if (l > 0.01) { mx /= l; mz /= l; [mx, mz] = steer(enemy, mx, mz); }
  const speed = l > 0.01 ? BASE_SPEED * w.speedMult * d.speedMult * (enemy.furyT > 0 ? 1.25 : 1) * (enemy.juggT > 0 ? 1.3 : 1) * Math.min(1, l) : 0;
  const bx = enemy.pos.x, bz = enemy.pos.z;
  enemy.airJump = out.airJump;
  moveEntity(enemy, mx, mz, speed, out.jump, dt);

  // unstick: flip strafe and hop
  const moved = Math.hypot(enemy.pos.x - bx, enemy.pos.z - bz);
  if (speed > 1 && !enemy.force && enemy.stunT <= 0 && moved < speed * dt * 0.3) ai.stuckT += dt;
  else ai.stuckT = Math.max(0, ai.stuckT - dt);
  if (ai.stuckT > 0.35) {
    ai.stuckT = 0;
    ai.strafeDir *= -1;
    enemy.steerSide *= -1;
    if (enemy.grounded) { enemy.vel.y = JUMP_VEL; enemy.grounded = false; }
  }

  if (out.reload) startReload(enemy);
  if (out.fan && w.fan && enemy.dumpLeft <= 0 && enemy.ammo > 0 && enemy.reloadT <= 0) enemy.dumpLeft = enemy.ammo;
  if (enemy.stunT > 0) enemy.dumpLeft = 0;
  if (enemy.dumpLeft > 0) {
    if (enemy.cooldown <= 0 && enemy.reloadT <= 0 && (enemy.ammo > 0 || enemy.stormT > 0)) enemyShoot(true);
  } else if (out.attack && enemy.stunT <= 0 && enemy.deflectT <= 0) {
    if (w.type === 'melee') {
      if (enemy.cooldown <= 0) {
        const base = d.meleeWindup + (w.heavy ? 0.1 : 0);
        const windup = enemy.furyT > 0 ? base * 0.6 : base;
        enemy.cooldown = (enemy.furyT > 0 ? 0.4 : w.cooldown) + windup;
        enemy.model.windup(windup);
        pending.push({ attacker: enemy, target: player, t: windup });
      }
    } else if (enemy.cooldown <= 0 && enemy.ammo > 0 && enemy.reloadT <= 0) {
      enemyShoot(false, out.alt ? 'choke' : 'blast');
    }
  }

  // sniper laser telegraph (visible through walls during Railgun)
  laser.visible = out.laser && enemy.stunT <= 0;
  if (laser.visible) {
    const rail = enemy.railT > 0;
    enemy.model.getMuzzle(_o);
    _d.subVectors(ai.aimPoint, _o).normalize();
    const wh = rail ? null : worldHit(_o, _d, 200);
    const eh = rayVsEntity(_o, _d, player);
    let dist = wh ? wh.distance : 200;
    if (eh && eh.dist < dist) dist = eh.dist;
    _end.copy(_o).addScaledVector(_d, dist);
    laser.position.copy(_o).lerp(_end, 0.5);
    laser.lookAt(_end);
    const wdt = 0.012 + out.laserStrength * 0.02;
    laser.scale.set(wdt, wdt, dist);
    laser.material.opacity = 0.25 + out.laserStrength * 0.6;
    laser.material.color.set(rail ? 0xc07bff : 0xff2030);
    laser.material.depthTest = !rail;
  }
}

function updateMelee(dt) {
  for (let i = pending.length - 1; i >= 0; i--) {
    const p = pending[i];
    p.t -= dt;
    if (p.t <= 0) {
      pending.splice(i, 1);
      if (state !== 'playing') continue;
      if (p.target) resolveMelee(p.attacker, p.target);
      else for (const t of opponentsOf(p.attacker)) resolveMelee(p.attacker, t);
    }
  }
}

function updateEnemyVisual(dt) {
  const g = enemy.model.group;
  g.position.copy(enemy.pos);
  g.scale.setScalar(sizeOf(enemy));
  g.rotation.y = enemy.yaw;
  enemy.model.setStatus({
    shield: enemy.shield > 0,
    deflect: enemy.deflectT > 0,
    stun: enemy.stunT > 0 && enemy.alive,
    fury: enemy.furyT > 0,
    jugg: enemy.juggT > 0,
    reveal: enemy.alive && (player.reconT > 0 || player.railT > 0),
    ult: enemy.ult >= 100,
  });
  enemy.model.update(dt, {
    speed: Math.hypot(enemy.vel.x, enemy.vel.z),
    pitch: enemy.pitch,
    type: enemy.weapon.type,
  });
}

const fmt = (t) => t.toFixed(1) + 's';
function statusList(ent) {
  const s = [];
  if (ent.stunT > 0) s.push(['STUNNED', 'bad']);
  if (ent.deflectT > 0.05) s.push(['DEFLECT ' + fmt(ent.deflectT), 'cyan']);
  if (ent.shield > 0) s.push([`SHIELD ${Math.ceil(ent.shield)}`, 'gold']);
  if (ent.furyT > 0.05) s.push(['BLADE FURY ' + fmt(ent.furyT), 'ult']);
  if (ent.stormT > 0.05) s.push(['DEADEYE ' + fmt(ent.stormT), 'ult']);
  if (ent.railT > 0.05) s.push(['RAILGUN ' + fmt(ent.railT), 'ult']);
  if (ent.juggT > 0.05) s.push(['JUGGERNAUT ' + fmt(ent.juggT), 'ult']);
  if (ent.burnT > 0.05) s.push(['BURNING ' + fmt(ent.burnT), 'fire']);
  if (ent.breathT > 0.05) s.push(["DRAGON'S BREATH " + fmt(ent.breathT), 'ult']);
  if (ent.reconT > 0.05) s.push(['RECON ' + fmt(ent.reconT), 'cyan']);
  return s;
}
const pill = ([t, c]) => `<span class="pill ${c}">${t}</span>`;

function updateHUD(dt) {
  const w = player.weapon;
  ui.hpText.textContent = Math.ceil(player.health) + (player.shield > 0 ? ` +${Math.ceil(player.shield)}` : '');
  ui.hpFill.style.width = `${(player.health / player.maxHealth) * 100}%`;
  ui.shieldFill.style.width = `${Math.min(100, (player.shield / player.maxHealth) * 100)}%`;
  ui.hpFill.classList.toggle('low', player.health / player.maxHealth < 0.35);
  const foe = mode === 'practice' ? (lastDummy || dummies[0]) : enemy;
  ui.enemyHp.style.width = `${(foe.health / foe.maxHealth) * 100}%`;
  ui.enemyShield.style.width = `${Math.min(100, (foe.shield / foe.maxHealth) * 100)}%`;
  ui.enemyLabel.textContent = mode === 'practice' ? `DUMMY ${Math.ceil(foe.health)}` : 'ENEMY';
  if (mode === 'practice') {
    const now = performance.now() / 1000;
    const live = now - practice.lastHit <= 2;
    const dur = Math.max(0.5, practice.lastHit - practice.comboStart);
    ui.ppStats.innerHTML =
      `<div><span>Combo</span><b class="${live ? 'live' : ''}">${Math.round(practice.combo)}</b></div>` +
      `<div><span>DPS</span><b>${practice.combo ? Math.round(practice.combo / dur) : 0}</b></div>` +
      `<div><span>Best combo</span><b>${Math.round(practice.best)}</b></div>`;
  }
  updateDmgNumbers(dt);
  if (w.type === 'melee') ui.ammo.innerHTML = '<span class="inf">MELEE</span>';
  else if (player.stormT > 0 || player.breathT > 0) ui.ammo.innerHTML = '<span class="inf">∞</span>';
  else if (player.reloadT > 0) ui.ammo.innerHTML = '<span class="reloading">RELOADING</span>';
  else ui.ammo.innerHTML = `<b>${player.ammo}</b><span>/ ${w.mag}</span>`;

  // ability bar
  for (const s of SLOTS) {
    const a = abEls[s];
    if (s === 'q') {
      const active = ultActive(player);
      a.cd.style.height = active ? '0%' : `${100 - player.ult}%`;
      a.el.classList.toggle('ready', player.ult >= 100 && !active);
      a.el.classList.toggle('active', active);
      a.num.textContent = active || player.ult >= 100 ? '' : `${Math.floor(player.ult)}%`;
    } else {
      const cd = player.cd[s];
      const max = abilities.cooldownFor(player, s);
      a.cd.style.height = `${Math.min(100, (cd / max) * 100)}%`;
      a.num.textContent = cd > 0 ? Math.ceil(cd) : '';
      a.el.classList.toggle('ready', cd <= 0);
    }
    a.el.classList.toggle('blocked', player.stunT > 0);
  }
  const ultReady = player.ult >= 100;
  if (ultReady && !wasUltReady && state === 'playing') { sfx.ultReady(); feed('ULTIMATE READY — press Q', 'good'); }
  wasUltReady = ultReady;

  const pStatus = statusList(player);
  if (mode === 'duel' && (enemy.reconT > 0 || enemy.railT > 0)) pStatus.push(['⚠ REVEALED', 'bad']);
  ui.status.innerHTML = pStatus.map(pill).join('');
  const eStatus = statusList(foe);
  if (mode === 'duel' && enemy.ult >= 100 && !ultActive(enemy)) eStatus.push(['ULT READY', 'warn']);
  ui.enemyStatus.innerHTML = eStatus.map(pill).join('');

  ui.tint.className = player.deflectT > 0 ? 'cyan' : ultActive(player) ? 'ult' : player.shield > 0 ? 'gold' : player.stunT > 0 ? 'stun' : '';

  ui.scope.classList.toggle('show', player.scopeAmt > 0.6);
  ui.crosshair.style.opacity = player.scopeAmt > 0.3 || !player.alive ? 0 : 1;

  hurtFlash = Math.max(0, hurtFlash - dt * 1.5);
  const low = player.alive ? Math.max(0, 1 - player.health / player.maxHealth / 0.35) * 0.35 : 0.6;
  ui.vignette.style.opacity = Math.min(1, hurtFlash + low);
  flashAmt = Math.max(0, flashAmt - dt * 0.7);
  ui.flash.style.opacity = Math.min(1, flashAmt * 1.3);

  if (hitT > 0) { hitT -= dt; if (hitT <= 0) ui.hitmarker.className = ''; }
  if (centerT > 0) { centerT -= dt; if (centerT <= 0) hideCenter(); }
  ui.lockHint.classList.toggle('hidden', isLocked() || state === 'menu' || state === 'paused' || state === 'matchEnd');
}

function update(dt) {
  stateT -= dt;
  if (state === 'countdown') {
    const n = Math.ceil(stateT);
    if (n !== lastBeep && n > 0) {
      lastBeep = n;
      sfx.beep(false);
      const vs = `${player.weapon.icon} ${player.weapon.name}  vs  ${enemy.weapon.icon} ${enemy.weapon.name}`;
      showCenter(String(n), round === 1 ? vs : `Round ${round} · ${vs}`, 'count');
    }
    updatePlayer(dt, false);
    updateAI_idle();
    if (stateT <= 0) {
      state = 'playing';
      sfx.beep(true);
      showCenter('FIGHT!', '', 'fight', 0.8);
    }
  } else if (state === 'playing' && mode === 'practice') {
    updatePlayer(dt, true);
    updateDummies(dt);
    updateMelee(dt);
  } else if (state === 'playing') {
    updatePlayer(dt, true);
    updateAI(dt);
    separate(player, enemy);
    updateMelee(dt);
  } else if (state === 'roundEnd') {
    updatePlayer(dt, false);
    moveEntity(enemy, 0, 0, 0, false, dt);
    if (stateT <= 0) {
      if (score.player >= ROUNDS_TO_WIN || score.ai >= ROUNDS_TO_WIN) endMatch();
      else { hideCenter(); startRound(); }
    }
  }
  abilities.update(dt, state === 'playing');
  if (mode === 'duel') updateEnemyVisual(dt);
  effects.update(dt);
  updateHUD(dt);
}

function updateDummies(dt) {
  const reveal = player.reconT > 0 || player.railT > 0;
  for (const d of dummies) {
    d.yaw = Math.atan2(-(player.pos.x - d.pos.x), -(player.pos.z - d.pos.z));
    moveEntity(d, 0, 0, 0, false, dt);
    // dummies are planted: only the player gets pushed out
    const dx = player.pos.x - d.pos.x, dz = player.pos.z - d.pos.z, dd = Math.hypot(dx, dz);
    const minD = RADIUS * (1 + sizeOf(player));
    if (dd < minD && dd > 1e-4 && Math.abs(player.pos.y - d.pos.y) < 1.7) {
      player.pos.x = d.pos.x + (dx / dd) * minD;
      player.pos.z = d.pos.z + (dz / dd) * minD;
    }
    // after 3s without damage: heal up and walk back home
    if (d.lastHurtT > 3 && !d.force && d.burnT <= 0) {
      d.health = d.maxHealth;
      if (d.pos.distanceTo(d.home) > 0.3 && d.grounded) { d.pos.copy(d.home); d.vel.set(0, 0, 0); }
    }
    const g = d.model.group;
    g.position.copy(d.pos);
    g.rotation.y = d.yaw;
    d.model.setStatus({ shield: d.shield > 0, deflect: false, stun: d.stunT > 0, reveal });
    d.model.update(dt, { speed: Math.hypot(d.vel.x, d.vel.z), pitch: 0, type: 'melee' });
  }
}

const dmgNums = [];
const _p = new THREE.Vector3();
function spawnDmgNumber(target, amount, head) {
  if (amount < 0.5) return;
  const el = document.createElement('div');
  el.className = 'dmg' + (head ? ' head' : target.burnT > 0 && amount <= 4 ? ' burn' : '');
  el.textContent = Math.round(amount);
  ui.dmgLayer.append(el);
  dmgNums.push({ el, t: 0, pos: new THREE.Vector3(target.pos.x + (Math.random() - 0.5) * 0.7, target.pos.y + 2.05, target.pos.z + (Math.random() - 0.5) * 0.7) });
}
function updateDmgNumbers(dt) {
  for (let i = dmgNums.length - 1; i >= 0; i--) {
    const n = dmgNums[i];
    n.t += dt;
    n.pos.y += dt * 0.9;
    _p.copy(n.pos).project(camera);
    if (n.t > 0.9) { n.el.remove(); dmgNums.splice(i, 1); continue; }
    const visible = _p.z < 1;
    n.el.style.opacity = visible ? Math.min(1, (0.9 - n.t) / 0.3) : 0;
    n.el.style.transform = `translate(${(_p.x * 0.5 + 0.5) * innerWidth}px, ${(-_p.y * 0.5 + 0.5) * innerHeight}px) translate(-50%, -50%) scale(${1 + Math.max(0, 0.15 - n.t) * 3})`;
  }
}
function clearDmgNumbers() {
  for (const n of dmgNums) n.el.remove();
  dmgNums.length = 0;
}

// During the countdown the bot just turns to face the player
function updateAI_idle() {
  const dx = player.pos.x - enemy.pos.x, dz = player.pos.z - enemy.pos.z;
  enemy.yaw = Math.atan2(-dx, -dz);
  enemy.vel.set(0, 0, 0);
}

// ---------------------------------------------------------------- loop
let last = performance.now();
let menuT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (state === 'menu') {
    menuT += dt * 0.12;
    camera.position.set(Math.sin(menuT) * 24, 11, Math.cos(menuT) * 24);
    camera.lookAt(0, 0, 0);
    if (camera.fov !== 75) { camera.fov = 75; camera.updateProjectionMatrix(); }
    updateEnemyVisual(dt);
  } else if (state !== 'paused' && state !== 'matchEnd') {
    update(dt);
  }

  renderer.clear();
  renderer.render(scene, camera);
  if (state !== 'menu' && state !== 'matchEnd') {
    renderer.clearDepth();
    renderer.render(viewModel.scene, viewModel.camera);
  }
}

// initial pose for the menu backdrop
resetEntity(enemy, 'sword', new THREE.Vector3(0, 0, 6), 0);
enemy.model.setWeapon('sword');
requestAnimationFrame(frame);

if (import.meta.env.DEV) {
  window.__game = {
    player, enemy, dummies, abilities, keys, WEAPONS,
    get state() { return state; }, get mode() { return mode; },
    startPractice, startMatch, switchPlayerWeapon,
    lock() { devLock = true; },
    rightClick() { rightDown = true; rightQueued = true; },
    rightUp() { rightDown = false; },
    aimAt(t, h = 1.0) { const s = sizeOf(player); const dx = t.pos.x - player.pos.x, dz = t.pos.z - player.pos.z, dy = t.pos.y + h - (player.pos.y + EYE * s); player.yaw = Math.atan2(-dx, -dz); player.pitch = Math.atan2(dy, Math.hypot(dx, dz)); },
    jump() { jumpQueued = true; keys.Space = true; setTimeout(() => (keys.Space = false), 30); },
    mouse(down) { mouseDown = down; if (down) triggerQueued = true; },
  };
}
