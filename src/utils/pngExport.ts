import type { AspectRatio, StoryboardPanel } from '../types/storyboard';

function getPngDimensions(aspectRatio: AspectRatio): { width: number; height: number } {
  if (aspectRatio === '4:3') return { width: 1600, height: 1200 };
  if (aspectRatio === '2.39:1') return { width: 1912, height: 800 };
  return { width: 1920, height: 1080 };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Unable to load panel artwork for PNG export.'));
    img.src = src;
  });
}

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  targetW: number,
  targetH: number,
) {
  const srcW = Math.max(1, img.naturalWidth || targetW);
  const srcH = Math.max(1, img.naturalHeight || targetH);
  const scale = Math.max(targetW / srcW, targetH / srcH);
  const drawW = srcW * scale;
  const drawH = srcH * scale;
  const offsetX = (targetW - drawW) / 2;
  const offsetY = (targetH - drawH) / 2;
  ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
}

export async function exportPanelAsPng(options: {
  panel: StoryboardPanel;
  aspectRatio: AspectRatio;
  projectTitle?: string;
}): Promise<void> {
  const { panel, aspectRatio, projectTitle } = options;
  const { width, height } = getPngDimensions(aspectRatio);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context is unavailable in this browser.');
  }

  ctx.fillStyle = '#111318';
  ctx.fillRect(0, 0, width, height);

  if (panel.imageUrl) {
    const img = await loadImage(panel.imageUrl);
    drawImageCover(ctx, img, width, height);
  } else if (panel.svgMarkup) {
    const blob = new Blob([panel.svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    try {
      const img = await loadImage(blobUrl);
      drawImageCover(ctx, img, width, height);
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  } else {
    throw new Error('This panel does not have rendered artwork yet.');
  }

  const pngBlob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to encode PNG file.'));
    }, 'image/png');
  });

  const slug = (projectTitle || 'frameflow')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const panelTag = String(panel.panel_number).padStart(2, '0');
  const filename = `${slug || 'frameflow'}-panel-${panelTag}.png`;

  const downloadUrl = URL.createObjectURL(pngBlob);
  const anchor = document.createElement('a');
  anchor.href = downloadUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(downloadUrl);
}
