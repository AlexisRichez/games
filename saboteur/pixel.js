// Images des cartes en pixel art, dessinées au vol dans un canvas (aucun fichier image).
// Cartes Chemin : 20 × 28 pixels ; cartes Action : 40 × 56. Le navigateur les agrandit sans lissage.
(function (root) {
  'use strict';

  const N = 1, E = 2, S = 4, W = 8;
  const PW = 20, PH = 28; // cartes Chemin
  const AW = 40, AH = 56; // cartes Action

  const PAL = {
    k: '#1a120d', h: '#120c09',
    w: '#8a5a2b', W: '#b07a40', d: '#5e3a1a',
    s: '#d0d6dc', S: '#8e99a3', z: '#56606a',
    y: '#fff3a0', Y: '#f7d046', o: '#c88a1a',
    r: '#e04a3a', R: '#8f2420', g: '#6ad46a', G: '#2f8f3a',
    p: '#f1e3c0', P: '#c9b48a', f: '#ff9a2e', F: '#ffe066',
    e: '#ffffff', i: '#3a7bd5', l: '#ffe9a6',
    c: '#b5aca2', C: '#8a8077', x: '#5a524b',
  };
  // Teintes inspirées des cartes originales : dalles de pierre gris-bleu, galeries crème clair.
  const SLABS = ['#7f8d9b', '#748391', '#8996a3'];
  const SLAB_DARK = '#6a7886', SLAB_LIGHT = '#97a4b0';
  const CRACK = '#4a5562';
  const ROCK_EDGE = '#39424b';
  const FLOOR = { light: '#fbf1e2', base: '#f0e0c8', dark: '#d6c1a2' };
  const STONES = [['#bcc8d2', '#8e9cab', '#586573'], ['#a9b6c2', '#7f8d9c', '#4c5865']];
  const MORTAR = '#2c333b';

  // --- Sprites (un caractère = un pixel, '.' = transparent) -------------------

  const SPRITES = {
    pick: [
      '................',
      '.....kkkkkk.....',
      '...kkssssssk....',
      '..ksSSSSSSssk...',
      '.kSzkkkkkwkSsk..',
      '.kzk....kWdkSzk.',
      '.kk....kWdk.kzk.',
      '......kWdk...kk.',
      '.....kWdk.......',
      '....kWdk........',
      '...kWdk.........',
      '..kWdk..........',
      '.kWdk...........',
      '.kdk............',
      '..k.............',
      '................',
    ],
    lantern: [
      '......kkkk......',
      '.....k....k.....',
      '.....k....k.....',
      '....kkkkkkkk....',
      '...kSSssssSSk...',
      '...kkkkkkkkkk...',
      '...kSllFFllSk...',
      '...kSlFFFFlSk...',
      '...kSlFffFlSk...',
      '...kSllffllSk...',
      '...kSllllllSk...',
      '...kkkkkkkkkk...',
      '...kSSssssSSk...',
      '....kkkkkkkk....',
      '................',
      '................',
    ],
    cart: [
      '................',
      '......yY..y.....',
      '....oYYYoYYyo...',
      '.kkkkkkkkkkkkkk.',
      '.kWWWWWWWWWWWWk.',
      '.kwwwwwwwwwwwwk.',
      '..kddddddddddk..',
      '..kwwwwwwwwwwk..',
      '..kWWWWWWWWWWk..',
      '...kddddddddk...',
      '...kkkkkkkkkk...',
      '...kzSk..kzSk...',
      '...kSzk..kSzk...',
      '....kk....kk....',
      '..kkkkkkkkkkkk..',
      '................',
    ],
    map: [
      '................',
      '................',
      '.kkkkkkkkkkkkkk.',
      '.kpppppppppppPk.',
      '.kppppppppprprk.',
      '.kpppppppppprPk.',
      '.kppppppppwrprk.',
      '.kpppppppwppPPk.',
      '.kppppwwwpppPPk.',
      '.kpppwpppppppPk.',
      '.kppwppppppppPk.',
      '.kpwpppppppppPk.',
      '.kPPPPPPPPPPPPk.',
      '.kkkkkkkkkkkkkk.',
      '................',
      '................',
    ],
    dynamite: [
      '.........F......',
      '........FfF.....',
      '.........f......',
      '........k.......',
      '....kkkkkkkkkk..',
      '....krRkrRkrRk..',
      '....krRkrRkrRk..',
      '....krRkrRkrRk..',
      '....kddkddkddk..',
      '....krRkrRkrRk..',
      '....krRkrRkrRk..',
      '....krRkrRkrRk..',
      '....krRkrRkrRk..',
      '....kkkkkkkkkk..',
      '................',
      '................',
    ],
    cross: [
      'kk....kk',
      'krk..krk',
      '.krkkrk.',
      '..krrk..',
      '..krrk..',
      '.krkkrk.',
      'krk..krk',
      'kk....kk',
    ],
    check: [
      '........',
      '......kk',
      '.....kgk',
      'kk..kgGk',
      'kgkkgGk.',
      '.kgggk..',
      '..kGk...',
      '...k....',
    ],
    ladder: [
      'kWkhhkWk',
      'kWWWWWWk',
      'kWkhhkWk',
      'kWkhhkWk',
      'kWWWWWWk',
      'kWkhhkWk',
      'kWkhhkWk',
      'kWWWWWWk',
      'kWkhhkWk',
      'kWkhhkWk',
    ],
    gold: [
      '....kkkk....',
      '...kyYYok...',
      '..kyYYYYok..',
      '.kkkYYYokkk.',
      'kyYokkkyYYok',
      'kYYYokyYYYok',
      'kooookoooook',
      '.kkkk.kkkkk.',
    ],
    stone: [
      '...kkkk...',
      '.kkcccCk..',
      'kcccCCCCk.',
      'kcCCCCCxk.',
      'kCCCCxxxxk',
      'kCCxxxxxxk',
      '.kxxxxxkk.',
      '..kkkkk...',
    ],
    question: [
      '.kkkkk..',
      'kYYYYYk.',
      'kYkkkYYk',
      '.k..kYYk',
      '...kYYk.',
      '..kYYk..',
      '..kYYk..',
      '..kkkk..',
      '..kYYk..',
      '..kYYk..',
      '..kkkk..',
    ],
    // Nain façon Saboteur : grand bonnet tordu avec une bougie, mèches et barbe, veste bleue.
    // a/A = bonnet, m/M = cheveux et barbe, t/T = peau, n = nez, j/J = veste (couleurs selon l'avatar).
    dwarf: [
      '..............kkk...',
      '.............kaaAk..',
      '............kaakkk..',
      '...........kaak.....',
      '...........kaAk.....',
      '..........kaaAk.....',
      '..........kaaAk.....',
      '.........kaaaAk.....',
      '........kaaaaaAk....',
      '.....F.kaaaaaaAk....',
      '....fFfkaaaaaaaAk...',
      '.....ekaaaaaaaaaAk..',
      '....kekaaaaaaaaaAk..',
      '...kAAAAAAAAAAAAAAk.',
      '...kmmkttttttttkmmk.',
      '..kmmmktkkttkktkmmmk',
      '..kmmmktkttttktkmmmk',
      '...kmmktTtnntTtkmmk.',
      '....kmkmtnnnntmkmk..',
      '....kmmmmkRRkmmmk...',
      '...kjkmmmmmmmmmkjk..',
      '..kjjjkmmmmmmmkjjjk.',
      '.kjjjJjkmmmmmkjJjjjk',
      '.kjjjJjjjkMkjjjJjjjk',
    ],
    eye: [
      '..kkkk..',
      '.keiiek.',
      'keiiiiek',
      '.keiiek.',
      '..kkkk..',
    ],
  };

  // --- Outils de dessin ---------------------------------------------------------

  // Bruit déterministe : la même carte a toujours le même dessin.
  function hash(x, y, s) {
    let h = (x * 374761393 + y * 668265263 + s * 982451653) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  function grid(w, h) { return { w, h, px: new Array(w * h).fill(null) }; }
  function set(g, x, y, c) { if (x >= 0 && y >= 0 && x < g.w && y < g.h) g.px[y * g.w + x] = c; }

  function blit(g, name, ox, oy, scale, pal) {
    const sc = scale || 1;
    SPRITES[name].forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const col = (pal && pal[row[x]]) || PAL[row[x]];
        if (!col) continue;
        for (let dy = 0; dy < sc; dy++) for (let dx = 0; dx < sc; dx++) set(g, ox + x * sc + dx, oy + y * sc + dy, col);
      }
    });
  }

  // Sprite centré horizontalement sur la carte.
  function blitCenter(g, name, oy, scale) {
    const sc = scale || 1;
    blit(g, name, Math.floor((g.w - SPRITES[name][0].length * sc) / 2), oy, sc);
  }

  function roundCorners(g) {
    for (const [x, y] of [[0, 0], [g.w - 1, 0], [0, g.h - 1], [g.w - 1, g.h - 1]]) set(g, x, y, null);
  }

  function toUrl(g) {
    const cv = document.createElement('canvas');
    cv.width = g.w;
    cv.height = g.h;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(g.w, g.h);
    g.px.forEach((c, i) => {
      if (!c) return;
      img.data[i * 4] = parseInt(c.slice(1, 3), 16);
      img.data[i * 4 + 1] = parseInt(c.slice(3, 5), 16);
      img.data[i * 4 + 2] = parseInt(c.slice(5, 7), 16);
      img.data[i * 4 + 3] = 255;
    });
    ctx.putImageData(img, 0, 0);
    return cv.toDataURL();
  }

  const cache = new Map();
  function cached(key, draw) {
    if (!cache.has(key)) cache.set(key, toUrl(draw()));
    return cache.get(key);
  }

  // --- Cartes Chemin --------------------------------------------------------------
  // Galerie de 6 pixels de large, bordée de 2 pixels de pierres maçonnées, creusée dans des dalles fissurées.

  function tunnelMask(edges, dead) {
    const m = new Uint8Array(PW * PH);
    const rect = (x0, y0, x1, y1) => {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) m[y * PW + x] = 1;
    };
    const X0 = 7, X1 = 12, Y0 = 11, Y1 = 16;
    if (!dead && edges) rect(X0, Y0, X1, Y1);
    if (edges & N) dead ? rect(X0, 0, X1, 6) : rect(X0, 0, X1, Y1);
    if (edges & S) dead ? rect(X0, 21, X1, PH - 1) : rect(X0, Y0, X1, PH - 1);
    if (edges & W) dead ? rect(0, Y0, 4, Y1) : rect(0, Y0, X1, Y1);
    if (edges & E) dead ? rect(15, Y0, PW - 1, Y1) : rect(X0, Y0, PW - 1, Y1);
    return m;
  }

  // Dalles de roche : chaque pixel appartient au germe le plus proche ; la frontière entre deux dalles est une fissure.
  function slabAt(x, y, seed) {
    let d1 = Infinity, d2 = Infinity, idx = 0;
    for (let i = 0; i < 7; i++) {
      const sx = hash(i, 0, seed) * PW, sy = hash(i, 1, seed) * PH;
      const d = Math.hypot(x - sx, y - sy);
      if (d < d1) { d2 = d1; d1 = d; idx = i; } else if (d < d2) d2 = d;
    }
    return d2 - d1 < 0.9 ? -1 : idx;
  }

  function drawPath(edges, dead) {
    const g = grid(PW, PH);
    const seed = edges * 2 + (dead ? 1 : 0) + 11;
    const m = tunnelMask(edges, dead);
    const isT = (x, y) => x >= 0 && y >= 0 && x < PW && y < PH && m[y * PW + x] === 1;
    const nearT = (x, y) => {
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (isT(x + dx, y + dy)) return true;
      return false;
    };
    for (let y = 0; y < PH; y++) {
      for (let x = 0; x < PW; x++) {
        const r = hash(x, y, 1);
        let c;
        if (isT(x, y)) {
          // Sol de la galerie : ombre le long des parois du haut et de gauche, quelques cailloux.
          const shadow = (y > 0 && !isT(x, y - 1)) || (x > 0 && !isT(x - 1, y));
          c = shadow || r < 0.07 ? FLOOR.dark : r < 0.22 ? FLOOR.light : FLOOR.base;
        } else if (nearT(x, y)) {
          // Pierres de 2 × 2 en quinconce : reflet en haut à gauche, ombre en bas à droite, joints sombres.
          const by = y >> 1;
          const bx = (x + (by & 1)) >> 1;
          const br = hash(bx, by, 7);
          if (br < 0.1) c = MORTAR;
          else {
            const tone = STONES[br < 0.6 ? 0 : 1];
            const lx = (x + (by & 1)) & 1, ly = y & 1;
            c = lx === 0 && ly === 0 ? tone[0] : lx === 1 && ly === 1 ? tone[2] : tone[1];
          }
        } else if (x === 0 || y === 0 || x === PW - 1 || y === PH - 1) {
          c = ROCK_EDGE;
        } else {
          const slab = slabAt(x, y, seed);
          c = slab < 0 ? CRACK : r < 0.12 ? SLAB_DARK : r < 0.2 ? SLAB_LIGHT : SLABS[slab % SLABS.length];
        }
        set(g, x, y, c);
      }
    }
    if (dead) blit(g, 'stone', 5, 10); // éboulis qui bouche le cul-de-sac
    roundCorners(g);
    return g;
  }

  function path(edges, dead) {
    return cached(`path-${edges}-${dead ? 1 : 0}`, () => drawPath(edges, dead));
  }

  function start(edges) {
    return cached(`start-${edges}`, () => {
      const g = drawPath(edges, false);
      blit(g, 'ladder', 6, 9);
      return g;
    });
  }

  // Carte Arrivée retournée : 'gold' ou une pierre (coalA / coalB).
  function goal(type, edges) {
    return cached(`goal-${type}-${edges}`, () => {
      const g = drawPath(edges, false);
      if (type === 'gold') blit(g, 'gold', 4, 10);
      else blit(g, 'stone', 5, 10);
      return g;
    });
  }

  // Dos de carte Arrivée. type : null (inconnue), 'gold' ou pierre (déjà consultée).
  function goalBack(type) {
    const k = type ? (type === 'gold' ? 'gold' : 'stone') : 'unknown';
    return cached(`back-${k}`, () => {
      const g = grid(PW, PH);
      for (let y = 0; y < PH; y++) {
        for (let x = 0; x < PW; x++) {
          let c;
          if (x === 0 || y === 0 || x === PW - 1 || y === PH - 1) c = PAL.k;
          else if (x === 1 || y === 1 || x === PW - 2 || y === PH - 2) c = PAL.o;
          else if (y % 5 === 0) c = '#3e2612'; // joints des planches
          else c = hash(x, y, 3) < 0.25 ? PAL.w : PAL.d;
          set(g, x, y, c);
        }
      }
      for (const [x, y] of [[2, 2], [PW - 3, 2], [2, PH - 3], [PW - 3, PH - 3]]) set(g, x, y, PAL.Y);
      if (k === 'unknown') blit(g, 'question', 6, 8);
      else {
        blit(g, 'eye', 6, 5);
        if (k === 'gold') blit(g, 'gold', 4, 13);
        else blit(g, 'stone', 5, 13);
      }
      roundCorners(g);
      return g;
    });
  }

  // --- Cartes Action ----------------------------------------------------------------

  const ACTION_BG = {
    break: ['#5c3434', '#4e2c2c', '#7a4646'],
    repair: ['#2f5136', '#284530', '#3f6b48'],
    map: ['#4f4a2a', '#433f24', '#6b6438'],
    rockfall: ['#50402f', '#443627', '#6b5640'],
  };
  const TOOL_SPRITE = { pick: 'pick', lantern: 'lantern', cart: 'cart' };

  function action(card) {
    const tools = card.type === 'break' ? [card.tool] : card.type === 'repair' ? card.tools : [];
    return cached(`action-${card.type}-${tools.join('-')}`, () => {
      const g = grid(AW, AH);
      const [a, b, frame] = ACTION_BG[card.type];
      for (let y = 0; y < AH; y++) {
        for (let x = 0; x < AW; x++) {
          let c;
          if (x === 0 || y === 0 || x === AW - 1 || y === AH - 1) c = PAL.k;
          else if (x === 1 || y === 1 || x === AW - 2 || y === AH - 2) c = frame;
          else c = (x + y) % 2 && hash(x, y, 5) < 0.5 ? b : a;
          set(g, x, y, c);
        }
      }
      if (card.type === 'map') blitCenter(g, 'map', 4, 2);
      else if (card.type === 'rockfall') blitCenter(g, 'dynamite', 4, 2);
      else if (tools.length === 1) {
        blitCenter(g, TOOL_SPRITE[tools[0]], 4, 2);
        blit(g, card.type === 'break' ? 'cross' : 'check', 22, 22, 2);
      } else {
        blit(g, TOOL_SPRITE[tools[0]], 3, 6);
        blit(g, TOOL_SPRITE[tools[1]], 21, 6);
        blitCenter(g, 'check', 24, 2);
      }
      roundCorners(g);
      return g;
    });
  }

  // --- Fond du plateau et icônes ------------------------------------------------------

  // Texture répétable de dalles pâles et peu contrastées, pour que les cartes posées ressortent.
  const TILE = 32;
  const TILE_SLABS = ['#838c96', '#7d8690', '#89929b'];
  function tile() {
    return cached('tile', () => {
      const g = grid(TILE, TILE);
      const seeds = [];
      for (let i = 0; i < 6; i++) seeds.push([hash(i, 0, 99) * TILE, hash(i, 1, 99) * TILE]);
      // Distance « torique » : la texture se raccorde sur ses bords.
      const dist = (x, y, sx, sy) => {
        const dx = Math.min(Math.abs(x - sx), TILE - Math.abs(x - sx));
        const dy = Math.min(Math.abs(y - sy), TILE - Math.abs(y - sy));
        return Math.hypot(dx, dy);
      };
      for (let y = 0; y < TILE; y++) {
        for (let x = 0; x < TILE; x++) {
          let d1 = Infinity, d2 = Infinity, idx = 0;
          seeds.forEach(([sx, sy], i) => {
            const d = dist(x, y, sx, sy);
            if (d < d1) { d2 = d1; d1 = d; idx = i; } else if (d < d2) d2 = d;
          });
          const r = hash(x, y, 98);
          const c = d2 - d1 < 0.9 ? '#6c7580' : r < 0.08 ? '#747d87' : r < 0.14 ? '#959ea7' : TILE_SLABS[idx % TILE_SLABS.length];
          set(g, x, y, c);
        }
      }
      return g;
    });
  }

  // Avatars : [bonnet, barbe, peau].
  const CAPS = {
    rouge: ['#d83a3a', '#9c2424'], bleu: ['#3a6fd8', '#24479c'], vert: ['#3aa04a', '#25702f'],
    jaune: ['#e8c53a', '#a8871e'], violet: ['#8a4ad0', '#5c2c94'], orange: ['#e8822e', '#a8561a'],
    turquoise: ['#2eb8b0', '#1c7f7a'], rose: ['#e86aa8', '#a8406f'], gris: ['#8a929a', '#5c636a'],
    noir: ['#3a3f46', '#1f2328'], blanc: ['#e8ecef', '#a9b0b6'], marron: ['#8a5a2b', '#5e3a1a'],
  };
  const BEARDS = {
    brune: ['#7a4a22', '#55311a'], rousse: ['#c8642a', '#8f4419'], grise: ['#b8bcc0', '#868b90'],
    noire: ['#2d2a28', '#151312'], blonde: ['#e0b85a', '#a8853a'], blanche: ['#eef0f2', '#b9bec3'],
  };
  const SKINS = {
    claire: ['#f2c9a0', '#d9a87c', '#e39a7a'], moyenne: ['#d49a6a', '#b07a4e', '#c27a55'], foncee: ['#8d5a3b', '#6e4429', '#a0603f'],
  };
  const DWARVES = {
    rouge: ['brune', 'claire'], bleu: ['grise', 'moyenne'], vert: ['rousse', 'claire'], jaune: ['noire', 'foncee'],
    violet: ['blanche', 'claire'], orange: ['brune', 'foncee'], turquoise: ['blonde', 'moyenne'], rose: ['rousse', 'moyenne'],
    gris: ['noire', 'claire'], noir: ['blanche', 'foncee'], blanc: ['brune', 'moyenne'], marron: ['blonde', 'claire'],
  };

  function dwarf(id) {
    const key = DWARVES[id] ? id : 'gris';
    return cached('dwarf-' + key, () => {
      const [beard, skin] = DWARVES[key];
      const cap = CAPS[key], b = BEARDS[beard], sk = SKINS[skin];
      const g = grid(20, 24);
      blit(g, 'dwarf', 0, 0, 1, { a: cap[0], A: cap[1], m: b[0], M: b[1], t: sk[0], T: sk[1], n: sk[2], j: '#3a5aa8', J: '#26407a' });
      return g;
    });
  }

  // Un sprite seul, pour l'interface (icônes d'outils, etc.).
  function icon(name) {
    return cached('icon-' + name, () => {
      const sp = SPRITES[name];
      const g = grid(sp[0].length, sp.length);
      blit(g, name, 0, 0);
      return g;
    });
  }

  root.Pixel = { path, start, goal, goalBack, action, tile, icon, dwarf, TILE, SPRITES };
})(this);
