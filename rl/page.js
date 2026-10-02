import { t } from './i18n.js?v=15';
import { initMechanism } from './mechanism.js?v=15';
import * as THREE from 'three';
import { OrbitControls } from 'https://esm.sh/three@0.160.1/examples/jsm/controls/OrbitControls.js';
import { STLLoader } from 'https://esm.sh/three@0.160.1/examples/jsm/loaders/STLLoader.js';

const $ = id => document.getElementById(id);
THREE.Object3D.DEFAULT_UP.set(0, 0, 1);
const assets = new Map();
const loader = new STLLoader();
function geometry(url) {
  if (!assets.has(url)) assets.set(url, loader.loadAsync(url));
  return assets.get(url);
}
async function json(url) {
  const response = await fetch(`${url}?v=15`, {cache: 'no-store'});
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const data = await response.json();
  const joint = url.endsWith('joints.json');
  if (!Array.isArray(data.parts) || !Array.isArray(data.cases) ||
      (joint && data.cases.some(c => !Array.isArray(c.rectangle) || !c.variants?.every(v => Array.isArray(v.tip_positions) && Array.isArray(v.command_path))))) {
    throw new Error(t("비교 데이터 형식이 현재 페이지와 맞지 않습니다. 데이터를 다시 생성해주세요."));
  }
  return data;
}
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const pairs = [];
const deg = value => (value * 180 / Math.PI).toFixed(1);

function makeView(id, kind) {
  const element = $(id);
  let view;
  const renderer = new THREE.WebGLRenderer({antialias: true, alpha: false});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
  renderer.setClearColor(0xf6f6f6);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  element.prepend(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', t('canvasDescription', {id}));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, .0002, 10);
  camera.up.set(0, 0, 1);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;
  controls.minDistance = kind === 'joint' ? .12 : .015;
  controls.maxDistance = 1.5;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x737373, 2.1));
  const light = new THREE.DirectionalLight(0xffffff, 2.3);
  light.position.set(.5, -.4, 1);
  scene.add(light);
  const fill = new THREE.DirectionalLight(0xdde4fa, .8);
  fill.position.set(-1, .4, .4);
  scene.add(fill);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(.8, .8), new THREE.MeshStandardMaterial({color: 0xeeeeee, roughness: 1}));
  floor.position.set(0, kind === 'joint' ? .35 : 0, -.0005);
  scene.add(floor);
  const grid = new THREE.GridHelper(.8, 22, 0xcccccc, 0xdddddd);
  grid.rotation.x = Math.PI / 2;
  grid.position.copy(floor.position); grid.position.z = -.0003;
  grid.material.transparent = true; grid.material.opacity = .5;
  scene.add(grid);
  function fit() {
    if (kind === 'joint') {
      controls.target.set(0, .35, .158);
      camera.position.set(.26, -.12, .32);
    } else {
      controls.target.set(0, -.01, .17);
      camera.position.set(.40, -.48, .57);
    }
    camera.lookAt(controls.target); controls.update();
  }
  function resize() {
    const {width, height} = element.getBoundingClientRect();
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
    if (view) view.dirty = true;
  }
  new ResizeObserver(resize).observe(element);
  fit(); resize();
  view = {element, renderer, camera, scene, controls, fit, meshes: [], overlays: [], dirty: true};
  controls.addEventListener('change', () => {view.dirty = true;});
  return view;
}
function applyPose(mesh, pose) {
  mesh.position.set(...pose.slice(0, 3));
  // Stored source quaternions use MuJoCo wxyz, Three.js uses xyzw.
  mesh.quaternion.set(pose[4], pose[5], pose[6], pose[3]);
}
function renderPair(pair) {
  const views = pair.kind === 'joint' && pair.displayMode === 'overlay' ? [pair.combined] : pair.views;
  for (const view of views) {view.renderer.render(view.scene, view.camera); view.dirty = false;}
  pair.views.forEach(v => {v.dirty = false;});
  if (pair.combined) pair.combined.dirty = false;
}
function syncViews(views) {
  let busy = false;
  views.forEach((source, index) => source.controls.addEventListener('change', () => {
    if (busy) return;
    busy = true;
    const other = views[1 - index];
    other.camera.position.copy(source.camera.position);
    other.camera.quaternion.copy(source.camera.quaternion);
    other.controls.target.copy(source.controls.target);
    other.controls.update();
    busy = false;
  }));
}
function setupPair(kind, data) {
  const views = [makeView(`${kind}-off`, kind), makeView(`${kind}-on`, kind)];
  syncViews(views);
  const pair = {kind, data, views, currentCase: 0, frame: 0, elapsed: 0, ready: false, visible: false, playing: !reducedMotion, last: performance.now()};
  const maxFrame = data.cases[0].variants[0].poses.length - 1;
  const time = $(`${kind}-time`); time.max = maxFrame;
  $(`${kind}-play`).onclick = () => {
    if (!pair.ready) return;
    if (pair.frame === maxFrame) {pair.elapsed = 0; pair.playing = true; update(pair, 0);}
    else pair.playing = !pair.playing;
    pair.last = performance.now();
    $(`${kind}-play`).textContent = pair.playing ? t("일시정지 Ⅱ") : t("재생 ▶");
  };
  time.oninput = () => {
    pair.playing = false;
    pair.elapsed = Number(time.value) * data.dt;
    $(`${kind}-play`).textContent = t("재생 ▶");
    update(pair, Number(time.value)); renderPair(pair);
  };
  $(`${kind}-fit`).onclick = () => {(pair.displayMode === 'overlay' ? pair.combined : views[0]).fit(); renderPair(pair);};
  new IntersectionObserver(entries => {
    pair.visible = entries[0].isIntersecting;
    if (pair.visible) pair.views.forEach(view => {view.dirty = true;});
    pair.last = performance.now();
  }, {rootMargin: '100px'}).observe($(`${kind}-experiment`));
  pairs.push(pair);
  return pair;
}
function update(pair, frame) {
  if (!pair.ready) return;
  const scenario = pair.data.cases[pair.currentCase];
  frame = Math.max(0, Math.min(Math.floor(frame), scenario.variants[0].poses.length - 1));
  pair.frame = frame;
  pair.views.forEach((view, i) => {
    const variant = scenario.variants[i];
    const state = variant.poses[frame];
    if (pair.kind === 'joint') {
      view.meshes.forEach((mesh, j) => applyPose(mesh, state[j]));
      view.overlays.forEach(({mesh, index}) => applyPose(mesh, state[index]));
      const selected = scenario.selected_finger_index;
      const q = variant.q[frame];
      const raw = variant.requested[frame][selected];
      const offset = selected * 4;
      $(`joint-${i ? 'on' : 'off'}-readout`).innerHTML = `<span>${t('입력 R/P')} <b>${deg(raw[0])}° / ${deg(raw[1])}°</b></span><span>${t('실제 R/P')} <b>${deg(q[offset])}° / ${deg(q[offset+1])}°</b></span>`;
      view.trail.geometry.setDrawRange(0, variant.tip_positions.length);
      view.tip.position.set(...variant.tip_positions[frame]);
      pair.combined?.tips?.[i].position.copy(view.tip.position);
    } else {
      applyPose(view.meshes[0], state[0]);
      applyPose(view.meshes[1], state[1]);
      const timeSeconds = frame * pair.data.dt;
      const fallen = variant.floor_contact_time_s !== null && timeSeconds >= variant.floor_contact_time_s;
      const contact = variant.contacts[frame];
      const label = fallen ? t("낙하 · 바닥 접촉") : contact.some(n => n.startsWith('shell') || n.startsWith('pad')) ? t("손 위 접촉") : t("자유 운동");
      $(`pad-${i ? 'on' : 'off'}-readout`).innerHTML = `<span class="${fallen ? 'fall' : 'hold'}">${label}</span><span>${t('높이')} <b>${(state[1][2] * 1000).toFixed(1)} mm</b></span><span>${t('지지력')} <b>${variant.normal_force_n[frame].toFixed(2)} N</b></span>`;
    }
  });
  if (pair.kind === 'joint') {
    if (pair.combined) pair.combined.models.forEach((model, i) => model.forEach((mesh, j) => applyPose(mesh, scenario.variants[i].poses[frame][j])));
    drawJointChart(pair);
  }
  $(`${pair.kind}-time`).value = frame;
  $(`${pair.kind}-clock`).textContent = `${(frame * pair.data.dt).toFixed(2)} / ${pair.data.duration.toFixed(2)} s`;
}
function selectCase(pair, index) {
  pair.currentCase = index; pair.elapsed = 0; pair.last = performance.now();
  if (pair.kind === 'joint') {buildTrails(pair); styleOverlay(pair);}
  update(pair, 0); renderPair(pair);
}
function finish(pair) {
  pair.ready = true;
  for (const id of [`${pair.kind}-play`, `${pair.kind}-off-readout`, `${pair.kind}-on-readout`, ...(pair.kind === 'joint' ? ['joint-description'] : ['pad-outcome'])]) $(id).removeAttribute('data-i18n');
  pair.views.forEach(v => v.element.querySelector('.loading').remove());
  $(`${pair.kind}-play`).disabled = false;
  $(`${pair.kind}-play`).textContent = pair.playing ? t("일시정지 Ⅱ") : t("재생 ▶");
  pair.last = performance.now();
  update(pair, 0); renderPair(pair);
}
function reportError(kind, error) {
  console.error(error);
  for (const id of [`${kind}-off`, `${kind}-on`]) {
    const loading = $(id).querySelector('.loading');
    if (loading) {loading.textContent = t('modelError', {message:error.message}); loading.classList.add('error');}
  }
}
async function initJoints() {
  const data = await json('data/joints.json');
  const pair = setupPair('joint', data);
  pair.variantVisible = [true, true];
  const geometries = await Promise.all(data.parts.map(p => geometry(p.mesh)));
  for (const view of pair.views) {
    geometries.forEach((g, i) => {
      const base = data.parts[i].body === 'left_hand_base_link';
      const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({color: base ? 0x515954 : 0xc7ced1, metalness: .15, roughness: .65}));
      view.scene.add(mesh); view.meshes.push(mesh);
    });
  }
  const padParts = data.parts.map((p, index) => {
    const match = p.body.match(/^left_link([234])_(thumb|index|middle|ring|baby)$/);
    return match ? {index, file: `assets/aidin_pad_selections/link${match[1]}${match[2] === 'thumb' ? '_thumb' : ''}_pad_surface.STL`} : null;
  }).filter(Boolean);
  const padGeometries = await Promise.all(padParts.map(p => geometry(p.file)));
  for (const view of pair.views) {
    padGeometries.forEach((g, i) => {
      const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({color: 0x96c74f, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, roughness: .8}));
      mesh.visible = false; view.scene.add(mesh); view.overlays.push({mesh, index: padParts[i].index});
    });
  }
  $('show-pads').onchange = () => {applyVariantVisibility(pair); renderPair(pair);};
  document.querySelectorAll('[data-joint-case]').forEach(button => button.onclick = () => {
    const index = data.cases.findIndex(c => c.id === button.dataset.jointCase);
    document.querySelectorAll('[data-joint-case]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    const name = button.dataset.jointCase === 'index' ? t("검지") : t("엄지");
    $('joint-description').textContent = t('jointDescription',{finger:name});
    selectCase(pair, index);
  });
  pair.combined = makeView('joint-overlay', 'joint');
  pair.combined.models = pair.views.map((view, i) => view.meshes.map(mesh => {
    const clone = new THREE.Mesh(mesh.geometry, new THREE.MeshStandardMaterial({
      color: i ? 0x249354 : 0xd43f45, transparent: true, opacity: i ? .65 : .28,
      depthWrite: false, depthTest: false, roughness: .75, metalness: 0
    }));
    clone.renderOrder = i ? 1 : 2;
    pair.combined.scene.add(clone); return clone;
  }));
  pair.displayMode = 'overlay';
  document.querySelectorAll('[data-joint-visible]').forEach(button => button.onclick = () => {
    const i = Number(button.dataset.jointVisible);
    pair.variantVisible[i] = !pair.variantVisible[i];
    button.setAttribute('aria-pressed', String(pair.variantVisible[i]));
    applyVariantVisibility(pair); drawJointChart(pair); renderPair(pair);
  });
  document.querySelectorAll('[data-joint-view]').forEach(button => button.onclick = () => {
    if (!pair.ready) return;
    const overlay = button.dataset.jointView === 'overlay';
    const source = pair.displayMode === 'overlay' ? pair.combined : pair.views[0];
    const destinations = overlay ? [pair.combined] : pair.views;
    destinations.forEach(view => {
      view.camera.position.copy(source.camera.position);view.camera.quaternion.copy(source.camera.quaternion);
      view.controls.target.copy(source.controls.target);view.controls.update();view.dirty = true;
    });
    pair.displayMode = button.dataset.jointView;
    $('joint-experiment').classList.toggle('overlay-mode', overlay);
    document.querySelectorAll('[data-joint-view]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    renderPair(pair);
  });
  pair.combined.element.querySelector('.loading').remove();
  buildTrails(pair); styleOverlay(pair);
  finish(pair);
}
function status(v) {
  return v.retained ? t("6초 유지") : t('fallTime',{time:v.floor_contact_time_s?.toFixed(2) ?? '—'});
}
async function initPads() {
  const data = await json('data/pads.json');
  const pair = setupPair('pad', data);
  const geometries = await Promise.all(data.parts.map(part => geometry(part.mesh)));
  const pads = await Promise.all(data.parts.map(part => part.pad_mesh ? geometry(part.pad_mesh) : null));
  for (const [i, view] of pair.views.entries()) {
    const support = new THREE.Group();
    data.parts.forEach((part, j) => {
      const base = part.body === 'left_hand_base_link';
      const mesh = new THREE.Mesh(geometries[j], new THREE.MeshStandardMaterial({color: base ? 0x515954 : 0xc7ced1, roughness: .7, metalness: .12}));
      applyPose(mesh, part.local_pose);
      support.add(mesh);
      if (i && pads[j]) {
        const pad = new THREE.Mesh(pads[j], new THREE.MeshStandardMaterial({color: 0x8ebc55, roughness: .85}));
        applyPose(pad, part.local_pose); support.add(pad); view.overlays.push({mesh: pad});
      }
    });
    const object = new THREE.Mesh(new THREE.BoxGeometry(...data.object_size_m), new THREE.MeshStandardMaterial({color: 0xd78d4b, roughness: .8, transparent: true, opacity: .86}));
    view.scene.add(support, object); view.meshes.push(support, object);
    view.handParts = data.parts.length;
  }
  function outcome() {
    const c = data.cases[pair.currentCase];
    $('pad-outcome').innerHTML = `<b>${t('padResult',{angle:c.angle_deg})}</b> &nbsp; OFF: ${status(c.variants[0])} &nbsp; / &nbsp; ON: ${status(c.variants[1])}<span class="muted">${t('padResultNote')}</span>`;
  }
  document.querySelectorAll('[data-pad-angle]').forEach(button => button.onclick = () => {
    const index = data.cases.findIndex(c => c.angle_deg === Number(button.dataset.padAngle));
    document.querySelectorAll('[data-pad-angle]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    selectCase(pair, index); pair.playing = true; $('pad-play').textContent = t("일시정지 Ⅱ"); outcome();
  });
  pair.refreshOutcome = () => {outcome(); $('pad-results-table').innerHTML = `<table><thead><tr><th>${t('조건')}</th><th>OFF</th><th>ON</th></tr></thead><tbody>${data.cases.map(c => `<tr><td>${c.angle_deg}°</td><td>${status(c.variants[0])}</td><td>${status(c.variants[1])}</td></tr>`).join('')}</tbody></table>`;};
  finish(pair); pair.refreshOutcome();
}
function buildTrails(pair) {
  const scenario = pair.data.cases[pair.currentCase];
  pair.views.forEach((view, i) => {
    for (const obj of [view.trail, view.fullTrail, view.tip]) {
      if (obj) {obj.removeFromParent(); obj.geometry.dispose(); obj.material.dispose();}
    }
    const points = scenario.variants[i].tip_positions.map(p => new THREE.Vector3(...p));
    const color = i ? 0x28844b : 0xc34242;
    view.fullTrail = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({color, transparent: true, opacity: .24}));
    view.trail = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({color, depthTest: false, transparent: true, opacity: .95}));
    view.trail.renderOrder = 3;
    view.tip = new THREE.Mesh(new THREE.SphereGeometry(.003, 12, 8), new THREE.MeshBasicMaterial({color}));
    view.scene.add(view.fullTrail, view.trail, view.tip);
    view.meshes.forEach((mesh, n) => {
      const name = pair.data.parts[n].body;
      mesh.material.color.setHex(name === 'left_hand_base_link' ? 0x515954 : name.endsWith('_'+scenario.id) ? 0xd1dcd4 : 0xaab3ac);
    });
  });
}
function styleOverlay(pair) {
  if (!pair.combined) return;
  const combined = pair.combined, scenario = pair.data.cases[pair.currentCase];
  for (const obj of combined.annotations ?? []) {obj.removeFromParent();obj.geometry.dispose();obj.material.dispose();}
  combined.annotations = []; combined.tips = []; combined.paths = [];
  combined.models.forEach((meshes, i) => {
    const color = i ? 0x28844b : 0xc34242;
    meshes.forEach((mesh, j) => {
      const active = pair.data.parts[j].body.endsWith('_'+scenario.id);
      mesh.material.opacity = active ? (i ? .68 : .32) : (i ? .18 : .07);
      // Sparse feature edges on the moving links retain shape through overlap.
      if (active) {
        const edge = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 45), new THREE.LineBasicMaterial({color, transparent: true, opacity: i ? .7 : .5, depthTest: false, depthWrite: false}));
        edge.renderOrder = 4;mesh.add(edge);combined.annotations.push(edge);
      }
    });
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(scenario.variants[i].tip_positions.map(p=>new THREE.Vector3(...p))), new THREE.LineBasicMaterial({color, transparent: true, opacity: .8, depthTest: false, depthWrite: false}));
    line.renderOrder=5;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(.0025,12,8), new THREE.MeshBasicMaterial({color, depthTest:false}));
    tip.renderOrder=6;combined.scene.add(line,tip);combined.annotations.push(line,tip);combined.tips.push(tip);combined.paths.push(line);
  });
  applyVariantVisibility(pair);
  combined.dirty = true;
}
function applyVariantVisibility(pair) {
  pair.variantVisible.forEach((visible, i) => {
    pair.combined.models[i].forEach(mesh => {mesh.visible = visible;});
    if (pair.combined.paths?.[i]) pair.combined.paths[i].visible = visible;
    if (pair.combined.tips?.[i]) pair.combined.tips[i].visible = visible;
    const view = pair.views[i];
    [...view.meshes, view.trail, view.fullTrail, view.tip].filter(Boolean).forEach(mesh => {mesh.visible = visible;});
    view.overlays.forEach(pad => {pad.mesh.visible = visible && $('show-pads').checked;});
  });
}
function drawJointChart(pair) {
  const canvas = $('joint-path-chart'), ctx = canvas.getContext('2d');
  const c = pair.data.cases[pair.currentCase], e = c.reach_envelope;
  const w=canvas.width, h=canvas.height, left=48, right=24, top=12, bottom=32;
  const pitchMax = c.joint_limits[1][1] * 1.08;
  const x = r => left + (r + .75) / 1.5 * (w-left-right);
  const y = p => h-bottom-p/pitchMax*(h-top-bottom);
  ctx.clearRect(0,0,w,h);ctx.font='10px sans-serif';ctx.lineWidth=1;
  ctx.strokeStyle='#dddddd';ctx.fillStyle='#777777';ctx.setLineDash([]);
  for (const d of [-30,0,30]) {let xx=x(d*Math.PI/180);ctx.beginPath();ctx.moveTo(xx,top);ctx.lineTo(xx,h-bottom);ctx.stroke();ctx.fillText(d+'°',xx-9,h-bottom+16);}
  for (let d=0;d<=Math.round(pitchMax*180/Math.PI);d+=30) {let yy=y(d*Math.PI/180);ctx.beginPath();ctx.moveTo(left,yy);ctx.lineTo(w-right,yy);ctx.stroke();ctx.fillText(d+'°',15,yy+3);}
  ctx.fillText('roll',w-30,h-4);ctx.fillText('pitch',4,10);
  function path(points) {ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(x(p[0]),y(p[1])):ctx.moveTo(x(p[0]),y(p[1])));}
  const envelope=e.pitch.map((p,i)=>[e.roll_hi[i],p]).concat(e.pitch.map((p,i)=>[e.roll_lo[i],p]).reverse());
  path(envelope);ctx.closePath();ctx.fillStyle='#e5e5e5';ctx.fill();ctx.strokeStyle='#bbbbbb';ctx.stroke();
  ctx.setLineDash([5,4]);ctx.strokeStyle='#a3a69e';ctx.lineWidth=1;path(c.rectangle);ctx.stroke();ctx.setLineDash([]);
  c.variants.forEach((v,i)=>{
    if (!pair.variantVisible[i]) return;
    const offset=c.selected_finger_index*4, q=v.q[pair.frame];
    ctx.strokeStyle=i?'#28844b':'#c34242';ctx.lineWidth=1.4;
    path(v.q.map(q=>[q[offset],q[offset+1]]));ctx.stroke();
    ctx.beginPath();ctx.arc(x(q[offset]),y(q[offset+1]),4,0,2*Math.PI);ctx.fillStyle=ctx.strokeStyle;ctx.fill();
  });
}
const viewerLabels = () => Object.fromEntries(['Play','Pause','LoopOn','LoopOff','Reset','Frame','Timeline','Title','Previous','Next'].map(key => [key,t('viewer'+key)]));
function refreshEmbeddedLanguage() {
  $('rollout-frame').contentWindow?.projectPageSetLabels?.(viewerLabels(), document.documentElement.lang);
}
let telemetryObserver;
$('rollout-frame').addEventListener('load', () => {
  telemetryObserver?.disconnect();
  try {
    const doc = $('rollout-frame').contentDocument;
    refreshEmbeddedLanguage();
    const source = doc?.getElementById('telemetry');
    if (!source) { $('rollout-telemetry').textContent=t("이 기록에는 상태 정보가 없습니다."); return; }
    $('rollout-telemetry').removeAttribute('data-i18n');
    const style=doc.createElement('style');
    style.textContent='#telemetry { display: none !important; }';doc.head.appendChild(style);
    const mirror=()=>{const value=source.textContent.replace(/^STEP TELEMETRY\s*/, '');if($('rollout-telemetry').textContent!==value)$('rollout-telemetry').textContent=value || t("프레임 정보를 기다리는 중…");};
    mirror();telemetryObserver=new MutationObserver(mirror);
    telemetryObserver.observe(source,{childList:true,subtree:true,characterData:true});
  } catch(error) { $('rollout-telemetry').textContent=t("상태 패널을 읽지 못했습니다. 같은 서버에서 페이지를 열어주세요."); console.error(error); }
});
const families = [ {name: '팔각기둥', envs: [4, 6]}, {name: '납작한 사과', envs: [1, 3]}, {name: '원뿔대', envs: [2, 5]}, {name: '세운 원통', envs: [0, 7]} ];
let rolloutRequest = 0;
function refreshRolloutLabels() {
  const index = Number($('family-select').value), family = families[index];
  document.querySelectorAll('[data-family]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.family) === index)));
  $('rollout-frame').title = t('rolloutTitle', {name:t(family.name),epoch:$('epoch-select').value,env:family.envs[Number($('sample-select').value)]});
}
window.addEventListener('languagechange', () => {
  for (const pair of pairs) {
    if (!pair.ready) continue;
    update(pair, pair.frame);
    $(`${pair.kind}-play`).textContent = pair.playing ? t('일시정지 Ⅱ') : t('재생 ▶');
    if (pair.kind === 'joint') $('joint-description').textContent = t('jointDescription', {finger:t(pair.data.cases[pair.currentCase].id === 'index' ? '검지' : '엄지')});
    pair.refreshOutcome?.();
    renderPair(pair);
  }
  document.querySelectorAll('.viewport canvas:not(#joint-path-chart)').forEach(c => c.setAttribute('aria-label', t('canvasDescription',{id:c.parentElement.id})));
  refreshRolloutLabels(); refreshEmbeddedLanguage();
});
document.querySelectorAll('[data-family]').forEach(button => button.onclick = () => {
  if ($('family-select').value === button.dataset.family) return;
  $('family-select').value = button.dataset.family;
  updateRollout();
});
async function updateRollout() {
  const request = ++rolloutRequest;
  refreshRolloutLabels();
  const family = families[Number($('family-select').value)];
  const epoch = $('epoch-select').value;
  const env = family.envs[Number($('sample-select').value)];
  [...$('sample-select').options].forEach((o, i) => {o.textContent = `env${family.envs[i]}`;});
  const url = `rollouts/ep${epoch}/env${env}/pose_viewer_step_000000600_0000.html`;
  telemetryObserver?.disconnect();
  $('rollout-telemetry').textContent=t("선택한 기록을 불러오는 중…");
  $('open-viewer').href = url;
  $('rollout-frame').title = t('rolloutTitle',{name:t(family.name),epoch,env});
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    let html = await response.text();
    if (request !== rolloutRequest) return;
    const anchor = 'controls.enableDamping = true;';
    if (!html.includes(anchor)) throw new Error(t("기록의 카메라 초기화 위치를 찾지 못했습니다."));
    // Translate camera and orbit center equally: a small pan, not a rotation.
    html = html.replace(anchor, `${anchor}
      camera.position.add(new THREE.Vector3(0.22, 0, 0.10));
      controls.target.add(new THREE.Vector3(0.22, 0, 0.10));
      window.projectPageCamera = () => ({position: camera.position.toArray(), target: controls.target.toArray()});`);
    // The recorded convex solids contain mixed triangle winding. Orient their
    // existing triangles outwards before normals are computed; keep positions,
    // opacity, replay poses and the original saved HTML files unchanged.
    const normalAnchor = 'geometry.computeVertexNormals();';
    if (!html.includes(normalAnchor)) throw new Error(t("물체 표면의 초기화 위치를 찾지 못했습니다."));
    html = html.replace(normalAnchor, `
                if (robotConfig.name === 'object' || robotConfig.name === 'goal') {
                  const positions = geometry.getAttribute('position');
                  const center = new THREE.Vector3();
                  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
                  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), normal = new THREE.Vector3();
                  for (let i = 0; i < positions.count; i++) center.add(a.fromBufferAttribute(positions, i));
                  center.divideScalar(positions.count);
                  let correctedFaces = 0;
                  for (let i = 0; i < positions.count; i += 3) {
                    a.fromBufferAttribute(positions, i);
                    b.fromBufferAttribute(positions, i + 1);
                    c.fromBufferAttribute(positions, i + 2);
                    normal.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a));
                    if (normal.dot(ab.subVectors(a, center)) < 0) {
                      positions.setXYZ(i + 1, c.x, c.y, c.z);
                      positions.setXYZ(i + 2, b.x, b.y, b.z);
                      correctedFaces++;
                    }
                  }
                  positions.needsUpdate = true;
                  window.projectPageObjectSurfaces ??= {};
                  window.projectPageObjectSurfaces[robotConfig.name] = {faces: positions.count / 3, correctedFaces};
                }
                ${normalAnchor}`);
    // Localize the embedded copy while retaining playback state and source files.
    html = html.replace('const sceneConfig =', `
      let projectLabels = ${JSON.stringify(viewerLabels())};
      window.projectPageSetLabels = (labels, language) => {
        projectLabels = labels;
        document.documentElement.lang = language;
        playPauseButton.textContent = isPlaying ? labels.Pause : labels.Play;
        loopToggleButton.textContent = isLooping ? labels.LoopOn : labels.LoopOff;
        document.getElementById('reset').textContent = labels.Reset;
        timelineEl.setAttribute('aria-label', labels.Timeline);
        frameMetaEl.textContent = labels.Frame + ' ' + (currentFrame + 1) + ' / ' + timestamps.length;
        document.querySelector('#titlebar strong').textContent = labels.Title;
        document.getElementById('previous-frame').textContent = labels.Previous;
        document.getElementById('next-frame').textContent = labels.Next;
      };
      const sceneConfig =`)
      .replace('isPlaying ? "Pause" : "Play"', 'isPlaying ? projectLabels.Pause : projectLabels.Play')
      .replace('isLooping ? "Loop: On" : "Loop: Off"', 'isLooping ? projectLabels.LoopOn : projectLabels.LoopOff')
      .replace('`Frame ${frameIndex + 1} / ${timestamps.length}`', '`${projectLabels.Frame} ${frameIndex + 1} / ${timestamps.length}`');
    const base = new URL(url, location.href).href;
    // The rollout lives in its own document; apply the shared visual theme there too.
    const viewerTheme = new URL('viewer-theme.css?v=nerfies-1', location.href).href;
    html = html.replace('</head>', `<link rel="stylesheet" href="${viewerTheme}"></head>`);
    html = html.replace('<head>', `<head><base href="${base}">`)
      .replaceAll('window.location.href', 'document.baseURI');
    $('rollout-frame').srcdoc = html;
  } catch (error) {
    if (request !== rolloutRequest) return;
    $('rollout-telemetry').textContent = t('rolloutError',{message:error.message});
    console.error(error);
  }
}
['family-select', 'epoch-select', 'sample-select'].forEach(id => {$(id).onchange = updateRollout;});
updateRollout();
// These are independent recorded experiments. No physics runs in the browser.
initJoints().catch(error => reportError('joint', error));
initPads().catch(error => reportError('pad', error));
initMechanism(geometry).catch(error => {console.error(error);const el=document.querySelector('#mechanism-view .loading');if(el){el.textContent=t('mechanismError',{message:error.message});el.classList.add('error');}});
function animate(now) {
  requestAnimationFrame(animate);
  for (const pair of pairs) {
    // Intersection/load callbacks may stamp performance.now() later than this
    // rAF's timestamp. Never advance a new/reset sequence to frame -1.
    const dt = Math.max(0, Math.min((now - pair.last) / 1000, .1)); pair.last = now;
    if (!pair.ready || !pair.visible || document.hidden) continue;
    if (pair.playing) {
      pair.elapsed += dt;
      if (pair.kind === 'joint') pair.elapsed %= pair.data.duration;
      else if (pair.elapsed > pair.data.duration + .8) pair.elapsed = 0;
      const frame = Math.min(Math.floor(pair.elapsed / pair.data.dt), pair.data.cases[pair.currentCase].variants[0].poses.length - 1);
      if (frame !== pair.frame) update(pair, frame);
    }
    if (pair.playing || pair.views.some(v => v.dirty) || pair.combined?.dirty) renderPair(pair);
  }
}
requestAnimationFrame(animate);
// Read-only UI diagnostics for browser validation (no mutation API).
window.aidinPreview = () => pairs.map(p => ({kind: p.kind, ready: p.ready, currentCase: p.currentCase, frame: p.frame, playing: p.playing, visible: p.visible, displayMode: p.displayMode, combinedModels: p.combined?.models.map(m => m.length), visibleModels: p.combined?.models.map(m => m.filter(x => x.visible).length), visiblePaths: p.combined?.paths.map(x=>x.visible), modelMeshes: p.views.map(v => v.meshes.length), handParts: p.views.map(v => v.handParts ?? p.data.parts.length), overlays: p.views.map(v => v.overlays.filter(o => o.mesh.visible).length), cameras: p.views.map(v => ({position: v.camera.position.toArray(), target: v.controls.target.toArray()}))}));
