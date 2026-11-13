// Escritório 3D do novo front: uma mesa por agente, pessoas ligadas ao estado real (trabalhando, parado, descansando),
// sala do Gerente ao fundo e telão na parede (o vídeo do YouTube é um iframe por cima, alinhado ao telão a cada quadro).
import * as THREE from '/three.module.min.js';

export function criarEscritorio(el, { onPick } = {}) {
  const W = () => el.clientWidth, H = () => el.clientHeight;
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.setSize(W(), H());
  renderer.shadowMap.enabled = true; renderer.toneMapping = THREE.ACESFilmicToneMapping;
  el.appendChild(renderer.domElement); renderer.domElement.style.display = 'block';
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0c0c0d); scene.fog = new THREE.Fog(0x0c0c0d, 30, 60);
  const cam = new THREE.PerspectiveCamera(46, W() / H(), 0.1, 200);
  const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, ...o });
  const box = (w, h, d, c, x, y, z, p = scene, o) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c, o)); m.position.set(x, y + h / 2, z); m.castShadow = m.receiveShadow = true; p.add(m); return m; };

  scene.add(new THREE.HemisphereLight(0xfff1d6, 0x3a3530, 1.6));
  const sol = new THREE.DirectionalLight(0xffe6b0, 1.6); sol.position.set(8, 16, 10); sol.castShadow = true; sol.shadow.mapSize.set(1024, 1024);
  Object.assign(sol.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16 }); scene.add(sol);

  // sala: piso, paredes, sala de vidro do Gerente, sofá de descanso
  box(26, 0.2, 18, 0x3a332b, 0, -0.2, 0);
  box(26, 4, 0.2, 0x1f1f22, 0, 0, -9); box(0.2, 4, 18, 0x1f1f22, -13, 0, 0);
  const vidro = mat(0x9fd3e0, { transparent: true, opacity: 0.18, roughness: 0.1 });
  for (const [w, d, x, z] of [[7, 0.08, 8.5, -3.5], [0.08, 5.5, 5, -6.25]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 3, d), vidro); m.position.set(x, 1.5, z); scene.add(m); }
  box(3, 0.5, 1, 0x3a3220, -10, 0, 6); box(3, 0.9, 0.3, 0x3a3220, -10, 0, 6.6);   // sofá
  box(1.2, 0.8, 1.2, 0x2a2418, -7.5, 0, 6.5);   // mesinha de café

  // telão na parede do fundo
  const telao = new THREE.Mesh(new THREE.PlaneGeometry(8, 4.5), new THREE.MeshBasicMaterial({ color: 0x111113 }));
  telao.position.set(-3, 3.6, -8.88); scene.add(telao);
  box(8.4, 4.9, 0.1, 0x0a0a0a, -3, 1.15, -8.95);

  const pessoas = new Map(), pick = [];
  const pele = [0xe0b48c, 0xc68e64, 0x8d5a3b, 0xf1c9a5, 0xa86f4c];
  function pessoa(cor, k) {
    const g = new THREE.Group();
    const corpo = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.9, 12), mat(cor)); corpo.position.y = 0.95; g.add(corpo);
    const cab = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 12), mat(pele[k % pele.length])); cab.position.y = 1.62; g.add(cab);
    const cabelo = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat([0x1a120c, 0x3a2414, 0x6b4a2a, 0x111111][k % 4])); cabelo.position.y = 1.66; g.add(cabelo);
    const pernas = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.3), mat(0x22252b)); pernas.position.y = 0.3; g.add(pernas);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return g;
  }
  function montar(agentes) {
    const lista = agentes.filter(a => a.id !== 'chefe');
    lista.forEach((a, k) => {
      if (pessoas.has(a.id)) return;
      const col = k % 4, lin = Math.floor(k / 4), x = -9 + col * 4.2, z = -4.5 + lin * 3.4;
      const mesa = box(2.2, 0.08, 1.1, 0x3b2f22, x, 0.9, z); box(0.08, 0.9, 1, 0x2a2418, x - 1, 0, z); box(0.08, 0.9, 1, 0x2a2418, x + 1, 0, z);
      const tela = box(0.9, 0.55, 0.05, 0x111113, x, 1.0, z - 0.35, scene, { emissive: 0x000000 });
      const p = pessoa(a.color || '#8fd0c0', k); p.position.set(x, 0, z + 0.85); p.rotation.y = Math.PI; scene.add(p);
      const etiqueta = document.createElement('div');
      etiqueta.style.cssText = 'position:absolute;transform:translate(-50%,-100%);font:600 11px Inter,system-ui;color:#f2f2f3;background:#111113d0;border:1px solid #26262a;border-radius:8px;padding:2px 7px;white-space:nowrap;pointer-events:none';
      el.appendChild(etiqueta);
      const d = { a, p, tela, mesa, casa: new THREE.Vector3(x, 0, z + 0.85), etiqueta, estado: 'descansando', t: Math.random() * 10 };
      p.userData = { agente: a.id }; p.traverse(o => { o.userData = { agente: a.id }; pick.push(o); });
      pessoas.set(a.id, d);
    });
    // Gerente na sala de vidro
    if (!pessoas.has('chefe')) { const g = agentes.find(a => a.id === 'chefe'); if (g) { box(2.4, 0.08, 1.2, 0x4a3f26, 8.5, 0.9, -6.5); const p = pessoa('#e9d29a', 9); p.position.set(8.5, 0, -5.6); p.rotation.y = Math.PI; scene.add(p); const etq = document.createElement('div'); etq.style.cssText = 'position:absolute;transform:translate(-50%,-100%);font:600 11px Inter;color:#141006;background:linear-gradient(135deg,#e9d8a6,#a8864a);border-radius:8px;padding:2px 7px;pointer-events:none'; el.appendChild(etq); pessoas.set('chefe', { a: g, p, casa: p.position.clone(), etiqueta: etq, estado: 'trabalhando', t: 0, tela: null }); } }
  }
  // estado real: working (trabalhando), erro/parado, sem tarefa (descansando no sofá)
  function atualizar(agentes, parados = new Set()) {
    montar(agentes);
    for (const a of agentes) {
      const d = pessoas.get(a.id); if (!d) continue;
      d.estado = !a.enabled ? 'desligado' : parados.has(a.id) ? 'parado' : a.working ? 'trabalhando' : a.queued ? 'trabalhando' : 'descansando';
      d.texto = `${a.name}${a.current ? ' · ' + a.current.label : d.estado === 'descansando' ? ' · descansando' : d.estado === 'parado' ? ' · parado' : ''}`;
    }
  }

  const ray = new THREE.Raycaster(), ms = new THREE.Vector2();
  renderer.domElement.addEventListener('click', e => { const r = renderer.domElement.getBoundingClientRect(); ms.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); ray.setFromCamera(ms, cam); const o = ray.intersectObjects(pick)[0]?.object; if (o) onPick?.(o.userData.agente); });
  let ang = 0, arr = null;
  renderer.domElement.addEventListener('pointerdown', e => arr = { x: e.clientX, a: ang });
  addEventListener('pointerup', () => arr = null);
  renderer.domElement.addEventListener('pointermove', e => { if (arr) ang = Math.max(-0.2, Math.min(1.1, arr.a + (e.clientX - arr.x) * 0.004)); });

  let iframe = null;
  function telaoVideo(id) {
    iframe?.remove(); iframe = null;
    if (!id) return;
    iframe = document.createElement('iframe');
    iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&mute=1&loop=1&playlist=${encodeURIComponent(id)}&controls=0&modestbranding=1&playsinline=1`;
    iframe.allow = 'autoplay; encrypted-media'; iframe.style.cssText = 'position:absolute;border:0;pointer-events:none;border-radius:4px'; el.appendChild(iframe);
  }
  const v = new THREE.Vector3(), tela2d = p => { v.copy(p).project(cam); return [(v.x + 1) / 2 * W(), (1 - v.y) / 2 * H(), v.z]; };
  const sofa = Array.from({ length: 12 }, (_, i) => new THREE.Vector3(-11.5 + (i % 6) * 1.1, 0, 5.2 + Math.floor(i / 6) * 2.6));
  let raf, t0 = performance.now();
  function loop(now) {
    const t = (now - t0) / 1000;
    cam.position.set(Math.sin(ang) * 27, 22, Math.cos(ang) * 27); cam.lookAt(0, 0, 0.5);
    let si = 0;
    for (const d of pessoas.values()) {
      const alvo = d.estado === 'descansando' || d.estado === 'desligado' ? sofa[si++ % sofa.length] : d.casa;
      d.p.position.lerp(alvo, 0.03);
      const andando = d.p.position.distanceTo(alvo) > 0.15;
      d.p.position.y = andando ? Math.abs(Math.sin(t * 9)) * 0.08 : d.estado === 'trabalhando' ? Math.sin(t * 14 + d.t) * 0.015 : 0;
      if (andando) d.p.rotation.y = Math.atan2(alvo.x - d.p.position.x, alvo.z - d.p.position.z); else if (d.estado !== 'descansando') d.p.rotation.y = Math.PI;
      if (d.tela) d.tela.material.emissive.setHex(d.estado === 'trabalhando' ? 0x3a6f8f : d.estado === 'parado' ? 0x7a1f1f : 0x000000);
      const [x, y, z] = tela2d(d.p.position.clone().setY(2.1));
      d.etiqueta.style.left = x + 'px'; d.etiqueta.style.top = y + 'px'; d.etiqueta.style.display = z < 1 && !['descansando', 'desligado'].includes(d.estado) ? '' : 'none';
      d.etiqueta.textContent = d.texto || d.a.name; d.etiqueta.style.borderColor = d.estado === 'parado' ? '#e06060' : d.estado === 'trabalhando' ? '#6fcf97' : '#26262a';
    }
    if (iframe) { const cs = [[-4, 2.25], [4, 2.25], [-4, -2.25], [4, -2.25]].map(([a, b]) => tela2d(new THREE.Vector3(-3 + a, 3.6 + b, -8.86))); const xs = cs.map(c => c[0]), ys = cs.map(c => c[1]); Object.assign(iframe.style, { left: Math.min(...xs) + 'px', top: Math.min(...ys) + 'px', width: Math.max(...xs) - Math.min(...xs) + 'px', height: Math.max(...ys) - Math.min(...ys) + 'px' }); }
    renderer.render(scene, cam); raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);
  const ro = new ResizeObserver(() => { renderer.setSize(W(), H()); cam.aspect = W() / H(); cam.updateProjectionMatrix(); }); ro.observe(el);
  return { atualizar, telaoVideo, destruir() { cancelAnimationFrame(raf); ro.disconnect(); renderer.dispose(); el.innerHTML = ''; } };
}
