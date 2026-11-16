// The map: EMBERWORKS, a foundry yard at dusk. Two bomb sites, three lanes, one
// molten channel the eye follows. Every box is a collider for players and bots and
// a surface a bullet stops on. Waypoints are the graph the bots walk and hold on.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { makeTextures } from './textures.js';

// Site A (Furnace) is the west yard, site B (Crane) the east yard. Vanguard spawns
// south, Cinder north. The channel runs east-west across mid.
export const SITES = {
  A: { name: 'FURNACE', center: new THREE.Vector3(-13, 0, -11), radius: 4.5 },
  B: { name: 'CRANE', center: new THREE.Vector3(13, 0, -11), radius: 4.5 },
};
export const SPAWNS = {
  vanguard: [new THREE.Vector3(-2, 0, 15), new THREE.Vector3(2, 0, 15), new THREE.Vector3(0, 0, 17)],
  cinder: [new THREE.Vector3(-10, 0, -15), new THREE.Vector3(14, 0, -15), new THREE.Vector3(0, 0, -16), new THREE.Vector3(-6, 0, -15)],
};

// Waypoint graph: id -> { p: Vector3, next: [ids] }. Bots walk edges, hold at nodes.
export const WAYPOINTS = [
  { p: [0, 0, 15], next: [1, 2, 3] },
  { p: [-9, 0, 10], next: [0, 4, 5] },
  { p: [0, 0, 8], next: [0, 5, 6] },
  { p: [9, 0, 10], next: [0, 6, 7] },
  { p: [-13, 0, 2], next: [1, 8, 9] },
  { p: [-4, 0, 2], next: [1, 2, 4, 9] },
  { p: [4, 0, 2], next: [2, 3, 7, 10] },
  { p: [13, 0, 2], next: [3, 6, 10] },
  { p: [-13, 0, -7], next: [4, 9, 11] },
  { p: [-5, 0, -7], next: [5, 8, 11, 12] },
  { p: [5, 0, -7], next: [6, 7, 12, 13] },
  { p: [-13, 0, -11], next: [8, 9] },
  { p: [0, 0, -11], next: [9, 10, 13] },
  { p: [13, 0, -11], next: [10, 12] },
  { p: [0, 0, -15], next: [12] },
  { p: [-9, 0, 6], next: [1, 4] },
  { p: [9, 0, 6], next: [3, 7] },
];

export function createWorld(scene) {
  const textures = makeTextures();
  const group = new THREE.Group();
  scene.add(group);

  const concrete = new THREE.MeshStandardMaterial({ map: textures.concrete, roughness: 0.94, metalness: 0.02 });
  const metal = new THREE.MeshStandardMaterial({ map: textures.metal, roughness: 0.55, metalness: 0.55 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.4 });
  const wall = new THREE.MeshStandardMaterial({ map: textures.panel, roughness: 0.85, metalness: 0.08 });
  const hazardMat = new THREE.MeshStandardMaterial({ map: textures.hazard, roughness: 0.8 });
  const moltenMat = new THREE.MeshStandardMaterial({
    map: textures.molten, emissive: new THREE.Color(0xff5a1f), emissiveIntensity: 1.6, roughness: 0.4,
  });
  const amber = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.2 });

  const colliders = [];
  const shootables = [];

  function box(w, h, d, x, y, z, material, collide = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Ground: 44 x 36 m yard, walls 5 m high. Open sky so one key light reaches all.
  const floor = new THREE.Mesh(new THREE.BoxGeometry(44.4, 0.4, 36.4), concrete);
  floor.position.set(0, -0.2, 0);
  floor.receiveShadow = true;
  group.add(floor);
  colliders.push(new THREE.Box3().setFromObject(floor));
  shootables.push(floor);

  box(0.6, 5, 36.4, -22.2, 2.5, 0, wall);
  box(0.6, 5, 36.4, 22.2, 2.5, 0, wall);
  box(44.4, 5, 0.6, 0, 2.5, -18.2, wall);
  box(44.4, 5, 0.6, 0, 2.5, 18.2, wall);

  // Molten channel: a glowing strip across mid (z = -2), crossed by two bridges.
  const channel = new THREE.Mesh(new THREE.BoxGeometry(40, 0.12, 1.6), moltenMat);
  channel.position.set(0, 0.06, -2);
  group.add(channel);
  box(3, 0.3, 2.4, -9, 0.15, -2, darkMetal);
  box(3, 0.3, 2.4, 9, 0.15, -2, darkMetal);

  // Site A — Furnace: big furnace block with hazard base, flanking crates.
  box(6, 4.2, 2.4, -16.5, 2.1, -14.5, metal);
  box(6.4, 0.5, 2.8, -16.5, 0.25, -14.5, hazardMat);
  box(2.2, 1.2, 2.2, -10.5, 0.6, -12.5, darkMetal);
  box(2.2, 1.2, 2.2, -10.5, 0.6, -9.5, metal);
  box(1.4, 2.6, 1.4, -18.5, 1.3, -8, metal);
  // Furnace mouth glow
  const mouth = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.6), moltenMat);
  mouth.position.set(-16.5, 1.1, -13.28);
  group.add(mouth);

  // Site B — Crane: gantry legs, stacked containers, a platform to hold from.
  box(1, 4.6, 1, 10.5, 2.3, -14.5, metal);
  box(1, 4.6, 1, 15.5, 2.3, -14.5, metal);
  box(6.4, 0.9, 1.2, 13, 4.4, -14.5, amber);
  box(3.2, 2.6, 2.4, 16.5, 1.3, -11, metal);
  box(3.2, 2.6, 2.4, 16.5, 1.3, -8.2, darkMetal);
  box(2.4, 1.2, 2.4, 10, 0.6, -9, darkMetal);
  box(5, 0.5, 3, 13, 0.25, -14.8, hazardMat, false);

  // Mid: the long wall with two gaps, pillars, crate lanes.
  box(6, 3.4, 1, -6, 1.7, 4, wall);
  box(6, 3.4, 1, 6, 1.7, 4, wall);
  box(1.4, 3.4, 1.4, 0, 1.7, 4, metal);
  box(1.2, 1.1, 1.2, -3.5, 0.55, -6.5, darkMetal);
  box(1.2, 1.1, 1.2, 3.5, 0.55, -6.5, darkMetal);
  box(2.6, 1.1, 1.2, -8, 0.55, 8, metal);
  box(2.6, 1.1, 1.2, 8, 0.55, 8, metal);
  box(1.2, 2.2, 1.2, -16, 1.1, 6, darkMetal);
  box(1.2, 2.2, 1.2, 16, 1.1, 6, darkMetal);
  box(4.5, 0.9, 1.4, 0, 0.45, 12.5, metal);
  box(1.2, 1.1, 3.4, -19.5, 0.55, -2, metal);
  box(1.2, 1.1, 3.4, 19.5, 0.55, -2, metal);

  // Cooling towers outside the walls, silhouettes against the dusk sky.
  const towerMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#23272d'), roughness: 0.9 });
  for (const [x, z, h] of [[-30, -26, 16], [28, -28, 19], [-34, 8, 13]]) {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 6.5, h, 20, 1, true), towerMat);
    tower.position.set(x, h / 2, z);
    group.add(tower);
  }

  // Light: low dusk sun from the west, cool sky fill, furnace point light that flickers.
  const sky = new THREE.HemisphereLight(new THREE.Color('#5a6b7d'), new THREE.Color(PALETTE.canvas), 1.25);
  scene.add(sky);
  const key = new THREE.DirectionalLight(new THREE.Color('#ffb36b'), 2.8);
  key.position.set(-18, 16, 10);
  key.target.position.set(4, 0, -4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -26;
  key.shadow.camera.right = 26;
  key.shadow.camera.top = 24;
  key.shadow.camera.bottom = -24;
  key.shadow.camera.far = 60;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#7d90a8'), 0.5);
  fill.position.set(14, 10, 14);
  scene.add(fill);
  const furnaceLight = new THREE.PointLight(new THREE.Color(0xff5a1f), 30, 22, 1.8);
  furnaceLight.position.set(-16.5, 2.2, -12.5);
  scene.add(furnaceLight);

  const waypoints = WAYPOINTS.map((w) => ({ p: new THREE.Vector3(...w.p), next: w.next }));

  return {
    colliders,
    shootables,
    group,
    waypoints,
    furnaceLight,
    siteMarkers: [SITES.A, SITES.B],
  };
}
