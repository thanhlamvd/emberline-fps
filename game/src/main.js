// EMBERLINE: boot and the one loop. A fixed 60 Hz simulation feeds a render at
// the display's rate. main.js wires the modules together and owns the two things
// that must agree everywhere: shooting (one raycast resolves player and bot
// fire alike) and the round's end (deaths and the clock report to game.js).
// ?shot=menu|combat|buy|plant with &seed=N sets up a deterministic frame for a
// capture, renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapons, WEAPONS } from './weapons.js';
import { createBots, nearestWaypoint } from './bots.js';
import { createGame, PLANT_CHANNEL } from './game.js';
import { createHud } from './hud.js';
import { createEffects } from './effects.js';
import { ensureAudio, sfx } from './audio.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = shot ? mulberry32(seed) : Math.random;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 20, 62);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = createWorld(scene);
const effects = createEffects(scene);
const weapons = createWeapons(camera);
const hud = createHud();
const player = createPlayer(world.colliders);
const input = createInput(renderer.domElement, onLockChange);
const botSys = createBots(scene, world);
const raycaster = new THREE.Raycaster();
raycaster.far = 140;
const direction = new THREE.Vector3();
const muzzle = new THREE.Vector3();
const tmpVec = new THREE.Vector3();

// The player's body as raycast targets, so bots shoot the player by the same
// rule the player shoots bots: the closest mesh wins, head or torso.
const playerTorso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.78, 0.3), new THREE.MeshBasicMaterial({ visible: false }));
const playerHead = new THREE.Mesh(new THREE.SphereGeometry(0.155, 10, 8), new THREE.MeshBasicMaterial({ visible: false }));
playerTorso.userData = { player: true, part: 'torso' };
playerHead.userData = { player: true, part: 'head' };
scene.add(playerTorso, playerHead);

const bots = botSys.bots;
const ashenSpawns = world.spawns.ashen;
const ashenAnchors = [6, 23, 16, 24];
for (let i = 0; i < 4; i += 1) botSys.createBot('ashen', 'defend', i, ashenSpawns[i], ashenAnchors[i]);
const emberSpawns = world.spawns.ember;
botSys.createBot('ember', 'push', 0, emberSpawns[1], 0);
botSys.createBot('ember', 'push', 1, emberSpawns[2], 0);
const botHitMeshes = [];
for (const bot of bots) botHitMeshes.push(bot.torso, bot.head);
const shootables = world.shootables.concat(botHitMeshes);
const botShotTargets = world.shootables.concat(botHitMeshes, [playerTorso, playerHead]);

let hp = 100;
let playerAlive = true;
let spectateBot = null;
let scoped = false;
let elapsed = 0;
let frozen = false;
let accumulator = 0;
let lastTime = performance.now();
let stepTimer = 0;
let noises = [];
let defuser = null;
let planting = false;

const game = createGame({
  onPhase(phase, round) {
    if (phase === 'buy') {
      resetRound();
      hud.showBuy(game.state.money, weapons.owned);
      hud.setTimer(game.state.timer, 'BUY PHASE');
      hud.banner(`ROUND ${round}`, 'Buy what you need — then deploy.', 2200);
    } else if (phase === 'live') {
      hud.hideBuy();
      if (!shot && !input.state.locked) hud.showOverlay('paused');
      else hud.hideOverlay();
      hud.banner(`ROUND ${round}`, 'Go — plant the charge or clear the yard.', 1800);
    }
  },
  onRoundEnd(winner, reason, score) {
    hud.banner(winner === 'ember' ? 'EMBER TAKES THE ROUND' : 'ASHEN TAKES THE ROUND', reason, 3400);
    if (winner === 'ember') sfx.win(); else sfx.lose();
    hud.setScore(score.ember, score.ashen, game.state.round);
    if (document.pointerLockElement) document.exitPointerLock();
  },
  onMatchEnd(winner, score) {
    hud.showOverlay('matchEnd', { winner, score });
    hud.setScore(score.ember, score.ashen, game.state.round);
  },
  onMoney(money) {
    hud.setMoney(money);
    // The buy panel only belongs to the buy phase: a mid-round kill bonus
    // (+$300) must not pop it open over the firefight.
    if (game.state.phase === 'buy') hud.showBuy(money, weapons.owned);
  },
  onBomb(kind, site) {
    if (kind === 'planted') {
      hud.feed(`Charge planted at ${site === 'A' ? 'Furnace' : 'Crane'} — 35 seconds to detonation`);
      hud.banner('CHARGE PLANTED', 'Hold the site. The clock is yours now.', 2600);
      sfx.plant();
      defuser = nearestAliveAshenTo(site);
    } else if (kind === 'detonated') {
      const s = world.sites[site];
      effects.explode(new THREE.Vector3(s.x, 1, s.z));
      sfx.explode();
      noises.push({ x: s.x, z: s.z, radius: 40, t: elapsed });
    } else if (kind === 'defused') {
      hud.feed('Charge defused by ASHEN');
    }
  },
});

function nearestAliveAshenTo(siteKey) {
  const site = world.sites[siteKey];
  let best = null;
  let bestD = Infinity;
  for (const bot of bots) {
    if (bot.team !== 'ashen' || !bot.alive) continue;
    const d = (bot.body.position.x - site.x) ** 2 + (bot.body.position.z - site.z) ** 2;
    if (d < bestD) { bestD = d; best = bot; }
  }
  return best;
}

function resetRound() {
  hp = 100;
  playerAlive = true;
  spectateBot = null;
  scoped = false;
  planting = false;
  defuser = null;
  noises = [];
  const body = player.state;
  body.position.set(emberSpawns[0][0], 0, emberSpawns[0][1]);
  body.velocity.set(0, 0, 0);
  // Face north, into the yard: spawning staring at the own back wall
  // (yaw PI) left the player looking at black on Deploy.
  body.yaw = 0;
  body.pitch = 0;
  body.crouching = false;
  body.height = 1.72;
  body.eye = 1.6;
  for (let i = 0; i < 4; i += 1) botSys.reset(bots[i], ashenSpawns[i], ashenAnchors[i]);
  botSys.reset(bots[4], emberSpawns[1], 0);
  botSys.reset(bots[5], emberSpawns[2], 0);
  weapons.refill();
  weapons.state.grenades = 0;
  hud.setHealth(hp, game.state.armor);
  hud.setAlive(3, 4);
  hud.setBomb(null, 0);
  hud.hidePlant();
  hud.setScope(false);
  syncCamera();
}

function onLockChange(locked) {
  if (shot) return;
  ensureAudio();
  if (locked) hud.hideOverlay();
  else if (game.state.phase === 'live' && playerAlive) hud.showOverlay('paused');
  else if (game.state.phase === 'menu') hud.showOverlay('menu');
}

function syncCamera() {
  const body = spectateBot ? spectateBot.body : player.state;
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
  const shake = effects.shake();
  if (shake > 0) {
    camera.rotation.x += (random() - 0.5) * shake * 0.06;
    camera.rotation.y += (random() - 0.5) * shake * 0.06;
  }
  camera.fov += ((scoped ? 26 : 74) - camera.fov) * 0.35;
  camera.updateProjectionMatrix();
}

function aimAt(point) {
  const body = player.state;
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function playerTarget() {
  return { pos: player.state.position, speed: player.groundSpeed(), alive: playerAlive, name: 'You', isPlayer: true };
}

function enemiesFor(bot) {
  if (bot.team === 'ashen') {
    const list = [playerTarget()];
    for (const mate of bots) {
      if (mate.team === 'ember' && mate.alive) {
        list.push({ pos: mate.body.position, speed: Math.hypot(mate.body.velocity.x, mate.body.velocity.z), alive: true, name: mate.name, bot: mate });
      }
    }
    return list;
  }
  const list = [];
  for (const foe of bots) {
    if (foe.team === 'ashen' && foe.alive) {
      list.push({ pos: foe.body.position, speed: Math.hypot(foe.body.velocity.x, foe.body.velocity.z), alive: true, name: foe.name, bot: foe });
    }
  }
  return list;
}

function resolveShot(origin, dir, fromBot) {
  scene.updateMatrixWorld(true);
  raycaster.set(origin, dir);
  const hit = raycaster.intersectObjects(botShotTargets, false)[0];
  const end = hit ? hit.point.clone() : origin.clone().addScaledVector(dir, 70);
  effects.fireTracer(origin, end, fromBot ? PALETTE.ash : PALETTE.accent);
  if (!hit) return null;
  if (hit.object.userData.player) {
    const amount = hit.object.userData.part === 'head' ? 64 : 16;
    damagePlayer(amount, fromBot ? fromBot.body.position : null);
    return { kind: 'player', part: hit.object.userData.part };
  }
  if (hit.object.userData.bot) {
    const target = hit.object.userData.bot;
    const amount = hit.object.userData.part === 'head' ? botSys.damageNumbers.head : botSys.damageNumbers.body;
    const died = botSys.damage(target, amount, hit.object.userData.part, fromBot ? fromBot.body.position : player.state.position, elapsed);
    effects.sparksAt(hit.point, 4);
    if (died) {
      const killer = fromBot ? fromBot.name : 'You';
      hud.feed(`${killer} ▸ ${target.name}${hit.object.userData.part === 'head' ? ' ◉ headshot' : ''}`);
      if (!fromBot) { game.addKill(); sfx.kill(); }
      checkAlive();
    }
    return { kind: 'bot', bot: target, part: hit.object.userData.part, died };
  }
  effects.sparksAt(hit.point, 5);
  return { kind: 'world' };
}

function shoot(spread) {
  if (!weapons.takeRound()) { sfx.dry(); return false; }
  camera.getWorldDirection(direction);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  muzzle.copy(camera.position).addScaledVector(direction, 0.8);
  const def = weapons.def();
  const result = resolveShot(muzzle, direction, null);
  if (result && result.kind === 'bot') {
    hud.hitMarker(result.died, shot ? 4000 : 90);
    sfx.hit();
    if (result.died) hud.setAlive(aliveCount('ember'), aliveCount('ashen'));
  }
  weapons.pullTrigger();
  player.recoil(def.kick + random() * 0.004, (random() * 2 - 1) * 0.004);
  sfx.shot(weapons.state.current);
  noises.push({ x: player.state.position.x, z: player.state.position.z, radius: 28, t: elapsed });
  hud.setAmmo(weapons.ammo[weapons.state.current].mag, weapons.ammo[weapons.state.current].reserve, def.name);
  return true;
}

function damagePlayer(amount, fromPos) {
  if (!playerAlive) return;
  let rest = amount;
  if (game.state.armor > 0) {
    const absorbed = Math.min(game.state.armor, amount * 0.5);
    game.state.armor -= absorbed;
    rest = amount - absorbed;
  }
  hp -= rest;
  sfx.hurt();
  let angle = null;
  if (fromPos) {
    const dx = fromPos.x - player.state.position.x;
    const dz = fromPos.z - player.state.position.z;
    const bearing = Math.atan2(dx, dz);
    angle = ((bearing - player.state.yaw) * 180) / Math.PI;
  }
  hud.damage(angle);
  hud.setHealth(hp, game.state.armor);
  if (hp <= 0) {
    hp = 0;
    playerAlive = false;
    game.state.deaths += 1;
    spectateBot = bots.find((b) => b.team === 'ember' && b.alive) ?? null;
    hud.showOverlay('dead');
    if (document.pointerLockElement) document.exitPointerLock();
    hud.setAlive(aliveCount('ember'), aliveCount('ashen'));
    checkAlive();
  }
}

function aliveCount(team) {
  if (team === 'ember') return (playerAlive ? 1 : 0) + botSys.aliveOf('ember');
  return botSys.aliveOf('ashen');
}

function checkAlive() {
  hud.setAlive(aliveCount('ember'), aliveCount('ashen'));
  game.checkElimination(aliveCount('ember'), aliveCount('ashen'));
  if (defuser && !defuser.alive) defuser = game.state.bomb.state === 'planted' ? nearestAliveAshenTo(game.state.bomb.site) : null;
}

function throwGrenade() {
  if (weapons.state.grenades <= 0) return;
  camera.getWorldDirection(direction);
  muzzle.copy(camera.position);
  if (weapons.throwGrenade(muzzle, direction)) sfx.reload();
}

function stepGrenade(dt) {
  const g = weapons.grenade;
  if (!g.active) return;
  g.fuse -= dt;
  g.vel.y -= 12 * dt;
  const next = tmpVec.copy(g.pos).addScaledVector(g.vel, dt);
  if (next.y < 0.09) { next.y = 0.09; g.vel.y = Math.abs(g.vel.y) * 0.4; g.vel.x *= 0.7; g.vel.z *= 0.7; if (Math.abs(g.vel.y) > 1) sfx.bounce(); }
  if (next.x < -17.6 || next.x > 17.6) { g.vel.x *= -0.4; next.x = Math.max(-17.6, Math.min(17.6, next.x)); }
  if (next.z < -13.6 || next.z > 13.6) { g.vel.z *= -0.4; next.z = Math.max(-13.6, Math.min(13.6, next.z)); }
  g.pos.copy(next);
  g.mesh.position.copy(g.pos);
  if (g.fuse <= 0) {
    g.active = false;
    g.mesh.visible = false;
    effects.explode(g.pos);
    sfx.explode();
    noises.push({ x: g.pos.x, z: g.pos.z, radius: 40, t: elapsed });
    const flashPoint = g.pos.clone();
    for (const bot of bots) {
      if (!bot.alive) continue;
      const d = bot.body.position.distanceTo(flashPoint);
      if (d < 18) {
        tmpVec.set(bot.body.position.x - flashPoint.x, 1.4 - flashPoint.y, bot.body.position.z - flashPoint.z);
        raycaster.set(flashPoint, tmpVec.clone().normalize());
        const hit = raycaster.intersectObjects(world.shootables, false)[0];
        if (!hit || hit.distance > d) botSys.flash(bot, elapsed + 2.5);
      }
      if (d < 3) {
        const died = botSys.damage(bot, 40, 'torso', player.state.position, elapsed);
        if (died) { hud.feed(`You ▸ ${bot.name} (flashbang)`); game.addKill(); checkAlive(); }
      }
    }
    const toBlast = tmpVec.copy(flashPoint).sub(camera.position);
    const dist = toBlast.length();
    camera.getWorldDirection(direction);
    if (dist < 25 && direction.dot(toBlast.normalize()) > 0.2) {
      hud.flashBang(Math.max(0.35, 1 - dist / 25));
    }
  }
}

function step(dt) {
  elapsed += dt;
  const phase = game.state.phase;
  if (phase === 'live' || phase === 'buy') game.tick(dt);
  else if (phase === 'roundEnd') game.tick(dt);
  if (phase !== 'live') {
    effects.step(dt);
    return;
  }
  // Player.
  const move = player.step(dt, input.state.keys, scoped ? 0.5 : 1);
  if (move.moving && player.state.onGround) {
    stepTimer -= dt;
    if (stepTimer <= 0) { stepTimer = move.quiet ? 0.55 : 0.38; if (!shot) sfx.step(); }
  }
  weapons.step(dt);
  stepGrenade(dt);
  // Bots.
  const ctx = {
    time: elapsed,
    noises,
    bombPlanted: game.state.bomb.state === 'planted',
    bombSite: game.state.bomb.state === 'planted' ? world.sites[game.state.bomb.site] : null,
    defuser,
    followTarget: playerAlive ? player.state.position : null,
    enemiesFor,
    onBotShot(bot, origin, dir) {
      const result = resolveShot(origin, dir, bot);
      if (result && result.kind === 'bot') {
        if (result.bot.team === 'ashen') hud.setAlive(aliveCount('ember'), aliveCount('ashen'));
      }
      sfx.shot('vk47');
    },
    onDefuse(bot, frac) { hud.setBomb(`DEFUSING — ${(5 * (1 - frac)).toFixed(1)}s`, frac); },
    onDefused() { game.defused(); },
  };
  botSys.step(dt, elapsed, ctx);
  noises = [];
  // Plant channel: hold E inside a site while carrying the charge.
  const bomb = game.state.bomb;
  if (bomb.state === 'carried' && playerAlive) {
    let siteKey = null;
    for (const key of ['A', 'B']) {
      const s = world.sites[key];
      const dx = player.state.position.x - s.x;
      const dz = player.state.position.z - s.z;
      if (dx * dx + dz * dz < s.radius * s.radius) siteKey = key;
    }
    if (siteKey && input.state.keys.has('KeyE')) {
      planting = true;
      const result = game.plantTick(dt, true, siteKey);
      hud.showPlant(bomb.plantT / PLANT_CHANNEL);
      if (result === 'planted') { hud.hidePlant(); planting = false; }
    } else if (planting) {
      planting = false;
      game.plantTick(dt, false, null);
      hud.hidePlant();
    }
  }
  // Player hit meshes follow the body, for bot rays.
  playerTorso.position.set(player.state.position.x, player.state.position.y + 1.0, player.state.position.z);
  playerHead.position.set(player.state.position.x, player.state.position.y + 1.53, player.state.position.z);
  playerTorso.rotation.y = player.state.yaw;
  effects.step(dt);
  // HUD numbers.
  const def = weapons.def();
  const ammo = weapons.ammo[weapons.state.current];
  hud.setAmmo(ammo.mag, ammo.reserve, def.name);
  hud.setHealth(hp, game.state.armor);
  hud.setTimer(game.state.timer, game.state.bomb.state === 'planted' ? 'DETONATION' : 'ROUND', game.state.timer < 15);
  hud.setScore(game.state.score.ember, game.state.score.ashen, game.state.round);
  if (game.state.bomb.state === 'planted') {
    hud.setBomb(`CHARGE PLANTED — ${world.sites[game.state.bomb.site].name}`, game.state.timer / 35);
  } else if (game.state.bomb.state === 'carried') {
    hud.setBomb('CHARGE CARRIED — plant at A Furnace or B Crane', 0);
  }
  hud.setCrosshair(6 + weapons.spread(player.groundSpeed()) * 900, scoped);
  hud.setScope(scoped);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    player.look(look.x, look.y);
    scoped = input.state.scoping && weapons.state.current === 'longbow' && weapons.state.reloadLeft === 0;
    const pressed = input.takePressed();
    if (game.state.phase === 'buy') {
      if (pressed.has('Digit1')) buyItem('vk47');
      if (pressed.has('Digit2')) buyItem('rook');
      if (pressed.has('Digit3')) buyItem('longbow');
      if (pressed.has('Digit4')) buyItem('grenade');
      if (pressed.has('Digit5')) buyItem('armor');
      if (pressed.has('Enter')) deploy();
    }
    if (game.state.phase === 'live' && playerAlive) {
      const def = weapons.def();
      if (def.auto) {
        if (input.state.firing && weapons.ready()) shoot(shot ? 0 : weapons.spread(player.groundSpeed()));
      } else if (input.state.firing && !frame._wasFiring && weapons.ready()) {
        shoot(shot ? 0 : weapons.spread(player.groundSpeed()));
      }
      frame._wasFiring = input.state.firing;
      if (pressed.has('KeyR')) { weapons.reload(); sfx.reload(); }
      if (pressed.has('Digit1')) weapons.switchTo('p9');
      if (pressed.has('Digit2')) weapons.switchTo('vk47');
      if (pressed.has('Digit3')) weapons.switchTo('rook');
      if (pressed.has('Digit4')) weapons.switchTo('longbow');
      if (pressed.has('KeyG')) throwGrenade();
    }
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function buyItem(id) {
  const result = game.buy(id);
  if (!result) return;
  if (result === 'grenade') { weapons.state.grenades = Math.min(2, weapons.state.grenades + 1); sfx.buy(); return; }
  if (result === 'armor') { sfx.buy(); return; }
  if (weapons.buy(result)) {
    weapons.switchTo(result);
    sfx.buy();
    const def = weapons.def();
    hud.setAmmo(weapons.ammo[result].mag, weapons.ammo[result].reserve, def.name);
  }
}

function deploy() {
  hud.hideBuy();
  hud.hideOverlay();
  input.requestLock();
  game.beginLive();
}

hud.buildBuy(buyItem);
document.getElementById('deploy').addEventListener('click', () => { if (game.state.phase === 'buy') deploy(); });
hud.setMoney(800);
hud.setScore(0, 0, 1);
hud.setAlive(3, 4);
hud.setHealth(100, 0);
hud.onPlay(() => {
  if (shot) return;
  ensureAudio();
  if (game.state.phase === 'menu') {
    game.startMatch();
    hud.hideOverlay();
    hud.showBuy(game.state.money, weapons.owned);
    return;
  }
  if (game.state.phase === 'matchEnd') {
    game.startMatch();
    hud.hideOverlay();
    hud.showBuy(game.state.money, weapons.owned);
    return;
  }
  input.requestLock();
});
weapons.showCurrent();

function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBuy();
  const body = player.state;
  if (name === 'menu') {
    body.position.set(0, 0, 12);
    body.yaw = Math.PI;
    body.pitch = -0.06;
    game.state.phase = 'menu';
    game.state.round = 1;
    settle(20);
    hud.showOverlay('menu');
    hud.setMoney(800);
  } else if (name === 'buy') {
    game.state.phase = 'buy';
    game.state.round = 2;
    game.state.money = 4750;
    game.state.score.ember = 1;
    game.state.score.ashen = 1;
    resetRound();
    weapons.buy('vk47');
    weapons.switchTo('vk47');
    body.position.set(0, 0, 12);
    body.yaw = 0;
    body.pitch = 0;
    settle(20);
    hud.setMoney(4750);
    hud.showBuy(4750, weapons.owned);
    hud.setScore(1, 1, 2);
  } else if (name === 'combat' || name === 'plant') {
    game.state.phase = 'live';
    game.state.round = name === 'combat' ? 3 : 4;
    game.state.score.ember = 2;
    game.state.score.ashen = name === 'combat' ? 1 : 2;
    game.state.timer = name === 'combat' ? 71 : 27;
    game.state.money = 3200;
    resetRound();
    weapons.buy('vk47');
    weapons.switchTo('vk47');
    if (name === 'combat') {
      body.position.set(-2, 0, 6);
      // Vex and Marrow push up the open ground south of the furnace, facing
      // the player — no crate between the camera and either of them.
      bots[0].body.position.set(-1.5, 0, 3);
      bots[0].body.yaw = Math.atan2(-(body.position.x - bots[0].body.position.x), -(body.position.z - bots[0].body.position.z));
      bots[1].body.position.set(3.5, 0, 3);
      bots[1].body.yaw = Math.atan2(-(body.position.x - bots[1].body.position.x), -(body.position.z - bots[1].body.position.z));
      bots[2].body.position.set(13, 0, -6);
      bots[3].body.position.set(-13, 0, -6);
      settle(20);
      // Headshot on Vex (100 dmg = a real kill), then a torso hit on Marrow.
      aimAt(new THREE.Vector3(bots[0].body.position.x, 1.5, bots[0].body.position.z));
      shoot(0);
      settle(6);
      aimAt(new THREE.Vector3(bots[1].body.position.x, 1.2, bots[1].body.position.z));
      shoot(0);
      settle(6);
      // Let the muzzle flash die (0.06 s), then pin Marrow to a fixed spot
      // with a dark backdrop for the frozen frame — bot AI (Math.random) would
      // otherwise drift him run to run, sometimes in front of the bright
      // furnace panel where the tracer vanishes. No step() runs after this,
      // so he stays exactly here.
      settle(4);
      bots[1].body.position.set(3.5, 0, 3);
      bots[1].group.position.set(3.5, 0, 3);
      bots[1].body.yaw = Math.atan2(-(body.position.x - 3.5), -(body.position.z - 3));
      bots[1].group.rotation.y = bots[1].body.yaw;
      aimAt(new THREE.Vector3(3.5, 1.5, 3));
      camera.getWorldDirection(direction);
      muzzle.copy(camera.position).addScaledVector(direction, 0.8);
      effects.fireTracer(muzzle, new THREE.Vector3(3.5, 1.45, 3));
      hud.setAmmo(weapons.ammo.vk47.mag, weapons.ammo.vk47.reserve, 'VK-47 Carbine');
      hud.setTimer(71, 'ROUND');
      hud.setScore(2, 1, 3);
      // The headshot kill already fed 'You ▸ Vex ◉ headshot' when it landed;
      // a second hardcoded line would duplicate it.
    } else {
      game.state.bomb.state = 'planted';
      game.state.bomb.site = 'A';
      body.position.set(-8, 0, 1);
      bots[0].body.position.set(-13, 0, -4.5);
      bots[0].body.yaw = Math.PI;
      bots[0].defuseT = 2.5;
      bots[1].body.position.set(-9, 0, -8);
      bots[2].body.position.set(4, 0, -6);
      bots[3].body.position.set(13, 0, -6);
      defuser = bots[0];
      settle(20);
      aimAt(new THREE.Vector3(-13, 1.3, -5));
      hud.setBomb('CHARGE PLANTED — Furnace', 27 / 35);
      hud.setTimer(27, 'DETONATION', false);
      hud.setScore(2, 2, 4);
      hud.feed('You planted the charge at Furnace');
      hud.feed('Vex is defusing the charge');
    }
    hud.setMoney(3200);
    hud.setHealth(100, 0);
    hud.setAlive(3, name === 'combat' ? 3 : 4);
  }
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
if (shot) {
  resetRound();
  runShot(shot);
} else {
  game.state.phase = 'menu';
  hud.showOverlay('menu');
  requestAnimationFrame(frame);
}
