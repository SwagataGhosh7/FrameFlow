import base64
import io
import os
from typing import Optional

import torch
from diffusers import FluxPipeline
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="Frameflow FLUX.1 [schnell] Service")

MODEL_ID = os.getenv("FLUX_MODEL_ID", "black-forest-labs/FLUX.1-schnell")
ENABLE_CPU_OFFLOAD = os.getenv("FLUX_CPU_OFFLOAD", "true").lower() == "true"

_pipe: Optional[FluxPipeline] = None


def get_pipeline() -> FluxPipeline:
    global _pipe
    if _pipe is None:
        dtype = torch.bfloat16 if torch.cuda.is_available() else torch.float32
        pipe = FluxPipeline.from_pretrained(MODEL_ID, torch_dtype=dtype)
        if ENABLE_CPU_OFFLOAD and torch.cuda.is_available():
            pipe.enable_model_cpu_offload()
        elif torch.cuda.is_available():
            pipe.to("cuda")
        _pipe = pipe
    return _pipe


class GenerateRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=2000)
    width: int = Field(default=1024, ge=256, le=1536)
    height: int = Field(default=576, ge=256, le=1536)
    num_inference_steps: int = Field(default=4, ge=1, le=8)
    seed: int = Field(default=0)


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL_ID, "cuda": torch.cuda.is_available()}


@app.post("/generate")
def generate(req: GenerateRequest):
    try:
        pipe = get_pipeline()
        generator = torch.Generator("cpu").manual_seed(req.seed)
        result = pipe(
            req.prompt,
            width=req.width,
            height=req.height,
            guidance_scale=0.0,
            num_inference_steps=req.num_inference_steps,
            max_sequence_length=256,
            generator=generator,
        )
        image = result.images[0]
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        encoded = base64.b64encode(buffer.getvalue()).decode("utf-8")
        return {"imageBase64": encoded, "mimeType": "image/png"}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
