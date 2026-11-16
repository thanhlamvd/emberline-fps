// Player movement: acceleration, friction, gravity, crouch and jump. The actual
// walking is moveBody from motion.js, the same resolver the bots use, so a wall
// never swallows anyone; this file owns only the player's shape (crouch, eye,
// walk speed, recoil) and the keys that drive it.
import * as THREE from 'three';
import { boxHits, makeBody, moveBody } from './motion.js';

const STAND_HEIGHT = 1.72;
const CROUCH_HEIGHT = 1.12;
const STAND_EYE = 1.6;
const CROUCH_EYE = 1.02;
const WALK_SPEED = 5.2;
const CROUCH_SPEED = 2.4;
const WALK_QUIET_SPEED = 2.8;

export function createPlayer(colliders) {
  const body = makeBody(0, 12);
  body.yaw = Math.PI; // face south, down the yard toward the sites

  function look(dx, dy, sensitivity = 0.0022) {
    body.yaw -= dx * sensitivity;
    body.pitch = Math.max(-1.45, Math.min(1.45, body.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    body.pitch = Math.min(1.45, body.pitch + pitchKick);
    body.yaw += yawKick;
  }

  function step(dt, keys, speedScale = 1) {
    const crouching = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    if (crouching && !body.crouching) {
      body.crouching = true;
      body.height = CROUCH_HEIGHT;
    } else if (!crouching && body.crouching && !boxHits(colliders, body.position.x, body.position.y, body.position.z, body.radius, STAND_HEIGHT, 0.02)) {
      body.crouching = false;
      body.height = STAND_HEIGHT;
    }
    const eyeTarget = body.crouching ? CROUCH_EYE : STAND_EYE;
    body.eye += (eyeTarget - body.eye) * Math.min(1, dt * 12);

    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    let wishX = 0;
    let wishZ = 0;
    if (forward || strafe) {
      const sin = Math.sin(body.yaw);
      const cos = Math.cos(body.yaw);
      const len = Math.hypot(-sin * forward + cos * strafe, -cos * forward - sin * strafe) || 1;
      wishX = (-sin * forward + cos * strafe) / len;
      wishZ = (-cos * forward - sin * strafe) / len;
    }
    const quiet = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const speed = (body.crouching ? CROUCH_SPEED : quiet ? WALK_QUIET_SPEED : WALK_SPEED) * speedScale;
    moveBody(colliders, body, dt, wishX, wishZ, speed, keys.has('Space'));
    return { moving: forward !== 0 || strafe !== 0, quiet };
  }

  return {
    state: body,
    step,
    look,
    recoil,
    groundSpeed() {
      return Math.hypot(body.velocity.x, body.velocity.z);
    },
  };
}
