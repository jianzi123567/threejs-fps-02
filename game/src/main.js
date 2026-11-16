// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the display's
// rate. ?shot=start|buy|play|end with &seed=N sets up a deterministic frame for a
// capture, renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld, SITES, SPAWNS } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapon, createGrenades } from './weapons.js';
import { createBots } from './bots.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createGame } from './game.js';

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
const random = mulberry32(seed);

window.__errors = [];
window.addEventListener('error', (event) => window.__errors.push(String(event.message)));

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 26, 70);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = createWorld(scene);
const effects = createEffects(scene);
const audio = createAudio();
const hud = createHud();
const player = createPlayer(world.colliders, SPAWNS.vanguard[0]);
const weapon = createWeapon(camera);
const grenades = createGrenades(scene);
const game = createGame({ scene, world, player, weapon, grenades, bots: null, effects, audio, hud, input: null, camera });
const bots = createBots(scene, world, game.hooks);
const input = createInput(renderer.domElement, onLockChange);
game.attach(bots, input);

const body = player.state;
let elapsed = 0;
let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let wasFiring = false;
let stepSoundAt = 0;

hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.def().name);
hud.setHealth(100, 0);
hud.setMoney(800);
hud.setScore(0, 0, 1);
hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (game.state.phase === 'menu' || game.state.matchOver) {
    game.startMatch();
    input.requestLock();
  } else if (game.state.phase === 'buy' || game.state.phase === 'round' || game.state.phase === 'roundEnd') {
    hud.hideOverlay();
    input.requestLock();
  } else {
    hud.hideOverlay();
    input.requestLock();
  }
});
hud.onBuy((id) => game.buy(id));

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
  } else if (!game.state.matchOver && game.state.phase !== 'menu') {
    hud.showOverlay('paused');
  }
}

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function botContext() {
  return {
    playerPos: body.position,
    playerAlive: player.state.alive,
    bombPlanted: game.state.bombPlanted,
    bombSiteCenter: game.state.bombSite ? SITES[game.state.bombSite].center : new THREE.Vector3(),
    combat: game.state.phase === 'round',
  };
}

function step(dt) {
  elapsed += dt;
  if (game.state.phase === 'round' || game.state.phase === 'buy' || game.state.phase === 'roundEnd') {
    player.step(dt, input.state.keys);
    bots.step(dt, elapsed, botContext());
  }
  weapon.step(dt);
  effects.step(dt, elapsed);
  game.step(dt, random);
  game.syncPlayerSpheres();
  // Footsteps while the player walks.
  if (player.state.alive && player.state.onGround && player.groundSpeed() > 2 && elapsed > stepSoundAt) {
    stepSoundAt = elapsed + 0.38;
    audio.step();
  }
  // The furnace breathes.
  world.furnaceLight.intensity = 28 + Math.sin(elapsed * 11) * 4 + Math.sin(elapsed * 23) * 2;
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    player.look(look.x, look.y);
    const firing = input.state.firing;
    const def = weapon.def();
    if (firing && weapon.ready() && game.state.phase === 'round' && player.state.alive && (def.auto || !wasFiring)) {
      game.playerShoot(random);
    }
    wasFiring = firing;
    if (input.state.keys.has('KeyR')) weapon.reload();
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

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function placeBot(bot, x, z, yaw) {
  bot.pos.set(x, 0, z);
  bot.yaw = yaw;
  bot.model.group.position.copy(bot.pos);
  bot.model.group.rotation.y = yaw;
  bot.goalPoint = new THREE.Vector3(x, 0, z);
}

function runShot(name) {
  hud.hideOverlay();
  game.startMatch();
  const cinder = bots.bots.filter((b) => b.team === 'cinder');
  const vanguard = bots.bots.filter((b) => b.team === 'vanguard');
  if (name === 'start') {
    body.position.set(0, 0, 15);
    body.yaw = 0;
    body.pitch = 0.02;
    hud.hideBuy();
    placeBot(cinder[0], -6, 2, Math.PI * 0.75);
    placeBot(cinder[1], 5, 0, Math.PI * 0.25);
    placeBot(vanguard[0], -3, 10, Math.PI);
    settle(30);
    syncCamera();
    hud.showOverlay('start');
  } else if (name === 'buy') {
    body.position.set(0, 0, 10);
    body.yaw = 0;
    body.pitch = -0.02;
    placeBot(cinder[0], -8, -4, Math.PI * 0.5);
    placeBot(vanguard[0], 3, 6, Math.PI);
    settle(30);
    syncCamera();
    hud.showBuy(2400, new Set(['pistol', 'rifle']));
  } else if (name === 'play') {
    game.startRound();
    body.position.set(0, 0, -5);
    placeBot(cinder[0], -2.5, -11, Math.PI);
    placeBot(cinder[1], 3, -12, Math.PI);
    placeBot(vanguard[0], -6, 8, Math.PI);
    settle(20);
    aimAt(new THREE.Vector3(-2.5, 1.2, -11));
    game.playerShoot(() => 0);
    settle(2);
    aimAt(new THREE.Vector3(3, 1.2, -12));
    game.playerShoot(() => 0);
    settle(1);
    hud.hitMarker(false, 4000);
    hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.def().name);
  } else {
    // end: a round won at the Furnace site, Cinder down.
    game.startRound();
    body.position.set(-8, 0, -6);
    placeBot(cinder[0], -13, -11, 0.4);
    placeBot(cinder[1], -10, -13, -0.6);
    for (const bot of cinder) bots.damage(bot, 999, 'player');
    settle(30);
    game.endRound('vanguard', 'Cinder eliminated');
    hud.setScore(1, 0, 1);
    aimAt(new THREE.Vector3(-11.5, 1.1, -12));
  }
  game.pushHud();
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
// Read-only handle for automated playtests (and the finalist review): live state.
window.__ember = {
  phase: () => game.state.phase,
  round: () => game.state.round,
  wins: () => ({ ...game.state.wins }),
  money: () => game.state.money,
  ammo: () => weapon.state.mag,
  health: () => Math.ceil(player.state.health),
  alive: (team) => bots.aliveCount(team),
  playerPos: () => ({ x: body.position.x, z: body.position.z }),
  botPos: (i) => { const b = bots.bots[i]; return b ? { x: +b.pos.x.toFixed(1), z: +b.pos.z.toFixed(1), hp: b.health, alive: b.alive, node: b.node, goal: b.goalNode, target: b.target ? b.target.kind : null, site: b.site } : null; },
  shots: () => ({ player: game.state.shotsFired, bots: game.state.botShotsFired }),
  bomb: () => ({ planted: game.state.bombPlanted, site: game.state.bombSite, fuse: Math.round(game.state.bombFuse) }),
};
if (shot) runShot(shot);
else requestAnimationFrame(frame);
