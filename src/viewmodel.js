import * as THREE from 'three';
import { makeSword, makePistol, makeSniper, makeFist, makeHand, makeHammer, makeShotgun } from './weaponModels.js';

const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
function swingCurve(t, peak) {
  if (t >= 1 || t < 0) return 0;
  return t < peak ? easeOut(t / peak) : 1 - easeInOut((t - peak) / (1 - peak));
}

/**
 * First-person weapon, rendered in its own scene on top of the world
 * so it never clips into walls.
 */
export class ViewModel {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.01, 10);
    this.scene.add(new THREE.HemisphereLight(0xc8d4ff, 0x302030, 1.6));
    const dl = new THREE.DirectionalLight(0xffffff, 2.2);
    dl.position.set(1, 2, 1.5);
    this.scene.add(dl);

    this.root = new THREE.Group();
    this.scene.add(this.root);

    const sword = makeSword();
    const swordHand = makeHand();
    sword.add(swordHand);
    const pistol = makePistol();
    pistol.add(makeHand());
    const sniper = makeSniper();
    const sh = makeHand(); sh.position.set(0, -0.02, 0.03);
    sniper.add(sh);
    const hammer = makeHammer();
    const hh = makeHand(); hh.position.set(0, 0, 0.02);
    hammer.add(hh);
    const shotgun = makeShotgun();
    shotgun.scale.setScalar(0.72);
    const sgh = makeHand(); sgh.position.set(0, -0.02, 0.06);
    shotgun.add(sgh);
    const sgl = makeHand(); // left hand rides on the pump
    sgl.rotation.x = -Math.PI / 2; // pump mesh is a Z-rotated cylinder; undo that for the hand
    sgl.position.set(-0.02, 0, 0.04);
    shotgun.userData.pump.add(sgl);
    const fists = new THREE.Group();
    this.fistR = makeFist(true);
    this.fistL = makeFist(true);
    fists.add(this.fistR, this.fistL);

    this.models = { sword, pistol, sniper, fists, hammer, shotgun };
    for (const m of Object.values(this.models)) { m.visible = false; this.root.add(m); }

    this.base = {
      sword: { p: [0.34, -0.42, -0.62], r: [1.0, 0.25, 0] },
      hammer: { p: [0.36, -0.46, -0.6], r: [0.75, 0.2, 0.15] },
      shotgun: { p: [0.2, -0.21, -0.62], r: [0, 0.05, 0] },
      pistol: { p: [0.2, -0.2, -0.48], r: [0, 0, 0] },
      sniper: { p: [0.2, -0.22, -0.42], r: [0, 0, 0] },
    };

    this.current = null;
    this.attackT = 1;
    this.attackDur = 0.4;
    this.punchHand = 0;
    this.kick = 0;
    this.flashT = 0;
    this.bobT = 0;
    this.bobW = 0;
    this.swayX = 0;
    this.swayY = 0;
    this.deflectW = 0;
  }

  setGlow(hex) {
    this.models.sword.userData.edge.color.set(hex);
    this.models.hammer.userData.edge.color.set(hex);
  }

  resize(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  set(id) {
    this.current = id;
    for (const [k, m] of Object.entries(this.models)) m.visible = k === id;
    this.attackT = 1;
    this.kick = 0;
  }

  attack() {
    this.attackT = 0;
    this.attackDur = this.current === 'fists' ? 0.3 : this.current === 'hammer' ? 0.6 : 0.42;
    this.punchHand ^= 1;
  }

  recoil() {
    this.kick = 1;
    this.pumpT = 0;
    this.flashT = 0.045;
  }

  sway(mx, my) {
    this.swayX = Math.max(-0.04, Math.min(0.04, this.swayX - mx * 0.00012));
    this.swayY = Math.max(-0.04, Math.min(0.04, this.swayY + my * 0.00012));
  }

  getMuzzleWorld(out, worldCamera) {
    const m = this.models[this.current];
    this.root.updateMatrixWorld(true);
    m.userData.muzzle.getWorldPosition(out);
    return worldCamera.localToWorld(out);
  }

  update(dt, o) {
    const id = this.current;
    const m = this.models[id];
    if (!m) return;
    this.root.visible = o.visible && o.scopeAmt < 0.6;

    this.attackT += dt / this.attackDur;
    this.kick *= Math.exp(-dt * 12);
    this.flashT -= dt;
    if (m.userData.flash) m.userData.flash.visible = this.flashT > 0;

    if (o.moving) this.bobT += dt * (4 + o.speed * 0.9);
    this.bobW += ((o.moving ? 1 : 0) - this.bobW) * Math.min(1, dt * 8);
    this.swayX *= Math.exp(-dt * 8);
    this.swayY *= Math.exp(-dt * 8);
    const bx = Math.sin(this.bobT) * 0.018 * this.bobW;
    const by = Math.abs(Math.cos(this.bobT)) * 0.02 * this.bobW;
    this.root.position.set(bx + this.swayX, -by + this.swayY, 0);

    if (id === 'sword') {
      const b = this.base.sword;
      const k = swingCurve(this.attackT, 0.3);
      // deflect stance: blade held horizontally across the screen
      this.deflectW += ((o.deflect ? 1 : 0) - this.deflectW) * Math.min(1, dt * 18);
      const w = this.deflectW;
      const spin = o.deflect ? Math.sin(performance.now() / 40) * 0.08 : 0;
      m.position.set(
        (b.p[0] - 0.45 * k) * (1 - w) + 0.12 * w,
        (b.p[1] + 0.06 * k) * (1 - w) - 0.2 * w,
        (b.p[2] - 0.05 * k) * (1 - w) - 0.5 * w,
      );
      m.rotation.set(
        (b.r[0] - 1.4 * k) * (1 - w) + (0.15 + spin) * w,
        (b.r[1] + 0.8 * k) * (1 - w) + 1.45 * w,
        -0.5 * k * (1 - w),
      );
    } else if (id === 'hammer') {
      // heavy overhead slam: lift, then crash down through the centre of the screen
      const b = this.base.hammer;
      const t = this.attackT;
      const lift = t < 0.25 ? easeOut(t / 0.25) : 0;
      const slam = t >= 0.25 && t < 1 ? swingCurve((t - 0.25) / 0.75, 0.25) : 0;
      const up = t < 0.25 ? lift : t < 1 ? Math.max(0, 1 - (t - 0.25) / 0.12) : 0;
      m.position.set(b.p[0] - 0.22 * (up + slam), b.p[1] + 0.12 * up - 0.06 * slam, b.p[2] - 0.08 * slam);
      m.rotation.set(b.r[0] + 0.6 * up - 1.7 * slam, b.r[1] * (1 - slam), b.r[2] * (1 - slam));
    } else if (id === 'fists') {
      const t = performance.now() / 1000;
      [this.fistR, this.fistL].forEach((f, i) => {
        const s = i === 0 ? 1 : -1;
        const k = this.punchHand === i ? swingCurve(this.attackT, 0.35) : 0;
        const idle = Math.sin(t * 2 + i) * 0.008;
        f.position.set(0.22 * s - 0.14 * s * k, -0.27 + idle + 0.06 * k, -0.45 - 0.35 * k);
        f.rotation.set(0.15 - 0.15 * k, 0.12 * s * (1 - k), 0);
      });
    } else {
      const b = this.base[id];
      const r = o.reloadFrac >= 0 ? Math.sin(Math.PI * o.reloadFrac) : 0;
      const kickMul = id === 'sniper' ? 2.2 : id === 'shotgun' ? 2.6 : 1;
      if (id === 'shotgun') {
        // rack the pump shortly after each shot
        this.pumpT = (this.pumpT ?? 9) + dt;
        const ph = (this.pumpT - 0.22) / 0.3;
        const pull = ph > 0 && ph < 1 ? Math.sin(Math.PI * ph) : 0;
        m.userData.pump.position.z = m.userData.pumpZ + 0.12 * pull;
      }
      const sc = o.scopeAmt;
      m.position.set(
        b.p[0] * (1 - sc),
        b.p[1] - 0.12 * r + 0.08 * sc,
        b.p[2] + 0.05 * this.kick * kickMul,
      );
      m.rotation.set(b.r[0] + 0.2 * this.kick * kickMul - 0.7 * r, b.r[1], 0.5 * r);
    }
  }
}
