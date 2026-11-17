import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const PORT = Number(process.env.PORT ?? 3000);
const DATA_DIR = path.join(process.cwd(), 'data');
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');

const STORYBOARD_SYSTEM_INSTRUCTION = `You are a professional storyboard artist and cinematic director. Your job is to read raw screenplay or story text and break it down into sequential, highly visual storyboard panels.

For the provided text, output a strict JSON object with a "storyboard" array where each object represents a single scene/panel.

For each panel, you must generate a highly optimized image generation prompt designed for a model like FLUX.1. The image prompt must be comma-separated and include:
1. Camera angle and shot type (e.g., Extreme Wide Shot, Dutch Angle, Close Up, Over-the-Shoulder Shot, Low Angle Medium Shot).
2. Subject description (physical traits, clothing, action — maintain exact character visual consistency across all panels).
3. Environment and setting.
4. Lighting and atmosphere (e.g., volumetric lighting, cinematic, moody, golden hour).
5. Art style matching the requested visual style.

Do not output any markdown formatting, conversational text, or explanations. Output ONLY valid JSON.`;

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in server environment.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function getDimensionsForRatio(aspectRatio: string): { width: number; height: number } {
  if (aspectRatio === '4:3') return { width: 800, height: 600 };
  if (aspectRatio === '2.39:1') return { width: 956, height: 400 };
  return { width: 960, height: 540 };
}

function sanitizeSvg(rawSvg: string, width: number, height: number): string | null {
  const trimmed = rawSvg
    .replace(/^```(?:svg|xml)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  const startIdx = trimmed.indexOf('<svg');
  const endIdx = trimmed.lastIndexOf('</svg>');
  if (startIdx === -1 || endIdx === -1) return null;

  let svg = trimmed.slice(startIdx, endIdx + 6);
  svg = svg.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
  svg = svg.replace(/\son[a-z]+\s*=\s*(['"])[\s\S]*?\1/gi, '');
  svg = svg.replace(/javascript:/gi, '');

  if (!/viewBox\s*=/.test(svg)) {
    svg = svg.replace('<svg', `<svg viewBox="0 0 ${width} ${height}"`);
  }
  svg = svg.replace(/\s(width|height)\s*=\s*(['"])[^'"]*\2/gi, '');
  svg = svg.replace('<svg', '<svg width="100%" height="100%" preserveAspectRatio="xMidYMid slice"');
  return svg;
}

function isTransientGeminiError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes('503') ||
    msg.includes('429') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('high demand') ||
    msg.includes('overloaded') ||
    msg.includes('timed out') ||
    msg.includes('ECONNRESET') ||
    msg.includes('ETIMEDOUT')
  );
}

function formatGeminiErrorMessage(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : String(error || fallback);
  if (raw.includes('503') || raw.includes('UNAVAILABLE') || raw.includes('high demand')) {
    return 'Gemini is temporarily experiencing high demand (503). Automatic retries and fallback were attempted — please try again in a few seconds.';
  }
  if (raw.includes('429') || raw.includes('RESOURCE_EXHAUSTED')) {
    return 'Rate limit reached (429). Please wait a moment before generating again.';
  }
  if (raw.includes('API_KEY_INVALID') || raw.includes('PERMISSION_DENIED')) {
    return 'API key error. Please verify GEMINI_API_KEY in Settings > Secrets.';
  }
  return raw;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
    ),
  ]);
}

let hydrogenCooldownUntil = 0;

async function generateWithFallback(
  ai: GoogleGenAI,
  params: {
    contents: string;
    config?: Record<string, unknown>;
  },
) {
  const now = Date.now();
  const skipHydrogen = now < hydrogenCooldownUntil;

  const attempts: Array<{ model: string; delayMs: number; useLowThinking: boolean }> = skipHydrogen
    ? [
        { model: 'gemini-3.1-flash-lite', delayMs: 0, useLowThinking: false },
        { model: 'gemini-3.1-flash-lite', delayMs: 800, useLowThinking: false },
      ]
    : [
        { model: 'gemini-4-hydrogen', delayMs: 0, useLowThinking: true },
        { model: 'gemini-3.1-flash-lite', delayMs: 300, useLowThinking: false },
        { model: 'gemini-3.1-flash-lite', delayMs: 900, useLowThinking: false },
      ];

  let lastError: unknown;

  for (const attempt of attempts) {
    if (attempt.delayMs > 0) {
      await sleep(attempt.delayMs);
    }

    try {
      const config = attempt.useLowThinking
        ? {
            ...(params.config ?? {}),
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          }
        : params.config;

      return await withTimeout(
        ai.models.generateContent({
          model: attempt.model,
          contents: params.contents,
          config,
        }),
        attempt.model === 'gemini-4-hydrogen' ? 12000 : 35000,
        attempt.model,
      );
    } catch (error) {
      lastError = error;
      if (attempt.model === 'gemini-4-hydrogen' && isTransientGeminiError(error)) {
        hydrogenCooldownUntil = Date.now() + 300_000;
      }
      if (!isTransientGeminiError(error)) {
        throw error;
      }
    }
  }

  throw lastError;
}

function buildFallbackSvg(
  sceneHeading: string,
  actionSummary: string,
  artStyle: string,
  aspectRatio: string,
): string {
  const { width, height } = getDimensionsForRatio(aspectRatio);
  const text = `${sceneHeading} ${actionSummary}`.toLowerCase();
  const isNoir = artStyle === 'Noir Ink Wash' || artStyle === 'Charcoal Sketch';
  const isNight = text.includes('night') || text.includes('space') || text.includes('dark');
  const isRain = text.includes('rain') || text.includes('wet') || text.includes('drizzle');
  const isSpace = text.includes('space') || text.includes('orbital') || text.includes('airlock');
  const isInterior = text.includes('int.');

  const bgTop = isNoir ? '#14161B' : isSpace ? '#0B1220' : isNight ? '#111622' : '#243242';
  const bgBottom = isNoir ? '#32363F' : isSpace ? '#1C2B42' : isNight ? '#262E3D' : '#584435';
  const accent = isNoir ? '#D4D7DD' : isSpace ? '#4FB3E8' : '#E89B4C';
  const horizonY = Math.round(height * 0.65);

  const rainLines = isRain
    ? Array.from({ length: 18 }, (_, i) => {
        const x = Math.round((width / 18) * i + 20);
        const y = (i * 53) % Math.round(height * 0.55);
        return `<line x1="${x}" y1="${y}" x2="${x - 14}" y2="${y + 42}" stroke="#C5D5E8" stroke-opacity="0.22" stroke-width="1.2" />`;
      }).join('')
    : '';

  const environmentLayer = isSpace
    ? `<circle cx="${width * 0.72}" cy="${height * 0.34}" r="${Math.round(height * 0.24)}" fill="${accent}" fill-opacity="0.22" stroke="${accent}" stroke-opacity="0.45" stroke-width="1.5" />
       <ellipse cx="${width * 0.72}" cy="${height * 0.34}" rx="${Math.round(height * 0.42)}" ry="${Math.round(height * 0.07)}" fill="none" stroke="${accent}" stroke-opacity="0.35" stroke-width="2" transform="rotate(-12 ${width * 0.72} ${height * 0.34})" />`
    : isInterior
      ? `<rect x="${width * 0.08}" y="${height * 0.14}" width="${width * 0.26}" height="${height * 0.42}" fill="${accent}" fill-opacity="0.16" stroke="#ffffff" stroke-opacity="0.18" stroke-width="2" />
         <rect x="${width * 0.66}" y="${height * 0.14}" width="${width * 0.26}" height="${height * 0.42}" fill="${accent}" fill-opacity="0.12" stroke="#ffffff" stroke-opacity="0.14" stroke-width="2" />`
      : `<rect x="${width * 0.09}" y="${horizonY - 140}" width="64" height="140" fill="#10131A" opacity="0.82" />
         <rect x="${width * 0.21}" y="${horizonY - 190}" width="78" height="190" fill="#0E1117" opacity="0.72" />
         <rect x="${width * 0.71}" y="${horizonY - 165}" width="84" height="165" fill="#10131A" opacity="0.8" />
         <rect x="${width * 0.84}" y="${horizonY - 115}" width="58" height="115" fill="#0E1117" opacity="0.75" />`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${bgTop}" />
      <stop offset="100%" stop-color="${bgBottom}" />
    </linearGradient>
    <radialGradient id="lightCone" cx="65%" cy="28%" r="58%">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.38" />
      <stop offset="100%" stop-color="${accent}" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#skyGrad)" />
  <rect width="${width}" height="${height}" fill="url(#lightCone)" />
  ${environmentLayer}
  <polygon points="0,${horizonY} ${width},${horizonY} ${width},${height} 0,${height}" fill="#0C0E13" opacity="0.9" />
  <line x1="0" y1="${horizonY}" x2="${width}" y2="${horizonY}" stroke="${accent}" stroke-opacity="0.35" stroke-width="1.5" />
  <line x1="${width * 0.5}" y1="${horizonY}" x2="0" y2="${height}" stroke="#ffffff" stroke-opacity="0.08" stroke-width="1" />
  <line x1="${width * 0.5}" y1="${horizonY}" x2="${width}" y2="${height}" stroke="#ffffff" stroke-opacity="0.08" stroke-width="1" />
  ${rainLines}
  <g transform="translate(${width * 0.36}, ${horizonY - 105})">
    <ellipse cx="26" cy="20" rx="15" ry="17" fill="#080A0E" />
    <path d="M4,44 Q26,32 48,44 L56,130 L-4,130 Z" fill="#080A0E" />
    <path d="M6,44 Q26,33 46,44" stroke="${accent}" stroke-width="2" fill="none" opacity="0.7" />
  </g>
</svg>`;
}

interface StoredProject {
  id: string;
  title: string;
  scriptText: string;
  artStyle: string;
  aspectRatio: string;
  panels: Array<{
    panel_number: number;
    scene_heading: string;
    action_summary: string;
    characters_in_scene: string[];
    image_prompt: string;
    imageUrl?: string;
    svgMarkup?: string;
    renderStatus?: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

async function readProjects(): Promise<StoredProject[]> {
  try {
    const raw = await fs.readFile(PROJECTS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeProjects(projects: StoredProject[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(PROJECTS_FILE, JSON.stringify(projects, null, 2), 'utf-8');
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '12mb' }));

  app.post('/api/storyboard/parse', async (req, res) => {
    try {
      const { scriptText, artStyle = 'Digital Concept Art', aspectRatio = '16:9' } = req.body ?? {};
      if (typeof scriptText !== 'string' || !scriptText.trim()) {
        res.status(400).json({ error: 'Please provide screenplay or story text to parse.' });
        return;
      }

      const ai = getGeminiClient();
      const response = await generateWithFallback(ai, {
        contents: `Visual Art Style requested: ${artStyle}
Target Frame Aspect Ratio: ${aspectRatio}

Raw Screenplay / Story Text:
"""
${scriptText.trim()}
"""

Break this text into sequential storyboard panels (between 2 and 10 panels depending on scene beats). Ensure every character keeps consistent physical traits and wardrobe across every panel they appear in, and end each image_prompt with the requested art style (${artStyle}).`,
        config: {
          systemInstruction: STORYBOARD_SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              storyboard: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    panel_number: {
                      type: Type.INTEGER,
                      description: 'Sequential 1-based storyboard panel index.',
                    },
                    scene_heading: {
                      type: Type.STRING,
                      description: 'Standard screenplay slugline (e.g., INT. COFFEE SHOP - DAY).',
                    },
                    action_summary: {
                      type: Type.STRING,
                      description: 'Concise 1-2 sentence director summary of the visual action.',
                    },
                    characters_in_scene: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                      description: 'List of "Name: physical traits and wardrobe" entries for continuity.',
                    },
                    image_prompt: {
                      type: Type.STRING,
                      description: 'Comma-separated FLUX.1 image prompt with shot type, subject, environment, lighting, and art style.',
                    },
                  },
                  required: [
                    'panel_number',
                    'scene_heading',
                    'action_summary',
                    'characters_in_scene',
                    'image_prompt',
                  ],
                },
              },
            },
            required: ['storyboard'],
          },
        },
      });

      const rawText = (response.text ?? '{}')
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();
      const parsed = JSON.parse(rawText);

      if (!parsed || !Array.isArray(parsed.storyboard) || parsed.storyboard.length === 0) {
        res.status(502).json({ error: 'Model returned an empty storyboard. Try adding more descriptive action.' });
        return;
      }

      res.json(parsed);
    } catch (error) {
      const status = isTransientGeminiError(error) ? 503 : 500;
      const message = formatGeminiErrorMessage(error, 'Failed to parse screenplay.');
      console.error('Storyboard parse error:', message);
      res.status(status).json({ error: message });
    }
  });

  function getFluxDimensions(aspectRatio: string): { width: number; height: number } {
    if (aspectRatio === '4:3') return { width: 1024, height: 768 };
    if (aspectRatio === '2.39:1') return { width: 1216, height: 512 };
    return { width: 1024, height: 576 };
  }

  async function renderViaFluxDocker(
    prompt: string,
    aspectRatio: string,
    seed: number,
  ): Promise<string> {
    const endpoint = process.env.FLUX_API_URL?.trim();
    if (!endpoint) {
      throw new Error('FLUX_API_URL is not configured on the server.');
    }
    const { width, height } = getFluxDimensions(aspectRatio);
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        width,
        height,
        num_inference_steps: 4,
        seed,
      }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      throw new Error(`FLUX.1 Docker API error (${upstream.status}): ${detail || upstream.statusText}`);
    }

    const data = (await upstream.json()) as { imageBase64?: string; mimeType?: string };
    if (!data.imageBase64) {
      throw new Error('FLUX.1 Docker service returned an empty image payload.');
    }
    return `data:${data.mimeType ?? 'image/png'};base64,${data.imageBase64}`;
  }

  async function renderViaHuggingFaceFlux(prompt: string, aspectRatio: string): Promise<string> {
    const token = process.env.HF_TOKEN?.trim();
    if (!token) {
      throw new Error('HF_TOKEN is not configured on the server.');
    }
    const { width, height } = getFluxDimensions(aspectRatio);
    const endpoint =
      process.env.HF_FLUX_ENDPOINT?.trim() ||
      'https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell';

    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          width,
          height,
          num_inference_steps: 4,
          guidance_scale: 0.0,
        },
      }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      throw new Error(`Hugging Face FLUX.1 error (${upstream.status}): ${detail || upstream.statusText}`);
    }

    const contentType = upstream.headers.get('content-type') || 'image/png';
    const arrayBuffer = await upstream.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    return `data:${contentType};base64,${base64}`;
  }

  app.get('/api/capabilities', (_req, res) => {
    res.json({
      hasGemini: Boolean(process.env.GEMINI_API_KEY?.trim()),
      hasFluxDocker: Boolean(process.env.FLUX_API_URL?.trim()),
      hasHfFlux: Boolean(process.env.HF_TOKEN?.trim()),
    });
  });

  app.post('/api/storyboard/render-panel', async (req, res) => {
    try {
      const {
        panel_number = 1,
        scene_heading = 'SCENE',
        action_summary = '',
        characters_in_scene = [],
        image_prompt = '',
        artStyle = 'Digital Concept Art',
        aspectRatio = '16:9',
        renderer = 'auto',
      } = req.body ?? {};

      const hasFluxDocker = Boolean(process.env.FLUX_API_URL?.trim());
      const hasHfFlux = Boolean(process.env.HF_TOKEN?.trim());

      const resolvedRenderer =
        renderer === 'auto'
          ? hasFluxDocker
            ? 'flux-docker'
            : hasHfFlux
              ? 'flux-hf'
              : 'svg'
          : renderer;

      if (resolvedRenderer === 'flux-docker') {
        const imageUrl = await renderViaFluxDocker(
          image_prompt || `${scene_heading}, ${action_summary}`,
          aspectRatio,
          Number(panel_number) || 0,
        );
        res.json({ imageUrl, engine: 'flux-docker' });
        return;
      }

      if (resolvedRenderer === 'flux-hf') {
        const imageUrl = await renderViaHuggingFaceFlux(
          image_prompt || `${scene_heading}, ${action_summary}`,
          aspectRatio,
        );
        res.json({ imageUrl, engine: 'flux-hf' });
        return;
      }

      const { width, height } = getDimensionsForRatio(aspectRatio);
      const ai = getGeminiClient();

      const styleGuidance =
        artStyle === 'Charcoal Sketch'
          ? 'Use warm cream/graphite paper tones (#ECE9E2, #2A2C30, #555961), expressive charcoal shading gradients, cross-hatch linework patterns, and stark rim highlights.'
          : artStyle === 'Noir Ink Wash'
            ? 'Use dramatic high-contrast monochrome ink tones (#090A0D, #1E2128, #EAECEF), stark chiaroscuro light beams, deep cast shadows, and subtle amber/crimson neon accents if relevant.'
            : artStyle === 'Graphic Novel'
              ? 'Use crisp ink silhouettes, rich atmospheric cel-shading color blocks, warm key light vs cool shadow contrast, and bold comic-book composition.'
              : artStyle === 'Photorealistic Cinema'
                ? 'Use layered atmospheric depth, cinematic color grading (teal/amber or natural daylight), subtle volumetric light cones, and realistic architectural perspective.'
                : 'Use rich painterly digital concept art color gradients, atmospheric fog layers, rim lighting on silhouettes, and strong depth perspective.';

      const svgPrompt = `Create a cinematic storyboard frame illustration as a clean, valid SVG (<svg viewBox="0 0 ${width} ${height}">) representing this exact shot.

PANEL #${panel_number}: ${scene_heading}
ACTION: ${action_summary}
CHARACTERS: ${Array.isArray(characters_in_scene) ? characters_in_scene.join('; ') : ''}
SHOT & PROMPT DETAILS: ${image_prompt}
VISUAL STYLE: ${artStyle} — ${styleGuidance}

Strict technical requirements for the SVG:
1. Root element must be <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"> and end with </svg>.
2. Keep the SVG compact and fast to render (roughly 18-35 clean primitives total) with 4 crisp visual layers:
   - Layer 1: Sky/wall/backdrop with <linearGradient> or <radialGradient> lighting.
   - Layer 2: Perspective architecture, horizon, windows, skyline, trees, or interior furniture using clean <path>, <polygon>, <rect>, <line> elements.
   - Layer 3: Lighting atmosphere (volumetric sunbeams, window light cones, rain streaks, mist ellipses, reflections).
   - Layer 4: Expressive character figures/silhouettes positioned according to the camera shot type (Wide Shot, Close Up, Over-the-Shoulder, Low Angle) with recognizable hair, coat/clothing silhouette, posture, props, and rim lighting!
3. Do NOT render any text labels, captions, speech bubbles, or watermarks inside the SVG.
4. Do NOT include <script> tags or external URLs.
5. Output ONLY the raw <svg>...</svg> markup, with no markdown fences or explanation.`;

      try {
        const response = await generateWithFallback(ai, {
          contents: svgPrompt,
        });

        const sanitized = sanitizeSvg(response.text ?? '', width, height);
        if (sanitized) {
          res.json({ svgMarkup: sanitized, engine: 'svg' });
          return;
        }
      } catch (llmError) {
        if (!isTransientGeminiError(llmError)) {
          throw llmError;
        }
      }

      res.json({
        svgMarkup: buildFallbackSvg(scene_heading, action_summary, artStyle, aspectRatio),
        engine: 'svg',
      });
    } catch (error) {
      const status = isTransientGeminiError(error) ? 503 : 500;
      const message = formatGeminiErrorMessage(error, 'Failed to render storyboard panel.');
      console.error('Panel render error:', message);
      res.status(status).json({ error: message });
    }
  });

  app.get('/api/projects', async (_req, res) => {
    try {
      const projects = await readProjects();
      res.json({ projects });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load projects.';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/projects', async (req, res) => {
    try {
      const incoming = req.body as StoredProject;
      if (!incoming || !incoming.id || !incoming.title || !Array.isArray(incoming.panels)) {
        res.status(400).json({ error: 'Invalid storyboard project payload.' });
        return;
      }

      const projects = await readProjects();
      const now = new Date().toISOString();
      const normalized: StoredProject = {
        ...incoming,
        updatedAt: now,
        createdAt: incoming.createdAt || now,
      };

      const idx = projects.findIndex((p) => p.id === normalized.id);
      if (idx >= 0) {
        projects[idx] = normalized;
      } else {
        projects.unshift(normalized);
      }

      await writeProjects(projects);
      res.json({ project: normalized });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save project.';
      res.status(500).json({ error: message });
    }
  });

  app.delete('/api/projects/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const projects = await readProjects();
      const filtered = projects.filter((p) => p.id !== id);
      await writeProjects(filtered);
      res.json({ deleted: id });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete project.';
      res.status(500).json({ error: message });
    }
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  app.use(
    '/api',
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const message = err instanceof Error ? err.message : 'Unexpected server error.';
      res.status(500).json({ error: message });
    },
  );

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Frameflow studio listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Frameflow server:', err);
  process.exit(1);
});
