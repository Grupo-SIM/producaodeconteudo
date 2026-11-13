// Cérebro 3D: nuvem de pontos em forma de cérebro, Gerente no centro, agentes em órbita e seus arquivos/regras ao redor.
// Fluxo nos dois sentidos: bolinhas douradas saem do Gerente para os agentes; losangos coloridos voltam.
// Passar o mouse destaca; clicar chama onPick; acender(ids) ilumina o caminho até os arquivos usados.
import * as THREE from '/three.module.min.js';

// ruído suave para as texturas dos planetas (feito no próprio navegador, sem imagem externa)
function ruido(seed) { const p = new Uint8Array(512); for (let i = 0; i < 256; i++) p[i] = i; let s = seed * 9301 + 49297; for (let i = 255; i > 0; i--) { s = (s * 9301 + 49297) % 233280; const j = Math.floor(s / 233280 * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } for (let i = 0; i < 256; i++) p[i + 256] = p[i];
  const f = t => t * t * (3 - 2 * t), g = (h, x, y) => ((h & 1) ? -x : x) + ((h & 2) ? -y : y);
  return (x, y) => { const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, xf = x - Math.floor(x), yf = y - Math.floor(y), u = f(xf), v = f(yf), a = p[X] + Y, b = p[X + 1] + Y;
    const l1 = g(p[a], xf, yf) + u * (g(p[b], xf - 1, yf) - g(p[a], xf, yf)), l2 = g(p[a + 1], xf, yf - 1) + u * (g(p[b + 1], xf - 1, yf - 1) - g(p[a + 1], xf, yf - 1)); return (l1 + v * (l2 - l1)) * 0.5 + 0.5; }; }
function texPlaneta(cor, seed, sol) {
  const W = 256, H = 128, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const ctx = cv.getContext('2d'), img = ctx.createImageData(W, H), n = ruido(seed);
  const c = new THREE.Color(cor), hsl = {}; c.getHSL(hsl);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W * 6, v = y / H * 3;
    let t = sol ? n(u * 2, v * 2) * .6 + n(u * 6, v * 6) * .4 : (Math.sin(v * 7 + n(u * 1.5, v * 1.5) * 5) * .5 + .5) * .55 + n(u * 4, v * 4) * .45;
    const k = new THREE.Color().setHSL(hsl.h + (t - .5) * (sol ? .04 : .08), Math.min(1, hsl.s * (sol ? 1 : .85)), Math.max(.08, Math.min(.92, hsl.l * (sol ? 1.1 : .6) + (t - .5) * (sol ? .35 : .5))));
    const i = (y * W + x) * 4; img.data[i] = k.r * 255; img.data[i + 1] = k.g * 255; img.data[i + 2] = k.b * 255; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function texBrilho(cor) { const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); const c = new THREE.Color(cor); const rgb = `${c.r * 255 | 0},${c.g * 255 | 0},${c.b * 255 | 0}`; gr.addColorStop(0, `rgba(${rgb},.9)`); gr.addColorStop(.25, `rgba(${rgb},.35)`); gr.addColorStop(1, `rgba(${rgb},0)`); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(cv); }
const brilho = (cor, tam, op = 1) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texBrilho(cor), transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending })); s.scale.setScalar(tam); return s; };

export function criarCerebro3D(el, dados, { onPick, onHover } = {}) {
  const W = () => el.clientWidth, H = () => el.clientHeight;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.setSize(W(), H()); el.appendChild(renderer.domElement);
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(50, W() / H(), 0.1, 200);
  cam.position.set(0, 4, 22);
  const grupo = new THREE.Group(); scene.add(grupo);

  const ags0 = dados.agentes.filter(a => a.id !== 'chefe');
  // forma de cérebro: dois hemisférios com sulcos; cada ponto ganha a cor da região (agente) mais próxima
  let nuvem;
  {
    const N = 9000, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), cs = ags0.map(a => new THREE.Color(a.cor || '#8fd0c0')), tmp = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = Math.cbrt(Math.random()) * Math.sqrt(1 - u * u);
      let x = r * Math.cos(th), y = u * Math.cbrt(Math.random()), z = r * Math.sin(th);
      const lado = x >= 0 ? 1 : -1, sulco = 1 + 0.07 * Math.sin(9 * y + 5 * z) * Math.cos(7 * x);
      x = (Math.abs(x) * 4.2 + 0.35) * lado; y = y * 4.4; z = z * 6;
      pos.set([x * sulco * 1.55, y * sulco * 1.1, z * sulco * 1.25], i * 3);
      const ang = Math.atan2(z, x), k = cs.length ? Math.floor(((ang + Math.PI) / (Math.PI * 2)) * cs.length) % cs.length : 0;
      tmp.copy(cs[k] || new THREE.Color(0xd9c08a)).lerp(new THREE.Color(0xffffff), Math.random() * 0.3);
      col.set([tmp.r, tmp.g, tmp.b], i * 3);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    nuvem = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.06, vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    grupo.add(nuvem);
  }
  scene.add(new THREE.AmbientLight(0x606070, 0.75)); const l = new THREE.PointLight(0xffe2a0, 220, 80, 1.6); scene.add(l);
  { const N = 1500, pos = new Float32Array(N * 3); for (let i = 0; i < N; i++) { const r = 60 + Math.random() * 40, a = Math.random() * Math.PI * 2, b = Math.acos(Math.random() * 2 - 1); pos.set([r * Math.sin(b) * Math.cos(a), r * Math.cos(b), r * Math.sin(b) * Math.sin(a)], i * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.18, transparent: true, opacity: .55 }))); }

  const pickables = [], nos = new Map(), rotulos = [];
  el.style.position = el.style.position || 'relative';
  const rot = (txt, sub, gold) => { const d = document.createElement('div'); d.style.cssText = `position:absolute;transform:translate(-50%,0);text-align:center;pointer-events:none;font:600 13px Inter,system-ui;color:${gold ? '#f2f2f3' : '#e8e8ea'};text-shadow:0 2px 8px #000;white-space:nowrap`; d.innerHTML = `${txt}<br><span style="font-weight:400;font-size:11.5px;color:#9a9aa0">${sub}</span>`; el.appendChild(d); return d; };
  const gerente = new THREE.Mesh(new THREE.SphereGeometry(0.8, 48, 32), new THREE.MeshBasicMaterial({ map: texPlaneta('#f2c45a', 7, true) })); gerente.add(brilho('#ffcf6a', 4.2, .9)); gerente.add(brilho('#fff2c8', 2.1, .8));
  gerente.userData = { tipo: 'gerente', titulo: 'Gerente' }; grupo.add(gerente); pickables.push(gerente); rotulos.push([gerente, rot('Gerente', 'controla todos os agentes', true), 1.1]);

  const ags = dados.agentes.filter(a => a.id !== 'chefe');
  const linhaMat = new THREE.LineBasicMaterial({ color: 0x5a5a66, transparent: true, opacity: 0.45 });
  ags.forEach((a, k) => {
    const cor = new THREE.Color(a.cor || '#8fd0c0');
    const ang = (k / ags.length) * Math.PI * 2, raio = 6.5 + (k % 2) * 1.6, inc = (k % 3 - 1) * 0.35;
    const no = new THREE.Mesh(new THREE.SphereGeometry(0.36, 40, 28), new THREE.MeshStandardMaterial({ map: texPlaneta(a.cor || '#8fd0c0', k + 1), roughness: .85, metalness: 0 }));
    const atm = brilho(a.cor || '#8fd0c0', 1.5, .55); no.add(atm); no.userData.atm = atm;
    if (k % 3 === 1) { const anel = new THREE.Mesh(new THREE.RingGeometry(.5, .78, 64), new THREE.MeshBasicMaterial({ color: cor.clone().lerp(new THREE.Color('#ffffff'), .4), side: THREE.DoubleSide, transparent: true, opacity: .45 })); anel.rotation.x = Math.PI / 2.3; no.add(anel); }
    no.position.set(Math.cos(ang) * raio, Math.sin(ang * 2) * 1.6 + inc * 3, Math.sin(ang) * raio);
    no.userData = { tipo: 'agente', agente: a.id, titulo: a.nome, ang, raio, inc }; grupo.add(no); pickables.push(no);
    const lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), no.position.clone()]);
    const linha = new THREE.Line(lg, linhaMat.clone()); grupo.add(linha);
    const filhos = [];
    a.itens.forEach((it, j) => {
      const regra = it.tipo === 'regra';
      const m = new THREE.Mesh(regra ? new THREE.OctahedronGeometry(0.13) : new THREE.BoxGeometry(0.2, 0.26, 0.04), new THREE.MeshStandardMaterial({ color: regra ? cor : 0xcfd6e4, emissive: 0x000000, transparent: true, opacity: 0.85 }));
      const t = j * 2.399, rr = 1.3 + 0.12 * Math.sqrt(j);
      m.userData = { tipo: it.tipo, id: it.id, titulo: it.titulo, agente: a.id, base: new THREE.Vector3(Math.cos(t) * rr, (j % 7 - 3) * 0.18, Math.sin(t) * rr) };
      m.visible = false; grupo.add(m); filhos.push(m); nos.set(it.id, m);
    });
    nos.set(a.id, no); no.userData.filhos = filhos; no.userData.linha = linha; no.userData.itens = a.itens; no.userData.cor = a.cor;
    rotulos.push([no, rot(a.nome, a.itens.length + ' arquivos'), 0.55]);
  });

  // partículas de fluxo
  const parts = [];
  const ouro = new THREE.MeshBasicMaterial({ color: 0xe9d29a });
  function emite() {
    const alvo = ags[Math.floor(Math.random() * ags.length)]; if (!alvo) return;
    const no = nos.get(alvo.id), volta = Math.random() < 0.5;
    const m = new THREE.Mesh(volta ? new THREE.OctahedronGeometry(0.11) : new THREE.SphereGeometry(0.09, 8, 6), volta ? new THREE.MeshBasicMaterial({ color: new THREE.Color(alvo.cor || '#8fd0c0') }) : ouro);
    grupo.add(m); parts.push({ m, no, volta, t: 0 });
  }

  // interação
  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
  let hover = null, rotY = 0, rotX = 0.15, arr = null, auto = true, dist = el.clientWidth < 600 ? 19 : 22, acesos = new Set();
  const destaca = (obj, on) => { if (!obj) return; obj.userData.alvo = on ? 1.45 : 1; if (obj.userData.atm) obj.userData.atm.material.opacity = on ? 1 : .55; };
  function pega(e) { const r = renderer.domElement.getBoundingClientRect(); mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(mouse, cam); return ray.intersectObjects(pickables, false)[0]?.object || null; }
  const cv = renderer.domElement;
  cv.addEventListener('pointerdown', e => { arr = { x: e.clientX, y: e.clientY, rY: rotY, rX: rotX, mov: 0 }; auto = false; });
  addEventListener('pointerup', e => { if (arr && arr.mov < 5) { const o = pega(e); if (o) onPick?.(o.userData); } arr = null; });
  cv.addEventListener('pointermove', e => {
    if (arr) { arr.mov = Math.hypot(e.clientX - arr.x, e.clientY - arr.y); rotY = arr.rY + (e.clientX - arr.x) * 0.006; rotX = Math.max(-1, Math.min(1, arr.rX + (e.clientY - arr.y) * 0.004)); return; }
    const o = pega(e); if (o !== hover) { if (hover && !acesos.has(hover.userData.id)) destaca(hover, false); hover = o; destaca(hover, true); cv.style.cursor = o ? 'pointer' : 'grab'; onHover?.(o?.userData || null, e); }
  });
  cv.addEventListener('wheel', e => { e.preventDefault(); dist = Math.max(10, Math.min(40, dist + e.deltaY * 0.02)); }, { passive: false });
  // pinça no celular
  let pin = null; cv.addEventListener('touchmove', e => { if (e.touches.length === 2) { const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); if (pin) dist = Math.max(10, Math.min(40, dist - (d - pin) * 0.05)); pin = d; } }, { passive: true });
  cv.addEventListener('touchend', () => pin = null);

  function acender(lista) {
    for (const id of acesos) destaca(nos.get(id), false); for (const a of ags) nos.get(a.id).userData.alvo = 1;
    for (const a of ags) { const n = nos.get(a.id); n.userData.linha.material.color.setHex(0x5a5a66); n.userData.linha.material.opacity = .45; }
    acesos = new Set(lista.map(x => x.id));
    for (const x of lista) { destaca(nos.get(x.id), true); const n = nos.get(x.agente); if (n) { n.userData.linha.material.color.setHex(0xe9d29a); n.userData.linha.material.opacity = 1; n.userData.alvo = 1.35; } }
  }

  let raf, t0 = performance.now(), ultEm = 0;
  function loop(now) {
    const t = (now - t0) / 1000; if (auto) rotY += 0.0018;
    grupo.rotation.y = rotY; grupo.rotation.x = rotX;
    cam.position.set(0, 10 * dist / 22, dist); cam.lookAt(0, -1.6, 0);
    gerente.rotation.y = t * 0.4;
    for (const a of ags) {
      const n = nos.get(a.id), u = n.userData, ang = u.ang + t * 0.05;
      n.position.set(Math.cos(ang) * u.raio, Math.sin(ang * 2) * 1.6 + u.inc * 3, Math.sin(ang) * u.raio);
      u.linha.geometry.setFromPoints([new THREE.Vector3(), n.position]);
      u.filhos.forEach((f, j) => { const b = f.userData.base, w = t * 0.3 + j; f.position.set(n.position.x + b.x * Math.cos(w * 0.1) - b.z * Math.sin(w * 0.1), n.position.y + b.y, n.position.z + b.x * Math.sin(w * 0.1) + b.z * Math.cos(w * 0.1)); f.rotation.y = w; });
    }

    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.t += 0.012; const k = Math.max(0, Math.min(1, p.t)), f = p.volta ? 1 - k : k;
      p.m.position.copy(p.no.position).multiplyScalar(f); p.m.position.y += Math.sin(k * Math.PI) * 0.8; p.m.rotation.y += 0.1;
      if (p.t >= 1) { grupo.remove(p.m); p.m.geometry.dispose(); parts.splice(i, 1); }
    }
    for (const o of pickables) { const s = o.userData.alvo ?? 1; o.scale.setScalar(o.scale.x + (s - o.scale.x) * .15); if (o.geometry?.type === 'SphereGeometry') o.rotation.y += .004; }
    const v = new THREE.Vector3();
    for (const [o, d, dy] of rotulos) { o.getWorldPosition(v); v.y -= dy; v.project(cam); d.style.left = ((v.x + 1) / 2 * W()) + 'px'; d.style.top = ((1 - v.y) / 2 * H()) + 'px'; d.style.display = v.z < 1 ? '' : 'none'; }
    nuvem.rotation.y = t * 0.01;
    renderer.render(scene, cam); raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);
  const ro = new ResizeObserver(() => { renderer.setSize(W(), H()); cam.aspect = W() / H(); cam.updateProjectionMatrix(); }); ro.observe(el);
  return { acender, areas: () => new Set([...acesos].map(id => nos.get(id)?.userData.agente)).size, destruir() { cancelAnimationFrame(raf); ro.disconnect(); renderer.dispose(); el.innerHTML = ''; } };
}
