// Interface + réseau. Le serveur (server.js) fait tourner le moteur de règles et envoie à chaque
// joueur sa vue filtrée ; les navigateurs n'envoient que des actions, via WebSocket.
(function () {
  'use strict';

  const app = document.getElementById('app');
  const toastEl = document.getElementById('toast');
  const ROLE_LABELS = { miner: 'Chercheur d\'or', saboteur: 'Saboteur' };
  const PEER_OPTS = { debug: 1 };

  let room = new URLSearchParams(location.search).get('room');
  let isHost = false;
  let myToken = null;
  let myName = localStorage.getItem('sabo-name') || '';
  let myAvatar = localStorage.getItem('sabo-avatar');
  if (!Sabo.AVATARS.includes(myAvatar)) myAvatar = Sabo.AVATARS[Math.floor(Math.random() * Sabo.AVATARS.length)];
  let ws = null;
  let fatal = false;
  let V = null; // vue courante
  const ZOOM_MIN = 0.5, ZOOM_MAX = 3;
  const ui = { selected: null, rot: 0, hideOverlay: false, zoom: +localStorage.getItem('sabo-zoom') || 1, panX: 0, panY: 0 };

  // --- Utilitaires ----------------------------------------------------------

  function rid(n) {
    const a = 'abcdefghijkmnpqrstuvwxyz23456789';
    let s = '';
    for (const b of crypto.getRandomValues(new Uint8Array(n))) s += a[b % a.length];
    return s;
  }
  const store = {
    get(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { sessionStorage.setItem(k, JSON.stringify(v)); },
  };
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));
  }
  function cleanName(s) { return String(s || '').trim().slice(0, 20) || 'Nain'; }
  function shareUrl() { return location.href.split('?')[0].split('#')[0] + '?room=' + room; }

  let toastTimer = null;
  function toast(msg, ms) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms || 3000);
  }

  // --- Démarrage ------------------------------------------------------------

  function boot() {
    if (location.protocol === 'file:') {
      return renderStatus('Ouvrez le jeu via le serveur : lancez « node server.js » puis allez sur http://localhost:8000');
    }
    if (!room) return renderHome();
    myToken = store.get('sabo-token-' + room);
    if (myToken) return connect();
    renderJoin();
  }

  function createRoom(name) {
    myName = cleanName(name);
    localStorage.setItem('sabo-name', myName);
    myToken = rid(16);
    connect();
  }

  function joinRoom(name) {
    myName = cleanName(name);
    localStorage.setItem('sabo-name', myName);
    myToken = rid(16);
    store.set('sabo-token-' + room, myToken);
    connect();
  }

  // --- Réseau ---------------------------------------------------------------

  function connect() {
    if (!V) renderStatus(room ? 'Connexion à la partie…' : 'Création de la partie…');
    const c = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
    ws = c;
    c.onopen = () => {
      c.send(JSON.stringify(room
        ? { type: 'join', room, name: myName, avatar: myAvatar, token: myToken }
        : { type: 'create', name: myName, avatar: myAvatar, token: myToken }));
    };
    c.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch (err) { return; }
      if (msg.type === 'joined') {
        if (!room) {
          room = msg.room;
          history.replaceState(null, '', '?room=' + room);
        }
        store.set('sabo-token-' + room, myToken);
      } else if (msg.type === 'state') {
        isHost = !!msg.host;
        onView(msg.view);
      } else if (msg.type === 'error') {
        if (msg.fatal) {
          fatal = true;
          renderStatus(msg.msg);
        } else toast(msg.msg);
      }
    };
    c.onclose = () => {
      if (ws !== c || fatal) return;
      if (V) toast('Connexion au serveur perdue, reconnexion…');
      else renderStatus('Serveur de jeu injoignable. Nouvel essai… (la page doit être ouverte via « node server.js », pas en fichier local ni via un autre serveur web)');
      setTimeout(connect, 2000);
    };
  }

  // --- Actions --------------------------------------------------------------

  function act(action) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'action', action }));
    else toast('Pas de connexion au serveur.');
  }

  function onView(v) {
    const prev = V;
    V = v;
    if (prev && prev.phase !== v.phase) ui.hideOverlay = false;
    if (prev && prev.round !== v.round) { ui.panX = 0; ui.panY = 0; }
    if (v.me && !v.me.hand.some((c) => c.id === ui.selected)) { ui.selected = null; ui.rot = 0; }
    if (prev && v.me) {
      v.goals.forEach((g, i) => {
        if (g.peeked && !prev.goals[i].peeked) {
          toast(`🗺️ Carte Arrivée ${Sabo.GOAL_NAMES[i]} : ${g.type === 'gold' ? '💰 le TRÉSOR !' : '🪨 des pierres.'}`, 5000);
        }
      });
    }
    const myTurn = v.phase === 'playing' && v.me && v.turn === v.me.index;
    document.title = (myTurn ? '▶ À vous ! – ' : '') + 'Saboteur';
    render();
  }

  // --- Rendu des cartes -----------------------------------------------------

  // Les images viennent de pixel.js (pixel art dessiné au vol).
  function ico(name) {
    return `<img class="ico" src="${Pixel.icon(name)}" alt="" draggable="false">`;
  }

  function pix(url, cls) {
    return `<img class="pix${cls ? ' ' + cls : ''}" src="${url}" alt="" draggable="false">`;
  }

  function cellImg(c) {
    if (c.kind === 'start') return pix(Pixel.start(c.edges));
    if (c.kind === 'goal') return pix(Pixel.goal(c.goal, c.edges));
    return pix(Pixel.path(c.edges, c.dead));
  }

  function handCardHtml(c) {
    const sel = ui.selected === c.id ? ' sel' : '';
    if (c.type === 'path') {
      const edges = sel && ui.rot ? Sabo.rot180(c.edges) : c.edges;
      return `<div class="hcard${sel}" data-act="select" data-card="${c.id}">${pix(Pixel.path(edges, c.dead))}</div>`;
    }
    let lbl;
    if (c.type === 'break') lbl = 'Casser';
    else if (c.type === 'repair') lbl = c.tools.length > 1 ? 'Réparer l\'un des deux' : 'Réparer';
    else if (c.type === 'map') lbl = 'Plan';
    else lbl = 'Éboulement';
    return `<div class="hcard action${sel}" data-act="select" data-card="${c.id}">${pix(Pixel.action(c))}<div class="lbl">${lbl}</div></div>`;
  }

  // --- Écrans ---------------------------------------------------------------

  function renderStatus(msg) {
    app.innerHTML = `<div class="center"><h1>Saboteur</h1><p>${esc(msg)}</p></div>`;
  }

  function dwarfImg(id) { return `<img class="dwarf" src="${Pixel.dwarf(id)}" alt="" draggable="false">`; }
  function av(p) { return `<span class="avatar">${dwarfImg(p.avatar)}</span>`; }

  function avatarPicker(current) {
    return `<div class="avatars">${Sabo.AVATARS.map((a) => `<button type="button" class="av${a === current ? ' sel' : ''}" data-act="avatar" data-avatar="${a}" title="Bonnet ${a}">${dwarfImg(a)}</button>`).join('')}</div>`;
  }

  function renderHome() {
    app.innerHTML = `<div class="center"><h1>Saboteur</h1>
      <div class="sub">Chercheurs d'or contre saboteurs — 3 à 10 joueurs en ligne</div>
      <form id="f"><input id="name" placeholder="Votre nom" maxlength="20" value="${esc(myName)}" required autofocus>
      <button>Créer une partie</button></form>
      <p class="hint">Votre avatar :</p>${avatarPicker(myAvatar)}
      <p class="hint">Vous obtiendrez un lien à envoyer à vos amis.</p></div>`;
    document.getElementById('f').onsubmit = (e) => { e.preventDefault(); createRoom(document.getElementById('name').value); };
  }

  function renderJoin() {
    app.innerHTML = `<div class="center"><h1>Saboteur</h1>
      <div class="sub">Vous êtes invité à rejoindre une partie.</div>
      <form id="f"><input id="name" placeholder="Votre nom" maxlength="20" value="${esc(myName)}" required autofocus>
      <button>Rejoindre</button></form>
      <p class="hint">Votre avatar :</p>${avatarPicker(myAvatar)}</div>`;
    document.getElementById('f').onsubmit = (e) => { e.preventDefault(); joinRoom(document.getElementById('name').value); };
  }

  function render() {
    if (!V) return;
    if (V.phase === 'lobby') return renderLobby();
    renderGame();
  }

  function renderLobby() {
    const n = V.players.length;
    const list = V.players.map((p, i) => `<li>${av(p)}<span>${esc(p.name)}${i === 0 ? ' 👑' : ''}${V.me && i === V.me.index ? ' (vous)' : ''}${p.connected ? '' : ' — déconnecté'}</span></li>`).join('');
    const hostPart = isHost
      ? `<button data-act="start" ${n < Sabo.MIN_PLAYERS ? 'disabled' : ''}>Lancer la partie (${n} joueur${n > 1 ? 's' : ''})</button>
         <p class="hint">${n < 3 ? 'La règle prévoit 3 à 10 joueurs. À 2, il y a 1 chance sur 3 qu\'il n\'y ait aucun saboteur.' : ''}</p>`
      : '<p class="hint">En attente du lancement par l\'hôte…</p>';
    app.innerHTML = `<div class="center"><h1>Saboteur</h1>
      <div class="sub">Salon d'attente</div>
      ${isHost ? `<div class="row"><input id="link" readonly value="${esc(shareUrl())}"><button data-act="copy">Copier le lien</button></div>
        <p class="hint">Envoyez ce lien à vos amis.</p>` : ''}
      <ul class="lobby-list">${list}</ul>
      ${V.me ? `<p class="hint">Votre avatar :</p>${avatarPicker(V.players[V.me.index].avatar)}` : ''}
      ${hostPart}</div>`;
  }

  function boardBounds() {
    let minX = -1, maxX = 9, minY = -3, maxY = 3;
    for (const k of Object.keys(V.board)) {
      const [x, y] = k.split(',').map(Number);
      minX = Math.min(minX, x - 1); maxX = Math.max(maxX, x + 1);
      minY = Math.min(minY, y - 1); maxY = Math.max(maxY, y + 1);
    }
    return { minX, maxX, minY, maxY };
  }

  function selectedCard() {
    return V.me && V.me.hand.find((c) => c.id === ui.selected);
  }

  function renderGame() {
    const me = V.me;
    const myTurn = V.phase === 'playing' && me && V.turn === me.index;
    const card = myTurn ? selectedCard() : null;
    const iAmBroken = me && Sabo.TOOLS.some((t) => V.players[me.index].broken[t]);
    const b = boardBounds();
    const pos = (x, y) => `grid-column:${x - b.minX + 1};grid-row:${y - b.minY + 1}`;

    // Cases cibles selon la carte sélectionnée
    let placements = [];
    if (card && card.type === 'path' && !iAmBroken) placements = Sabo.validPlacements(V.board, V.goals, card);
    const here = placements.filter((p) => p.rot === ui.rot);
    const otherRot = placements.length - here.length;

    let cells = '';
    for (const [k, c] of Object.entries(V.board)) {
      const [x, y] = k.split(',').map(Number);
      const last = V.lastMove && V.lastMove.x === x && V.lastMove.y === y ? ' last' : '';
      const rf = card && card.type === 'rockfall' && c.kind === 'path';
      cells += `<div class="cell${last}${rf ? ' target rf' : ''}" style="${pos(x, y)}"${rf ? ` data-act="rockfall" data-x="${x}" data-y="${y}" title="Faire s'effondrer"` : ''}>${cellImg(c)}</div>`;
    }
    V.goals.forEach((g, i) => {
      if (g.revealed) return;
      const mapT = card && card.type === 'map';
      cells += `<div class="cell${mapT ? ' target' : ''}" style="${pos(g.x, g.y)}"${mapT ? ` data-act="map" data-goal="${i}" title="Consulter"` : ''}>${pix(Pixel.goalBack(g.type))}</div>`;
    });
    for (const p of here) {
      const edges = ui.rot ? Sabo.rot180(card.edges) : card.edges;
      cells += `<div class="cell target" style="${pos(p.x, p.y)}" data-act="place" data-x="${p.x}" data-y="${p.y}">${pix(Pixel.path(edges, card.dead), 'ghost')}</div>`;
    }

    // Joueurs
    const players = V.players.map((p, i) => {
      const broken = Sabo.TOOLS.filter((t) => p.broken[t]).map(ico).join('');
      let targets = '';
      if (card && card.type === 'break' && !p.broken[card.tool]) {
        targets = `<button class="small" data-act="target" data-target="${i}">Casser ${ico(card.tool)}</button>`;
      } else if (card && card.type === 'repair') {
        targets = card.tools.filter((t) => p.broken[t])
          .map((t) => `<button class="small" data-act="target" data-target="${i}" data-tool="${t}">Réparer ${ico(t)}</button>`).join('');
      }
      const role = p.role ? ` · <span class="role ${p.role}">${ROLE_LABELS[p.role]}</span>` : '';
      return `<div class="player${V.phase === 'playing' && V.turn === i ? ' turn' : ''}${p.connected ? '' : ' offline'}">
        ${av(p)}<div class="pbody"><div class="pname">${V.phase === 'playing' && V.turn === i ? '▶ ' : ''}${esc(p.name)}${me && i === me.index ? ' (vous)' : ''}${p.connected ? '' : ' — déconnecté'}</div>
        <div class="pinfo">${p.handCount} carte${p.handCount > 1 ? 's' : ''}${p.gold != null ? ` · ${ico('gold')} ${p.gold}` : ''}${role}</div>
        ${broken ? `<div class="broken">Cassé : ${broken}</div>` : ''}
        ${targets ? `<div class="targets">${targets}</div>` : ''}</div></div>`;
    }).join('');

    // Consigne
    let msg;
    const cls = myTurn ? 'msg myturn' : 'msg';
    if (V.phase !== 'playing') msg = 'Manche terminée.';
    else if (!myTurn) msg = `Au tour de ${dwarfImg(V.players[V.turn].avatar)} ${esc(V.players[V.turn].name)}…`;
    else if (!card) msg = 'À vous ! Choisissez une carte.';
    else if (card.type === 'path') {
      if (iAmBroken) msg = 'Un de vos outils est cassé : vous ne pouvez pas poser de chemin. Jouez une autre carte ou défaussez.';
      else if (here.length) msg = 'Cliquez une case en pointillés pour poser le chemin.';
      else if (otherRot) msg = 'Aucune place dans ce sens : pivotez la carte.';
      else msg = 'Cette carte ne peut être posée nulle part. Défaussez-la ou choisissez-en une autre.';
    } else if (card.type === 'break') msg = 'Choisissez le joueur dont l\'outil sera cassé.';
    else if (card.type === 'repair') msg = 'Choisissez le joueur dont l\'outil sera réparé.';
    else if (card.type === 'map') msg = 'Cliquez une carte Arrivée pour la regarder en secret.';
    else msg = 'Cliquez la carte Chemin à faire s\'effondrer.';
    const buttons = myTurn && card
      ? `${card.type === 'path' ? '<button class="secondary" data-act="rotate">Pivoter ↻ (R)</button>' : ''}<button class="secondary" data-act="discard">Défausser (passer)</button>`
      : '';

    const role = me && me.role ? `<span class="role ${me.role}">Vous êtes ${ROLE_LABELS[me.role]} ${me.role === 'saboteur' ? '😈' : '⛏️'}</span>` : '';

    app.innerHTML = `<div class="game">
      <div class="topbar"><span class="title">Saboteur</span>
        <span>Manche ${V.round} / ${V.maxRounds}</span><span>Pioche : ${V.deckCount}</span><span>Défausse : ${V.discardCount}</span>
        ${role}</div>
      <div class="main">
        <div class="board-area">
          <div class="board-wrap" style="--z:${ui.zoom};--tile:url(${Pixel.tile()});${bgPos()}"><div class="board" style="transform:translate(${ui.panX}px,${ui.panY}px);grid-template-columns:repeat(${b.maxX - b.minX + 1},var(--zcw));grid-template-rows:repeat(${b.maxY - b.minY + 1},var(--zch))">${cells}</div></div>
          <div class="zoom"><button class="secondary" data-act="zoomOut" title="Dézoomer (−)">−</button><button class="secondary" data-act="zoomReset" title="Taille normale (0)">${Math.round(ui.zoom * 100)} %</button><button class="secondary" data-act="zoomIn" title="Zoomer (+)">+</button><button class="secondary" data-act="recenter" title="Recentrer le plateau (C)">⌖</button></div>
        </div>
        <div class="side"><div class="players">${players}</div>
          <div class="log">${V.log.slice().reverse().map((l) => `<div>${esc(l)}</div>`).join('')}</div></div>
      </div>
      <div class="handbar">
        <div class="instr"><span class="${cls}">${msg}</span>${buttons}</div>
        <div class="hand${myTurn ? '' : ' disabled-hand'}">${me ? me.hand.map(handCardHtml).join('') : ''}</div>
      </div></div>${renderOverlay()}`;
  }

  // Vue du plateau : centré dans sa zone, décalé de (panX, panY). On empêche de le perdre hors champ.
  function clampPan() {
    const w = document.querySelector('.board-wrap');
    const b = document.querySelector('.board');
    if (!w || !b) return;
    const mx = Math.max(0, (b.offsetWidth + w.clientWidth) / 2 - 80);
    const my = Math.max(0, (b.offsetHeight + w.clientHeight) / 2 - 80);
    ui.panX = Math.min(mx, Math.max(-mx, ui.panX));
    ui.panY = Math.min(my, Math.max(-my, ui.panY));
  }

  // Le fond suit le plateau quand on le déplace.
  function bgPos() {
    return `background-position:calc(50% + ${ui.panX}px) calc(50% + ${ui.panY}px)`;
  }

  function applyPan() {
    clampPan();
    const b = document.querySelector('.board');
    if (b) b.style.transform = `translate(${ui.panX}px,${ui.panY}px)`;
    const w = document.querySelector('.board-wrap');
    if (w) w.style.backgroundPosition = `calc(50% + ${ui.panX}px) calc(50% + ${ui.panY}px)`;
  }

  // Zoom en gardant le même point au centre de la vue : le décalage grandit dans la même proportion.
  function setZoom(z) {
    z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));
    if (z === ui.zoom || !V || V.phase === 'lobby') return;
    ui.panX *= z / ui.zoom;
    ui.panY *= z / ui.zoom;
    ui.zoom = z;
    localStorage.setItem('sabo-zoom', z);
    render();
    applyPan();
  }

  function recenter() {
    ui.panX = 0;
    ui.panY = 0;
    applyPan();
  }

  function renderOverlay() {
    if ((V.phase !== 'roundEnd' && V.phase !== 'gameOver') || ui.hideOverlay) {
      return V.phase === 'roundEnd' || V.phase === 'gameOver'
        ? '<div style="position:fixed;right:16px;bottom:16px;z-index:5"><button data-act="showOverlay">Voir le résultat</button></div>' : '';
    }
    const rr = V.roundResult;
    const over = V.phase === 'gameOver';
    let title = rr.minersWin ? `💰 ${esc(V.players[rr.finder].name)} a trouvé le trésor ! Les chercheurs d'or gagnent la manche.` : '😈 Le trésor n\'a pas été atteint : les saboteurs gagnent la manche.';
    let rows = V.players.map((p, i) => `<tr><td>${dwarfImg(p.avatar)} ${esc(p.name)}</td><td class="role ${p.role}">${ROLE_LABELS[p.role]}</td>
      <td>${rr.gains[i] == null ? '?' : '+' + rr.gains[i]}</td>${over ? `<td><b>${p.gold}</b></td>` : ''}</tr>`).join('');
    let extra = '';
    if (over) {
      const best = Math.max(...V.players.map((p) => p.gold));
      const winners = V.players.filter((p) => p.gold === best).map((p) => esc(p.name));
      extra = `<p>🏆 <b>${winners.join(' et ')}</b> remporte${winners.length > 1 ? 'nt' : ''} la partie avec ${best} pépite${best > 1 ? 's' : ''} !</p>`;
    } else {
      extra = `<p class="hint">Vos pépites : ${V.me ? V.me.gold : 0} (l'or des autres reste secret jusqu'à la fin).</p>`;
    }
    const next = isHost
      ? `<button data-act="${over ? 'restart' : 'nextRound'}">${over ? 'Nouvelle partie' : 'Manche suivante'}</button>`
      : '<span class="hint">En attente de l\'hôte…</span>';
    return `<div class="overlay"><div class="modal"><h2>${over ? 'Fin de la partie' : `Fin de la manche ${V.round}`}</h2>
      <p>${title}</p>
      <table><tr><th>Joueur</th><th>Rôle</th><th>Gain</th>${over ? '<th>Total</th>' : ''}</tr>${rows}</table>${extra}
      <div class="actions"><button class="secondary" data-act="hideOverlay">Voir le plateau</button>${next}</div></div></div>`;
  }

  // --- Événements -----------------------------------------------------------

  app.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const d = el.dataset;
    const card = V && selectedCard();
    switch (d.act) {
      case 'copy':
        navigator.clipboard.writeText(shareUrl()).then(() => toast('Lien copié !'), () => {
          document.getElementById('link').select();
          toast('Copiez le lien avec Ctrl+C');
        });
        return;
      case 'start': return act({ type: 'start' });
      case 'nextRound': return act({ type: 'nextRound' });
      case 'restart': return act({ type: 'restart' });
      case 'hideOverlay': ui.hideOverlay = true; return render();
      case 'showOverlay': ui.hideOverlay = false; return render();
      case 'select':
        if (ui.selected === d.card) ui.selected = null;
        else { ui.selected = d.card; ui.rot = 0; }
        return render();
      case 'rotate': ui.rot ^= 1; return render();
      case 'zoomIn': return setZoom(ui.zoom * 1.25);
      case 'zoomOut': return setZoom(ui.zoom / 1.25);
      case 'zoomReset': return setZoom(1);
      case 'recenter': return recenter();
      case 'avatar':
        myAvatar = d.avatar;
        localStorage.setItem('sabo-avatar', myAvatar);
        if (V) return act({ type: 'setAvatar', avatar: myAvatar });
        document.querySelectorAll('.av').forEach((b) => b.classList.toggle('sel', b.dataset.avatar === myAvatar));
        return;
      case 'discard': return card && act({ type: 'discard', cardId: card.id });
      case 'place': return card && act({ type: 'play', cardId: card.id, x: +d.x, y: +d.y, rot: ui.rot });
      case 'rockfall': return card && act({ type: 'play', cardId: card.id, x: +d.x, y: +d.y });
      case 'map': return card && act({ type: 'play', cardId: card.id, goal: +d.goal });
      case 'target': return card && act({ type: 'play', cardId: card.id, target: +d.target, tool: d.tool });
    }
  });

  // Glisser sur le plateau (souris ou doigt) : déplace la vue. Un simple clic reste un clic (pose de carte…).
  let drag = null;
  app.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary || e.button !== 0 || !e.target.closest('.board-wrap') || e.target.closest('.zoom')) return;
    drag = { x: e.clientX, y: e.clientY, panX: ui.panX, panY: ui.panY, moved: false };
  });
  document.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 5) return;
    if (!drag.moved) {
      drag.moved = true;
      document.body.classList.add('panning');
    }
    ui.panX = drag.panX + dx;
    ui.panY = drag.panY + dy;
    applyPan(); // retrouve le plateau même s'il a été redessiné entre-temps
    e.preventDefault();
  });
  document.addEventListener('pointerup', () => {
    if (drag && drag.moved) {
      // Le clic qui suit la fin du glissement ne doit pas jouer de carte.
      const swallow = (e) => { e.stopPropagation(); e.preventDefault(); };
      document.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => {
        document.removeEventListener('click', swallow, { capture: true });
        document.body.classList.remove('panning');
      }, 0);
    }
    drag = null;
  });

  // Molette sur le plateau : déplace la vue ; Ctrl + molette (ou pincement sur pavé tactile) : zoom.
  app.addEventListener('wheel', (e) => {
    if (!e.target.closest('.board-wrap')) return;
    e.preventDefault();
    if (e.ctrlKey) return setZoom(ui.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
    ui.panX -= e.shiftKey ? e.deltaY : e.deltaX;
    ui.panY -= e.shiftKey ? 0 : e.deltaY;
    applyPan();
  }, { passive: false });

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (!e.ctrlKey && !e.metaKey) {
      if (e.key === '+' || e.key === '=') return setZoom(ui.zoom * 1.25);
      if (e.key === '-') return setZoom(ui.zoom / 1.25);
      if (e.key === '0') return setZoom(1);
      if ((e.key === 'c' || e.key === 'C') && V && V.phase !== 'lobby') return recenter();
    }
    if ((e.key === 'r' || e.key === 'R') && V && selectedCard() && selectedCard().type === 'path') {
      ui.rot ^= 1;
      render();
    }
  });

  boot();
})();
