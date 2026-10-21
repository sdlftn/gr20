// Survol 3D du GR20 : relief IGN + tracé OSM, caméra drone pilotée par le défilement.
import * as THREE from "three";

const DATA = "public/data/";
const S = 10;          // 1 unité 3D = 10 m
const EXAG = 1.35;     // exagération verticale du relief
const IS_SMALL = /[?&]q=lo\b/.test(location.search) ||
  Math.min(screen.width, screen.height) < 768 || matchMedia("(pointer: coarse)").matches;
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches || /[?&]snap\b/.test(location.search);

const $ = (id) => document.getElementById(id);
const fmt = (v, d = 0) => v.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smoothstep = (t) => t * t * (3 - 2 * t);

async function getJSON(name) {
  const r = await fetch(DATA + name);
  if (!r.ok) throw new Error(name + " : " + r.status);
  return r.json();
}

async function loadHeights(file, cols, rows) {
  const blob = await (await fetch(DATA + file)).blob();
  const bmp = await createImageBitmap(blob, { colorSpaceConversion: "none", premultiplyAlpha: "none" });
  const c = document.createElement("canvas");
  c.width = cols; c.height = rows;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  const px = ctx.getImageData(0, 0, cols, rows).data;
  const h = new Float32Array(cols * rows);
  for (let i = 0; i < h.length; i++) h[i] = (px[i * 4] * 256 + px[i * 4 + 1]) / 10;
  return h;
}

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch { return false; }
}

async function start() {
  const [terrain, track, stops, stages, days, summary] = await Promise.all(
    ["terrain.json", "track.json", "stops.json", "stages.json", "days.json", "summary.json"].map(getJSON));

  document.querySelectorAll("[data-k]").forEach((el) => {
    const k = el.dataset.k;
    el.textContent = k === "km" ? fmt(summary.km, 1) : fmt(summary[k]);
  });

  if (!hasWebGL()) {
    $("chargement").remove();
    const fb = document.createElement("div");
    fb.id = "scene-fallback";
    fb.innerHTML = `<p>Votre navigateur n'affiche pas la 3D. Le récit et le profil restent disponibles.</p>`;
    $("scene").appendChild(fb);
  }

  const hm = terrain.heightmaps[IS_SMALL ? "100m" : "50m"];
  const cols = hm.cols, rows = hm.rows;
  const W = terrain.width_m, H = terrain.height_m;
  const cell = W / cols;
  const heights = await loadHeights(hm.file, cols, rows);

  // altitude (m) au point (x, y) en mètres depuis le coin sud-ouest, interpolation bilinéaire
  function groundM(xm, ym) {
    const fc = clamp(xm / cell - 0.5, 0, cols - 1.001);
    const fr = clamp((H - ym) / cell - 0.5, 0, rows - 1.001);
    const c0 = fc | 0, r0 = fr | 0, tx = fc - c0, ty = fr - r0;
    const i = r0 * cols + c0;
    const a = heights[i], b = heights[i + 1], c = heights[i + cols], d = heights[i + cols + 1];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  }
  const toX = (xm) => (xm - W / 2) / S;
  const toZ = (ym) => (H / 2 - ym) / S;
  const toY = (zm) => (zm * EXAG) / S;
  const groundWorld = (X, Z) => toY(groundM(X * S + W / 2, H / 2 - Z * S));

  if (!hasWebGL()) return { track, stops, stages, days, summary, world: null };

  // ---------- rendu ----------
  const renderer = new THREE.WebGLRenderer({ antialias: !IS_SMALL, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, IS_SMALL ? 1.5 : 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  $("scene").prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x2a3446, 0.000055);
  const camera = new THREE.PerspectiveCamera(48, 1, 2, 60000);

  // relief
  const geo = new THREE.PlaneGeometry((cols - 1) * cell / S, (rows - 1) * cell / S, cols - 1, rows - 1);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, toY(heights[i]));
  pos.needsUpdate = true;
  geo.computeBoundingSphere();
  const tex = await new THREE.TextureLoader().loadAsync(DATA + terrain.textures[IS_SMALL ? "lo" : "hi"].file);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  // la texture couvre tout le relief ; les sommets sont aux centres des pixels du MNT
  const u0 = 0.5 / cols, u1 = 1 - 0.5 / cols, v0 = 0.5 / rows, v1 = 1 - 0.5 / rows;
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  // bords du relief fondus dans le ciel, pour ne jamais voir un « plateau » rectangulaire
  const am = document.createElement("canvas");
  am.width = 64; am.height = 108;
  const actx = am.getContext("2d");
  actx.fillStyle = "#000"; actx.fillRect(0, 0, 64, 108);
  actx.filter = "blur(7px)";
  actx.fillStyle = "#fff"; actx.fillRect(9, 9, 46, 90);
  const alphaTex = new THREE.CanvasTexture(am);
  const terrainMat = new THREE.MeshBasicMaterial({ map: tex, alphaMap: alphaTex, transparent: true });
  const terrainMesh = new THREE.Mesh(geo, terrainMat);
  terrainMesh.renderOrder = 0;
  scene.add(terrainMesh);

  // tracé : points en coordonnées 3D, posés sur le relief
  const n = track.x.length;
  const P = new Array(n);
  for (let i = 0; i < n; i++) {
    const X = toX(track.x[i]), Z = toZ(track.y[i]);
    P[i] = new THREE.Vector3(X, groundWorld(X, Z), Z);
  }
  const KM = track.km;
  const TOTAL = KM[n - 1];

  function ribbon(width, lift, color, opacity) {
    const vtx = new Float32Array(n * 2 * 3);
    const idx = [];
    for (let i = 0; i < n; i++) {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)];
      let tx = b.x - a.x, tz = b.z - a.z;
      const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      const nx = -tz * width, nz = tx * width;
      const L = [P[i].x + nx, P[i].z + nz], R = [P[i].x - nx, P[i].z - nz];
      const y = Math.max(P[i].y, groundWorld(L[0], L[1]), groundWorld(R[0], R[1])) + lift;
      vtx.set([L[0], y, L[1], R[0], y, R[1]], i * 6);
      if (i < n - 1) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(vtx, 3));
    g.setIndex(idx);
    const m = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, side: THREE.DoubleSide,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    m.fog = false;
    const mesh = new THREE.Mesh(g, m);
    mesh.renderOrder = 2;
    scene.add(mesh);
    return mesh;
  }
  const trailGhost = ribbon(2.2, 2.0, 0xf4f1ec, 0.28);
  // fil d'un pixel, toujours visible même de très loin
  const lineGeo = new THREE.BufferGeometry().setFromPoints(P.map((v) => v.clone().setY(v.y + 3)));
  const lineFull = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xf4f1ec, transparent: true, opacity: 0.75, depthWrite: false, fog: false }));
  lineFull.renderOrder = 1;
  scene.add(lineFull);
  const trailWhite = ribbon(3.6, 2.4, 0xf4f1ec, 1);
  const trailRed = ribbon(1.7, 2.8, 0xd8343c, 1);
  trailGhost.renderOrder = 1;
  trailWhite.renderOrder = 2;
  trailRed.renderOrder = 3;

  // point lumineux du marcheur
  const dot = new THREE.Mesh(new THREE.SphereGeometry(5, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffe2b8 }));
  dot.material.fog = false;
  scene.add(dot);
  const halo = new THREE.Mesh(new THREE.RingGeometry(9, 12, 40), new THREE.MeshBasicMaterial({ color: 0xffe2b8, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
  halo.rotation.x = -Math.PI / 2; halo.material.fog = false;
  scene.add(halo);

  // étiquettes
  const labelsEl = $("labels");
  const labels = stops.map((s) => {
    const el = document.createElement("div");
    el.className = "lbl" + (s.type === "village" ? " village" : "");
    el.innerHTML = `<span>${s.name}</span><i></i>`;
    labelsEl.appendChild(el);
    const X = toX(s.x), Z = toZ(s.y);
    return { el, s, v: new THREE.Vector3(X, groundWorld(X, Z) + 3, Z), shown: false };
  });

  // position sur le tracé à partir des km
  function pointAt(km) {
    km = clamp(km, 0, TOTAL);
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (KM[m] <= km) lo = m; else hi = m; }
    const t = (km - KM[lo]) / Math.max(1e-6, KM[hi] - KM[lo]);
    return { v: P[lo].clone().lerp(P[hi], t), i: lo + t };
  }

  // vue d'ensemble : tout le tracé, vu du sud-ouest
  const box = new THREE.Box3().setFromPoints(P);
  const centre = box.getCenter(new THREE.Vector3());
  const span = box.getSize(new THREE.Vector3());
  function overview(out, look) {
    const vf = THREE.MathUtils.degToRad(camera.fov) / 2;
    const hf = Math.atan(Math.tan(vf) * camera.aspect);
    const portrait = camera.aspect < 1;
    const f = portrait ? 0.56 : 0.5;
    const d = Math.max(span.z * f / Math.tan(vf), span.x * f / Math.tan(hf)) * 1.04;
    const tilt = THREE.MathUtils.degToRad(portrait ? 70 : 52);
    out.set(centre.x - (portrait ? 0 : d * 0.18 * Math.cos(tilt)), centre.y + d * Math.sin(tilt), centre.z + d * Math.cos(tilt));
    look.copy(centre).add(new THREE.Vector3(0, 0, span.z * 0.04));
  }

  // vue drone : en arrière et au-dessus du point courant, regard vers la suite du chemin
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
  function drone(km, out, look) {
    const here = pointAt(km).v;
    const back = pointAt(km - 1.6).v, ahead = pointAt(km + 2.4).v;
    const dir = tmpA.subVectors(ahead, back).setY(0);
    if (dir.lengthSq() < 1) dir.set(0, 0, 1);
    dir.normalize();
    const side = tmpB.set(-dir.z, 0, dir.x);
    out.copy(here).addScaledVector(dir, -300).addScaledVector(side, 80);
    out.y = here.y + 190;
    const g = groundWorld(out.x, out.z) + 80;
    if (out.y < g) out.y = g;
    look.copy(here).addScaledVector(dir, 140);
    look.y = here.y - 20;
  }

  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
  const wantPos = new THREE.Vector3(), wantLook = new THREE.Vector3();
  const oPos = new THREE.Vector3(), oLook = new THREE.Vector3();
  const dPos = new THREE.Vector3(), dLook = new THREE.Vector3();

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  addEventListener("resize", resize);
  resize();
  overview(camPos, camLook);

  // ---------- état piloté par le défilement ----------
  const survol = $("survol");
  let progress = 0;           // 0..1 sur la section
  let first = true;
  const INTRO = 0.05, OUTRO = 0.94;
  const kmFromProgress = (p) => clamp((p - INTRO) / (OUTRO - INTRO), 0, 1) * TOTAL;
  const progressFromKm = (km) => INTRO + (km / TOTAL) * (OUTRO - INTRO);

  function readScroll() {
    const r = survol.getBoundingClientRect();
    const len = r.height - innerHeight;
    progress = clamp(-r.top / len, 0, 1);
  }
  addEventListener("scroll", readScroll, { passive: true });
  readScroll();

  function scrollToProgress(p) {
    const top = survol.getBoundingClientRect().top + scrollY;
    scrollTo(0, top + p * (survol.offsetHeight - innerHeight));
  }

  // ---------- lecture automatique (~90 s) ----------
  let playing = false, lastT = 0;
  const btn = $("lecture");
  function setPlaying(on) {
    playing = on;
    btn.setAttribute("aria-pressed", String(on));
    $("lecture-txt").textContent = on ? "Pause" : "Lecture";
    $("lecture-ico").setAttribute("d", on ? "M2 1h3.5v12H2zM8.5 1H12v12H8.5z" : "M2 1l11 6-11 6z");
  }
  btn.addEventListener("click", () => {
    if (!playing && progress >= 0.999) scrollToProgress(0);
    setPlaying(!playing);
  });
  const stopPlay = () => playing && setPlaying(false);
  ["wheel", "touchstart", "keydown"].forEach((e) => addEventListener(e, (ev) => {
    if (ev.target === btn) return;
    stopPlay();
  }, { passive: true }));

  // ---------- profil altimétrique ----------
  const prof = $("profil");
  const pctx = prof.getContext("2d");
  const zmin = 0, zmax = Math.ceil(Math.max(...track.z) / 500) * 500;
  let profW = 0, profH = 0;
  function drawProfile(km) {
    const dpr = Math.min(devicePixelRatio, 2);
    const w = prof.clientWidth, h = prof.clientHeight;
    if (w !== profW || h !== profH) { prof.width = w * dpr; prof.height = h * dpr; profW = w; profH = h; }
    pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    pctx.clearRect(0, 0, w, h);
    const padB = 14, padT = 4;
    const X = (k) => (k / TOTAL) * w;
    const Y = (z) => padT + (1 - (z - zmin) / (zmax - zmin)) * (h - padT - padB);
    // grille 1000 m / 2000 m
    pctx.strokeStyle = "rgba(233,226,218,.10)"; pctx.lineWidth = 1;
    pctx.fillStyle = "rgba(169,178,189,.75)"; pctx.font = "10px 'IBM Plex Mono', monospace";
    for (let z = 1000; z < zmax; z += 1000) {
      pctx.beginPath(); pctx.moveTo(0, Y(z) + .5); pctx.lineTo(w, Y(z) + .5); pctx.stroke();
      pctx.fillText(fmt(z) + " m", 2, Y(z) - 2);
    }
    // aire parcourue / restante
    const path = () => { pctx.beginPath(); pctx.moveTo(0, Y(track.z[0])); for (let i = 1; i < n; i += 2) pctx.lineTo(X(KM[i]), Y(track.z[i])); pctx.lineTo(w, Y(track.z[n - 1])); };
    path(); pctx.lineTo(w, h - padB); pctx.lineTo(0, h - padB); pctx.closePath();
    pctx.fillStyle = "rgba(233,226,218,.12)"; pctx.fill();
    pctx.save(); pctx.beginPath(); pctx.rect(0, 0, X(km), h); pctx.clip();
    path(); pctx.lineTo(w, h - padB); pctx.lineTo(0, h - padB); pctx.closePath();
    pctx.fillStyle = "rgba(216,52,60,.42)"; pctx.fill();
    path(); pctx.strokeStyle = "#f4f1ec"; pctx.lineWidth = 1.5; pctx.stroke();
    pctx.restore();
    // limites d'étapes
    pctx.fillStyle = "rgba(169,178,189,.9)"; pctx.textAlign = "center";
    stages.forEach((s) => {
      const x = X(s.start_km);
      pctx.fillStyle = "rgba(233,226,218,.22)"; pctx.fillRect(Math.round(x), padT, 1, h - padT - padB);
      if (w > 520 || s.n % 2 === 1) { pctx.fillStyle = "rgba(169,178,189,.9)"; pctx.fillText(String(s.n), X((s.start_km + s.end_km) / 2), h - 3); }
    });
    // curseur
    const cx = X(km);
    pctx.fillStyle = "#ffe2b8"; pctx.fillRect(cx - 1, padT, 2, h - padT - padB);
    const cz = pointAt(km);
    pctx.beginPath(); pctx.arc(cx, Y(track.z[Math.round(cz.i)]), 4, 0, 7); pctx.fill();
    pctx.textAlign = "left";
  }
  function seekFromEvent(ev) {
    const r = prof.getBoundingClientRect();
    const km = clamp((ev.clientX - r.left) / r.width, 0, 1) * TOTAL;
    stopPlay();
    scrollToProgress(progressFromKm(km));
  }
  let dragging = false;
  prof.addEventListener("pointerdown", (e) => { dragging = true; prof.setPointerCapture(e.pointerId); seekFromEvent(e); });
  prof.addEventListener("pointermove", (e) => dragging && seekFromEvent(e));
  prof.addEventListener("pointerup", () => (dragging = false));
  prof.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const km = kmFromProgress(progress) + (e.key === "ArrowRight" ? 2 : -2);
    scrollToProgress(progressFromKm(clamp(km, 0, TOTAL)));
  });

  // ---------- HUD ----------
  const dayOf = (stageN) => days.find((d) => d.stages.includes(stageN));
  let lastStage = -1;
  function updateHud(km) {
    const st = stages.find((s) => km <= s.end_km) || stages[stages.length - 1];
    if (st.n !== lastStage) {
      lastStage = st.n;
      const d = dayOf(st.n);
      $("hud-jour").textContent = `Jour ${d.day} · étape ${st.n} sur 16${d.doubled ? " · étape doublée" : ""}`;
      $("hud-etape").textContent = `${st.from_name} → ${st.to_name}`;
    }
    const p = pointAt(km);
    $("hud-alt").textContent = fmt(Math.round(track.z[Math.round(p.i)] / 5) * 5);
    $("hud-km").textContent = fmt(km, 1);
  }

  // ---------- boucle ----------
  const proj = new THREE.Vector3();
  let lastHudKm = -1;
  function frame(t) {
    const dt = Math.min(0.1, (t - (lastT || t)) / 1000);
    lastT = t;
    if (playing) {
      const np = progress + dt / 90;
      if (np >= 1) { setPlaying(false); scrollToProgress(1); }
      else scrollToProgress(np);
      readScroll();
    }

    const km = kmFromProgress(progress);
    overview(oPos, oLook);
    drone(km, dPos, dLook);
    let w;
    if (progress < INTRO) w = smoothstep(progress / INTRO);
    else if (progress > OUTRO) w = 1 - smoothstep((progress - OUTRO) / (1 - OUTRO));
    else w = 1;
    wantPos.lerpVectors(oPos, dPos, w);
    wantLook.lerpVectors(oLook, dLook, w);
    // pendant les transitions, on monte au-dessus du relief pour ne jamais le traverser
    const lift = Math.sin(Math.PI * w) * 0.25 * oPos.y * (w < 1 ? 1 : 0);
    wantPos.y = Math.max(wantPos.y + lift * 0.2, groundWorld(wantPos.x, wantPos.z) + 55);

    const k = first || REDUCED ? 1 : 1 - Math.exp(-dt * 3.2);
    first = false;
    camPos.lerp(wantPos, k);
    camLook.lerp(wantLook, k);
    camera.position.copy(camPos);
    camera.lookAt(camLook);

    // tracé révélé jusqu'au point courant
    const shownKm = progress > OUTRO ? TOTAL : km;
    const seg = Math.floor(pointAt(shownKm).i);
    lineFull.material.color.setHex(progress > OUTRO + 0.01 ? 0xff5a60 : 0xf4f1ec);
    lineFull.material.opacity = progress > OUTRO + 0.01 ? 1 : 0.75;
    trailWhite.geometry.setDrawRange(0, seg * 6);
    trailRed.geometry.setDrawRange(0, seg * 6);
    const here = pointAt(shownKm).v;
    dot.position.copy(here).setY(here.y + 6);
    halo.position.copy(here).setY(here.y + 3);
    const pulse = 1 + 0.25 * Math.sin(t / 380);
    halo.scale.setScalar(pulse * (0.6 + 1.8 * (1 - w)));
    dot.scale.setScalar(0.6 + 2.2 * (1 - w));

    // étiquettes proches
    for (const L of labels) {
      proj.copy(L.v).project(camera);
      const dist = camPos.distanceTo(L.v);
      const edge = L.s.id === "calenzana" || L.s.id === "conca";
      const show = proj.z < 1 && Math.abs(proj.x) < 1.05 && Math.abs(proj.y) < 1.05 &&
        (w > 0.6 ? dist < 1300 : edge);
      if (show) L.el.style.transform = `translate(${(proj.x * 0.5 + 0.5) * innerWidth}px, ${(-proj.y * 0.5 + 0.5) * innerHeight}px) translate(-50%, -100%)`;
      if (show !== L.shown) { L.el.style.opacity = show ? "1" : "0"; L.shown = show; }
    }

    // HUD et profil visibles pendant la traversée
    const inFlight = progress > INTRO * 0.6 && progress < 0.995;
    $("hud").toggleAttribute("data-on", inFlight);
    $("profil-wrap").toggleAttribute("data-on", inFlight);
    if (Math.abs(km - lastHudKm) > 0.04 || !inFlight) { updateHud(km); lastHudKm = km; }
    if (inFlight) drawProfile(shownKm);

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  $("chargement").setAttribute("data-done", "");
  requestAnimationFrame(frame);
}

start().catch((e) => {
  console.error(e);
  const c = $("chargement");
  if (c) c.textContent = "Le relief n'a pas pu se charger. Rechargez la page.";
});
