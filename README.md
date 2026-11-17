# Frameflow — Prompt-less Storyboard Engine

**Frameflow** converts raw screenplay or story text directly into a sequential visual storyboard. Instead of manually breaking down scenes and writing complex image prompts one frame at a time, directors and comic artists paste a script and Frameflow automatically parses scenes, tracks character continuity, crafts optimized **FLUX.1** prompts, renders sequential panels, and exports clean **PDF** storyboards and high-resolution **PNG** frames.

---

## Key Features

- **Prompt-less Screenplay Parsing**: Converts raw screenplay or prose into a strict sequential JSON storyboard (`panel_number`, `scene_heading`, `action_summary`, `characters_in_scene`, and comma-separated `image_prompt`).
- **Automated Character Continuity**: Maintains consistent physical traits and wardrobe across panels and compiles a dedicated **Character Bible** showing every character's description and panel appearances.
- **Multi-Engine Frame Rendering**:
  - **Built-in Vector (Gemini)**: Synthesizes layered, aspect-matched SVG storyboard illustrations directly with `@google/genai` (`gemini-4-hydrogen` with automatic retry and `gemini-3.1-flash-lite` fallback, plus a scene-aware procedural SVG fallback).
  - **FLUX.1 [schnell] Docker (`FLUX_API_URL`)**: Connects to the included GPU-accelerated FastAPI + `diffusers` microservice in `flux-service/`.
  - **FLUX.1 [schnell] Hugging Face (`HF_TOKEN`)**: Connects to Hugging Face's Inference Router for serverless raster image generation.
- **Director's Workspace Views**:
  - **Grid View**: Sequential storyboard cards with framing guides (`16:9`, `4:3`, `2.39:1`), per-panel re-render, prompt copy, and 1-click PNG download.
  - **Presentation Mode**: Full-width animatic theatre viewer with keyboard navigation (`←` / `→`), filmstrip scrubber, auto-play timer, and active-frame PNG export.
  - **Prompt Sheet**: Tabular production call sheet with scene headings, action summaries, FLUX.1 prompts, and quick export actions.
  - **Lightbox Inspector**: Fullscreen frame modal to edit an individual panel's FLUX.1 prompt, re-render just that frame, or export it as PNG.
  - **JSON Inspector**: Live syntax-formatted view of the strict `{ "storyboard": [...] }` payload with Copy and `.json` download.
  - **Studio Light & Darkroom Modes**: Toggle between a bright drafting-sheet canvas and a low-glare darkroom theme.
- **Export & Persistence**:
  - **Downloadable PDF Storyboard**: Multi-page landscape A4 PDF via `jspdf` featuring project metadata, character continuity notes, rendered panel frames, action summaries, and FLUX.1 prompts.
  - **Individual Panel PNG Export**: High-DPI canvas export (`1920×1080` for `16:9`, `1600×1200` for `4:3`, `1912×800` for `2.39:1`) supporting both raster and vector frames.
  - **Saved Boards Library**: Server-side JSON persistence (`data/projects.json`) via Express REST endpoints (`/api/projects`) so scripts and rendered panels can be saved, reopened, and deleted.

---

## Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS v4, Lucide Icons |
| **Backend** | Node.js, Express 4 (`server.ts`) |
| **LLM & Vector Synthesis** | `@google/genai` (`gemini-4-hydrogen` with automatic `gemini-3.1-flash-lite` fallback) |
| **Optional Raster Image Model** | `black-forest-labs/FLUX.1-schnell` via Docker (`diffusers` + FastAPI + PyTorch) or Hugging Face Inference API |
| **PDF & Image Export** | `jspdf` + HTML5 Canvas API |
| **Persistence** | Express REST API backed by server filesystem JSON (`data/projects.json`) |

---

## Architecture & Workflow

1. **Script Input**: The user enters a screenplay (or selects a built-in template: *Morning Rain*, *Airlock Seven*, or *The Midnight Booth*), picks a visual style (*Digital Concept Art*, *Graphic Novel*, *Charcoal Sketch*, *Photorealistic Cinema*, or *Noir Ink Wash*), and selects an aspect ratio (`16:9`, `4:3`, or `2.39:1`).
2. **Stage 1 — Scene & Prompt Extraction (`POST /api/storyboard/parse`)**:
   - The Express backend invokes Gemini with `responseMimeType: "application/json"` and a strict `responseSchema`.
   - The LLM extracts sequential panels and builds comma-separated FLUX.1 prompts containing: (1) camera angle & shot type, (2) consistent subject description, (3) environment & setting, (4) lighting & atmosphere, and (5) art style.
3. **Stage 2 — Panel Rendering (`POST /api/storyboard/render-panel`)**:
   - The frontend renders each parsed panel sequentially so progress updates frame by frame in real time.
   - Based on the selected **Image Engine** (`auto`, `svg`, `flux-docker`, or `flux-hf`), `server.ts` routes rendering to the Dockerized FLUX.1 service, Hugging Face Inference Router, or the built-in Gemini SVG illustrator.
4. **Stage 3 — Review, Edit & Export**:
   - Directors inspect frames in Grid, Presentation, or Lightbox views, refine prompts per panel, save boards to the server, download individual PNG frames, or export a full multi-page PDF storyboard.

---

## Project Structure

```text
├── server.ts                      # Express server, Gemini SDK orchestration, FLUX.1 proxy & persistence API
├── index.html                     # HTML entry point & Google Fonts (Bricolage Grotesque, Plus Jakarta Sans, IBM Plex Mono)
├── package.json                   # Scripts & dependencies
├── .env.example                   # Environment variable template
├── flux-service/                  # Optional Dockerized Python FLUX.1 [schnell] GPU service
│   ├── app.py                     # FastAPI wrapper around diffusers FluxPipeline
│   ├── requirements.txt           # Python ML & API dependencies
│   └── Dockerfile                 # CUDA 12.4 container definition
└── src/
    ├── App.tsx                    # Main Frameflow workspace, Script Dock, views & library
    ├── index.css                  # Tailwind v4 setup & darkroom variant
    ├── types/
    │   └── storyboard.ts          # Shared TypeScript interfaces
    ├── data/
    │   └── sampleScripts.ts       # Built-in sample scripts & preloaded Morning Rain artwork
    ├── assets/images/             # Generated sample storyboard keyframes
    ├── components/
    │   ├── PanelArtwork.tsx       # Resilient raster/SVG panel viewer with framing guides
    │   ├── LightboxModal.tsx      # Fullscreen panel inspector, prompt editor & PNG download
    │   └── PresentationView.tsx   # Animatic theatre mode with filmstrip & keyboard controls
    └── utils/
        ├── pdfExport.ts           # Multi-page landscape A4 PDF generator (jsPDF)
        └── pngExport.ts           # High-DPI individual panel PNG exporter
```

---

## Environment Variables

Copy `.env.example` to `.env` (or configure secrets in your hosting environment):

```env
# Required for screenplay parsing and built-in vector storyboard generation
GEMINI_API_KEY="YOUR_GEMINI_API_KEY"

# Base URL where the application is hosted
APP_URL="http://localhost:3000"

# Optional: URL to the Dockerized FLUX.1 [schnell] FastAPI service
FLUX_API_URL=""

# Optional: Hugging Face token for serverless black-forest-labs/FLUX.1-schnell inference
HF_TOKEN=""
```

---

## Getting Started

### 1. Run Locally (Development)

```bash
npm install
npm run dev
```

The Express server mounts Vite middleware and serves the application at `http://localhost:3000`.

### 2. Production Build & Start

```bash
npm run build
NODE_ENV=production npm start
```

### 3. Optional: Run the Dockerized FLUX.1 [schnell] GPU Service

To render photorealistic raster frames locally or on a cloud GPU node (`16–24 GB VRAM` recommended):

```bash
docker build -t frameflow-flux ./flux-service
docker run --gpus all -p 8000:8000 frameflow-flux
```

Then set `FLUX_API_URL="http://localhost:8000/generate"` (or your GPU host's HTTPS URL) in your environment.

### 4. Optional: Use Hugging Face Serverless Inference (No Local GPU)

1. Create a fine-grained access token at **huggingface.co/settings/tokens** with **Make calls to Inference Providers** enabled.
2. Set `HF_TOKEN="hf_..."` in your environment.
3. Choose **Auto** or **FLUX.1 [schnell] Hugging Face** in the Workspace **Image Engine** selector.

---

## API Reference

### `POST /api/storyboard/parse`
Parses raw screenplay text into sequential storyboard panels.

**Request Body:**
```json
{
  "scriptText": "INT. COFFEE SHOP - DAY\n\nMaya types on a laptop...",
  "artStyle": "Graphic Novel",
  "aspectRatio": "16:9"
}
```

**Response (`200 OK`):**
```json
{
  "storyboard": [
    {
      "panel_number": 1,
      "scene_heading": "INT. COFFEE SHOP - DAY",
      "action_summary": "Brief summary of what is happening.",
      "characters_in_scene": ["Maya: short black bob hair, olive trench coat"],
      "image_prompt": "Cinematic wide shot, busy modern coffee shop, ..."
    }
  ]
}
```

### `POST /api/storyboard/render-panel`
Renders visual artwork for a single panel using the selected engine (`auto`, `svg`, `flux-docker`, or `flux-hf`). Returns `{ "imageUrl": "data:image/png;base64,...", "engine": "..." }` for FLUX.1 engines or `{ "svgMarkup": "<svg ...>...</svg>", "engine": "svg" }` for the vector renderer.

### `GET /api/capabilities`
Returns server configuration flags (`hasGemini`, `hasFluxDocker`, `hasHfFlux`) without exposing secrets.

### `GET /api/projects` · `POST /api/projects` · `DELETE /api/projects/:id`
Lists, saves/updates, and deletes persisted storyboard projects in `data/projects.json`.
