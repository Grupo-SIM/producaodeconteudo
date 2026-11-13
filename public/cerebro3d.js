// Cérebro 3D: nuvem de pontos em forma de cérebro, Gerente no centro, agentes em órbita e seus arquivos/regras ao redor.
// Fluxo nos dois sentidos: bolinhas douradas saem do Gerente para os agentes; losangos coloridos voltam.
// Passar o mouse destaca; clicar chama onPick; acender(ids) ilumina o caminho até os arquivos usados.
import * as THREE from '/three.module.min.js';

export function criarCerebro3D(el, dados, { onPick, onHover } = {}) {
  const W = () => el.clientWidth, H = () => el.clientHeight;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.setSize(W(), H()); el.appendChild(renderer.domElement);
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(50, W() / H(), 0.1, 200);
  cam.position.set(0, 4, 22);
  const grupo = new THREE.Group(); scene.add(grupo);

  // forma de cérebro: dois hemisférios (elipsoides) com sulcos por ruído
  {
    const N = 2600, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      let x = r * Math.cos(th), y = u, z = r * Math.sin(th);
      const lado = x >= 0 ? 1 : -1, sulco = 1 + 0.07 * Math.sin(9 * y + 5 * z) * Math.cos(7 * x);
      x = (Math.abs(x) * 4.2 + 0.35) * lado; y = y * 4.4; z = z * 6;
      pos.set([x * sulco * 1.55, y * sulco * 1.1, z * sulco * 1.25], i * 3);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    grupo.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xd9c08a, size: 0.06, transparent: true, opacity: 0.35 })));
  }
  scene.add(new THREE.AmbientLight(0xffffff, 0.6)); const l = new THREE.PointLight(0xffe6b0, 60, 60); scene.add(l);

  const pickables = [], nos = new Map();
  const gerente = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 2), new THREE.MeshStandardMaterial({ color: 0xe9d29a, emissive: 0x6a5420, roughness: 0.3, metalness: 0.6 }));
  gerente.userData = { tipo: 'gerente', titulo: 'Gerente' }; grupo.add(gerente); pickables.push(gerente);

  const ags = dados.agentes.filter(a => a.id !== 'chefe');
  const linhaMat = new THREE.LineBasicMaterial({ color: 0x3a3220, transparent: true, opacity: 0.6 });
  ags.forEach((a, k) => {
    const cor = new THREE.Color(a.cor || '#8fd0c0');
    const ang = (k / ags.length) * Math.PI * 2, raio = 6.5 + (k % 2) * 1.6, inc = (k % 3 - 1) * 0.35;
    const no = new THREE.Mesh(new THREE.SphereGeometry(0.55, 24, 16), new THREE.MeshStandardMaterial({ color: cor, emissive: cor.clone().multiplyScalar(0.25), roughness: 0.4 }));
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
      grupo.add(m); pickables.push(m); filhos.push(m); nos.set(it.id, m);
    });
    nos.set(a.id, no); no.userData.filhos = filhos; no.userData.linha = linha;
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
  let hover = null, rotY = 0, rotX = 0.15, arr = null, auto = true, dist = 22, acesos = new Set();
  const destaca = (obj, on) => { if (!obj) return; obj.scale.setScalar(on ? 1.6 : 1); if (obj.material.emissive) obj.material.emissive.setHex(on ? 0x6a5420 : obj === gerente ? 0x6a5420 : 0); };
  function pega(e) { const r = renderer.domElement.getBoundingClientRect(); mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(mouse, cam); return ray.intersectObjects(pickables)[0]?.object || null; }
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
    for (const id of acesos) destaca(nos.get(id), false);
    for (const a of ags) { const n = nos.get(a.id); n.userData.linha.material.color.setHex(0x3a3220); }
    acesos = new Set(lista.map(x => x.id));
    for (const x of lista) { destaca(nos.get(x.id), true); const n = nos.get(x.agente); if (n) { n.userData.linha.material.color.setHex(0xe9d29a); for (let i = 0; i < 4; i++) parts.push({ m: (() => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), ouro); grupo.add(m); return m; })(), no: n, volta: false, t: -i * 0.15 }); } }
  }

  let raf, t0 = performance.now(), ultEm = 0;
  function loop(now) {
    const t = (now - t0) / 1000; if (auto) rotY += 0.0018;
    grupo.rotation.y = rotY; grupo.rotation.x = rotX;
    cam.position.set(0, 4 * dist / 22, dist); cam.lookAt(0, 0, 0);
    gerente.rotation.y = t * 0.4;
    for (const a of ags) {
      const n = nos.get(a.id), u = n.userData, ang = u.ang + t * 0.05;
      n.position.set(Math.cos(ang) * u.raio, Math.sin(ang * 2) * 1.6 + u.inc * 3, Math.sin(ang) * u.raio);
      u.linha.geometry.setFromPoints([new THREE.Vector3(), n.position]);
      u.filhos.forEach((f, j) => { const b = f.userData.base, w = t * 0.3 + j; f.position.set(n.position.x + b.x * Math.cos(w * 0.1) - b.z * Math.sin(w * 0.1), n.position.y + b.y, n.position.z + b.x * Math.sin(w * 0.1) + b.z * Math.cos(w * 0.1)); f.rotation.y = w; });
    }
    if (t - ultEm > 0.25) { emite(); ultEm = t; }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.t += 0.012; const k = Math.max(0, Math.min(1, p.t)), f = p.volta ? 1 - k : k;
      p.m.position.copy(p.no.position).multiplyScalar(f); p.m.position.y += Math.sin(k * Math.PI) * 0.8; p.m.rotation.y += 0.1;
      if (p.t >= 1) { grupo.remove(p.m); p.m.geometry.dispose(); parts.splice(i, 1); }
    }
    renderer.render(scene, cam); raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);
  const ro = new ResizeObserver(() => { renderer.setSize(W(), H()); cam.aspect = W() / H(); cam.updateProjectionMatrix(); }); ro.observe(el);
  return { acender, destruir() { cancelAnimationFrame(raf); ro.disconnect(); renderer.dispose(); el.innerHTML = ''; } };
}
