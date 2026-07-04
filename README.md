# 🧠 SLM Builder Studio

A step-by-step web studio for building a **Small Language Model for any topic or domain** — from first idea to a production deployment.

Answer a guided wizard (domain, task, data situation, hardware, deployment target) and the studio generates a **complete, customized, ready-to-run pipeline** (~20 files):

- **Data** — a curation plan with domain-specific dataset suggestions, ChatML JSONL schema, LLM synthetic-data prompts (taxonomy → questions → gold answers → quality filter), a resumable `generate_synthetic.py`, and a clean/dedup/split script.
- **Training** — your choice of build path (fine-tune, LLM distillation, continued pretraining, or from-scratch nanoGPT-style pretraining) and framework (Unsloth, Axolotl, or HF TRL), with sane hyperparameters, VRAM fit-checking, and optional DPO preference tuning.
- **Evaluation** — lm-evaluation-harness smoke tests, an LLM-as-judge scorer with ship gates, and a human-review plan with an error taxonomy.
- **Deployment** — GGUF export + quantization, Ollama Modelfile, vLLM serving, a FastAPI gateway with a feedback endpoint (the retraining flywheel), Dockerfile, Gradio demo, and a production scaling checklist.

Everything runs client-side in the browser — no backend, no data leaves the page. Download the generated project as a ZIP and follow `README_RUNBOOK.md`.

## Run it

- **Hosted (GitHub Pages)**: enable Pages for this repo (Settings → Pages → Source: *GitHub Actions*); the included workflow deploys automatically on pushes touching `slm-builder/`.
- **Locally**: just open `slm-builder/index.html` in a browser, or `python -m http.server` in this folder.

## Files

| File | Purpose |
|---|---|
| `index.html` / `styles.css` | App shell + UI |
| `app.js` | Wizard state & rendering |
| `gen.js` | Model catalog, VRAM/Chinchilla estimators, all pipeline-file generators, ZIP writer, markdown renderer |
| `RESEARCH.md` | The full research guide (also rendered in the app's "Research Guide" tab) |

## Research guide

`RESEARCH.md` is a comprehensive, self-contained guide to building SLMs in 2026: the four build paths and when to use each, the complete inputs checklist for training/building/scaling, data strategy and synthetic-data pipelines, the base-model landscape, training methods (QLoRA/LoRA/full, SFT/DPO/GRPO), from-scratch recipes (architecture, tokenizer, Chinchilla budgets, costs), evaluation discipline, deployment runtimes, and production operations.
