import * as THREE from 'three';
import { EYE, HEAD_Y, sizeOf } from './physics.js';

function angDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
const rot = (x, z, a) => [x * Math.cos(a) - z * Math.sin(a), x * Math.sin(a) + z * Math.cos(a)];

/**
 * Decides where the bot moves, where it aims, when it attacks and which ability it uses.
 * Physics, damage and effects are handled by the game; this only returns intent.
 */
export class AIController {
  constructor(ent) {
    this.ent = ent;
    this.aimPoint = new THREE.Vector3();
    this.tp = new THREE.Vector3();
    this.out = { moveX: 0, moveZ: 0, jump: false, airJump: false, fan: false, attack: false, reload: false, laser: false, laserStrength: 0, ability: null };
    this.stuckT = 0;
    this.strafeDir = 1;
  }

  reset(difficulty) {
    this.d = difficulty;
    this.seenT = 0;
    this.noLosT = 0;
    this.strafeDir = Math.random() < 0.5 ? 1 : -1;
    this.strafeT = 1;
    this.aimT = 0;
    this.headIntent = false;
    this.stuckT = 0;
    this.time = Math.random() * 10;
    this.aimInit = false;
    this.abilityT = 0.5;
  }

  update(dt, ctx) {
    const e = this.ent, d = this.d, t = ctx.target, w = e.weapon, out = this.out;
    out.moveX = out.moveZ = 0;
    out.alt = false;
    out.jump = out.airJump = out.fan = out.attack = out.reload = out.laser = false;
    out.laserStrength = 0;
    out.ability = null;
    this.time += dt;

    const dx = t.pos.x - e.pos.x, dz = t.pos.z - e.pos.z;
    const dist = Math.max(0.001, Math.hypot(dx, dz));
    const nx = dx / dist, nz = dz / dist;

    const los = ctx.los();
    if (los) { this.seenT += dt; this.noLosT = 0; } else { this.seenT = 0; this.noLosT += dt; }
    const wallhack = e.railT > 0 || e.reconT > 0;
    if (e.stunT > 0) return out;

    // ---- aiming: aim point lags behind the target (strafing makes the bot miss) ----
    const aimH = (this.headIntent ? HEAD_Y : 1.0) * sizeOf(t);
    this.tp.set(t.pos.x, t.pos.y + aimH, t.pos.z).addScaledVector(t.vel, d.lead / d.track);
    if (!this.aimInit) {
      this.aimPoint.copy(this.tp).add(new THREE.Vector3((Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 3));
      this.aimInit = true;
    }
    if (los || wallhack || w.type === 'melee') this.aimPoint.lerp(this.tp, 1 - Math.exp(-d.track * dt));

    const ax = this.aimPoint.x - e.pos.x, az = this.aimPoint.z - e.pos.z;
    const desiredYaw = w.type === 'melee' ? Math.atan2(-dx, -dz) : Math.atan2(-ax, -az);
    const diff = angDiff(e.yaw, desiredYaw);
    const maxTurn = d.turnRate * dt;
    e.yaw += Math.max(-maxTurn, Math.min(maxTurn, diff));
    e.pitch = Math.atan2(this.aimPoint.y - (e.pos.y + EYE * sizeOf(e)), Math.max(0.01, Math.hypot(ax, az)));
    const facingErr = Math.abs(angDiff(e.yaw, Math.atan2(-dx, -dz)));

    this.strafeT -= dt;
    if (this.strafeT <= 0) {
      this.strafeDir *= -1;
      this.strafeT = 0.6 + Math.random() * 1.6;
    }

    // don't attack into a deflect/parry (normal & hard)
    const holdFire = t.deflectT > 0 && d.respectDeflect;

    // ---- abilities (evaluated a few times per second, not every frame) ----
    this.abilityT -= dt;
    if (this.abilityT <= 0) {
      this.abilityT = 0.25;
      out.ability = this.decideAbility(dist, los, nx, nz, t);
    }

    if (w.type === 'melee') {
      // ---- melee: rush in, zig-zag against guns ----
      if (holdFire && dist < 4) {
        out.moveX = -nz * this.strafeDir; // circle and wait out the deflect
        out.moveZ = nx * this.strafeDir;
      } else if (dist > 1.3) {
        out.moveX = nx; out.moveZ = nz;
        if (t.weapon.type === 'gun' && dist > 4) {
          const zig = Math.sin(this.time * d.zigFreq) * 0.9;
          out.moveX += -nz * zig;
          out.moveZ += nx * zig;
        }
      } else {
        out.moveX = -nz * this.strafeDir * 0.6;
        out.moveZ = nx * this.strafeDir * 0.6;
      }
      if (t.pos.y - e.pos.y > 0.5 && dist < 2.5 && e.grounded) out.jump = true;
      // double jump to reach targets up high
      if (w.doubleJump && !e.grounded && e.vel.y < 1.5 && t.pos.y - e.pos.y > 0.8 && dist < 5) out.airJump = true;
      const reach = w.range + (e.furyT > 0 ? 1.5 : 0);
      if (!holdFire && dist < reach + 0.15 && Math.abs(t.pos.y - e.pos.y) < 1.4 && facingErr < 0.6 && los) out.attack = true;
      return out;
    }

    // ---- ranged: keep preferred distance, strafe, shoot ----
    const [minD, maxD] = w.id === 'sniper' ? [14, 30] : w.id === 'shotgun' ? [2.5, 7] : [6, 13];
    if (this.noLosT > 1.2 && !(e.railT > 0)) {
      out.moveX = nx; out.moveZ = nz; // go find the target
    } else {
      const radial = dist < minD ? -1 : dist > maxD ? 1 : 0;
      const strafeAmt = w.id === 'sniper' && this.aimT > 0 ? 0.3 : 1;
      out.moveX = nx * radial + -nz * this.strafeDir * strafeAmt;
      out.moveZ = nz * radial + nx * this.strafeDir * strafeAmt;
      if (t.weapon.type === 'melee' && dist < 8 && w.id !== 'shotgun') { // kite melee rushers (the shotgun wants them close)
        out.moveX -= nx * 1.3;
        out.moveZ -= nz * 1.3;
      }
    }

    if (e.ammo <= 0 && e.reloadT <= 0) out.reload = true;
    const sees = (los && this.seenT > d.reaction) || e.railT > 0;
    const canShoot = sees && !holdFire && e.reloadT <= 0 && e.ammo > 0;

    if (w.id === 'shotgun') {
      // blast up close, choke shot at range
      const aimOff = this.aimPoint.distanceTo(this.tp) / dist;
      if (canShoot && e.cooldown <= 0 && aimOff < 0.15 && facingErr < 0.3 && dist < 30) {
        out.attack = true;
        out.alt = dist > 9;
        this.headIntent = Math.random() < d.headChance * 0.3;
      }
    } else if (w.id === 'pistol') {
      const aimOff = this.aimPoint.distanceTo(this.tp) / dist;
      const tol = e.stormT > 0 ? 0.3 : 0.12;
      // Fan Fire: dump the magazine at close range
      if (w.fan && canShoot && dist < 7 && e.ammo >= 8 && e.dumpLeft <= 0 && aimOff < 0.2 &&
          Math.random() < dt * 2 * d.abilityChance) out.fan = true;
      if (canShoot && e.cooldown <= 0 && aimOff < tol && facingErr < 0.3) {
        out.attack = true;
        this.headIntent = Math.random() < d.headChance * 0.4;
      }
    } else {
      const aimTime = d.sniperAim * Math.min(1, Math.max(0.5, dist / 20)) * (e.railT > 0 ? 0.5 : 1);
      if (canShoot && e.cooldown <= 0) {
        if (this.aimT === 0) this.headIntent = Math.random() < d.headChance;
        this.aimT += dt;
        out.laser = true;
        out.laserStrength = Math.min(1, this.aimT / aimTime);
        if (this.aimT >= aimTime && facingErr < 0.2) {
          out.attack = true;
          this.aimT = 0;
        }
      } else {
        this.aimT = Math.max(0, this.aimT - dt * 2);
      }
    }
    return out;
  }

  decideAbility(dist, los, nx, nz, t) {
    const e = this.ent, d = this.d;
    const ready = (s) => (s === 'q' ? e.ult >= 100 : e.cd[s] <= 0);
    const roll = () => Math.random() < d.abilityChance;
    const targetGun = t.weapon.type === 'gun';
    const s = this.strafeDir;

    switch (e.weapon.id) {
      case 'sword':
        if (ready('q') && los && dist < 16 && roll()) return { slot: 'q' };
        if (ready('e') && los && targetGun && dist > 3.5 &&
            (e.lastHurtT < 0.4 || t.stormT > 0 || t.railT > 0 || Math.random() < 0.08) && roll()) return { slot: 'e' };
        if (ready('shift') && los && dist > 3.5 && dist < 9 && t.deflectT <= 0 && roll()) return { slot: 'shift', dir: [nx, nz] };
        break;
      case 'fists':
        if (ready('q') && los && dist > 2 && dist < 12 && roll()) return { slot: 'q', point: t.pos.clone() };
        if (ready('e') && (e.health < e.maxHealth * 0.7 || e.lastHurtT < 0.3) && roll()) return { slot: 'e' };
        if (ready('shift') && los && dist > 3 && dist < 9 && t.deflectT <= 0 && roll()) return { slot: 'shift', dir: [nx, nz] };
        break;
      case 'hammer':
        if (ready('q') && los && dist < 12 && roll()) return { slot: 'q' };
        if (ready('shift') && los && dist < 4.8 && t.deflectT <= 0 && roll()) return { slot: 'shift' };
        if (ready('e') && los && dist > 5 && dist < 22 && t.deflectT <= 0 && roll()) {
          return { slot: 'e', target: t.pos.clone().addScaledVector(t.vel, (dist / 26) * d.lead) };
        }
        break;
      case 'shotgun':
        if (ready('e') && e.health < e.maxHealth * 0.45 && roll()) return { slot: 'e' };
        if (ready('q') && los && dist < 14 && roll()) return { slot: 'q' };
        if (ready('shift') && los && dist > 7 && dist < 20 && t.deflectT <= 0 && roll()) return { slot: 'shift' };
        break;
      case 'pistol':
        if (ready('q') && los && dist < 22 && t.deflectT <= 0 && roll()) return { slot: 'q' };
        if (ready('e') && los && dist > 3 && dist < 15 && roll()) return { slot: 'e', target: t.pos.clone() };
        if (ready('shift') && roll()) {
          if (!targetGun && dist < 5) return { slot: 'shift', dir: rot(-nx, -nz, 0.5 * s) };
          if (e.lastHurtT < 0.3 || e.ammo === 0) return { slot: 'shift', dir: [-nz * s, nx * s] };
        }
        break;
      case 'sniper':
        if (ready('q') && roll()) return { slot: 'q' };
        if (ready('e') && this.noLosT > 1.5 && roll()) return { slot: 'e' };
        if (ready('shift') && !targetGun && dist < 7 && roll()) {
          // grapple away from the melee rusher
          const dirs = [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8].map((a) => {
            const [x, z] = rot(-nx, -nz, a * s);
            return new THREE.Vector3(x, 0.3, z);
          });
          return { slot: 'shift', dirs };
        }
        break;
    }
    return null;
  }
}
