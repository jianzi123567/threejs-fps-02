// Effects: tracers, impact sparks, explosions and the planted charge. All pooled:
// nothing is allocated in a frame, meshes are reused and hidden when their life ends.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const MAX_TRACERS = 24;
const MAX_SPARKS = 160;

export function createEffects(scene) {
  const tracerMat = new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.85 });
  const tracers = [];
  for (let i = 0; i < MAX_TRACERS; i += 1) {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const line = new THREE.Line(geo, tracerMat);
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerIndex = 0;

  const sparkGeo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
  const sparkMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) });
  const sparks = [];
  for (let i = 0; i < MAX_SPARKS; i += 1) {
    const mesh = new THREE.Mesh(sparkGeo, sparkMat);
    mesh.visible = false;
    scene.add(mesh);
    sparks.push({ mesh, life: 0, vel: new THREE.Vector3() });
  }
  let sparkIndex = 0;

  const blastLight = new THREE.PointLight(new THREE.Color(0xff7a2a), 0, 18, 1.5);
  scene.add(blastLight);
  let blastLife = 0;

  // The planted charge: a blinking box with an amber lamp, shown at the site.
  const charge = new THREE.Group();
  const chargeBox = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.32, 0.34),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.5, metalness: 0.4 }),
  );
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 10, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.ember) }),
  );
  lamp.position.set(0, 0.2, 0);
  charge.add(chargeBox, lamp);
  charge.visible = false;
  scene.add(charge);
  let blink = 0;

  function tracer(from, to) {
    const t = tracers[tracerIndex];
    tracerIndex = (tracerIndex + 1) % MAX_TRACERS;
    const positions = t.line.geometry.attributes.position;
    positions.setXYZ(0, from.x, from.y, from.z);
    positions.setXYZ(1, to.x, to.y, to.z);
    positions.needsUpdate = true;
    t.line.visible = true;
    t.life = 0.09;
  }

  function impact(point, normal, count = 8) {
    for (let i = 0; i < count; i += 1) {
      const s = sparks[sparkIndex];
      sparkIndex = (sparkIndex + 1) % MAX_SPARKS;
      s.mesh.position.copy(point);
      s.vel.set(
        normal.x * 2 + (Math.random() - 0.5) * 4,
        Math.random() * 3 + 0.5,
        normal.z * 2 + (Math.random() - 0.5) * 4,
      );
      s.life = 0.25 + Math.random() * 0.25;
      s.mesh.visible = true;
    }
  }

  function explosion(point) {
    impact(point, new THREE.Vector3(0, 1, 0), 40);
    blastLight.position.copy(point).y += 1;
    blastLight.intensity = 120;
    blastLife = 0.5;
  }

  function step(dt, time) {
    for (const t of tracers) {
      if (t.life > 0) {
        t.life -= dt;
        if (t.life <= 0) t.line.visible = false;
      }
    }
    for (const s of sparks) {
      if (s.life > 0) {
        s.life -= dt;
        s.vel.y -= 12 * dt;
        s.mesh.position.addScaledVector(s.vel, dt);
        if (s.life <= 0) s.mesh.visible = false;
      }
    }
    if (blastLife > 0) {
      blastLife -= dt;
      blastLight.intensity = Math.max(0, blastLife * 240);
    }
    if (charge.visible) {
      blink += dt;
      lamp.material.color.setHex(Math.sin(blink * 9) > 0 ? 0xff2a00 : 0x551500);
    }
  }

  return {
    tracer,
    impact,
    explosion,
    step,
    showCharge(point) {
      charge.position.copy(point);
      charge.position.y = 0.18;
      charge.visible = true;
    },
    hideCharge() {
      charge.visible = false;
    },
  };
}
