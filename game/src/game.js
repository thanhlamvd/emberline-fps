// The match: rounds, money, the bomb and the score. One object owns the rules
// so main.js never decides a round itself: it feeds events in (a kill, a plant,
// a defuse, the clock) and game.js answers with phase changes through the hooks.
// Money follows the Counter-Strike shape: a win pays $3250, a loss $1900 plus
// $500 per consecutive loss, a kill $300, a plant $300. First to 5 rounds takes
// the match, at most 9 rounds.
import { ARMOR_PRICE, GRENADE_PRICE, WEAPONS } from './weapons.js';

export const ROUND_TIME = 100;
export const BUY_TIME = 15;
export const DETONATE_TIME = 35;
export const PLANT_CHANNEL = 3.2;
export const WIN_ROUNDS = 5;
export const MAX_ROUNDS = 9;
const WIN_PAY = 3250;
const LOSS_PAY = 1900;
const LOSS_BONUS = 500;
const KILL_PAY = 300;
const PLANT_PAY = 300;

export function createGame(hooks) {
  const state = {
    phase: 'menu', // menu | buy | live | roundEnd | matchEnd
    round: 0,
    score: { ember: 0, ashen: 0 },
    money: 800,
    lossStreak: 0,
    timer: 0,
    bomb: { state: 'carried', site: null, plantT: 0, defuseT: 0 },
    armor: 0,
    winner: null,
    reason: '',
    kills: 0,
    deaths: 0,
  };

  function startMatch() {
    state.round = 0;
    state.score.ember = 0;
    state.score.ashen = 0;
    state.money = 800;
    state.lossStreak = 0;
    state.armor = 0;
    state.winner = null;
    state.kills = 0;
    state.deaths = 0;
    startRound();
  }

  function startRound() {
    state.round += 1;
    state.phase = 'buy';
    state.timer = BUY_TIME;
    state.bomb = { state: 'carried', site: null, plantT: 0, defuseT: 0 };
    hooks.onPhase('buy', state.round);
  }

  function beginLive() {
    state.phase = 'live';
    state.timer = ROUND_TIME;
    hooks.onPhase('live', state.round);
  }

  function endRound(winner, reason) {
    if (state.phase !== 'live') return;
    state.phase = 'roundEnd';
    state.timer = 4;
    state.winner = winner;
    state.reason = reason;
    state.score[winner] += 1;
    if (winner === 'ember') {
      state.money += WIN_PAY;
      state.lossStreak = 0;
    } else {
      state.money += LOSS_PAY + LOSS_BONUS * Math.min(state.lossStreak, 3);
      state.lossStreak += 1;
    }
    hooks.onRoundEnd(winner, reason, { ...state.score });
    hooks.onMoney(state.money);
    if (state.score[winner] >= WIN_ROUNDS || state.round >= MAX_ROUNDS) {
      state.phase = 'matchEnd';
      const matchWinner = state.score.ember > state.score.ashen ? 'ember' : 'ashen';
      hooks.onMatchEnd(matchWinner, { ...state.score });
    }
  }

  function nextAfterRoundEnd() {
    if (state.phase === 'matchEnd') return;
    startRound();
  }

  function buy(id) {
    if (state.phase !== 'buy') return false;
    if (id === 'grenade') {
      if (state.money < GRENADE_PRICE) return false;
      state.money -= GRENADE_PRICE;
      hooks.onMoney(state.money);
      return 'grenade';
    }
    if (id === 'armor') {
      if (state.money < ARMOR_PRICE || state.armor >= 100) return false;
      state.money -= ARMOR_PRICE;
      state.armor = 100;
      hooks.onMoney(state.money);
      return 'armor';
    }
    const def = WEAPONS[id];
    if (!def || state.money < def.price) return false;
    state.money -= def.price;
    hooks.onMoney(state.money);
    return id;
  }

  function addKill() {
    state.kills += 1;
    state.money += KILL_PAY;
    hooks.onMoney(state.money);
  }

  function addPlant() {
    state.money += PLANT_PAY;
    hooks.onMoney(state.money);
  }

  // The plant channel: main.js calls this while the player holds E inside a
  // site. Returns 'planted' the frame the channel completes.
  function plantTick(dt, inSite, site) {
    if (state.bomb.state !== 'carried' || state.phase !== 'live') return null;
    if (!inSite) {
      state.bomb.plantT = 0;
      return null;
    }
    state.bomb.plantT += dt;
    if (state.bomb.plantT >= PLANT_CHANNEL) {
      state.bomb.state = 'planted';
      state.bomb.site = site;
      state.bomb.plantT = 0;
      state.timer = DETONATE_TIME;
      addPlant();
      hooks.onBomb('planted', site);
      return 'planted';
    }
    return 'planting';
  }

  function detonate() {
    if (state.bomb.state !== 'planted') return;
    state.bomb.state = 'detonated';
    hooks.onBomb('detonated', state.bomb.site);
    endRound('ember', 'Charge detonated');
  }

  function defused() {
    if (state.bomb.state !== 'planted') return;
    state.bomb.state = 'defused';
    hooks.onBomb('defused', state.bomb.site);
    endRound('ashen', 'Charge defused');
  }

  // Elimination and the clock, checked by main.js after every death and tick.
  function checkElimination(emberAlive, ashenAlive) {
    if (state.phase !== 'live') return;
    if (state.bomb.state === 'planted') {
      if (ashenAlive === 0) return; // nobody left to defuse: the timer decides
      if (emberAlive === 0) return; // nobody left to guard it: the timer decides
      return;
    }
    if (ashenAlive === 0) endRound('ember', 'Enemy team eliminated');
    else if (emberAlive === 0) endRound('ashen', 'Your team was eliminated');
  }

  function tick(dt) {
    if (state.phase === 'buy') {
      state.timer -= dt;
      if (state.timer <= 0) beginLive();
    } else if (state.phase === 'live') {
      state.timer -= dt;
      if (state.bomb.state === 'planted' && state.timer <= 0) detonate();
      else if (state.bomb.state !== 'planted' && state.timer <= 0) endRound('ashen', 'Time expired — charge not planted');
    } else if (state.phase === 'roundEnd') {
      state.timer -= dt;
      if (state.timer <= 0) nextAfterRoundEnd();
    }
  }

  return {
    state,
    startMatch,
    startRound,
    beginLive,
    endRound,
    buy,
    addKill,
    plantTick,
    detonate,
    defused,
    checkElimination,
    tick,
  };
}
