import * as THREE from 'three';
import { EYE, rayVsEntity, sizeOf } from './physics.js';
import { GRAVITY, ULT_RATE } from './config.js';
import { sfx } from './audio.js';

export const SLOTS = ['shift', 'e', 'q'];

/** Reset per-round ability state. Ultimate charge carries over between rounds. */
export function resetAbilities(ent, keepUlt = true) {
  ent.cd = { shift: 0, e: 0 };
  if (!keepUlt || ent.ult == null) ent.ult = 0;
  ent.stunT = 0;
  ent.shield = 0;
  ent.shieldT = 0;
  ent.deflectT = 0;
  ent.furyT = 0;
  ent.stormT = 0;
  ent.railT = 0;
  ent.reconT = 0;
  ent.juggT = 0;
  ent.breathT = 0;
  ent.burnT = 0;
  ent.burnTick = 0;
  ent.burnSrc = null;
  ent.doubleUsed = false;
  ent.dumpLeft = 0;
  ent.force = null;
  ent.lastHurtT = 99;
  ent.dashHit = false;
}

export function ultActive(ent) {
  return ent.furyT > 0 || ent.stormT > 0 || ent.railT > 0 || ent.juggT > 0 || ent.breathT > 0 || (ent.force && ent.force.type === 'leap');
}

const fwd = (ent) => [-Math.sin(ent.yaw), -Math.cos(ent.yaw)];
/**
 * 3D dash direction: a forward dash follows the look pitch (aim up to dash up),
 * sideways/backward dashes stay flat. Tiny pitches are ignored so normal dashes stay level.
 */
function dashDir(ent, opt) {
  const [dx, dz] = opt.dir || fwd(ent);
  const [fx, fz] = fwd(ent);
  const p = Math.abs(ent.pitch) < 0.12 ? 0 : ent.pitch;
  if (p === 0 || dx * fx + dz * fz < 0.7) return [dx, 0, dz];
  const c = Math.cos(p);
  return [dx * c, Math.sin(p), dz * c];
}
const FLASH_RADIUS = 5.5;
const SLAM_RADIUS = 5.5;
const SHOCK_RADIUS = 5.5;

const projGeo = new THREE.SphereGeometry(0.09, 10, 8);
const projMat = new THREE.MeshBasicMaterial({ color: 0xfff2a8 });
const ropeGeo = new THREE.BoxGeometry(1, 1, 1);

/**
 * Ability logic shared by the player and the AI.
 * G is the game context: { scene, effects, player, enemy, opponents(ent) -> [], entities() -> [], ultMult(), applyDamage, worldHit,
 *   clearLine(a,b), aimRay(ent, o, d), ropeOrigin(ent, out), flash(amount), shake(amount),
 *   feed(text, cls), vmAttack() }
 */
export class Abilities {
  constructor(G) {
    this.G = G;
    this.projectiles = [];
    this.ropes = new Map();
  }

  clear() {
    for (const p of this.projectiles) this.G.scene.remove(p.mesh);
    this.projectiles.length = 0;
    for (const r of this.ropes.values()) r.visible = false;
  }

  vol(ent) {
    if (ent === this.G.player) return 1;
    return Math.max(0.3, 1 - ent.pos.distanceTo(this.G.player.pos) / 40);
  }

  cooldownFor(ent, slot) {
    if (slot === 'shift' && ent.furyT > 0) return 1;
    return ent.weapon.abilities[slot].cd;
  }

  canUse(ent, slot) {
    if (!ent.alive || ent.stunT > 0 || ent.force) return false;
    if (slot === 'q') return ent.ult >= 100 && !ultActive(ent);
    return ent.cd[slot] <= 0;
  }

  use(ent, slot, opt = {}) {
    const isPlayer = ent === this.G.player;
    if (!this.canUse(ent, slot)) { if (isPlayer) sfx.denied(); return false; }
    const ok = this[`${ent.weapon.id}_${slot}`](ent, opt);
    if (ok === false) { if (isPlayer) sfx.denied(); return false; }
    if (slot === 'q') {
      ent.ult = 0;
      const name = ent.weapon.abilities.q.name.toUpperCase();
      this.G.feed(isPlayer ? `${name}!` : `⚠ AI ULTIMATE: ${name}`, isPlayer ? 'good' : 'bad');
    } else {
      ent.cd[slot] = this.cooldownFor(ent, slot);
    }
    return true;
  }

  // ------------------------------------------------------------ Sword
  sword_shift(ent, opt) {
    const [dx, dy, dz] = dashDir(ent, opt);
    ent.force = { type: 'dash', vx: dx * 28, vy: dy * 28, vz: dz * 28, t: 0.2 };
    if (dy > 0) ent.grounded = false;
    ent.dashHit = false;
    sfx.dash(this.vol(ent));
  }
  sword_e(ent) {
    ent.deflectT = 1.2;
    sfx.deflectOn(this.vol(ent));
  }
  sword_q(ent) {
    ent.furyT = 7;
    ent.cd.shift = 0;
    sfx.ult(this.vol(ent));
  }

  // ------------------------------------------------------------ Fists
  fists_shift(ent, opt) {
    const [dx, dy, dz] = dashDir(ent, opt);
    ent.force = { type: 'charge', vx: dx * 22, vy: dy * 22, vz: dz * 22, t: 0.42 };
    if (dy > 0) ent.grounded = false;
    ent.dashHit = false;
    sfx.dash(this.vol(ent));
    if (ent === this.G.player) this.G.vmAttack();
  }
  fists_e(ent) {
    ent.shield = 120;
    ent.shieldT = 4;
    sfx.shield(this.vol(ent));
  }
  fists_q(ent, opt) {
    let px, pz;
    if (opt.point) {
      px = opt.point.x; pz = opt.point.z;
    } else {
      const o = new THREE.Vector3(), d = new THREE.Vector3();
      this.G.aimRay(ent, o, d);
      const hit = this.G.worldHit(o, d, 16);
      const p = hit ? hit.point : o.addScaledVector(d, 12);
      px = p.x; pz = p.z;
    }
    let dx = px - ent.pos.x, dz = pz - ent.pos.z;
    let dist = Math.hypot(dx, dz);
    if (dist < 0.01) { [dx, dz] = fwd(ent); dist = 2; } else { dx /= dist; dz /= dist; }
    dist = Math.min(14, Math.max(2, dist));
    const vy = 10;
    const T = (2 * vy) / GRAVITY;
    ent.vel.y = vy;
    ent.grounded = false;
    ent.force = { type: 'leap', vx: (dx * dist) / T, vz: (dz * dist) / T, t: 3, air: false, onLand: () => this.slam(ent) };
    sfx.ult(this.vol(ent));
  }
  slam(ent) {
    const G = this.G;
    G.effects.ring(ent.pos, 0xffaa33, SLAM_RADIUS, 0.6);
    G.effects.burst(ent.pos.clone().setY(ent.pos.y + 0.2), 0xffaa33, 24, 7);
    sfx.explode(this.vol(ent));
    const dPlayer = ent.pos.distanceTo(G.player.pos);
    G.shake(Math.max(0, 1 - dPlayer / 14) * 0.6);
    for (const opp of G.opponents(ent)) {
      if (!opp.alive) continue;
      const d = Math.hypot(opp.pos.x - ent.pos.x, opp.pos.z - ent.pos.z);
      if (d < SLAM_RADIUS && Math.abs(opp.pos.y - ent.pos.y) < 2.5) {
        opp.stunT = Math.max(opp.stunT, 1.5);
        if (!(opp.juggT > 0)) opp.vel.y = 6;
        opp.grounded = false;
        G.feed(opp === G.player ? 'STUNNED!' : 'SLAM HIT!', opp === G.player ? 'bad' : 'good');
        G.applyDamage(opp, 70, ent, false);
      }
    }
  }

  // ------------------------------------------------------------ Pistol
  pistol_shift(ent, opt) {
    const [dx, dz] = opt.dir || fwd(ent);
    ent.force = { type: 'roll', vx: dx * 17, vz: dz * 17, t: 0.3 };
    ent.ammo = ent.weapon.mag;
    ent.reloadT = 0;
    sfx.dash(this.vol(ent) * 0.7);
    sfx.reload();
  }
  pistol_e(ent, opt) {
    const pos = new THREE.Vector3(ent.pos.x, ent.pos.y + EYE - 0.1, ent.pos.z);
    const vel = new THREE.Vector3();
    if (opt.target) {
      // ballistic throw at a target position with ~15 m/s horizontal speed
      const t = opt.target;
      const dx = t.x - pos.x, dz = t.z - pos.z;
      const dist = Math.max(1, Math.hypot(dx, dz));
      const time = dist / 15;
      vel.set((dx / dist) * 15, (t.y + 1 - pos.y) / time + 0.5 * 18 * time, (dz / dist) * 15);
    } else {
      const o = new THREE.Vector3(), d = new THREE.Vector3();
      this.G.aimRay(ent, o, d);
      vel.copy(d).multiplyScalar(17);
      vel.y += 3;
    }
    pos.addScaledVector(vel.clone().normalize(), 0.5);
    const mesh = new THREE.Mesh(projGeo, projMat);
    mesh.position.copy(pos);
    this.G.scene.add(mesh);
    this.projectiles.push({ owner: ent, pos, vel, t: 1.2, mesh });
    sfx.throw(this.vol(ent));
  }
  pistol_q(ent) {
    ent.stormT = 5;
    ent.ammo = ent.weapon.mag;
    ent.reloadT = 0;
    sfx.ult(this.vol(ent));
  }

  // ------------------------------------------------------------ Sniper
  sniper_shift(ent, opt) {
    const dirs = opt.dirs || [null];
    const o = new THREE.Vector3(), d = new THREE.Vector3();
    for (const dd of dirs) {
      if (dd) { o.set(ent.pos.x, ent.pos.y + EYE, ent.pos.z); d.copy(dd).normalize(); }
      else this.G.aimRay(ent, o, d);
      const hit = this.G.worldHit(o, d, 30);
      if (hit && hit.distance > 2.5) {
        const p = hit.point.clone().addScaledVector(d, -0.6);
        p.y = Math.max(0, p.y - 0.8);
        ent.force = { type: 'grapple', point: p, t: 1.3 };
        ent.grounded = false;
        sfx.grapple(this.vol(ent));
        return;
      }
    }
    return false;
  }
  sniper_e(ent) {
    ent.reconT = 6;
    sfx.recon(this.vol(ent));
    if (ent !== this.G.player) this.G.feed('⚠ YOU ARE REVEALED', 'bad');
  }
  sniper_q(ent) {
    ent.railT = 8;
    ent.ammo = ent.weapon.mag;
    ent.reloadT = 0;
    ent.cooldown = 0;
    sfx.ult(this.vol(ent));
  }

  // ------------------------------------------------------------ Hammer
  hammer_shift(ent) {
    const G = this.G;
    const [fx, fz] = fwd(ent);
    const c = new THREE.Vector3(ent.pos.x + fx * 1.6, ent.pos.y + 0.05, ent.pos.z + fz * 1.6);
    G.effects.ring(c, 0xff6a3d, SHOCK_RADIUS * 0.8, 0.5);
    G.effects.burst(c.clone().setY(c.y + 0.2), 0xff8a3d, 22, 6);
    sfx.explode(this.vol(ent) * 0.8);
    G.shake(Math.max(0, 1 - ent.pos.distanceTo(G.player.pos) / 14) * 0.5);
    if (ent === G.player) G.vmAttack();
    const a = new THREE.Vector3(ent.pos.x, ent.pos.y + 1, ent.pos.z);
    const b = new THREE.Vector3();
    for (const opp of G.opponents(ent)) {
      if (!opp.alive) continue;
      const dx = opp.pos.x - ent.pos.x, dz = opp.pos.z - ent.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > SHOCK_RADIUS || Math.abs(opp.pos.y - ent.pos.y) > 1.8) continue;
      if (d > 1 && (dx * fx + dz * fz) / d < 0.3) continue;
      if (!G.clearLine(a, b.set(opp.pos.x, opp.pos.y + 1, opp.pos.z))) continue;
      if (!(opp.juggT > 0)) {
        const nx = dx / (d || 1), nz = dz / (d || 1);
        opp.force = { type: 'knock', vx: nx * 13, vz: nz * 13, t: 0.25 };
        opp.vel.y = 5;
        opp.grounded = false;
        opp.stunT = Math.max(opp.stunT, 0.6);
      }
      G.feed(opp === G.player ? 'SHOCKWAVED!' : 'SHOCKWAVE HIT!', opp === G.player ? 'bad' : 'good');
      G.applyDamage(opp, 40, ent, false);
    }
  }
  hammer_e(ent) {
    const G = this.G;
    const [fx, fz] = fwd(ent);
    const pos = new THREE.Vector3(ent.pos.x + fx * 1.2, ent.pos.y, ent.pos.z + fz * 1.2);
    const mesh = makeFireWall();
    mesh.position.copy(pos);
    mesh.rotation.y = ent.yaw;
    G.scene.add(mesh);
    this.projectiles.push({
      kind: 'fire', owner: ent, pos, vel: new THREE.Vector3(fx * FIRE_SPEED, 0, fz * FIRE_SPEED),
      t: FIRE_RANGE / FIRE_SPEED, mesh, hits: new Set(), emberT: 0, age: 0,
    });
    G.effects.ring(pos, 0xff7a1a, 2.5, 0.35);
    sfx.explode(this.vol(ent) * 0.6);
    sfx.throw(this.vol(ent));
    if (ent === G.player) G.vmAttack();
  }
  hammer_q(ent) {
    ent.juggT = 7;
    ent.stunT = 0;
    sfx.ult(this.vol(ent));
  }

  // ------------------------------------------------------------ Shotgun
  shotgun_shift(ent) {
    const G = this.G;
    const o = new THREE.Vector3(), dir = new THREE.Vector3();
    G.aimRay(ent, o, dir);
    const pos = G.ropeOrigin(ent, new THREE.Vector3());
    const head = new THREE.Mesh(hookGeo, hookMat);
    head.position.copy(pos);
    const rope = new THREE.Mesh(ropeGeo, chainMat);
    const mesh = new THREE.Group();
    mesh.add(head, rope);
    G.scene.add(mesh);
    this.projectiles.push({
      kind: 'hook', owner: ent, pos, aimO: o, dir, travelled: 0, phase: 'out', t: 3, mesh, head, rope, target: null,
    });
    sfx.grapple(this.vol(ent));
  }
  shotgun_e(ent) {
    if (ent.health >= ent.maxHealth) return false;
    const healed = Math.min(300, ent.maxHealth - ent.health);
    ent.health += healed;
    const G = this.G;
    G.effects.ring(ent.pos, 0x3dffa2, 2.2, 0.5);
    G.effects.burst(new THREE.Vector3(ent.pos.x, ent.pos.y + 1.2, ent.pos.z), 0x3dffa2, 24, 3);
    sfx.shield(this.vol(ent));
    G.feed(ent === G.player ? `PATCHED UP +${Math.round(healed)}` : `⚠ AI HEALED +${Math.round(healed)}`, ent === G.player ? 'good' : 'bad');
  }
  shotgun_q(ent) {
    ent.breathT = 6;
    ent.ammo = ent.weapon.mag;
    ent.reloadT = 0;
    sfx.ult(this.vol(ent));
  }

  /** Chain hook: flies out along the aim ray, yanks the first enemy it touches. Returns true when done. */
  updateHook(p, dt, playing) {
    const G = this.G;
    const from = G.ropeOrigin(p.owner, new THREE.Vector3());
    if (!p.owner.alive) p.phase = 'back';
    if (p.phase === 'out') {
      const len = HOOK_SPEED * dt;
      // the hook travels along the owner's aim ray (from the eye), so it lands where the crosshair is
      const tip = p.aimO.clone().addScaledVector(p.dir, p.travelled);
      let hitT = null, hitD = len;
      for (const opp of G.opponents(p.owner)) {
        if (!opp.alive) continue;
        const h = rayVsEntity(tip, p.dir, opp);
        if (h && h.dist <= hitD + 0.4) { hitD = h.dist; hitT = opp; }
      }
      const wall = G.worldHit(tip, p.dir, len);
      if (hitT && (!wall || hitD < wall.distance)) {
        p.travelled += hitD;
        p.pos.copy(tip).addScaledVector(p.dir, hitD);
        this.hookHit(p, hitT, playing);
      } else if (wall || p.travelled + len >= HOOK_RANGE) {
        p.travelled = Math.min(HOOK_RANGE, p.travelled + (wall ? wall.distance : len));
        p.pos.copy(p.aimO).addScaledVector(p.dir, p.travelled);
        if (wall) G.effects.burst(p.pos, 0xc0c8d8, 6, 2);
        p.phase = 'back';
      } else {
        p.travelled += len;
        p.pos.copy(tip).addScaledVector(p.dir, len);
      }
    } else if (p.phase === 'pull') {
      const t = p.target;
      p.pos.set(t.pos.x, t.pos.y + 1.1 * sizeOf(t), t.pos.z);
      if (!t.force || t.force.type !== 'pull' || !t.alive) p.phase = 'back';
    } else { // reel back in
      const d = from.distanceTo(p.pos);
      if (d < 0.8) return true;
      p.pos.lerp(from, Math.min(1, (HOOK_SPEED * 1.4 * dt) / d));
    }
    p.head.position.copy(p.pos);
    const len = from.distanceTo(p.pos);
    p.rope.visible = len > 0.1;
    p.rope.position.copy(from).lerp(p.pos, 0.5);
    p.rope.lookAt(p.pos);
    p.rope.scale.set(0.03, 0.03, len);
    return p.t <= 0;
  }

  hookHit(p, opp, playing) {
    const G = this.G;
    const hitPos = p.pos.clone();
    if (!playing) { p.phase = 'back'; return; }
    if (opp.deflectT > 0) {
      G.effects.burst(hitPos, 0x66f0ff, 14, 3);
      sfx.parry();
      G.feed(opp === G.player ? 'HOOK DEFLECTED!' : 'HOOK DEFLECTED', opp === G.player ? 'good' : 'bad');
      p.phase = 'back';
      return;
    }
    G.effects.burst(hitPos, 0xff2a3a, 12, 3);
    sfx.thud();
    G.feed(opp === G.player ? 'HOOKED!' : 'GOT HIM!', opp === G.player ? 'bad' : 'good');
    if (!(opp.juggT > 0)) {
      opp.force = { type: 'pull', owner: p.owner, t: 1.2 };
      opp.stunT = Math.max(opp.stunT, 0.5);
      opp.grounded = false;
      opp.vel.y = 3;
      p.target = opp;
      p.phase = 'pull';
    } else {
      p.phase = 'back';
    }
    G.applyDamage(opp, 20, p.owner, false);
  }

  /** Set someone on fire: BURN_TICKS ticks of BURN_DMG, refreshed (not stacked) on re-hit. */
  ignite(target, source) {
    target.burnT = BURN_TICKS * 0.5;
    target.burnTick = 0.5;
    target.burnSrc = source;
  }

  // ------------------------------------------------------------ per-frame
  update(dt, playing) {
    const G = this.G;
    for (const ent of G.entities()) {
      ent.cd.shift = Math.max(0, ent.cd.shift - dt);
      ent.cd.e = Math.max(0, ent.cd.e - dt);
      ent.stunT = Math.max(0, ent.stunT - dt);
      ent.deflectT = Math.max(0, ent.deflectT - dt);
      ent.furyT = Math.max(0, ent.furyT - dt);
      ent.stormT = Math.max(0, ent.stormT - dt);
      ent.railT = Math.max(0, ent.railT - dt);
      ent.reconT = Math.max(0, ent.reconT - dt);
      ent.juggT = Math.max(0, ent.juggT - dt);
      ent.breathT = Math.max(0, ent.breathT - dt);
      if (ent.shieldT > 0) { ent.shieldT -= dt; if (ent.shieldT <= 0) ent.shield = 0; }
      ent.lastHurtT += dt;
      if (ent.burnT > 0) {
        ent.burnT -= dt;
        ent.burnTick -= dt;
        if (ent.alive && Math.random() < dt * 25) {
          G.effects.burst(new THREE.Vector3(ent.pos.x + (Math.random() - 0.5) * 0.5, ent.pos.y + 0.4 + Math.random() * 1.2, ent.pos.z + (Math.random() - 0.5) * 0.5), 0xff7a1a, 2, 1.5);
        }
        if (ent.burnTick <= 0) {
          ent.burnTick += 0.5;
          if (playing && ent.alive) G.applyDamage(ent, BURN_DMG, ent.burnSrc, false);
        }
        if (!ent.alive) ent.burnT = 0;
      }
      if (playing && ent.alive && !ent.dummy && !ultActive(ent)) ent.ult = Math.min(100, ent.ult + ULT_RATE.passive * G.ultMult() * dt);
      if (playing) this.checkContact(ent);
      this.updateRope(ent);
    }
    this.updateProjectiles(dt, playing);
    // Juggernaut: shrug off any stun applied this frame
    for (const ent of G.entities()) if (ent.juggT > 0) ent.stunT = 0;
  }

  /** Sword dash / rocket punch hitting an opponent (one hit per dash). */
  checkContact(ent) {
    const f = ent.force;
    if (!f || ent.dashHit || (f.type !== 'dash' && f.type !== 'charge')) return;
    const G = this.G;
    if (!ent.alive) return;
    for (const opp of G.opponents(ent)) {
      if (!opp.alive) continue;
      const dx = opp.pos.x - ent.pos.x, dz = opp.pos.z - ent.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 1.4 || Math.abs(opp.pos.y - ent.pos.y) > 1.6) continue;
      ent.dashHit = true;
      const hitPos = new THREE.Vector3(opp.pos.x, opp.pos.y + 1.2, opp.pos.z);

      if (opp.deflectT > 0) { // parried
        ent.force = null;
        ent.stunT = Math.max(ent.stunT, 1);
        G.effects.burst(hitPos, 0x66f0ff, 14, 3);
        sfx.parry();
        G.feed(ent === G.player ? 'PARRIED — STUNNED!' : 'PARRY!', ent === G.player ? 'bad' : 'good');
        return;
      }
      if (f.type === 'dash' || opp.juggT > 0) {
        G.effects.burst(hitPos, 0xff2a3a, 14, 4);
        sfx.slash();
        G.applyDamage(opp, f.type === 'dash' ? 50 : 45, ent, false);
        if (f.type !== 'dash') ent.force = null;
      } else {
        const nx = dx / (d || 1), nz = dz / (d || 1);
        opp.force = { type: 'knock', vx: nx * 14, vz: nz * 14, t: 0.25 };
        opp.stunT = Math.max(opp.stunT, 0.6);
        ent.force = null;
        ent.vel.x *= 0.2; ent.vel.z *= 0.2; ent.vel.y *= 0.2;
        G.effects.burst(hitPos, 0xffaa33, 16, 4);
        G.shake(0.25);
        sfx.thud();
        G.applyDamage(opp, 45, ent, false);
      }
      return;
    }
  }

  updateRope(ent) {
    let rope = this.ropes.get(ent);
    const active = ent.force && ent.force.type === 'grapple';
    if (!active) { if (rope) rope.visible = false; return; }
    if (!rope) {
      rope = new THREE.Mesh(ropeGeo, new THREE.MeshBasicMaterial({ color: 0x9fe8ff }));
      this.G.scene.add(rope);
      this.ropes.set(ent, rope);
    }
    const from = this.G.ropeOrigin(ent, new THREE.Vector3());
    const to = ent.force.point.clone().setY(ent.force.point.y + 0.8);
    const len = from.distanceTo(to);
    rope.visible = len > 0.1;
    rope.position.copy(from).lerp(to, 0.5);
    rope.lookAt(to);
    rope.scale.set(0.02, 0.02, len);
  }

  updateProjectiles(dt, playing) {
    const G = this.G;
    const step = new THREE.Vector3();
    const chest = new THREE.Vector3();
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.t -= dt;
      if (p.kind === 'hook') {
        if (this.updateHook(p, dt, playing)) { this.projectiles.splice(i, 1); G.scene.remove(p.mesh); }
        continue;
      }
      if (p.kind === 'fire') {
        if (this.updateFire(p, dt, playing)) { this.projectiles.splice(i, 1); G.scene.remove(p.mesh); }
        continue;
      }
      p.vel.y -= 18 * dt;
      step.copy(p.vel).multiplyScalar(dt);
      const len = step.length();
      let explode = p.t <= 0;
      if (len > 0) {
        const hit = G.worldHit(p.pos, step.clone().divideScalar(len), len);
        if (hit) { p.pos.copy(hit.point).addScaledVector(step, -0.05 / len); explode = true; }
        else p.pos.add(step);
      }
      for (const opp of G.opponents(p.owner)) {
        if (opp.alive && p.pos.distanceTo(chest.set(opp.pos.x, opp.pos.y + 1, opp.pos.z)) < 1) explode = true;
      }
      p.mesh.position.copy(p.pos);
      if (explode) {
        this.projectiles.splice(i, 1);
        G.scene.remove(p.mesh);
        this.explodeFlash(p, playing);
      }
    }
  }

  /** Rolling wall of fire. Returns true when it's finished. */
  updateFire(p, dt, playing) {
    const G = this.G;
    p.age += dt;
    const speed = p.vel.length();
    if (speed > 0) {
      const dir = p.vel.clone().divideScalar(speed);
      const len = speed * dt;
      const from = p.pos.clone().setY(p.pos.y + 0.5);
      if (G.worldHit(from, dir, len + 0.3)) { p.vel.set(0, 0, 0); p.t = Math.min(p.t, 0.2); }
      else p.pos.addScaledVector(dir, len);
    }
    const m = p.mesh;
    m.position.copy(p.pos);
    const fade = Math.min(1, p.t / 0.2, p.age / 0.08);
    m.children.forEach((c, k) => { c.scale.y = (0.75 + 0.45 * Math.abs(Math.sin(p.age * 18 + k * 1.7))) * fade; });
    m.userData.mats.forEach((mat) => { mat.opacity = mat.userData.base * fade; });
    p.emberT -= dt;
    if (p.emberT <= 0) {
      p.emberT = 0.035;
      const side = (Math.random() - 0.5) * FIRE_WIDTH;
      const c = Math.cos(m.rotation.y), s = Math.sin(m.rotation.y);
      G.effects.burst(new THREE.Vector3(p.pos.x + c * side, p.pos.y + 0.3 + Math.random() * 0.8, p.pos.z - s * side), Math.random() < 0.5 ? 0xff7a1a : 0xffd23f, 2, 2.5);
    }
    if (playing && p.vel.lengthSq() > 0) {
      const fx = p.vel.x / speed, fz = p.vel.z / speed;
      for (const opp of G.opponents(p.owner)) {
        if (!opp.alive || p.hits.has(opp)) continue;
        const rx = opp.pos.x - p.pos.x, rz = opp.pos.z - p.pos.z;
        const along = rx * fx + rz * fz, lateral = Math.abs(rx * fz - rz * fx);
        if (Math.abs(along) > 1.1 || lateral > FIRE_WIDTH / 2 + 0.3 || Math.abs(opp.pos.y - p.pos.y) > 1.6) continue;
        p.hits.add(opp);
        const hitPos = new THREE.Vector3(opp.pos.x, opp.pos.y + 1, opp.pos.z);
        if (opp.deflectT > 0) {
          G.effects.burst(hitPos, 0x66f0ff, 14, 3);
          sfx.parry();
          G.feed(opp === G.player ? 'FIRE BLOCKED!' : 'FIRE BLOCKED', opp === G.player ? 'good' : 'bad');
          continue;
        }
        G.effects.burst(hitPos, 0xff7a1a, 16, 4);
        sfx.thud();
        this.ignite(opp, p.owner);
        G.feed(opp === G.player ? 'YOU ARE BURNING!' : 'ENEMY BURNING!', opp === G.player ? 'bad' : 'good');
        G.applyDamage(opp, FIRE_DMG, p.owner, false);
      }
    }
    return p.t <= 0;
  }

  explodeFlash(p, playing) {
    const G = this.G;
    G.effects.burst(p.pos, 0xffffff, 22, 6);
    G.effects.ring(p.pos.clone().setY(Math.max(0.05, p.pos.y - 0.3)), 0xffffff, FLASH_RADIUS, 0.45);
    sfx.explode(this.vol(p.owner) * 0.7);
    if (!playing) return;
    for (const opp of G.opponents(p.owner)) {
      if (!opp.alive) continue;
      const chest = new THREE.Vector3(opp.pos.x, opp.pos.y + 1.2, opp.pos.z);
      const d = p.pos.distanceTo(chest);
      if (d < FLASH_RADIUS && G.clearLine(p.pos, chest)) {
        opp.stunT = Math.max(opp.stunT, 1.3);
        if (opp === G.player) { G.flash(1); sfx.stun(); }
        G.feed(opp === G.player ? 'FLASHED!' : 'ENEMY FLASHED!', opp === G.player ? 'bad' : 'good');
        G.applyDamage(opp, 35, p.owner, false);
      }
    }
  }
}

const HOOK_SPEED = 55, HOOK_RANGE = 22;
const hookGeo = new THREE.TetrahedronGeometry(0.14);
const hookMat = new THREE.MeshStandardMaterial({ color: 0xc0c8d8, metalness: 0.9, roughness: 0.3 });
const chainMat = new THREE.MeshStandardMaterial({ color: 0x8a919e, metalness: 0.8, roughness: 0.4 });
const FIRE_SPEED = 20, FIRE_RANGE = 20, FIRE_WIDTH = 3, FIRE_DMG = 30, BURN_DMG = 4, BURN_TICKS = 6;
const flameGeo = new THREE.ConeGeometry(0.32, 1.4, 8, 1, true);
flameGeo.translate(0, 0.7, 0);
const coreGeo = new THREE.ConeGeometry(0.18, 0.9, 8, 1, true);
coreGeo.translate(0, 0.45, 0);
function makeFireWall() {
  const g = new THREE.Group();
  const outer = new THREE.MeshBasicMaterial({ color: 0xff5a1a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const inner = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  outer.userData.base = 0.85;
  inner.userData.base = 0.9;
  const n = 7;
  for (let k = 0; k < n; k++) {
    const x = (k / (n - 1) - 0.5) * FIRE_WIDTH;
    const f = new THREE.Mesh(flameGeo, outer);
    f.position.set(x, 0, 0);
    g.add(f);
    const c = new THREE.Mesh(coreGeo, inner);
    c.position.set(x + 0.12, 0, -0.05);
    g.add(c);
  }
  g.userData.mats = [outer, inner];
  return g;
}
