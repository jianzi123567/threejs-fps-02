// Weapons: the numbers and the view model. Four guns and one grenade, each with its
// own price, damage, fire rate, magazine, spread and recoil, so the buy menu is a
// real choice. The view model is boxes on the camera, a different silhouette per gun.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9 SIDEARM', price: 0, damage: 34, headMult: 4, mag: 12, reserve: 48,
    fireGap: 0.16, reloadTime: 1.3, spreadStill: 0.003, spreadMove: 0.02, recoil: 0.006, auto: false, range: 60,
  },
  rifle: {
    id: 'rifle', name: 'KESTREL RIFLE', price: 2700, damage: 34, headMult: 4, mag: 30, reserve: 90,
    fireGap: 0.096, reloadTime: 1.9, spreadStill: 0.0022, spreadMove: 0.028, recoil: 0.009, auto: true, range: 80,
  },
  smg: {
    id: 'smg', name: 'JACKAL SMG', price: 1500, damage: 26, headMult: 4, mag: 32, reserve: 96,
    fireGap: 0.07, reloadTime: 1.6, spreadStill: 0.005, spreadMove: 0.034, recoil: 0.005, auto: true, range: 55,
  },
  dmr: {
    id: 'dmr', name: 'LONGBOW DMR', price: 4750, damage: 80, headMult: 2.5, mag: 10, reserve: 30,
    fireGap: 0.55, reloadTime: 2.4, spreadStill: 0.0009, spreadMove: 0.05, recoil: 0.028, auto: false, range: 100,
  },
};
export const GRENADE_PRICE = 300;
export const ARMOR_PRICE = 650;

function buildViewModel(def) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.25 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.45, metalness: 0.35 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.2 });
  const model = new THREE.Group();
  const long = def.id === 'dmr' ? 0.62 : def.id === 'rifle' ? 0.42 : def.id === 'smg' ? 0.3 : 0.16;
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.3 + long * 0.4), body);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, long), grip);
  barrel.position.set(0, 0.03, -0.24 - long / 2);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.2), grip);
  stock.position.set(0, -0.02, 0.26);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, 0.12), accent);
  sight.position.set(0, 0.08, -0.05);
  model.add(receiver, barrel, stock, sight);
  if (def.id === 'smg') {
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.08), grip);
    mag.position.set(0, -0.13, -0.08);
    mag.rotation.x = 0.25;
    model.add(mag);
  }
  if (def.id === 'dmr') {
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 12), grip);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.1, 0.02);
    model.add(scope);
  }
  model.position.set(0.27, -0.23, -0.52);
  model.scale.setScalar(0.8);
  return model;
}

export function createWeapon(camera) {
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.18, 0.18),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.27, -0.21, -1.05);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.27, -0.2, -0.7);
  camera.add(flashLight);

  let def = WEAPONS.rifle;
  let model = buildViewModel(def);
  camera.add(model);

  const state = { mag: def.mag, reserve: def.reserve, cooldown: 0, reloadLeft: 0, flash: 0, kick: 0 };

  function equip(id) {
    def = WEAPONS[id];
    camera.remove(model);
    model = buildViewModel(def);
    camera.add(model);
    state.mag = def.mag;
    state.reserve = def.reserve;
    state.cooldown = 0;
    state.reloadLeft = 0;
    state.flash = 0;
    state.kick = 0;
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    model.position.z = -0.52 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (def.reloadTime - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = def.mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  return {
    state,
    step,
    equip,
    def() { return def; },
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = def.fireGap;
      state.flash = 0.06;
      state.kick = 0.02 + def.recoil * 4;
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      if (state.reloadLeft > 0 || state.mag === def.mag || state.reserve === 0) return;
      state.reloadLeft = def.reloadTime;
    },
    spread(speed) {
      return def.spreadStill + Math.min(1, speed / 5.4) * def.spreadMove;
    },
    refill() {
      state.mag = def.mag;
      state.reserve = def.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
    },
  };
}

// A thrown grenade: an arc under gravity, a 2.6 s fuse, then a blast that hurts
// through a radius with falloff. The game owns the blast; this owns the flight.
export function createGrenades(scene) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 12, 8),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ember), roughness: 0.4, metalness: 0.5 }),
  );
  mesh.visible = false;
  scene.add(mesh);
  const active = { flying: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), fuse: 0 };

  function throwFrom(origin, direction) {
    active.flying = true;
    active.pos.copy(origin);
    active.vel.copy(direction).multiplyScalar(16);
    active.vel.y += 4.5;
    active.fuse = 2.6;
    mesh.visible = true;
    mesh.position.copy(origin);
  }

  // Returns the blast position when the fuse runs out, else null.
  function step(dt, colliders) {
    if (!active.flying) return null;
    active.fuse -= dt;
    active.vel.y -= 14 * dt;
    active.pos.addScaledVector(active.vel, dt);
    const probe = new THREE.Box3().setFromCenterAndSize(active.pos, new THREE.Vector3(0.2, 0.2, 0.2));
    for (const c of colliders) {
      if (probe.intersectsBox(c)) {
        active.vel.multiplyScalar(-0.35);
        active.pos.y = Math.max(active.pos.y, c.max.y + 0.11);
        break;
      }
    }
    if (active.pos.y < 0.09) {
      active.pos.y = 0.09;
      active.vel.y = Math.abs(active.vel.y) * 0.35;
      active.vel.x *= 0.7;
      active.vel.z *= 0.7;
    }
    mesh.position.copy(active.pos);
    if (active.fuse <= 0) {
      active.flying = false;
      mesh.visible = false;
      return active.pos.clone();
    }
    return null;
  }

  return { throwFrom, step, mesh };
}
