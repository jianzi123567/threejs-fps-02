// Procedural textures, painted on canvas at boot: no image assets, no network.
// Every texture is a CanvasTexture the world reuses, so the map stays one draw call
// per material and the dossier lists no asset files at all.
import * as THREE from 'three';

function canvas(size, draw) {
  const element = document.createElement('canvas');
  element.width = size;
  element.height = size;
  draw(element.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(element);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function speckle(ctx, size, count, colors, alpha) {
  for (let i = 0; i < count; i += 1) {
    ctx.fillStyle = colors[(Math.random() * colors.length) | 0];
    ctx.globalAlpha = alpha * (0.4 + Math.random() * 0.6);
    const s = 1 + Math.random() * 3;
    ctx.fillRect(Math.random() * size, Math.random() * size, s, s);
  }
  ctx.globalAlpha = 1;
}

export function makeTextures() {
  const concrete = canvas(256, (ctx, s) => {
    ctx.fillStyle = '#3a3f45';
    ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, 2600, ['#2e3338', '#484e55', '#565c64'], 0.5);
    ctx.strokeStyle = 'rgba(20,22,25,0.55)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 4; i += 1) {
      ctx.beginPath();
      ctx.moveTo((i * s) / 4, 0);
      ctx.lineTo((i * s) / 4, s);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, (i * s) / 4);
      ctx.lineTo(s, (i * s) / 4);
      ctx.stroke();
    }
    // oil stains
    for (let i = 0; i < 7; i += 1) {
      const x = Math.random() * s;
      const y = Math.random() * s;
      const r = 12 + Math.random() * 30;
      const g = ctx.createRadialGradient(x, y, 2, x, y, r);
      g.addColorStop(0, 'rgba(18,18,20,0.5)');
      g.addColorStop(1, 'rgba(18,18,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  concrete.repeat.set(10, 8);

  const metal = canvas(256, (ctx, s) => {
    ctx.fillStyle = '#4a545e';
    ctx.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 16) {
      ctx.fillStyle = x % 32 === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.16)';
      ctx.fillRect(x, 0, 8, s);
    }
    speckle(ctx, s, 900, ['#39414a', '#5b6670'], 0.4);
    ctx.fillStyle = 'rgba(120,70,30,0.35)';
    for (let i = 0; i < 12; i += 1) {
      const y = Math.random() * s;
      ctx.fillRect(0, y, s, 2 + Math.random() * 5);
    }
  });
  metal.repeat.set(2, 1);

  const hazard = canvas(128, (ctx, s) => {
    ctx.fillStyle = '#f5a623';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#17191d';
    for (let i = -s; i < s * 2; i += 32) {
      ctx.beginPath();
      ctx.moveTo(i, s);
      ctx.lineTo(i + 16, 0);
      ctx.lineTo(i + 32, 0);
      ctx.lineTo(i + 16, s);
      ctx.closePath();
      ctx.fill();
    }
  });

  const panel = canvas(256, (ctx, s) => {
    ctx.fillStyle = '#2e343d';
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 3;
    ctx.strokeRect(4, 4, s - 8, s - 8);
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    ctx.strokeRect(10, 10, s - 20, s - 20);
    speckle(ctx, s, 500, ['#23282d', '#3a4048'], 0.5);
    ctx.fillStyle = 'rgba(245,166,35,0.85)';
    ctx.font = 'bold 22px monospace';
    ctx.fillText('09', 18, 44);
  });

  const molten = canvas(128, (ctx, s) => {
    const g = ctx.createLinearGradient(0, 0, s, s);
    g.addColorStop(0, '#ff5a1f');
    g.addColorStop(0.5, '#f5a623');
    g.addColorStop(1, '#c22e00');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, 500, ['#ffd27a', '#ff8c3b'], 0.8);
  });

  return { concrete, metal, hazard, panel, molten };
}
