import { jsPDF } from 'jspdf';
import type { AspectRatio, ArtStyle, StoryboardPanel } from '../types/storyboard';

async function imageUrlToDataUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = Math.round((1280 * img.naturalHeight) / Math.max(1, img.naturalWidth));
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas 2D context unavailable'));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.9));
    };
    img.onerror = () => reject(new Error('Failed to load panel image for PDF'));
    img.src = url;
  });
}

async function svgMarkupToDataUrl(svgMarkup: string, aspectRatio: AspectRatio): Promise<string> {
  const width = 1280;
  const height = aspectRatio === '4:3' ? 960 : aspectRatio === '2.39:1' ? 536 : 720;

  return new Promise((resolve, reject) => {
    const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(blobUrl);
        reject(new Error('Canvas 2D context unavailable'));
        return;
      }
      ctx.fillStyle = '#111318';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(blobUrl);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => {
      URL.revokeObjectURL(blobUrl);
      reject(new Error('Failed to rasterize SVG panel for PDF'));
    };
    img.src = blobUrl;
  });
}

async function panelToPdfImage(
  panel: StoryboardPanel,
  aspectRatio: AspectRatio,
): Promise<{ dataUrl: string; format: 'JPEG' | 'PNG' } | null> {
  try {
    if (panel.imageUrl) {
      const dataUrl = await imageUrlToDataUrl(panel.imageUrl);
      return { dataUrl, format: 'JPEG' };
    }
    if (panel.svgMarkup) {
      const dataUrl = await svgMarkupToDataUrl(panel.svgMarkup, aspectRatio);
      return { dataUrl, format: 'PNG' };
    }
  } catch (err) {
    console.warn(`Could not rasterize panel ${panel.panel_number}:`, err);
  }
  return null;
}

export async function exportStoryboardPdf(options: {
  title: string;
  artStyle: ArtStyle;
  aspectRatio: AspectRatio;
  panels: StoryboardPanel[];
}): Promise<void> {
  const { title, artStyle, aspectRatio, panels } = options;
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const colGap = 10;
  const cardWidth = (pageWidth - margin * 2 - colGap) / 2;

  const uniqueCharacters = Array.from(
    new Set(panels.flatMap((p) => p.characters_in_scene.map((c) => c.trim())).filter(Boolean)),
  );

  // Page 1 header block
  doc.setFillColor(17, 19, 24);
  doc.rect(0, 0, pageWidth, 24, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(title || 'Untitled Storyboard', margin, 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(200, 204, 212);
  doc.text(
    `FRAMEFLOW STORYBOARD  ·  ${panels.length} PANELS  ·  ${artStyle.toUpperCase()}  ·  ${aspectRatio}`,
    margin,
    18,
  );

  let startY = 30;
  if (uniqueCharacters.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(17, 19, 24);
    doc.text('CHARACTER CONTINUITY BIBLE', margin, startY);
    startY += 4.5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(75, 85, 99);
    const charLines = doc.splitTextToSize(uniqueCharacters.slice(0, 6).join('   |   '), pageWidth - margin * 2);
    doc.text(charLines, margin, startY);
    startY += charLines.length * 3.8 + 4;
  }

  const ratioMultiplier = aspectRatio === '4:3' ? 3 / 4 : aspectRatio === '2.39:1' ? 1 / 2.39 : 9 / 16;
  const imgHeight = Math.min(68, cardWidth * ratioMultiplier);

  for (let i = 0; i < panels.length; i++) {
    const panel = panels[i];

    // 2 panels per page on page 1 if character bible takes space, or 2 panels per page cleanly for generous readability
    const indexOnPage = i % 2;
    if (i > 0 && indexOnPage === 0) {
      doc.addPage();
      startY = 18;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(107, 114, 128);
      doc.text(`${title || 'Untitled Storyboard'} — Page ${doc.getNumberOfPages()}`, margin, 11);
    }

    const x = margin + indexOnPage * (cardWidth + colGap);
    const y = startY;

    // Card frame border
    doc.setDrawColor(220, 224, 230);
    doc.setLineWidth(0.3);
    doc.rect(x, y, cardWidth, pageHeight - y - margin);

    // Panel label & scene heading
    doc.setFillColor(247, 248, 250);
    doc.rect(x, y, cardWidth, 9, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(217, 78, 40);
    doc.text(`PANEL ${String(panel.panel_number).padStart(2, '0')}`, x + 3.5, y + 6);

    doc.setTextColor(17, 19, 24);
    const headingTrunc = panel.scene_heading.slice(0, 44);
    doc.text(headingTrunc, x + 23, y + 6);

    // Artwork box
    const imgY = y + 11;
    const imgX = x + 3.5;
    const imgW = cardWidth - 7;
    const rendered = await panelToPdfImage(panel, aspectRatio);
    if (rendered) {
      doc.addImage(rendered.dataUrl, rendered.format, imgX, imgY, imgW, imgHeight);
    } else {
      doc.setFillColor(24, 26, 32);
      doc.rect(imgX, imgY, imgW, imgHeight, 'F');
      doc.setTextColor(160, 165, 175);
      doc.setFontSize(8);
      doc.text('Frame artwork pending', imgX + 6, imgY + imgHeight / 2);
    }

    // Action summary
    let textY = imgY + imgHeight + 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(107, 114, 128);
    doc.text('ACTION', imgX, textY);
    textY += 4;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(17, 19, 24);
    const actionLines = doc.splitTextToSize(panel.action_summary, imgW).slice(0, 4);
    doc.text(actionLines, imgX, textY);
    textY += actionLines.length * 4 + 3;

    // Characters
    if (panel.characters_in_scene.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(107, 114, 128);
      doc.text('CHARACTERS', imgX, textY);
      textY += 3.8;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(55, 65, 81);
      const charText = doc.splitTextToSize(panel.characters_in_scene.join(' · '), imgW).slice(0, 3);
      doc.text(charText, imgX, textY);
      textY += charText.length * 3.5 + 3;
    }

    // Image prompt
    if (textY < pageHeight - margin - 14) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(107, 114, 128);
      doc.text('IMAGE PROMPT (FLUX.1)', imgX, textY);
      textY += 3.8;

      doc.setFont('courier', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(75, 85, 99);
      const maxPromptLines = Math.max(2, Math.floor((pageHeight - margin - textY - 2) / 3.2));
      const promptLines = doc.splitTextToSize(panel.image_prompt, imgW).slice(0, maxPromptLines);
      doc.text(promptLines, imgX, textY);
    }
  }

  const slug = (title || 'frameflow-storyboard')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  doc.save(`${slug || 'frameflow-storyboard'}.pdf`);
}
