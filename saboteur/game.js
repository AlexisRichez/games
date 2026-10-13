// Moteur de règles Saboteur — pur JS, sans DOM. Utilisable dans le navigateur (window.Sabo) et dans Node (require).
(function (root) {
  'use strict';

  const N = 1, E = 2, S = 4, W = 8;
  const DIRS = [
    { bit: N, dx: 0, dy: -1, opp: S },
    { bit: E, dx: 1, dy: 0, opp: W },
    { bit: S, dx: 0, dy: 1, opp: N },
    { bit: W, dx: -1, dy: 0, opp: E },
  ];
  const TOOLS = ['pick', 'lantern', 'cart'];
  const MIN_PLAYERS = 2; // 2 = variante non officielle, la règle prévoit 3 à 10
  const MAX_PLAYERS = 10;
  const MAX_ROUNDS = 3;

  // [saboteurs, chercheurs d'or] mis en jeu selon le nombre de joueurs (une carte Nain est écartée)
  const ROLE_TABLE = {
    2: [1, 2], 3: [1, 3], 4: [1, 4], 5: [2, 4], 6: [2, 5],
    7: [3, 5], 8: [3, 6], 9: [3, 7], 10: [4, 7],
  };

  // 40 cartes Chemin de la pioche : [ouvertures, cul-de-sac, nombre]
  const PATH_SPEC = [
    [N | E | S | W, false, 5],
    [N | E | S, false, 5],
    [E | S | W, false, 5],
    [N | S, false, 4],
    [E | W, false, 3],
    [E | S, false, 4],
    [S | W, false, 5],
    [N | E | S | W, true, 1],
    [N | E | S, true, 1],
    [E | S | W, true, 1],
    [N | S, true, 1],
    [E | W, true, 1],
    [E | S, true, 1],
    [S | W, true, 1],
    [S, true, 1],
    [E, true, 1],
  ];

  const GOAL_EDGES = { gold: N | E | S | W, coalA: N | W, coalB: S | W };
  const GOAL_POS = [[8, -2], [8, 0], [8, 2]];
  const GOAL_NAMES = ['du haut', 'du milieu', 'du bas'];
  const TOOL_NAMES = { pick: 'la pioche', lantern: 'la lanterne', cart: 'le wagonnet' };
  // Avatars : nains à bonnet de couleur (dessinés par pixel.js), identifiés par la couleur du bonnet.
  const AVATARS = ['rouge', 'bleu', 'vert', 'jaune', 'violet', 'orange', 'turquoise', 'rose', 'gris', 'noir', 'blanc', 'marron'];

  function rot180(e) {
    return ((e & N) ? S : 0) | ((e & S) ? N : 0) | ((e & E) ? W : 0) | ((e & W) ? E : 0);
  }

  function key(x, y) { return x + ',' + y; }
  function parseKey(k) { return k.split(',').map(Number); }

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function handSize(n) { return n <= 5 ? 6 : n <= 7 ? 5 : 4; }

  function buildDeck() {
    const cards = [];
    let i = 0;
    const add = (c) => cards.push(Object.assign({ id: 'c' + (i++) }, c));
    for (const [edges, dead, count] of PATH_SPEC) {
      for (let k = 0; k < count; k++) add({ type: 'path', edges, dead });
    }
    for (const tool of TOOLS) {
      for (let k = 0; k < 3; k++) add({ type: 'break', tool });
      for (let k = 0; k < 2; k++) add({ type: 'repair', tools: [tool] });
    }
    for (const pair of [['pick', 'lantern'], ['pick', 'cart'], ['lantern', 'cart']]) add({ type: 'repair', tools: pair });
    for (let k = 0; k < 6; k++) add({ type: 'map' });
    for (let k = 0; k < 3; k++) add({ type: 'rockfall' });
    return cards;
  }

  function buildGoldDeck() {
    return shuffle([].concat(Array(16).fill(1), Array(8).fill(2), Array(4).fill(3)));
  }

  // --- Plateau --------------------------------------------------------------

  // Cases atteintes depuis la carte de départ en suivant des galeries continues (les culs-de-sac bloquent).
  function reachable(board) {
    const seen = new Set(['0,0']);
    const queue = [[0, 0]];
    while (queue.length) {
      const [x, y] = queue.shift();
      const c = board[key(x, y)];
      for (const d of DIRS) {
        if (!(c.edges & d.bit)) continue;
        const nk = key(x + d.dx, y + d.dy);
        const n = board[nk];
        if (!n || n.dead || seen.has(nk) || !(n.edges & d.opp)) continue;
        seen.add(nk);
        queue.push([x + d.dx, y + d.dy]);
      }
    }
    return seen;
  }

  function isGoalPos(goals, x, y) {
    return goals.some((g) => g.x === x && g.y === y);
  }

  function canPlaceEdges(board, goals, edges, x, y, reach) {
    if (board[key(x, y)] || isGoalPos(goals, x, y)) return false;
    let linked = false;
    for (const d of DIRS) {
      const nk = key(x + d.dx, y + d.dy);
      const n = board[nk];
      if (!n) continue; // les cartes Arrivée face cachée n'imposent rien
      const mine = !!(edges & d.bit);
      const theirs = !!(n.edges & d.opp);
      if (mine !== theirs) return false;
      if (mine && !n.dead && reach.has(nk)) linked = true;
    }
    return linked;
  }

  // Toutes les poses possibles {x, y, rot} d'une carte Chemin.
  function validPlacements(board, goals, card) {
    const reach = reachable(board);
    const cands = new Set();
    for (const k of reach) {
      const [x, y] = parseKey(k);
      const c = board[k];
      for (const d of DIRS) {
        if (c.edges & d.bit) cands.add(key(x + d.dx, y + d.dy));
      }
    }
    const out = [];
    for (const k of cands) {
      const [x, y] = parseKey(k);
      for (const rot of [0, 1]) {
        const edges = rot ? rot180(card.edges) : card.edges;
        if (canPlaceEdges(board, goals, edges, x, y, reach)) out.push({ x, y, rot });
      }
    }
    return out;
  }

  // Retourne les cartes Arrivée atteintes par un chemin continu depuis le départ.
  function revealGoals(state) {
    const out = [];
    let changed = true;
    while (changed) {
      changed = false;
      const reach = reachable(state.board);
      for (const g of state.goals) {
        if (g.revealed) continue;
        for (const d of DIRS) {
          const nk = key(g.x + d.dx, g.y + d.dy);
          const n = state.board[nk];
          if (!n || n.dead || !reach.has(nk) || !(n.edges & d.opp)) continue;
          // La carte retournée est orientée pour se connecter à la carte qui l'a atteinte.
          let edges = GOAL_EDGES[g.type];
          if (!(edges & d.bit)) edges = rot180(edges);
          g.revealed = true;
          state.board[key(g.x, g.y)] = { kind: 'goal', goal: g.type, edges, dead: false };
          out.push(g);
          changed = true;
          break;
        }
        if (changed) break;
      }
    }
    return out;
  }

  // --- Partie ---------------------------------------------------------------

  function createGame() {
    return {
      phase: 'lobby', // lobby | playing | roundEnd | gameOver
      players: [],
      nextId: 1,
      round: 0,
      turn: 0,
      deck: [],
      discardCount: 0,
      goldDeck: [],
      board: {},
      goals: [],
      lastPlayer: 0,
      lastMove: null,
      roundResult: null,
      log: [],
    };
  }

  function log(state, msg) {
    state.log.push(msg);
    if (state.log.length > 200) state.log.splice(0, state.log.length - 200);
  }

  function addPlayer(state, name, token, avatar) {
    if (state.phase !== 'lobby') return 'La partie a déjà commencé.';
    if (state.players.length >= MAX_PLAYERS) return 'La partie est complète (10 joueurs).';
    state.players.push({
      id: 'p' + (state.nextId++), token, name, connected: true,
      avatar: AVATARS.includes(avatar) ? avatar : AVATARS[0],
      role: null, hand: [], broken: {}, known: {}, gold: 0,
    });
    return null;
  }

  function removePlayer(state, token) {
    if (state.phase !== 'lobby') return;
    state.players = state.players.filter((p) => p.token !== token);
  }

  const BOT_NAMES = ['Gimli', 'Balin', 'Dwalin', 'Thorin', 'Bombur', 'Kili', 'Fili', 'Oin', 'Gloin', 'Dori'];

  function addBot(state) {
    const used = new Set(state.players.map((p) => p.name));
    const name = '🤖 ' + (BOT_NAMES.find((b) => !used.has('🤖 ' + b)) || 'Bot');
    const err = addPlayer(state, name, 'bot-' + state.nextId);
    if (!err) Object.assign(state.players[state.players.length - 1], { bot: true, avatar: 'gris' });
    return err;
  }

  // --- Bots -----------------------------------------------------------------
  // Le bot ne lit que ce qu'un joueur humain sait : son rôle, sa main, ses cartes Plan, le plateau visible.

  function botAction(state, idx) {
    const p = state.players[idx];
    const isSab = p.role === 'saboteur';
    const iAmBroken = TOOLS.some((t) => p.broken[t]);
    const rnd = Math.random;

    // Cartes Arrivée visées : le trésor s'il est connu, sinon celles qui ne sont pas connues comme pierres.
    const hidden = state.goals.map((g, i) => ({ g, i })).filter((o) => !o.g.revealed);
    const goldKnown = hidden.find((o) => p.known[o.i] === 'gold');
    let targets = goldKnown ? [goldKnown] : hidden.filter((o) => p.known[o.i] === undefined);
    if (!targets.length) targets = hidden;
    targets = targets.map((o) => o.g);
    const dist = (x, y) => (targets.length ? Math.min(...targets.map((g) => Math.abs(g.x - x) + Math.abs(g.y - y))) : 0);
    const isTarget = (x, y) => targets.some((g) => g.x === x && g.y === y);

    // Distance restante entre les sorties ouvertes d'une case et l'objectif.
    const exitDist = (board, x, y, edges) => {
      let best = 99;
      for (const d of DIRS) {
        if (!(edges & d.bit)) continue;
        const nx = x + d.dx, ny = y + d.dy;
        if (isTarget(nx, ny)) return 0;
        if (!board[key(nx, ny)] && !isGoalPos(state.goals, nx, ny)) best = Math.min(best, dist(nx, ny));
      }
      return best;
    };
    const reach = reachable(state.board);
    let frontier = 99;
    for (const k of reach) {
      const [x, y] = parseKey(k);
      frontier = Math.min(frontier, exitDist(state.board, x, y, state.board[k].edges));
    }

    const moves = [];
    for (const card of p.hand) {
      if (card.type === 'path' && !iAmBroken) {
        for (const pl of validPlacements(state.board, state.goals, card)) {
          const edges = pl.rot ? rot180(card.edges) : card.edges;
          const a = { type: 'play', cardId: card.id, x: pl.x, y: pl.y, rot: pl.rot };
          if (card.dead) {
            const near = Math.max(0, 6 - dist(pl.x, pl.y));
            moves.push({ a, score: isSab ? 4 + near + rnd() : -5 });
          } else {
            const d = exitDist(state.board, pl.x, pl.y, edges);
            const gain = frontier - d;
            moves.push({ a, score: isSab ? (gain < 0 ? 2 + rnd() : -1 - gain) : 4 + gain * 3 + rnd() });
          }
        }
      } else if (card.type === 'break') {
        state.players.forEach((t, i) => {
          if (t.broken[card.tool] || i === idx) return;
          moves.push({ a: { type: 'play', cardId: card.id, target: i }, score: isSab ? 5 + rnd() * 3 : 0.5 + rnd() });
        });
      } else if (card.type === 'repair') {
        state.players.forEach((t, i) => {
          for (const tool of card.tools) {
            if (!t.broken[tool]) continue;
            const score = i === idx ? 12 : isSab ? 0.3 : 5 + rnd() * 2;
            moves.push({ a: { type: 'play', cardId: card.id, target: i, tool }, score });
          }
        });
      } else if (card.type === 'map') {
        const unknown = hidden.filter((o) => p.known[o.i] === undefined);
        if (!goldKnown && unknown.length > 1) {
          const pick = unknown.find((o) => o.i === 1) || unknown[0];
          moves.push({ a: { type: 'play', cardId: card.id, goal: pick.i }, score: isSab ? 3 : 7 });
        }
      } else if (card.type === 'rockfall') {
        for (const [k, c] of Object.entries(state.board)) {
          if (c.kind !== 'path') continue;
          const [x, y] = parseKey(k);
          const a = { type: 'play', cardId: card.id, x, y };
          if (isSab && reach.has(k)) {
            // Couper le chemin le plus avancé quand il devient menaçant.
            moves.push({ a, score: (frontier <= 4 ? 9 : 1) + Math.max(0, 6 - dist(x, y)) / 2 + rnd() });
          } else if (!isSab && c.dead && dist(x, y) <= 3) {
            moves.push({ a, score: 5 + rnd() });
          }
        }
      }
    }

    moves.sort((m1, m2) => m2.score - m1.score);
    if (moves.length && moves[0].score >= 1) return moves[0].a;

    // Rien d'utile : on défausse la carte la moins intéressante pour son camp.
    const useless = (c) => {
      if (isSab) return c.type === 'repair' ? 3 : c.type === 'path' && !c.dead ? 2 : c.type === 'map' ? 1 : 0;
      return c.type === 'path' && c.dead ? 3 : c.type === 'break' ? 2 : c.type === 'rockfall' ? 1 : 0;
    };
    const worst = p.hand.slice().sort((c1, c2) => useless(c2) - useless(c1))[0];
    return { type: 'discard', cardId: worst.id };
  }

  function startGame(state) {
    state.round = 0;
    state.goldDeck = buildGoldDeck();
    state.players.forEach((p) => { p.gold = 0; });
    state.log = [];
    startRound(state, Math.floor(Math.random() * state.players.length));
  }

  function startRound(state, first) {
    state.round++;
    const n = state.players.length;
    const [sab, miners] = ROLE_TABLE[n];
    const roles = shuffle([].concat(Array(sab).fill('saboteur'), Array(miners).fill('miner')));
    state.deck = shuffle(buildDeck());
    const hs = handSize(n);
    state.players.forEach((p, i) => {
      p.role = roles[i];
      p.broken = {};
      p.known = {};
      p.hand = state.deck.splice(0, hs);
    });
    state.board = { '0,0': { kind: 'start', edges: N | E | S | W, dead: false } };
    const types = shuffle(['gold', 'coalA', 'coalB']);
    state.goals = GOAL_POS.map(([x, y], i) => ({ x, y, type: types[i], revealed: false }));
    state.discardCount = 0;
    state.turn = first;
    state.lastPlayer = first;
    state.lastMove = null;
    state.roundResult = null;
    state.phase = 'playing';
    log(state, `— Manche ${state.round} / ${MAX_ROUNDS} — ${state.players[first].name} commence.`);
  }

  function endTurn(state, idx) {
    const p = state.players[idx];
    if (state.deck.length) p.hand.push(state.deck.pop());
    state.lastPlayer = idx;
    if (state.players.every((q) => q.hand.length === 0)) {
      log(state, 'Plus aucune carte en main : le trésor n\'a pas été atteint.');
      endRound(state, false, null);
      return;
    }
    const n = state.players.length;
    let next = idx;
    do { next = (next + 1) % n; } while (state.players[next].hand.length === 0);
    state.turn = next;
  }

  function endRound(state, minersWin, finder) {
    const players = state.players;
    const n = players.length;
    const gains = players.map(() => 0);
    if (minersWin) {
      // Le partage tourne dans le sens inverse des aiguilles d'une montre, entre chercheurs d'or uniquement.
      const prevMiner = (i) => {
        let j = i;
        do { j = (j - 1 + n) % n; } while (players[j].role !== 'miner');
        return j;
      };
      const drawn = state.goldDeck.splice(0, Math.min(n, 9)).sort((a, b) => b - a);
      let cur = players[finder].role === 'miner' ? finder : prevMiner(finder);
      for (const v of drawn) {
        gains[cur] += v;
        cur = prevMiner(cur);
      }
    } else {
      const sabs = players.map((p, i) => (p.role === 'saboteur' ? i : -1)).filter((i) => i >= 0);
      const per = [0, 4, 3, 3, 2][sabs.length] || 0;
      sabs.forEach((i) => { gains[i] += per; });
    }
    players.forEach((p, i) => { p.gold += gains[i]; });
    state.roundResult = { minersWin, finder, gains };
    state.phase = state.round >= MAX_ROUNDS ? 'gameOver' : 'roundEnd';
    log(state, minersWin ? 'Les chercheurs d\'or remportent la manche !' : 'Les saboteurs remportent la manche !');
  }

  // Applique l'action d'un joueur. Renvoie null si OK, sinon un message d'erreur.
  function applyAction(state, token, a) {
    const idx = state.players.findIndex((p) => p.token === token);
    if (idx < 0) return 'Joueur inconnu.';
    const p = state.players[idx];
    const n = state.players.length;

    if (a.type === 'start') {
      if (idx !== 0) return 'Seul l\'hôte peut lancer la partie.';
      if (state.phase !== 'lobby') return 'La partie a déjà commencé.';
      if (n < MIN_PLAYERS) return `Il faut au moins ${MIN_PLAYERS} joueurs.`;
      startGame(state);
      return null;
    }
    if (a.type === 'setAvatar') {
      if (!AVATARS.includes(a.avatar)) return 'Avatar inconnu.';
      p.avatar = a.avatar;
      return null;
    }
    if (a.type === 'addBot' || a.type === 'removeBot') {
      if (idx !== 0) return 'Seul l\'hôte peut gérer les bots.';
      if (state.phase !== 'lobby') return 'La partie a déjà commencé.';
      if (a.type === 'addBot') return addBot(state);
      const bot = state.players.slice().reverse().find((q) => q.bot);
      if (bot) removePlayer(state, bot.token);
      return null;
    }
    if (a.type === 'nextRound') {
      if (idx !== 0) return 'Seul l\'hôte peut lancer la manche suivante.';
      if (state.phase !== 'roundEnd') return 'La manche n\'est pas terminée.';
      startRound(state, (state.lastPlayer + 1) % n);
      return null;
    }
    if (a.type === 'restart') {
      if (idx !== 0) return 'Seul l\'hôte peut relancer une partie.';
      if (state.phase !== 'gameOver') return 'La partie n\'est pas terminée.';
      startGame(state);
      return null;
    }

    if (state.phase !== 'playing') return 'Aucune manche en cours.';
    if (state.turn !== idx) return 'Ce n\'est pas votre tour.';
    const ci = p.hand.findIndex((c) => c.id === a.cardId);
    if (ci < 0) return 'Carte introuvable.';
    const card = p.hand[ci];

    if (a.type === 'discard') {
      p.hand.splice(ci, 1);
      state.discardCount++;
      log(state, `${p.name} passe et défausse une carte.`);
      endTurn(state, idx);
      return null;
    }
    if (a.type !== 'play') return 'Action inconnue.';

    if (card.type === 'path') {
      if (TOOLS.some((t) => p.broken[t])) return 'Un de vos outils est cassé : impossible de poser un chemin.';
      const x = a.x | 0, y = a.y | 0, rot = a.rot ? 1 : 0;
      const edges = rot ? rot180(card.edges) : card.edges;
      if (!canPlaceEdges(state.board, state.goals, edges, x, y, reachable(state.board))) return 'Impossible de poser ce chemin ici.';
      p.hand.splice(ci, 1);
      state.board[key(x, y)] = { kind: 'path', edges, dead: card.dead };
      state.lastMove = { x, y };
      log(state, `${p.name} pose un chemin.`);
      const revealed = revealGoals(state);
      for (const g of revealed) {
        log(state, g.type === 'gold'
          ? `💰 ${p.name} atteint la carte Arrivée ${GOAL_NAMES[state.goals.indexOf(g)]} : c'est le TRÉSOR !`
          : `🪨 La carte Arrivée ${GOAL_NAMES[state.goals.indexOf(g)]} est atteinte : des pierres…`);
      }
      if (revealed.some((g) => g.type === 'gold')) {
        state.lastPlayer = idx;
        endRound(state, true, idx);
        return null;
      }
    } else if (card.type === 'break' || card.type === 'repair') {
      const t = state.players[a.target];
      if (!t) return 'Joueur cible invalide.';
      if (card.type === 'break') {
        if (t.broken[card.tool]) return `${t.name} a déjà ${TOOL_NAMES[card.tool]} cassé(e).`;
        p.hand.splice(ci, 1);
        t.broken[card.tool] = true;
        log(state, `${p.name} casse ${TOOL_NAMES[card.tool]} de ${t === p ? 'lui-même' : t.name}.`);
      } else {
        if (!card.tools.includes(a.tool)) return 'Cette carte ne répare pas cet outil.';
        if (!t.broken[a.tool]) return `${t.name} n'a pas ${TOOL_NAMES[a.tool]} cassé(e).`;
        p.hand.splice(ci, 1);
        delete t.broken[a.tool];
        state.discardCount += 2;
        log(state, `${p.name} répare ${TOOL_NAMES[a.tool]} de ${t === p ? 'lui-même' : t.name}.`);
      }
    } else if (card.type === 'map') {
      const g = state.goals[a.goal];
      if (!g || g.revealed) return 'Choisissez une carte Arrivée encore cachée.';
      p.hand.splice(ci, 1);
      p.known[a.goal] = g.type;
      state.discardCount++;
      log(state, `${p.name} consulte secrètement la carte Arrivée ${GOAL_NAMES[a.goal]}.`);
    } else if (card.type === 'rockfall') {
      const k = key(a.x | 0, a.y | 0);
      const cell = state.board[k];
      if (!cell || cell.kind !== 'path') return 'Choisissez une carte Chemin du labyrinthe (ni départ, ni arrivée).';
      p.hand.splice(ci, 1);
      delete state.board[k];
      state.discardCount += 2;
      state.lastMove = null;
      log(state, `${p.name} provoque un éboulement.`);
    } else {
      return 'Carte inconnue.';
    }

    endTurn(state, idx);
    return null;
  }

  // Vue filtrée de l'état pour un joueur : pas de mains adverses, rôles et or cachés.
  function view(state, token) {
    const meIdx = state.players.findIndex((p) => p.token === token);
    const me = state.players[meIdx];
    const roundOver = state.phase === 'roundEnd' || state.phase === 'gameOver';
    const gameOver = state.phase === 'gameOver';
    const rr = state.roundResult;
    return {
      phase: state.phase,
      round: state.round,
      maxRounds: MAX_ROUNDS,
      turn: state.turn,
      deckCount: state.deck.length,
      discardCount: state.discardCount,
      board: state.board,
      lastMove: state.lastMove,
      goals: state.goals.map((g, i) => {
        const known = me && me.known[i];
        return {
          x: g.x, y: g.y, revealed: g.revealed,
          type: (g.revealed || roundOver || known) ? g.type : null,
          peeked: !!known && !g.revealed,
        };
      }),
      players: state.players.map((p, i) => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        connected: p.connected,
        bot: !!p.bot,
        handCount: p.hand.length,
        broken: Object.assign({}, p.broken),
        role: (i === meIdx || roundOver) ? p.role : null,
        gold: (i === meIdx || gameOver) ? p.gold : null,
      })),
      me: me ? { index: meIdx, id: me.id, hand: me.hand, role: me.role, gold: me.gold } : null,
      roundResult: rr && {
        minersWin: rr.minersWin,
        finder: rr.finder,
        gains: rr.gains.map((g, i) => (i === meIdx || gameOver ? g : null)),
      },
      log: state.log.slice(-60),
    };
  }

  const api = {
    N, E, S, W, DIRS, TOOLS, MIN_PLAYERS, MAX_PLAYERS, MAX_ROUNDS, GOAL_NAMES, TOOL_NAMES, AVATARS, PATH_SPEC, GOAL_EDGES,
    rot180, key, createGame, addPlayer, removePlayer, applyAction, view, validPlacements, reachable, botAction,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Sabo = api;
})(this);
