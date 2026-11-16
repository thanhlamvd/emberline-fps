// The bots: one class for both teams. Defenders hold sites and patrol, pushers
// follow the player into a site, and every bot sees, hears, strafes, bursts and
// retreats. A bot never damages anyone itself: when it fires it hands main.js a
// muzzle and a direction, and main.js resolves the ray, so the same shooting
// rules govern the player and the bots. Routes come from the map's waypoint
// graph, searched with breadth-first search.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { makeBody, moveBody } from './motion.js';

const BOT_RIFLE_BODY = 25;
const BOT_RIFLE_HEAD = 100;
const REACTION_MIN = 0.35;
const REACTION_MAX = 0.65;
const VISION_RANGE = 42;
const VISION_COS = 0.26; // ~75 degrees
const WALK_SPEED = 4.2;
const STRAFE_SPEED = 3.1;
const RETREAT_SPEED = 4.8;

export function nearestWaypoint(waypoints, x, z) {
  let best = 0;
  let bestD = Infinity;
  for (const w of waypoints) {
    const d = (w.x - x) * (w.x - x) + (w.z - z) * (w.z - z);
    if (d < bestD) { bestD = d; best = w.id; }
  }
  return best;
}

export function findPath(waypoints, from, to) {
  if (from === to) return [to];
  const prev = new Map([[from, -1]]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift();
    for (const next of waypoints[cur].links) {
      if (prev.has(next)) continue;
      prev.set(next, cur);
      if (next === to) {
        const path = [to];
        let node = to;
        while (prev.get(node) !== -1) { node = prev.get(node); path.unshift(node); }
        return path;
      }
      queue.push(next);
    }
  }
  return [to];
}

const NAMES = { ashen: ['Vex', 'Marrow', 'Flint', 'Sable'], ember: ['Rook', 'Hale'] };

export function createBots(scene, world) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 60;
  const bots = [];
  const tmpDir = new THREE.Vector3();
  const tmpEye = new THREE.Vector3();
  const tmpTarget = new THREE.Vector3();

  function makeBotMesh(team) {
    const group = new THREE.Group();
    const teamColor = team === 'ember' ? PALETTE.ember : PALETTE.ash;
    const teamMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(teamColor), roughness: 0.6, metalness: 0.1 });
    const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.surface), roughness: 0.85 });
    const headMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.05 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.78, 0.3), teamMat);
    torso.position.y = 1.0;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.155, 14, 10), headMat);
    head.position.y = 1.53;
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.24), darkMat);
    legL.position.set(-0.14, 0.3, 0);
    const legR = legL.clone();
    legR.position.x = 0.14;
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.55), darkMat);
    gun.position.set(0.18, 1.18, -0.28);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.05),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(teamColor), emissive: new THREE.Color(teamColor), emissiveIntensity: 0.9 }));
    lamp.position.set(0, 1.42, -0.16);
    group.add(torso, head, legL, legR, gun, lamp);
    group.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    return { group, torso, head };
  }

  function createBot(team, role, index, spawn, anchorId) {
    const { group, torso, head } = makeBotMesh(team);
    scene.add(group);
    const body = makeBody(spawn[0], spawn[1]);
    const bot = {
      team, role, name: NAMES[team][index % NAMES[team].length], index,
      body, group, torso, head, anchorId, home: [...spawn],
      hp: 100, alive: true, state: 'hold', path: [], pathIndex: 0,
      lastSeen: null, hearTarget: null, burstLeft: 0, burstTimer: 0, pauseTimer: 0,
      reactUntil: 0, seenAt: -10, strafeDir: 1, strafeTimer: 0, defuseT: 0,
      blindUntil: -1, holdTimer: 4 + Math.random() * 6, fallT: 0, patrolTarget: -1,
    };
    torso.userData.bot = bot;
    torso.userData.part = 'torso';
    head.userData.bot = bot;
    head.userData.part = 'head';
    bots.push(bot);
    return bot;
  }

  function eyePos(bot, out) {
    return out.set(bot.body.position.x, bot.body.position.y + 1.5, bot.body.position.z);
  }

  function seesTarget(bot, target, time) {
    tmpTarget.set(target.pos.x, target.pos.y + 1.1, target.pos.z);
    eyePos(bot, tmpEye);
    tmpDir.subVectors(tmpTarget, tmpEye);
    const dist = tmpDir.length();
    if (dist > VISION_RANGE) return null;
    tmpDir.normalize();
    const fx = -Math.sin(bot.body.yaw);
    const fz = -Math.cos(bot.body.yaw);
    if (dist > 6 && fx * tmpDir.x + fz * tmpDir.z < VISION_COS) return null;
    raycaster.set(tmpEye, tmpDir);
    const hit = raycaster.intersectObjects(world.shootables, false)[0];
    if (hit && hit.distance < dist - 0.4) return null;
    return { dist };
  }

  function setPath(bot, toId) {
    const from = nearestWaypoint(world.waypoints, bot.body.position.x, bot.body.position.z);
    bot.path = findPath(world.waypoints, from, toId);
    bot.pathIndex = 0;
  }

  function stepBot(bot, dt, time, ctx) {
    if (!bot.alive) {
      bot.fallT = Math.min(1, bot.fallT + dt / 0.4);
      bot.group.rotation.x = -bot.fallT * 1.45;
      bot.group.position.y = -bot.fallT * 0.08;
      return;
    }
    const blinded = time < bot.blindUntil;
    let wishX = 0;
    let wishZ = 0;
    let speed = WALK_SPEED;
    let faceTarget = null;

    // Perception: the nearest visible enemy.
    let visible = null;
    let visibleTarget = null;
    for (const enemy of ctx.enemiesFor(bot)) {
      if (!enemy.alive) continue;
      const seen = seesTarget(bot, enemy, time);
      if (seen && (!visible || seen.dist < visible.dist)) { visible = seen; visibleTarget = enemy; }
    }
    if (visible) {
      bot.lastSeen = { x: visibleTarget.pos.x, z: visibleTarget.pos.z, t: time };
      if (time - bot.seenAt > 1.2) bot.reactUntil = time + REACTION_MIN + Math.random() * (REACTION_MAX - REACTION_MIN);
      bot.seenAt = time;
      bot.state = 'engage';
    } else if (bot.state === 'engage' && bot.lastSeen && time - bot.lastSeen.t < 2.5) {
      bot.state = 'investigate';
    } else if (bot.state === 'engage') {
      bot.state = bot.role === 'defend' ? 'hold' : 'push';
    }
    // Hearing: a fresh noise pulls a bot to investigate.
    for (const noise of ctx.noises) {
      const dx = noise.x - bot.body.position.x;
      const dz = noise.z - bot.body.position.z;
      if (dx * dx + dz * dz < noise.radius * noise.radius && bot.state !== 'engage') {
        bot.hearTarget = { x: noise.x, z: noise.z, t: time };
      }
    }
    if (bot.state !== 'engage' && bot.hearTarget && time - bot.hearTarget.t < 6) bot.state = 'investigate';
    // The bomb: the nearest defender goes to defuse.
    if (ctx.bombPlanted && bot.team === 'ashen' && ctx.defuser === bot && bot.state !== 'engage') bot.state = 'defuse';

    if (blinded) {
      bot.state = 'blinded';
      wishX = Math.sin(time * 1.3 + bot.index * 2.1) * 0.4;
      wishZ = Math.cos(time * 1.1 + bot.index * 1.7) * 0.4;
      speed = 1.4;
    } else if (bot.state === 'engage' && visibleTarget) {
      faceTarget = visibleTarget;
      bot.strafeTimer -= dt;
      if (bot.strafeTimer <= 0) {
        bot.strafeDir = Math.random() < 0.5 ? -1 : 1;
        bot.strafeTimer = 0.9 + Math.random() * 0.8;
      }
      const dx = visibleTarget.pos.x - bot.body.position.x;
      const dz = visibleTarget.pos.z - bot.body.position.z;
      const len = Math.hypot(dx, dz) || 1;
      const px = -dz / len;
      const pz = dx / len;
      const toward = visible.dist > 14 ? 0.5 : visible.dist < 6 ? -0.6 : 0;
      wishX = px * bot.strafeDir + (dx / len) * toward;
      wishZ = pz * bot.strafeDir + (dz / len) * toward;
      const wl = Math.hypot(wishX, wishZ) || 1;
      wishX /= wl;
      wishZ /= wl;
      speed = STRAFE_SPEED;
      // Burst fire once the reaction delay has passed.
      if (time >= bot.reactUntil) {
        bot.burstTimer -= dt;
        bot.pauseTimer -= dt;
        if (bot.burstLeft > 0 && bot.burstTimer <= 0) {
          bot.burstLeft -= 1;
          bot.burstTimer = 0.11;
          const spread = 0.018 + visible.dist * 0.0012 + visibleTarget.speed * 0.0035;
          tmpDir.set(visibleTarget.pos.x - bot.body.position.x, 1.15 - 1.5, visibleTarget.pos.z - bot.body.position.z).normalize();
          tmpDir.x += (Math.random() * 2 - 1) * spread;
          tmpDir.y += (Math.random() * 2 - 1) * spread;
          tmpDir.z += (Math.random() * 2 - 1) * spread;
          tmpDir.normalize();
          eyePos(bot, tmpEye);
          tmpEye.y -= 0.15;
          ctx.onBotShot(bot, tmpEye.clone(), tmpDir.clone());
        } else if (bot.burstLeft <= 0 && bot.pauseTimer <= 0) {
          bot.burstLeft = 3 + Math.floor(Math.random() * 3);
          bot.pauseTimer = 0.5 + Math.random() * 0.45;
        }
      }
    } else if (bot.state === 'defuse' && ctx.bombSite) {
      const site = ctx.bombSite;
      const dx = site.x - bot.body.position.x;
      const dz = site.z - bot.body.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 2.2) {
        bot.defuseT += dt;
        ctx.onDefuse(bot, bot.defuseT / 5);
        if (bot.defuseT >= 5) ctx.onDefused(bot);
      } else {
        if (!bot.path.length || bot.pathIndex >= bot.path.length) setPath(bot, nearestWaypoint(world.waypoints, site.x, site.z));
        const node = world.waypoints[bot.path[bot.pathIndex]];
        const nx = node.x - bot.body.position.x;
        const nz = node.z - bot.body.position.z;
        if (Math.hypot(nx, nz) < 0.7) bot.pathIndex += 1;
        else { const l = Math.hypot(nx, nz) || 1; wishX = nx / l; wishZ = nz / l; }
      }
    } else if (bot.state === 'investigate') {
      const target = bot.hearTarget ?? bot.lastSeen;
      if (!target || time - target.t > 6) {
        bot.state = bot.role === 'defend' ? 'hold' : 'push';
        bot.hearTarget = null;
      } else {
        const dx = target.x - bot.body.position.x;
        const dz = target.z - bot.body.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 1.2) { bot.hearTarget = null; bot.lastSeen = null; }
        else {
          if (!bot.path.length || bot.pathIndex >= bot.path.length) setPath(bot, nearestWaypoint(world.waypoints, target.x, target.z));
          const node = world.waypoints[bot.path[bot.pathIndex]];
          const nx = node.x - bot.body.position.x;
          const nz = node.z - bot.body.position.z;
          if (Math.hypot(nx, nz) < 0.7) bot.pathIndex += 1;
          else { const l = Math.hypot(nx, nz) || 1; wishX = nx / l; wishZ = nz / l; }
        }
      }
    } else if (bot.state === 'hold' && bot.role === 'defend') {
      bot.holdTimer -= dt;
      if (bot.holdTimer <= 0) {
        bot.holdTimer = 8 + Math.random() * 6;
        const anchor = world.waypoints[bot.anchorId];
        const nearby = anchor.links[Math.floor(Math.random() * anchor.links.length)];
        setPath(bot, nearby);
        bot.state = 'patrol';
      }
    } else if (bot.state === 'patrol') {
      if (!bot.path.length || bot.pathIndex >= bot.path.length) { bot.state = 'hold'; bot.holdTimer = 5 + Math.random() * 5; }
      else {
        const node = world.waypoints[bot.path[bot.pathIndex]];
        const nx = node.x - bot.body.position.x;
        const nz = node.z - bot.body.position.z;
        if (Math.hypot(nx, nz) < 0.7) bot.pathIndex += 1;
        else { const l = Math.hypot(nx, nz) || 1; wishX = nx / l; wishZ = nz / l; }
      }
    } else if (bot.role === 'push' && ctx.followTarget) {
      const dx = ctx.followTarget.x - bot.body.position.x;
      const dz = ctx.followTarget.z - bot.body.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 6) {
        if (!bot.path.length || bot.pathIndex >= bot.path.length) setPath(bot, nearestWaypoint(world.waypoints, ctx.followTarget.x, ctx.followTarget.z));
        const node = world.waypoints[bot.path[bot.pathIndex]];
        const nx = node.x - bot.body.position.x;
        const nz = node.z - bot.body.position.z;
        if (Math.hypot(nx, nz) < 0.7) bot.pathIndex += 1;
        else { const l = Math.hypot(nx, nz) || 1; wishX = nx / l; wishZ = nz / l; }
      } else if (dist > 3.5) {
        wishX = dx / dist;
        wishZ = dz / dist;
      }
    }
    if (bot.hp <= 30 && bot.state === 'engage' && Math.random() < dt * 0.25) {
      bot.state = 'retreat';
      setPath(bot, bot.team === 'ashen' ? 20 : 0);
      bot.retreatUntil = time + 4;
    }
    if (bot.state === 'retreat') {
      speed = RETREAT_SPEED;
      if (time > (bot.retreatUntil ?? 0)) bot.state = bot.role === 'defend' ? 'hold' : 'push';
      else if (bot.path.length && bot.pathIndex < bot.path.length) {
        const node = world.waypoints[bot.path[bot.pathIndex]];
        const nx = node.x - bot.body.position.x;
        const nz = node.z - bot.body.position.z;
        if (Math.hypot(nx, nz) < 0.7) bot.pathIndex += 1;
        else { const l = Math.hypot(nx, nz) || 1; wishX = nx / l; wishZ = nz / l; }
      }
    }

    moveBody(world.colliders, bot.body, dt, wishX, wishZ, speed, false);
    if (faceTarget) {
      bot.body.yaw = Math.atan2(-(faceTarget.pos.x - bot.body.position.x), -(faceTarget.pos.z - bot.body.position.z));
    } else if (wishX || wishZ) {
      const targetYaw = Math.atan2(-wishX, -wishZ);
      let diff = targetYaw - bot.body.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      bot.body.yaw += diff * Math.min(1, dt * 8);
    }
    bot.group.position.set(bot.body.position.x, bot.body.position.y, bot.body.position.z);
    bot.group.rotation.y = bot.body.yaw;
  }

  function damage(bot, amount, part, attackerPos, time) {
    if (!bot.alive) return false;
    bot.hp -= amount;
    bot.defuseT = 0;
    if (attackerPos && bot.state !== 'engage') bot.hearTarget = { x: attackerPos.x, z: attackerPos.z, t: time ?? 0 };
    if (bot.hp <= 0) {
      bot.hp = 0;
      bot.alive = false;
      bot.fallT = 0;
      return true;
    }
    return false;
  }

  function flash(bot, until) { bot.blindUntil = Math.max(bot.blindUntil, until); }

  function reset(bot, spawn, anchorId) {
    bot.hp = 100;
    bot.alive = true;
    bot.state = 'hold';
    bot.path = [];
    bot.pathIndex = 0;
    bot.lastSeen = null;
    bot.hearTarget = null;
    bot.burstLeft = 0;
    bot.defuseT = 0;
    bot.blindUntil = -1;
    bot.fallT = 0;
    bot.holdTimer = 4 + Math.random() * 6;
    bot.body.position.set(spawn[0], 0, spawn[1]);
    bot.body.velocity.set(0, 0, 0);
    bot.body.yaw = bot.team === 'ashen' ? 0 : Math.PI;
    bot.anchorId = anchorId;
    bot.group.rotation.set(0, bot.body.yaw, 0);
    bot.group.position.set(spawn[0], 0, spawn[1]);
  }

  return {
    bots,
    createBot,
    step(dt, time, ctx) { for (const bot of bots) stepBot(bot, dt, time, ctx); },
    damage,
    flash,
    reset,
    damageNumbers: { body: BOT_RIFLE_BODY, head: BOT_RIFLE_HEAD },
    aliveOf(team) { return bots.filter((b) => b.team === team && b.alive).length; },
  };
}
