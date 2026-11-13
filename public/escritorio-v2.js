// Escritório 3D (como no protótipo 02): piso escuro em grade, uma mesa por agente em volta do Gerente (centro, com luz dourada),
// linhas do Gerente até cada agente (azul trabalhando, vermelha parado), cartão flutuante com a tarefa e telão "AO VIVO" ao fundo.
import * as THREE from '/three.module.min.js';

export function criarEscritorio(el, { onPick } = {}) {
  const W = () => el.clientWidth, H = () => el.clientHeight;
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.setSize(W(), H());
  renderer.shadowMap.enabled = true; renderer.toneMapping = THREE.ACESFilmicToneMapping;
  el.appendChild(renderer.domElement); renderer.domElement.style.display = 'block';
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0d1220); scene.fog = new THREE.Fog(0x0d1220, 40, 80);
  const cam = new THREE.PerspectiveCamera(38, W() / H(), 0.1, 200);
  const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, ...o });
  const box = (w, h, d, c, x, y, z, p = scene, o) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c, o)); m.position.set(x, y + h / 2, z); m.castShadow = m.receiveShadow = true; p.add(m); return m; };

  scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x10131c, 1.2));
  const sol = new THREE.DirectionalLight(0xffffff, 1.3); sol.position.set(-10, 20, 12); sol.castShadow = true; sol.shadow.mapSize.set(2048, 2048);
  Object.assign(sol.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22 }); scene.add(sol);

  // piso com grade
  { const g = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), mat(0x161c2c, { roughness: 0.9 })); g.rotation.x = -Math.PI / 2; g.receiveShadow = true; scene.add(g);
    const grid = new THREE.GridHelper(60, 30, 0x2a3550, 0x222b40); grid.position.y = 0.01; scene.add(grid); }
  // luz dourada do Gerente
  { const d = new THREE.Mesh(new THREE.CircleGeometry(4.2, 64), new THREE.MeshBasicMaterial({ color: 0xc9a040, transparent: true, opacity: 0.55 })); d.rotation.x = -Math.PI / 2; d.position.y = 0.02; scene.add(d);
    const l = new THREE.PointLight(0xffd27a, 40, 14); l.position.set(0, 5, 0); scene.add(l); }

  // telão ao fundo, inclinado como no protótipo
  const telao = new THREE.Group(); telao.position.set(12, 0, -13); telao.rotation.y = -0.5; telao.scale.setScalar(0.75); scene.add(telao);
  box(16.4, 9.4, 0.3, 0x05070c, 0, 0.6, -0.2, telao);
  const tela = new THREE.Mesh(new THREE.PlaneGeometry(16, 9), new THREE.MeshBasicMaterial({ color: 0x1c3a20 })); tela.position.set(0, 5.3, 0); telao.add(tela);

  const pessoas = new Map(), pick = [], gerentePos = new THREE.Vector3(0, 0, 0);
  const pele = [0xe0b48c, 0xc68e64, 0x8d5a3b, 0xf1c9a5, 0xa86f4c], roupa = [0x3b82f6, 0x2563eb, 0x0ea5e9, 0x7c3aed, 0xe11d48, 0x0891b2, 0x16a34a, 0xf59e0b];
  function pessoa(cor, k) {
    const g = new THREE.Group();
    const cad = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.9), mat(0x2b3245)); cad.position.y = 0.55; g.add(cad);
    const enc = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1, 0.12), mat(0x2b3245)); enc.position.set(0, 1.05, 0.42); g.add(enc);
    const corpo = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.95, 14), mat(cor)); corpo.position.y = 1.15; g.add(corpo);
    const cab = new THREE.Mesh(new THREE.SphereGeometry(0.28, 18, 14), mat(pele[k % pele.length])); cab.position.y = 1.9; g.add(cab);
    const cabelo = new THREE.Mesh(new THREE.SphereGeometry(0.29, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat([0x1a120c, 0x3a2414, 0x6b4a2a, 0x111111, 0xd6b25a][k % 5])); cabelo.position.y = 1.95; g.add(cabelo);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return g;
  }
  const card = (cls) => { const d = document.createElement('div'); d.className = cls; el.appendChild(d); return d; };
  function mesa(x, z, rotY, cor, k, gerente) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY; scene.add(g);
    box(2.6, 0.12, 1.4, gerente ? 0x4a5a80 : 0x3a4868, 0, 1.1, 0, g); for (const sx of [-1.15, 1.15]) for (const sz of [-0.55, 0.55]) box(0.1, 1.1, 0.1, 0x1c2232, sx, 0, sz, g);
    const mon = box(1.2, 0.8, 0.08, 0x1a2030, 0, 1.4, -0.45, g, { emissive: 0x000000 });
    box(0.7, 0.04, 0.3, 0x111521, 0, 1.22, 0.1, g); box(0.18, 0.22, 0.18, 0xe5e7eb, 0.9, 1.22, 0.2, g);
    const p = pessoa(cor, k); p.position.set(0, 0, 1.1); p.rotation.y = Math.PI; g.add(p);
    return { g, mon, p };
  }
  const linhas = new Map();
  function montar(agentes) {
    const lista = agentes.filter(a => a.id !== 'chefe');
    lista.forEach((a, k) => {
      if (pessoas.has(a.id)) return;
      const ang = Math.PI * 0.95 + (k / Math.max(1, lista.length - 1)) * Math.PI * 1.1, rx = 10.5, rz = 7.5;
      const x = Math.cos(ang) * rx, z = Math.sin(ang) * rz + 1;
      const m = mesa(x, z, Math.atan2(-x, -z) + Math.PI, a.color || roupa[k % roupa.length], k);
      const d = { a, ...m, casa: new THREE.Vector3(x, 0, z), cardEl: card('ecard'), nomeEl: card('enome'), estado: 'descansando', t: Math.random() * 10 };
      m.g.traverse(o => { o.userData = { agente: a.id }; if (o.isMesh) pick.push(o); });
      const curva = new THREE.QuadraticBezierCurve3(gerentePos.clone().setY(1.6), new THREE.Vector3(x / 2, 4.5, z / 2), new THREE.Vector3(x, 1.6, z));
      const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curva.getPoints(40)), new THREE.LineBasicMaterial({ color: 0x3b6cf0, transparent: true, opacity: 0.8 })); scene.add(ln); linhas.set(a.id, ln);
      pessoas.set(a.id, d);
    });
    if (!pessoas.has('chefe')) { const g = agentes.find(a => a.id === 'chefe') || { id: 'chefe', name: 'Gerente' }; const m = mesa(0, 0, 0, 0xfacc15, 7, true); m.mon.material.emissive.setHex(0x8a6a20); m.g.traverse(o => { o.userData = { agente: 'chefe' }; if (o.isMesh) pick.push(o); }); pessoas.set('chefe', { a: g, ...m, casa: gerentePos, cardEl: card('ecard'), nomeEl: card('enome'), estado: 'trabalhando', t: 0 }); }
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

  const ray = new THREE.Raycaster(), ms = new THREE.Vector2();
  renderer.domElement.addEventListener('click', e => { const r = renderer.domElement.getBoundingClientRect(); ms.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); ray.setFromCamera(ms, cam); const o = ray.intersectObjects(pick)[0]?.object; if (o) onPick?.(o.userData.agente); });
  let ang = 0.62, zoom = 1, arr = null;
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
    iframe.allow = 'autoplay; encrypted-media'; iframe.style.cssText = 'position:absolute;border:0;pointer-events:none;transform-origin:0 0;z-index:0'; el.insertBefore(iframe, el.children[1] || null);
  }
  const v = new THREE.Vector3(), tela2d = p => { v.copy(p).project(cam); return [(v.x + 1) / 2 * W(), (1 - v.y) / 2 * H(), v.z]; };
  let raf, t0 = performance.now();
  function loop(now) {
    const t = (now - t0) / 1000, R = 30 * zoom;
    cam.position.set(Math.sin(ang - 0.62) * R, 21 * zoom, Math.cos(ang - 0.62) * R); cam.lookAt(1.5, 0, -1);
    for (const d of pessoas.values()) {
      const tr = d.estado === 'trabalhando';
      d.p.position.y = tr ? Math.abs(Math.sin(t * 6 + d.t)) * 0.03 : 0; d.p.rotation.z = d.estado === 'descansando' ? 0.12 : 0;
      d.mon.material.emissive.setHex(d.a.id === 'chefe' ? 0x8a6a20 : tr ? 0x2f9e6f : d.estado === 'parado' ? 0xb03030 : 0x000000);
      const wp = new THREE.Vector3(); d.g.getWorldPosition(wp);
      const [x, y, z] = tela2d(wp.clone().setY(3.4)), [nx, ny] = tela2d(wp.clone().setY(2.6));
      const ok = z < 1, vis = ok ? '' : 'none';
      const inf = d.info || {};
      d.cardEl.style.display = ok && (inf.texto || d.estado === 'parado') ? '' : 'none';
      d.cardEl.style.left = x + 'px'; d.cardEl.style.top = y + 'px';
      const html = `${inf.texto || (d.estado === 'parado' ? 'Parado' : d.estado === 'trabalhando' ? 'Trabalhando' : '')}${inf.sub ? `<small>${inf.sub}</small>` : ''}${inf.prog != null ? `<u><i style="width:${Math.round(inf.prog * 100)}%"></i></u>` : ''}`;
      if (d.cardEl._h !== html) { d.cardEl.innerHTML = html; d.cardEl._h = html; }
      d.cardEl.classList.toggle('erro', d.estado === 'parado');
      d.nomeEl.style.left = nx + 'px'; d.nomeEl.style.top = ny + 'px'; d.nomeEl.style.display = vis; d.nomeEl.textContent = d.nome || d.a.name || '';
      d.nomeEl.classList.toggle('erro', d.estado === 'parado');
    }
    // vídeo e selo seguem o telão
    const cs = [[-8, 9.8], [8, 9.8], [-8, 0.8], [8, 0.8]].map(([a, b]) => { const p = new THREE.Vector3(a, b, 0.02); telao.localToWorld(p); return tela2d(p); });
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
