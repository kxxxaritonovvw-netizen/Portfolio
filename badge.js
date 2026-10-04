import * as THREE from './vendor/three.module.js';

const host = document.querySelector('.badge-scene');
const handle = document.querySelector('.badge-handle');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const leanDevice = (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2) ||
  (navigator.deviceMemory && navigator.deviceMemory <= 4);
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: !leanDevice, powerPreference: 'low-power' });
} catch {
  host.remove();
  document.dispatchEvent(new Event('portfolio:badge-unavailable'));
}
if (renderer) initBadge().catch(error => {
  console.error('Badge textures could not be loaded', error);
  renderer.dispose(); host.remove();
  document.dispatchEvent(new Event('portfolio:badge-unavailable'));
});

async function initBadge() {
  // Exact Figma artwork; load once before rendering, then reuse the GPU textures.
  const loader = new THREE.TextureLoader();
  const [face, backTexture] = await Promise.all([
    loader.loadAsync('./assets/badge-front.png'),
    loader.loadAsync('./assets/badge-back.png'),
  ]);
  for (const artwork of [face, backTexture]) {
    artwork.colorSpace = THREE.SRGBColorSpace;
    artwork.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  }
  let qualityScale = 1;
  function setResolution(still = false) {
    // Retina detail while settled; cap moving pixels and adapt only when needed.
    const budget = leanDevice ? 1800000 : still ? 8500000 : 5000000;
    const ratio = Math.min(devicePixelRatio, leanDevice ? 1.25 : still ? 3 : 2,
      Math.sqrt(budget / (innerWidth * innerHeight))) * (still ? 1 : qualityScale);
    renderer.setPixelRatio(ratio);
    host.dataset.pixelRatio = ratio.toFixed(2);
  }
  setResolution();
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  host.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, .1, 100);
  camera.position.set(0, 0, 18);

  // A studio environment supplies real reflections on the bevels and chrome.
  const studio = new THREE.Scene();
  studio.background = new THREE.Color('#30333b');
  function softbox(x, y, z, w, h, color, intensity) {
    const light = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
    light.position.set(x, y, z);
    light.lookAt(0, 0, 0);
    studio.add(light);
  }
  softbox(-5, 3, 5, 3, 9, '#ffffff', 4);
  softbox(6, 1, 3, 1.5, 10, '#d9c7fa', 3);
  softbox(0, 7, -3, 8, 2, '#ffffff', 5);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(studio, .025);
  scene.environment = environment.texture;
  pmrem.dispose();
  studio.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
  scene.add(new THREE.HemisphereLight(0xf2e7ff, 0x242634, 2));
  const key = new THREE.DirectionalLight(0xfff5ee, 4);
  key.position.set(-4, 7, 8);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xc6b1ff, 3);
  rim.position.set(6, 2, -1);
  scene.add(rim);

  function texture(width, height, paint) {
    const c = document.createElement('canvas');
    c.width = width; c.height = height;
    paint(c.getContext('2d'), width, height);
    const result = new THREE.CanvasTexture(c);
    result.colorSpace = THREE.SRGBColorSpace;
    result.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    return result;
  }
  const weave = texture(256, 256, ctx => {
    ctx.fillStyle = '#111216'; ctx.fillRect(0, 0, 256, 256);
    // Diagonal twill: alternating raised warp and recessed weft threads.
    for (let y = -8; y < 264; y += 8) for (let x = 0; x < 256; x += 8) {
      const raised = ((x / 8 + y / 8) % 4 + 4) % 4 < 2;
      const highlight = ctx.createLinearGradient(x, y, x + 7, y + 7);
      highlight.addColorStop(0, '#111216');
      highlight.addColorStop(.4, raised ? '#77797d' : '#34363b');
      highlight.addColorStop(.65, raised ? '#45474b' : '#23252a');
      highlight.addColorStop(1, '#0d0e11');
      ctx.fillStyle = highlight;
      ctx.fillRect(x + 1, y + 1, raised ? 5 : 7, raised ? 7 : 4);
    }
    for (const x of [9, 245]) {
      ctx.fillStyle = '#17181c'; ctx.fillRect(x - 4, 0, 8, 256);
      ctx.strokeStyle = '#66676d'; ctx.lineWidth = 2;
      ctx.setLineDash([7, 5]); ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 256); ctx.stroke();
    }
  });
  weave.wrapS = weave.wrapT = THREE.RepeatWrapping;
  weave.repeat.set(1, 6);
  const weaveBump = weave.clone(); weaveBump.colorSpace = THREE.NoColorSpace;
  const fabric = new THREE.MeshStandardMaterial({
    color: 0x99999f, map: weave, bumpMap: weaveBump, bumpScale: .028,
    roughness: .96, metalness: 0, side: THREE.DoubleSide,
  });

  function roundedShape(w, h, r, centerY) {
    const s = new THREE.Shape(), x = -w / 2, y = centerY - h / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    return s;
  }
  const badge = new THREE.Group();
  scene.add(badge);
  const cardShape = roundedShape(2.55, 3.85, .19, -2.42);
  const hole = new THREE.Path(); hole.absellipse(0, -.78, .105, .14, 0, Math.PI * 2, true);
  cardShape.holes.push(hole);
  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(cardShape, {
    depth: .055, bevelEnabled: true, bevelThickness: .026, bevelSize: .025, bevelSegments: 3, steps: 1, curveSegments: 12,
  }), new THREE.MeshPhysicalMaterial({ color: 0x272831, metalness: .65, roughness: .3, clearcoat: .6 }));
  badge.add(body);
  const faceGeometry = new THREE.ShapeGeometry(cardShape, 12);
  const position = faceGeometry.attributes.position;
  const uv = faceGeometry.attributes.uv;
  for (let i = 0; i < position.count; i++) uv.setXY(i, (position.getX(i) + 1.275) / 2.55, (position.getY(i) + 4.345) / 3.85);
  const faceMesh = new THREE.Mesh(faceGeometry, new THREE.MeshPhysicalMaterial({
    map: face, roughness: .42, metalness: .24, clearcoat: .8, clearcoatRoughness: .23,
  }));
  faceMesh.position.z = .083;
  badge.add(faceMesh);
  const back = new THREE.Mesh(faceGeometry, new THREE.MeshPhysicalMaterial({ color: 0x292632, metalness: .5, roughness: .35, side: THREE.BackSide }));
  back.position.z = -.027; badge.add(back);
  // Mirror the UVs because this face is viewed from behind.
  const backGeometry = faceGeometry.clone();
  for (let i = 0; i < backGeometry.attributes.uv.count; i++) {
    backGeometry.attributes.uv.setX(i, 1 - backGeometry.attributes.uv.getX(i));
  }
  back.geometry = backGeometry;
  back.material.map = backTexture; back.material.color.set(0xffffff);
  const chrome = new THREE.MeshStandardMaterial({ color: 0xaeb2b8, metalness: 1, roughness: .23 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x383a40, metalness: .9, roughness: .32 });
  // A flat, beveled rectangular buckle rather than a chain of circular rings.
  const buckleShape = roundedShape(.56, .24, .065, -.015);
  buckleShape.holes.push(new THREE.Path(roundedShape(.45, .135, .032, -.015).getPoints(8)));
  const buckle = new THREE.Mesh(new THREE.ExtrudeGeometry(buckleShape, {
    depth: .036, bevelEnabled: true, bevelThickness: .009, bevelSize: .009, bevelSegments: 2, curveSegments: 8,
  }), chrome);
  buckle.position.z = .01; badge.add(buckle);
  // The fabric folds over the buckle's crossbar, hiding its upper edge.
  const foldTexture = weave.clone(); foldTexture.repeat.set(1, .62);
  const foldMaterial = fabric.clone(); foldMaterial.map = foldTexture;
  const foldBump = foldTexture.clone(); foldBump.colorSpace = THREE.NoColorSpace;
  foldMaterial.bumpMap = foldBump;
  const foldedTab = new THREE.Mesh(new THREE.BoxGeometry(.365, .24, .052), foldMaterial);
  foldedTab.position.set(0, .105, .047); badge.add(foldedTab);
  const foldRound = new THREE.Mesh(new THREE.CylinderGeometry(.028, .028, .365, 12), foldMaterial);
  foldRound.rotation.z = Math.PI / 2; foldRound.position.set(0, -.014, .047); badge.add(foldRound);

  const swivel = new THREE.Mesh(new THREE.CylinderGeometry(.056, .056, .13, 16), chrome);
  swivel.position.set(0, -.19, .045); badge.add(swivel);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(.071, .071, .04, 16), darkMetal);
  collar.position.set(0, -.245, .045); badge.add(collar);
  // The hook curves through the eyelet in depth, not merely over its surface.
  const hookCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-.045, -.26, .045), new THREE.Vector3(-.072, -.34, .07),
    new THREE.Vector3(-.062, -.58, .14), new THREE.Vector3(-.045, -.79, .14),
    new THREE.Vector3(.015, -.83, .015), new THREE.Vector3(.055, -.76, -.085),
    new THREE.Vector3(.07, -.46, -.075), new THREE.Vector3(.045, -.28, .025),
  ]);
  const hook = new THREE.Mesh(new THREE.TubeGeometry(hookCurve, 28, .03, 8, false), chrome);
  badge.add(hook);
  const gate = new THREE.Mesh(new THREE.CapsuleGeometry(.016, .27, 3, 8), chrome);
  gate.position.set(.056, -.49, .1); gate.rotation.z = -.075; badge.add(gate);
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(.022, .022, .055, 12), darkMetal);
  pin.rotation.x = Math.PI / 2; pin.position.set(.052, -.34, .095); badge.add(pin);
  const eyelet = new THREE.Mesh(new THREE.TorusGeometry(.111, .015, 8, 24), darkMetal);
  eyelet.scale.y = 1.3; eyelet.position.set(0, -.78, .092); badge.add(eyelet);
  const rearEyelet = eyelet.clone(); rearEyelet.position.z = -.037; badge.add(rearEyelet);
  // Keep the card attached to the hardware; the full assembly turns together.
  const cardPivot = new THREE.Group(); cardPivot.position.y = -.78; badge.add(cardPivot);
  for (const mesh of [body, faceMesh, back, eyelet, rearEyelet]) {
    cardPivot.add(mesh); mesh.position.y += .78;
  }

  const segments = leanDevice ? 24 : 40;
  const ribbonGeometry = new THREE.PlaneGeometry(.36, 1, 1, segments);
  const ribbon = new THREE.Mesh(ribbonGeometry, fabric);
  ribbon.frustumCulled = false;
  scene.add(ribbon);
  const anchor = new THREE.Vector3();
  const end = new THREE.Vector3();
  const velocity = new THREE.Vector3();
  const target = new THREE.Vector3();
  const grabOffset = new THREE.Vector3();
  const particles = Array.from({ length: 15 }, () => ({ p: new THREE.Vector3(), old: new THREE.Vector3() }));
  const worldHeight = 2 * 18 * Math.tan(THREE.MathUtils.degToRad(16));
  let worldWidth = 1, ropeLength = 3, scale = 1, active = false, pointerId = null;
  let exiting = false, returning = false, gone = false, exitTime = 0, anchorStartY = 0;
  let flipped = false, pressX = 0, pressY = 0, dragged = false;
  const restingYaw = () => (flipped ? Math.PI : 0) - .18;
  function flip() {
    flipped = !flipped;
    handle.setAttribute('aria-pressed', String(flipped));
    if (reducedMotion.matches) badge.rotation.y = restingYaw();
    wake();
  }
  const curve = new THREE.CatmullRomCurve3(particles.map(p => p.p));
  const previous = new THREE.Vector3(), delta = new THREE.Vector3();
  const point = new THREE.Vector3(), tangent = new THREE.Vector3(), side = new THREE.Vector3();
  const projected = new THREE.Vector3();
  const corners = [[-1.3, -.5], [1.3, -.5], [-1.3, -4.4], [1.3, -4.4]];
  let frameId = null, last = 0, accumulator = 0, settledFor = 0;
  let samples = 0, sampleTime = 0, warmFrames = 0, frames = 0;
  function wake() {
    if (gone) return;
    settledFor = 0;
    if (frameId !== null || document.hidden) return;
    setResolution();
    last = performance.now(); accumulator = 0; warmFrames = 0;
    host.dataset.state = 'running';
    frameId = requestAnimationFrame(render);
  }

  function resize() {
    if (gone) return;
    const w = innerWidth, h = innerHeight;
    setResolution();
    renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
    worldWidth = worldHeight * w / h;
    scale = Math.min(1, worldWidth / 6.5);
    anchor.set(0, worldHeight / 2 + .35, 0);
    if (exiting) { anchorStartY = anchor.y; exitTime = 0; }
    // Center the card itself, accounting for the spring's static extension.
    ropeLength = anchor.y - 2.42 * scale - 12 / 95;
    end.set(0, 2.42 * scale, 0);
    velocity.set(0, 0, 0); badge.scale.setScalar(scale);
    particles.forEach((p, i) => { p.p.lerpVectors(anchor, end, i / 14); p.old.copy(p.p); });
    wake();
  }
  resize();
  window.addEventListener('resize', resize);

  function worldPoint(event) {
    return new THREE.Vector3((event.clientX / innerWidth - .5) * worldWidth,
      (.5 - event.clientY / innerHeight) * worldHeight, 0);
  }
  handle.addEventListener('pointerdown', event => {
    if (exiting || returning || event.button !== 0 || pointerId !== null) return;
    event.preventDefault();
    active = true; pointerId = event.pointerId;
    pressX = event.clientX; pressY = event.clientY; dragged = false;
    handle.setPointerCapture(pointerId);
    grabOffset.copy(end).sub(worldPoint(event));
    target.copy(end); host.classList.add('is-dragging');
    wake();
  });
  handle.addEventListener('pointermove', event => {
    if (event.pointerId !== pointerId) return;
    if (Math.hypot(event.clientX - pressX, event.clientY - pressY) > 6) dragged = true;
    if (!dragged) return;
    target.copy(worldPoint(event)).add(grabOffset);
    target.x = THREE.MathUtils.clamp(target.x, -worldWidth / 2 + 1.4 * scale, worldWidth / 2 - 1.4 * scale);
    target.y = THREE.MathUtils.clamp(target.y, -worldHeight / 2 + 4.5 * scale, anchor.y - .5);
    const reach = target.clone().sub(anchor);
    if (reach.length() > ropeLength * 1.65) target.copy(anchor).add(reach.setLength(ropeLength * 1.65));
  });
  function release(event) {
    if (event && event.pointerId !== pointerId) return;
    active = false; pointerId = null; host.classList.remove('is-dragging');
    wake();
  }
  handle.addEventListener('pointerup', event => {
    if (event.pointerId !== pointerId) return;
    if (!dragged && Math.hypot(event.clientX - pressX, event.clientY - pressY) <= 6) flip();
    release(event);
  });
  handle.addEventListener('click', event => { if (event.detail === 0) flip(); });
  handle.addEventListener('pointercancel', release);
  handle.addEventListener('lostpointercapture', release);
  window.addEventListener('blur', () => release());
  handle.addEventListener('keydown', event => {
    const impulses = { ArrowLeft: [-2, 0], ArrowRight: [2, 0], ArrowUp: [0, 2], ArrowDown: [0, -2] };
    if (impulses[event.key]) { event.preventDefault(); velocity.x += impulses[event.key][0]; velocity.y += impulses[event.key][1]; wake(); }
  });

  function physics(dt) {
    if (returning) {
      exitTime += dt;
      const t = Math.min(exitTime / .85, 1);
      const nextY = worldHeight / 2 + .35 + 13 * (1 - t * t * (3 - 2 * t));
      const shiftY = nextY - anchor.y;
      // Lower the whole suspension. Moving only its anchor lets it overtake
      // the card and folds the rope; shifting both Verlet states adds no energy.
      end.y += shiftY;
      for (const particle of particles) {
        particle.p.y += shiftY;
        particle.old.y += shiftY;
      }
      anchor.y = nextY;
    }
    if (exiting) {
      exitTime += dt;
      const t = Math.min(exitTime / .48, 1);
      // Accelerate the fixed end; tension in the spring pulls the rigid badge after it.
      anchor.y = anchorStartY + 13 * t * t * (3 - 2 * t);
    }
    if (active) {
      previous.copy(end);
      end.lerp(target, 1 - Math.exp(-25 * dt));
      velocity.copy(end).sub(previous).divideScalar(dt).clampLength(0, 9);
    } else {
      delta.copy(end).sub(anchor);
      const length = delta.length();
      velocity.y -= 12 * dt;
      if (length > ropeLength) velocity.addScaledVector(delta.normalize(), -(length - ropeLength) * (exiting ? 160 : 95) * dt);
      velocity.x += (anchor.x - end.x) * .6 * dt;
      velocity.multiplyScalar(Math.exp(-(exiting || returning ? 5 : 1.55) * dt));
      end.addScaledVector(velocity, dt);
    }
    const linkLength = Math.max(ropeLength, anchor.distanceTo(end)) / 14;
    for (let i = 1; i < 14; i++) {
      const p = particles[i]; previous.copy(p.p);
      p.p.add(delta.copy(p.p).sub(p.old).multiplyScalar(.97));
      p.p.y -= 9 * dt * dt; p.old.copy(previous);
    }
    for (let pass = 0; pass < 8; pass++) {
      particles[0].p.copy(anchor); particles[14].p.copy(end);
      for (let i = 0; i < 14; i++) {
        const a = particles[i].p, b = particles[i + 1].p;
        const d = delta.copy(b).sub(a), length = d.length();
        if (!length) continue;
        d.multiplyScalar((length - linkLength) / length);
        if (i === 0) b.sub(d);
        else if (i === 13) a.add(d);
        else { a.addScaledVector(d, .5); b.addScaledVector(d, -.5); }
      }
    }
    particles[0].p.copy(anchor); particles[14].p.copy(end);
  }
  function render(now) {
    // No more than 60 renders/sec even on 120/144 Hz displays.
    const elapsed = (now - last) / 1000;
    if (elapsed < 1 / 60 - .001) { frameId = requestAnimationFrame(render); return; }
    const dt = Math.min(elapsed, 1 / 20); last = now;
    accumulator += dt;
    while (accumulator >= 1 / 120) { physics(1 / 120); accumulator -= 1 / 120; }
    {
      badge.position.copy(end);
      const angle = THREE.MathUtils.clamp((end.x - anchor.x) * .15 + velocity.x * .045, -.42, .42);
      const follow = 1 - Math.exp(-7 * dt);
      badge.rotation.z += (-angle - badge.rotation.z) * follow;
      badge.rotation.y += (THREE.MathUtils.clamp(velocity.x * .13 + (end.x - anchor.x) * .10, -.65, .65) + restingYaw() - badge.rotation.y) * follow;
      badge.rotation.x += (THREE.MathUtils.clamp(velocity.y * .06, -.3, .3) + .045 - badge.rotation.x) * follow;
      const attr = ribbonGeometry.attributes.position;
      for (let i = 0; i <= segments; i++) {
        const u = i / segments;
        curve.getPoint(u, point); curve.getTangent(u, tangent);
        side.set(-tangent.y, tangent.x, 0).normalize().multiplyScalar(.18 * scale);
        // The top stays fixed; torsion builds smoothly towards the turning buckle.
        side.applyAxisAngle(tangent, -badge.rotation.y * u * u);
        const twist = Math.sin(u * Math.PI) * (end.x - anchor.x) * .04;
        for (let j = 0; j < 2; j++) {
          const sign = j ? 1 : -1;
          attr.setXYZ(i * 2 + j, point.x + side.x * sign, point.y + side.y * sign, point.z + (side.z + twist) * sign);
        }
      }
      attr.needsUpdate = true; ribbonGeometry.computeVertexNormals();
      badge.updateMatrixWorld();
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const [x, y] of corners) {
        projected.set(x, y + .78, .1).applyMatrix4(cardPivot.matrixWorld).project(camera);
        const px = (projected.x + 1) * innerWidth / 2, py = (1 - projected.y) * innerHeight / 2;
        minX = Math.min(minX, px); maxX = Math.max(maxX, px);
        minY = Math.min(minY, py); maxY = Math.max(maxY, py);
      }
      handle.style.transform = `translate3d(${minX}px, ${minY}px, 0)`;
      handle.style.width = `${maxX - minX}px`; handle.style.height = `${maxY - minY}px`;
      renderer.render(scene, camera);
      host.dataset.frames = String(++frames);
    }
    if (exiting && end.y - 4.6 * scale > worldHeight / 2 + .8) { finishExit(); return; }
    if (returning && exitTime > .85 && Math.abs(end.y - 2.42 * scale) < .2 && velocity.lengthSq() < 1) {
      returning = false; handle.disabled = false;
      host.classList.remove('is-leaving');
      document.dispatchEvent(new Event('portfolio:badge-returned'));
    }
    // Lower resolution only after sustained slow frames, never from one startup spike.
    if (++warmFrames > 30 && elapsed < .1) {
      samples++; sampleTime += elapsed;
      if (samples >= 60) {
        if (sampleTime / samples > .024 && qualityScale > .6) {
          qualityScale = Math.max(.6, qualityScale - .2); setResolution();
        }
        samples = 0; sampleTime = 0;
      }
    }
    const ropeStill = particles.every((p, i) => i === 0 || i === 14 || p.p.distanceToSquared(p.old) < .000002);
    const rotationStill = Math.abs(badge.rotation.z) < .008 && Math.abs(badge.rotation.y - restingYaw()) < .003;
    if (!exiting && !returning && !active && velocity.lengthSq() < .0004 && ropeStill && rotationStill) settledFor += dt;
    else settledFor = 0;
    if (settledFor > .6) {
      velocity.set(0, 0, 0); particles.forEach(p => p.old.copy(p.p));
      setResolution(true);
      renderer.render(scene, camera);
      host.dataset.frames = String(++frames);
      frameId = null; host.dataset.state = 'sleeping'; return;
    }
    frameId = requestAnimationFrame(render);
  }
  document.addEventListener('visibilitychange', () => {
    cancelAnimationFrame(frameId);
    frameId = null;
    if (!document.hidden) wake();
    else { release(); host.dataset.state = 'hidden'; }
  });
  function finishExit() {
    gone = true; cancelAnimationFrame(frameId); frameId = null;
    host.hidden = true; host.dataset.state = 'finished';
    // Keep the small scene cached for instant return, but schedule no frames.
    document.dispatchEvent(new Event('portfolio:badge-gone'));
  }
  function beginExit() {
    if (exiting || gone) return;
    exiting = true; returning = false; exitTime = 0; active = false;
    if (pointerId !== null && handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
    pointerId = null; handle.disabled = true;
    host.classList.remove('is-dragging'); host.classList.add('is-leaving');
    anchorStartY = anchor.y;
    if (reducedMotion.matches) finishExit();
    else wake();
  }
  document.addEventListener('portfolio:leave-badge', beginExit);
  document.addEventListener('portfolio:return-badge', () => {
    if (!gone) return;
    gone = false; exiting = false; returning = true; exitTime = 0;
    resize();
    anchor.y += 13; end.y += 13;
    velocity.y = -1.5;
    particles.forEach((p, i) => { p.p.lerpVectors(anchor, end, i / 14); p.old.copy(p.p); });
    host.hidden = false;
    if (reducedMotion.matches) {
      returning = false; resize(); handle.disabled = false;
      host.classList.remove('is-leaving');
      document.dispatchEvent(new Event('portfolio:badge-returned'));
    }
    wake();
  });
  if (document.body.dataset.phase === 'leaving') beginExit();
}
