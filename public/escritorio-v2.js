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

  scene.add(new THREE.HemisphereLight(0xfff0dc, 0x2a2018, 1.6)); scene.add(new THREE.AmbientLight(0xffffff, .35));
  const sol = new THREE.DirectionalLight(0xffffff, 1.3); sol.position.set(-10, 20, 12); sol.castShadow = true; sol.shadow.mapSize.set(2048, 2048);
  Object.assign(sol.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22 }); scene.add(sol);

  // texturas desenhadas no navegador: piso de madeira escura, skyline noturno nas janelas
  const tex = (w, h, fn, rep) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; fn(cv.getContext('2d'), w, h); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...rep); } return t; };
  const madeira = tex(512, 512, (g, w, h) => { for (let y = 0; y < 16; y++) { const l = 22 + Math.random() * 10; g.fillStyle = `hsl(28,32%,${l}%)`; g.fillRect(0, y * 32, w, 31); for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(0,0,0,${Math.random() * .12})`; g.fillRect(Math.random() * w, y * 32 + Math.random() * 30, 60 + Math.random() * 120, 1); } g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect((y * 137) % w, y * 32, 2, 31); } }, [6, 6]);
  const cidade = tex(1024, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#0b1230'); gr.addColorStop(1, '#2a1e3a'); g.fillStyle = gr; g.fillRect(0, 0, w, h); for (let x = 0; x < w;) { const bw = 20 + Math.random() * 50, bh = 60 + Math.random() * 170; g.fillStyle = '#0a0d18'; g.fillRect(x, h - bh, bw, bh); for (let yy = h - bh + 6; yy < h - 4; yy += 8) for (let xx = x + 4; xx < x + bw - 4; xx += 7) if (Math.random() < .45) { g.fillStyle = Math.random() < .8 ? '#f6d68a' : '#9fd0ff'; g.fillRect(xx, yy, 3, 4); } x += bw + 2; } });
  { const piso = new THREE.Mesh(new THREE.PlaneGeometry(44, 34), new THREE.MeshStandardMaterial({ map: madeira, roughness: .45, metalness: .05 })); piso.rotation.x = -Math.PI / 2; piso.receiveShadow = true; scene.add(piso); }
  // paredes: fundo e esquerda com janelas de vidro do chão ao teto mostrando a cidade à noite
  for (const [w, x, z, ry] of [[44, 0, -17, 0], [34, -22, 0, Math.PI / 2]]) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g);
    const vista = new THREE.Mesh(new THREE.PlaneGeometry(w, 8), new THREE.MeshBasicMaterial({ map: cidade })); vista.position.set(0, 4, -.4); g.add(vista);
    for (let k = -w / 2; k <= w / 2; k += 4) box(.18, 8, .18, 0x1a1c22, k, 0, 0, g);   // caixilhos
    box(w, .25, .3, 0x1a1c22, 0, 8, 0, g); box(w, .3, .3, 0x1a1c22, 0, 0, 0, g);
  }
  // tapete e luz quente sobre o Gerente
  { const t = new THREE.Mesh(new THREE.CircleGeometry(4.4, 64), mat(0x3a2c1c, { roughness: 1 })); t.rotation.x = -Math.PI / 2; t.position.y = .02; t.receiveShadow = true; scene.add(t);
    const borda = new THREE.Mesh(new THREE.RingGeometry(4.2, 4.4, 64), new THREE.MeshBasicMaterial({ color: 0xc9a040 })); borda.rotation.x = -Math.PI / 2; borda.position.y = .03; scene.add(borda);
    const l = new THREE.SpotLight(0xffd690, 90, 18, .6, .5); l.position.set(0, 9, 0); l.target.position.set(0, 0, 0); scene.add(l, l.target); }
  // luminárias pendentes, plantas e lounge
  for (const [x, z] of [[-8, -4], [0, -7], [8, -4], [-8, 4], [8, 4]]) { const fio = new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, 3), mat(0x111111)); fio.position.set(x, 8.5, z); scene.add(fio); const cup = new THREE.Mesh(new THREE.ConeGeometry(.6, .5, 24, 1, true), mat(0x222222, { side: THREE.DoubleSide, metalness: .6 })); cup.position.set(x, 6.9, z); scene.add(cup); const lp = new THREE.PointLight(0xffd8a0, 12, 9); lp.position.set(x, 6.6, z); scene.add(lp); const lb = new THREE.Mesh(new THREE.SphereGeometry(.14), new THREE.MeshBasicMaterial({ color: 0xfff1c8 })); lb.position.set(x, 6.75, z); scene.add(lb); }
  const planta = (x, z) => { box(.9, .9, .9, 0x2b2b30, x, 0, z, scene, { roughness: .6 }); for (let k = 0; k < 7; k++) { const f = new THREE.Mesh(new THREE.SphereGeometry(.45 + Math.random() * .25, 10, 8), mat(new THREE.Color().setHSL(.3 + Math.random() * .05, .45, .22 + Math.random() * .1))); f.position.set(x + (Math.random() - .5) * .9, 1.3 + Math.random() * 1.2, z + (Math.random() - .5) * .9); f.castShadow = true; scene.add(f); } };
  for (const [x, z] of [[-20, -15], [20, -15], [-20, 14], [14, 13]]) planta(x, z);
  box(5, .5, 1.6, 0x2c2a33, -16, 0, 12); box(5, 1.1, .4, 0x2c2a33, -16, 0, 12.8); box(1.8, .45, 1.2, 0x8a6a3a, -16, 0, 10.2, scene, { metalness: .3 });

  // telão na parede do fundo, de frente para a câmera
  const telao = new THREE.Group(); telao.position.set(8, 0, -16.3); scene.add(telao);
  box(12.8, 7.4, .25, 0x05070c, 0, 1.2, -.15, telao);
  const tela = new THREE.Mesh(new THREE.PlaneGeometry(12.2, 6.86), new THREE.MeshBasicMaterial({ color: 0x0b1a10 })); tela.position.set(0, 4.9, .02); telao.add(tela);

  const pessoas = new Map(), pick = [], gerentePos = new THREE.Vector3(0, 0, 0);
  const pele = [0xe0b48c, 0xc68e64, 0x8d5a3b, 0xf1c9a5, 0xa86f4c], roupa = [0x3b82f6, 0x2563eb, 0x0ea5e9, 0x7c3aed, 0xe11d48, 0x0891b2, 0x16a34a, 0xf59e0b];
  function pessoa(cor, k) {
    const g = new THREE.Group(), pel = mat(pele[k % pele.length], { roughness: .6 }), roupa = mat(cor, { roughness: .7 }), calca = mat([0x1f2433, 0x2b2b2b, 0x3a3020, 0x22303a][k % 4]);
    const cadeira = mat(0x15171d, { roughness: .4, metalness: .3 });
    const ass = new THREE.Mesh(new THREE.BoxGeometry(.95, .14, .95), cadeira); ass.position.y = .62; g.add(ass);
    const enc = new THREE.Mesh(new THREE.BoxGeometry(.95, 1.25, .14), cadeira); enc.position.set(0, 1.3, .46); g.add(enc);
    const pe = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, .55), cadeira); pe.position.y = .3; g.add(pe);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(.45, .45, .06, 5), cadeira); base.position.y = .04; g.add(base);
    const tronco = new THREE.Mesh(new THREE.CapsuleGeometry(.27, .55, 6, 14), roupa); tronco.position.y = 1.2; tronco.scale.z = .75; g.add(tronco);
    const pesc = new THREE.Mesh(new THREE.CylinderGeometry(.09, .1, .16, 10), pel); pesc.position.y = 1.62; g.add(pesc);
    const cab = new THREE.Mesh(new THREE.SphereGeometry(.21, 20, 16), pel); cab.position.y = 1.86; cab.scale.set(.92, 1.08, .98); g.add(cab);
    const cab2 = new THREE.Mesh(new THREE.SphereGeometry(.225, 20, 12, 0, Math.PI * 2, 0, Math.PI * (k % 2 ? .62 : .5)), mat([0x1a120c, 0x3a2414, 0x6b4a2a, 0x0e0e0e, 0xc9a35a][k % 5], { roughness: .9 })); cab2.position.y = 1.9; cab2.rotation.x = -.25; g.add(cab2);
    for (const s of [-1, 1]) {
      const braco = new THREE.Mesh(new THREE.CapsuleGeometry(.075, .42, 4, 8), roupa); braco.position.set(s * .33, 1.25, -.12); braco.rotation.x = -1.0; g.add(braco);
      const ante = new THREE.Mesh(new THREE.CapsuleGeometry(.065, .34, 4, 8), pel); ante.position.set(s * .27, 1.12, -.46); ante.rotation.x = -1.45; g.add(ante);
      const coxa = new THREE.Mesh(new THREE.CapsuleGeometry(.1, .42, 4, 8), calca); coxa.position.set(s * .14, .78, -.22); coxa.rotation.x = Math.PI / 2; g.add(coxa);
      const perna = new THREE.Mesh(new THREE.CapsuleGeometry(.09, .42, 4, 8), calca); perna.position.set(s * .14, .38, -.48); g.add(perna);
      const sap = new THREE.Mesh(new THREE.BoxGeometry(.16, .1, .3), mat(0x101010)); sap.position.set(s * .14, .06, -.55); g.add(sap);
    }
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    g.userData.cab = cab; g.userData.tronco = tronco;
    return g;
  }
  const card = (cls) => { const d = document.createElement('div'); d.className = cls; el.appendChild(d); return d; };
  function mesa(x, z, rotY, cor, k, gerente) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY; scene.add(g);
    box(2.8, 0.1, 1.4, gerente ? 0x6b4a2a : 0x4a3626, 0, 1.12, 0, g, { roughness: .35 }); for (const sx of [-1.25, 1.25]) box(0.08, 1.12, 1.25, 0x18181c, sx, 0, 0, g, { metalness: .6, roughness: .3 });
    box(0.06, 0.3, 0.06, 0x18181c, 0, 1.22, -0.45, g); const mon = box(1.3, 0.78, 0.05, 0x10131a, 0, 1.5, -0.45, g, { emissive: 0x000000 });
    box(0.7, 0.04, 0.3, 0x111521, 0, 1.22, 0.1, g); box(0.18, 0.22, 0.18, 0xe5e7eb, 0.9, 1.22, 0.2, g);
    const p = pessoa(cor, k); p.position.set(0, 0, 1.15); g.add(p);
    return { g, mon, p };
  }
  const linhas = new Map();
  function montar(agentes) {
    const lista = agentes.filter(a => a.id !== 'chefe');
    lista.forEach((a, k) => {
      if (pessoas.has(a.id)) return;
      const ang = Math.PI * 0.92 + (k / Math.max(1, lista.length - 1)) * Math.PI * 1.16, rx = 11.5, rz = 8.5;
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
    iframe.allow = 'autoplay; encrypted-media'; iframe.referrerPolicy = 'strict-origin-when-cross-origin'; iframe.style.cssText = 'position:absolute;left:0;top:0;border:0;pointer-events:none;transform-origin:0 0;z-index:2'; el.appendChild(iframe);
  }
  const v = new THREE.Vector3(), tela2d = p => { v.copy(p).project(cam); return [(v.x + 1) / 2 * W(), (1 - v.y) / 2 * H(), v.z]; };
  let raf, t0 = performance.now();
  function loop(now) {
    const t = (now - t0) / 1000, R = 28 * zoom;
    cam.position.set(Math.sin(ang - 0.62) * R, 19 * zoom, Math.cos(ang - 0.62) * R + 3); cam.lookAt(0, 0, -2);
    for (const d of pessoas.values()) {
      const tr = d.estado === 'trabalhando';
      const cb = d.p.userData.cab, to = d.p.userData.tronco; if (cb) cb.rotation.x = tr ? Math.sin(t * 2.4 + d.t) * .07 + .05 : -.18; if (to) to.rotation.x = d.estado === 'descansando' ? .22 : Math.sin(t * 1.2 + d.t) * .02;
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
