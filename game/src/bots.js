// Bots: six of them, two Vanguard beside the player and four Cinder against. Each
// bot walks the waypoint graph toward its orders, sees through a raycast, hears
// gunfire, fires in bursts with aim error, and plants or defuses the charge when
// its team asks it to. Movement reuses the player's axis-separated box collision.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { SITES, SPAWNS } from './world.js';

const RADIUS = 0.34;
const HEIGHT = 1.72;
const EYE = 1.5;
const WALK = 3.4;
const RUN = 4.6;
const REACT_MIN = 0.35;
const REACT_MAX = 0.7;
const BURST_SHOTS = 4;
const BURST_GAP = 0.13;
const BURST_PAUSE = 0.85;

const TEAM_COLOR = { vanguard: 0x58b7ff, cinder: 0xff5a1f };

function botModel(team) {
  const group = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({ color: new THREE.Color(team === 'vanguard' ? '#2b3540' : '#3a2d26'), roughness: 0.7, metalness: 0.15 });
  const visor = new THREE.MeshStandardMaterial({ color: new THREE.Color(TEAM_COLOR[team]), emissive: new THREE.Color(TEAM_COLOR[team]), emissiveIntensity: 0.7, roughness: 0.3 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.72, 0.3), suit);
  torso.position.y = 1.05;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), suit);
  head.position.y = 1.58;
  const visorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.07, 0.05), visor);
  visorMesh.position.set(0, 1.6, 0.14);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.18), suit);
  legL.position.set(-0.14, 0.31, 0);
  const legR = legL.clone();
  legR.position.x = 0.14;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.62), new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.5, metalness: 0.4 }));
  gun.position.set(0.2, 1.15, -0.2);
  group.add(torso, head, visorMesh, legL, legR, gun);
  group.traverse((m) => { if (m.isMesh) { m.castShadow = true; } });
  return { group, torso, head, legL, legR };
}

export function createBots(scene, world, hooks) {
  const colliders = world.colliders;
  const shootables = world.shootables;
  const raycaster = new THREE.Raycaster();
  raycaster.far = 60;
  const losRay = new THREE.Raycaster();
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  const probe = new THREE.Box3();
  const bots = [];
  const hitMeshes = [];
  let hearEvents = [];

  function overlaps(x, y, z) {
    probe.min.set(x - RADIUS, y + 0.04, z - RADIUS);
    probe.max.set(x + RADIUS, y + HEIGHT - 0.04, z + RADIUS);
    for (const c of colliders) if (probe.intersectsBox(c)) return true;
    return false;
  }

  function nearestNode(p) {
    let best = 0;
    let bestD = Infinity;
    world.waypoints.forEach((w, i) => {
      const d = w.p.distanceToSquared(p);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  }

  function makeBot(team, index, spawn, role, site) {
    const model = botModel(team);
    model.group.position.copy(spawn);
    scene.add(model.group);
    const bot = {
      team, index, role, site, model,
      pos: model.group.position,
      yaw: team === 'cinder' ? Math.PI : 0,
      health: 100,
      alive: true,
      node: nearestNode(spawn),
      goalNode: nearestNode(spawn),
      goalPoint: null,
      holdUntil: 0,
      seenAt: -10,
      target: null,
      targetKey: null,
      burstLeft: 0,
      burstTimer: 0,
      reactTimer: 0,
      channel: null,
      channelTime: 0,
      stuckTimer: 0,
      lastProgress: spawn.clone(),
      speed: WALK,
      fall: 0,
      carrier: false,
      hearPoint: null,
    };
    model.torso.userData = { bot, part: 'torso' };
    model.head.userData = { bot, part: 'head' };
    hitMeshes.push(model.torso, model.head);
    bots.push(bot);
    return bot;
  }

  function reset(round) {
    hearEvents = [];
    let ci = 0;
    let vi = 0;
    for (const bot of bots) {
      const spawns = bot.team === 'cinder' ? SPAWNS.cinder : SPAWNS.vanguard;
      const spawn = spawns[bot.team === 'cinder' ? ci % spawns.length : vi % spawns.length];
      if (bot.team === 'cinder') ci += 1; else vi += 1;
      bot.pos.copy(spawn);
      bot.yaw = bot.team === 'cinder' ? Math.PI : 0;
      bot.health = 100;
      bot.alive = true;
      bot.fall = 0;
      bot.model.group.rotation.set(0, bot.yaw, 0);
      bot.model.group.position.y = 0;
      bot.node = nearestNode(spawn);
      bot.goalNode = bot.node;
      bot.goalPoint = null;
      bot.target = null;
      bot.channel = null;
      bot.burstLeft = 0;
      bot.stuckTimer = 0;
      bot.lastProgress.copy(spawn);
      // Orders: Cinder splits 2 and 2 across the sites; Vanguard holds one site each.
      if (bot.team === 'cinder') {
        bot.site = bot.index % 2 === 0 ? 'A' : 'B';
        bot.role = 'attack';
        bot.carrier = bot.index === 0;
      } else {
        bot.site = bot.index === 0 ? 'A' : 'B';
        bot.role = 'defend';
        bot.carrier = false;
      }
      bot.goalNode = nearestNode(bot.site === 'A' ? SITES.A.center : SITES.B.center);
    }
    void round;
  }

  function init() {
    SPAWNS.cinder.forEach((s, i) => makeBot('cinder', i, s, 'attack', i % 2 === 0 ? 'A' : 'B'));
    SPAWNS.vanguard.forEach((s, i) => makeBot('vanguard', i, s, 'defend', i === 0 ? 'A' : 'B'));
    bots[0].carrier = true;
  }

  function canSee(bot, targetPos) {
    tmp.copy(targetPos);
    tmp.y = 1.2;
    tmp2.copy(bot.pos);
    tmp2.y = EYE;
    const dir = tmp.clone().sub(tmp2);
    const dist = dir.length();
    if (dist > 48) return false;
    dir.normalize();
    losRay.set(tmp2, dir);
    losRay.far = dist;
    const hits = losRay.intersectObjects(shootables, false);
    return hits.length === 0;
  }

  function visibleEnemy(bot, ctx) {
    const candidates = [];
    // Only Cinder hunts the player: Vanguard bots never treat their own player as a target.
    if (bot.team === 'cinder' && ctx.playerAlive) candidates.push({ pos: ctx.playerPos, kind: 'player', ref: null });
    for (const other of bots) {
      if (other.alive && other.team !== bot.team) candidates.push({ pos: other.pos, kind: 'bot', ref: other });
    }
    let best = null;
    let bestD = Infinity;
    for (const c of candidates) {
      const d = c.pos.distanceToSquared(bot.pos);
      if (d < bestD && canSee(bot, c.pos)) { bestD = d; best = c; }
    }
    return best;
  }

  function hear(x, z, time) {
    hearEvents.push({ x, z, at: time });
  }

  function pickNext(bot, goalNode) {
    const here = world.waypoints[bot.node];
    let best = null;
    let bestD = Infinity;
    for (const n of here.next) {
      const d = world.waypoints[n].p.distanceToSquared(world.waypoints[goalNode].p);
      if (d < bestD) { bestD = d; best = n; }
    }
    return best === null ? bot.node : best;
  }

  function moveToward(bot, point, dt, speed) {
    tmp.copy(point).sub(bot.pos);
    tmp.y = 0;
    const dist = tmp.length();
    if (dist < 0.05) return true;
    tmp.normalize();
    const targetYaw = Math.atan2(-tmp.x, -tmp.z);
    let dyaw = targetYaw - bot.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    bot.yaw += Math.max(-6 * dt, Math.min(6 * dt, dyaw));
    const stepLen = speed * dt;
    // Forward is -sin(yaw), -cos(yaw) in three.js YXZ convention.
    const fx = -Math.sin(bot.yaw);
    const fz = -Math.cos(bot.yaw);
    const nextX = bot.pos.x + fx * stepLen;
    if (!overlaps(nextX, bot.pos.y, bot.pos.z)) bot.pos.x = nextX;
    const nextZ = bot.pos.z + fz * stepLen;
    if (!overlaps(bot.pos.x, bot.pos.y, nextZ)) bot.pos.z = nextZ;
    return dist < 0.8;
  }

  function damage(bot, amount, killer) {
    if (!bot.alive) return false;
    bot.health -= amount;
    if (bot.health > 0) return false;
    bot.alive = false;
    bot.fall = 0;
    bot.channel = null;
    hooks.onKilled(bot, killer);
    return true;
  }

  function step(dt, time, ctx) {
    for (const bot of bots) {
      if (!bot.alive) {
        if (bot.fall < 1) {
          bot.fall = Math.min(1, bot.fall + dt / 0.4);
          bot.model.group.rotation.x = -bot.fall * 1.45;
        }
        continue;
      }
      const target = visibleEnemy(bot, ctx);
      // visibleEnemy builds fresh wrappers each call: compare by the entity behind
      // the wrapper, or the reaction timer would reset on every step and no bot
      // would ever fire.
      const targetKey = target ? (target.kind === 'player' ? 'player' : target.ref) : null;
      if (targetKey !== bot.targetKey) {
        bot.targetKey = targetKey;
        bot.target = target;
        if (target) {
          bot.reactTimer = REACT_MIN + Math.random() * (REACT_MAX - REACT_MIN);
          bot.burstLeft = 0;
        }
      } else {
        bot.target = target;
      }

      // Orders: converge on a planted charge; attackers push their site; defenders hold.
      if (ctx.bombPlanted) {
        bot.goalNode = nearestNode(ctx.bombSiteCenter);
        bot.goalPoint = ctx.bombSiteCenter;
      } else if (bot.role === 'attack') {
        bot.goalNode = nearestNode(bot.site === 'A' ? SITES.A.center : SITES.B.center);
        bot.goalPoint = null;
      } else if (bot.hearPoint && time - bot.hearPoint.at < 6) {
        bot.goalNode = nearestNode(bot.hearPoint);
        bot.goalPoint = bot.hearPoint;
      } else {
        bot.goalNode = nearestNode(bot.site === 'A' ? SITES.A.center : SITES.B.center);
        bot.goalPoint = bot.site === 'A' ? SITES.A.center : SITES.B.center;
      }

      // Channel: plant (carrier at its site, clear) or defuse (vanguard at planted site).
      if (!bot.target && ctx.combat) {
        if (bot.role === 'attack' && bot.carrier && !ctx.bombPlanted) {
          const site = SITES[bot.site];
          if (bot.pos.distanceTo(site.center) < site.radius) {
            if (bot.channel !== 'plant') { bot.channel = 'plant'; bot.channelTime = 3.5; hooks.onPlantStart(bot, bot.site); }
          }
        } else if (bot.role === 'defend' && ctx.bombPlanted) {
          if (bot.pos.distanceTo(ctx.bombSiteCenter) < 3.5) {
            if (bot.channel !== 'defuse') { bot.channel = 'defuse'; bot.channelTime = 5; hooks.onDefuseStart(bot); }
          }
        }
      }
      if (bot.channel) {
        bot.channelTime -= dt;
        if (bot.target) {
          bot.channel = null;
          hooks.onChannelCancel(bot);
        } else if (bot.channelTime <= 0) {
          const kind = bot.channel;
          bot.channel = null;
          if (kind === 'plant') hooks.onPlantDone(bot, bot.site);
          else hooks.onDefuseDone(bot);
        }
      }

      // Move: hold position when a target is in sight and close, else walk the graph.
      const hold = bot.target && bot.pos.distanceTo(bot.target.pos) < 14;
      let moving = false;
      if (!bot.channel && !hold) {
        const goal = bot.goalPoint || world.waypoints[bot.goalNode].p;
        const atNode = bot.pos.distanceTo(world.waypoints[bot.node].p) < 0.9;
        if (atNode && bot.node !== bot.goalNode) bot.node = pickNext(bot, bot.goalNode);
        const dest = bot.node === bot.goalNode ? goal : world.waypoints[bot.node].p;
        moving = !moveToward(bot, dest, dt, bot.target ? WALK : RUN);
      } else if (bot.target) {
        // Face the enemy while holding.
        tmp.copy(bot.target.pos).sub(bot.pos);
        const targetYaw = Math.atan2(-tmp.x, -tmp.z);
        let dyaw = targetYaw - bot.yaw;
        while (dyaw > Math.PI) dyaw -= Math.PI * 2;
        while (dyaw < -Math.PI) dyaw += Math.PI * 2;
        bot.yaw += Math.max(-8 * dt, Math.min(8 * dt, dyaw));
      }

      // Stuck detection: no progress in 2 s means snap back to the nearest node
      // and carry on toward the goal; a bot holding at its goal never counts as stuck.
      const goalPoint = bot.goalPoint || world.waypoints[bot.goalNode].p;
      const atGoal = bot.pos.distanceTo(goalPoint) < 1.2;
      if (!atGoal && bot.pos.distanceToSquared(bot.lastProgress) > 0.25) {
        bot.lastProgress.copy(bot.pos);
        bot.stuckTimer = 0;
      } else if (!atGoal) {
        bot.stuckTimer += dt;
        if (bot.stuckTimer > 2) {
          bot.node = nearestNode(bot.pos);
          bot.stuckTimer = 0;
          bot.lastProgress.copy(bot.pos);
        }
      } else {
        bot.stuckTimer = 0;
        bot.lastProgress.copy(bot.pos);
      }

      // Fire in bursts once the reaction delay has passed (only while combat runs).
      if (bot.target && !bot.channel && ctx.combat) {
        if (bot.reactTimer > 0) {
          bot.reactTimer -= dt;
        } else {
          if (bot.burstLeft === 0) {
            bot.burstLeft = BURST_SHOTS;
            bot.burstTimer = 0;
          }
          bot.burstTimer -= dt;
          if (bot.burstLeft > 0 && bot.burstTimer <= 0) {
            bot.burstLeft -= 1;
            bot.burstTimer = BURST_GAP;
            hooks.onShoot(bot, bot.target);
            if (bot.burstLeft === 0) bot.reactTimer = BURST_PAUSE;
          }
        }
      }

      // Pose: face the walk direction, bob the legs while moving.
      bot.model.group.position.copy(bot.pos);
      bot.model.group.rotation.y = bot.yaw;
      const swing = moving ? Math.sin(time * 10 + bot.index) * 0.45 : 0;
      bot.model.legL.rotation.x = swing;
      bot.model.legR.rotation.x = -swing;
      void raycaster;
    }
    // Expire old sound events.
    for (const bot of bots) {
      if (bot.hearPoint && time - bot.hearPoint.at > 6) bot.hearPoint = null;
    }
    for (const e of hearEvents) {
      for (const bot of bots) {
        if (!bot.alive || bot.target) continue;
        const d = Math.hypot(bot.pos.x - e.x, bot.pos.z - e.z);
        if (d < 26) bot.hearPoint = { x: e.x, z: e.z, at: time };
      }
    }
    hearEvents = [];
  }

  init();

  return {
    bots,
    hitMeshes,
    step,
    damage,
    hear,
    reset,
    aliveCount(team) {
      return bots.filter((b) => b.team === team && b.alive).length;
    },
    carrier() {
      return bots.find((b) => b.carrier && b.alive) || null;
    },
  };
}
