// The rules: rounds, money, the charge, and who wins. Vanguard (the player and two
// bots) defends the yard; Cinder attacks and plants. First to 5 rounds, at most 9.
// The game owns every shot's result: the player's ray against bot meshes and the
// world, a bot's ray against analytic spheres for the player and other bots.
import * as THREE from 'three';
import { SITES, SPAWNS } from './world.js';
import { WEAPONS, GRENADE_PRICE, ARMOR_PRICE } from './weapons.js';

const BUY_SECONDS = 14;
const ROUND_SECONDS = 100;
const BOMB_FUSE = 45;
const DEFUSE_SECONDS = 5;
const WIN_ROUNDS = 5;
const MAX_ROUNDS = 9;
const KILL_REWARD = 300;
const WIN_REWARD = 3250;
const LOSS_REWARD = 1900;
const DEFUSE_REWARD = 300;
const BLAST_RADIUS = 6.5;
const BLAST_MAX = 130;

const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _toCenter = new THREE.Vector3();
const _chest = new THREE.Vector3();
const _head = new THREE.Vector3();

function raySphere(origin, dir, center, radius) {
  _toCenter.copy(center).sub(origin);
  const tca = _toCenter.dot(dir);
  if (tca < 0) return Infinity;
  const d2 = _toCenter.lengthSq() - tca * tca;
  const r2 = radius * radius;
  if (d2 > r2) return Infinity;
  return tca - Math.sqrt(r2 - d2);
}

export function createGame(deps) {
  const { scene, world, player, weapon, grenades, effects, audio, hud, camera } = deps;
  // Bots and input arrive after construction (bots need the game's hooks): attach()
  // wires them in before the first step.
  let bots = deps.bots || null;
  let input = deps.input || null;
  const raycaster = new THREE.Raycaster();
  raycaster.far = 120;
  const shootables = () => world.shootables.concat(bots.hitMeshes);

  const state = {
    phase: 'menu',
    phaseTime: 0,
    round: 1,
    wins: { vanguard: 0, cinder: 0 },
    money: 800,
    grenadeCount: 0,
    owned: new Set(['pistol']),
    weaponId: 'rifle',
    bombPlanted: false,
    bombSite: null,
    bombFuse: 0,
    defuseProgress: 0,
    roundTimer: ROUND_SECONDS,
    elapsed: 0,
    kills: 0,
    deaths: 0,
    shotsFired: 0,
    botShotsFired: 0,
    matchOver: false,
    playerDead: false,
  };

  // Invisible spheres the bots shoot at: the player's chest and head.
  const playerChest = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
  const playerHead = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
  scene.add(playerChest, playerHead);

  function syncPlayerSpheres() {
    const p = player.state.position;
    playerChest.position.set(p.x, p.y + 1.05, p.z);
    playerHead.position.set(p.x, p.y + player.state.eye, p.z);
  }

  function pushHud() {
    const ps = player.state;
    hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.def().name);
    hud.setHealth(Math.ceil(ps.health), ps.armor);
    hud.setMoney(state.money);
    hud.setTimer(state.phase === 'round' ? Math.max(0, state.roundTimer) : state.phase === 'buy' || state.phase === 'roundEnd' ? Math.max(0, state.phaseTime) : 0);
    hud.setScore(state.wins.vanguard, state.wins.cinder, state.round);
    if (state.bombPlanted) {
      const defusing = state.defuseProgress > 0;
      hud.setBomb(defusing ? `DEFUSING ${Math.ceil(state.defuseProgress)}s` : `CHARGE LIVE — ${Math.ceil(state.bombFuse)}s — SITE ${state.bombSite}`, state.bombFuse <= 10);
    } else {
      hud.setBomb('', false);
    }
  }

  function startBuyPhase() {
    state.phase = 'buy';
    state.phaseTime = BUY_SECONDS;
    state.bombPlanted = false;
    state.bombSite = null;
    state.defuseProgress = 0;
    state.playerDead = false;
    bots.reset(state.round);
    player.reset(SPAWNS.vanguard[0], 0);
    weapon.equip(state.weaponId);
    weapon.refill();
    effects.hideCharge();
    hud.showBuy(state.money, state.owned);
    hud.banner(`ROUND ${state.round}`, 'Buy phase — press B when ready', 2200);
    pushHud();
  }

  function startRound() {
    state.phase = 'round';
    state.roundTimer = ROUND_SECONDS;
    hud.hideBuy();
    hud.banner(`ROUND ${state.round}`, 'Defend Furnace and Crane', 2200);
    audio.beep(false);
    pushHud();
  }

  function endRound(winner, reason) {
    if (state.phase !== 'round') return;
    state.phase = 'roundEnd';
    state.phaseTime = 4;
    state.wins[winner] += 1;
    const playerWon = winner === 'vanguard';
    state.money += playerWon ? WIN_REWARD : LOSS_REWARD;
    if (playerWon) audio.roundWin();
    else audio.roundLose();
    hud.hideBuy();
    hud.setBomb('', false);
    hud.banner(
      playerWon ? 'VANGUARD WINS THE ROUND' : 'CINDER WINS THE ROUND',
      reason,
      3600,
    );
    hud.killfeed(`${playerWon ? 'Vanguard' : 'Cinder'} takes round ${state.round} — ${reason}`);
    pushHud();
  }

  function endMatch() {
    state.phase = 'matchEnd';
    state.matchOver = true;
    const won = state.wins.vanguard > state.wins.cinder;
    hud.showOverlay('end', won
      ? `Vanguard takes the yard ${state.wins.vanguard}–${state.wins.cinder}. You finished ${state.kills} kills, ${state.deaths} deaths.`
      : `Cinder takes the yard ${state.wins.cinder}–${state.wins.vanguard}. You finished ${state.kills} kills, ${state.deaths} deaths.`);
    if (document.pointerLockElement) document.exitPointerLock();
  }

  function nextRound() {
    if (state.wins.vanguard >= WIN_ROUNDS || state.wins.cinder >= WIN_ROUNDS || state.round >= MAX_ROUNDS) {
      endMatch();
      return;
    }
    state.round += 1;
    startBuyPhase();
  }

  function startMatch() {
    state.round = 1;
    state.wins.vanguard = 0;
    state.wins.cinder = 0;
    state.money = 800;
    state.grenadeCount = 0;
    state.owned = new Set(['pistol']);
    state.weaponId = 'rifle';
    state.kills = 0;
    state.deaths = 0;
    state.matchOver = false;
    startBuyPhase();
  }

  function buy(id) {
    if (state.phase !== 'buy') return;
    if (id === 'grenade') {
      if (state.money < GRENADE_PRICE || state.grenadeCount >= 2) return;
      state.money -= GRENADE_PRICE;
      state.grenadeCount += 1;
      audio.beep(false);
    } else if (id === 'armor') {
      if (state.money < ARMOR_PRICE || player.state.armor >= 100) return;
      state.money -= ARMOR_PRICE;
      player.state.armor = 100;
      audio.beep(false);
    } else if (WEAPONS[id]) {
      if (state.owned.has(id)) {
        state.weaponId = id;
        weapon.equip(id);
        weapon.refill();
      } else {
        if (state.money < WEAPONS[id].price) return;
        state.money -= WEAPONS[id].price;
        state.owned.add(id);
        state.weaponId = id;
        weapon.equip(id);
        weapon.refill();
      }
      audio.beep(false);
    }
    hud.refreshBuy(state.money, state.owned);
    pushHud();
  }

  function damagePlayer(amount, fromBot) {
    if (!player.state.alive || state.phase !== 'round') return;
    const dealt = player.damage(amount);
    audio.hurt();
    hud.flashDamage();
    if (dealt > 0 && !player.state.alive) {
      state.deaths += 1;
      state.playerDead = true;
      hud.killfeed(`${fromBot ? 'Cinder bot' : 'Cinder'} eliminated you`);
      if (document.pointerLockElement) document.exitPointerLock();
      hud.showOverlay('paused', 'You are down. Your team fights on — the round will decide itself.');
      // Reuse the paused overlay text path: swap copy after the fact.
      document.getElementById('overlay-title').textContent = 'YOU ARE DOWN';
      document.getElementById('overlay-copy').textContent = 'Your team fights on. The round will decide itself.';
      document.getElementById('play').textContent = 'Watch';
    }
    pushHud();
  }

  // The player's shot: a ray from the camera with spread, against bot meshes first.
  function playerShoot(random) {
    if (!weapon.takeRound()) return false;
    state.shotsFired += 1;
    camera.getWorldDirection(_dir);
    const spread = weapon.spread(player.groundSpeed());
    _dir.x += (random() * 2 - 1) * spread;
    _dir.y += (random() * 2 - 1) * spread;
    _dir.z += (random() * 2 - 1) * spread;
    _dir.normalize();
    _origin.copy(camera.position);
    raycaster.set(_origin, _dir);
    const hit = raycaster.intersectObjects(shootables(), false)[0];
    const muzzle = _origin.clone().addScaledVector(_dir, 0.6);
    if (hit) {
      effects.tracer(muzzle, hit.point);
      const userData = hit.object.userData;
      if (userData && userData.bot) {
        const def = weapon.def();
        const isHead = userData.part === 'head';
        const dmg = def.damage * (isHead ? def.headMult : 1);
        const killed = bots.damage(userData.bot, dmg, 'player');
        hud.hitMarker(killed, 140);
        audio.hit();
        if (killed) {
          state.kills += 1;
          state.money += KILL_REWARD;
          audio.kill();
          hud.killfeed(`You eliminated a Cinder bot${isHead ? ' — headshot' : ''}  +$${KILL_REWARD}`);
          pushHud();
        }
      } else {
        const n = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : new THREE.Vector3(0, 1, 0);
        effects.impact(hit.point, n, 6);
      }
    } else {
      effects.tracer(muzzle, _origin.clone().addScaledVector(_dir, 60));
    }
    weapon.pullTrigger();
    player.recoil(0.009 + random() * 0.004 + weapon.def().recoil * 0.4, (random() * 2 - 1) * 0.004);
    bots.hear(player.state.position.x, player.state.position.z, state.elapsed);
    audio.shot(weapon.def().id);
    pushHud();
    return true;
  }

  // A bot's shot: analytic spheres for the player and the other bots, world first.
  function botShoot(bot, target) {
    state.botShotsFired += 1;
    const def = bot.team === 'cinder' ? WEAPONS.rifle : WEAPONS.smg;
    _origin.copy(bot.pos);
    _origin.y += 1.5;
    const dist = bot.pos.distanceTo(target.pos);
    const aimErr = 0.02 + dist * 0.0009 + (target.kind === 'player' ? player.groundSpeed() * 0.004 : 0.01);
    if (target.kind === 'player') {
      _chest.copy(player.state.position);
      _chest.y += 1.05;
    } else {
      _chest.copy(target.ref.pos);
      _chest.y += 1.05;
    }
    _dir.copy(_chest).sub(_origin).normalize();
    _dir.x += (Math.random() * 2 - 1) * aimErr;
    _dir.y += (Math.random() * 2 - 1) * aimErr;
    _dir.z += (Math.random() * 2 - 1) * aimErr;
    _dir.normalize();
    raycaster.set(_origin, _dir);
    const worldHit = raycaster.intersectObjects(world.shootables, false)[0];
    const worldT = worldHit ? worldHit.distance : Infinity;
    let bestT = worldT;
    let victim = null;
    let head = false;
    // The player.
    if (target.kind === 'player' && player.state.alive) {
      _head.copy(player.state.position);
      _head.y += player.state.eye;
      const tHead = raySphere(_origin, _dir, _head, 0.18);
      const tChest = raySphere(_origin, _dir, _chest, 0.42);
      if (tHead < bestT) { bestT = tHead; victim = 'player'; head = true; }
      else if (tChest < bestT) { bestT = tChest; victim = 'player'; head = false; }
    }
    // Other bots.
    for (const other of bots.bots) {
      if (!other.alive || other === bot) continue;
      if (other.team === bot.team) continue;
      _chest.copy(other.pos);
      _chest.y += 1.05;
      _head.copy(other.pos);
      _head.y += 1.58;
      const tHead = raySphere(_origin, _dir, _head, 0.17);
      const tChest = raySphere(_origin, _dir, _chest, 0.45);
      if (tHead < bestT) { bestT = tHead; victim = other; head = true; }
      else if (tChest < bestT) { bestT = tChest; victim = other; head = false; }
    }
    const end = _origin.clone().addScaledVector(_dir, Math.min(bestT === Infinity ? 60 : bestT, 60));
    effects.tracer(_origin.clone().addScaledVector(_dir, 0.7), end);
    if (victim === 'player') {
      damagePlayer(def.damage * (head ? 3 : 1), bot);
    } else if (victim) {
      const killed = bots.damage(victim, def.damage * (head ? 3 : 1), bot);
      if (killed) {
        hud.killfeed(`${bot.team === 'cinder' ? 'Cinder' : 'Vanguard'} bot eliminated a ${victim.team} bot`);
      }
    } else if (worldHit) {
      const n = worldHit.face ? worldHit.face.normal.clone().transformDirection(worldHit.object.matrixWorld) : new THREE.Vector3(0, 1, 0);
      effects.impact(worldHit.point, n, 4);
    }
    audio.enemyShot(dist);
  }

  function throwGrenade() {
    if (state.phase !== 'round' || state.grenadeCount <= 0 || !player.state.alive) return;
    state.grenadeCount -= 1;
    camera.getWorldDirection(_dir);
    _origin.copy(camera.position);
    grenades.throwFrom(_origin, _dir);
    audio.beep(false);
  }

  function blast(point) {
    effects.explosion(point);
    audio.explosion();
    // Damage bots and the player inside the radius, halved through a wall.
    const hurt = (center, radius, hp) => {
      const d = point.distanceTo(center);
      if (d > BLAST_RADIUS) return 0;
      _origin.copy(point);
      _dir.copy(center).sub(point).normalize();
      raycaster.set(_origin, _dir);
      const blocked = raycaster.intersectObjects(world.shootables, false)[0];
      const through = blocked && blocked.distance < d;
      return Math.round(BLAST_MAX * (1 - d / BLAST_RADIUS) * (through ? 0.5 : 1));
    };
    for (const bot of bots.bots) {
      if (!bot.alive) continue;
      _chest.copy(bot.pos);
      _chest.y += 1;
      const dmg = hurt(_chest, 0.45, bot.health);
      if (dmg > 0) {
        const killed = bots.damage(bot, dmg, 'player');
        if (killed && bot.team === 'cinder') {
          state.kills += 1;
          state.money += KILL_REWARD;
          hud.killfeed(`Your grenade eliminated a Cinder bot  +$${KILL_REWARD}`);
        }
      }
    }
    if (player.state.alive) {
      _chest.copy(player.state.position);
      _chest.y += 1.05;
      const dmg = hurt(_chest, 0.42, player.state.health);
      if (dmg > 0) damagePlayer(dmg, null);
    }
    pushHud();
  }

  function plantDone(bot, site) {
    state.bombPlanted = true;
    state.bombSite = site;
    state.bombFuse = BOMB_FUSE;
    effects.showCharge(SITES[site].center);
    audio.plant();
    hud.banner('CHARGE PLANTED', `Cinder planted at ${SITES[site].name} — defuse it`, 3200);
    hud.killfeed(`Cinder planted the charge at ${SITES[site].name}`);
  }

  function defuseDone(bot) {
    if (!state.bombPlanted) return;
    state.bombPlanted = false;
    state.money += DEFUSE_REWARD;
    effects.hideCharge();
    hud.killfeed(`A Vanguard bot defused the charge  +$${DEFUSE_REWARD}`);
    endRound('vanguard', 'Charge defused');
  }

  function playerDefuseStep(dt) {
    if (!state.bombPlanted || !player.state.alive) {
      state.defuseProgress = 0;
      return;
    }
    const site = SITES[state.bombSite];
    const near = player.state.position.distanceTo(site.center) < 3.5;
    const holding = input.state.keys.has('KeyE');
    if (near && holding) {
      state.defuseProgress += dt;
      if (state.defuseProgress >= DEFUSE_SECONDS) {
        state.bombPlanted = false;
        state.defuseProgress = 0;
        state.money += DEFUSE_REWARD;
        effects.hideCharge();
        audio.kill();
        hud.killfeed(`You defused the charge  +$${DEFUSE_REWARD}`);
        endRound('vanguard', 'Charge defused');
      }
    } else {
      state.defuseProgress = Math.max(0, state.defuseProgress - dt * 2);
    }
  }

  function checkRoundEnd() {
    if (state.phase !== 'round') return;
    const vanguardAlive = bots.aliveCount('vanguard') + (player.state.alive ? 1 : 0);
    const cinderAlive = bots.aliveCount('cinder');
    if (cinderAlive === 0) endRound('vanguard', 'Cinder eliminated');
    else if (vanguardAlive === 0) endRound('cinder', 'Vanguard eliminated');
  }

  function step(dt, random) {
    state.elapsed += dt;
    if (state.phase === 'buy') {
      state.phaseTime -= dt;
      if (input.consumePress('KeyB')) startRound();
      if (input.consumePress('Digit1')) buy('rifle');
      if (input.consumePress('Digit2')) buy('smg');
      if (input.consumePress('Digit3')) buy('dmr');
      if (input.consumePress('Digit4')) buy('pistol');
      if (input.consumePress('Digit5')) buy('grenade');
      if (input.consumePress('Digit6')) buy('armor');
      if (state.phaseTime <= 0) startRound();
    } else if (state.phase === 'round') {
      state.roundTimer -= dt;
      if (input.consumePress('KeyB')) hud.banner('BUY PHASE OVER', 'The buy menu opens between rounds', 1500);
      if (input.consumePress('KeyG')) throwGrenade();
      const blastPoint = grenades.step(dt, world.colliders);
      if (blastPoint) blast(blastPoint);
      playerDefuseStep(dt);
      if (state.bombPlanted) {
        state.bombFuse -= dt;
        if (state.bombFuse <= 0) {
          state.bombPlanted = false;
          effects.hideCharge();
          effects.explosion(SITES[state.bombSite].center);
          audio.explosion();
          endRound('cinder', 'Charge detonated');
        }
      }
      if (state.roundTimer <= 0 && state.phase === 'round') endRound('vanguard', 'Time expired — yard held');
      checkRoundEnd();
    } else if (state.phase === 'roundEnd') {
      state.phaseTime -= dt;
      if (state.phaseTime <= 0) nextRound();
    }
    pushHud();
  }

  const hooks = {
    onShoot: botShoot,
    onKilled(bot, killer) {
      if (killer === 'player') return; // handled in playerShoot
      if (bot.team === 'vanguard' && killer && killer.team === 'cinder') {
        hud.killfeed('A Cinder bot eliminated your teammate');
      }
    },
    onPlantStart(bot, site) {
      hud.killfeed(`Cinder is planting at ${SITES[site].name}`);
    },
    onPlantDone: plantDone,
    onDefuseStart() {
      hud.killfeed('A Vanguard bot is defusing');
    },
    onDefuseDone: defuseDone,
    onChannelCancel() {},
  };

  return {
    state,
    hooks,
    attach(botsApi, inputApi) {
      bots = botsApi;
      input = inputApi;
    },
    startMatch,
    startBuyPhase,
    startRound,
    endRound,
    buy,
    step,
    playerShoot,
    throwGrenade,
    syncPlayerSpheres,
    pushHud,
    nextRound,
  };
}
