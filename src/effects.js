import * as THREE from 'three';

const tracerGeo = new THREE.BoxGeometry(1, 1, 1);
const sparkGeo = new THREE.SphereGeometry(0.045, 6, 4);
const ringGeo = new THREE.RingGeometry(0.85, 1, 48);

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
  }

  tracer(from, to, color = 0xffffff, life = 0.06, width = 0.015) {
    const len = from.distanceTo(to);
    if (len < 0.01) return;
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const m = new THREE.Mesh(tracerGeo, mat);
    m.position.copy(from).lerp(to, 0.5);
    m.lookAt(to);
    m.scale.set(width, width, len);
    this.scene.add(m);
    this.items.push({ obj: m, life, max: life, kind: 'fade', width });
  }

  burst(point, color, count = 8, speed = 3) {
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false });
      const m = new THREE.Mesh(sparkGeo, mat);
      m.position.copy(point);
      const vel = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5)
        .normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      const life = 0.3 + Math.random() * 0.3;
      this.scene.add(m);
      this.items.push({ obj: m, vel, life, max: life, kind: 'particle' });
    }
  }

  /** Expanding shockwave ring on the ground. */
  ring(pos, color, radius, life = 0.5) {
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.9, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const m = new THREE.Mesh(ringGeo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(pos.x, pos.y + 0.06, pos.z);
    this.scene.add(m);
    this.items.push({ obj: m, life, max: life, kind: 'ring', radius });
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt;
      const f = Math.max(0, it.life / it.max);
      if (it.kind === 'ring') {
        const s = it.radius * (0.15 + 0.85 * (1 - f * f));
        it.obj.scale.set(s, s, s);
        it.obj.material.opacity = 0.9 * f;
      } else if (it.kind === 'particle') {
        it.vel.y -= 9.8 * dt;
        it.obj.position.addScaledVector(it.vel, dt);
        it.obj.scale.setScalar(0.4 + f * 0.8);
        it.obj.material.opacity = f;
      } else {
        it.obj.material.opacity = 0.9 * f;
        const w = it.width * (0.5 + f * 0.5);
        it.obj.scale.x = it.obj.scale.y = w;
      }
      if (it.life <= 0) {
        this.scene.remove(it.obj);
        it.obj.material.dispose();
        this.items.splice(i, 1);
      }
    }
  }

  clear() {
    for (const it of this.items) {
      this.scene.remove(it.obj);
      it.obj.material.dispose();
    }
    this.items.length = 0;
  }
}
