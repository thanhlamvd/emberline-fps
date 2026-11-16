// The map: FOUNDRY YARD, a 36 x 28 m dusk industrial yard built from boxes.
// Two bomb sites (A Furnace west, B Crane east), three lanes (A-long west, mid
// through the furnace gaps, B-short east) and cover at crouch height, head height
// and full height, so every sightline has a corner to play around. Every solid
// box is a collider for walkers and a surface a bullet stops on; the site pads,
// light beams and pipes are visual only. Plain geometry, no models, no textures.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// Waypoints the bots route on: id -> [x, z]. Edges are listed as pairs below.
const WAYPOINTS = [
  [0, 12], [-8, 11], [8, 11], [-15, 5], [-15, 0], [-13, -2], [-13, -6], [-15, -10],
  [-8, 4], [0, 4], [8, 4], [-4, -2], [4, -2], [15, 5], [15, 0], [13, -2],
  [13, -6], [15, -10], [-8, -10], [8, -10], [0, -12], [0, -8], [0, -6], [-10, -4], [10, -4],
];
const EDGES = [
  [0, 1], [0, 2], [1, 3], [2, 13], [1, 8], [2, 10], [3, 4], [4, 5], [5, 6],
  [4, 23], [23, 6], [5, 11], [8, 9], [9, 10], [8, 11], [10, 12], [11, 12],
  [11, 22], [12, 22], [9, 22], [13, 14], [14, 15], [15, 16], [14, 24],
  [24, 16], [15, 12], [6, 7], [7, 18], [16, 17], [17, 19], [18, 20],
  [19, 20], [18, 21], [19, 21], [21, 22], [20, 21], [6, 23], [16, 24],
];

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' || name === 'glow' ? 0.55 : 0.92,
      metalness: name === 'ember' || name === 'ash' ? 0.25 : 0.03,
      emissive: new THREE.Color(PALETTE[name]),
      emissiveIntensity: name === 'glow' || name === 'ember' ? 0.55 : 0,
    });
  }
  const siteA = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.ember), transparent: true, opacity: 0.28 });
  const siteB = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.ash), transparent: true, opacity: 0.28 });
  const beam = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.glow), transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide });

  const colliders = [];
  const shootables = [];

  function box(w, h, d, x, y, z, material, solid = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (solid) {
      colliders.push(new THREE.Box3().setFromObject(mesh));
      shootables.push(mesh);
    }
    return mesh;
  }
  function visual(geometry, material, x, y, z) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  }

  // Floor and outer walls, 36 x 28 m, 4.6 m high.
  box(36.4, 0.4, 28.4, 0, -0.2, 0, 'canvas');
  box(0.4, 4.6, 28.4, -18.2, 2.3, 0, 'surface');
  box(0.4, 4.6, 28.4, 18.2, 2.3, 0, 'surface');
  box(36.4, 4.6, 0.4, 0, 2.3, -14.2, 'surface');
  box(36.4, 4.6, 0.4, 0, 2.3, 14.2, 'surface');

  // The furnace: the map's centre block, two gaps either side of it are the mid lane.
  box(6, 3.6, 4, 0, 1.8, -2, 'hairline');
  visual(new THREE.BoxGeometry(5.2, 1.1, 0.15), materials.glow, 0, 1.5, 0.08);
  visual(new THREE.BoxGeometry(0.5, 3.2, 0.5), materials.ember, -3.4, 1.6, -2);
  visual(new THREE.BoxGeometry(0.5, 3.2, 0.5), materials.ember, 3.4, 1.6, -2);

  // Site A (Furnace, west) and site B (Crane, east): cover, a pillar, a low wall.
  box(2.4, 1.1, 1.2, -13.5, 0.55, -3.5, 'hairline');
  box(1.2, 1.1, 2.4, -10.8, 0.55, -8.5, 'hairline');
  box(1.2, 3.2, 1.2, -15.5, 1.6, -6, 'surface');
  box(4, 1.2, 0.6, -13, 0.6, -10, 'hairline');
  box(1.4, 1.1, 1.4, -15, 0.55, -9, 'hairline');
  box(3, 2.6, 1.4, 13, 1.3, -8.5, 'ash');
  box(1.6, 1.1, 1.6, 15.5, 0.55, -4, 'hairline');
  box(1.2, 3.2, 1.2, 11, 1.6, -6, 'surface');
  box(4, 1.2, 0.6, 13, 0.6, -10, 'hairline');
  box(0.8, 4.4, 0.8, 10.8, 2.2, -9.5, 'surface');
  box(0.8, 4.4, 0.8, 15.2, 2.2, -9.5, 'surface');
  visual(new THREE.BoxGeometry(5.2, 0.5, 0.9), materials.hairline, 13, 4.5, -9.5);

  // Mid cover: crates to crouch behind, pillars to peek around, one low wall.
  box(2, 1.1, 1.2, -4, 0.55, 2, 'hairline');
  box(2, 1.1, 1.2, 4, 0.55, 2, 'hairline');
  box(1, 3.2, 1, -7, 1.6, 0, 'surface');
  box(1, 3.2, 1, 7, 1.6, 0, 'surface');
  box(5, 1.2, 0.6, 0, 0.6, 6, 'hairline');
  box(1.6, 1.1, 1.6, -2, 0.55, -6, 'hairline');
  box(1.6, 1.1, 1.6, 2, 0.55, -6, 'hairline');

  // Lane walls: the four blocks that split A-long, mid and B-short into lanes.
  box(0.6, 3.2, 4, -8, 1.6, -8, 'surface');
  box(0.6, 3.2, 4, 8, 1.6, -8, 'surface');
  box(0.6, 3.2, 4, -8, 1.6, 6, 'surface');
  box(0.6, 3.2, 4, 8, 1.6, 6, 'surface');

  // Spawn cover, north and south.
  box(2, 1.1, 1.2, -4, 0.55, 11, 'hairline');
  box(2, 1.1, 1.2, 4, 0.55, 11, 'hairline');
  box(2, 1.1, 1.2, -4, 0.55, -11, 'hairline');
  box(2, 1.1, 1.2, 4, 0.55, -11, 'hairline');

  // Pipes along the walls and hazard strips at the site entries (visual only).
  visual(new THREE.BoxGeometry(36, 0.3, 0.3), materials.hairline, 0, 3.6, -13.8);
  visual(new THREE.BoxGeometry(0.3, 0.3, 28), materials.hairline, -17.8, 3.6, 0);
  visual(new THREE.BoxGeometry(2.4, 0.03, 0.5), materials.accent, -13, 0.02, -1.5);
  visual(new THREE.BoxGeometry(2.4, 0.03, 0.5), materials.accent, 13, 0.02, -1.5);

  // Site pads and light beams: the objective reads at a glance from anywhere.
  visual(new THREE.PlaneGeometry(6.4, 6.4), siteA, -13, 0.02, -6).rotation.x = -Math.PI / 2;
  visual(new THREE.PlaneGeometry(6.4, 6.4), siteB, 13, 0.02, -6).rotation.x = -Math.PI / 2;
  visual(new THREE.CylinderGeometry(2.6, 2.6, 9, 20, 1, true), beam, -13, 4.5, -6);
  visual(new THREE.CylinderGeometry(2.6, 2.6, 9, 20, 1, true), beam, 13, 4.5, -6);

  // Light: dusk sky gradient, a warm key from the north-east, a cool fill, and the
  // furnace's own orange point light so mid reads warm against the cold sites.
  scene.add(new THREE.HemisphereLight(new THREE.Color(PALETTE.surface), new THREE.Color(PALETTE.canvas), 1.05));
  const key = new THREE.DirectionalLight(new THREE.Color(PALETTE.glow), 2.0);
  key.position.set(10, 15, 9);
  key.target.position.set(0, 0, -3);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -20;
  key.shadow.camera.right = 20;
  key.shadow.camera.top = 20;
  key.shadow.camera.bottom = -20;
  key.shadow.camera.far = 55;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.ash), 0.5);
  fill.position.set(-9, 10, 11);
  scene.add(fill);
  const furnaceLight = new THREE.PointLight(new THREE.Color(PALETTE.ember), 26, 16, 1.8);
  furnaceLight.position.set(0, 2.2, 0.4);
  scene.add(furnaceLight);

  const adjacency = WAYPOINTS.map(() => []);
  for (const [a, b] of EDGES) {
    adjacency[a].push(b);
    adjacency[b].push(a);
  }
  const waypoints = WAYPOINTS.map(([x, z], id) => ({ id, x, z, links: adjacency[id] }));

  return {
    colliders,
    shootables,
    group,
    waypoints,
    sites: {
      A: { name: 'Furnace', x: -13, z: -6, radius: 3.2 },
      B: { name: 'Crane', x: 13, z: -6, radius: 3.2 },
    },
    spawns: {
      ember: [[-2, 12], [0, 12.6], [2, 12]],
      ashen: [[-4, -12], [-1.5, -12.6], [1.5, -12.6], [4, -12]],
    },
  };
}
