import * as THREE from 'three';
import { makeWeapon, makeFist } from './weaponModels.js';

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (t) => 1 - (1 - t) * (1 - t);

/** Humanoid opponent built from boxes. Faces -Z; group origin is at the feet. */
export function createCharacter(color) {
  const suit = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.2 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1d2130, roughness: 0.7 });
  const visorMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xff5533, emissiveIntensity: 2.5 });

  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  const legL = new THREE.Group(); legL.position.set(-0.13, 0.8, 0);
  legL.add(box(0.2, 0.8, 0.22, dark, 0, -0.4, 0));
  const legR = new THREE.Group(); legR.position.set(0.13, 0.8, 0);
  legR.add(box(0.2, 0.8, 0.22, dark, 0, -0.4, 0));
  body.add(legL, legR);

  body.add(box(0.56, 0.6, 0.32, suit, 0, 1.1, 0));
  body.add(box(0.58, 0.08, 0.34, dark, 0, 0.82, 0));
  body.add(box(0.2, 0.1, 0.2, dark, 0, 1.43, 0));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 20, 16), suit);
  head.position.y = 1.62;
  head.castShadow = true;
  body.add(head);
  body.add(box(0.34, 0.09, 0.12, visorMat, 0, 1.65, -0.17));

  function makeArm(side) {
    const arm = new THREE.Group();
    arm.position.set(0.37 * side, 1.33, 0);
    arm.add(box(0.2, 0.14, 0.24, suit, 0, 0.02, 0));
    arm.add(box(0.14, 0.58, 0.14, suit, 0, -0.3, 0));
    arm.add(box(0.12, 0.12, 0.12, dark, 0, -0.6, 0));
    const holder = new THREE.Group();
    holder.position.set(0, -0.62, 0);
    holder.rotation.x = -Math.PI / 2;
    arm.add(holder);
    body.add(arm);
    return { arm, holder };
  }
  const R = makeArm(1);
  const L = makeArm(-1);

  const weapons = {
    sword: makeWeapon('sword'),
    pistol: makeWeapon('pistol'),
    sniper: makeWeapon('sniper'),
    hammer: makeWeapon('hammer'),
    shotgun: makeWeapon('shotgun'),
    fists: makeFist(),
  };
  for (const w of Object.values(weapons)) { w.visible = false; R.holder.add(w); }
  const leftGlove = makeFist();
  leftGlove.visible = false;
  L.holder.add(leftGlove);

  // status effect visuals
  const bubbleMat = new THREE.MeshBasicMaterial({
    color: 0x66f0ff, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const bubble = new THREE.Mesh(new THREE.SphereGeometry(1.05, 24, 16), bubbleMat);
  bubble.position.y = 1.0;
  bubble.visible = false;
  body.add(bubble);
  const stunRing = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 6, 24), new THREE.MeshBasicMaterial({ color: 0xffdd33 }));
  stunRing.rotation.x = Math.PI / 2;
  stunRing.position.y = 2.05;
  stunRing.visible = false;
  body.add(stunRing);
  const ghost = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.38, 1.1, 4, 12),
    new THREE.MeshBasicMaterial({ color: 0xff2244, transparent: true, opacity: 0.4, depthTest: false, depthWrite: false }),
  );
  ghost.position.y = 0.95;
  ghost.renderOrder = 999;
  ghost.visible = false;
  body.add(ghost);

  let current = 'sword';
  let phase = 0;
  let kick = 0;
  let flashT = 0;
  let hitFlash = 0;
  let deathT = -1;
  let melee = null; // {stage, t, dur}

  const api = {
    group,
    setWeapon(id) {
      current = id;
      for (const [k, w] of Object.entries(weapons)) w.visible = k === id;
      leftGlove.visible = id === 'fists';
    },
    reset() {
      body.rotation.set(0, 0, 0);
      body.position.set(0, 0, 0);
      deathT = -1;
      melee = null;
      kick = 0;
      hitFlash = 0;
      suit.emissive.setRGB(0, 0, 0);
    },
    windup(dur) { melee = { stage: 'windup', t: 0, dur }; },
    recoil() {
      kick = 1;
      flashT = 0.05;
    },
    flash() { hitFlash = 1; },
    setStatus(s) {
      bubble.visible = !!(s.shield || s.deflect);
      bubbleMat.color.set(s.deflect ? 0x66f0ff : 0xffb347);
      stunRing.visible = !!s.stun;
      ghost.visible = !!s.reveal;
      weapons.sword.userData.edge.color.set(s.fury ? 0xff3322 : 0x9fe8ff);
      weapons.hammer.userData.edge.color.set(s.jugg ? 0xff3322 : 0x9fe8ff);
      visorMat.emissive.set(s.ult ? 0xffd000 : 0xff5533);
    },
    die() { deathT = 0; },
    getMuzzle(out) {
      const w = weapons[current];
      group.updateMatrixWorld(true);
      return w.userData.muzzle.getWorldPosition(out);
    },
    update(dt, o) {
      const type = o.type;
      // legs
      phase += dt * o.speed * 1.7;
      const walk = Math.sin(phase) * Math.min(1, o.speed / 4) * 0.7;
      legL.rotation.x = walk;
      legR.rotation.x = -walk;

      stunRing.rotation.z += dt * 5;
      bubble.scale.setScalar(1 + Math.sin(performance.now() / 120) * 0.03);
      kick *= Math.exp(-dt * 10);
      flashT -= dt;
      const fl = weapons[current]?.userData.flash;
      if (fl) fl.visible = flashT > 0;

      hitFlash = Math.max(0, hitFlash - dt * 5);
      suit.emissive.setRGB(hitFlash * 0.9, hitFlash * 0.1, hitFlash * 0.1);

      let rx, lx, rz = 0, lz = 0;
      if (type === 'gun') {
        rx = Math.PI / 2 + o.pitch + 0.35 * kick;
        if (current === 'sniper' || current === 'shotgun') { lx = Math.PI / 2 + o.pitch - 0.1; lz = 0.55; rz = -0.05; }
        else { lx = 0.15 - walk * 0.5; }
      } else {
        const isFists = current === 'fists';
        const isHammer = current === 'hammer';
        const idle = isFists ? 1.2 : isHammer ? 0.6 : 0.8;
        const up = isFists ? 0.7 : isHammer ? 3.2 : 2.9;
        const hit = isFists ? 1.7 : isHammer ? 0.9 : 0.35;
        rx = idle;
        if (melee) {
          melee.t += dt;
          if (melee.stage === 'windup') {
            rx = lerp(idle, up, easeOut(Math.min(1, melee.t / melee.dur)));
            if (melee.t >= melee.dur) melee = { stage: 'swing', t: 0, dur: isHammer ? 0.12 : 0.14 };
          } else if (melee.stage === 'swing') {
            rx = lerp(up, hit, easeOut(Math.min(1, melee.t / melee.dur)));
            if (melee.t >= melee.dur) melee = { stage: 'recover', t: 0, dur: isHammer ? 0.45 : 0.25 };
          } else {
            rx = lerp(hit, idle, Math.min(1, melee.t / melee.dur));
            if (melee.t >= melee.dur) melee = null;
          }
        }
        if (isFists) { lx = 1.2 - walk * 0.2; rz = 0.3; lz = -0.3; }
        else if (isHammer) { lx = rx * 0.85; lz = -0.35; rz = 0.2; }
        else { lx = 0.2 - walk * 0.5; }
      }
      R.arm.rotation.set(rx, 0, rz);
      L.arm.rotation.set(lx, 0, lz);

      // death fall
      if (deathT >= 0) {
        deathT += dt;
        const f = Math.min(1, deathT / 0.6);
        body.rotation.x = (Math.PI / 2) * (f * f);
      }
    },
  };
  api.setWeapon('sword');
  return api;
}
