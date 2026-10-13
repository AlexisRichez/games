// Serveur Saboteur : sert les fichiers statiques et fait tourner les parties (WebSocket).
// Aucune dépendance : `node server.js` (port via PORT, 8000 par défaut).
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Sabo = require('./game.js');

const PORT = +process.env.PORT || 8000;
const HOST = process.env.HOST || '0.0.0.0';
const MAX_ROOMS = 500;
const LOBBY_GRACE_MS = 30 * 1000; // délai avant de retirer du salon un joueur déconnecté
const ROOM_TTL_MS = 2 * 3600 * 1000; // une salle sans aucun joueur connecté est supprimée après ce délai
const MAX_FRAME = 64 * 1024;

// --- Fichiers statiques -------------------------------------------------------

const FILES = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/game.js': ['game.js', 'text/javascript; charset=utf-8'],
  '/pixel.js': ['pixel.js', 'text/javascript; charset=utf-8'],
  '/cartes.html': ['cartes.html', 'text/html; charset=utf-8'],
  '/fonts/PressStart2P-Regular.ttf': ['fonts/PressStart2P-Regular.ttf', 'font/ttf'],
  '/fonts/VT323-Regular.ttf': ['fonts/VT323-Regular.ttf', 'font/ttf'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
};

const server = http.createServer((req, res) => {
  const f = FILES[req.url.split('?')[0]];
  if (!f || (req.method !== 'GET' && req.method !== 'HEAD')) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Introuvable');
  }
  fs.readFile(path.join(__dirname, f[0]), (err, data) => {
    if (err) {
      res.writeHead(500);
      return res.end();
    }
    res.writeHead(200, { 'Content-Type': f[1], 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
});

// --- WebSocket minimal (RFC 6455, messages texte uniquement) ------------------

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (req.url.split('?')[0] !== '/ws' || !key) return socket.destroy();
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n'
    + `Sec-WebSocket-Accept: ${accept}\r\n\r\n`);
  socket.setNoDelay(true);
  onSocket(wrapSocket(socket));
});

function frame(opcode, payload) {
  const len = payload.length;
  let head;
  if (len < 126) head = Buffer.from([0x80 | opcode, len]);
  else if (len < 65536) {
    head = Buffer.alloc(4);
    head[0] = 0x80 | opcode; head[1] = 126; head.writeUInt16BE(len, 2);
  } else {
    head = Buffer.alloc(10);
    head[0] = 0x80 | opcode; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([head, payload]);
}

function wrapSocket(socket) {
  const ws = { open: true, alive: true, onmessage: null, onclose: null };
  let buf = Buffer.alloc(0);
  let parts = [];

  ws.send = (obj) => {
    if (ws.open) socket.write(frame(1, Buffer.from(JSON.stringify(obj))));
  };
  ws.ping = () => {
    if (ws.open) socket.write(frame(9, Buffer.alloc(0)));
  };
  ws.close = () => {
    if (!ws.open) return;
    socket.end(frame(8, Buffer.alloc(0)));
    finish(true);
  };
  function finish(graceful) {
    if (!ws.open) return;
    ws.open = false;
    if (graceful !== true) socket.destroy();
    if (ws.onclose) ws.onclose();
  }

  socket.on('data', (chunk) => {
    ws.alive = true;
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 2) {
      const fin = buf[0] & 0x80;
      const opcode = buf[0] & 0x0f;
      const masked = buf[1] & 0x80;
      let len = buf[1] & 0x7f;
      let off = 2;
      if (len === 126) {
        if (buf.length < 4) return;
        len = buf.readUInt16BE(2); off = 4;
      } else if (len === 127) {
        if (buf.length < 10) return;
        len = Number(buf.readBigUInt64BE(2)); off = 10;
      }
      if (!masked || len > MAX_FRAME) return finish(); // les clients doivent masquer ; on refuse les trames énormes
      if (buf.length < off + 4 + len) return;
      const mask = buf.subarray(off, off + 4);
      const payload = Buffer.from(buf.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < len; i++) payload[i] ^= mask[i & 3];
      buf = buf.subarray(off + 4 + len);

      if (opcode === 8) return ws.close();
      if (opcode === 9) { socket.write(frame(10, payload)); continue; }
      if (opcode === 10) continue;
      if (opcode !== 0 && opcode !== 1) return finish(); // binaire non pris en charge
      parts.push(payload);
      if (parts.reduce((n, p) => n + p.length, 0) > MAX_FRAME) return finish();
      if (!fin) continue;
      const text = Buffer.concat(parts).toString('utf8');
      parts = [];
      let msg;
      try { msg = JSON.parse(text); } catch (e) { continue; }
      if (ws.onmessage) ws.onmessage(msg);
    }
  });
  socket.on('end', finish); // le serveur HTTP autorise le semi-fermé : il faut réagir à la fin du flux
  socket.on('close', finish);
  socket.on('error', finish);
  return ws;
}

// Ping régulier : détecte les connexions mortes et évite les coupures des proxys inactifs.
const sockets = new Set();
setInterval(() => {
  for (const ws of sockets) {
    if (!ws.alive) { ws.close(); continue; }
    ws.alive = false;
    ws.ping();
  }
}, 25 * 1000);

// --- Salles -------------------------------------------------------------------

const rooms = new Map(); // id -> { G, conns: Map(token -> ws), emptySince }

function rid(n) {
  const a = 'abcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  for (const b of crypto.randomBytes(n)) s += a[b % a.length];
  return s;
}
function cleanName(s) { return String(s || '').trim().slice(0, 20) || 'Nain'; }
function cleanToken(s) { return String(s || '').slice(0, 64); }

function broadcast(room) {
  for (const [token, ws] of room.conns) {
    const idx = room.G.players.findIndex((p) => p.token === token);
    ws.send({ type: 'state', view: Sabo.view(room.G, token), host: idx === 0 });
  }
}

function attach(room, ws, token) {
  const old = room.conns.get(token);
  room.conns.set(token, ws);
  if (old && old !== ws) old.close();
  ws.room = room;
  ws.token = token;
  room.emptySince = null;
  const p = room.G.players.find((q) => q.token === token);
  p.connected = true;
  broadcast(room);
}

function onSocket(ws) {
  sockets.add(ws);
  ws.onmessage = (msg) => {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'create' && !ws.room) {
      const token = cleanToken(msg.token);
      if (!token) return;
      if (rooms.size >= MAX_ROOMS) return ws.send({ type: 'error', msg: 'Serveur plein, réessayez plus tard.', fatal: true });
      let id;
      do id = 'saboteur-' + rid(6); while (rooms.has(id));
      const room = { id, G: Sabo.createGame(), conns: new Map(), emptySince: null };
      Sabo.addPlayer(room.G, cleanName(msg.name), token, msg.avatar);
      rooms.set(id, room);
      ws.send({ type: 'joined', room: id });
      attach(room, ws, token);
    } else if (msg.type === 'join' && !ws.room) {
      const room = rooms.get(String(msg.room));
      const token = cleanToken(msg.token);
      if (!token) return;
      if (!room) return ws.send({ type: 'error', msg: 'Cette partie n\'existe pas (ou plus).', fatal: true });
      if (!room.G.players.some((p) => p.token === token)) {
        const err = Sabo.addPlayer(room.G, cleanName(msg.name), token, msg.avatar);
        if (err) return ws.send({ type: 'error', msg: err, fatal: true });
      }
      ws.send({ type: 'joined', room: room.id });
      attach(room, ws, token);
    } else if (msg.type === 'action' && ws.room && ws.room.conns.get(ws.token) === ws) {
      const err = Sabo.applyAction(ws.room.G, ws.token, msg.action || {});
      if (err) ws.send({ type: 'error', msg: err });
      else broadcast(ws.room);
    }
  };
  ws.onclose = () => {
    sockets.delete(ws);
    const room = ws.room;
    if (!room || room.conns.get(ws.token) !== ws) return;
    room.conns.delete(ws.token);
    if (!room.conns.size) room.emptySince = Date.now();
    const p = room.G.players.find((q) => q.token === ws.token);
    if (!p) return;
    p.connected = false;
    broadcast(room);
    if (room.G.phase === 'lobby') {
      // Au salon, on libère la place si le joueur ne revient pas (un simple rechargement le garde).
      setTimeout(() => {
        if (room.G.phase !== 'lobby' || room.conns.has(p.token)) return;
        Sabo.removePlayer(room.G, p.token);
        broadcast(room);
      }, LOBBY_GRACE_MS);
    }
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [id, room] of rooms) {
    if (room.emptySince && now - room.emptySince > ROOM_TTL_MS) rooms.delete(id);
  }
}, 10 * 60 * 1000);

server.listen(PORT, HOST, () => {
  console.log(`Saboteur : http://localhost:${PORT}`);
});
