// Transient combat effects, all pooled: nothing is allocated while the game
// runs. Tracers are thin additive cylinders stretched between two points,
// impacts are a burst of tiny boxes, the explosion is a growing shell with a
// light, and the shake is a trauma value main.js reads each frame.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACERS = 24;
const SPARKS = 48;

export function createEffects(scene) {
  const tracerMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const tracers = [];
  for (let i = 0; i < TRACERS; i += 1) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 5, 1, true), tracerMat.clone());
    mesh.visible = false;
    scene.add(mesh);
    tracers.push({ mesh, life: 0 });
  }
  const sparkMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.glow), transparent: true, opacity: 1 });
  const sparks = [];
  for (let i = 0; i < SPARKS; i += 1) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), sparkMat.clone());
    mesh.visible = false;
    scene.add(mesh);
    sparks.push({ mesh, life: 0, vel: new THREE.Vector3() });
  }
  const boom = new THREE.Mesh(
    new THREE.SphereGeometry(1, 20, 14),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.ember), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  boom.visible = false;
  scene.add(boom);
  const boomLight = new THREE.PointLight(new THREE.Color(PALETTE.ember), 0, 30, 1.6);
  scene.add(boomLight);
  let boomLife = 0;
  let trauma = 0;
  const up = new THREE.Vector3(0, 1, 0);
  const mid = new THREE.Vector3();
  const dir = new THREE.Vector3();

  return {
    fireTracer(from, to, color = PALETTE.accent) {
      const t = tracers.find((x) => x.life <= 0) ?? tracers[0];
      mid.addVectors(from, to).multiplyScalar(0.5);
      dir.subVectors(to, from);
      const len = dir.length() || 0.01;
      t.mesh.position.copy(mid);
      t.mesh.scale.set(1, len, 1);
      t.mesh.quaternion.setFromUnitVectors(up, dir.normalize());
      t.mesh.material.color.set(color);
      t.mesh.material.opacity = 0.9;
      t.mesh.visible = true;
      t.life = 0.07;
    },
    sparksAt(point, count = 6) {
      for (let i = 0; i < count; i += 1) {
        const s = sparks.find((x) => x.life <= 0);
        if (!s) return;
        s.mesh.position.copy(point);
        s.vel.set((Math.random() - 0.5) * 4, Math.random() * 3 + 1, (Math.random() - 0.5) * 4);
        s.mesh.material.opacity = 1;
        s.mesh.visible = true;
        s.life = 0.35;
      }
    },
    explode(point) {
      boom.position.copy(point);
      boom.scale.setScalar(0.5);
      boom.visible = true;
      boomLife = 0.7;
      boomLight.position.copy(point).y += 1.5;
      boomLight.intensity = 120;
      trauma = Math.min(1, trauma + 0.7);
    },
    addTrauma(amount) { trauma = Math.min(1, trauma + amount); },
    shake() { return trauma * trauma; },
    step(dt) {
      trauma = Math.max(0, trauma - dt * 1.6);
      for (const t of tracers) {
        if (t.life <= 0) continue;
        t.life -= dt;
        t.mesh.material.opacity = Math.max(0, t.life / 0.07) * 0.9;
        if (t.life <= 0) t.mesh.visible = false;
      }
      for (const s of sparks) {
        if (s.life <= 0) continue;
        s.life -= dt;
        s.vel.y -= 9 * dt;
        s.mesh.position.addScaledVector(s.vel, dt);
        s.mesh.material.opacity = Math.max(0, s.life / 0.35);
        if (s.life <= 0) s.mesh.visible = false;
      }
      if (boomLife > 0) {
        boomLife -= dt;
        const k = 1 - Math.max(0, boomLife) / 0.7;
        boom.scale.setScalar(0.5 + k * 9);
        boom.material.opacity = Math.max(0, 0.55 * (1 - k));
        boomLight.intensity = Math.max(0, 120 * (1 - k));
        if (boomLife <= 0) { boom.visible = false; boomLight.intensity = 0; }
      }
    },
  };
}
