import { t } from './i18n.js?v=15';
import * as THREE from 'three';
import { OrbitControls } from 'https://esm.sh/three@0.160.1/examples/jsm/controls/OrbitControls.js';

// The linkage coordinates come from the vendor equations, not these primitives.
// Rail profiles, block dimensions, enlarged placement and colors explain the motion.
export async function initMechanism(loadGeometry) {
  const $ = id => document.getElementById(id);
  const response = await fetch('data/mechanism.json?v=15', {cache:'no-store'});
  if (!response.ok) throw Error(t('mechanismHTTP',{status:response.status}));
  const data = await response.json();
  const element = $('mechanism-view');
  const renderer = new THREE.WebGLRenderer({antialias:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.25));renderer.setClearColor(0xf6f6f6);
  element.prepend(renderer.domElement);
  renderer.domElement.setAttribute('aria-label',t("AIDIN 손과 동기화한 두 슬라이더·연결봉 확대 모델"));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35,1,.001,5);camera.up.set(0,0,1);
  const controls = new OrbitControls(camera,renderer.domElement);controls.minDistance=.25;controls.maxDistance=1.5;
  scene.add(new THREE.HemisphereLight(0xffffff,0x737373,2.1));
  const light=new THREE.DirectionalLight(0xffffff,2.4);light.position.set(.2,-.6,1);scene.add(light);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshStandardMaterial({color:0xeeeeee,roughness:1}));
  floor.position.set(.12,.34,-.001);scene.add(floor);
  const grid=new THREE.GridHelper(1,30,0xcccccc,0xdddddd);grid.rotation.x=Math.PI/2;grid.position.set(.12,.34,0);scene.add(grid);
  let dirty=true,playing=true,visible=false,last=performance.now(),elapsed=0,frame=0;
  let finger='index',scenario='low',current;
  function fit(){controls.target.set(.12,.34,.19);camera.position.set(.23,-.43,.44);controls.update();dirty=true;}
  fit(); controls.addEventListener('change',()=>{dirty=true;});
  new ResizeObserver(()=>{const {width,height}=element.getBoundingClientRect();renderer.setSize(width,height,false);camera.aspect=width/Math.max(1,height);camera.updateProjectionMatrix();dirty=true;}).observe(element);
  new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;dirty=true;last=performance.now();},{rootMargin:'100px'}).observe(element);
  const geometries=await Promise.all(data.parts.map(p=>loadGeometry(p.mesh)));
  const hand=geometries.map((g)=>{const m=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:0xaeb9ad,roughness:.75,metalness:.1}));scene.add(m);return m;});
  const mechanism=new THREE.Group();
  const enlargement=1, mountedPivot=new THREE.Vector3(.25,.34,.17);
  mechanism.scale.setScalar(enlargement);scene.add(mechanism);
  const registration=new THREE.Quaternion(), inverseRegistration=new THREE.Quaternion();
  const originalPivot=new THREE.Vector3();
  const mountedFinger=Array.from({length:4},()=>{
    const mesh=new THREE.Mesh(undefined,new THREE.MeshStandardMaterial({color:0x70af7b,roughness:.7,metalness:.12,transparent:true,opacity:.86,depthWrite:false}));
    mechanism.add(mesh);return mesh;
  });
  const colors=[0x367aa1,0x8b67ac];
  function box(size,color,opacity=1){const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),new THREE.MeshStandardMaterial({color,roughness:.65,transparent:opacity<1,opacity,depthWrite:opacity===1}));mechanism.add(mesh);return mesh;}
  function ball(radius,color){const m=new THREE.Mesh(new THREE.SphereGeometry(radius,16,12),new THREE.MeshStandardMaterial({color,roughness:.55}));mechanism.add(m);return m;}
  function rod(radius,color,ghost=false){const m=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,1,12),new THREE.MeshStandardMaterial({color,roughness:.6,transparent:ghost,opacity:ghost ? .32 : 1,depthWrite:!ghost}));mechanism.add(m);return m;}
  const vy=new THREE.Vector3(0,1,0),a=new THREE.Vector3(),b=new THREE.Vector3();
  function span(mesh,from,to){a.fromArray(from);b.fromArray(to);mesh.position.copy(a).add(b).multiplyScalar(.5);b.sub(a);mesh.scale.y=b.length();mesh.quaternion.setFromUnitVectors(vy,b.normalize());}
  const rails=colors.map(c=>box([.003,.004,.06],0x9ca9a5));
  const blocks=colors.map(c=>box([.007,.008,.006],c));
  const ghosts=colors.map(()=>box([.0073,.0083,.0063],0xd34848,.22));
  ghosts.forEach(g=>{g.material.wireframe=true;});
  const stops=colors.map(()=>[box([.009,.010,.0018],0xc5a07e),box([.009,.010,.0018],0xc5a07e)]);
  const links=colors.map(c=>rod(.0013,c));
  const cranks=colors.map(()=>rod(.0016,0x4d9560));
  const ghostLinks=colors.map(()=>rod(.0007,0xd34848,true));
  const pins=colors.map(c=>ball(.0021,c)), pivot=ball(.0028,0x45544b),cross=rod(.0016,0x4d9560);
  const mount=box([.031,.028,.004],0x67796c);mount.position.set(0,.006,0);
  const pivotSupport=box([.003,.003,.06],0x87958a);
  const pointer=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]),new THREE.LineDashedMaterial({color:0x8d9e85,dashSize:.007,gapSize:.005,transparent:true,opacity:.65}));scene.add(pointer);
  const mm=x=>Number(x).toFixed(1),deg=x=>(x*180/Math.PI).toFixed(1);
  const explanation=()=>({
    valid:t("현재 명령은 모델의 이동 범위 안에 있습니다."),
    stroke:t("요청 이동량이 모델의 슬라이더 이동 범위를 벗어나 끝값으로 제한됩니다."),
    envelope:t("두 슬라이더의 위치 차이가 허용 범위를 넘습니다. roll을 줄여 두 구동부가 함께 도달할 수 있는 자세로 제한합니다."),
    domain:t("이 명령은 기구학 계산의 유효 영역을 벗어납니다. 유효한 관절 자세로 먼저 제한합니다.")
  });
  function pose(mesh,p){mesh.position.set(...p.slice(0,3));mesh.quaternion.set(p[4],p[5],p[6],p[3]).normalize();}
  function update(n){
    frame=Math.max(0,Math.min(n,current.frames.length-1));const f=current.frames[frame],g=f.mechanism;
    hand.forEach((m,i)=>pose(m,f.hand_poses[i]));
    mountedFinger.forEach((mesh,k)=>{
      const recorded=f.hand_poses[current.mount.part_indices[k]];
      mesh.position.set(...recorded.slice(0,3)).sub(originalPivot).applyQuaternion(inverseRegistration).add(new THREE.Vector3(...g.pivot));
      mesh.quaternion.set(recorded[4],recorded[5],recorded[6],recorded[3]).premultiply(inverseRegistration).normalize();
    });
    pivot.position.set(...g.pivot);
    pivotSupport.position.set(0,0,g.pivot[2]/2);pivotSupport.scale.z=g.pivot[2]/.06;
    rails.forEach((rail,i)=>{
      const [lo,hi]=f.stops[i].map(x=>x/1000);const xy=current.geometry.rail_xy[i];
      rail.position.set(xy[0],xy[1],(hi+.004)/2);rail.scale.z=(hi+.004)/.06;
      stops[i].forEach((m,j)=>m.position.set(xy[0],xy[1],j?hi:lo));
      blocks[i].position.set(...g.sliders[i]);pins[i].position.set(...g.crank_ends[i]);
      span(links[i],g.sliders[i],g.crank_ends[i]);span(cranks[i],g.pivot,g.crank_ends[i]);
      const raw=g.requested_sliders?.[i];ghosts[i].visible=!!raw&&f.limited;ghostLinks[i].visible=!!raw&&f.limited;
      if(raw){ghosts[i].position.set(...raw);span(ghostLinks[i],raw,g.requested_crank_ends[i]);}
      const bounds=f.stops[i],position=100*(f.d[i]-bounds[0])/(bounds[1]-bounds[0]);
      $(`mechanism-slider-${i}`).style.left=`${Math.max(0,Math.min(100,position))}%`;
      $(`mechanism-distance-${i}`).textContent=`${mm(f.d[i])} mm`;
      $(`mechanism-range-${i}`).textContent=`${mm(bounds[0])} – ${mm(bounds[1])} mm`;
      $(`mechanism-request-${i}`).textContent=t('requestDistance',{value:Number.isFinite(f.raw_d[i])?mm(f.raw_d[i]):t('계산 불가')});
    });
    span(cross,g.crank_ends[0],g.crank_ends[1]);
    const handIndex=data.parts.findIndex(p=>p.body===`left_link2_${finger}`);
    const start=new THREE.Vector3(...f.hand_poses[handIndex].slice(0,3));
    const end=mountedPivot.clone();
    pointer.geometry.setFromPoints([start,end]);pointer.computeLineDistances();
    $('mechanism-angles').textContent=t('mechanismAngles',{rr:deg(f.requested_q[0]),rp:deg(f.requested_q[1]),ar:deg(f.reached_q[0]),ap:deg(f.reached_q[1])});
    $('mechanism-status').classList.toggle('limited',f.limited);
    $('mechanism-status').textContent=f.limited?t("LIMIT · 도달 자세로 제한"):t("이동 범위 안");
    const reason=f.reason.toLowerCase();
    const reasons=[];
    if(reason.includes('stroke'))reasons.push(explanation().stroke);
    if(reason.includes('tent')||reason.includes('envelope'))reasons.push(explanation().envelope);
    if(reason.includes('domain'))reasons.push(explanation().domain);
    $('mechanism-explanation').textContent=reasons.join(' ')||explanation().valid;
    $('mechanism-delta').textContent=t('mechanismDelta',{delta:mm(f.d[0]-f.d[1]),lo:mm(f.delta_bounds[0]),hi:mm(f.delta_bounds[1])});
    $('mechanism-time').value=frame;$('mechanism-clock').textContent=`${(frame*data.dt).toFixed(2)} / ${data.duration.toFixed(2)} s`;
    dirty=true;
  }
  function select(){current=data.cases.find(c=>c.finger===finger&&c.scenario===scenario);elapsed=0;last=performance.now();
    const mount=current.mount;
    registration.set(mount.vendor_to_world_quat[1],mount.vendor_to_world_quat[2],mount.vendor_to_world_quat[3],mount.vendor_to_world_quat[0]);
    inverseRegistration.copy(registration).invert();originalPivot.set(...mount.hand_pivot_world);
    mechanism.quaternion.copy(registration);
    mechanism.position.copy(mountedPivot).sub(new THREE.Vector3(...current.geometry.pivot).applyQuaternion(registration).multiplyScalar(enlargement));
    mountedFinger.forEach((mesh,k)=>{mesh.geometry=geometries[mount.part_indices[k]];});
    hand.forEach((m,i)=>m.material.color.setHex(data.parts[i].body.endsWith('_'+finger)?0x61a66e:data.parts[i].body==='left_hand_base_link'?0x6f7970:0xbfc7bb));
    $('mechanism-pitch').textContent=t('mechanismSweep',{pitch:current.pitch_deg});update(0);
  }
  $('mechanism-finger').onchange=e=>{finger=e.target.value;select();};
  document.querySelectorAll('[data-mechanism-case]').forEach(button=>button.onclick=()=>{
    scenario=button.dataset.mechanismCase;document.querySelectorAll('[data-mechanism-case]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));select();
  });
  $('mechanism-play').onclick=()=>{playing=!playing;last=performance.now();$('mechanism-play').textContent=playing?t("일시정지 Ⅱ"):t("재생 ▶");};
  $('mechanism-time').max=data.cases[0].frames.length-1;
  $('mechanism-time').oninput=e=>{playing=false;elapsed=Number(e.target.value)*data.dt;$('mechanism-play').textContent=t("재생 ▶");update(Number(e.target.value));};
  $('mechanism-fit').onclick=fit;
  select();$('mechanism-play').disabled=false;$('mechanism-play').textContent=playing?t("일시정지 Ⅱ"):t("재생 ▶");element.querySelector('.loading').remove();
  $('mechanism-play').removeAttribute('data-i18n');
  window.addEventListener('languagechange',()=>{update(frame);$('mechanism-pitch').textContent=t('mechanismSweep',{pitch:current.pitch_deg});$('mechanism-play').textContent=playing?t('일시정지 Ⅱ'):t('재생 ▶');renderer.domElement.setAttribute('aria-label',t('AIDIN 손과 동기화한 두 슬라이더·연결봉 확대 모델'));});
  function animate(now){requestAnimationFrame(animate);const dt=Math.max(0,Math.min((now-last)/1000,.1));last=now;if(!visible||document.hidden)return;
    if(playing){elapsed=(elapsed+dt)%data.duration;const n=Math.floor(elapsed/data.dt);if(n!==frame)update(n);}
    if(dirty){renderer.render(scene,camera);dirty=false;}
  }requestAnimationFrame(animate);
  window.aidinMechanism=()=>{
    mechanism.updateMatrixWorld(true);
    const orientationErrors=mountedFinger.map((m,k)=>m.getWorldQuaternion(new THREE.Quaternion()).angleTo(hand[current.mount.part_indices[k]].quaternion));
    const positionErrors=mountedFinger.map((m,k)=>{
      const expected=hand[current.mount.part_indices[k]].position.clone().sub(originalPivot).multiplyScalar(enlargement).add(mountedPivot);
      return m.getWorldPosition(new THREE.Vector3()).distanceTo(expected);
    });
    return {mountedFingerParts:mountedFinger.length,mountOrientationErrors:orientationErrors,mountPositionErrors:positionErrors,ready:true,finger,scenario,frame,playing,visible,handParts:hand.length,rodLengths:links.map(l=>l.scale.y),reason:current.frames[frame].reason,limited:current.frames[frame].limited};};
}
