import * as THREE from 'three';

/**
 * Procedural texture generators for photorealistic textiles and studio rendering
 */

export function createFabricTexture(baseColorHex = '#ffffff', pattern = 'linen') {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = baseColorHex;
  ctx.fillRect(0, 0, 512, 512);

  // Micro-weave structure
  const step = pattern === 'oxford' ? 4 : 3;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
  for (let x = 0; x < 512; x += step * 2) {
    for (let y = 0; y < 512; y += step * 2) {
      if ((x + y) % (step * 4) === 0) {
        ctx.fillRect(x, y, step, step);
      }
    }
  }

  // Cross-hatch highlights
  ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
  for (let x = step; x < 512; x += step * 2) {
    for (let y = step; y < 512; y += step * 2) {
      ctx.fillRect(x, y, step, step);
    }
  }

  // Subtle border / fold crease for folded textiles
  if (pattern === 'linen') {
    const gradient = ctx.createLinearGradient(0, 0, 512, 0);
    gradient.addColorStop(0, 'rgba(0,0,0,0.08)');
    gradient.addColorStop(0.1, 'rgba(0,0,0,0)');
    gradient.addColorStop(0.9, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, 'rgba(0,0,0,0.08)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 512, 512);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  return texture;
}

export function createFloorGridTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');

  // Dark studio floor background
  ctx.fillStyle = '#090d16';
  ctx.fillRect(0, 0, 1024, 1024);

  // Minor grid lines (every 32px)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 1024; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 1024);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(1024, i);
    ctx.stroke();
  }

  // Major grid lines (every 128px)
  ctx.strokeStyle = 'rgba(99, 102, 241, 0.12)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i <= 1024; i += 128) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 1024);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(1024, i);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(10, 10);
  return texture;
}

/**
 * Creates 3D text badge canvas texture for floating labels
 */
export function createTextBadgeTexture(text, bgColor = 'rgba(15, 23, 42, 0.85)', textColor = '#f8fafc', borderColor = '#6366f1') {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, 512, 128);

  // Rounded rectangle
  const r = 24;
  ctx.beginPath();
  ctx.moveTo(r, 8);
  ctx.lineTo(512 - r, 8);
  ctx.quadraticCurveTo(512 - 8, 8, 512 - 8, r);
  ctx.lineTo(512 - 8, 128 - r);
  ctx.quadraticCurveTo(512 - 8, 128 - 8, 512 - r, 128 - 8);
  ctx.lineTo(r, 128 - 8);
  ctx.quadraticCurveTo(8, 128 - 8, 8, 128 - r);
  ctx.lineTo(8, r);
  ctx.quadraticCurveTo(8, 8, r, 8);
  ctx.closePath();

  ctx.fillStyle = bgColor;
  ctx.fill();

  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 4;
  ctx.stroke();

  // Text
  ctx.fillStyle = textColor;
  ctx.font = 'bold 36px "Inter", "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 68);

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

/**
 * Creates procedural wire mesh / grid texture with transparency
 */
export function createWireMeshTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, 256, 256);

  const step = 28;
  const wireWidth = 3.5;

  ctx.strokeStyle = '#94a3b8'; // Galvanized steel color
  ctx.lineWidth = wireWidth;
  ctx.lineCap = 'round';

  // Vertical and horizontal wires
  for (let i = Math.floor(wireWidth); i <= 256; i += step) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 256);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(256, i);
    ctx.stroke();
  }

  // Welded junction beads with metallic highlight
  ctx.fillStyle = '#e2e8f0';
  for (let x = Math.floor(wireWidth); x <= 256; x += step) {
    for (let y = Math.floor(wireWidth); y <= 256; y += step) {
      ctx.beginPath();
      ctx.arc(x, y, wireWidth * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/**
 * Creates procedural industrial perforated steel deck texture
 */
export function createPerforatedDeckTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  // Base slate-steel surface
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, 512, 512);

  // Brushed steel micro-lines
  ctx.fillStyle = 'rgba(255, 255, 255, 0.035)';
  for (let y = 0; y < 512; y += 3) {
    ctx.fillRect(0, y, 512, 1.5);
  }

  // Diamond/stamped slot ventilation pattern
  ctx.fillStyle = '#090d16';
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1;

  const slotW = 20;
  const slotH = 5;

  for (let y = 16; y < 512; y += 24) {
    const rowOffset = ((y / 24) % 2) * 20;
    for (let x = 16; x < 512; x += 40) {
      const px = x + rowOffset;
      if (px + slotW > 504) continue;
      
      ctx.beginPath();
      ctx.rect(px, y, slotW, slotH);
      ctx.fill();
      ctx.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}
