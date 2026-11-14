// Escritório 3D (como no protótipo 02): piso escuro em grade, uma mesa por agente em volta do Gerente (centro, com luz dourada),
// linhas do Gerente até cada agente (azul trabalhando, vermelha parado), cartão flutuante com a tarefa e telão "AO VIVO" ao fundo.
import * as THREE from '/three.module.min.js';

export function criarEscritorio(el, { onPick } = {}) {
  const W = () => el.clientWidth, H = () => el.clientHeight;
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.setSize(W(), H());
  renderer.shadowMap.enabled = true; renderer.toneMapping = THREE.ACESFilmicToneMapping;
  el.appendChild(renderer.domElement); renderer.domElement.style.display = 'block';
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x07080c); scene.fog = new THREE.Fog(0x07080c, 45, 90);
  const cam = new THREE.PerspectiveCamera(38, W() / H(), 0.1, 200);
  const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, ...o });
  const box = (w, h, d, c, x, y, z, p = scene, o) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c, o)); m.position.set(x, y + h / 2, z); m.castShadow = m.receiveShadow = true; p.add(m); return m; };

  // luz de fim de tarde em Manhattan: sol baixo entrando pelas janelas + luz fria de teto
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x4a4038, 1.25)); scene.add(new THREE.AmbientLight(0xffffff, .25));
  const sol = new THREE.DirectionalLight(0xffd2a0, 2.2); sol.position.set(-18, 16, -14); sol.castShadow = true; sol.shadow.mapSize.set(2048, 2048);
  Object.assign(sol.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26 }); sol.shadow.bias = -.0005; scene.add(sol);
  scene.background = new THREE.Color(0x1a2233); scene.fog = new THREE.Fog(0x1a2233, 70, 140);

  const tex = (w, h, fn, rep) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; fn(cv.getContext('2d'), w, h); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...rep); } return t; };
  // piso de porcelanato claro com juntas (escritório de advocacia em NY)
  const porcelanato = tex(512, 512, (g, w, h) => { g.fillStyle = '#cfcac2'; g.fillRect(0, 0, w, h); for (let k = 0; k < 3000; k++) { g.fillStyle = `rgba(${Math.random() < .5 ? '255,255,255' : '90,80,70'},${Math.random() * .06})`; g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 30, 1 + Math.random() * 2); } g.strokeStyle = 'rgba(80,70,60,.35)'; g.lineWidth = 2; for (let k = 0; k <= 2; k++) { g.beginPath(); g.moveTo(k * w / 2, 0); g.lineTo(k * w / 2, h); g.stroke(); g.beginPath(); g.moveTo(0, k * h / 2); g.lineTo(w, k * h / 2); g.stroke(); } }, [8, 6]);
  const nogueira = tex(256, 256, (g, w, h) => { g.fillStyle = '#4a2e1c'; g.fillRect(0, 0, w, h); for (let k = 0; k < 160; k++) { g.strokeStyle = `rgba(${Math.random() < .5 ? '30,15,8' : '110,70,40'},${.15 + Math.random() * .25})`; g.beginPath(); const y = Math.random() * h; g.moveTo(0, y); g.bezierCurveTo(w * .3, y + (Math.random() - .5) * 20, w * .7, y + (Math.random() - .5) * 20, w, y + (Math.random() - .5) * 10); g.stroke(); } });
  // skyline de Manhattan ao entardecer, em camadas (prédios distantes mais azulados)
  const skyline = tex(2048, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#2b3f66'); gr.addColorStop(.45, '#c98a6a'); gr.addColorStop(.75, '#f2c48a'); gr.addColorStop(1, '#f6d7a8'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const camada = (cor, jan, alt, larg, base) => { for (let x = -20; x < w;) { const bw = larg * (.6 + Math.random()), bh = alt * (.35 + Math.random() * .65); g.fillStyle = cor; g.fillRect(x, base - bh, bw, bh + 4);
      if (Math.random() < .12) { g.beginPath(); g.moveTo(x + bw * .2, base - bh); g.lineTo(x + bw / 2, base - bh - bh * .25); g.lineTo(x + bw * .8, base - bh); g.fill(); g.fillRect(x + bw / 2 - 1, base - bh - bh * .45, 2, bh * .2); }
      if (jan) for (let yy = base - bh + 5; yy < base - 3; yy += 7) for (let xx = x + 3; xx < x + bw - 3; xx += 5) { const r = Math.random(); g.fillStyle = r < .35 ? 'rgba(255,214,150,.9)' : r < .45 ? 'rgba(200,225,255,.6)' : 'rgba(0,0,0,.18)'; g.fillRect(xx, yy, 2.5, 3.5); }
      x += bw + 2; } };
    camada('#6f7896', false, 220, 50, h * .82); camada('#4a5168', true, 300, 70, h * .9); camada('#2a2e3c', true, 380, 90, h + 4);
  });
  { const piso = new THREE.Mesh(new THREE.PlaneGeometry(48, 36), new THREE.MeshStandardMaterial({ map: porcelanato, roughness: .22, metalness: .05 })); piso.rotation.x = -Math.PI / 2; piso.receiveShadow = true; scene.add(piso); }
  // fachada de vidro do chão ao teto (fundo e esquerda), com caixilhos pretos finos
  const vidroMat = new THREE.MeshPhysicalMaterial({ color: 0xcfe0ff, transparent: true, opacity: .12, roughness: .05, metalness: 0, transmission: 0 });
  for (const [w, x, z, ry] of [[48, 0, -18, 0], [36, -24, 0, Math.PI / 2]]) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g);
    const vista = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.6, 13), new THREE.MeshBasicMaterial({ map: skyline })); vista.position.set(0, 5.5, -6); g.add(vista);
    const v = new THREE.Mesh(new THREE.PlaneGeometry(w, 9), vidroMat); v.position.set(0, 4.5, 0); g.add(v);
    for (let k = -w / 2; k <= w / 2 + .01; k += 3) box(.1, 9, .14, 0x111214, k, 0, 0, g, { metalness: .7, roughness: .35 });
    box(w, .14, .14, 0x111214, 0, 3, 0, g, { metalness: .7 }); box(w, .25, .3, 0x111214, 0, 9, 0, g); box(w, .35, .4, 0x2a2a2e, 0, 0, 0, g);
  }
  // divisórias de vidro e sala de reunião envidraçada (canto direito)
  const divisoria = (w, x, z, ry) => { const p = new THREE.Mesh(new THREE.BoxGeometry(w, 3.2, .05), new THREE.MeshStandardMaterial({ color: 0xe8f0ff, transparent: true, opacity: .18, roughness: .1 })); p.position.set(x, 1.6, z); p.rotation.y = ry; scene.add(p); const t = new THREE.Mesh(new THREE.BoxGeometry(w, .06, .07), mat(0x111214, { metalness: .7 })); t.position.set(x, 3.2, z); t.rotation.y = ry; scene.add(t); };
  divisoria(10, 17, -9, 0); divisoria(8, 12, -13, Math.PI / 2);
  box(6, .08, 2.2, 0x1c1c1c, 18, .95, -13.5, scene, { roughness: .1, metalness: .4 }); box(.15, .95, .15, 0x111214, 18, 0, -13.5);
  for (let k = 0; k < 6; k++) box(.6, .9, .6, 0x2b2b30, 15.8 + (k % 3) * 2.2, 0, k < 3 ? -15 : -12, scene, { roughness: .5 });
  // estante de nogueira com livros na parede direita
  { const g = new THREE.Group(); g.position.set(23.5, 0, 4); g.rotation.y = -Math.PI / 2; scene.add(g); const nm = new THREE.MeshStandardMaterial({ map: nogueira, roughness: .5 });
    const est = new THREE.Mesh(new THREE.BoxGeometry(10, 4.2, .6), nm); est.position.y = 2.1; g.add(est);
    for (let r = 0; r < 4; r++) for (let x = -4.6; x < 4.6;) { const bw = .12 + Math.random() * .12, bh = .55 + Math.random() * .3; const b = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, .4), mat(new THREE.Color().setHSL(Math.random(), .35, .2 + Math.random() * .25))); b.position.set(x, .35 + r * 1 + bh / 2, .12); g.add(b); x += bw + .02; } }
  // tapete e luz quente sobre o Gerente
  { const t = new THREE.Mesh(new THREE.CircleGeometry(4.6, 64), mat(0x2b2f3a, { roughness: 1 })); t.rotation.x = -Math.PI / 2; t.position.set(0, .02, -5); t.receiveShadow = true; scene.add(t);
    const borda = new THREE.Mesh(new THREE.RingGeometry(4.4, 4.6, 64), new THREE.MeshBasicMaterial({ color: 0xc9a040 })); borda.rotation.x = -Math.PI / 2; borda.position.set(0, .03, -5); scene.add(borda);
    const l = new THREE.SpotLight(0xffe2b0, 60, 18, .6, .5); l.position.set(0, 9, -5); l.target.position.set(0, 0, -5); scene.add(l, l.target); }
  // luminárias lineares, plantas e lounge de couro
  for (const z of [-6, 2]) { const p = new THREE.PointLight(0xfff1dc, 18, 16); p.position.set(-2, 7.8, z); scene.add(p); }
  const planta = (x, z, s = 1) => { const vaso = new THREE.Mesh(new THREE.CylinderGeometry(.42 * s, .34 * s, .9 * s, 24), mat(0xe8e4dc, { roughness: .4 })); vaso.position.set(x, .45 * s, z); vaso.castShadow = true; scene.add(vaso); for (let k = 0; k < 14; k++) { const f = new THREE.Mesh(new THREE.ConeGeometry(.12 * s, 1.4 * s, 5), mat(new THREE.Color().setHSL(.28 + Math.random() * .06, .5, .2 + Math.random() * .12))); const a = Math.random() * Math.PI * 2; f.position.set(x + Math.cos(a) * .2 * s, (1.3 + Math.random() * .5) * s, z + Math.sin(a) * .2 * s); f.rotation.set(Math.cos(a) * .5, 0, Math.sin(a) * .5); f.castShadow = true; scene.add(f); } };
  for (const [x, z] of [[-22, -16], [22, -16], [-22, 15], [10, -16], [-10, -16]]) planta(x, z, 1.3);
  box(5, .45, 1.8, 0x3a2418, -17, 0, 12, scene, { roughness: .45 }); box(5, 1.1, .45, 0x3a2418, -17, 0, 12.9, scene, { roughness: .45 }); box(2, .4, 1.1, 0x1a1a1a, -17, 0, 9.8, scene, { roughness: .15, metalness: .5 });

  // telão na parede do fundo, de frente para a câmera
  const telao = new THREE.Group(); telao.position.set(0, 0, -17.6); scene.add(telao);
  box(12.8, 7.4, .25, 0x05070c, 0, 1.2, -.15, telao);
  const tela = new THREE.Mesh(new THREE.PlaneGeometry(12.2, 6.86), new THREE.MeshBasicMaterial({ color: 0x0b1a10 })); tela.position.set(0, 4.9, .02); telao.add(tela);

  const pessoas = new Map(), pick = [], gerentePos = new THREE.Vector3(0, 0, -5);
  const pele = [0xe8c0a0, 0xc68e64, 0x8d5a3b, 0xf1d0b5, 0xa86f4c, 0x5c3a24];
  const ternos = [0x1c2433, 0x2b2b2e, 0x3a3f4a, 0x111111, 0x24304a, 0x4a3a2a];
  const roupa = ternos;
  // pessoa de terno (estilo escritório de advocacia): proporções reais, rosto, cabelo, camisa, gravata e mãos
  function pessoa(cor, k) {
    const g = new THREE.Group(), pel = new THREE.MeshStandardMaterial({ color: pele[k % pele.length], roughness: .55 }), terno = mat(ternos[k % ternos.length], { roughness: .65 }), camisa = mat(0xf2f2f0, { roughness: .6 }), calca = mat(ternos[k % ternos.length], { roughness: .7 });
    const gravata = mat(cor, { roughness: .5 }), cabelo = mat([0x1a120c, 0x3a2414, 0x6b4a2a, 0x0e0e0e, 0xb08a4a, 0x2a1a10][k % 6], { roughness: .85 });
    const cad = mat(0x141416, { roughness: .35, metalness: .2 }), cromo = mat(0xb8bcc4, { roughness: .2, metalness: .9 });
    const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.scale.set(sx, sy, sz); o.castShadow = true; g.add(o); return o; };
    // cadeira executiva de couro
    add(new THREE.BoxGeometry(.9, .14, .85), cad, 0, .6, .05); add(new THREE.CapsuleGeometry(.4, .7, 4, 12), cad, 0, 1.35, .48, 0, 0, 0, 1.05, 1, .3);
    add(new THREE.CylinderGeometry(.05, .05, .5), cromo, 0, .33, .05); for (let a = 0; a < 5; a++) add(new THREE.BoxGeometry(.06, .05, .5), cromo, Math.sin(a * 1.256) * .22, .06, .05 + Math.cos(a * 1.256) * .22, 0, a * 1.256);
    // pernas sentadas
    for (const s of [-1, 1]) { add(new THREE.CapsuleGeometry(.105, .4, 4, 10), calca, s * .13, .74, -.2, Math.PI / 2); add(new THREE.CapsuleGeometry(.095, .42, 4, 10), calca, s * .13, .38, -.44); add(new THREE.BoxGeometry(.15, .09, .32), mat(0x0c0c0c, { roughness: .3 }), s * .13, .05, -.52); }
    // tronco: camisa, paletó aberto e gravata
    const tronco = add(new THREE.CapsuleGeometry(.24, .48, 6, 16), camisa, 0, 1.2, .02, .08, 0, 0, 1.1, 1, .72);
    for (const s of [-1, 1]) add(new THREE.CapsuleGeometry(.17, .5, 6, 12), terno, s * .15, 1.2, .05, .08, 0, s * .06, 1, 1, .8);
    add(new THREE.BoxGeometry(.07, .4, .03), gravata, 0, 1.28, -.155, .08);
    // ombros e braços (antebraços para frente, mãos no teclado)
    for (const s of [-1, 1]) { add(new THREE.SphereGeometry(.13, 12, 10), terno, s * .3, 1.48, .03); add(new THREE.CapsuleGeometry(.085, .36, 4, 10), terno, s * .33, 1.26, -.06, -.5);
      add(new THREE.CapsuleGeometry(.075, .3, 4, 10), terno, s * .27, 1.1, -.36, -1.35); add(new THREE.SphereGeometry(.075, 12, 10), pel, s * .24, 1.07, -.56, 0, 0, 0, .9, .7, 1.2); }
    // pescoço, cabeça com queixo, orelhas, olhos, sobrancelhas e cabelo
    add(new THREE.CylinderGeometry(.085, .095, .14, 12), pel, 0, 1.62, .02);
    const cab = new THREE.Group(); cab.position.set(0, 1.84, 0); g.add(cab);
    const ca = (geo, m, x, y, z, sx = 1, sy = 1, sz = 1) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = true; cab.add(o); return o; };
    ca(new THREE.SphereGeometry(.2, 24, 20), pel, 0, 0, 0, .9, 1.12, 1); ca(new THREE.SphereGeometry(.14, 16, 12), pel, 0, -.1, -.05, 1, .8, 1);
    for (const s of [-1, 1]) { ca(new THREE.SphereGeometry(.045, 10, 8), pel, s * .18, -.01, .01, .5, 1, .8); ca(new THREE.SphereGeometry(.025, 10, 8), mat(0x1a1410, { roughness: .2 }), s * .07, .03, -.17); ca(new THREE.BoxGeometry(.08, .015, .02), cabelo, s * .07, .085, -.175); }
    ca(new THREE.ConeGeometry(.03, .08, 8), pel, 0, -.02, -.2, 1, 1, 1).rotation.x = -Math.PI / 2;
    const corte = k % 3;
    if (corte === 0) ca(new THREE.SphereGeometry(.205, 24, 14, 0, Math.PI * 2, 0, Math.PI * .5), cabelo, 0, .03, .01, .93, 1.05, 1.03);
    else if (corte === 1) { ca(new THREE.SphereGeometry(.21, 24, 14, 0, Math.PI * 2, 0, Math.PI * .55), cabelo, 0, .03, .015, .95, 1.1, 1.05); ca(new THREE.CapsuleGeometry(.16, .25, 4, 12), cabelo, 0, -.15, .1, 1.15, 1, .6); }
    else ca(new THREE.SphereGeometry(.203, 24, 14, 0, Math.PI * 2, 0, Math.PI * .42), cabelo, 0, .04, .02, .92, 1, 1);
    g.userData.cab = cab; g.userData.tronco = tronco;
    return g;
  }

  const card = (cls) => { const d = document.createElement('div'); d.className = cls; el.appendChild(d); return d; };
  function mesa(x, z, rotY, cor, k, gerente) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY; scene.add(g);
    { const tp = new THREE.Mesh(new THREE.BoxGeometry(2.8, .08, 1.4), new THREE.MeshStandardMaterial({ map: nogueira, roughness: .35 })); tp.position.set(0, 1.16, 0); tp.castShadow = tp.receiveShadow = true; g.add(tp); } for (const sx of [-1.25, 1.25]) box(0.08, 1.12, 1.25, 0x18181c, sx, 0, 0, g, { metalness: .6, roughness: .3 });
    box(0.06, 0.3, 0.06, 0x18181c, 0, 1.22, -0.45, g); const mon = box(1.3, 0.78, 0.05, 0x10131a, 0, 1.5, -0.45, g, { emissive: 0x000000 });
    box(0.7, 0.04, 0.3, 0x111521, 0, 1.22, 0.1, g); box(0.18, 0.22, 0.18, 0xe5e7eb, 0.9, 1.22, 0.2, g);
    const p = pessoa(cor, k); p.position.set(0, 0, 1.05); g.add(p);
    return { g, mon, p };
  }
  const linhas = new Map();
  function montar(agentes) {
    const lista = agentes.filter(a => a.id !== 'chefe');
    lista.forEach((a, k) => {
      if (pessoas.has(a.id)) return;
      const por = 4, fil = Math.floor(k / por), col = k % por, x = (col - (por - 1) / 2) * 5.2, z = 1.5 + fil * 4.6;
      const m = mesa(x, z, 0, a.color || roupa[k % roupa.length], k);
      const d = { a, ...m, casa: new THREE.Vector3(x, 0, z), cardEl: card('ecard'), nomeEl: card('enome'), estado: 'descansando', t: Math.random() * 10 };
      m.g.traverse(o => { o.userData = { agente: a.id }; if (o.isMesh) pick.push(o); });
      const curva = new THREE.QuadraticBezierCurve3(gerentePos.clone().setY(1.6), new THREE.Vector3(x / 2, 4.5, z / 2), new THREE.Vector3(x, 1.6, z));
      const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curva.getPoints(40)), new THREE.LineBasicMaterial({ color: 0x3b6cf0, transparent: true, opacity: 0.8 })); scene.add(ln); linhas.set(a.id, ln);
      pessoas.set(a.id, d);
    });
    if (!pessoas.has('chefe')) { const g = agentes.find(a => a.id === 'chefe') || { id: 'chefe', name: 'Gerente' }; const m = mesa(0, -5, 0, 0xc9a040, 7, true); m.mon.material.emissive.setHex(0x8a6a20); m.g.traverse(o => { o.userData = { agente: 'chefe' }; if (o.isMesh) pick.push(o); }); pessoas.set('chefe', { a: g, ...m, casa: gerentePos, cardEl: card('ecard'), nomeEl: card('enome'), estado: 'trabalhando', t: 0 }); }
  }
  // info[id] = { texto, sub, prog } vindo do painel
  function atualizar(agentes, parados = new Set(), info = {}) {
    montar(agentes);
    for (const a of agentes) {
      const d = pessoas.get(a.id); if (!d) continue;
      d.estado = !a.enabled ? 'desligado' : parados.has(a.id) ? 'parado' : a.working || a.queued || a.id === 'chefe' ? 'trabalhando' : 'descansando';
      d.info = info[a.id] || {}; d.nome = (a.name || '') + (d.estado === 'descansando' ? ' · zz' : '');
      const ln = linhas.get(a.id); if (ln) { ln.material.color.setHex(d.estado === 'parado' ? 0xe05555 : d.estado === 'trabalhando' ? 0x3b6cf0 : 0x3a4258); ln.material.opacity = d.estado === 'descansando' ? 0.35 : 0.85; }
    }
  }

  let sel = null; const ray = new THREE.Raycaster(), ms = new THREE.Vector2();
  renderer.domElement.addEventListener('click', e => { const r = renderer.domElement.getBoundingClientRect(); ms.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); ray.setFromCamera(ms, cam); const o = ray.intersectObjects(pick)[0]?.object; sel = o ? (sel === o.userData.agente ? null : o.userData.agente) : null; });
  let ang = 1.0, zoom = 1, arr = null;
  renderer.domElement.addEventListener('pointerdown', e => arr = { x: e.clientX, a: ang });
  addEventListener('pointerup', () => arr = null);
  renderer.domElement.addEventListener('pointermove', e => { if (arr) ang = Math.max(0.1, Math.min(1.2, arr.a + (e.clientX - arr.x) * 0.004)); });
  renderer.domElement.addEventListener('wheel', e => { e.preventDefault(); zoom = Math.max(0.6, Math.min(1.5, zoom + e.deltaY * 0.001)); }, { passive: false });

  let iframe = null; const aoVivo = card('aovivo'); aoVivo.textContent = 'AO VIVO'; aoVivo.style.display = 'none';
  function telaoVideo(id) {
    iframe?.remove(); iframe = null; aoVivo.style.display = id ? '' : 'none';
    if (!id) return;
    iframe = document.createElement('iframe');
    iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&mute=1&loop=1&playlist=${encodeURIComponent(id)}&controls=0&modestbranding=1&playsinline=1`;
    iframe.allow = 'autoplay; encrypted-media'; iframe.referrerPolicy = 'strict-origin-when-cross-origin'; iframe.style.cssText = 'position:absolute;left:0;top:0;border:0;pointer-events:none;transform-origin:0 0;z-index:2'; el.appendChild(iframe);
  }
  const v = new THREE.Vector3(), tela2d = p => { v.copy(p).project(cam); return [(v.x + 1) / 2 * W(), (1 - v.y) / 2 * H(), v.z]; };
  let raf, t0 = performance.now();
  function loop(now) {
    const t = (now - t0) / 1000, R = 24 * zoom;
    cam.position.set(Math.sin(ang - 0.62) * R, 15 * zoom, Math.cos(ang - 0.62) * R + 4); cam.lookAt(0, 1, -2);
    for (const d of pessoas.values()) {
      const tr = d.estado === 'trabalhando';
      const cb = d.p.userData.cab, to = d.p.userData.tronco; if (cb) cb.rotation.x = tr ? Math.sin(t * 2.4 + d.t) * .07 + .05 : -.18; if (to) to.rotation.x = d.estado === 'descansando' ? .22 : Math.sin(t * 1.2 + d.t) * .02;
      d.mon.material.emissive.setHex(d.a.id === 'chefe' ? 0x8a6a20 : tr ? 0x2f9e6f : d.estado === 'parado' ? 0xb03030 : 0x000000);
      const wp = new THREE.Vector3(); d.g.getWorldPosition(wp);
      const [x, y, z] = tela2d(wp.clone().setY(3.4)), [nx, ny] = tela2d(wp.clone().setY(2.6));
      const ok = z < 1, vis = ok ? '' : 'none';
      const inf = d.info || {};
      d.cardEl.style.display = ok && sel === d.a.id && (inf.texto || d.estado !== 'descansando') ? '' : 'none';
      d.cardEl.style.left = x + 'px'; d.cardEl.style.top = y + 'px';
      const html = `${inf.texto || (d.estado === 'parado' ? 'Parado' : d.estado === 'trabalhando' ? 'Trabalhando' : '')}${inf.sub ? `<small>${inf.sub}</small>` : ''}${inf.prog != null ? `<u><i style="width:${Math.round(inf.prog * 100)}%"></i></u>` : ''}`;
      if (d.cardEl._h !== html) { d.cardEl.innerHTML = html; d.cardEl._h = html; }
      d.cardEl.classList.toggle('erro', d.estado === 'parado');
      d.nomeEl.style.left = nx + 'px'; d.nomeEl.style.top = ny + 'px'; d.nomeEl.style.display = vis; d.nomeEl.textContent = d.nome || d.a.name || '';
      d.nomeEl.classList.toggle('erro', d.estado === 'parado');
    }
    // vídeo e selo seguem o telão
    const cs = [[-6.1, 8.33], [6.1, 8.33], [-6.1, 1.47], [6.1, 1.47]].map(([a, b]) => { const p = new THREE.Vector3(a, b, 0.03); telao.localToWorld(p); return tela2d(p); });
    if (iframe) {
      // transforma o retângulo do vídeo no quadrilátero do telão (matriz de perspectiva 3x3 em CSS)
      const w0 = 640, h0 = 360, [p0, p1, p3, p2] = cs; iframe.style.width = w0 + 'px'; iframe.style.height = h0 + 'px';
      iframe.style.transform = homografia(w0, h0, p0, p1, p2, p3);
    }
    aoVivo.style.left = cs[0][0] + 14 + 'px'; aoVivo.style.top = cs[0][1] + 14 + 'px';
    renderer.render(scene, cam); raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);
  const ro = new ResizeObserver(() => { renderer.setSize(W(), H()); cam.aspect = W() / H(); cam.updateProjectionMatrix(); }); ro.observe(el);
  return { atualizar, telaoVideo, destruir() { cancelAnimationFrame(raf); ro.disconnect(); renderer.dispose(); el.innerHTML = ''; } };
}

// matrix3d que leva o retângulo (0,0)-(w,h) aos 4 cantos (topo-esq, topo-dir, base-dir, base-esq)
function homografia(w, h, a, b, c, d) {
  const src = [[0, 0], [w, 0], [w, h], [0, h]], dst = [a, b, c, d], A = [], B = [];
  for (let i = 0; i < 4; i++) { const [x, y] = src[i], [u, v] = dst[i]; A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); B.push(u); A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); B.push(v); }
  const n = 8; for (let i = 0; i < n; i++) { let m = i; for (let k = i + 1; k < n; k++) if (Math.abs(A[k][i]) > Math.abs(A[m][i])) m = k; [A[i], A[m]] = [A[m], A[i]]; [B[i], B[m]] = [B[m], B[i]];
    for (let k = i + 1; k < n; k++) { const f = A[k][i] / A[i][i]; for (let j = i; j < n; j++) A[k][j] -= f * A[i][j]; B[k] -= f * B[i]; } }
  const X = Array(n); for (let i = n - 1; i >= 0; i--) { let s = B[i]; for (let j = i + 1; j < n; j++) s -= A[i][j] * X[j]; X[i] = s / A[i][i]; }
  const [h0, h1, h2, h3, h4, h5, h6, h7] = X;
  return `matrix3d(${h0},${h3},0,${h6},${h1},${h4},0,${h7},0,0,1,0,${h2},${h5},0,1)`;
}
