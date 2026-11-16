// Shared movement math: the one AABB probe every walker uses, so the player and
// the bots resolve against the same world the same way. A body is a vertical box
// of radius r and height h standing on position.y; lift keeps the feet and crown
// out of the horizontal tests, so standing on the floor is not read as a wall.
import * as THREE from 'three';

const probe = new THREE.Box3();

export function boxHits(colliders, x, y, z, radius, height, lift) {
  probe.min.set(x - radius, y + lift, z - radius);
  probe.max.set(x + radius, y + height - lift, z + radius);
  for (const collider of colliders) if (probe.intersectsBox(collider)) return collider;
  return null;
}

// Walk a body through the world for dt: wish is a unit XZ vector (or zero),
// speed the target speed, jump true to jump. Handles gravity, ground and the
// axis-separated slide, and returns nothing; the body is mutated in place.
export function moveBody(colliders, body, dt, wishX, wishZ, speed, jump, opts = {}) {
  const accel = body.onGround ? (opts.groundAccel ?? 42) : (opts.airAccel ?? 9);
  const friction = opts.friction ?? 9;
  const gravity = opts.gravity ?? 20;
  const jumpSpeed = opts.jumpSpeed ?? 6.2;
  const blend = Math.min(1, (accel * dt) / speed);
  body.velocity.x += (wishX * speed - body.velocity.x) * blend;
  body.velocity.z += (wishZ * speed - body.velocity.z) * blend;
  if (body.onGround && wishX === 0 && wishZ === 0) {
    const damp = Math.max(0, 1 - friction * dt);
    body.velocity.x *= damp;
    body.velocity.z *= damp;
  }
  if (jump && body.onGround) {
    body.velocity.y = jumpSpeed;
    body.onGround = false;
  }
  body.velocity.y -= gravity * dt;
  const nextX = body.position.x + body.velocity.x * dt;
  if (!boxHits(colliders, nextX, body.position.y, body.position.z, body.radius, body.height, 0.04)) body.position.x = nextX;
  else body.velocity.x = 0;
  const nextZ = body.position.z + body.velocity.z * dt;
  if (!boxHits(colliders, body.position.x, body.position.y, nextZ, body.radius, body.height, 0.04)) body.position.z = nextZ;
  else body.velocity.z = 0;
  body.position.y += body.velocity.y * dt;
  body.onGround = false;
  const hit = boxHits(colliders, body.position.x, body.position.y, body.position.z, body.radius, body.height, 0);
  if (hit && body.velocity.y <= 0) {
    body.position.y = hit.max.y;
    body.velocity.y = 0;
    body.onGround = true;
  } else if (hit) {
    body.position.y = hit.min.y - body.height;
    body.velocity.y = 0;
  }
  if (body.position.y < 0) {
    body.position.y = 0;
    body.velocity.y = 0;
    body.onGround = true;
  }
  body.velocity.y = Math.max(-30, body.velocity.y);
}

export function makeBody(x, z, radius = 0.34, height = 1.72) {
  return {
    position: new THREE.Vector3(x, 0, z),
    velocity: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    eye: 1.6,
    onGround: true,
    crouching: false,
    height,
    radius,
  };
}
