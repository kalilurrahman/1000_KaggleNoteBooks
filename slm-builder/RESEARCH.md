# Building Small Language Models from Scratch — The Complete Guide (2026)

This is the research companion to **SLM Builder Studio**. It covers everything you need to build, train, evaluate, deploy, and scale a Small Language Model (SLM) for any topic or domain — from a weekend Colab project to a production service.

---

## 1. What is an SLM and why build one?

A **Small Language Model** is a language model small enough to own end-to-end: typically **100M–7B parameters** (vs. hundreds of billions for frontier LLMs). The 2026 generation of small models (Qwen3, Phi-4-mini, Gemma 3, SmolLM3, Llama 3.2) is remarkably capable — a well fine-tuned 1–4B model routinely **beats frontier LLMs on a narrow domain** while being 100–1000× cheaper to run.

**Why an SLM instead of an API to a big model:**

- **Cost** — a 1.7B model serves thousands of requests/day on a $0.30/hr GPU or even a laptop CPU; frontier APIs cost 10–100× more at volume.
- **Privacy & control** — weights live on your hardware; no data leaves your infrastructure; no deprecations or silent behavior changes.
- **Latency** — local models answer in tens of milliseconds to first token; no network round-trip.
- **Specialization** — on a narrow task with good data, a tuned 3B model often outperforms a general 400B model. Depth beats breadth.
- **Edge deployment** — 0.3–2B models run on phones, browsers (WebGPU), Raspberry Pi-class devices.

**When NOT to build one:** you need broad world knowledge, complex multi-step reasoning across many domains, or you have < a few hundred examples and no way to generate more. Use a frontier API (or RAG on top of one) instead — or combine: SLM for the common 90%, LLM fallback for the hard 10%.

---

## 2. The four build paths — a decision framework

There are exactly four ways to get a domain SLM, in increasing order of cost:

| Path | What it is | Data needed | Compute | Cost | When to choose |
|---|---|---|---|---|---|
| **1. Fine-tune an existing SLM** | LoRA/QLoRA on a strong open base | 1K–50K instruction pairs | 1 GPU, hours | $0–20 | **Default.** You want domain behavior and the base model already "speaks" your domain's language |
| **2. Distill from an LLM teacher** | Frontier LLM generates your training set; small student learns from it | none to start | 1 GPU + API budget | $10–200 | You have zero data. This is how Phi and most domain SLMs are bootstrapped |
| **3. Continued pretraining (CPT) + SFT** | Feed GBs of raw domain text first, then fine-tune | 0.5–10B tokens of domain text | 1–8 GPUs, days | $50–2K | The domain has vocabulary/facts the base model lacks (niche law, low-resource language, proprietary systems) |
| **4. Pretrain from scratch** | Own architecture, own tokenizer, own corpus | ~20 tokens per parameter | 1–8+ GPUs, days–weeks | $50 (125M) – $10K+ (1B+) | Research, education, novel languages/tokenizers/formats, maximal control |

**Rules of thumb:**

- Start with path 1 or 2. You can always escalate. 95% of "we need our own model" projects are solved by QLoRA fine-tuning a 1–4B base on 5–20K good examples.
- Paths compose: real projects often do 2 (synthetic data) + 1 (fine-tune), or 3 + 2 + 1.
- Path 4 got dramatically cheaper: Karpathy's **nanochat** trains a GPT-2-class chat model end-to-end for ~$50–100 on 8×H100 spot instances. It is still the weakest path for quality-per-dollar on mainstream tasks.

---

## 3. The complete inputs checklist

Everything you should be prepared to provide (the Studio's wizard collects all of these):

### To define the model
- **Domain & topic focus** — the single highest-leverage input. "Legal" is OK; "Indian income-tax rules for salaried employees" is 10× better. Narrow = strong.
- **Task type** — assistant chat, Q&A/RAG, summarization, structured extraction (JSON), classification, code. Determines data format and eval design.
- **Tone/persona, languages, context length** — baked into the system prompt and training data.
- **Deployment target** — laptop CPU / single GPU / GPU server / mobile-edge. Constrains model size before you start.
- **Privacy constraints** — decides whether you can use hosted teacher APIs and what de-identification the data pipeline needs.

### To train
- **Existing data inventory** — documents, wikis, tickets, chat logs, FAQs, DB records, past Q&A. Even 50 real examples are gold for seeding synthetic generation.
- **Data quantity targets** — SFT: 1K–50K pairs (start 5–10K); preference pairs: 2K–20K; CPT corpus: 0.5B+ tokens; from-scratch: ~20× parameters in tokens.
- **A teacher model + API key** (paths 1–2) — Claude / OpenAI / a large open model via vLLM or OpenRouter.
- **Base model choice** — see the landscape table below; smallest that can pass your eval gate.
- **Compute** — free Colab/Kaggle T4 (QLoRA up to ~4B), a 24 GB consumer GPU, or cloud (A100/H100 at ~$1–3/hr).
- **Hyperparameters** — the defaults that almost always work: LoRA r=16 alpha=32, lr 2e-4 (LoRA) / 2e-5 (full), 2–3 epochs, effective batch 16–64, cosine schedule, warmup 3%, bf16, gradient checkpointing.

### To evaluate
- **A frozen held-out test set** (300–1000 examples) — created before training, never trained on, never regenerated.
- **Benchmark selection** — MMLU/HellaSwag/ARC as a catastrophic-forgetting smoke test; domain benchmarks if they exist.
- **A judge model + rubric** — correctness / helpfulness / style, 1–5; ship gate ≥ 4.0 and ≥ base+0.5.
- **A domain expert** for periodic human review (25 answers/month minimum).

### To scale
- **Traffic expectations** — requests/day, concurrency, latency budget (p95).
- **Serving infra** — Ollama (personal/team) → vLLM (production) → replicated vLLM behind a load balancer.
- **Feedback capture** — thumbs up/down + corrections endpoints; this feeds the retraining flywheel.
- **Versioning & cadence** — dataset snapshots, adapter/GGUF versions, monthly retrain cadence, stable eval set across versions.

---

## 4. Data — 80% of the outcome

### Quality beats quantity

The LIMA result stands: **~1,000 excellent, diverse examples beat 50,000 mediocre ones.** Spend your time on curation, not accumulation. Concretely, an "excellent" example is: factually correct, in your target tone, formatted the way you want answers formatted, and covering a real situation your users will hit.

### Where data comes from

| Source | Value | Notes |
|---|---|---|
| Synthetic from an LLM teacher | Very high | The workhorse. Taxonomy → questions → gold answers → self-critique filter |
| Expert-written examples | Highest per example | 50–200 SME-written pairs anchor style and correctness; use them as few-shot seeds for the teacher |
| Real user text (tickets, chats, emails) | High | Real phrasing and edge cases; de-identify ruthlessly |
| Internal docs (wikis, manuals, PDFs) | High | Convert to Q&A with the teacher; also the CPT corpus |
| Public datasets (Hugging Face) | Medium-high | smoltalk, tulu-3-sft-mixture, OpenHermes-2.5 for general ability; domain sets per field |
| Web scrapes | Medium | License and quality audit required |

### The synthetic pipeline (distillation) that actually works

1. **Taxonomy** — teacher lists 50–80 subtopics of your domain, beginner → expert. This forces coverage; naive "generate 10,000 questions" collapses into repetitive clusters.
2. **Question generation per subtopic** — explicitly vary persona (novice/practitioner/manager/skeptic), length, formality, typos (~10%), requested format, difficulty (40/40/20 easy/medium/hard). Include ~1 in 15 out-of-scope requests to teach refusals.
3. **Gold answers** — teacher answers with your exact system prompt plus "produce GOLD-STANDARD training answers" instructions.
4. **Self-critique filter** — teacher rates each pair on correctness/helpfulness/completeness/style; drop anything scoring < 4. Expect to discard 20–40%.
5. **Dedup & decontaminate** — exact dedup on normalized questions minimum (MinHash for near-dupes at scale); remove anything overlapping the eval set.
6. **Pilot first** — generate 500, read 50 of them yourself, fix the prompts, then scale. $10 of pilot saves $200 of garbage.

### Format

The ecosystem standard is **ChatML-style messages in JSONL** — one JSON object per line with a `messages` array of system/user/assistant turns. Every framework (Unsloth, Axolotl, TRL) consumes it directly. Always train with **loss masked on prompt tokens** (learn from assistant turns only).

### How much data per goal

| Goal | SFT pairs |
|---|---|
| Style/tone/format adaptation | 500–2K |
| Focused domain assistant | 5–20K |
| Broad domain expert | 20–100K |
| Preference tuning (DPO) on top | 2–20K pairs |
| CPT for missing domain knowledge | 0.5–10B tokens (~2–40 GB text) |

---

## 5. Base model landscape (2026)

| Model | Params | License | Context | Distinguishing strength |
|---|---|---|---|---|
| Qwen3-0.6B / 1.7B / 4B | 0.6–4B | Apache-2.0 | 32K | Best all-round family; 100+ languages; hybrid reasoning mode |
| Llama-3.2-1B / 3B | 1.2–3.2B | Llama (gated) | 128K | Biggest ecosystem; long context |
| SmolLM2-360M / SmolLM3-3B | 0.36–3B | Apache-2.0 | 8–64K | Fully open training recipe & data; SmolLM3 beats same-size peers |
| Gemma-3-1B / 4B | 1–4.3B | Gemma | 32–128K | Efficient; 4B is multimodal (images); strong coding |
| Phi-4-mini | 3.8B | MIT | 128K | Best 3–4B reasoning/math; "textbook-quality" pretraining |
| TinyLlama-1.1B | 1.1B | Apache-2.0 | 2K | Older budget classic, superbly documented |

**Choosing:** (1) filter by license — Apache-2.0/MIT are safest for products; (2) filter by deploy target — edge ≤ 0.6B, laptop ≤ 2B, GPU ≤ 4B; (3) prefer Qwen3 for multilingual, Phi-4-mini for reasoning, Gemma-3-4B for vision, SmolLM3 for full openness; (4) pick the **smallest model that passes your eval gate** — try 1.7B before 4B.

---

## 6. Training

### Methods

| Method | What trains | VRAM per 1B params | Quality | Use when |
|---|---|---|---|---|
| **QLoRA** | 4-bit frozen base + LoRA adapters | ~1.5 GB | ~98–99% of full FT | Default. Free Colab T4 handles ≤4B |
| **LoRA** | bf16 frozen base + adapters | ~2.5 GB | ~99% | You have the VRAM |
| **Full FT** | every weight, bf16 + Adam | ~16 GB | 100% (ceiling) | Small models, big data, max quality |

LoRA intuition: instead of updating a huge weight matrix W, learn a low-rank delta B·A (rank r=8–64). That's <1% of parameters, which is why it's cheap — and why it barely forgets general skills.

### The modern post-training pipeline

1. **SFT** (always) — imitate gold answers. 2–3 epochs, lr 2e-4 (LoRA), cosine, warmup 3%, effective batch 16–64, loss on responses only.
2. **DPO / ORPO** (usually worth it) — learn preferences from chosen-vs-rejected pairs; fixes style, judgment, over/under-refusal. lr ~5e-6, beta 0.1, 1 epoch. ORPO merges SFT+DPO into one stage if you want simplicity.
3. **GRPO** (advanced, for verifiable tasks) — RL with programmatic rewards (unit tests pass, exact answer match). This is the DeepSeek-R1 recipe scaled down; TRL's `GRPOTrainer` implements it.

### Frameworks

| Framework | Best for | Notes |
|---|---|---|
| **Unsloth** | Single-GPU speed | 2–5× faster, ~70% less VRAM via Triton kernels; Colab-friendly |
| **Axolotl** | YAML configs, multi-GPU | DeepSpeed/FSDP; the community-recipes standard |
| **HF TRL** | Transparency, hackability | SFTTrainer/DPOTrainer/GRPOTrainer; plain Python |
| **litgpt** | From-scratch & pretraining at scale | 20+ architectures, pretrain→finetune→deploy |
| **nanoGPT / nanochat** | Learning + cheap scratch builds | Readable; nanochat = full ChatGPT-clone pipeline for ~$100 |
| **MLX-LM** | Apple Silicon | Train/serve on Mac unified memory |

### From-scratch specifics (path 4)

- **Architecture** — decoder-only Transformer; standard shapes: 125M ≈ 12 layers × 768 dim × 12 heads; 350M ≈ 24×1024; 1B ≈ 24×2048. Modern upgrades: RoPE, SwiGLU, RMSNorm, GQA (all standard in litgpt/nanochat).
- **Tokenizer** — train your own BPE (32K vocab is the small-model sweet spot) on your corpus. Custom tokenizers shine for niche languages/notations (music, DNA, logs).
- **Token budget (Chinchilla)** — compute-optimal is ~20 tokens per parameter; for deployment-optimal small models, over-train well past that (SmolLM2-1.7B saw ~11T tokens). Floor: 125M model → ≥2.5B tokens ≈ 10 GB text.
- **Recipe** — AdamW (β=0.9/0.95, wd 0.1), peak lr ~6e-4 (125M) down to ~2e-4 (1B), 2K-step warmup, cosine decay to 10%, grad clip 1.0, bf16, ~0.5M tokens per effective batch. Loss spikes → lower lr or check data; loss plateau at high value → data too small/repetitive.
- **Cost reality (2026)** — 125M: ~$30–80; 350M: ~$150–400; 1B: ~$1–3K; 3B: ~$10K+. Rent H100s spot (~$2/hr each) and checkpoint aggressively.

### Hardware quick reference

| Setup | Can train |
|---|---|
| Free Colab/Kaggle T4 (16 GB) | QLoRA up to ~4B @ 2K seq |
| RTX 3090/4090 (24 GB) | QLoRA 7B; LoRA 4B; full FT ≤ 1B; scratch ≤ ~350M |
| A100 80 GB | Full FT ≤ 4B; scratch ≤ ~1B (patience required) |
| 8× H100 node | Scratch 1–3B in days; anything smaller trivially |
| Apple M-series 32–128 GB | MLX LoRA up to 7B (slower but free) |

---

## 7. Evaluation — the discipline that separates toys from products

**Layer 1 — automatic (every run):** validation loss during training; **lm-evaluation-harness** on MMLU + HellaSwag + ARC comparing tuned vs. base model. A drop > 5 points on general benchmarks = catastrophic forgetting → lower epochs/lr, or mix 10–20% general data into training.

**Layer 2 — domain test set + LLM judge (every run):** a frozen held-out set (300–1000 examples). A strong judge model scores each answer 1–5 on correctness / helpfulness / style. **Ship gate: mean ≥ 4.0 AND ≥ base-model score + 0.5.** Always score the base model once — without the baseline, your score means nothing.

**Layer 3 — human (before first ship, then monthly):** a domain expert reviews 25 random answers with an error taxonomy (factual, stale-knowledge, format, over-refusal, under-refusal, hallucinated citation); 20 adversarial prompts (prompt injection, out-of-scope, PII fishing); latency p50/p95 on target hardware.

**Cardinal rules:** freeze the test set before training and never regenerate it; never let the judge model also be the teacher that wrote the test answers being compared against (or sanity-check with a second judge); track scores across versions.

---

## 8. Deployment

### Quantization (GGUF)

Convert the merged model with llama.cpp's `convert_hf_to_gguf.py`, then quantize:

| Quant | Bits/weight | Quality | Use |
|---|---|---|---|
| Q4_K_M | ~4.5 | ~97–99% | **Default** — community standard |
| Q5_K_M | ~5.5 | ~99% | When Q4 shows regressions in judge scores |
| Q8_0 | 8 | ~99.9% | Near-lossless; 2× size |

A 1.7B model at Q4_K_M is a ~1.1 GB file that runs at 20–60 tok/s on a laptop CPU.

### Runtimes

| Runtime | Best for |
|---|---|
| **Ollama** | Easiest local/team serving; `ollama create` from a Modelfile with your system prompt baked in; OpenAI-compatible API |
| **llama.cpp server** | Minimal footprint, CPU/GPU/edge, embedded |
| **vLLM** | Production GPU serving: continuous batching, prefix caching, high throughput; the industry default |
| **ONNX Runtime / ExecuTorch** | Mobile & browser |
| **MLX** | Apple Silicon |

### Production architecture

`user → API gateway (auth, system prompt, logging, feedback) → model server (vLLM) → GPU`

The gateway is where production value lives: request/response logging (redact PII), latency and token metrics, rate limits, and a **/feedback endpoint** capturing 👍/👎 and corrections.

---

## 9. Scaling and operating in production

- **Load tiers** — personal: Ollama on the box; team (≤20 concurrent): one 24 GB GPU + vLLM; product: 2+ vLLM replicas behind a load balancer, autoscale on queue depth; edge: ship the GGUF with the app.
- **Performance** — measure time-to-first-token and tokens/sec at expected concurrency before launch; enable prefix caching (shared system prompt becomes nearly free); sweep Q4 vs Q5 vs Q8 against judge scores.
- **Observability** — dashboards for QPS, p50/p95 latency, error rate, GPU utilization; weekly review of 50 random conversations tagged with the error taxonomy.
- **The retraining flywheel (the real moat)** — weekly: export feedback, curate corrections into the dataset (corrections make perfect DPO pairs: rejected = model output, chosen = correction); monthly or per 500 new curated examples: retrain → eval gates → deploy. Version everything: dataset snapshot + adapter + GGUF as `name-vYYYY.MM`, evaluated against the same frozen test set so scores are comparable.
- **Safety & compliance** — input/output PII filters, prompt-injection cases in the adversarial set, license audit (base model + every dataset), model card documenting intended use and limitations.

---

## 10. Cost cheat sheet (typical, 2026 prices)

| Project | Total cost |
|---|---|
| Fine-tune 1.7B on 10K synthetic examples (Colab + API teacher) | $10–50 |
| Fine-tune 4B on 50K examples (rented A100, ~6 hrs) | $30–100 |
| CPT 1B tokens + SFT on 3B model | $100–500 |
| From-scratch 125M (nanoGPT-style) | $30–80 |
| From-scratch 1B chat model (nanochat-style, 8×H100 spot) | $800–3K |
| Serving, 100K requests/day on one L4 | ~$200–400/mo |
| Serving on a laptop / existing hardware | $0 |

---

## 11. Key references

- Unsloth docs — https://docs.unsloth.ai (fine-tuning guides, Colab notebooks)
- Axolotl — https://axolotl.ai · TRL — https://huggingface.co/docs/trl
- nanoGPT — https://github.com/karpathy/nanoGPT · nanochat — https://github.com/karpathy/nanochat
- litgpt — https://github.com/Lightning-AI/litgpt
- SmolLM3 (fully open recipe) — https://huggingface.co/blog/smollm3
- llama.cpp — https://github.com/ggml-org/llama.cpp · vLLM — https://docs.vllm.ai · Ollama — https://ollama.com
- lm-evaluation-harness — https://github.com/EleutherAI/lm-evaluation-harness
- Papers: *Chinchilla* (Hoffmann 2022, token budgets) · *LIMA* (Zhou 2023, quality > quantity) · *QLoRA* (Dettmers 2023) · *DPO* (Rafailov 2023) · *Textbooks Are All You Need* (Phi, Gunasekar 2023) · *DeepSeek-R1* (2025, GRPO)

---

*Generated as part of SLM Builder Studio — use the Builder tab to turn these principles into a ready-to-run pipeline for your domain.*
