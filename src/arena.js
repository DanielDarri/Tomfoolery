import * as THREE from 'three';

function gridTexture(pal = { a: '#1a1f33', b: '#1f2540', line: '#2f3a5e', edge: '#4a5c9a' }) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = pal.a;
  g.fillRect(0, 0, 512, 512);
  g.fillStyle = pal.b;
  g.fillRect(0, 0, 256, 256);
  g.fillRect(256, 256, 256, 256);
  g.strokeStyle = pal.line;
  g.lineWidth = 2;
  for (let i = 0; i <= 512; i += 64) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 512); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(512, i); g.stroke();
  }
  g.strokeStyle = pal.edge;
  g.lineWidth = 4;
  g.strokeRect(2, 2, 508, 508);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(5, 5);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Lights shared by every arena layout. */
export function buildLights(scene) {
  scene.add(new THREE.HemisphereLight(0x9aa8ff, 0x1a1626, 1.1));
  const sun = new THREE.DirectionalLight(0xfff1e0, 2.2);
  sun.position.set(14, 30, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -26; sc.right = 26; sc.top = 26; sc.bottom = -26; sc.near = 1; sc.far = 80;
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  const corners = [[-17, -17, 0x00e5ff], [17, 17, 0xff3df2], [17, -17, 0x00e5ff], [-17, 17, 0xff3df2]];
  for (const [x, z, c] of corners) {
    const p = new THREE.PointLight(c, 60, 30, 2);
    p.position.set(x, 4, z);
    scene.add(p);
  }
}

/**
 * Builds an arena layout into its own group (toggle `group.visible` to swap layouts).
 * layout: 'duel' (symmetric 1v1 map) or 'practice' (training range with dummy spots).
 */
export function buildArena(scene, layout = 'duel') {
  const colliders = [];
  const meshes = [];
  const SIZE = 40;
  const group = new THREE.Group();
  scene.add(group);
  const practice = layout === 'practice';

  // Floor
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(SIZE, SIZE),
    new THREE.MeshStandardMaterial({
      map: practice ? gridTexture({ a: '#1c2421', b: '#212c27', line: '#2f4a3e', edge: '#3dffa2' }) : gridTexture(),
      roughness: 0.85, metalness: 0.1,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);
  meshes.push(floor);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x2a3050, roughness: 0.8 });
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x3b4470, roughness: 0.6, metalness: 0.2 });
  const coverMat = new THREE.MeshStandardMaterial({ color: 0x4b5a8c, roughness: 0.7 });
  const crateMat = new THREE.MeshStandardMaterial({ color: 0x9a6a3a, roughness: 0.8 });
  const trimBlue = new THREE.MeshBasicMaterial({ color: 0x00e5ff });
  const trimPink = new THREE.MeshBasicMaterial({ color: 0xff3df2 });

  function addBox(x, z, w, h, d, mat, y0 = 0, trim = null) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y0 + h / 2, z);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    meshes.push(m);
    m.updateMatrixWorld();
    colliders.push(new THREE.Box3().setFromObject(m));
    if (trim) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.06, d + 0.02), trim);
      t.position.set(x, y0 + h - 0.03, z);
      group.add(t);
    }
    return m;
  }

  // Perimeter walls
  addBox(0, -20.5, 42, 5, 1, wallMat, 0, trimBlue);
  addBox(0, 20.5, 42, 5, 1, wallMat, 0, trimPink);
  addBox(-20.5, 0, 1, 5, 40, wallMat, 0, trimBlue);
  addBox(20.5, 0, 1, 5, 40, wallMat, 0, trimPink);

  if (practice) {
    const trimGreen = new THREE.MeshBasicMaterial({ color: 0x3dffa2 });
    // distance markers every 5m down the lane (player spawns at z=16 facing -Z)
    for (let z = 11; z >= -19; z -= 5) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(6, 0.02, 0.08), trimGreen);
      line.position.set(0, 0.011, z);
      group.add(line);
    }
    addBox(-12, 4, 4, 2.4, 4, pillarMat, 0, trimGreen);                 // high platform (dummy on top)
    addBox(-12, 7, 1.6, 1.2, 1.6, crateMat);                             // step up to it
    addBox(12, 0, 6, 3, 0.7, coverMat, 0, trimGreen);                    // wall (dummy hides behind)
    addBox(12, -12, 1.4, 6, 1.4, pillarMat, 0, trimGreen);               // tall grapple pillar
    addBox(-5, 2, 1.6, 1, 1.6, crateMat);
    addBox(6, 9, 1.4, 1, 1.4, crateMat);
    return {
      group, colliders, meshes,
      spawns: [new THREE.Vector3(0, 0, 16)],
      dummies: [
        [0, 0, 11], [-4, 0, 6], [4, 0, 6], [0, 0, -4],
        [-8, 0, -12], [8, 0, -14], [-12, 2.4, 4], [12, 0, -2],
      ].map(([x, y, z]) => new THREE.Vector3(x, y, z)),
    };
  }

  // Point-symmetric layout so both spawns are fair: (x,z) mirrors to (-x,-z)
  const sym = (fn) => { fn(1); fn(-1); };
  addBox(0, 0, 3, 4, 3, pillarMat, 0, trimBlue);                               // center block
  sym((s) => addBox(-7 * s, -8 * s, 5, 2.2, 0.7, coverMat, 0, s > 0 ? trimBlue : trimPink)); // long cover walls
  sym((s) => addBox(9 * s, -4 * s, 0.7, 2.2, 4, coverMat, 0, s > 0 ? trimBlue : trimPink));
  sym((s) => addBox(-13 * s, -3 * s, 1.4, 4, 1.4, pillarMat));                 // pillars
  sym((s) => addBox(6 * s, -14 * s, 1.4, 4, 1.4, pillarMat));
  // Crates (1m tall: jumpable, headshots possible over them)
  sym((s) => addBox(-3 * s, -11 * s, 1.6, 1, 1.6, crateMat));
  sym((s) => addBox(4 * s, -5 * s, 1.4, 1, 1.4, crateMat));
  sym((s) => {
    addBox(13 * s, -13 * s, 1.8, 1, 1.8, crateMat);
    addBox(13.3 * s, -13.3 * s, 1.1, 0.8, 1.1, crateMat, 1);                  // stacked perch
  });

  return {
    group,
    colliders,
    meshes,
    spawns: [new THREE.Vector3(0, 0, -17), new THREE.Vector3(0, 0, 17)],
  };
}
