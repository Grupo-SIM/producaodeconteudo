// Escritório 3D (three.js): sala completa com baias, paredes de vidro, jardim com árvores, agentes sentados, sala de vidro do Gerente.
// A lógica (quem anda, quem leva o quê, falas, chicote) continua no painel; este arquivo só DESENHA o que o painel manda: render(M, cour, ST, t).
import * as THREE from '/three.module.min.js';

const hash01 = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const PHASES = {   // luz do dia: céu, sol, cor do sol, intensidade, fundo
  dia: { sky: 0xa9dcff, sun: 0xfff1d6, si: 2.1, hemi: 0.85, night: 0 },
  amanhecer: { sky: 0xf4b38a, sun: 0xffc59a, si: 1.5, hemi: 0.6, night: 0.15 },
  entardecer: { sky: 0xf29a6a, sun: 0xffb27a, si: 1.5, hemi: 0.55, night: 0.25 },
  noite: { sky: 0x0e1a33, sun: 0x8fb0ff, si: 0.45, hemi: 0.35, night: 1 }
};
const GREY = '#6b7280';

export function createOffice3D(cfg) {
  const { W, H, K, POS, RW, RD, OFC, SKIN, HAIR, ACC, skyPhase } = cfg;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  if (!renderer.getContext()) throw new Error('sem WebGL');
  renderer.setPixelRatio(1); renderer.setSize(Math.round(W * K), Math.round(H * K), false);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const canvas = renderer.domElement; canvas.className = 'ocv';
  const scene = new THREE.Scene();
  const aspect = W / H;
  const GX = RW - 14.2;   // a sala foi alargada: a sala de vidro do Gerente acompanha a parede da direita

  // ───────── câmera isométrica (ortográfica), enquadrando a sala inteira ─────────
  const CEN = new THREE.Vector3(RW / 2, 0.6, RD / 2), EL = 36 * Math.PI / 180, AZ = 45 * Math.PI / 180;
  const dir = new THREE.Vector3(Math.cos(AZ) * Math.cos(EL), Math.sin(EL), Math.sin(AZ) * Math.cos(EL));
  const cam = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 200);
  cam.position.copy(CEN).addScaledVector(dir, 60); cam.lookAt(CEN); cam.updateMatrixWorld(true);
  { const inv = cam.matrixWorldInverse; let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const [x, y, z] of [[0, 0, 0], [RW, 0, 0], [0, 0, RD], [RW, 0, RD], [0, 3.3, 0], [RW, 3.3, 0], [0, 3.3, RD], [RW, 0.4, RD]]) { const v = new THREE.Vector3(x, y, z).applyMatrix4(inv); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, hh = Math.max((y1 - y0) * 1.04, (x1 - x0) * 1.03 / aspect) / 2, ww = hh * aspect;
    cam.left = cx - ww; cam.right = cx + ww; cam.top = cy + hh + 0.15; cam.bottom = cy - hh + 0.15; cam.updateProjectionMatrix(); }

  // ───────── materiais e ajudantes de forma ─────────
  const mcache = new Map();
  const mat = (color, o = {}) => { const k = color + JSON.stringify(o); let m = mcache.get(k); if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: .82, metalness: 0, flatShading: true, ...o }); mcache.set(k, m); } return m; };
  const add = (parent, mesh, x, y, z, cast = true, rec = true) => { mesh.position.set(x, y, z); mesh.castShadow = cast; mesh.receiveShadow = rec; parent.add(mesh); return mesh; };
  const box = (p, w, h, d, x, y, z, color, o = {}) => add(p, new THREE.Mesh(new THREE.BoxGeometry(w, h, d), o.m || mat(color, o.mo)), x, y + h / 2, z, o.cast !== false, o.rec !== false);
  const cyl = (p, rt, rb, h, seg, x, y, z, color, o = {}) => add(p, new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), o.m || mat(color, o.mo)), x, y + h / 2, z, o.cast !== false, o.rec !== false);
  const sph = (p, r, x, y, z, color, o = {}) => add(p, new THREE.Mesh(new THREE.SphereGeometry(r, o.ws || 10, o.hs || 8), o.m || mat(color, o.mo)), x, y, z, o.cast !== false, o.rec !== false);
  const emis = (color, k = 1) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k, roughness: .5, flatShading: true });
  const colorTex = (w, h, fn) => { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };

  // ───────── luzes ─────────
  const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x8a6a4a, 0.85); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.1); sun.position.set(RW / 2 + 9, 14, RD / 2 + 6); sun.target.position.set(RW / 2, 0, RD / 2);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); { const s = sun.shadow.camera; s.left = -13; s.right = 13; s.top = 11; s.bottom = -11; s.near = 1; s.far = 45; } sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const lamps = [[3.8, 3.1, 2.1], [9.0, 3.1, 2.1], [4.8, 3.1, 5.9], [11.6 + GX, 3.0, 6.2]].map(([x, y, z]) => { const l = new THREE.PointLight(0xffd9a0, 0, 9, 1.6); l.position.set(x, y, z); scene.add(l); return l; });

  // ───────── chão externo (grama de baixa poligonagem) e árvores ─────────
  const root = new THREE.Group(); scene.add(root);
  { const g = new THREE.PlaneGeometry(120, 120, 48, 48); g.rotateX(-Math.PI / 2); const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), z = pos.getZ(i), inRoom = x > -1.5 && x < RW + 1.5 && z > -1.5 && z < RD + 1.5; if (!inRoom) pos.setY(i, 0); }
    const ng = g.toNonIndexed(), cols = [], p2 = ng.attributes.position, A = new THREE.Color('#161a24'), B = new THREE.Color('#141822'), C = new THREE.Color('#191e29'), c = new THREE.Color();
    for (let i = 0; i < p2.count; i += 3) { const h = hash01(Math.floor(p2.getX(i) * 3.1) * 13 + Math.floor(p2.getZ(i) * 3.1) * 7 + i); c.copy(h < .35 ? B : h < .75 ? A : C); for (let k = 0; k < 3; k++) cols.push(c.r, c.g, c.b); }
    ng.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); ng.computeVertexNormals();
    const m = new THREE.Mesh(ng, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true })); m.position.y = -0.36; m.receiveShadow = true; root.add(m); }
  const FOLHAS = ['#e8743b', '#d9482b', '#f2b134', '#7bbf4a', '#4f9d3a', '#c8512e', '#f08a3c', '#5fa63b'];
  const treeAt = (x, z, k, s = 1) => { const g = new THREE.Group(); g.position.set(x, -0.36, z); g.rotation.y = hash01(k) * 6.28; g.scale.setScalar(s * (.8 + hash01(k + 3) * .6));
    const pine = hash01(k + 9) < .38, tc = '#7a5230';
    if (pine) { cyl(g, .14, .2, 1, 6, 0, 0, 0, tc); const gc = hash01(k + 5) < .5 ? '#3f8f3a' : '#2f7a46'; for (let i = 0; i < 4; i++) cyl(g, .05, 1.25 - i * .27, 1.1, 7, 0, 0.9 + i * .62, 0, gc); }
    else { cyl(g, .13, .2, 1.5, 6, 0, 0, 0, tc); const fc = FOLHAS[Math.floor(hash01(k + 1) * FOLHAS.length)]; const f1 = new THREE.Mesh(new THREE.IcosahedronGeometry(.95, 0), mat(fc)); add(g, f1, 0, 2.1, 0); const f2 = new THREE.Mesh(new THREE.IcosahedronGeometry(.62, 0), mat(FOLHAS[Math.floor(hash01(k + 2) * FOLHAS.length)])); add(g, f2, .5, 1.75, .25); const f3 = new THREE.Mesh(new THREE.IcosahedronGeometry(.55, 0), mat(fc)); add(g, f3, -.45, 1.85, -.2); }
    root.add(g); };
  if (false) { let k = 1; const spots = [];   // árvores, arbustos e pedras desligados: o fundo limpo deixa a sala em destaque
    for (let i = 0; i < 70; i++) { const a = hash01(i * 3.3) * 6.283, r = 6 + hash01(i * 5.1) * 17, x = RW / 2 + Math.cos(a) * r * 1.25, z = RD / 2 + Math.sin(a) * r * .95; if (x > -2.4 && x < RW + 2.6 && z > -2.4 && z < RD + 2.6) continue; spots.push([x, z]); }
    for (const [x, z] of spots) treeAt(x, z, k++, 1.05);
    // arbustos, pedras e canteiros
    for (let i = 0; i < 26; i++) { const x = -3 + hash01(i * 2.7) * (RW + 8), z = -3 + hash01(i * 4.1) * (RD + 8); if (x > -1.6 && x < RW + 1.6 && z > -1.6 && z < RD + 1.6) continue; const b = sph(root, .35 + hash01(i) * .35, x, -0.2, z, ['#4f9d3a', '#6fb544', '#c8512e', '#e8a33b'][i % 4], { ws: 6, hs: 5 }); b.scale.y = .75; }
    for (let i = 0; i < 12; i++) { const x = -4 + hash01(i * 8.1) * (RW + 9), z = -4 + hash01(i * 6.7) * (RD + 9); if (x > -1.6 && x < RW + 1.6 && z > -1.6 && z < RD + 1.6) continue; const r = new THREE.Mesh(new THREE.DodecahedronGeometry(.3 + hash01(i) * .3, 0), mat('#9aa0a8')); add(root, r, x, -0.25, z); r.scale.y = .6; } }

  // ───────── base da sala, piso de madeira e carpetes ─────────
  box(root, RW + .8, .36, RD + .8, RW / 2, -0.36, RD / 2, '#eef1f5');
  { const wood = colorTex(512, 512, (c, w, h) => { const rows = 8, ph = h / rows; for (let r = 0; r < rows; r++) { let x = -((r * 97) % 190); while (x < w) { const ln = 150 + hash01(r * 7 + x) * 110, v = 196 + Math.floor(hash01(r * 31 + x * .13) * 26); c.fillStyle = `rgb(${v},${Math.floor(v * .72)},${Math.floor(v * .44)})`; c.fillRect(x, r * ph, ln, ph); c.fillStyle = 'rgba(70,40,15,.28)'; c.fillRect(x, r * ph, ln, 1.6); c.fillRect(x, r * ph, 1.6, ph); x += ln; } } });
    wood.wrapS = wood.wrapT = THREE.RepeatWrapping; wood.repeat.set(RW / 3.2, RD / 3.2);
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(RW, RD), new THREE.MeshStandardMaterial({ map: wood, roughness: .6 })); fl.rotation.x = -Math.PI / 2; fl.position.set(RW / 2, 0.001, RD / 2); fl.receiveShadow = true; root.add(fl); }
  for (const [x0, z0, w, d, c] of [[0.6, 3.2, RW - 1.2, 1.7, '#4e5870'], [0.35, 3.2, 1.7, 4.8, '#4e5870'], [10.55 + GX, 4.95, RW - 10.55 - GX, RD - 4.95, '#8a6a2e']]) box(root, w, .02, d, x0 + w / 2, 0, z0 + d / 2, c, { cast: false });

  // ───────── paredes dos fundos com janelas, logo, quadros ─────────
  const WH = 3.2, glass = new THREE.MeshStandardMaterial({ color: 0xcfeaff, transparent: true, opacity: .16, roughness: .05, metalness: .1, side: THREE.DoubleSide, depthWrite: false });
  const frameC = '#f5f7fa', wallC = '#f4f1ea';
  function wallBackZ() {   // parede z=0 (de x=0 a RW)
    const g = new THREE.Group(); root.add(g);
    box(g, RW + .3, .95, .24, RW / 2 - .15, 0, -0.12, wallC); box(g, RW + .3, .55, .24, RW / 2 - .15, WH - .55, -0.12, wallC);
    const wins = [[.6, 2.6], [3.5, 1.2], [10.6, 1.8], [13.2, 1.4], [15.4, 1.0]]; { let cur = -0.25; for (const [x0, w] of [...wins, [RW + .3, 0]]) { if (x0 > cur) box(g, x0 - cur, 1.7, .24, (cur + x0) / 2, .95, -0.12, wallC); cur = x0 + w; } }
    for (const [x0, w] of wins) { box(g, w, 1.7, .05, x0 + w / 2, .95, -0.12, null, { m: glass, cast: false }); for (let k = 0; k <= 1; k++) box(g, .08, 1.7, .12, x0 + k * w, .95, -0.1, frameC); box(g, w, .08, .12, x0 + w / 2, .95, -0.1, frameC); box(g, w, .08, .12, x0 + w / 2, 2.57, -0.1, frameC); box(g, .05, 1.7, .1, x0 + w / 2, .95, -0.1, frameC); }
    box(g, 5.5, 1.55, .05, 7.6, 1.03, .025, '#0b1424', { cast: false }); box(g, 5.62, .06, .07, 7.6, 1.0, .03, '#facc15', { cast: false }); box(g, 5.62, .06, .07, 7.6, 2.55, .03, '#facc15', { cast: false });

    return g;
  }
  function wallLeftX() {   // parede x=0 (de z=0 a RD)
    const g = new THREE.Group(); root.add(g);
    box(g, .24, .95, RD + .3, -0.12, 0, RD / 2 - .15, wallC); box(g, .24, .55, RD + .3, -0.12, WH - .55, RD / 2 - .15, wallC);
    for (const [z0, w] of [[.5, 1.9]]) { box(g, .05, 1.7, w, -0.12, .95, z0 + w / 2, null, { m: glass, cast: false }); for (let k = 0; k <= 1; k++) box(g, .12, 1.7, .08, -0.1, .95, z0 + k * w, frameC); box(g, .12, .08, w, -0.1, .95, z0 + w / 2, frameC); box(g, .12, .08, w, -0.1, 2.57, z0 + w / 2, frameC); }
    box(g, .24, 1.7, RD + .25 - 2.4, -0.12, .95, 2.4 + (RD + .25 - 2.4) / 2, wallC);
    return g;
  }
  wallBackZ(); wallLeftX();
  // quadro branco com post-its, relógio e estante na parede esquerda
  { const bd = box(root, .05, 1.15, 1.9, .03, 1.1, 3.6, '#ffffff'); box(root, .07, .06, 2.0, .03, 1.07, 3.6, '#9aa3b2'); box(root, .07, .06, 2.0, .03, 2.25, 3.6, '#9aa3b2');
    ['#8b5cf6', '#22d3ee', '#fb923c', '#34d399', '#f472b6', '#facc15'].forEach((c, i) => box(root, .02, .26, .3, .07, 1.3 + (i % 2) * .45 - ((i % 3) * .04), 2.8 + i * .29, c, { cast: false }));
    const clk = colorTex(128, 128, (c, w, h) => { c.fillStyle = '#fff'; c.beginPath(); c.arc(64, 64, 62, 0, 6.283); c.fill(); c.strokeStyle = '#222'; c.lineWidth = 4; c.stroke(); c.fillStyle = '#222'; for (let i = 0; i < 12; i++) { const a = i * .5236; c.fillRect(64 + Math.sin(a) * 50 - 2, 64 - Math.cos(a) * 50 - 2, 4, 4); } });
    const cm = new THREE.Mesh(new THREE.CircleGeometry(.24, 24), new THREE.MeshBasicMaterial({ map: clk })); cm.rotation.y = Math.PI / 2; cm.position.set(.05, 2.47, 3.6); root.add(cm); root.userData.clockMat = cm;
    for (let r = 0; r < 3; r++) { box(root, .5, .05, 1.9, .3, .75 + r * .55, 7.55, '#8a5a35'); const cs = ['#8b5cf6', '#22d3ee', '#f472b6', '#facc15', '#34d399', '#fb923c', '#60a5fa']; for (let i = 0; i < 9; i++) box(root, .22, .3 + hash01(r * 9 + i) * .12, .14, .3, .8 + r * .55, 6.7 + i * .2, cs[(i + r * 3) % cs.length], { cast: false }); } }
  // logo da agência na parede dos fundos (carrega a imagem do painel)
  const logoMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }); { const lm = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1.4), logoMat); lm.position.set(7.6, 1.8, .06); root.add(lm); }
  const setLogo = img => { if (!img || !img.complete || !img.naturalWidth) return false; const w = 1040, h = 280, t = colorTex(w, h, (c) => { const g = c.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#0b1424'); g.addColorStop(1, '#17233f'); c.fillStyle = g; c.fillRect(0, 0, w, h); const r = Math.min((w - 80) / img.naturalWidth, (h - 40) / img.naturalHeight); c.drawImage(img, (w - img.naturalWidth * r) / 2, (h - img.naturalHeight * r) / 2, img.naturalWidth * r, img.naturalHeight * r); }); logoMat.map = t; logoMat.needsUpdate = true; return true; };

  // TV de status na parede esquerda (números reais da fila, atualizados a cada poucos segundos)
  const tvC = document.createElement('canvas'); tvC.width = 512; tvC.height = 288; const tvT = new THREE.CanvasTexture(tvC); tvT.colorSpace = THREE.SRGBColorSpace;
  { const tv = new THREE.Mesh(new THREE.PlaneGeometry(1.5, .84), new THREE.MeshBasicMaterial({ map: tvT })); tv.rotation.y = Math.PI / 2; tv.position.set(.11, 1.7, 5.75); box(root, .06, .96, 1.62, .04, 1.22, 5.75, '#101318'); root.add(tv); }
  const tvDraw = (counts, busy) => { const c = tvC.getContext('2d'); c.fillStyle = '#0c1120'; c.fillRect(0, 0, 512, 288); c.fillStyle = '#facc15'; c.fillRect(0, 0, 512, 10); c.fillStyle = '#fff'; c.font = '800 30px Inter, system-ui, sans-serif'; c.fillText('PRODUÇÃO AO VIVO', 26, 62);
    const rows = [['Roteiro', counts.awaiting_script, '#8b5cf6'], ['Em produção', counts.producing, '#22d3ee'], ['Esperando você', counts.awaiting_approval, '#facc15'], ['Publicados', counts.done || counts.published, '#34d399']];
    rows.forEach(([l, n, col], i) => { const y = 108 + i * 44; c.fillStyle = col; c.fillRect(26, y - 22, 10, 30); c.fillStyle = '#cbd5e1'; c.font = '600 24px Inter, system-ui, sans-serif'; c.fillText(l, 48, y); c.fillStyle = '#fff'; c.font = '800 28px Inter, system-ui, sans-serif'; c.textAlign = 'right'; c.fillText(String(n || 0), 486, y); c.textAlign = 'left'; });
    c.fillStyle = busy ? '#34d399' : '#64748b'; c.beginPath(); c.arc(30, 268, 7, 0, 6.283); c.fill(); c.fillStyle = '#94a3b8'; c.font = '600 20px Inter, system-ui, sans-serif'; c.fillText(busy ? 'Equipe trabalhando' : 'Equipe disponível', 46, 275); tvT.needsUpdate = true; };

  // ───────── objetos de apoio: planta, bebedouro, sofá, rack do cérebro ─────────
  const plant = (x, z, s = 1) => { const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s); root.add(g); cyl(g, .26, .2, .42, 8, 0, 0, 0, '#f2f4f8'); cyl(g, .24, .24, .04, 8, 0, .4, 0, '#4a3322'); for (let i = 0; i < 7; i++) { const a = i / 7 * 6.283, l = new THREE.Mesh(new THREE.ConeGeometry(.12, .8 + hash01(i + x) * .3, 4), mat(i % 2 ? '#3f9e45' : '#52b653')); add(g, l, Math.cos(a) * .12, .85, Math.sin(a) * .12); l.rotation.z = Math.cos(a) * .5; l.rotation.x = -Math.sin(a) * .5; } return g; };
  [[RW - .6, .7, 1.2], [.7, 8.1, 1.1]].forEach(([x, z, s]) => plant(x, z, s));
  // rack do Cérebro
  const brain = new THREE.Group(); brain.position.set(1.15, 0, .75); root.add(brain);
  box(brain, .95, 2.1, .85, 0, 0, 0, '#1b2030'); const leds = []; for (let r = 0; r < 9; r++) for (let c = 0; c < 3; c++) { const m = emis('#34d399', .0); const l = new THREE.Mesh(new THREE.BoxGeometry(.07, .07, .03), m); add(brain, l, -.3 + c * .28, .25 + r * .2, .44, false, false); leds.push(m); }
  const brainOrb = new THREE.Mesh(new THREE.IcosahedronGeometry(.28, 1), emis('#facc15', .8)); brainOrb.position.set(0, 2.6, 0); brain.add(brainOrb); const brainLight = new THREE.PointLight(0xfacc15, .8, 5); brainLight.position.set(0, 2.5, .3); brain.add(brainLight);
  // área de aprovações (quiosque) ao lado do corredor
  { const k = new THREE.Group(); k.position.set(.55, 0, 6.2); root.add(k); box(k, .5, 1.0, .9, 0, 0, 0, '#ffffff'); box(k, .52, .06, .94, 0, 1.0, 0, '#facc15'); box(k, .08, .5, .8, .14, 1.06, 0, '#101318'); box(k, .02, .4, .66, .19, 1.1, 0, '#38bdf8', { cast: false, mo: { emissive: new THREE.Color('#38bdf8'), emissiveIntensity: .6 } }); }
  // bebedouro e copa
  { const g = new THREE.Group(); g.position.set(2.2, 0, .6); root.add(g); box(g, .5, .95, .5, 0, 0, 0, '#e8edf3'); cyl(g, .2, .2, .55, 10, 0, .95, 0, '#6cc4ff', { mo: { transparent: true, opacity: .75 } }); }
  // jardineira de madeira na frente da sala
  if (false) { const g = new THREE.Group(); g.position.set(3.2, -0.34, RD + .8); root.add(g); box(g, 3.2, .6, .6, 0, 0, 0, '#a2713f'); for (let i = 0; i < 7; i++) sph(g, .26 + hash01(i) * .1, -1.35 + i * .45, .72, 0, ['#4f9d3a', '#e8743b', '#f2b134', '#6fb544'][i % 4], { ws: 6, hs: 5 }); }
  if (false) { const g = new THREE.Group(); g.position.set(RW + .9, -0.34, 3.2); root.add(g); box(g, .6, .6, 3.0, 0, 0, 0, '#a2713f'); for (let i = 0; i < 6; i++) sph(g, .26, 0, .72, -1.2 + i * .48, ['#6fb544', '#e25d7a', '#f2b134'][i % 3], { ws: 6, hs: 5 }); }

  // ───────── pessoa (low-poly) ─────────
  function makeHuman({ id, shirt, skin = '#e2b48a', hair = '#2b2118', acc = '', boss = false, scale = 1 }) {
    const g = new THREE.Group(); g.scale.setScalar(scale);
    const hip = new THREE.Group(); g.add(hip); const parts = { shirt: [], pants: [] };
    const pantsC = boss ? '#1b2230' : '#2c3445', shirtC = boss ? '#2a3f8f' : shirt;
    const torso = new THREE.Group(); hip.add(torso);
    const body = box(torso, .44, .56, .26, 0, 0, 0, shirtC); parts.shirt.push(body);
    const belly = box(hip, .42, .12, .25, 0, -0.08, 0, pantsC); parts.pants.push(belly);
    if (boss) { box(torso, .06, .4, .02, 0, .08, .14, '#f4f4f5'); box(torso, .04, .3, .02, 0, .1, .15, '#facc15'); }
    const neck = cyl(torso, .05, .05, .1, 6, 0, .56, 0, skin);
    const head = new THREE.Group(); head.position.set(0, .68, 0); torso.add(head);
    sph(head, .15, 0, .12, 0, skin, { ws: 12, hs: 10 });
    const hr = sph(head, .165, 0, .17, -.015, hair, { ws: 12, hs: 8 }); hr.scale.set(1, .85, 1.02); hr.position.y = .2; hr.geometry = new THREE.SphereGeometry(.165, 12, 7, 0, 6.283, 0, 1.8);
    sph(head, .018, -.05, .13, .14, '#1a1a1a', { cast: false, ws: 5, hs: 4 }); sph(head, .018, .05, .13, .14, '#1a1a1a', { cast: false, ws: 5, hs: 4 });
    if (acc === 'oculos' || boss) { box(head, .09, .06, .015, -.055, .1, .15, '#111827', { cast: false, mo: { transparent: true, opacity: .8 } }); box(head, .09, .06, .015, .055, .1, .15, '#111827', { cast: false, mo: { transparent: true, opacity: .8 } }); }
    if (acc === 'longo') { box(head, .06, .38, .12, -.15, -.06, -.02, hair); box(head, .06, .38, .12, .15, -.06, -.02, hair); box(head, .34, .3, .06, 0, -.04, -.12, hair); }
    if (acc === 'barba') { const b = sph(head, .12, 0, .03, .06, hair, { ws: 8, hs: 6 }); b.scale.set(1, .7, .8); }
    if (boss) { const cr = new THREE.Group(); cr.position.set(0, .34, 0); head.add(cr); cyl(cr, .13, .13, .06, 8, 0, 0, 0, '#facc15'); for (let i = 0; i < 5; i++) { const a = i / 5 * 6.283; const sp = new THREE.Mesh(new THREE.ConeGeometry(.032, .09, 4), mat('#facc15')); add(cr, sp, Math.cos(a) * .12, .09, Math.sin(a) * .12, true, false); } }
    const arm = (sx) => { const sh = new THREE.Group(); sh.position.set(sx * .27, .5, 0); torso.add(sh); const up = box(sh, .13, .3, .13, 0, -0.3, 0, shirtC); parts.shirt.push(up); const el = new THREE.Group(); el.position.set(0, -0.3, 0); sh.add(el); box(el, .11, .26, .11, 0, -0.26, 0, skin); sph(el, .065, 0, -0.29, 0, skin, { ws: 6, hs: 5 }); return { sh, el }; };
    const aL = arm(-1), aR = arm(1);
    const leg = (sx) => { const th = new THREE.Group(); th.position.set(sx * .11, -0.05, 0); hip.add(th); const t = box(th, .17, .43, .18, 0, -0.43, 0, pantsC); parts.pants.push(t); const kn = new THREE.Group(); kn.position.set(0, -0.43, 0); th.add(kn); const s = box(kn, .15, .42, .16, 0, -0.42, 0, pantsC); parts.pants.push(s); box(kn, .16, .09, .26, 0, -0.44, .05, boss ? '#111' : '#f4f4f5'); return { th, kn }; };
    const lL = leg(-1), lR = leg(1);
    return { g, hip, torso, head, aL, aR, lL, lR, parts, boss, baseShirt: shirtC };
  }
  const setGray = (rig, on, shirt) => { for (const m of rig.parts.shirt) m.material = mat(on ? rig.baseShirt : '#4b5563'); for (const m of rig.parts.pants) m.material = mat(on ? (rig.boss ? '#1b2230' : '#2c3445') : '#2f3440'); };
  const poseSit = (r, t, o) => {   // sentado: digitando, esperando (mão levantada) ou parado
    r.hip.position.set(0, .5, 0); const typ = o.working ? Math.sin(t / 95) : Math.sin(t / 900) * .15;
    r.torso.rotation.x = o.working ? .16 + Math.sin(t / 700) * .02 : .02 + Math.sin(t / 1300) * .015; r.head.rotation.x = o.working ? -.12 : 0; r.head.rotation.y = o.working ? Math.sin(t / 1300 + o.k) * .12 : Math.sin(t / 2400 + o.k) * .25;
    for (const [sd, l, a] of [[0, r.lL, r.aL], [1, r.lR, r.aR]]) { l.th.rotation.x = -1.5; l.kn.rotation.x = 1.5 - .05; a.sh.rotation.x = -.62 + (o.working ? typ * .06 * (sd ? 1 : -1) : 0); a.el.rotation.x = -.95 + (o.working ? Math.sin(t / 80 + sd * 2) * .12 : 0); a.sh.rotation.z = 0; }
    if (o.waiting) { r.aR.sh.rotation.x = -2.9 + Math.sin(t / 160) * .2; r.aR.el.rotation.x = -.3; r.aR.sh.rotation.z = -.15; }
  };
  const poseWalk = (r, t, o) => {
    r.hip.position.set(0, .86 + (o.moving ? Math.abs(Math.sin(t / 150 + o.k)) * .035 : 0), 0); r.torso.rotation.x = 0; r.head.rotation.x = 0; const ph = o.moving ? Math.sin(t / 150 + o.k) : 0;
    r.lL.th.rotation.x = ph * .7; r.lR.th.rotation.x = -ph * .7; r.lL.kn.rotation.x = Math.max(0, -ph) * .8; r.lR.kn.rotation.x = Math.max(0, ph) * .8;
    r.aL.sh.rotation.x = -ph * .55; r.aL.el.rotation.x = -.15; r.aR.sh.rotation.x = -.55; r.aR.el.rotation.x = -.9; r.aL.sh.rotation.z = 0; r.aR.sh.rotation.z = 0;
    if (o.boss) { r.aR.sh.rotation.x = -.8; r.aR.el.rotation.x = -.6; }
  };

  // ───────── baias (um posto por agente) ─────────
  const stations = {}; const flowSeat = id => [POS[id][0] + .25, POS[id][1] + .92];
  const monitorTex = {};
  const makeMonitorTex = (id, col) => { const c = document.createElement('canvas'); c.width = 192; c.height = 112; const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; monitorTex[id] = { c, t, last: -1e9, col }; return monitorTex[id]; };
  const drawMonitor = (m, t, working, enabled, id, k = 0) => { const c = m.c.getContext('2d'), col = m.col; c.fillStyle = enabled ? '#08131d' : '#050607'; c.fillRect(0, 0, 192, 112); if (!enabled) { m.t.needsUpdate = true; return; }
    c.fillStyle = col; c.globalAlpha = .9; c.fillRect(0, 0, 192, 12); c.globalAlpha = 1;
    if (id === 'editor') { for (let i = 0; i < 5; i++) { c.fillStyle = col; c.globalAlpha = .55 + .3 * Math.sin(t / 400 + i + k); const x = 8 + ((i * 38 + (working ? t / 25 : 0)) % 150); c.fillRect(x, 24 + i * 15, 24 + hash01(i + k) * 30, 9); } c.globalAlpha = 1; c.fillStyle = '#fff3'; c.fillRect(6, 98, 180, 6); c.fillStyle = col; c.fillRect(6, 98, ((working ? t / 40 : 60) % 180), 6); }
    else if (id === 'designer') { ['#f472b6', '#8b5cf6', '#22d3ee', '#facc15', '#34d399'].forEach((cc, i) => { c.fillStyle = cc; c.fillRect(10 + i * 34, 24, 28, 22 + (working ? 14 * Math.sin(t / 300 + i) : 6)); }); c.fillStyle = '#ffffff22'; c.fillRect(10, 62, 172, 38); }
    else for (let i = 0; i < 7; i++) { c.fillStyle = i % 3 ? col : '#cbd5e1'; c.globalAlpha = .55 + (working ? .4 * Math.sin(t / 250 + i * 1.7) : .12); c.fillRect(10, 22 + i * 12, (.25 + .6 * hash01(i + Math.floor(working ? t / 700 : 0) + k)) * 170, 6); }
    c.globalAlpha = 1; m.t.needsUpdate = true; };

  const baiaUp = new THREE.Group(); root.add(baiaUp);
  function buildStation(id, col) {
    const [cx, cy] = POS[id]; const boss = id === 'chefe'; const S = { id, col, cx, cy };
    const g = new THREE.Group(); g.position.set(cx, 0, cy); root.add(g); S.g = g;
    const tone = c => new THREE.Color(c).lerp(new THREE.Color('#ffffff'), .5).getStyle();
    // divisórias da baia
    if (!boss) {
      const pc = '#d9dfe8';
      box(g, 2.6, 1.25, .08, 0, 0, -1.0, pc); box(g, 2.6, .05, .1, 0, 1.25, -1.0, col);
      for (const sx of [-1.3, 1.3]) { box(g, .08, 1.2, 1.85, sx, 0, -.08, pc); box(g, .1, .05, 1.85, sx, 1.2, -.08, col); }
      // post-its e plaquinha na divisória do fundo
      for (let i = 0; i < 4; i++) box(g, .16, .16, .01, -.9 + i * .3 + hash01(i + cx) * .1, .85 + (i % 2) * .22, -.94, ['#fde68a', '#fca5a5', '#a7f3d0', '#bfdbfe'][i], { cast: false });
      box(g, .62, .13, .02, .65, .72, -.94, col, { cast: false });
    }
    // mesa
    const dw = boss ? 2.2 : 1.9, dd = boss ? 1.0 : .8, top = boss ? '#5a3d1e' : '#f5efe6', leg = boss ? '#2a1c0d' : '#aab3c0';
    const dz = boss ? -.2 : -.15;
    box(g, dw, .06, dd, 0, .72, dz, top); for (const sx of [-1, 1]) box(g, .06, .72, dd - .1, sx * (dw / 2 - .08), 0, dz, leg);
    box(g, dw - .2, .2, .04, 0, .5, dz - dd / 2 + .1, leg);
    box(g, .46, .62, dd - .12, dw / 2 - .4, .06, dz, boss ? '#3b2a14' : '#e8e1d4'); for (let i = 0; i < 3; i++) box(g, .38, .015, .02, dw / 2 - .4, .17 + i * .19, dz + dd / 2 - .045, '#9aa3b2', { cast: false });
    // monitores
    const dual = id === 'editor', mons = dual ? [-.55, .55] : [.1];
    S.screens = [];
    for (const [i, mx] of mons.entries()) { const mt = makeMonitorTex(id + i, col); const sw = dual ? .82 : .95, sh = sw * .58;
      box(g, .12, .03, .24, mx, .78, dz - .12, '#14171c'); box(g, .04, .22, .04, mx, .78, dz - .12, '#14171c'); box(g, sw + .05, sh + .05, .035, mx, .98, dz - .12, '#0f1318');
      const m = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), new THREE.MeshBasicMaterial({ map: mt.t })); m.position.set(mx, .98 + (sh + .05) / 2, dz - .12 + .02); g.add(m); S.screens.push({ mt, mesh: m, k: i }); }
    box(g, .56, .018, .2, mons[0] * .5 + .1, .78, dz + .22, '#20242b'); box(g, .08, .015, .12, mons[0] * .5 + .6, .78, dz + .22, '#20242b');
    // caneca, luminária
    cyl(g, .05, .045, .1, 8, dw / 2 - .75, .78, dz + .12, boss ? '#e7e5e4' : col);
    box(g, .12, .02, .12, -dw / 2 + .2, .78, dz - .2, '#1a1d22'); cyl(g, .012, .012, .38, 5, -dw / 2 + .2, .8, dz - .2, '#2a2f38'); const lh = sph(g, .075, -dw / 2 + .2, 1.2, dz - .12, '#facc15', { m: emis('#facc15', .0), cast: false, ws: 8, hs: 6 }); S.lamp = lh;
    // adereços por função
    if (id === 'radar') { const d = new THREE.Mesh(new THREE.SphereGeometry(.2, 10, 6, 0, 6.283, 0, 1.2), mat('#e5e7eb', { side: THREE.DoubleSide })); add(g, d, -.8, .86, dz - .05); d.rotation.x = -.8; cyl(g, .01, .01, .2, 5, -.8, .78, dz - .05, '#888'); }
    if (id === 'roteirista') { box(g, .32, .06, .24, -.75, .78, dz + .1, '#f5f0e1'); box(g, .3, .05, .22, -.74, .84, dz + .1, '#e8dfc8'); box(g, .3, .04, .22, -.76, .89, dz + .1, '#f5f0e1'); }
    if (id === 'revisorcopy') { cyl(g, .09, .09, .02, 12, -.75, .78, dz + .1, '#e5e7eb'); const l = new THREE.Mesh(new THREE.TorusGeometry(.09, .012, 6, 14), mat('#ef4444')); add(g, l, -.75, .9, dz + .1); l.rotation.x = Math.PI / 2; }
    if (id === 'designer') { box(g, .45, .015, .3, -.7, .78, dz + .15, '#1c1f26'); for (let i = 0; i < 5; i++) box(g, .06, .06, .02, -.9 + i * .08, .8, dz - .02, ['#f472b6', '#8b5cf6', '#22d3ee', '#facc15', '#34d399'][i], { cast: false }); }
    if (id === 'editor') { const hp = new THREE.Mesh(new THREE.TorusGeometry(.12, .02, 6, 14, Math.PI), mat('#111827')); add(g, hp, -.95, .9, dz + .15); }
    if (id === 'publicador') { box(g, .34, .26, .02, -.75, .78, dz - .05, '#ffffff'); box(g, .34, .06, .025, -.75, 1.0, dz - .05, '#ef4444'); }
    if (id === 'gerente') { box(g, .3, .03, .38, -.75, .78, dz + .12, '#e7e5e4'); box(g, .12, .005, .08, -.75, .81, dz + .12, '#16a34a', { cast: false }); }
    if (boss) { cyl(g, .12, .14, .06, 8, -.8, .78, dz, '#d9b44a'); sph(g, .13, -.8, .96, dz, '#d9b44a', { ws: 10, hs: 8 }); const bs = box(g, .1, .6, .03, .9, .78, dz + .3, '#8b5cf6'); bs.visible = false; }
    // cadeira
    const [sx, sy] = flowSeat(id), px = sx - cx, pz = Math.min(sy - cy, .78);
    const ch = new THREE.Group(); ch.position.set(px, 0, pz); g.add(ch); S.chair = ch;
    cyl(ch, .04, .04, .35, 6, 0, .08, 0, '#20242b'); for (let i = 0; i < 5; i++) { const a = i / 5 * 6.283; box(ch, .3, .03, .05, Math.cos(a) * .15, .05, Math.sin(a) * .15, '#20242b').rotation.y = -a; }
    box(ch, .52, .09, .5, 0, .42, 0, boss ? '#7c2d12' : col); const back = box(ch, .5, .62, .08, 0, .5, .27, boss ? '#7c2d12' : col); back.scale.y = 1;
    // pessoa
    const rig = makeHuman({ id, shirt: boss ? '#2a3f8f' : col, skin: SKIN[id] || '#e2b48a', hair: HAIR[id] || '#222', acc: ACC[id] || '', boss: boss });
    rig.g.position.set(px, 0, pz - .02); rig.g.rotation.y = Math.PI; g.add(rig.g); S.rig = rig; setGray(rig, true);
    // aro de brilho (trabalhando)
    const ring = new THREE.Mesh(new THREE.RingGeometry(.9, 1.3, 40), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.set(0, .03, .4); g.add(ring); S.ring = ring;
    // fumaça da caneca (só quando livre)
    S.steam = []; for (let i = 0; i < 3; i++) { const s = sph(g, .03, dw / 2 - .75, .95, dz + .12, '#ffffff', { m: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }), cast: false, ws: 5, hs: 4 }); S.steam.push(s); }
    return S;
  }
  // tapete e plaquinha de cada baia
  for (const id of Object.keys(POS)) { if (id === 'chefe') continue; const [cx, cy] = POS[id]; box(root, 2.5, .018, 2.1, cx, 0, cy + .0, '#2b3142', { cast: false }); }
  // sala de vidro do Gerente
  { const gl = (x, z, w, d, h = 2.6) => box(root, w, h, d, x, 0, z, null, { m: glass, cast: false }); const gold = '#facc15', fx = 10.55 + GX, fz = 4.95, D0 = 13.0 + GX, D1 = 13.7 + GX;
    gl(fx + .02, (fz + RD) / 2, .04, RD - fz); gl((fx + D0) / 2, fz, D0 - fx, .04); gl(13.95 + GX, fz, .5, .04);
    box(root, .1, 2.65, .1, fx, 0, fz, gold); box(root, .1, 2.65, .1, fx, 0, RD, gold); box(root, .1, 2.65, .1, D0, 0, fz, gold); box(root, .1, 2.65, .1, D1, 0, fz, gold);
    box(root, .06, .08, RD - fz, fx, 2.6, (fz + RD) / 2, gold); box(root, 3.5, .08, .06, (fx + 14.05 + GX) / 2, 2.6, fz, gold); box(root, .06, .85, RD - fz, fx, 0, (fz + RD) / 2, '#ffffff'); box(root, D0 - fx, .85, .06, (fx + D0) / 2, 0, fz, '#ffffff'); box(root, .5, .85, .06, 13.95 + GX, 0, fz, '#ffffff');
    // estante e bandeira do Gerente
    box(root, .5, 1.6, 1.6, RW - .3, 0, 7.4, '#5a3d1e'); for (let r = 0; r < 4; r++) for (let i = 0; i < 6; i++) box(root, .25, .26 + hash01(r * 7 + i) * .08, .1, RW - .3, .12 + r * .38, 6.8 + i * .2, ['#8b5cf6', '#f472b6', '#22d3ee', '#facc15', '#fb923c', '#34d399'][(i + r) % 6], { cast: false });
    cyl(root, .015, .015, 1.5, 5, 11.3 + GX, 0, 8.2, '#999'); box(root, .02, .4, .6, 11.3 + GX, 1.1, 8.15, '#facc15', { cast: false }); }
  for (const id of Object.keys(POS)) stations[id] = buildStation(id, OFC[id] || '#d4d4d8');

  // ───────── mensageiros que andam (com papel/pendrive/HD) e o Gerente com o chicote ─────────
  const walkRigs = new Map();
  const itemMesh = (it, col) => { const g = new THREE.Group(); if (it === 'pendrive') { box(g, .06, .03, .2, 0, 0, 0, '#2563eb'); box(g, .04, .02, .08, 0, 0, .13, '#e5e7eb'); } else if (it === 'hd') { box(g, .22, .05, .3, 0, 0, 0, '#0f172a'); box(g, .04, .06, .04, .08, 0, .1, '#34d399', { cast: false }); } else { box(g, .22, .015, .3, 0, 0, 0, '#f8fafc'); box(g, .22, .018, .08, 0, 0, -.11, col); } return g; };
  const whipMat = new THREE.MeshStandardMaterial({ color: 0xc98a4b, roughness: .7 });
  const vtmp = new THREE.Vector3();

  // ───────── projeção para o painel (tags, balões) ─────────
  const proj = (x, y, z) => { vtmp.set(x, y, z).project(cam); return { x: (vtmp.x + 1) / 2 * W, y: (1 - vtmp.y) / 2 * H }; };
  const seat3 = id => { const S = stations[id]; return [S.cx + S.chair.position.x, S.cy + S.chair.position.z]; };

  let phaseKey = '', logoOk = false, tvAt = 0, frameInfo = { head: {}, walkers: [] };
  function applyPhase(ph) { const P = PHASES[ph] || PHASES.dia; scene.background = new THREE.Color('#0a0c11'); scene.fog = null; hemi.intensity = P.hemi; hemi.color.set(ph === 'noite' ? 0x4a5f9a : 0xbfe3ff); sun.color.set(P.sun); sun.intensity = P.si; for (const l of lamps) l.intensity = P.night * 9; renderer.toneMappingExposure = ph === 'noite' ? 1.25 : 1.05; }

  function render(M, cour, ST, t, extra = {}) {
    const ph = skyPhase(); if (ph !== phaseKey) { phaseKey = ph; applyPhase(ph); }
    if (!logoOk) logoOk = setLogo(extra.logo);
    if (t - tvAt > 2500) { tvAt = t; tvDraw(extra.counts || {}, M.anyBusy); }
    const night = (PHASES[ph] || PHASES.dia).night;
    const away = new Set(cour.map(w => w.from));
    // cérebro
    brainOrb.rotation.y = t / 1500; brainOrb.position.y = 2.6 + Math.sin(t / 700) * .08; brainOrb.material.emissiveIntensity = M.anyBusy ? .9 + .4 * Math.sin(t / 220) : .5; brainLight.intensity = M.anyBusy ? 1.4 : .6;
    leds.forEach((m, i) => { const on = M.anyBusy ? Math.sin(t / 130 + i * 1.7) > -.1 : Math.sin(t / 900 + i) > .85; m.emissiveIntensity = on ? 1.4 : .05; m.color.set(i % 7 === 0 ? '#facc15' : '#34d399'); m.emissive.set(i % 7 === 0 ? '#facc15' : '#34d399'); });
    // estações
    const heads = {};
    for (const s of M.st) {
      const S = stations[s.id]; if (!S) continue; const on = s.enabled, wk = s.working && on, wt = s.waiting && on;
      const shake = (ST.shake?.[s.id] || 0) > t ? Math.sin(t / 25) * .03 : 0; S.g.position.x = S.cx + shake;
      S.rig.g.visible = !away.has(s.id); if (S.rig._on !== on) { S.rig._on = on; setGray(S.rig, on); }
      poseSit(S.rig, t, { working: wk, waiting: wt, k: s.id.length });
      for (const sc of S.screens) { const m = sc.mt; if (t - m.last > (wk ? 130 : 900)) { m.last = t; drawMonitor(m, t, wk, on, s.id, sc.k); } }
      S.lamp.material.emissiveIntensity = on ? (night > .5 ? 1.3 : .35) : 0; S.lamp.material.color.set(on ? '#facc15' : '#3a3f48');
      S.ring.material.opacity = wk ? .26 + .12 * Math.sin(t / 400) : 0; S.ring.scale.setScalar(1 + (wk ? .05 * Math.sin(t / 300) : 0));
      S.steam.forEach((st, i) => { const p = (t / 2600 + i * .33) % 1; st.material.opacity = on && !wk ? Math.sin(p * 3.14) * .5 : 0; st.position.y = .9 + p * .35; st.position.x = (S.cx > 0 ? 0 : 0) + (i - 1) * .03 + Math.sin(t / 500 + i) * .02 + (S.id === 'chefe' ? 0 : 0); });
      const [sx, sz] = seat3(s.id); heads[s.id] = { head: proj(sx, 1.65, sz), floor: proj(sx, 0, sz), shot: proj(sx, 1.15, sz) };
    }
    // mensageiros
    const seen = new Set(); frameInfo.walkers = [];
    for (const w of cour) {
      seen.add(w); let R = walkRigs.get(w);
      if (!R) { const A = M.st.find(x => x.id === w.from); R = { rig: makeHuman({ id: w.from, shirt: w.boss ? '#2a3f8f' : w.col, skin: SKIN[w.from] || '#e2b48a', hair: HAIR[w.from] || '#222', acc: w.boss ? '' : (ACC[w.from] || ''), boss: !!w.boss, scale: 1.0 }) }; R.rig.g.rotation.order = 'YXZ'; scene.add(R.rig.g); if (!w.boss) { R.item = itemMesh(w.item || 'papel', w.col); R.rig.aR.el.add(R.item); R.item.position.set(0, -0.36, .05); R.item.rotation.x = -.3; } else { R.whip = new THREE.Mesh(new THREE.BufferGeometry(), whipMat); R.whip.castShadow = false; scene.add(R.whip); } walkRigs.set(w, R); R.lastX = w.x; R.lastY = w.y; R.face = 0; }
      const dx = w.x - R.lastX, dz = w.y - R.lastY; const moving = w.state !== 'wait' && Math.hypot(dx, dz) > .0005; if (moving) R.face = Math.atan2(dx, dz); R.lastX = w.x; R.lastY = w.y;
      if (!moving && w.state === 'wait' && w.tx != null) R.face = Math.atan2(w.tx - w.x, w.ty - w.y);
      R.rig.g.position.set(w.x, 0, w.y); R.rig.g.rotation.y += (((R.face - R.rig.g.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * .25;
      poseWalk(R.rig, t, { moving, boss: w.boss, k: w.born || 0 });
      if (w.boss && R.whip) {
        if (w.chicote > 0) {   // laço do chicote estala na direção do agente
          const a = w.chicote, reach = Math.max(0, Math.sin(a * 12.5)); R.rig.aR.sh.rotation.x = -1.2 - reach * .9; R.rig.aR.el.rotation.x = -.5;
          const hand = new THREE.Vector3(); R.rig.aR.el.updateWorldMatrix(true, false); hand.setFromMatrixPosition(R.rig.aR.el.matrixWorld); hand.y -= .25;
          const tgt = new THREE.Vector3(w.tx, 1.05, w.ty), end = hand.clone().lerp(tgt, .25 + .75 * reach); end.y += (1 - reach) * .5;
          const mid = hand.clone().lerp(end, .5); mid.y += .5 * (1 - reach) + .25;
          const curve = new THREE.QuadraticBezierCurve3(hand, mid, end); R.whip.geometry.dispose(); R.whip.geometry = new THREE.TubeGeometry(curve, 14, .032, 5, false); R.whip.visible = true;
          R.whipEnd = { x: end.x, y: end.y, z: end.z, reach };
        } else { R.whip.visible = false; R.whipEnd = null; }
      }
      const hd = proj(w.x, 1.95, w.y); frameInfo.walkers.push({ w, head: hd, whip: R.whipEnd ? { ...proj(R.whipEnd.x, R.whipEnd.y, R.whipEnd.z), reach: R.whipEnd.reach } : null });
    }
    for (const [w, R] of walkRigs) if (!seen.has(w)) { scene.remove(R.rig.g); if (R.whip) { scene.remove(R.whip); R.whip.geometry.dispose(); } walkRigs.delete(w); }
    renderer.render(scene, cam);
    frameInfo.head = heads; return frameInfo;
  }
  const pick = (px, py) => { let best = null, bd = 1e9; for (const [id, h] of Object.entries(frameInfo.head || {})) { const d = Math.hypot(px - h.shot.x, (py - h.shot.y) * 1.2); if (d < bd) { bd = d; best = id; } } return bd < 70 ? best : null; };
  const tagPos = id => { const S = stations[id]; const [sx, sz] = seat3(id); return proj(sx, 1.9, sz); };
  return { canvas, render, pick, tagPos, proj, dispose() { renderer.dispose(); } };
}
