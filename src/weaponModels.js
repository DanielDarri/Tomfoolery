import * as THREE from 'three';

// All weapon models point down -Z with the grip at the origin.
const M = {
  steel: new THREE.MeshStandardMaterial({ color: 0xdfe5ee, metalness: 0.9, roughness: 0.22 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xd4a637, metalness: 0.85, roughness: 0.3 }),
  leather: new THREE.MeshStandardMaterial({ color: 0x4a2c1a, roughness: 0.85 }),
  gun: new THREE.MeshStandardMaterial({ color: 0x2a2d34, metalness: 0.6, roughness: 0.4 }),
  gunLight: new THREE.MeshStandardMaterial({ color: 0x555b68, metalness: 0.5, roughness: 0.45 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.7 }),
  lens: new THREE.MeshStandardMaterial({ color: 0x113355, emissive: 0x2288ff, emissiveIntensity: 1.5 }),
  glove: new THREE.MeshStandardMaterial({ color: 0xb8352a, roughness: 0.6 }),
  skin: new THREE.MeshStandardMaterial({ color: 0xd9a47e, roughness: 0.7 }),
  sleeve: new THREE.MeshStandardMaterial({ color: 0x2b3a67, roughness: 0.8 }),
  edge: new THREE.MeshBasicMaterial({ color: 0x9fe8ff }),
  flash: new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }),
};
export const MATERIALS = M;

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}
const box = (w, h, d, mat, x, y, z) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z);
function cylZ(rt, rb, len, mat, x, y, z, seg = 12) {
  const m = mesh(new THREE.CylinderGeometry(rt, rb, len, seg), mat, x, y, z);
  m.rotation.x = Math.PI / 2;
  return m;
}

function addMuzzle(g, x, y, z, size = 0.06) {
  const muzzle = new THREE.Object3D();
  muzzle.position.set(x, y, z);
  g.add(muzzle);
  const flash = new THREE.Mesh(new THREE.OctahedronGeometry(size, 0), M.flash);
  flash.visible = false;
  muzzle.add(flash);
  g.userData.muzzle = muzzle;
  g.userData.flash = flash;
}

export function makeSword() {
  const g = new THREE.Group();
  g.add(cylZ(0.022, 0.026, 0.2, M.leather, 0, 0, 0));
  g.add(mesh(new THREE.SphereGeometry(0.035, 10, 8), M.gold, 0, 0, 0.11));
  g.add(box(0.26, 0.035, 0.05, M.gold, 0, 0, -0.11));
  g.add(box(0.06, 0.012, 0.85, M.steel, 0, 0, -0.56));
  const edge = M.edge.clone(); // per-instance so Blade Fury can recolor one sword
  g.add(box(0.012, 0.016, 0.8, edge, 0, 0, -0.55));
  g.userData.edge = edge;
  const tip = mesh(new THREE.ConeGeometry(0.042, 0.12, 4), M.steel, 0, 0, -1.04);
  tip.rotation.x = -Math.PI / 2;
  tip.scale.set(1, 1, 0.25);
  g.add(tip);
  addMuzzle(g, 0, 0, -0.9);
  return g;
}

export function makePistol() {
  const g = new THREE.Group();
  g.add(box(0.06, 0.065, 0.28, M.gun, 0, 0.05, -0.1));
  g.add(box(0.055, 0.035, 0.22, M.gunLight, 0, 0.005, -0.08));
  const grip = box(0.05, 0.14, 0.07, M.gun, 0, -0.06, 0.01);
  grip.rotation.x = -0.2;
  g.add(grip);
  g.add(cylZ(0.014, 0.014, 0.04, M.gunLight, 0, 0.05, -0.25, 8));
  g.add(box(0.012, 0.018, 0.012, M.gunLight, 0, 0.09, -0.22));
  addMuzzle(g, 0, 0.05, -0.28, 0.05);
  return g;
}

export function makeSniper() {
  const g = new THREE.Group();
  g.add(box(0.06, 0.09, 0.55, M.gun, 0, 0, -0.15));
  g.add(box(0.05, 0.12, 0.32, M.wood, 0, -0.02, 0.27));
  g.add(cylZ(0.016, 0.022, 0.75, M.gunLight, 0, 0.015, -0.8));
  g.add(cylZ(0.032, 0.032, 0.32, M.gun, 0, 0.1, -0.15));
  g.add(cylZ(0.04, 0.034, 0.05, M.gun, 0, 0.1, -0.33));
  g.add(cylZ(0.033, 0.033, 0.01, M.lens, 0, 0.1, -0.36));
  const grip = box(0.045, 0.12, 0.06, M.wood, 0, -0.09, 0.03);
  grip.rotation.x = -0.25;
  g.add(grip);
  g.add(box(0.07, 0.02, 0.05, M.gunLight, 0.04, 0.04, 0.0));
  addMuzzle(g, 0, 0.015, -1.2, 0.09);
  return g;
}

export function makeShotgun() {
  const g = new THREE.Group();
  g.add(box(0.075, 0.1, 0.34, M.gun, 0, 0, -0.08));                 // receiver
  g.add(cylZ(0.024, 0.024, 0.7, M.gunLight, 0, 0.03, -0.58));       // barrel
  g.add(cylZ(0.018, 0.018, 0.6, M.gun, 0, -0.02, -0.52, 8));        // mag tube
  const pump = cylZ(0.034, 0.034, 0.2, M.wood, 0, -0.02, -0.4);     // pump grip
  g.add(pump);
  g.userData.pump = pump;
  g.userData.pumpZ = pump.position.z;
  g.add(box(0.06, 0.13, 0.34, M.wood, 0, -0.04, 0.25));             // stock
  const grip = box(0.05, 0.12, 0.06, M.wood, 0, -0.09, 0.05);
  grip.rotation.x = -0.3;
  g.add(grip);
  g.add(box(0.012, 0.02, 0.012, M.gold, 0, 0.065, -0.9));           // bead sight
  addMuzzle(g, 0, 0.03, -0.95, 0.11);
  return g;
}

export function makeHammer() {
  const g = new THREE.Group();
  g.add(cylZ(0.026, 0.03, 0.82, M.wood, 0, 0, -0.3));          // haft
  g.add(cylZ(0.034, 0.034, 0.16, M.leather, 0, 0, 0.02));       // grip wrap
  g.add(mesh(new THREE.SphereGeometry(0.04, 10, 8), M.gold, 0, 0, 0.12));
  g.add(box(0.36, 0.2, 0.2, M.gunLight, 0, 0, -0.74));          // head
  g.add(box(0.06, 0.24, 0.24, M.steel, 0.2, 0, -0.74));         // striking faces
  g.add(box(0.06, 0.24, 0.24, M.steel, -0.2, 0, -0.74));
  g.add(box(0.38, 0.05, 0.22, M.gold, 0, 0, -0.74));            // band
  const edge = M.edge.clone(); // per-instance so Juggernaut can recolor it
  g.add(box(0.012, 0.21, 0.21, edge, 0.234, 0, -0.74));
  g.add(box(0.012, 0.21, 0.21, edge, -0.234, 0, -0.74));
  g.userData.edge = edge;
  addMuzzle(g, 0, 0, -0.74, 0.001);
  return g;
}

export function makeFist(viewmodel = false) {
  const g = new THREE.Group();
  g.add(box(0.11, 0.1, 0.12, M.glove, 0, 0, 0));
  g.add(box(0.115, 0.04, 0.03, M.glove, 0, 0.02, -0.065));
  g.add(box(0.09, 0.06, 0.03, M.glove, 0.04, -0.03, -0.03));
  g.add(box(0.1, 0.09, 0.05, M.leather, 0, 0, 0.08));
  if (viewmodel) g.add(box(0.085, 0.085, 0.4, M.sleeve, 0, -0.01, 0.3));
  addMuzzle(g, 0, 0, -0.08, 0.001);
  return g;
}

export function makeHand() {
  const g = new THREE.Group();
  g.add(box(0.075, 0.09, 0.1, M.skin, 0, -0.04, 0.03));
  const arm = box(0.085, 0.085, 0.45, M.sleeve, 0.02, -0.08, 0.28);
  arm.rotation.x = 0.25;
  g.add(arm);
  return g;
}

export function makeWeapon(id) {
  switch (id) {
    case 'sword': return makeSword();
    case 'pistol': return makePistol();
    case 'sniper': return makeSniper();
    case 'hammer': return makeHammer();
    case 'shotgun': return makeShotgun();
    default: return makeFist();
  }
}
