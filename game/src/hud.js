// The DOM HUD: crosshair, hit marker, health, ammo, money, timer, score, kill feed
// and the overlays for menu, buy, round and match end. It never touches the
// simulation; the game pushes numbers in and reads callbacks out.
import { WEAPONS, GRENADE_PRICE, ARMOR_PRICE } from './weapons.js';

const COPY = {
  start: {
    title: 'EMBERWORKS',
    copy: 'A foundry yard at dusk. Plant the charge at Furnace or Crane — or stop Cinder from doing it. First to 5 rounds takes the yard.',
    action: 'Click to play',
  },
  paused: {
    title: 'EMBERWORKS',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  end: {
    title: 'Match over',
    copy: '',
    action: 'Play again',
  },
};

export function createHud() {
  const overlay = document.getElementById('overlay');
  const title = document.getElementById('overlay-title');
  const copy = document.getElementById('overlay-copy');
  const play = document.getElementById('play');
  const ammoMag = document.getElementById('ammo-mag');
  const ammoReserve = document.getElementById('ammo-reserve');
  const ammo = document.getElementById('ammo');
  const weaponName = document.getElementById('weapon-name');
  const healthFill = document.getElementById('health-fill');
  const healthNum = document.getElementById('health-num');
  const armorNum = document.getElementById('armor-num');
  const moneyNum = document.getElementById('money-num');
  const timerNum = document.getElementById('timer-num');
  const scoreUs = document.getElementById('score-us');
  const scoreThem = document.getElementById('score-them');
  const roundNum = document.getElementById('round-num');
  const feed = document.getElementById('feed');
  const banner = document.getElementById('banner');
  const bannerTitle = document.getElementById('banner-title');
  const bannerSub = document.getElementById('banner-sub');
  const buy = document.getElementById('buy');
  const buyMoney = document.getElementById('buy-money');
  const buyItems = document.getElementById('buy-items');
  const bombStatus = document.getElementById('bomb-status');
  const damage = document.getElementById('damage');
  const crosshair = document.getElementById('crosshair');
  const hitmarker = document.getElementById('hitmarker');
  let hitTimer = 0;
  let bannerTimer = 0;
  let last = {};
  let buyHandler = null;

  const BUY_ROWS = [
    { key: '1', id: 'rifle', name: 'KESTREL RIFLE', price: WEAPONS.rifle.price, desc: '30-round automatic rifle. The workhorse.' },
    { key: '2', id: 'smg', name: 'JACKAL SMG', price: WEAPONS.smg.price, desc: 'Fast, close, hungry. 32 rounds.' },
    { key: '3', id: 'dmr', name: 'LONGBOW DMR', price: WEAPONS.dmr.price, desc: 'One shot, long sightlines. 10 rounds.' },
    { key: '4', id: 'pistol', name: 'P9 SIDEARM', price: 0, desc: 'Your sidearm. Always yours.' },
    { key: '5', id: 'grenade', name: 'EMBER GRENADE', price: GRENADE_PRICE, desc: 'Frag grenade. Throw with G.' },
    { key: '6', id: 'armor', name: 'PLATE ARMOUR', price: ARMOR_PRICE, desc: 'Soaks half of every hit.' },
  ];

  function renderBuy(money, owned) {
    buyMoney.textContent = `$${money}`;
    buyItems.innerHTML = '';
    for (const row of BUY_ROWS) {
      const div = document.createElement('div');
      const afford = money >= row.price;
      const has = owned.has(row.id);
      div.className = `buy-row${afford ? '' : ' poor'}${has ? ' owned' : ''}`;
      div.innerHTML = `<span class="buy-key">${row.key}</span><span class="buy-name">${row.name}</span><span class="buy-desc">${row.desc}</span><span class="buy-price">${has ? 'OWNED' : '$' + row.price}</span>`;
      div.addEventListener('click', () => { if (buyHandler) buyHandler(row.id); });
      buyItems.appendChild(div);
    }
  }

  return {
    setAmmo(mag, reserve, name) {
      if (last.mag === mag && last.reserve === reserve && last.name === name) return;
      last = { ...last, mag, reserve, name };
      ammoMag.textContent = String(mag);
      ammoReserve.textContent = `/ ${reserve}`;
      weaponName.textContent = name;
      ammo.classList.toggle('empty', mag === 0);
    },
    setHealth(health, armor) {
      if (last.health === health && last.armor === armor) return;
      last = { ...last, health, armor };
      healthFill.style.width = `${health}%`;
      healthFill.classList.toggle('low', health <= 30);
      healthNum.textContent = String(health);
      armorNum.textContent = armor > 0 ? `+${armor}` : '';
    },
    setMoney(money) {
      if (last.money === money) return;
      last = { ...last, money };
      moneyNum.textContent = `$${money}`;
    },
    setTimer(seconds) {
      const text = `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
      if (last.timer === text) return;
      last = { ...last, timer: text };
      timerNum.textContent = text;
      timerNum.classList.toggle('urgent', seconds <= 10);
    },
    setScore(us, them, round) {
      if (last.us === us && last.them === them && last.round === round) return;
      last = { ...last, us, them, round };
      scoreUs.textContent = String(us);
      scoreThem.textContent = String(them);
      roundNum.textContent = `ROUND ${round}`;
    },
    setBomb(text, urgent) {
      if (last.bomb === text) return;
      last = { ...last, bomb: text };
      bombStatus.textContent = text;
      bombStatus.classList.toggle('urgent', !!urgent);
      bombStatus.hidden = !text;
    },
    setSpread(gap) {
      crosshair.style.setProperty('--gap', `${gap}px`);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    flashDamage() {
      damage.classList.remove('on');
      void damage.offsetWidth;
      damage.classList.add('on');
    },
    killfeed(text) {
      const line = document.createElement('div');
      line.className = 'feed-line';
      line.textContent = text;
      feed.prepend(line);
      while (feed.children.length > 5) feed.removeChild(feed.lastChild);
      setTimeout(() => { if (line.parentNode) line.remove(); }, 6000);
    },
    banner(titleText, subText, ms = 2600) {
      bannerTitle.textContent = titleText;
      bannerSub.textContent = subText;
      banner.hidden = false;
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => { banner.hidden = true; }, ms);
    },
    showBuy(money, owned) {
      renderBuy(money, owned);
      buy.hidden = false;
    },
    hideBuy() {
      buy.hidden = true;
    },
    refreshBuy(money, owned) {
      if (!buy.hidden) renderBuy(money, owned);
    },
    onBuy(handler) {
      buyHandler = handler;
    },
    showOverlay(mode, extra) {
      const text = COPY[mode];
      title.textContent = text.title;
      copy.textContent = mode === 'end' ? extra : text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
  };
}
