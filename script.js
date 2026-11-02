const M = 13; // tiles per module side
const OBJECTS = new Set(['c', 's', 'e', 'B']);
const TOOLS = [
  ['floor', 'Floor (erase)', '#f1eee7', ''],
  ['void', 'Void', '#8bb8ea', 'v'],
  ['bridge', 'Bridge', '#f2c26b', 'b'],
  ['wall', 'Obstacle', '#8a8a80', 'o'],
  ['chest', 'Chest', '#b8700f', 'c'],
  ['vendor', 'Vendor', '#1a9a78', 's'],
  ['stairs', 'Stairs', '#a9a3ea', 't'],
  ['enemy', 'Enemy', '#dc4444', 'e'],
  ['boss', 'Boss', '#a63737', 'B'],
  ['door', 'Door', '#d95f35', '']
];
const ENEMY_SKULL =
  'M12 2.8a7.2 7.2 0 0 0-7.2 7.2c0 2.5 1.1 4.1 3 5.4v4.1c0 .7.5 1.2 1.2 1.2h6c.7 0 1.2-.5 1.2-1.2v-4.1c1.9-1.3 3-2.9 3-5.4A7.2 7.2 0 0 0 12 2.8z';
const BOSS_SKULL =
  'M12 7.4a6.6 6.6 0 0 0-6.6 6.6c0 2.2 1 3.6 2.7 4.7v2.1c0 .6.4 1 1 1h5.8c.6 0 1-.4 1-1v-2.1c1.7-1.1 2.7-2.5 2.7-4.7A6.6 6.6 0 0 0 12 7.4z';
const BOSS_CROWN = 'M3 9l2.2-5 4 3.2L12 2l2.8 5.2 4-3.2L21 9z';
const VENDOR_BAG =
  'M8.2 8.5c1.1.8 2.3 1.2 3.8 1.2s2.7-.4 3.8-1.2l2.1 2c1.4 1.3 2.1 3.5 2.1 6.1 0 3.2-1.7 4.6-8 4.6s-8-1.4-8-4.6c0-2.6.7-4.8 2.1-6.1z';
const COIN_MARK = 'M12 11v6m2-4.5c0-.8-.8-1.3-2-1.3s-2 .5-2 1.3.8 1.2 2 1.2 2 .5 2 1.3-.8 1.3-2 1.3-2-.5-2-1.3';

let levels = [];
let cur = 0;
let tool = 'wall';
let undo = [];
let redo = [];
let hover = null;
let painting = false;

const $ = id => document.getElementById(id);
const cv = $('cv');
const ctx = cv.getContext('2d');

const newLevel = n => ({
  name: n || '',
  note: '',
  mw: 1,
  mh: 1,
  mods: [true],
  cells: {},
  objects: {},
  doors: []
});

const L = () => levels[cur];
const letter = i => String.fromCharCode(65 + i % 26);
const act = (l, mx, my) =>
  mx >= 0 &&
  my >= 0 &&
  mx < l.mw &&
  my < l.mh &&
  l.mods[my * l.mw + mx];
const DIRS = {
  n: [0, -1],
  s: [0, 1],
  w: [-1, 0],
  e: [1, 0]
};

// Persistence and history
function save() {
  try {
    localStorage.setItem('lvl-editor', JSON.stringify({ levels, cur }));
  } catch (e) {}
}

function load() {
  try {
    const d = JSON.parse(localStorage.getItem('lvl-editor'));
    if (d && d.levels.length) {
      levels = d.levels;
      levels.forEach(normalizeLevel);
      cur = Math.min(d.cur, levels.length - 1);
      return;
    }
  } catch (e) {}

  levels = [newLevel('Combat')];
}

function normalizeLevel(l) {
  l.cells ||= {};
  l.objects ||= {};

  for (const k in l.cells) {
    if (!OBJECTS.has(l.cells[k])) continue;
    l.objects[k] = l.cells[k];
    delete l.cells[k];
  }
}

function snap() {
  undo.push(JSON.stringify(L()));
  if (undo.length > 100) undo.shift();
  redo = [];
}

function restore(s) {
  levels[cur] = JSON.parse(s);
  refresh();
}

// Level summary
function stats(l) {
  const mods = [];
  l.mods.forEach((a, i) => a && mods.push([i % l.mw, Math.floor(i / l.mw)]));

  const n = mods.length;
  if (!n) return 'no modules';

  const xs = mods.map(m => m[0]);
  const ys = mods.map(m => m[1]);
  const w = Math.max(...xs) - Math.min(...xs) + 1;
  const h = Math.max(...ys) - Math.min(...ys) + 1;
  const size = w * h === n ? `${w}×${h}` : `${n} modules`;

  let en = 0;
  let boss = 0;
  let doors = 0;

  for (const k in l.objects) {
    const [x, y] = k.split(',').map(Number);
    if (!act(l, Math.floor(x / M), Math.floor(y / M))) continue;
    if (l.objects[k] === 'e') en++;
    if (l.objects[k] === 'B') boss++;
  }

  doors = l.doors.filter(d => {
    const [mx, my, s] = d.split(',');
    return (
      act(l, +mx, +my) &&
      !act(l, +mx + DIRS[s][0], +my + DIRS[s][1])
    );
  }).length;

  return `${size} · ${doors} ${doors === 1 ? 'door' : 'doors'} · ${
    en ? en + (en === 1 ? ' enemy' : ' enemies') : 'no enemies'
  }${boss ? ' · boss' : ''}`;
}

// Drawing
// Draws one tile with the same look as the toolbar icons (24-unit icon space for objects)
function tile(g, t, x, y, cs, overlay = false) {
  const px = x * cs;
  const py = y * cs;
  const u = cs / 24;
  const h = (x * 37 + y * 11) % 17;

  if (!overlay) {
    g.lineWidth = 1;
    g.strokeStyle = '#d6d2c8';
    g.strokeRect(px + 0.5, py + 0.5, cs, cs);
  }

  const obj = t === 'c' || t === 'e' || t === 's' || t === 'B';
  if ((!t || obj) && (x * 7 + y * 13) % 3 === 0) {
    // Subtle floor speckle
    g.fillStyle = 'rgba(120,110,90,.14)';
    g.fillRect(
      px + ((h + 3) / 24) * cs,
      py + (((x * 19 + y * 5) % 15 + 4) / 24) * cs,
      cs * 0.08,
      cs * 0.08
    );
  }

  if (t === 'v') {
    g.fillStyle = '#8bb8ea';
    g.fillRect(px, py, cs, cs);
    g.strokeStyle = '#5f9be0';
    g.lineWidth = Math.max(1, cs * 0.07);
    g.lineCap = 'round';

    for (const r of [0.32, 0.7]) {
      g.beginPath();
      for (let k = 0; k <= cs; k += 2) {
        const yy = py + cs * r + Math.sin(((px + k) / cs) * Math.PI * 2) * cs * 0.06;
        k ? g.lineTo(px + k, yy) : g.moveTo(px + k, yy);
      }
      g.stroke();
    }

    g.lineCap = 'butt';
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(30,70,130,.2)';
    g.strokeRect(px + 0.5, py + 0.5, cs, cs);
  } else if (t === 'b') {
    g.fillStyle = '#f2c26b';
    g.fillRect(px, py, cs, cs);
    g.strokeStyle = '#c9923f';
    g.lineWidth = Math.max(1, cs * 0.05);

    for (const r of [0.33, 0.66]) {
      g.beginPath();
      g.moveTo(px, py + cs * r);
      g.lineTo(px + cs, py + cs * r);
      g.stroke();
    }

    g.fillStyle = '#8a5f1c';
    for (const [a, b] of [
      [0.14, 0.16],
      [0.86, 0.16],
      [0.14, 0.5],
      [0.86, 0.5],
      [0.14, 0.83],
      [0.86, 0.83]
    ]) {
      g.beginPath();
      g.arc(px + cs * a, py + cs * b, cs * 0.035, 0, 7);
      g.fill();
    }

    g.lineWidth = 1;
    g.strokeStyle = '#b8883a';
    g.strokeRect(px + 0.5, py + 0.5, cs - 1, cs - 1);
  } else if (t === 'o') {
    g.fillStyle = '#8a8a80';
    g.fillRect(px, py, cs, cs);
    g.strokeStyle = '#6c6c63';
    g.lineWidth = Math.max(1, cs * 0.05);
    g.beginPath();
    g.moveTo(px, py + cs / 2);
    g.lineTo(px + cs, py + cs / 2);
    g.moveTo(px + cs * 0.5, py);
    g.lineTo(px + cs * 0.5, py + cs / 2);
    g.moveTo(px + cs * 0.25, py + cs / 2);
    g.lineTo(px + cs * 0.25, py + cs);
    g.moveTo(px + cs * 0.75, py + cs / 2);
    g.lineTo(px + cs * 0.75, py + cs);
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,.22)';
    g.fillRect(px, py, cs, cs * 0.07);
    g.fillRect(px, py, cs * 0.07, cs);
    g.fillStyle = 'rgba(0,0,0,.25)';
    g.fillRect(px, py + cs * 0.93, cs, cs * 0.07);
    g.fillRect(px + cs * 0.93, py, cs * 0.07, cs);
  } else if (t === 't') {
    for (let k = 0; k < 4; k++) {
      g.fillStyle = k % 2 ? '#a9a3ea' : '#bdb8f2';
      g.fillRect(px, py + (k * cs) / 4, cs, cs / 4 + 0.5);
    }

    g.strokeStyle = '#7f78d0';
    g.lineWidth = Math.max(1, cs * 0.05);
    for (let k = 1; k < 4; k++) {
      g.beginPath();
      g.moveTo(px, py + (k * cs) / 4);
      g.lineTo(px + cs, py + (k * cs) / 4);
      g.stroke();
    }

    g.lineWidth = 1;
    g.strokeRect(px + 0.5, py + 0.5, cs - 1, cs - 1);
  } else if (obj && t !== 'B') {
    g.save();
    g.translate(px, py);
    g.scale(u, u);
    g.lineJoin = 'round';

    if (t === 'c') {
      g.fillStyle = 'rgba(0,0,0,.12)';
      g.beginPath();
      g.ellipse(12, 20, 9, 1.6, 0, 0, 7);
      g.fill();
      g.lineWidth = 1.3;
      g.strokeStyle = '#6b3f05';
      g.fillStyle = '#b8700f';
      g.fillRect(4, 9, 16, 10);
      g.strokeRect(4, 9, 16, 10);
      const lid = new Path2D('M4 9q0-4 8-4t8 4z');
      g.fillStyle = '#cf8820';
      g.fill(lid);
      g.stroke(lid);
      g.lineWidth = 0.9;
      g.fillStyle = '#f2c26b';
      g.fillRect(10.5, 10.5, 3, 4);
      g.strokeRect(10.5, 10.5, 3, 4);
    } else if (t === 'e') {
      drawSkull(g, ENEMY_SKULL, 2.8, 2.8, 18.4, '#dc4444', '#8f2222');
    } else {
      drawVendorBag(g, 0, 0, 24);
    }

    g.restore();
  }
}

function drawSkull(g, path, x, y, size, fill, stroke) {
  g.save();
  g.translate(x, y);
  g.scale(size / 24, size / 24);
  g.lineJoin = 'round';
  g.fillStyle = fill;
  g.strokeStyle = stroke;
  g.lineWidth = 1.2;
  g.fill(new Path2D(path));
  g.stroke(new Path2D(path));

  g.fillStyle = stroke;
  g.beginPath();
  g.ellipse(9.2, 11.1, 1.8, 2.2, 0, 0, Math.PI * 2);
  g.ellipse(14.8, 11.1, 1.8, 2.2, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(12, 13.1);
  g.lineTo(10.9, 15);
  g.lineTo(13.1, 15);
  g.closePath();
  g.fill();

  g.strokeStyle = stroke;
  g.lineWidth = 0.8;
  g.beginPath();
  g.moveTo(9, 17.3);
  g.lineTo(15, 17.3);
  g.moveTo(10.5, 16.8);
  g.lineTo(10.5, 18.8);
  g.moveTo(12, 16.8);
  g.lineTo(12, 19);
  g.moveTo(13.5, 16.8);
  g.lineTo(13.5, 18.8);
  g.stroke();
  g.restore();
}

function drawVendorBag(g, x, y, size) {
  g.save();
  g.translate(x, y);
  g.scale(size / 24, size / 24);
  g.lineJoin = 'round';

  g.strokeStyle = '#0d6650';
  g.lineWidth = 1.4;
  g.beginPath();
  g.moveTo(9, 7.8);
  g.quadraticCurveTo(9.2, 3.6, 12, 3.6);
  g.quadraticCurveTo(14.8, 3.6, 15, 7.8);
  g.stroke();
  g.beginPath();
  g.moveTo(8, 8.4);
  g.lineTo(16, 8.4);
  g.stroke();

  g.fillStyle = '#1a9a78';
  g.strokeStyle = '#0d6650';
  g.lineWidth = 1.2;
  g.fill(new Path2D(VENDOR_BAG));
  g.stroke(new Path2D(VENDOR_BAG));

  g.fillStyle = '#f6d777';
  g.strokeStyle = '#956d18';
  g.lineWidth = 0.8;
  g.beginPath();
  g.arc(12, 14.5, 3.4, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.strokeStyle = '#795714';
  g.lineWidth = 0.8;
  g.lineCap = 'round';
  g.stroke(new Path2D(COIN_MARK));
  g.restore();
}

// Draws the level at a given tile size. Returns canvas size.
function draw(c, l, cs, opts = {}) {
  const pad = cs * 0.7;
  const W = l.mw * M * cs;
  const H = l.mh * M * cs;
  const x0 = pad;
  const y0 = pad;
  const g = c;

  g.save();
  g.translate(x0, y0);

  const cell = (x, y) => l.cells[x + ',' + y] || '';
  for (let my = 0; my < l.mh; my++) {
    for (let mx = 0; mx < l.mw; mx++) {
      if (!act(l, mx, my)) continue;

      g.fillStyle = '#f1eee7';
      g.fillRect(mx * M * cs, my * M * cs, M * cs, M * cs);

      for (let j = 0; j < M; j++) {
        for (let i = 0; i < M; i++) {
          const x = mx * M + i;
          const y = my * M + j;
          tile(g, cell(x, y), x, y, cs);
          const object = l.objects[x + ',' + y];
          if (object) tile(g, object, x, y, cs, true);
        }
      }
    }
  }

  // Draw the boss last and at a larger size.
  for (const k in l.objects) {
    if (l.objects[k] !== 'B') continue;

    const [x, y] = k.split(',').map(Number);
    if (!act(l, Math.floor(x / M), Math.floor(y / M))) continue;

    const bx = (x + 0.5) * cs;
    const by = (y + 0.5) * cs;
    const br = cs * 1.5;

    g.fillStyle = 'rgba(0,0,0,.15)';
    g.beginPath();
    g.ellipse(bx, by + br * 0.95, br * 0.8, br * 0.14, 0, 0, 7);
    g.fill();

    drawSkull(
      g,
      BOSS_SKULL,
      bx - br,
      by - br,
      br * 2,
      '#a63737',
      '#5c1313'
    );

    g.save();
    g.translate(bx - br, by - br);
    g.scale((br * 2) / 24, (br * 2) / 24);
    g.fillStyle = '#e6b94f';
    g.strokeStyle = '#5c1313';
    g.lineWidth = 0.7;
    g.fill(new Path2D(BOSS_CROWN));
    g.stroke(new Path2D(BOSS_CROWN));
    g.restore();
  }

  // Draw dashed module boundaries.
  g.strokeStyle = '#777';
  g.lineWidth = 1.2;
  g.setLineDash([cs * 0.3, cs * 0.2]);

  for (let my = 0; my < l.mh; my++) {
    for (let mx = 0; mx < l.mw; mx++) {
      if (!act(l, mx, my)) continue;

      if (act(l, mx + 1, my)) {
        g.beginPath();
        g.moveTo((mx + 1) * M * cs, my * M * cs);
        g.lineTo((mx + 1) * M * cs, (my + 1) * M * cs);
        g.stroke();
      }
      if (act(l, mx, my + 1)) {
        g.beginPath();
        g.moveTo(mx * M * cs, (my + 1) * M * cs);
        g.lineTo((mx + 1) * M * cs, (my + 1) * M * cs);
        g.stroke();
      }
    }
  }

  g.setLineDash([]);

  // Draw outer walls and collect possible door locations.
  g.strokeStyle = '#2a2a28';
  g.lineWidth = cs * 0.22;
  g.lineCap = 'square';
  const slots = [];

  for (let my = 0; my < l.mh; my++) {
    for (let mx = 0; mx < l.mw; mx++) {
      if (!act(l, mx, my)) continue;

      const L0 = mx * M * cs;
      const T = my * M * cs;
      const R = L0 + M * cs;
      const B = T + M * cs;
      const seg = (a, b, c2, d) => {
        g.beginPath();
        g.moveTo(a, b);
        g.lineTo(c2, d);
        g.stroke();
      };

      if (!act(l, mx, my - 1)) {
        seg(L0, T, R, T);
        slots.push([mx, my, 'n', (L0 + R) / 2, T]);
      }
      if (!act(l, mx, my + 1)) {
        seg(L0, B, R, B);
        slots.push([mx, my, 's', (L0 + R) / 2, B]);
      }
      if (!act(l, mx - 1, my)) {
        seg(L0, T, L0, B);
        slots.push([mx, my, 'w', L0, (T + B) / 2]);
      }
      if (!act(l, mx + 1, my)) {
        seg(R, T, R, B);
        slots.push([mx, my, 'e', R, (T + B) / 2]);
      }
    }
  }

  // Draw doors or optional door hints.
  for (const s of slots) {
    const has = l.doors.includes(s[0] + ',' + s[1] + ',' + s[2]);
    const horiz = s[2] === 'n' || s[2] === 's';
    const w = cs;
    const h = cs * 0.5;

    if (has) {
      g.fillStyle = '#d95f35';
      g.strokeStyle = '#8f3a1c';
      g.lineWidth = 1.5;
      const rw = horiz ? w : h;
      const rh = horiz ? h : w;
      g.fillRect(s[3] - rw / 2, s[4] - rh / 2, rw, rh);
      g.strokeRect(s[3] - rw / 2, s[4] - rh / 2, rw, rh);
    } else if (opts.hints) {
      g.fillStyle = 'rgba(217,95,53,.35)';
      g.beginPath();
      g.arc(s[3], s[4], cs * 0.4, 0, 7);
      g.fill();
    }
  }

  if (opts.hover && tool !== 'door') {
    const [hx, hy] = opts.hover;
    g.strokeStyle = '#d95f35';
    g.lineWidth = 2;
    g.strokeRect(hx * cs + 1, hy * cs + 1, cs - 2, cs - 2);
  }

  g.restore();
  return { W: W + pad * 2, H: H + pad * 2, pad, slots };
}

// Canvas sizing and rendering
let CS = 26;

function fit() {
  const l = L();
  const st = $('stage');
  const aw = st.clientWidth - 70;
  const ah = st.clientHeight - 170;
  CS = Math.max(
    12,
    Math.min(
      34,
      Math.floor(Math.min(aw / (l.mw * M + 1.4), ah / (l.mh * M + 1.4)))
    )
  );
}

addEventListener('resize', () => render());

function render() {
  fit();

  const l = L();
  const pad = CS * 0.7;
  cv.width = l.mw * M * CS + pad * 2;
  cv.height = l.mh * M * CS + pad * 2;
  ctx.clearRect(0, 0, cv.width, cv.height);
  draw(ctx, l, CS, { hover, hints: tool === 'door' });

  $('info').textContent = `${l.name ? l.name + ' · ' : ''}${stats(l)}${
    l.note ? ' · ' + l.note : ''
  }`;
}

function refresh() {
  const l = L();
  $('levels').innerHTML = '';

  levels.forEach((v, i) => {
    const d = document.createElement('div');
    d.className = 'lv' + (i === cur ? ' on' : '');
    d.innerHTML = `<b>${letter(i)}</b><span>${v.name || 'Untitled'}</span>`;
    d.onclick = () => {
      cur = i;
      undo = [];
      redo = [];
      refresh();
    };
    $('levels').appendChild(d);
  });

  $('name').value = l.name;
  $('note').value = l.note;
  $('wv').textContent = l.mw;
  $('hv').textContent = l.mh;

  const m = $('mods');
  m.style.gridTemplateColumns = `repeat(${l.mw},36px)`;
  m.innerHTML = '';

  for (let y = 0; y < l.mh; y++) {
    for (let x = 0; x < l.mw; x++) {
      const b = document.createElement('div');
      b.className = 'mod' + (act(l, x, y) ? ' on' : '');
      b.onclick = () => {
        snap();
        l.mods[y * l.mw + x] = !l.mods[y * l.mw + x];
        refresh();
      };
      m.appendChild(b);
    }
  }

  document
    .querySelectorAll('.tool,.lg[data-t]')
    .forEach(b => b.classList.toggle('on', b.dataset.t === tool));

  render();
  save();
}

// Level editing and pointer interactions
function resize(dw, dh) {
  const l = L();
  const nw = Math.min(4, Math.max(1, l.mw + dw));
  const nh = Math.min(4, Math.max(1, l.mh + dh));
  if (nw === l.mw && nh === l.mh) return;

  snap();
  const nm = [];
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      nm.push(x < l.mw && y < l.mh ? l.mods[y * l.mw + x] : true);
    }
  }

  l.mw = nw;
  l.mh = nh;
  l.mods = nm;
  refresh();
}

function pos(e) {
  const r = cv.getBoundingClientRect();
  const k = cv.width / r.width;
  const pad = CS * 0.7;
  return [(e.clientX - r.left) * k - pad, (e.clientY - r.top) * k - pad];
}

function paint(e) {
  const [px, py] = pos(e);
  const x = Math.floor(px / CS);
  const y = Math.floor(py / CS);
  const l = L();
  hover = [x, y];

  if (tool !== 'door' && painting && act(l, Math.floor(x / M), Math.floor(y / M))) {
    const k = x + ',' + y;
    const erase = e.button === 2 || e.buttons === 2 || tool === 'floor';
    const t = erase ? '' : TOOLS.find(t => t[0] === tool)[3];

    if (erase) {
      delete l.cells[k];
      delete l.objects[k];
    } else if (OBJECTS.has(t)) {
      if (t === 'B') {
        for (const kk in l.objects) {
          if (l.objects[kk] === 'B') delete l.objects[kk];
        }
      }
      l.objects[k] = t;
    } else if (t) {
      l.cells[k] = t;
    }

  }

  render();
}

cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('pointerdown', e => {
  e.preventDefault();
  cv.setPointerCapture(e.pointerId);
  snap();

  if (tool === 'door') {
    doorClick(e);
    return;
  }

  painting = true;
  paint(e);
});
cv.addEventListener('pointermove', e => {
  if (tool !== 'door') paint(e);
});
cv.addEventListener('pointerup', () => {
  painting = false;
  save();
});
cv.addEventListener('pointerleave', () => {
  hover = null;
  render();
});

function doorClick(e) {
  const [px, py] = pos(e);
  const l = L();
  const info = draw(document.createElement('canvas').getContext('2d'), l, CS);
  let best = null;
  let bd = CS * 1.8;

  for (const s of info.slots) {
    const d = Math.hypot(s[3] - px, s[4] - py);
    if (d < bd) {
      bd = d;
      best = s;
    }
  }

  if (!best) {
    undo.pop();
    return;
  }

  const k = best[0] + ',' + best[1] + ',' + best[2];
  const i = l.doors.indexOf(k);
  if (i >= 0) l.doors.splice(i, 1);
  else if (e.button === 2) {
    undo.pop();
    return;
  } else l.doors.push(k);
  refresh();
}

// Toolbar icons and legend
const R = '<rect x="3" y="3" width="18" height="18" rx="2"';
const ICON = {
  floor:
    R +
    ' fill="#f1eee7" stroke="#8d897d"/><path d="M12 3v18M3 12h18" stroke="#cfcac0"/>',
  void:
    R +
    ' fill="#8bb8ea" stroke="#3f6fa8"/><path d="M5.5 10q1.75-2.5 3.5 0t3.5 0 3.5 0M5.5 15.5q1.75-2.5 3.5 0t3.5 0 3.5 0" fill="none" stroke="#2f6fc0" stroke-width="1.5" stroke-linecap="round"/>',
  bridge:
    R +
    ' fill="#f2c26b" stroke="#b8883a"/><path d="M3 9h18M3 15h18" stroke="#b8883a"/>',
  wall:
    R +
    ' fill="#8a8a80" stroke="#5c5c54"/><path d="M3 9h18M3 15h18M12 3v6M8 9v6M16 9v6M12 15v6" stroke="#5c5c54"/>',
  chest:
    '<path d="M4 9q0-4 8-4t8 4z" fill="#cf8820" stroke="#6b3f05" stroke-width="1.3"/><rect x="4" y="9" width="16" height="10" rx="1.5" fill="#b8700f" stroke="#6b3f05" stroke-width="1.3"/><rect x="10.5" y="10.5" width="3" height="4" fill="#f2c26b" stroke="#6b3f05" stroke-width=".9"/>',
  enemy: `<path d="${ENEMY_SKULL}" fill="#dc4444" stroke="#8f2222" stroke-width="1.2" stroke-linejoin="round"/><circle cx="9.2" cy="11.1" r="1.8" fill="#8f2222"/><circle cx="14.8" cy="11.1" r="1.8" fill="#8f2222"/><path d="M12 13.1 10.9 15h2.2zM9 17.3h6m-4.5-.5v2m1.5-2v2.2m1.5-2.2v2" fill="none" stroke="#8f2222" stroke-width=".8" stroke-linejoin="round"/>`,
  vendor: `<path d="M9 7.8c.2-2.8 1.2-4.2 3-4.2s2.8 1.4 3 4.2M8 8.4h8" fill="none" stroke="#0d6650" stroke-width="1.4" stroke-linecap="round"/><path d="${VENDOR_BAG}" fill="#1a9a78" stroke="#0d6650" stroke-width="1.2" stroke-linejoin="round"/><circle cx="12" cy="14.5" r="3.4" fill="#f6d777" stroke="#956d18" stroke-width=".8"/><path d="${COIN_MARK}" fill="none" stroke="#795714" stroke-width=".8" stroke-linecap="round"/>`,
  stairs:
    R +
    ' fill="#a9a3ea" stroke="#7f78d0"/><path d="M6 18h4v-4h4v-4h4" fill="none" stroke="#4b44a8" stroke-width="1.8" stroke-linejoin="round"/>',
  boss: `<path d="${BOSS_CROWN}" fill="#e6b94f" stroke="#5c1313" stroke-width=".7" stroke-linejoin="round"/><path d="${BOSS_SKULL}" fill="#a63737" stroke="#5c1313" stroke-width="1.2" stroke-linejoin="round"/><circle cx="9.7" cy="13.8" r="1.7" fill="#5c1313"/><circle cx="14.3" cy="13.8" r="1.7" fill="#5c1313"/><path d="M12 15.3 11 17h2zM9.5 19h5m-3.5-.4v1.5m2-1.5v1.5" fill="none" stroke="#5c1313" stroke-width=".8" stroke-linejoin="round"/>`,
  door:
    '<rect x="7" y="3" width="10" height="18" rx="1.5" fill="#d95f35" stroke="#8f3a1c" stroke-width="1.5"/><circle cx="14.5" cy="12" r="1.1" fill="#f6c8b4"/>',
  line: '<path d="M3 12h18" stroke="#2a2a28" stroke-width="3.5" stroke-linecap="square"/>',
  dash: '<path d="M3 12h18" stroke="#888" stroke-width="1.6" stroke-dasharray="3 2.5"/>'
};

const svg = k => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg>`;
TOOLS.forEach((t, i) => {
  if (i === 4 || i === 9) {
    const d = document.createElement('div');
    d.className = 'div';
    $('tools').appendChild(d);
  }

  const b = document.createElement('button');
  b.className = 'tool';
  b.dataset.t = t[0];
  b.title = `${t[1]} (${(i + 1) % 10})`;
  b.innerHTML = svg(t[0]) + `<i>${(i + 1) % 10}</i>`;
  b.onclick = () => {
    tool = t[0];
    refresh();
  };
  $('tools').appendChild(b);
});

const LEGEND_GROUPS = [
  [
    ['floor', 'Floor'],
    ['void', 'Void (impassable)'],
    ['bridge', 'Bridge (over void)'],
    ['wall', 'Obstacle (pillar, crates)']
  ],
  [
    ['chest', 'Chest'],
    ['vendor', 'Vendor'],
    ['stairs', 'Stairs (next level)'],
    ['enemy', 'Enemy spawn'],
    ['boss', 'Boss']
  ],
  [['door', 'Door (center of edge)']]
];

$('legend').innerHTML =
  `<header>Legend<button id="lgToggle" title="Show/hide">–</button></header><div class="lgbody">` +
  LEGEND_GROUPS.map(
    group =>
      group
        .map(
          ([k, n]) =>
            `<div class="lg" data-t="${k}">${svg(k)}<span>${n}</span></div>`
        )
        .join('') + '<div class="lgsep"></div>'
  ).join('') +
  `<div class="lg">${svg('line')}<span>Wall</span></div><div class="lg">${svg('dash')}<span>Module boundary</span></div></div>` +
  `<div class="lgfoot">Drag to paint · right-click to erase · Door: click near the center of an outer edge</div>`;

document.querySelectorAll('.lg[data-t]').forEach(el => {
  el.onclick = () => {
    tool = el.dataset.t;
    refresh();
  };
});

$('lgToggle').onclick = () => {
  const m = $('legend').classList.toggle('min');
  $('lgToggle').textContent = m ? '+' : '–';
};

// Keyboard shortcuts
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    e.shiftKey ? $('redo').click() : $('undo').click();
    return;
  }

  const n = e.key === '0' ? 9 : parseInt(e.key) - 1;
  if (n >= 0 && n < TOOLS.length) {
    tool = TOOLS[n][0];
    refresh();
  }
});

// Buttons and level metadata
$('undo').onclick = () => {
  if (!undo.length) return;
  redo.push(JSON.stringify(L()));
  restore(undo.pop());
};

$('redo').onclick = () => {
  if (!redo.length) return;
  undo.push(JSON.stringify(L()));
  restore(redo.pop());
};

$('clear').onclick = () => {
  snap();
  const l = L();
  l.cells = {};
  l.doors = [];
  refresh();
};

$('addLv').onclick = () => {
  levels.push(newLevel());
  cur = levels.length - 1;
  undo = [];
  redo = [];
  refresh();
};

$('dupLv').onclick = () => {
  const c = JSON.parse(JSON.stringify(L()));
  c.name += ' copy';
  levels.splice(cur + 1, 0, c);
  cur++;
  refresh();
};

$('delLv').onclick = () => {
  if (levels.length < 2) {
    levels[0] = newLevel();
  } else {
    levels.splice(cur, 1);
    cur = Math.max(0, cur - 1);
  }
  refresh();
};

$('name').oninput = e => {
  L().name = e.target.value;
  render();
  save();

  const s = $('levels').children[cur];
  if (s) s.lastChild.textContent = e.target.value || 'Untitled';
};

$('note').oninput = e => {
  L().note = e.target.value;
  render();
  save();
};

$('wm').onclick = () => resize(-1, 0);
$('wp').onclick = () => resize(1, 0);
$('hm').onclick = () => resize(0, -1);
$('hp').onclick = () => resize(0, 1);

// Export and import
$('png').onclick = () => {
  const l = L();
  const cs = 32;
  const off = document.createElement('canvas');
  const pad = cs * 0.7;
  const w = l.mw * M * cs + pad * 2;
  const h = l.mh * M * cs + pad * 2 + 70;

  off.width = w;
  off.height = h;
  const g = off.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, w, h);
  draw(g, l, cs);
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#2a2a28';
  g.font = 'bold 24px sans-serif';
  g.fillText(`${letter(cur)} · ${l.name || 'Untitled'}`, pad, h - 36);
  g.fillStyle = '#666';
  g.font = '18px sans-serif';
  g.fillText(stats(l) + (l.note ? ' · ' + l.note : ''), pad, h - 10);

  const a = document.createElement('a');
  a.download = (l.name || 'level') + '.png';
  a.href = off.toDataURL();
  a.click();
};

$('saveJson').onclick = () => {
  const a = document.createElement('a');
  a.download = 'levels.json';
  a.href = URL.createObjectURL(
    new Blob([JSON.stringify({ levels, cur }, null, 1)], {
      type: 'application/json'
    })
  );
  a.click();
};

$('loadJson').onclick = () => $('file').click();
$('file').onchange = e => {
  const f = e.target.files[0];
  if (!f) return;

  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      if (d.levels && d.levels.length) {
        levels = d.levels;
        levels.forEach(normalizeLevel);
        cur = 0;
        undo = [];
        redo = [];
        refresh();
      }
    } catch (x) {
      alert('Invalid JSON');
    }
  };

  r.readAsText(f);
  e.target.value = '';
};

load();
refresh();
