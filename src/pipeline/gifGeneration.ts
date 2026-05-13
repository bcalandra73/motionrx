import { GIFEncoder, quantize, applyPalette } from 'gifenc';

const MAX_WIDTH = 640;

function loadImageData(b64: string): Promise<ImageData> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_WIDTH / img.width);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
      resolve(canvas.getContext('2d')!.getImageData(0, 0, w, h));
    };
    img.onerror = () => resolve(new ImageData(1, 1));
    img.src = `data:image/jpeg;base64,${b64}`;
  });
}

export async function framesToGif(frames: string[], fps = 2): Promise<string> {
  const delay = Math.round(1000 / fps);
  const gif = GIFEncoder();

  for (const b64 of frames) {
    const { data, width, height } = await loadImageData(b64);
    const palette = quantize(data, 256);
    const index = applyPalette(data, palette);
    gif.writeFrame(index, width, height, { palette, delay });
  }

  gif.finish();
  const bytes = gif.bytes();
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
