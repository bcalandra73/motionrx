import type { NormalizedLandmark } from '../types';

const SKELETON_CONNECTIONS: [number, number][] = [
  // torso
  [11, 12], [11, 23], [12, 24], [23, 24],
  // left arm
  [11, 13], [13, 15],
  // right arm
  [12, 14], [14, 16],
  // left leg
  [23, 25], [25, 27], [27, 29], [27, 31],
  // right leg
  [24, 26], [26, 28], [28, 30], [28, 32],
];

const LEFT_IDX  = new Set([11, 13, 15, 23, 25, 27, 29, 31]);
const RIGHT_IDX = new Set([12, 14, 16, 24, 26, 28, 30, 32]);

function jointColor(i: number): string {
  if (LEFT_IDX.has(i))  return '#00FFFF';
  if (RIGHT_IDX.has(i)) return '#FFFF00';
  return '#FFFFFF';
}

export function annotateFrame(
  imageData: string,
  landmarks: NormalizedLandmark[],
  frameLabel?: string,
): Promise<string> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width  = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);

      const W = canvas.width;
      const H = canvas.height;
      const VIS   = 0.3;
      const lineW = Math.max(2, Math.round(W * 0.003));
      const dotR  = Math.max(4, Math.round(W * 0.006));

      ctx.lineWidth = lineW;
      for (const [a, b] of SKELETON_CONNECTIONS) {
        const lA = landmarks[a], lB = landmarks[b];
        if (!lA || !lB) continue;
        if ((lA.visibility ?? 1) < VIS || (lB.visibility ?? 1) < VIS) continue;
        ctx.strokeStyle = jointColor(a);
        ctx.beginPath();
        ctx.moveTo(lA.x * W, lA.y * H);
        ctx.lineTo(lB.x * W, lB.y * H);
        ctx.stroke();
      }
      for (let i = 0; i < landmarks.length; i++) {
        const lm = landmarks[i];
        if (!lm || (lm.visibility ?? 1) < VIS) continue;
        ctx.fillStyle = jointColor(i);
        ctx.beginPath();
        ctx.arc(lm.x * W, lm.y * H, dotR, 0, Math.PI * 2);
        ctx.fill();
      }

      if (frameLabel) {
        const fontSize = Math.max(12, Math.round(H * 0.025));
        const pad = 6;
        ctx.font = `bold ${fontSize}px sans-serif`;
        const textW = ctx.measureText(frameLabel).width;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(8, 8, textW + pad * 2, fontSize + pad * 2);
        ctx.fillStyle = '#ffffff';
        ctx.textBaseline = 'top';
        ctx.textAlign    = 'left';
        ctx.fillText(frameLabel, 8 + pad, 8 + pad);
      }

      resolve(canvas.toDataURL('image/jpeg', 0.85).replace('data:image/jpeg;base64,', ''));
    };
    img.onerror = () => resolve(imageData);
    img.src = `data:image/jpeg;base64,${imageData}`;
  });
}
