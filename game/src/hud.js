// The DOM HUD: crosshair, hit marker, ammo, health, money, timer, score, bomb
// status, kill feed, damage direction, the buy menu and the overlays. It never
// touches the simulation; main.js pushes numbers in and reads callbacks out.
// Every setter caches its last value so the DOM is only touched on change.
import { ARMOR_PRICE, GRENADE_PRICE, WEAPONS } from './weapons.js';

const COPY = {
  menu: {
    title: 'EMBERLINE',
    copy: 'A round-based tactical shooter. Plant the charge at Furnace or Crane — or eliminate the ASHEN team. Win 5 rounds to take the match.',
    action: 'Deploy',
  },
  paused: { title: 'EMBERLINE', copy: 'Paused. Click to resume.', action: 'Click to resume' },
  dead: { title: 'You are down', copy: 'Your squad fights on. Spectating a teammate.', action: '' },
  matchEnd: { title: '', copy: '', action: 'Play again' },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const ammoEl = $('ammo');
  const weaponName = $('weapon-name');
  const hpFill = $('hp-fill');
  const hpNum = $('hp-num');
  const armorFill = $('armor-fill');
  const moneyEl = $('money-value');
  const timerEl = $('timer-value');
  const timerLabel = $('timer-label');
  const scoreEmber = $('score-ember');
  const scoreAshen = $('score-ashen');
  const roundLabel = $('round-label');
  const aliveEmber = $('alive-ember');
  const aliveAshen = $('alive-ashen');
  const bombEl = $('bomb');
  const bombText = $('bomb-text');
  const bombBar = $('bomb-bar');
  const feedEl = $('feed');
  const bannerEl = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  const vignette = $('vignette');
  const damageDir = $('damage-dir');
  const flashEl = $('flash');
  const buyEl = $('buy');
  const buyMoney = $('buy-money');
  const plantEl = $('plant');
  const plantFill = $('plant-fill');
  const scopeEl = $('scope');
  let last = {};
  let hitTimer = 0;
  let bannerTimer = 0;
  let feedTimer = 0;

  function setText(el, key, value) {
    if (last[key] === value) return;
    last[key] = value;
    el.textContent = value;
  }

  const buyRows = [];
  function buildBuy(onBuy) {
    const items = [
      { id: 'vk47', key: '1', name: WEAPONS.vk47.name, desc: 'Automatic carbine · 30 rounds', price: WEAPONS.vk47.price },
      { id: 'rook', key: '2', name: WEAPONS.rook.name, desc: 'Fast SMG · 32 rounds', price: WEAPONS.rook.price },
      { id: 'longbow', key: '3', name: WEAPONS.longbow.name, desc: 'Bolt sniper · 5 rounds · scope', price: WEAPONS.longbow.price },
      { id: 'grenade', key: '4', name: 'Flashbang', desc: 'Blinds bots in sight · G to throw', price: GRENADE_PRICE },
      { id: 'armor', key: '5', name: 'Kevlar vest', desc: 'Halves damage until it breaks', price: ARMOR_PRICE },
    ];
    for (const item of items) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'buy-row';
      row.innerHTML = `<span class="buy-key">${item.key}</span><span class="buy-name">${item.name}<i>${item.desc}</i></span><span class="buy-price">$${item.price}</span>`;
      row.addEventListener('click', () => onBuy(item.id));
      buyEl.insertBefore(row, document.getElementById('deploy'));
      buyRows.push({ row, item });
    }
  }

  return {
    buildBuy,
    setAmmo(mag, reserve, name) {
      setText(ammoMag, 'mag', String(mag));
      setText(ammoReserve, 'reserve', `/ ${reserve}`);
      setText(weaponName, 'wname', name);
      ammoEl.classList.toggle('empty', mag === 0);
    },
    setHealth(hp, armor) {
      const h = Math.max(0, Math.round(hp));
      if (last.hp !== h) { last.hp = h; hpNum.textContent = String(h); hpFill.style.width = `${h}%`; }
      if (last.armor !== armor) { last.armor = armor; armorFill.style.width = `${Math.max(0, Math.min(100, armor))}%`; }
    },
    setMoney(value) { setText(moneyEl, 'money', `$${value}`); },
    setTimer(seconds, label, danger) {
      const s = Math.max(0, Math.ceil(seconds));
      const text = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      setText(timerEl, 'timer', text);
      setText(timerLabel, 'tlabel', label);
      timerEl.classList.toggle('danger', !!danger);
    },
    setScore(ember, ashen, round) {
      setText(scoreEmber, 'se', String(ember));
      setText(scoreAshen, 'sa', String(ashen));
      setText(roundLabel, 'round', `ROUND ${round} / 9`);
    },
    setAlive(ember, ashen) {
      setText(aliveEmber, 'ae', '●'.repeat(ember) + '○'.repeat(Math.max(0, 3 - ember)));
      setText(aliveAshen, 'aa', '●'.repeat(ashen) + '○'.repeat(Math.max(0, 4 - ashen)));
    },
    setBomb(text, frac) {
      bombEl.hidden = !text;
      if (!text) return;
      setText(bombText, 'bomb', text);
      bombBar.style.width = `${Math.max(0, Math.min(100, frac * 100))}%`;
    },
    setCrosshair(spreadPx, scoped) {
      crosshair.style.setProperty('--gap', `${spreadPx.toFixed(1)}px`);
      crosshair.classList.toggle('scoped', !!scoped);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.style.transform = killed ? 'translate(-50%, -50%) rotate(45deg) scale(1.3)' : '';
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => { hitmarker.classList.remove('on'); hitmarker.style.transform = ''; }, holdMs);
    },
    damage(fromAngle) {
      vignette.classList.add('on');
      setTimeout(() => vignette.classList.remove('on'), 260);
      if (fromAngle !== null && fromAngle !== undefined) {
        damageDir.style.transform = `translate(-50%, -50%) rotate(${fromAngle}deg)`;
        damageDir.classList.add('on');
        setTimeout(() => damageDir.classList.remove('on'), 500);
      }
    },
    flashBang(strength) {
      flashEl.style.opacity = String(strength);
      setTimeout(() => { flashEl.style.opacity = '0'; }, 120);
    },
    feed(text) {
      const line = document.createElement('div');
      line.className = 'feed-line';
      line.textContent = text;
      feedEl.prepend(line);
      while (feedEl.children.length > 4) feedEl.lastChild.remove();
      clearTimeout(feedTimer);
      feedTimer = setTimeout(() => { feedEl.innerHTML = ''; }, 6000);
    },
    banner(titleText, subText, holdMs = 2600) {
      bannerTitle.textContent = titleText;
      bannerSub.textContent = subText;
      bannerEl.classList.add('on');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => bannerEl.classList.remove('on'), holdMs);
    },
    showPlant(frac) {
      plantEl.hidden = false;
      plantFill.style.width = `${Math.max(0, Math.min(100, frac * 100))}%`;
    },
    hidePlant() { plantEl.hidden = true; },
    showBuy(money, owned) {
      buyEl.hidden = false;
      setText(buyMoney, 'buymoney', `$${money}`);
      for (const { row, item } of buyRows) {
        const afford = money >= item.price;
        const done = item.id !== 'grenade' && item.id !== 'armor' && owned[item.id];
        row.classList.toggle('cant', !afford && !done);
        row.classList.toggle('owned', !!done);
        row.querySelector('.buy-price').textContent = done ? 'OWNED' : `$${item.price}`;
      }
    },
    hideBuy() { buyEl.hidden = true; },
    setScope(on) { scopeEl.hidden = !on; },
    showOverlay(mode, data) {
      const text = COPY[mode];
      if (mode === 'matchEnd') {
        title.textContent = data.winner === 'ember' ? 'EMBER takes the match' : 'ASHEN takes the match';
        copy.textContent = `Final score ${data.score.ember} — ${data.score.ashen}. ${data.winner === 'ember' ? 'The yard is yours.' : 'The yard holds. Run it back.'}`;
      } else {
        title.textContent = text.title;
        copy.textContent = text.copy;
      }
      play.textContent = text.action;
      play.style.display = text.action ? '' : 'none';
      overlay.hidden = false;
      if (text.action) play.focus();
    },
    hideOverlay() { overlay.hidden = true; },
    onPlay(handler) { play.addEventListener('click', handler); },
  };
}
