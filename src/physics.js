import * as THREE from 'three';

export const EYE = 1.6;        // eye height above feet
export const HEAD_Y = 1.62;    // head sphere center above feet
export const HEAD_R = 0.26;
export const BODY_H = 1.38;    // body box top above feet
export const BODY_HALF = 0.34; // body box half width
export const RADIUS = 0.4;     // collision radius

const _ray = new THREE.Ray();
const _sphere = new THREE.Sphere();
const _box = new THREE.Box3();
const _v = new THREE.Vector3();

/** Size multiplier of an entity (large fighters have bigger hitboxes, collision and eye height). */
export const sizeOf = (ent) => (ent && ent.weapon && ent.weapon.scale) || 1;

/** Ray vs character hitboxes (head sphere + body box). dir must be normalized. */
export function rayVsEntity(origin, dir, ent) {
  _ray.set(origin, dir);
  let best = null;
  const s = sizeOf(ent);

  _sphere.center.set(ent.pos.x, ent.pos.y + HEAD_Y * s, ent.pos.z);
  _sphere.radius = HEAD_R * s;
  if (_ray.intersectSphere(_sphere, _v)) {
    best = { part: 'head', dist: _v.distanceTo(origin), point: _v.clone() };
  }

  _box.min.set(ent.pos.x - BODY_HALF * s, ent.pos.y, ent.pos.z - BODY_HALF * s);
  _box.max.set(ent.pos.x + BODY_HALF * s, ent.pos.y + BODY_H * s, ent.pos.z + BODY_HALF * s);
  if (_ray.intersectBox(_box, _v)) {
    const d = _v.distanceTo(origin);
    if (!best || d < best.dist) best = { part: 'body', dist: d, point: _v.clone() };
  }
  return best;
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Push a vertical cylinder (feet at pos.y) out of box colliders on the XZ plane. */
export function resolveCircle(pos, r, colliders) {
  let hit = false;
  for (const b of colliders) {
    if (b.max.y <= pos.y + 0.05 || b.min.y >= pos.y + 1.8) continue;
    const cx = clamp(pos.x, b.min.x, b.max.x);
    const cz = clamp(pos.z, b.min.z, b.max.z);
    const dx = pos.x - cx, dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    hit = true;
    if (d2 > 1e-10) {
      const d = Math.sqrt(d2);
      pos.x = cx + (dx / d) * r;
      pos.z = cz + (dz / d) * r;
    } else {
      const pl = pos.x - b.min.x, pr = b.max.x - pos.x;
      const pb = pos.z - b.min.z, pf = b.max.z - pos.z;
      const m = Math.min(pl, pr, pb, pf);
      if (m === pl) pos.x = b.min.x - r;
      else if (m === pr) pos.x = b.max.x + r;
      else if (m === pb) pos.z = b.min.z - r;
      else pos.z = b.max.z + r;
    }
  }
  return hit;
}

/** Highest surface under the entity that it was above last frame. */
export function groundHeight(pos, prevY, r, colliders) {
  let g = 0;
  const rr = r * 0.7;
  for (const b of colliders) {
    if (b.max.y > prevY + 0.05 || b.max.y <= g) continue;
    const cx = clamp(pos.x, b.min.x, b.max.x);
    const cz = clamp(pos.z, b.min.z, b.max.z);
    const dx = pos.x - cx, dz = pos.z - cz;
    if (dx * dx + dz * dz < rr * rr) g = b.max.y;
  }
  return g;
}

/** Would a circle at (x,z) with feet at y overlap a box it can't walk over? */
export function blockedAt(x, z, y, r, colliders) {
  for (const b of colliders) {
    if (b.max.y <= y + 0.4 || b.min.y >= y + 1.8) continue;
    const cx = clamp(x, b.min.x, b.max.x);
    const cz = clamp(z, b.min.z, b.max.z);
    const dx = x - cx, dz = z - cz;
    if (dx * dx + dz * dz < r * r) return true;
  }
  return false;
}
