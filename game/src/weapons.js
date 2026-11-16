// The arsenal: four guns and one grenade. The table owns the numbers (damage,
// magazine, fire rate, spread, price); the view models are box-built guns with
// different silhouettes, and the grenade is a pooled mesh with a ballistic arc.
// main.js owns the ray and the damage; this file owns the guns.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  p9: { name: 'P9 Sidearm', price: 0, damage: 34, headMult: 4, mag: 12, reserve: 36, gap: 0.14, auto: false, reload: 1.4, spreadStill: 0.004, spreadMove: 0.03, kick: 0.011, range: 60 },
  vk47: { name: 'VK-47 Carbine', price: 2700, damage: 33, headMult: 4, mag: 30, reserve: 90, gap: 0.1, auto: true, reload: 2.0, spreadStill: 0.0022, spreadMove: 0.028, kick: 0.013, range: 80 },
  rook: { name: 'Rook-9 SMG', price: 1500, damage: 26, headMult: 4, mag: 32, reserve: 128, gap: 0.075, auto: true, reload: 1.7, spreadStill: 0.006, spreadMove: 0.034, kick: 0.008, range: 50 },
  longbow: { name: 'Longbow .50', price: 4750, damage: 110, headMult: 4, mag: 5, reserve: 15, gap: 1.1, auto: false, reload: 2.8, spreadStill: 0.0008, spreadMove: 0.02, kick: 0.03, range: 120, scoped: true },
};
export const GRENADE_PRICE = 200;
export const ARMOR_PRICE = 650;

function gunModel(kind) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.surface), roughness: 0.6, metalness: 0.3 });
  const group = new THREE.Group();
  const add = (w, h, d, x, y, z, mat = body) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    group.add(m);
    return m;
  };
  if (kind === 'p9') {
    add(0.07, 0.09, 0.22, 0, 0, 0);
    add(0.04, 0.04, 0.12, 0, 0.02, -0.15, grip);
    add(0.06, 0.12, 0.06, 0, -0.09, 0.06, grip);
  } else if (kind === 'vk47') {
    add(0.09, 0.1, 0.42, 0, 0, 0);
    add(0.045, 0.045, 0.4, 0, 0.025, -0.38, grip);
    add(0.075, 0.08, 0.22, 0, -0.02, 0.3, grip);
    add(0.05, 0.16, 0.07, 0, -0.12, -0.05, dark).rotation.x = 0.35;
    add(0.03, 0.05, 0.1, 0, 0.075, -0.08, dark);
  } else if (kind === 'rook') {
    add(0.08, 0.09, 0.3, 0, 0, 0);
    add(0.05, 0.05, 0.22, 0, 0.01, -0.24, dark);
    add(0.06, 0.1, 0.06, 0, -0.08, 0.05, grip);
    add(0.07, 0.07, 0.14, 0, -0.02, 0.2, grip);
  } else {
    add(0.07, 0.08, 0.55, 0, 0, 0);
    add(0.04, 0.04, 0.55, 0, 0.02, -0.5, grip);
    add(0.06, 0.06, 0.18, 0, 0.08, -0.05, dark);
    add(0.07, 0.09, 0.2, 0, -0.02, 0.32, grip);
    add(0.05, 0.05, 0.3, 0, 0.01, -0.42, dark);
  }
  group.position.set(0.24, -0.2, -0.42);
  return group;
}

export function createWeapons(camera) {
  const models = {};
  for (const id of Object.keys(WEAPONS)) {
    models[id] = gunModel(id);
    models[id].visible = false;
    camera.add(models[id]);
  }
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  // The grenade: one pooled mesh, a ballistic arc with one bounce, a 1.4 s fuse.
  const grenadeMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 12, 10),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.good), roughness: 0.4, metalness: 0.3 }),
  );
  grenadeMesh.visible = false;
  const grenade = { mesh: grenadeMesh, active: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), fuse: 0, bounced: false };

  const owned = { p9: true };
  const ammo = {};
  for (const id of Object.keys(WEAPONS)) ammo[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
  const state = { current: 'p9', cooldown: 0, reloadLeft: 0, flash: 0, kick: 0, grenades: 0 };

  function currentDef() { return WEAPONS[state.current]; }
  function currentAmmo() { return ammo[state.current]; }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const model = models[state.current];
    model.position.z = -0.42 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (currentDef().reload - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const a = currentAmmo();
        const take = Math.min(currentDef().mag - a.mag, a.reserve);
        a.mag += take;
        a.reserve -= take;
      }
    }
  }

  return {
    state,
    owned,
    ammo,
    def: currentDef,
    step,
    switchTo(id) {
      if (!owned[id] || id === state.current || state.reloadLeft > 0) return false;
      models[state.current].visible = false;
      state.current = id;
      state.cooldown = Math.max(state.cooldown, 0.25);
      models[id].visible = true;
      return true;
    },
    buy(id) {
      if (owned[id]) return false;
      owned[id] = true;
      return true;
    },
    ready() {
      return currentAmmo().mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = currentDef().gap;
      state.flash = 0.06;
      state.kick = 0.055;
    },
    takeRound() {
      if (currentAmmo().mag <= 0) return false;
      currentAmmo().mag -= 1;
      return true;
    },
    reload() {
      const a = currentAmmo();
      if (state.reloadLeft > 0 || a.mag === currentDef().mag || a.reserve === 0) return;
      state.reloadLeft = currentDef().reload;
    },
    spread(speed) {
      const def = currentDef();
      return def.spreadStill + Math.min(1, speed / 5.2) * def.spreadMove;
    },
    refill() {
      for (const id of Object.keys(WEAPONS)) {
        ammo[id].mag = WEAPONS[id].mag;
        ammo[id].reserve = WEAPONS[id].reserve;
      }
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      state.grenades = 0;
    },
    showCurrent() { models[state.current].visible = true; },
    hideCurrent() { models[state.current].visible = false; },
    grenade,
    throwGrenade(origin, direction) {
      if (state.grenades <= 0 || grenade.active) return false;
      state.grenades -= 1;
      grenade.active = true;
      grenade.bounced = false;
      grenade.fuse = 1.4;
      grenade.pos.copy(origin);
      grenade.vel.copy(direction).multiplyScalar(13);
      grenade.vel.y += 3.5;
      grenade.mesh.visible = true;
      return true;
    },
  };
}
