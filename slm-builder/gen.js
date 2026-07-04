/* ============================================================================
 * SLM Builder Studio — gen.js
 * Model catalog, hardware estimators, artifact generators, zip writer,
 * and a minimal markdown renderer. Everything is pure client-side.
 * ==========================================================================*/

"use strict";

const F = "```"; // markdown fence, kept out of template literals

/* ----------------------------- Catalogs ---------------------------------- */

const MODELS = [
  { id: "qwen3-0.6b",   hf: "Qwen/Qwen3-0.6B",                    params: 0.6, ctx: 32768,  lic: "Apache-2.0", note: "Best tiny all-rounder; hybrid thinking mode; 100+ languages." },
  { id: "qwen3-1.7b",   hf: "Qwen/Qwen3-1.7B",                    params: 1.7, ctx: 32768,  lic: "Apache-2.0", note: "Sweet spot of quality vs. cost for most domain assistants." },
  { id: "qwen3-4b",     hf: "Qwen/Qwen3-4B",                      params: 4.0, ctx: 32768,  lic: "Apache-2.0", note: "Near 7B-class quality; strongest Apache-licensed pick ≤4B." },
  { id: "llama-3.2-1b", hf: "meta-llama/Llama-3.2-1B-Instruct",   params: 1.2, ctx: 131072, lic: "Llama 3.2",  note: "Great ecosystem support; 128K context; gated license." },
  { id: "llama-3.2-3b", hf: "meta-llama/Llama-3.2-3B-Instruct",   params: 3.2, ctx: 131072, lic: "Llama 3.2",  note: "Strong general 3B; huge tooling ecosystem." },
  { id: "smollm2-360m", hf: "HuggingFaceTB/SmolLM2-360M-Instruct", params: 0.36, ctx: 8192, lic: "Apache-2.0", note: "Ultra-small; runs on almost anything, incl. browsers/edge." },
  { id: "smollm3-3b",   hf: "HuggingFaceTB/SmolLM3-3B",           params: 3.0, ctx: 65536,  lic: "Apache-2.0", note: "Fully open training pipeline & data recipe; dual reasoning modes." },
  { id: "gemma-3-1b",   hf: "google/gemma-3-1b-it",               params: 1.0, ctx: 32768,  lic: "Gemma",      note: "Efficient; excellent quantization-aware checkpoints." },
  { id: "gemma-3-4b",   hf: "google/gemma-3-4b-it",               params: 4.3, ctx: 131072, lic: "Gemma",      note: "Multimodal (image+text); strong coding for its size." },
  { id: "phi-4-mini",   hf: "microsoft/Phi-4-mini-instruct",      params: 3.8, ctx: 131072, lic: "MIT",        note: "Top 3–4B reasoning/math; MIT licensed; textbook-quality pretraining." },
  { id: "tinyllama-1.1b", hf: "TinyLlama/TinyLlama-1.1B-Chat-v1.0", params: 1.1, ctx: 2048, lic: "Apache-2.0", note: "Classic budget baseline; older but very well documented." },
];

const GPUS = [
  { id: "t4",     name: "NVIDIA T4 (16 GB) — free Colab/Kaggle", vram: 16 },
  { id: "l4",     name: "NVIDIA L4 (24 GB) — Colab Pro / cloud", vram: 24 },
  { id: "rtx4090",name: "RTX 3090/4090 (24 GB) — consumer",      vram: 24 },
  { id: "a100-40",name: "A100 40 GB — cloud",                    vram: 40 },
  { id: "a100-80",name: "A100/H100 80 GB — cloud",               vram: 80 },
  { id: "multi",  name: "Multi-GPU node (2–8× A100/H100)",       vram: 320 },
  { id: "mac",    name: "Apple Silicon (MLX, 16–128 GB unified)",vram: 32 },
];

const TEACHERS = {
  claude:   { name: "Claude (Anthropic API)", model: "claude-sonnet-4-5", api: "anthropic" },
  gpt:      { name: "OpenAI API",             model: "gpt-4.1",           api: "openai" },
  qwen:     { name: "Open teacher via vLLM/OpenRouter (Qwen3-235B / DeepSeek-V3)", model: "qwen/qwen3-235b-a22b", api: "openai" },
};

const DOMAIN_DATASET_HINTS = {
  sports:   ["cricsheet.org — ball-by-ball data for every international & IPL match (open license)", "Kaggle: IPL, ODI/T20/Test match & player-stats datasets", "mandarjoshi/trivia_qa + openbookqa (HF) — quiz-style QA to mine for format", "Wikipedia sports portals (dumps are CC BY-SA) for facts & records"],
  legal:    ["pile-of-law/pile-of-law (256GB legal corpus)", "casehold/casehold", "lexlms/lex_files", "joelniklaus/legal_case_document_summarization"],
  medical:  ["epfl-llm/guidelines (clinical guidelines)", "medalpaca/medical_meadow_* datasets", "qiaojin/PubMedQA", "bigbio/* biomedical suites"],
  finance:  ["gbharti/finance-alpaca", "PatronusAI/financebench", "Josephgflowers/Finance-Instruct-500k", "sujet-ai/Sujet-Finance-Instruct-177k"],
  code:     ["bigcode/the-stack-v2 (filtered by language)", "ise-uiuc/Magicoder-Evol-Instruct-110K", "nvidia/OpenCodeInstruct"],
  support:  ["bitext/Bitext-customer-support-llm-chatbot-training-dataset", "your ticket/chat exports (Zendesk, Intercom, Freshdesk)"],
  education:["HuggingFaceTB/smollm-corpus (cosmopedia)", "allenai/tulu-3-sft-mixture (filtered)", "openbmb/UltraInteract_sft"],
  science:  ["allenai/peS2o (academic papers)", "millawell/wikipedia_field_of_science", "derek-thomas/ScienceQA"],
  ecommerce:["Amazon ESCI (shopping queries)", "product catalogs + review exports", "NingLab/ECInstruct"],
  general:  ["HuggingFaceTB/smoltalk (1M curated SFT)", "allenai/tulu-3-sft-mixture", "teknium/OpenHermes-2.5", "argilla/distilabel-* preference sets"],
};

/* ----------------------------- Estimators -------------------------------- */

function fmtNum(n) {
  if (n >= 1e12) return (n / 1e12).toFixed(1) + "T";
  if (n >= 1e9)  return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6)  return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3)  return (n / 1e3).toFixed(1) + "K";
  return String(Math.round(n));
}

// Rough VRAM (GB) needed to train `paramsB` billion params with a given method.
function vramNeeded(paramsB, method, seqLen) {
  const act = Math.max(1, (seqLen / 2048) * paramsB * 0.9); // activation ballpark w/ grad ckpt
  if (method === "qlora") return paramsB * 0.75 + 1.2 * paramsB * 0.1 + act + 1.5;
  if (method === "lora")  return paramsB * 2.0 + act + 2.0;
  return paramsB * 16 + act + 2.0; // full: bf16 weights+grads + fp32 Adam states
}

// Rough VRAM (GB) to serve a model at 4-bit.
function vramServe(paramsB) { return paramsB * 0.7 + 1.0; }

// From-scratch architecture from a parameter target (millions).
function scratchArch(paramsM) {
  // Standard GPT shapes; d_model grows with size, head_dim ~64, ffn = 4x.
  const shapes = [
    { maxM: 20,   layers: 6,  d: 384,  heads: 6 },
    { maxM: 60,   layers: 8,  d: 512,  heads: 8 },
    { maxM: 130,  layers: 12, d: 768,  heads: 12 },
    { maxM: 220,  layers: 16, d: 1024, heads: 16 },
    { maxM: 420,  layers: 24, d: 1024, heads: 16 },
    { maxM: 700,  layers: 24, d: 1536, heads: 16 },
    { maxM: 1200, layers: 24, d: 2048, heads: 16 },
    { maxM: 2200, layers: 32, d: 2304, heads: 24 },
  ];
  const s = shapes.find(x => paramsM <= x.maxM) || shapes[shapes.length - 1];
  const vocab = 32768;
  const embed = vocab * s.d;
  const perLayer = 12 * s.d * s.d; // attn (4d²) + mlp (8d²)
  const actual = (embed + s.layers * perLayer) / 1e6;
  return { ...s, vocab, actualM: Math.round(actual) };
}

// Chinchilla-style token budget: ~20 tokens per parameter (25 for small models).
function tokenBudget(paramsM) {
  const mult = paramsM < 200 ? 25 : 20;
  const tokens = paramsM * 1e6 * mult;
  return { tokens, mult, textGB: tokens * 4 / 1e9 }; // ~4 bytes/token raw text
}

function pickModel(id) { return MODELS.find(m => m.id === id) || MODELS[1]; }
function pickGpu(id) { return GPUS.find(g => g.id === id) || GPUS[2]; }

/* ---------------------------------------------------------------------------
 * Artifact generators. Each returns {path, group, content}.
 * S = full wizard state (see app.js DEFAULTS).
 * -------------------------------------------------------------------------*/

function ctxSummary(S) {
  const dom = S.domain === "custom" ? (S.domainText || "general") : S.domain;
  return { dom, topic: S.topic || dom, model: pickModel(S.baseModel) };
}

function sysPrompt(S) {
  const { dom } = ctxSummary(S);
  const taskLine = {
    assistant: `You are a helpful, expert assistant specialized in ${dom}${S.topic ? ` — specifically ${S.topic}` : ""}.`,
    qa: `You are a precise question-answering system for ${dom}${S.topic ? ` (${S.topic})` : ""}. Answer only from provided context when given; say "I don't know" when unsure.`,
    summarization: `You are an expert summarizer for ${dom} content${S.topic ? ` about ${S.topic}` : ""}. Produce faithful, concise summaries.`,
    extraction: `You extract structured data from ${dom} text${S.topic ? ` about ${S.topic}` : ""}. Always respond with valid JSON matching the requested schema.`,
    classification: `You classify ${dom} text${S.topic ? ` about ${S.topic}` : ""} into the given label set. Respond with the label only.`,
    code: `You are an expert coding assistant for ${dom}${S.topic ? ` (${S.topic})` : ""}. Produce correct, idiomatic, well-commented code.`,
    quiz: `You are a quiz master for ${dom}${S.topic ? ` — specifically ${S.topic}` : ""}. When asked for a question, respond ONLY with valid JSON: {"question": "...", "options": ["...", "...", "...", "..."], "answer_index": 0, "difficulty": "easy"|"medium"|"hard", "explanation": "..."}. When the user submits an answer, say whether it is correct, give the explanation, then offer the next question. Never invent facts — every question must be verifiably true.`,
  }[S.task] || `You are a helpful assistant specialized in ${dom}.`;
  const tone = S.tone ? ` Maintain a ${S.tone} tone.` : "";
  const lang = S.languages && S.languages.toLowerCase() !== "english" ? ` Respond in ${S.languages} unless asked otherwise.` : "";
  return taskLine + tone + lang;
}

/* ------------------------------ runbook ---------------------------------- */

function genRunbook(S) {
  const { dom, model } = ctxSummary(S);
  const pathNames = { finetune: "Fine-tune an existing SLM", distill: "Distill an LLM teacher into an SLM", cpt: "Continued pretraining + fine-tune", scratch: "Pretrain from scratch" };
  const arch = scratchArch(S.scratchParams);
  const tb = tokenBudget(S.scratchParams);
  const gpu = pickGpu(S.hw);
  const need = vramNeeded(S.path === "scratch" ? arch.actualM / 1000 : model.params, S.method, S.seqLen);

  const scratchBlock = S.path === "scratch" ? `
### From-scratch architecture (auto-derived)

| Setting | Value |
|---|---|
| Target size | ~${arch.actualM}M params |
| Layers / d_model / heads | ${arch.layers} / ${arch.d} / ${arch.heads} |
| Vocab (custom BPE) | ${arch.vocab.toLocaleString()} |
| Token budget (Chinchilla ~${tb.mult}×) | ${fmtNum(tb.tokens)} tokens (~${tb.textGB.toFixed(0)} GB raw text) |

Run order: \`tokenizer_train.py\` → \`pretrain_scratch.py\` → \`train_sft.py\` (or your framework config).
` : "";

  return `# ${S.name} — SLM build runbook

Generated by SLM Builder Studio. This runbook, plus the sibling files, is a complete
pipeline to build a Small Language Model for **${dom}**${S.topic ? ` (focus: ${S.topic})` : ""}.

## Overview

| | |
|---|---|
| Task type | ${S.task} |
| Build path | ${pathNames[S.path]} |
| Base model | ${S.path === "scratch" ? `custom ~${arch.actualM}M GPT (from scratch)` : `${model.hf} (${model.params}B, ${model.lic})`} |
| Training method | ${S.method.toUpperCase()} via ${S.framework} |
| Stages | SFT${S.stageDpo ? " → DPO (preference tuning)" : ""}${S.stageGrpo ? " → GRPO (verifiable-reward RL)" : ""} |
| Hardware | ${gpu.name} — est. ${need.toFixed(0)} GB VRAM needed |
| Context length | ${S.seqLen} tokens (train) / ${S.contextLen} (target) |
| Deployment | ${S.runtime} @ ${S.quant.toUpperCase()} quant |

## Step-by-step

1. **Environment** — Python 3.10+, CUDA GPU. \`pip install -r requirements.txt\`.
2. **Collect data** — see \`data/DATA_PLAN.md\`. Put raw text in \`data/raw/\`, curated
   examples in \`data/sft_raw.jsonl\` (schema in \`data/sample.jsonl\`).
3. **Generate synthetic data** (recommended${S.path === "distill" ? ", core of the distillation path" : ""}) —
   \`python data/generate_synthetic.py --n ${S.sftCount}\` using the prompts in \`data/synthetic_prompts.md\`.
4. **Clean & split** — \`python data/prepare_data.py\` → \`data/train.jsonl\`, \`data/val.jsonl\`, \`data/test.jsonl\`.
${S.path === "scratch" ? `5. **Tokenizer** — \`python training/tokenizer_train.py\`.
6. **Pretrain** — \`python training/pretrain_scratch.py\` (${fmtNum(tb.tokens)} tokens target).
7. **SFT** — run the training entry point in \`training/\`.` :
S.path === "cpt" ? `5. **Continued pretraining** — \`python training/pretrain_cpt.py\` on your domain corpus (${S.cptTokens}B tokens).
6. **SFT** — run the training entry point in \`training/\`.` :
`5. **Train (SFT)** — run the training entry point in \`training/\` (script or config for ${S.framework}).`}
${S.stageDpo ? `8. **Preference tuning** — build ~${fmtNum(S.prefCount)} chosen/rejected pairs, then \`python training/train_dpo.py\`.` : ""}
9. **Evaluate** — \`eval/EVAL_PLAN.md\`; run \`bash eval/run_lm_eval.sh\` and \`python eval/llm_judge.py\`. Gate on the pass criteria before shipping.
10. **Export & deploy** — \`bash deploy/export_gguf.sh\` then serve via ${S.runtime} (see \`deploy/\`). Wrap with \`deploy/app_fastapi.py\` + \`deploy/Dockerfile\` for production.
11. **Operate** — log prompts/latency, collect thumbs-up/down, fold corrections back into the dataset, retrain on a cadence (monthly is a good default).
${scratchBlock}
## System prompt baked into training data

> ${sysPrompt(S)}

## Quality gates (edit to taste)

- [ ] Val loss decreased and did not diverge; no catastrophic forgetting on the general smoke set
- [ ] LLM-judge score ≥ 4.0/5 average on the ${S.evalHoldout}-example held-out test set
- [ ] Domain accuracy ≥ baseline (the un-tuned base model) + 10 points
- [ ] p95 latency within budget on ${gpu.name.split("—")[0].trim()} at ${S.quant.toUpperCase()}
- [ ] Refusal/safety spot-check passed (20 adversarial prompts)
`;
}

/* ------------------------------ requirements ------------------------------ */

function genRequirements(S) {
  const lines = [
    "# Core",
    "torch>=2.4.0",
    "transformers>=4.51.0",
    "datasets>=3.0.0",
    "accelerate>=1.0.0",
    "sentencepiece",
    "huggingface_hub",
  ];
  if (S.method !== "full") lines.push("peft>=0.14.0", "bitsandbytes>=0.45.0");
  if (S.framework === "trl" || S.stageDpo || S.stageGrpo) lines.push("trl>=0.17.0");
  if (S.framework === "unsloth") lines.push("# Unsloth (install per https://docs.unsloth.ai):", "unsloth");
  if (S.framework === "axolotl") lines.push("# Axolotl (install per https://axolotl.ai):", "# pip install axolotl[flash-attn,deepspeed]");
  lines.push("", "# Data generation & eval");
  lines.push(S.teacher === "claude" ? "anthropic>=0.40.0" : "openai>=1.60.0");
  lines.push("lm-eval>=0.4.5", "", "# Serving / demo", "fastapi", "uvicorn", "gradio");
  if (S.tracking === "wandb") lines.push("wandb");
  return lines.join("\n") + "\n";
}

/* ------------------------------ data plan --------------------------------- */

function genDataPlan(S) {
  const { dom } = ctxSummary(S);
  const hints = DOMAIN_DATASET_HINTS[S.domain] || DOMAIN_DATASET_HINTS.general;
  const tb = tokenBudget(S.scratchParams);
  const srcList = (S.sources || []).map(s => `- [ ] ${s}`).join("\n") || "- [ ] (select sources in the Builder)";

  return `# Data plan — ${S.name}

Domain: **${dom}**${S.topic ? ` · Focus: ${S.topic}` : ""} · Task: **${S.task}**

## Targets

| Stage | Quantity | Notes |
|---|---|---|
| SFT examples | ${fmtNum(S.sftCount)} | instruction/response pairs, ChatML JSONL |
${S.stageDpo ? `| Preference pairs | ${fmtNum(S.prefCount)} | chosen vs. rejected responses |\n` : ""}${S.path === "cpt" ? `| Domain corpus (CPT) | ${S.cptTokens}B tokens (~${(S.cptTokens * 4).toFixed(0)} GB text) | raw domain text, deduplicated |\n` : ""}${S.path === "scratch" ? `| Pretraining corpus | ${fmtNum(tb.tokens)} tokens (~${tb.textGB.toFixed(0)} GB text) | Chinchilla ~${tb.mult}× params |\n` : ""}| Held-out eval | ${S.evalHoldout} | never trained on; frozen test set |

**Quality beats quantity.** 1,000 excellent, diverse, correct examples outperform 50,000
scraped mediocre ones (this is the LIMA finding). Budget most of your time on curation.

## Your selected sources

${srcList}

## Public datasets worth mining for "${dom}"

${hints.map(h => `- ${h}`).join("\n")}
- Browse: https://huggingface.co/datasets?search=${encodeURIComponent(dom)}

## Format (ChatML-style JSONL — one object per line)

${F}json
{"messages": [
  {"role": "system", "content": "${sysPrompt(S).replace(/"/g, '\\"')}"},
  {"role": "user", "content": "<realistic ${dom} question or task>"},
  {"role": "assistant", "content": "<ideal expert answer>"}
]}
${F}

## Curation checklist

- [ ] **Coverage**: enumerate 30–80 subtopics of ${S.topic || dom}; ensure every subtopic has examples
- [ ] **Difficulty mix**: ~40% easy, 40% medium, 20% hard/edge-case
- [ ] **Diversity of phrasing**: same intent asked many ways (typos, terse, verbose, indirect)
- [ ] **Negative examples**: out-of-scope questions with polite refusals/redirects (~5–10%)
- [ ] **Groundedness**: for QA, include context-in-prompt examples so the model learns to cite/limit itself
- [ ] **De-identification**: strip PII/customer data${S.privacy ? " (required — privacy constraint set)" : ""}
- [ ] **Dedup**: exact + near-duplicate removal (prepare_data.py does exact; consider MinHash for near)
- [ ] **Decontamination**: remove anything overlapping your eval set
- [ ] **License audit**: confirm each source permits model training and your intended distribution
`;
}

function genSampleJsonl(S) {
  const sp = sysPrompt(S);
  const { dom } = ctxSummary(S);
  const mk = (u, a) => JSON.stringify({ messages: [
    { role: "system", content: sp },
    { role: "user", content: u },
    { role: "assistant", content: a },
  ]});
  if (S.task === "quiz") {
    return [
      mk(`Give me a medium question about ${S.topic || dom}.`,
         JSON.stringify({ question: `<a real, verifiable ${dom} question>`, options: ["<option A>", "<option B>", "<option C>", "<option D>"], answer_index: 2, difficulty: "medium", explanation: "<one-sentence explanation of why the answer is correct>" })),
      mk(`My answer is B.`,
         `Not quite — the correct answer was C. <repeat the explanation, add one fun fact>. Ready for the next one? Pick easy, medium, or hard.`),
      mk(`Ask me something about <clearly unrelated topic>.`,
         `I'm your ${S.topic || dom} quiz master, so that one's outside my wheelhouse — but I've got plenty more ${dom} questions. Want an easy, medium, or hard one?`),
    ].join("\n") + "\n";
  }
  return [
    mk(`Give me a quick overview of the most important concepts in ${S.topic || dom}.`,
       `Here are the core concepts, in the order they usually matter: ... (replace with a genuine expert answer for your domain)`),
    mk(`I ran into this specific problem: <realistic ${dom} scenario>. What should I do?`,
       `Let's work through it step by step: 1) ... 2) ... 3) ... (replace with a correct, grounded answer)`),
    mk(`Is this in scope for you: <clearly unrelated request>?`,
       `That's outside what I specialize in (${S.topic || dom}). For that topic I'd recommend a general-purpose assistant — but if you have any question about ${S.topic || dom}, I'm glad to help.`),
  ].join("\n") + "\n";
}

/* --------------------------- synthetic prompts ---------------------------- */

function genSyntheticPrompts(S) {
  const { dom } = ctxSummary(S);
  const t = TEACHERS[S.teacher] || TEACHERS.claude;
  return `# Synthetic data prompts — ${S.name}

Teacher: **${t.name}** (\`${t.model}\`). Used by \`generate_synthetic.py\`.
Pipeline: taxonomy → questions per subtopic → expert answers → self-critique filter.

## 1) Taxonomy prompt (run once)

${F}
You are designing a training curriculum for an expert assistant in ${dom}${S.topic ? `, focused on ${S.topic}` : ""}.
List 50 distinct subtopics a real practitioner would ask about, from beginner to expert.
For each subtopic add 3 concrete example situations. Output as a JSON array:
[{"subtopic": "...", "situations": ["...", "...", "..."]}]
Be exhaustive and practical — cover edge cases, failure modes, regulations/constraints,
tooling, and common misconceptions specific to ${dom}.
${F}

## 2) Question-generation prompt (per subtopic batch)

${F}
Generate {N} diverse user messages about the subtopic "{SUBTOPIC}" in ${dom}.
Vary ALL of the following across the set:
- persona (novice, practitioner, manager, skeptic)
- length (5 words to 3 paragraphs), formality, and typos in ~10%
- format asked for (explanation, checklist, table, step-by-step, JSON${S.task === "code" ? ", code" : ""})
- difficulty (easy 40% / medium 40% / hard 20%)
Include 1 out-of-scope or unsafe request per 15 (to teach refusals).
Output JSON array of strings only.
${F}

## 3) Answer-generation prompt (system prompt for the teacher)

${F}
${sysPrompt(S)}
You are producing GOLD-STANDARD training answers. Requirements:
- Be correct above all; if a claim is uncertain, say so explicitly.
- Show reasoning briefly, then the answer. Use structure (lists, headings) when it helps.
- Stay grounded in ${dom} practice; use realistic terminology, numbers, and examples.
- For out-of-scope/unsafe requests: refuse briefly and redirect to ${S.topic || dom}.
${S.task === "extraction" ? "- Output strictly valid JSON when a schema is requested." : ""}${S.task === "code" ? "- Code must run; include imports; add brief comments." : ""}${S.task === "quiz" ? "- Quiz questions must be strictly valid JSON per the system-prompt schema; every fact verifiable; vary difficulty 40% easy / 40% medium / 20% hard; wrong options must be plausible." : ""}
${F}

## 4) Quality-filter prompt (self-critique; drop scores < 4)

${F}
Rate this training example 1–5 on each of: factual correctness, helpfulness,
completeness, and style-fit for a ${S.tone || "professional"} ${dom} assistant.
Return JSON: {"correctness": n, "helpfulness": n, "completeness": n, "style": n,
"verdict": "keep"|"fix"|"drop", "fix_hint": "..."}
Example:
USER: {question}
ASSISTANT: {answer}
${F}

${S.stageDpo ? `## 5) Preference-pair prompt (for DPO)

${F}
For the question below, produce TWO answers as JSON {"chosen": "...", "rejected": "..."}:
- "chosen": your best expert answer.
- "rejected": plausible but flawed — subtly wrong fact, missing key caveat, wrong
  format, or generic non-answer. Do NOT make it obviously bad.
QUESTION: {question}
${F}
` : ""}`;
}

/* --------------------------- synthetic script ----------------------------- */

function genSyntheticScript(S) {
  const t = TEACHERS[S.teacher] || TEACHERS.claude;
  const anthropic = t.api === "anthropic";
  const clientSetup = anthropic
    ? `import anthropic
client = anthropic.Anthropic()  # uses ANTHROPIC_API_KEY env var
MODEL = os.environ.get("TEACHER_MODEL", "${t.model}")

def chat(system: str, user: str, max_tokens: int = 1600) -> str:
    resp = client.messages.create(
        model=MODEL, max_tokens=max_tokens, system=system,
        messages=[{"role": "user", "content": user}],
    )
    return resp.content[0].text`
    : `from openai import OpenAI
# Works with OpenAI, OpenRouter, vLLM, Ollama, llama.cpp server — set OPENAI_BASE_URL.
client = OpenAI(base_url=os.environ.get("OPENAI_BASE_URL") or None)
MODEL = os.environ.get("TEACHER_MODEL", "${t.model}")

def chat(system: str, user: str, max_tokens: int = 1600) -> str:
    resp = client.chat.completions.create(
        model=MODEL, max_tokens=max_tokens,
        messages=[{"role": "system", "content": system},
                  {"role": "user", "content": user}],
    )
    return resp.choices[0].message.content`;

  return `#!/usr/bin/env python3
"""Synthetic training-data generator for ${S.name}.

Pipeline: taxonomy -> questions per subtopic -> gold answers -> quality filter.
Writes ChatML JSONL to data/sft_raw.jsonl (resumable; safe to re-run).

Usage:
  python data/generate_synthetic.py --n ${S.sftCount}
  python data/generate_synthetic.py --n 500 --subtopics 12   # small pilot first!
"""
import argparse, json, os, pathlib, random, re, sys, time

${clientSetup}

DOMAIN = ${JSON.stringify(ctxSummary(S).dom)}
FOCUS = ${JSON.stringify(S.topic || "")}
SYSTEM_PROMPT = ${JSON.stringify(sysPrompt(S))}

TAXONOMY_PROMPT = f"""You are designing a training curriculum for an expert assistant in {DOMAIN}{f', focused on {FOCUS}' if FOCUS else ''}.
List {{k}} distinct subtopics a real practitioner would ask about, beginner to expert.
Output a JSON array of strings only."""

QGEN_PROMPT = f"""Generate {{n}} diverse user messages about the subtopic "{{sub}}" in {DOMAIN}.
Vary persona (novice/practitioner/manager/skeptic), length (5 words to 3 paragraphs),
formality (typos in ~10%), requested format, and difficulty (easy 40/medium 40/hard 20).
Include one out-of-scope request per ~15 to teach refusals.
Output a JSON array of strings only."""

ANSWER_SYSTEM = SYSTEM_PROMPT + """
You are producing GOLD-STANDARD training answers. Be correct above all; flag uncertainty
explicitly; use structure when it helps; refuse out-of-scope requests briefly and redirect."""

FILTER_PROMPT = """Rate this training example 1-5 on correctness, helpfulness, completeness, style.
Return JSON only: {"correctness":n,"helpfulness":n,"completeness":n,"style":n,"verdict":"keep"|"drop"}
USER: %s
ASSISTANT: %s"""


def extract_json(text: str):
    m = re.search(r"\\[.*\\]|\\{.*\\}", text, re.S)
    return json.loads(m.group(0)) if m else None


def retry(fn, tries=4):
    for i in range(tries):
        try:
            return fn()
        except Exception as e:  # rate limits / transient
            wait = 2 ** (i + 1)
            print(f"  retry {i+1}/{tries} after error: {e} (sleep {wait}s)", file=sys.stderr)
            time.sleep(wait)
    raise RuntimeError("gave up after retries")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=${S.sftCount}, help="target number of examples")
    ap.add_argument("--subtopics", type=int, default=50)
    ap.add_argument("--per-batch", type=int, default=10)
    ap.add_argument("--out", default="data/sft_raw.jsonl")
    ap.add_argument("--min-score", type=int, default=4)
    args = ap.parse_args()

    out = pathlib.Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    done = sum(1 for _ in open(out)) if out.exists() else 0
    print(f"resuming with {done} existing examples -> target {args.n}")

    taxo_file = out.parent / "taxonomy.json"
    if taxo_file.exists():
        subtopics = json.loads(taxo_file.read_text())
    else:
        subtopics = retry(lambda: extract_json(chat(
            "You output only valid JSON.", TAXONOMY_PROMPT.format(k=args.subtopics))))
        taxo_file.write_text(json.dumps(subtopics, indent=2))
        print(f"taxonomy: {len(subtopics)} subtopics -> {taxo_file}")

    with open(out, "a") as f:
        while done < args.n:
            sub = random.choice(subtopics)
            sub = sub if isinstance(sub, str) else sub.get("subtopic", str(sub))
            qs = retry(lambda: extract_json(chat(
                "You output only valid JSON.", QGEN_PROMPT.format(n=args.per_batch, sub=sub)))) or []
            for q in qs:
                if done >= args.n:
                    break
                if not isinstance(q, str) or len(q) < 8:
                    continue
                a = retry(lambda: chat(ANSWER_SYSTEM, q))
                score = retry(lambda: extract_json(chat(
                    "You output only valid JSON.", FILTER_PROMPT % (q[:2000], a[:4000])))) or {}
                keep = (score.get("verdict") == "keep" and
                        min(score.get("correctness", 0), score.get("helpfulness", 0)) >= args.min_score)
                if not keep:
                    continue
                f.write(json.dumps({"messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": q},
                    {"role": "assistant", "content": a},
                ], "meta": {"subtopic": sub, "scores": score}}) + "\\n")
                f.flush()
                done += 1
                if done % 25 == 0:
                    print(f"  {done}/{args.n}")
    print(f"done: {done} examples in {out}")


if __name__ == "__main__":
    main()
`;
}

/* ----------------------------- prepare data ------------------------------- */

function genPrepareData(S) {
  return `#!/usr/bin/env python3
"""Clean, dedupe, decontaminate and split the dataset for ${S.name}.

Input : data/sft_raw.jsonl  (ChatML "messages" JSONL; extra keys ignored)
Output: data/train.jsonl, data/val.jsonl, data/test.jsonl
"""
import hashlib, json, pathlib, random, re

RAW = pathlib.Path("data/sft_raw.jsonl")
random.seed(3407)

MIN_USER_LEN, MIN_ASSIST_LEN, MAX_CHARS = 8, 40, 32000
VAL_FRAC, TEST_N = 0.03, ${S.evalHoldout}


def norm(s: str) -> str:
    return re.sub(r"\\s+", " ", s.lower()).strip()


def main():
    rows, seen, dropped = [], set(), {"parse": 0, "shape": 0, "len": 0, "dup": 0}
    for line in open(RAW):
        try:
            ex = json.loads(line)
        except json.JSONDecodeError:
            dropped["parse"] += 1
            continue
        msgs = ex.get("messages", [])
        user = next((m["content"] for m in msgs if m["role"] == "user"), "")
        asst = next((m["content"] for m in msgs if m["role"] == "assistant"), "")
        if not user or not asst:
            dropped["shape"] += 1
            continue
        if len(user) < MIN_USER_LEN or len(asst) < MIN_ASSIST_LEN or len(user) + len(asst) > MAX_CHARS:
            dropped["len"] += 1
            continue
        h = hashlib.md5(norm(user).encode()).hexdigest()  # exact-dup on normalized user turn
        if h in seen:
            dropped["dup"] += 1
            continue
        seen.add(h)
        rows.append({"messages": msgs})

    random.shuffle(rows)
    test, rest = rows[:TEST_N], rows[TEST_N:]
    n_val = max(1, int(len(rest) * VAL_FRAC))
    val, train = rest[:n_val], rest[n_val:]

    for name, split in [("train", train), ("val", val), ("test", test)]:
        p = pathlib.Path(f"data/{name}.jsonl")
        with open(p, "w") as f:
            for r in split:
                f.write(json.dumps(r) + "\\n")
        print(f"{p}: {len(split)}")
    print(f"dropped: {dropped}")
    print("NOTE: test.jsonl is your frozen eval set - never train on it, never regenerate it.")


if __name__ == "__main__":
    main()
`;
}

/* ----------------------------- training: unsloth -------------------------- */

function genTrainUnsloth(S) {
  const m = pickModel(S.baseModel);
  const load4bit = S.method === "qlora";
  return `#!/usr/bin/env python3
"""SFT for ${S.name} — Unsloth ${S.method.toUpperCase()} on ${m.hf}.

Runs on a single GPU (fits ${S.method === "qlora" ? "free Colab T4 for models ≤4B" : "24 GB-class GPUs"}).
  python training/train_sft.py
"""
from unsloth import FastLanguageModel
from unsloth.chat_templates import get_chat_template, train_on_responses_only
from datasets import load_dataset
from trl import SFTConfig, SFTTrainer

MAX_SEQ = ${S.seqLen}
model, tokenizer = FastLanguageModel.from_pretrained(
    model_name="${m.hf}",
    max_seq_length=MAX_SEQ,
    load_in_4bit=${load4bit ? "True" : "False"},
    dtype=None,  # auto (bf16 on Ampere+)
)

model = FastLanguageModel.get_peft_model(
    model,
    r=${S.loraR},
    lora_alpha=${S.loraR * 2},
    lora_dropout=0.0,          # 0 enables Unsloth fast path
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                    "gate_proj", "up_proj", "down_proj"],
    use_gradient_checkpointing="unsloth",
    random_state=3407,
)

tokenizer = get_chat_template(tokenizer, chat_template="chatml")

def to_text(ex):
    return {"text": tokenizer.apply_chat_template(
        ex["messages"], tokenize=False, add_generation_prompt=False)}

train_ds = load_dataset("json", data_files="data/train.jsonl", split="train").map(to_text)
val_ds = load_dataset("json", data_files="data/val.jsonl", split="train").map(to_text)

trainer = SFTTrainer(
    model=model,
    tokenizer=tokenizer,
    train_dataset=train_ds,
    eval_dataset=val_ds,
    args=SFTConfig(
        dataset_text_field="text",
        max_seq_length=MAX_SEQ,
        per_device_train_batch_size=${S.batch},
        gradient_accumulation_steps=${S.gradAccum},
        num_train_epochs=${S.epochs},
        learning_rate=${S.lr},
        lr_scheduler_type="cosine",
        warmup_ratio=0.03,
        weight_decay=0.01,
        optim="adamw_8bit",
        logging_steps=10,
        eval_strategy="steps",
        eval_steps=100,
        save_strategy="epoch",
        output_dir="out/${S.name}-sft",
        seed=3407,
        report_to="${S.tracking === "wandb" ? "wandb" : "none"}",
    ),
)

# Mask loss on prompt tokens - train on assistant responses only.
trainer = train_on_responses_only(
    trainer,
    instruction_part="<|im_start|>user\\n",
    response_part="<|im_start|>assistant\\n",
)

trainer.train()

# Save LoRA adapter + merged 16-bit weights (for GGUF export / vLLM serving)
model.save_pretrained("out/${S.name}-sft/adapter")
tokenizer.save_pretrained("out/${S.name}-sft/adapter")
model.save_pretrained_merged("out/${S.name}-merged", tokenizer, save_method="merged_16bit")
print("saved: out/${S.name}-merged (use this for eval + deployment)")
`;
}

/* ----------------------------- training: axolotl -------------------------- */

function genTrainAxolotl(S) {
  const m = pickModel(S.baseModel);
  return `# Axolotl config — SFT for ${S.name} (${S.method.toUpperCase()} on ${m.hf})
# Run:  axolotl train training/axolotl_sft.yml
base_model: ${m.hf}

load_in_4bit: ${S.method === "qlora"}
adapter: ${S.method === "full" ? "" : S.method}
lora_r: ${S.loraR}
lora_alpha: ${S.loraR * 2}
lora_dropout: 0.05
lora_target_linear: true

chat_template: chatml
datasets:
  - path: data/train.jsonl
    type: chat_template
    field_messages: messages
test_datasets:
  - path: data/val.jsonl
    type: chat_template
    field_messages: messages
    split: train

sequence_len: ${S.seqLen}
sample_packing: true
pad_to_sequence_len: true
train_on_inputs: false      # mask prompt tokens; learn from assistant turns only

micro_batch_size: ${S.batch}
gradient_accumulation_steps: ${S.gradAccum}
num_epochs: ${S.epochs}
learning_rate: ${S.lr}
lr_scheduler: cosine
warmup_ratio: 0.03
weight_decay: 0.01
optimizer: adamw_bnb_8bit
bf16: auto
tf32: true
gradient_checkpointing: true
flash_attention: true

logging_steps: 10
evals_per_epoch: 4
saves_per_epoch: 1
output_dir: out/${S.name}-sft
seed: 3407
${S.tracking === "wandb" ? `wandb_project: ${S.name}` : "# wandb_project: (disabled)"}
`;
}

/* ----------------------------- training: TRL ------------------------------ */

function genTrainTrl(S) {
  const m = pickModel(S.baseModel);
  const quant = S.method === "qlora" ? `
from transformers import BitsAndBytesConfig
bnb = BitsAndBytesConfig(
    load_in_4bit=True, bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype=torch.bfloat16, bnb_4bit_use_double_quant=True,
)` : "";
  const peft = S.method === "full" ? "peft_config = None  # full fine-tune" : `
from peft import LoraConfig
peft_config = LoraConfig(
    r=${S.loraR}, lora_alpha=${S.loraR * 2}, lora_dropout=0.05,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                    "gate_proj", "up_proj", "down_proj"],
    task_type="CAUSAL_LM",
)`;
  return `#!/usr/bin/env python3
"""SFT for ${S.name} — Hugging Face TRL ${S.method.toUpperCase()} on ${m.hf}.
  accelerate launch training/train_sft.py     # or: python training/train_sft.py
"""
import torch
from datasets import load_dataset
from transformers import AutoModelForCausalLM, AutoTokenizer
from trl import SFTConfig, SFTTrainer
${quant}
tokenizer = AutoTokenizer.from_pretrained("${m.hf}")
model = AutoModelForCausalLM.from_pretrained(
    "${m.hf}",
    torch_dtype=torch.bfloat16,
    ${S.method === "qlora" ? "quantization_config=bnb," : ""}
    attn_implementation="sdpa",
)
${peft}

train_ds = load_dataset("json", data_files="data/train.jsonl", split="train")
val_ds = load_dataset("json", data_files="data/val.jsonl", split="train")

trainer = SFTTrainer(
    model=model,
    processing_class=tokenizer,
    train_dataset=train_ds,   # TRL applies the chat template to "messages" itself
    eval_dataset=val_ds,
    peft_config=peft_config,
    args=SFTConfig(
        max_length=${S.seqLen},
        packing=True,
        per_device_train_batch_size=${S.batch},
        gradient_accumulation_steps=${S.gradAccum},
        num_train_epochs=${S.epochs},
        learning_rate=${S.lr},
        lr_scheduler_type="cosine",
        warmup_ratio=0.03,
        weight_decay=0.01,
        gradient_checkpointing=True,
        bf16=True,
        logging_steps=10,
        eval_strategy="steps",
        eval_steps=100,
        save_strategy="epoch",
        output_dir="out/${S.name}-sft",
        seed=3407,
        report_to="${S.tracking === "wandb" ? "wandb" : "none"}",
    ),
)
trainer.train()
trainer.save_model("out/${S.name}-sft/final")

${S.method !== "full" ? `# Merge LoRA into the base for deployment
from peft import PeftModel
base = AutoModelForCausalLM.from_pretrained("${m.hf}", torch_dtype=torch.bfloat16)
merged = PeftModel.from_pretrained(base, "out/${S.name}-sft/final").merge_and_unload()
merged.save_pretrained("out/${S.name}-merged")
tokenizer.save_pretrained("out/${S.name}-merged")
print("saved: out/${S.name}-merged")` : `print("saved: out/${S.name}-sft/final")`}
`;
}

/* ----------------------------- training: DPO ------------------------------ */

function genTrainDpo(S) {
  const m = pickModel(S.baseModel);
  return `#!/usr/bin/env python3
"""DPO preference tuning for ${S.name} (run AFTER SFT).

Input: data/pref.jsonl with lines like
  {"prompt": "...", "chosen": "...", "rejected": "..."}
Build pairs with the preference-pair prompt in data/synthetic_prompts.md, or from
real user feedback (thumbs-up answer = chosen, regenerated/corrected = rejected).
"""
import torch
from datasets import load_dataset
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import LoraConfig
from trl import DPOConfig, DPOTrainer

BASE = "out/${S.name}-merged"   # the SFT-merged model
tokenizer = AutoTokenizer.from_pretrained(BASE)
model = AutoModelForCausalLM.from_pretrained(BASE, torch_dtype=torch.bfloat16)

ds = load_dataset("json", data_files="data/pref.jsonl", split="train")

def to_chat(ex):
    return {
        "prompt": tokenizer.apply_chat_template(
            [{"role": "user", "content": ex["prompt"]}],
            tokenize=False, add_generation_prompt=True),
        "chosen": ex["chosen"], "rejected": ex["rejected"],
    }
ds = ds.map(to_chat)

trainer = DPOTrainer(
    model=model,
    processing_class=tokenizer,
    train_dataset=ds,
    peft_config=LoraConfig(r=${S.loraR}, lora_alpha=${S.loraR * 2}, task_type="CAUSAL_LM",
                           target_modules=["q_proj", "k_proj", "v_proj", "o_proj"]),
    args=DPOConfig(
        beta=0.1,
        learning_rate=5e-6,          # DPO wants a much lower LR than SFT
        per_device_train_batch_size=${Math.max(1, Math.floor(S.batch / 2))},
        gradient_accumulation_steps=${S.gradAccum * 2},
        num_train_epochs=1,
        max_length=${S.seqLen},
        bf16=True,
        logging_steps=10,
        output_dir="out/${S.name}-dpo",
        report_to="${S.tracking === "wandb" ? "wandb" : "none"}",
    ),
)
trainer.train()
trainer.save_model("out/${S.name}-dpo/final")
print("Tip: if quality regresses, you likely need better pairs, not more epochs.")
`;
}

/* --------------------------- training: CPT -------------------------------- */

function genTrainCpt(S) {
  const m = pickModel(S.baseModel);
  return `#!/usr/bin/env python3
"""Continued pretraining (CPT) for ${S.name} on a raw ${ctxSummary(S).dom} corpus.

Feeds plain text (packed) to ${m.hf} before SFT, to teach domain vocabulary and facts.
Input: data/corpus/*.txt (or .jsonl with a "text" field). Target: ~${S.cptTokens}B tokens.
Mix in ~10-20% general text (e.g. fineweb-edu sample) to prevent catastrophic forgetting.
"""
import torch
from datasets import load_dataset
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import LoraConfig
from trl import SFTConfig, SFTTrainer

BASE = "${m.hf}"
tokenizer = AutoTokenizer.from_pretrained(BASE)
model = AutoModelForCausalLM.from_pretrained(BASE, torch_dtype=torch.bfloat16)

ds = load_dataset("text", data_files="data/corpus/*.txt", split="train")

# CPT with high-rank LoRA (r=${Math.max(64, S.loraR)}) — near full-FT quality at a fraction of the VRAM.
# Include embeddings/lm_head so the model can adapt to domain tokens.
peft_config = LoraConfig(
    r=${Math.max(64, S.loraR)}, lora_alpha=${Math.max(64, S.loraR)}, lora_dropout=0.0,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                    "gate_proj", "up_proj", "down_proj"],
    modules_to_save=["embed_tokens", "lm_head"],
    task_type="CAUSAL_LM",
)

trainer = SFTTrainer(
    model=model,
    processing_class=tokenizer,
    train_dataset=ds,
    peft_config=peft_config,
    args=SFTConfig(
        dataset_text_field="text",
        max_length=${S.seqLen},
        packing=True,
        per_device_train_batch_size=${S.batch},
        gradient_accumulation_steps=${S.gradAccum},
        num_train_epochs=1,
        learning_rate=5e-5,               # ~10x lower than SFT LoRA
        lr_scheduler_type="cosine",
        warmup_ratio=0.05,
        bf16=True,
        gradient_checkpointing=True,
        logging_steps=20,
        save_steps=500,
        output_dir="out/${S.name}-cpt",
        report_to="${S.tracking === "wandb" ? "wandb" : "none"}",
    ),
)
trainer.train()

from peft import PeftModel
base = AutoModelForCausalLM.from_pretrained(BASE, torch_dtype=torch.bfloat16)
merged = PeftModel.from_pretrained(base, trainer.args.output_dir).merge_and_unload()
merged.save_pretrained("out/${S.name}-cpt-merged")
tokenizer.save_pretrained("out/${S.name}-cpt-merged")
print("Now point training/train_sft.py at out/${S.name}-cpt-merged and run SFT.")
`;
}

/* ------------------------ training: from scratch --------------------------- */

function genTokenizerTrain(S) {
  const arch = scratchArch(S.scratchParams);
  return `#!/usr/bin/env python3
"""Train a ${arch.vocab.toLocaleString()}-token BPE tokenizer on your corpus (from-scratch path).
Input: data/corpus/*.txt   Output: out/tokenizer/
"""
from pathlib import Path
from tokenizers import ByteLevelBPETokenizer

files = [str(p) for p in Path("data/corpus").glob("**/*.txt")]
assert files, "put raw text files in data/corpus/ first"

tok = ByteLevelBPETokenizer()
tok.train(
    files=files,
    vocab_size=${arch.vocab},
    min_frequency=2,
    special_tokens=["<|endoftext|>", "<|im_start|>", "<|im_end|>", "<|pad|>"],
)
Path("out/tokenizer").mkdir(parents=True, exist_ok=True)
tok.save_model("out/tokenizer")
tok.save("out/tokenizer/tokenizer.json")
print("saved out/tokenizer — vocab", tok.get_vocab_size())
`;
}

function genPretrainScratch(S) {
  const arch = scratchArch(S.scratchParams);
  const tb = tokenBudget(S.scratchParams);
  return `#!/usr/bin/env python3
"""Minimal decoder-only Transformer pretraining for ${S.name} (~${arch.actualM}M params).

A compact, dependency-light trainer in the spirit of nanoGPT/nanochat. For serious
runs at >1B scale, graduate to litgpt, torchtitan, or nanochat — same concepts.

Target: ~${fmtNum(tb.tokens)} tokens (Chinchilla ~${tb.mult}x params). Corpus: data/corpus/*.txt
  python training/tokenizer_train.py           # once
  python training/pretrain_scratch.py
"""
import math, os, pathlib, time
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as Fn
from tokenizers import Tokenizer

# ----------------------------- config --------------------------------------
N_LAYER, N_HEAD, D_MODEL = ${arch.layers}, ${arch.heads}, ${arch.d}
BLOCK = ${Math.min(2048, S.seqLen)}
VOCAB = ${arch.vocab}
BATCH, GRAD_ACCUM = ${S.batch * 2}, ${S.gradAccum * 2}
LR, MIN_LR, WARMUP = 6e-4, 6e-5, 2000
TARGET_TOKENS = ${Math.round(tb.tokens)}
WD, GRAD_CLIP = 0.1, 1.0
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
DTYPE = torch.bfloat16 if torch.cuda.is_available() else torch.float32
OUT = pathlib.Path("out/${S.name}-pretrain"); OUT.mkdir(parents=True, exist_ok=True)

# ----------------------------- data ----------------------------------------
BIN = OUT / "train.bin"
if not BIN.exists():
    tok = Tokenizer.from_file("out/tokenizer/tokenizer.json")
    eot = tok.token_to_id("<|endoftext|>")
    ids = []
    for p in sorted(pathlib.Path("data/corpus").glob("**/*.txt")):
        ids.extend(tok.encode(p.read_text(errors="ignore")).ids + [eot])
    arr = np.array(ids, dtype=np.uint16 if VOCAB < 65536 else np.uint32)
    arr.tofile(BIN)
    print(f"tokenized {len(arr):,} tokens -> {BIN}")
data = np.memmap(BIN, dtype=np.uint16 if VOCAB < 65536 else np.uint32, mode="r")
print(f"corpus: {len(data):,} tokens (target {TARGET_TOKENS:,}; will loop epochs if smaller)")

def get_batch():
    ix = torch.randint(len(data) - BLOCK - 1, (BATCH,))
    x = torch.stack([torch.from_numpy(data[i:i+BLOCK].astype(np.int64)) for i in ix])
    y = torch.stack([torch.from_numpy(data[i+1:i+1+BLOCK].astype(np.int64)) for i in ix])
    return x.to(DEVICE, non_blocking=True), y.to(DEVICE, non_blocking=True)

# ----------------------------- model ----------------------------------------
class Block(nn.Module):
    def __init__(self):
        super().__init__()
        self.ln1, self.ln2 = nn.LayerNorm(D_MODEL), nn.LayerNorm(D_MODEL)
        self.attn = nn.MultiheadAttention(D_MODEL, N_HEAD, batch_first=True)
        self.mlp = nn.Sequential(
            nn.Linear(D_MODEL, 4 * D_MODEL), nn.GELU(), nn.Linear(4 * D_MODEL, D_MODEL))
    def forward(self, x, mask):
        h = self.ln1(x)
        a, _ = self.attn(h, h, h, attn_mask=mask, need_weights=False)
        x = x + a
        return x + self.mlp(self.ln2(x))

class GPT(nn.Module):
    def __init__(self):
        super().__init__()
        self.tok = nn.Embedding(VOCAB, D_MODEL)
        self.pos = nn.Embedding(BLOCK, D_MODEL)
        self.blocks = nn.ModuleList(Block() for _ in range(N_LAYER))
        self.lnf = nn.LayerNorm(D_MODEL)
        self.head = nn.Linear(D_MODEL, VOCAB, bias=False)
        self.head.weight = self.tok.weight  # weight tying
        mask = torch.triu(torch.full((BLOCK, BLOCK), float("-inf")), diagonal=1)
        self.register_buffer("mask", mask)
        self.apply(self._init)
    def _init(self, m):
        if isinstance(m, (nn.Linear, nn.Embedding)):
            nn.init.normal_(m.weight, std=0.02)
    def forward(self, idx, targets=None):
        B, T = idx.shape
        x = self.tok(idx) + self.pos(torch.arange(T, device=idx.device))
        for b in self.blocks:
            x = b(x, self.mask[:T, :T])
        logits = self.head(self.lnf(x))
        loss = None
        if targets is not None:
            loss = Fn.cross_entropy(logits.view(-1, VOCAB), targets.view(-1))
        return logits, loss

model = GPT().to(DEVICE)
if DEVICE == "cuda":
    model = torch.compile(model)
n_params = sum(p.numel() for p in model.parameters())
print(f"model: {n_params/1e6:.1f}M params")

opt = torch.optim.AdamW(model.parameters(), lr=LR, betas=(0.9, 0.95), weight_decay=WD)
tokens_per_step = BATCH * GRAD_ACCUM * BLOCK
max_steps = TARGET_TOKENS // tokens_per_step
print(f"{max_steps:,} steps x {tokens_per_step:,} tokens/step")

def lr_at(step):
    if step < WARMUP:
        return LR * step / WARMUP
    t = (step - WARMUP) / max(1, max_steps - WARMUP)
    return MIN_LR + 0.5 * (LR - MIN_LR) * (1 + math.cos(math.pi * min(t, 1.0)))

# ----------------------------- train loop -----------------------------------
t0, step = time.time(), 0
while step < max_steps:
    for g in opt.param_groups:
        g["lr"] = lr_at(step)
    opt.zero_grad(set_to_none=True)
    loss_acc = 0.0
    for _ in range(GRAD_ACCUM):
        x, y = get_batch()
        with torch.autocast(device_type="cuda", dtype=DTYPE, enabled=DEVICE == "cuda"):
            _, loss = model(x, y)
        (loss / GRAD_ACCUM).backward()
        loss_acc += loss.item() / GRAD_ACCUM
    torch.nn.utils.clip_grad_norm_(model.parameters(), GRAD_CLIP)
    opt.step()
    step += 1
    if step % 20 == 0:
        tps = step * tokens_per_step / (time.time() - t0)
        print(f"step {step}/{max_steps}  loss {loss_acc:.3f}  lr {lr_at(step):.2e}  {tps/1e3:.0f}K tok/s")
    if step % 1000 == 0 or step == max_steps:
        torch.save({"model": model.state_dict(), "step": step,
                    "config": dict(n_layer=N_LAYER, n_head=N_HEAD, d_model=D_MODEL,
                                   block=BLOCK, vocab=VOCAB)},
                   OUT / "ckpt.pt")
print("done. Next: SFT on your instruction data (see training/train_sft.py),")
print("adapting it to load this checkpoint, or convert to HF format first.")
`;
}

/* ------------------------------ eval -------------------------------------- */

function genEvalPlan(S) {
  const { dom } = ctxSummary(S);
  return `# Evaluation plan — ${S.name}

Three layers, cheapest first. Gate every release on all three.

## 1. Automatic metrics (every run)

- **Val loss / perplexity** during training — catches divergence and overfitting early.
- **General-ability smoke test** via lm-evaluation-harness (\`eval/run_lm_eval.sh\`):
  ${(S.benches || []).join(", ") || "mmlu (subset), hellaswag, arc_easy"} — the score should NOT
  crater vs. the base model (>5-point drop on any = catastrophic forgetting; lower LR/epochs
  or mix in general data).

## 2. Domain test set (every run)

- \`data/test.jsonl\` (${S.evalHoldout} frozen examples, never trained on).
- Scored by an LLM judge (\`eval/llm_judge.py\`) on correctness, helpfulness, style;
  1–5 scale. **Ship gate: mean ≥ 4.0 and ≥ base-model score + 0.5.**
- Also judge the *base model* once for the baseline comparison.

## 3. Human review (before first ship + monthly)

- 25 random test answers reviewed by a ${dom} expert; log errors by category.
- 20 adversarial prompts: out-of-scope, prompt injection ("ignore your instructions"),
  unsafe requests, PII fishing. Expect graceful refusals.
- Latency check on target hardware: p50/p95 for a typical prompt at ${S.quant.toUpperCase()}.

## Error taxonomy (track over time)

| Category | Example | Fix |
|---|---|---|
| Factual error | wrong ${dom} fact | add corrective SFT examples |
| Stale knowledge | outdated regulation/version | refresh corpus, retrain |
| Format miss | asked JSON, got prose | add format-varied examples |
| Over-refusal | refuses in-scope question | rebalance refusal examples |
| Under-refusal | answers out-of-scope | add refusal examples |
| Hallucinated citation | invents a source | ground answers, add RAG |
`;
}

function genRunLmEval(S) {
  const benches = (S.benches && S.benches.length ? S.benches : ["mmlu", "hellaswag", "arc_easy"]).join(",");
  return `#!/usr/bin/env bash
# General-ability smoke test with EleutherAI lm-evaluation-harness.
# Compares your tuned model against its base to detect catastrophic forgetting.
set -euo pipefail

MODEL_PATH="\${1:-out/${S.name}-merged}"
TASKS="${benches}"

lm_eval --model hf \\
  --model_args "pretrained=\${MODEL_PATH},dtype=bfloat16" \\
  --tasks "\${TASKS}" \\
  --batch_size auto \\
  --output_path "eval/results/\$(basename "\${MODEL_PATH}")"

echo "Now run the same command with the base model path and diff the scores."
`;
}

function genLlmJudge(S) {
  const t = TEACHERS[S.teacher] || TEACHERS.claude;
  const anthropic = t.api === "anthropic";
  return `#!/usr/bin/env python3
"""LLM-as-judge scoring of the tuned model on data/test.jsonl.

1) Generates answers from your model (any OpenAI-compatible endpoint: vLLM, Ollama,
   llama.cpp server).  2) Scores each answer 1-5 with a strong judge model.

  python eval/llm_judge.py --model-url http://localhost:8000/v1 --model ${S.name}
"""
import argparse, json, os, statistics, sys
from openai import OpenAI
${anthropic ? "import anthropic" : ""}

JUDGE_PROMPT = """You are a strict evaluator for a ${ctxSummary(S).dom} assistant.
Score the ASSISTANT ANSWER for the USER QUESTION on a 1-5 scale for each of:
- correctness (facts and reasoning are right)
- helpfulness (actually addresses the need)
- style (clear, ${S.tone || "professional"}, well-structured)
Penalize hallucinated facts heavily (correctness <= 2). Return JSON only:
{"correctness": n, "helpfulness": n, "style": n, "comment": "one sentence"}

USER QUESTION:
%s

ASSISTANT ANSWER:
%s"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model-url", default="http://localhost:8000/v1")
    ap.add_argument("--model", default="${S.name}")
    ap.add_argument("--test-file", default="data/test.jsonl")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--out", default="eval/results/judge_scores.jsonl")
    args = ap.parse_args()

    student = OpenAI(base_url=args.model_url, api_key=os.environ.get("OPENAI_API_KEY", "none"))
${anthropic ? `    judge = anthropic.Anthropic()

    def judge_call(prompt):
        r = judge.messages.create(model=os.environ.get("JUDGE_MODEL", "${t.model}"),
                                  max_tokens=300, messages=[{"role": "user", "content": prompt}])
        return r.content[0].text` : `    judge = OpenAI()  # judge via OPENAI_API_KEY / OPENAI_BASE_URL

    def judge_call(prompt):
        r = judge.chat.completions.create(model=os.environ.get("JUDGE_MODEL", "${t.model}"),
                                          max_tokens=300,
                                          messages=[{"role": "user", "content": prompt}])
        return r.choices[0].message.content`}

    rows = [json.loads(l) for l in open(args.test_file)]
    if args.limit:
        rows = rows[:args.limit]

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    scores = []
    with open(args.out, "w") as f:
        for i, ex in enumerate(rows):
            msgs = ex["messages"]
            question = next(m["content"] for m in msgs if m["role"] == "user")
            answer = student.chat.completions.create(
                model=args.model, max_tokens=1024,
                messages=[m for m in msgs if m["role"] != "assistant"],
            ).choices[0].message.content
            raw = judge_call(JUDGE_PROMPT % (question[:3000], answer[:6000]))
            try:
                s = json.loads(raw[raw.index("{"): raw.rindex("}") + 1])
            except Exception:
                print(f"  [{i}] unparseable judge output, skipping", file=sys.stderr)
                continue
            s["question"] = question[:200]
            f.write(json.dumps(s) + "\\n")
            scores.append(s)
            if (i + 1) % 10 == 0:
                print(f"  {i+1}/{len(rows)}")

    for k in ("correctness", "helpfulness", "style"):
        vals = [s[k] for s in scores if isinstance(s.get(k), (int, float))]
        print(f"{k:>12}: mean {statistics.mean(vals):.2f}  (n={len(vals)})")
    overall = statistics.mean(
        statistics.mean([s[k] for k in ("correctness", "helpfulness", "style")]) for s in scores)
    print(f"{'overall':>12}: {overall:.2f}  -> ship gate is >= 4.0")


if __name__ == "__main__":
    main()
`;
}

/* ------------------------------ deploy ------------------------------------ */

function genExportGguf(S) {
  return `#!/usr/bin/env bash
# Export the merged model to GGUF and quantize for llama.cpp / Ollama / LM Studio.
set -euo pipefail

MODEL_DIR="\${1:-out/${S.name}-merged}"
QUANT="${S.quant.toUpperCase()}"      # Q4_K_M = best size/quality default; Q8_0 = near-lossless

if [ ! -d llama.cpp ]; then
  git clone --depth 1 https://github.com/ggml-org/llama.cpp
  pip install -r llama.cpp/requirements.txt
  cmake -S llama.cpp -B llama.cpp/build && cmake --build llama.cpp/build -j --target llama-quantize
fi

python llama.cpp/convert_hf_to_gguf.py "\${MODEL_DIR}" \\
  --outfile "out/${S.name}-f16.gguf" --outtype f16

llama.cpp/build/bin/llama-quantize \\
  "out/${S.name}-f16.gguf" "out/${S.name}-\${QUANT}.gguf" "\${QUANT}"

ls -lh out/*.gguf
echo "Next: ollama create ${S.name} -f deploy/Modelfile"
`;
}

function genModelfile(S) {
  return `# Ollama Modelfile for ${S.name}
# Build:  ollama create ${S.name} -f deploy/Modelfile
# Run:    ollama run ${S.name}
FROM ./out/${S.name}-${S.quant.toUpperCase()}.gguf

SYSTEM """${sysPrompt(S)}"""

PARAMETER temperature 0.7
PARAMETER top_p 0.9
PARAMETER num_ctx ${S.contextLen}
`;
}

function genServeVllm(S) {
  return `#!/usr/bin/env bash
# Production serving with vLLM (OpenAI-compatible API, continuous batching).
# For GPU servers. For laptops/edge, prefer Ollama/llama.cpp with the GGUF export.
set -euo pipefail

MODEL_DIR="\${1:-out/${S.name}-merged}"

vllm serve "\${MODEL_DIR}" \\
  --served-model-name ${S.name} \\
  --max-model-len ${S.contextLen} \\
  --gpu-memory-utilization 0.90 \\
  --port 8000

# Smoke test:
#   curl http://localhost:8000/v1/chat/completions -H 'Content-Type: application/json' -d '{
#     "model": "${S.name}",
#     "messages": [{"role": "user", "content": "hello"}]
#   }'
`;
}

function genFastapi(S) {
  return `#!/usr/bin/env python3
"""Production API gateway for ${S.name}.

Sits in front of the model server (vLLM/Ollama/llama.cpp — anything OpenAI-compatible)
and adds: the system prompt, request logging, feedback capture (the retraining flywheel),
and a health endpoint.

  uvicorn deploy.app_fastapi:app --host 0.0.0.0 --port 8080
"""
import json, os, pathlib, time, uuid
from fastapi import FastAPI
from pydantic import BaseModel
from openai import OpenAI

MODEL_URL = os.environ.get("MODEL_URL", "http://localhost:8000/v1")
MODEL_NAME = os.environ.get("MODEL_NAME", "${S.name}")
SYSTEM_PROMPT = ${JSON.stringify(sysPrompt(S))}
LOG_DIR = pathlib.Path(os.environ.get("LOG_DIR", "logs")); LOG_DIR.mkdir(exist_ok=True)

client = OpenAI(base_url=MODEL_URL, api_key=os.environ.get("MODEL_API_KEY", "none"))
app = FastAPI(title="${S.name}")


class ChatRequest(BaseModel):
    message: str
    history: list[dict] = []          # [{"role": "user"|"assistant", "content": "..."}]
    temperature: float = 0.7
    max_tokens: int = 1024


class Feedback(BaseModel):
    request_id: str
    rating: int                        # 1 = thumbs down, 5 = thumbs up
    correction: str | None = None      # ideal answer, if the user provides one


def log(kind: str, payload: dict):
    with open(LOG_DIR / f"{kind}.jsonl", "a") as f:
        f.write(json.dumps(payload) + "\\n")


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL_NAME}


@app.post("/chat")
def chat(req: ChatRequest):
    rid = str(uuid.uuid4())[:8]
    t0 = time.time()
    messages = ([{"role": "system", "content": SYSTEM_PROMPT}]
                + req.history[-8:]
                + [{"role": "user", "content": req.message}])
    resp = client.chat.completions.create(
        model=MODEL_NAME, messages=messages,
        temperature=req.temperature, max_tokens=req.max_tokens)
    answer = resp.choices[0].message.content
    latency_ms = int((time.time() - t0) * 1000)
    log("requests", {"id": rid, "ts": time.time(), "message": req.message,
                     "answer": answer, "latency_ms": latency_ms})
    return {"request_id": rid, "answer": answer, "latency_ms": latency_ms}


@app.post("/feedback")
def feedback(fb: Feedback):
    # Feed these back into training: rating>=4 -> SFT candidates; corrections -> DPO pairs.
    log("feedback", fb.model_dump())
    return {"ok": True}
`;
}

function genDockerfile(S) {
  return `# Container for the ${S.name} API gateway (deploy/app_fastapi.py).
# The model server (vLLM or Ollama) runs as a separate service — see notes below.
FROM python:3.12-slim

WORKDIR /app
RUN pip install --no-cache-dir fastapi uvicorn openai pydantic

COPY deploy/app_fastapi.py deploy/app_fastapi.py

ENV MODEL_URL=http://model:8000/v1 \\
    MODEL_NAME=${S.name}

EXPOSE 8080
CMD ["uvicorn", "deploy.app_fastapi:app", "--host", "0.0.0.0", "--port", "8080"]

# --- docker-compose sketch -------------------------------------------------
# services:
#   model:        # GPU box: vLLM
#     image: vllm/vllm-openai:latest
#     command: --model /models/${S.name}-merged --served-model-name ${S.name} --max-model-len ${S.contextLen}
#     volumes: ["./out:/models"]
#     deploy: { resources: { reservations: { devices: [{ capabilities: ["gpu"] }] } } }
#   api:
#     build: .
#     ports: ["8080:8080"]
#     depends_on: [model]
`;
}

function genGradio(S) {
  return `#!/usr/bin/env python3
"""Quick chat demo UI for ${S.name} — point it at any OpenAI-compatible server.
  python deploy/gradio_demo.py
"""
import os
import gradio as gr
from openai import OpenAI

client = OpenAI(base_url=os.environ.get("MODEL_URL", "http://localhost:8000/v1"),
                api_key=os.environ.get("MODEL_API_KEY", "none"))
MODEL = os.environ.get("MODEL_NAME", "${S.name}")
SYSTEM = ${JSON.stringify(sysPrompt(S))}


def respond(message, history):
    messages = [{"role": "system", "content": SYSTEM}]
    for u, a in history:
        messages += [{"role": "user", "content": u}, {"role": "assistant", "content": a}]
    messages.append({"role": "user", "content": message})
    stream = client.chat.completions.create(model=MODEL, messages=messages,
                                            max_tokens=1024, stream=True)
    acc = ""
    for chunk in stream:
        acc += chunk.choices[0].delta.content or ""
        yield acc


gr.ChatInterface(respond, title="${S.name}",
                 description="${ctxSummary(S).dom} assistant — fine-tuned SLM demo").launch()
`;
}

function genScalingNotes(S) {
  return `# Production scaling & operations — ${S.name}

## Serving architecture

user → API gateway (FastAPI, auth, logging, feedback) → model server → GPU/CPU

| Load | Setup |
|---|---|
| Personal / demo | Ollama or llama.cpp with the ${S.quant.toUpperCase()} GGUF; no GPU needed for ≤4B |
| Team (≤20 concurrent) | 1× 24 GB GPU + vLLM; ~${Math.round(vramServe(pickModel(S.baseModel).params))} GB VRAM for weights + KV cache headroom |
| Product (100s concurrent) | vLLM with continuous batching, 2+ replicas behind a load balancer; autoscale on queue depth |
| Edge / offline | GGUF ${S.quant.toUpperCase()} via llama.cpp; ONNX Runtime or ExecuTorch for mobile |

## Checklist

**Reliability**
- [ ] Health checks (/health) + restart policy; readiness gate on first token latency
- [ ] Timeouts + max_tokens caps; reject > ${S.contextLen}-token inputs early
- [ ] Rate limiting per API key; request size limits

**Performance**
- [ ] Measure p50/p95 time-to-first-token and tokens/sec under expected concurrency
- [ ] Prefix caching on (vLLM: default) — the shared system prompt becomes ~free
- [ ] Quantization sweep: compare ${S.quant.toUpperCase()} vs Q5_K_M vs Q8_0 on the judge score before choosing

**Observability**
- [ ] Log every request/response (redact PII) with latency + token counts
- [ ] Dashboards: QPS, latency, error rate, GPU utilization, cache hit rate
- [ ] Weekly sample review: 50 random conversations, tag failures with the error taxonomy

**The retraining flywheel (this is how the model gets GOOD)**
1. /feedback endpoint captures ratings + corrections
2. Weekly: export thumbs-down + corrections → curate → add to data/sft_raw.jsonl (corrections also make DPO pairs)
3. Monthly (or on 500+ new curated examples): re-run prepare → train → eval gates → deploy
4. Version everything: dataset snapshots, base model, adapter, GGUF (name: ${S.name}-vYYYY.MM)
5. Keep the frozen test set stable so scores stay comparable across versions

**Safety & compliance**
- [ ] Input/output filters for PII${S.privacy ? " (required: privacy constraint)" : ""} and unsafe content
- [ ] Prompt-injection resistance in the adversarial eval set
- [ ] License compliance: base model (${pickModel(S.baseModel).lic}), dataset licenses, attribution
`;
}

/* --------------------------- assemble all --------------------------------- */

function buildArtifacts(S) {
  const A = [];
  const add = (path, group, content) => A.push({ path, group, content });

  add("README_RUNBOOK.md", "Project", genRunbook(S));
  add("requirements.txt", "Project", genRequirements(S));
  add("project.json", "Project", JSON.stringify(S, null, 2) + "\n");

  add("data/DATA_PLAN.md", "Data", genDataPlan(S));
  add("data/sample.jsonl", "Data", genSampleJsonl(S));
  add("data/synthetic_prompts.md", "Data", genSyntheticPrompts(S));
  add("data/generate_synthetic.py", "Data", genSyntheticScript(S));
  add("data/prepare_data.py", "Data", genPrepareData(S));

  if (S.path === "scratch") {
    add("training/tokenizer_train.py", "Training", genTokenizerTrain(S));
    add("training/pretrain_scratch.py", "Training", genPretrainScratch(S));
  }
  if (S.path === "cpt") add("training/pretrain_cpt.py", "Training", genTrainCpt(S));

  if (S.framework === "unsloth") add("training/train_sft.py", "Training", genTrainUnsloth(S));
  else if (S.framework === "axolotl") add("training/axolotl_sft.yml", "Training", genTrainAxolotl(S));
  else add("training/train_sft.py", "Training", genTrainTrl(S));

  if (S.stageDpo) add("training/train_dpo.py", "Training", genTrainDpo(S));

  add("eval/EVAL_PLAN.md", "Evaluation", genEvalPlan(S));
  add("eval/run_lm_eval.sh", "Evaluation", genRunLmEval(S));
  add("eval/llm_judge.py", "Evaluation", genLlmJudge(S));

  add("deploy/export_gguf.sh", "Deployment", genExportGguf(S));
  add("deploy/Modelfile", "Deployment", genModelfile(S));
  add("deploy/serve_vllm.sh", "Deployment", genServeVllm(S));
  add("deploy/app_fastapi.py", "Deployment", genFastapi(S));
  add("deploy/Dockerfile", "Deployment", genDockerfile(S));
  add("deploy/gradio_demo.py", "Deployment", genGradio(S));
  add("deploy/SCALING.md", "Deployment", genScalingNotes(S));

  return A;
}

/* ------------------------------ ZIP writer -------------------------------- */
/* Minimal store-only (no compression) ZIP — good enough for text bundles.   */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function makeZip(files) { // files: [{path, content}]
  const enc = new TextEncoder();
  const chunks = [], central = [];
  let offset = 0;
  const dosTime = 0, dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1;

  const u16 = v => [v & 255, (v >> 8) & 255];
  const u32 = v => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255];

  for (const f of files) {
    const name = enc.encode(f.path);
    const data = enc.encode(f.content);
    const crc = crc32(data);
    const local = new Uint8Array([
      ...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0),
      ...u16(dosTime), ...u16(dosDate), ...u32(crc),
      ...u32(data.length), ...u32(data.length),
      ...u16(name.length), ...u16(0), ...name,
    ]);
    chunks.push(local, data);
    central.push(new Uint8Array([
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0),
      ...u16(dosTime), ...u16(dosDate), ...u32(crc),
      ...u32(data.length), ...u32(data.length),
      ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(0), ...u32(offset), ...name,
    ]));
    offset += local.length + data.length;
  }
  let cdSize = 0;
  for (const c of central) { chunks.push(c); cdSize += c.length; }
  chunks.push(new Uint8Array([
    ...u32(0x06054b50), ...u16(0), ...u16(0),
    ...u16(files.length), ...u16(files.length),
    ...u32(cdSize), ...u32(offset), ...u16(0),
  ]));
  return new Blob(chunks, { type: "application/zip" });
}

/* --------------------------- Markdown renderer ---------------------------- */

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inlineMd(s) {
  return escapeHtml(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

function renderMarkdown(md) {
  const lines = md.split("\n");
  const out = [];
  let i = 0, inCode = false, codeBuf = [], listStack = 0, para = [];

  const flushPara = () => {
    if (para.length) { out.push("<p>" + inlineMd(para.join(" ")) + "</p>"); para = []; }
  };
  const closeLists = () => { while (listStack > 0) { out.push("</ul>"); listStack--; } };

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("```")) {
      flushPara(); closeLists();
      if (!inCode) { inCode = true; codeBuf = []; }
      else { out.push("<pre><code>" + escapeHtml(codeBuf.join("\n")) + "</code></pre>"); inCode = false; }
      i++; continue;
    }
    if (inCode) { codeBuf.push(line); i++; continue; }

    // tables
    if (line.trim().startsWith("|") && i + 1 < lines.length && /^\s*\|[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
      flushPara(); closeLists();
      const parseRow = r => r.trim().replace(/^\||\|$/g, "").split("|").map(c => inlineMd(c.trim()));
      const head = parseRow(line);
      out.push("<table><thead><tr>" + head.map(h => `<th>${h}</th>`).join("") + "</tr></thead><tbody>");
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        out.push("<tr>" + parseRow(lines[i]).map(c => `<td>${c}</td>`).join("") + "</tr>");
        i++;
      }
      out.push("</tbody></table>");
      continue;
    }

    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) { flushPara(); closeLists(); out.push(`<h${h[1].length}>${inlineMd(h[2])}</h${h[1].length}>`); i++; continue; }

    if (/^\s*[-*]\s+/.test(line)) {
      flushPara();
      if (listStack === 0) { out.push("<ul>"); listStack = 1; }
      out.push("<li>" + inlineMd(line.replace(/^\s*[-*]\s+/, "")) + "</li>");
      i++; continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      flushPara();
      if (listStack === 0) { out.push("<ul>"); listStack = 1; }
      out.push("<li>" + inlineMd(line.replace(/^\s*\d+\.\s+/, "")) + "</li>");
      i++; continue;
    }
    if (/^\s*>\s?/.test(line)) {
      flushPara(); closeLists();
      out.push("<blockquote><p>" + inlineMd(line.replace(/^\s*>\s?/, "")) + "</p></blockquote>");
      i++; continue;
    }
    if (/^\s*(---|\*\*\*)\s*$/.test(line)) { flushPara(); closeLists(); out.push("<hr>"); i++; continue; }
    if (line.trim() === "") { flushPara(); closeLists(); i++; continue; }

    para.push(line.trim());
    i++;
  }
  flushPara(); closeLists();
  return out.join("\n");
}

/* ------------------------------ Templates --------------------------------- */
/* One-click example projects. `state` is merged over DEFAULTS by the app.   */

const TEMPLATES = [
  {
    id: "cricket-quiz", icon: "🏏", title: "Cricket Quiz Game",
    desc: "A quiz-master SLM for a cricket trivia game: emits questions as strict JSON (question, 4 options, answer, difficulty, explanation), checks answers, banters like a quiz host. Small enough (0.6B) to embed in a game and run on any laptop.",
    tags: ["quiz task", "distill path", "runs on CPU", "free Colab training"],
    state: {
      name: "cricket-quiz-slm", domain: "sports", domainText: "",
      topic: "International and IPL cricket trivia: players, records, World Cups (1975–today), rules and laws, famous matches and rivalries. Questions must be factually verifiable, at easy/medium/hard levels, suitable for a quiz game.",
      task: "quiz", tone: "energetic, playful, like a quiz-show host",
      deployTarget: "cpu", contextLen: 2048, dataAvail: "none", budget: "colab",
      path: "distill", teacher: "claude", sftCount: 8000, baseModel: "qwen3-0.6b",
      method: "qlora", framework: "unsloth", hw: "t4", seqLen: 1024, epochs: 3,
      evalHoldout: 400, quant: "q4_k_m", runtime: "llamacpp",
      sources: ["Synthetic data from an LLM teacher", "Public datasets (Hugging Face)", "Existing structured data (DBs, spreadsheets)"],
    },
  },
  {
    id: "cricket-expert", icon: "🎙️", title: "Cricket Expert Assistant",
    desc: "A commentator-grade cricket brain: rules and umpiring calls, tactics, player stats, history across Test/ODI/T20/IPL, match analysis. DPO stage included so it learns pundit-quality judgment, not just facts.",
    tags: ["assistant task", "distill + DPO", "1.7B", "Ollama"],
    state: {
      name: "cricket-expert-slm", domain: "sports", domainText: "",
      topic: "Cricket expertise: laws of the game and umpiring decisions, tactics and field placements, player statistics and records, history of Test/ODI/T20 formats and the IPL, famous matches, and match analysis.",
      task: "assistant", tone: "knowledgeable, enthusiastic, commentator-style",
      deployTarget: "gpu24", contextLen: 4096, dataAvail: "none", budget: "single24",
      path: "distill", teacher: "claude", sftCount: 15000, prefCount: 4000, stageDpo: true,
      baseModel: "qwen3-1.7b", method: "qlora", framework: "unsloth", hw: "rtx4090",
      seqLen: 2048, epochs: 3, evalHoldout: 500, quant: "q4_k_m", runtime: "ollama",
      sources: ["Synthetic data from an LLM teacher", "Public datasets (Hugging Face)", "Websites / knowledge bases (scraped with permission)"],
    },
  },
  {
    id: "trivia-engine", icon: "🎯", title: "General Trivia Quiz Engine",
    desc: "A pub-quiz engine across science, history, geography, movies, music, and sports. Same JSON quiz contract as the cricket template — swap the topic and you have a quiz SLM for anything.",
    tags: ["quiz task", "any topic", "1.7B"],
    state: {
      name: "trivia-quiz-slm", domain: "general",
      topic: "General-knowledge pub-quiz trivia across science, history, geography, movies, music, literature, and sports. Balanced category coverage; every question verifiable.",
      task: "quiz", tone: "witty, fast-paced quiz host",
      deployTarget: "gpu24", contextLen: 2048, dataAvail: "none", budget: "colab",
      path: "distill", teacher: "claude", sftCount: 12000, baseModel: "qwen3-1.7b",
      method: "qlora", framework: "unsloth", hw: "t4", seqLen: 1024, epochs: 3,
      evalHoldout: 500, quant: "q4_k_m", runtime: "ollama",
      sources: ["Synthetic data from an LLM teacher", "Public datasets (Hugging Face)"],
    },
  },
  {
    id: "tax-helper", icon: "🧾", title: "Income-Tax Q&A Helper",
    desc: "A grounded Q&A model for Indian income-tax rules for salaried employees: deductions, regimes, filing. Built to answer from provided context (pairs with RAG) and say \"I don't know\" rather than guess.",
    tags: ["Q&A / RAG task", "finance domain", "privacy-friendly"],
    state: {
      name: "tax-helper-slm", domain: "finance",
      topic: "Indian income-tax rules for salaried employees: old vs new regime, deductions (80C/80D/HRA), TDS, ITR filing, capital gains basics. Answers must cite the provided context and flag when rules may have changed.",
      task: "qa", tone: "precise, patient, plain-language",
      deployTarget: "gpu24", contextLen: 8192, dataAvail: "small", budget: "single24",
      path: "finetune", teacher: "claude", sftCount: 10000, baseModel: "qwen3-1.7b",
      method: "qlora", framework: "unsloth", hw: "rtx4090", seqLen: 4096, epochs: 2,
      evalHoldout: 500, quant: "q5_k_m", runtime: "ollama", privacy: true,
      sources: ["Synthetic data from an LLM teacher", "Books / papers / regulations (licensed)", "Expert-written examples (SMEs)"],
    },
  },
  {
    id: "support-bot", icon: "🎧", title: "Customer Support Bot",
    desc: "A product-support assistant trained on your tickets, docs, and macros. Includes the feedback flywheel so real conversations keep improving it after launch.",
    tags: ["assistant task", "fine-tune + DPO", "vLLM production"],
    state: {
      name: "support-bot-slm", domain: "support",
      topic: "Customer support for <your product>: account issues, billing, troubleshooting, how-to guidance, escalation etiquette. Replace this sentence with your product's specifics.",
      task: "assistant", tone: "warm, efficient, solution-first",
      deployTarget: "server", contextLen: 4096, dataAvail: "medium", budget: "single24",
      path: "finetune", teacher: "gpt", sftCount: 20000, prefCount: 5000, stageDpo: true,
      baseModel: "phi-4-mini", method: "qlora", framework: "axolotl", hw: "a100-40",
      seqLen: 2048, epochs: 2, evalHoldout: 800, quant: "q4_k_m", runtime: "vllm",
      sources: ["Support tickets / chat logs / emails", "Internal documents (wikis, manuals, PDFs)", "Synthetic data from an LLM teacher", "Expert-written examples (SMEs)"],
    },
  },
  {
    id: "study-tutor", icon: "📚", title: "Class-10 Science Tutor",
    desc: "A patient CBSE Class-10 science tutor: explains concepts step by step, quizzes the student, adapts to mistakes. A great template for any curriculum-bound education SLM.",
    tags: ["education domain", "assistant task", "runs on CPU"],
    state: {
      name: "science-tutor-slm", domain: "education",
      topic: "CBSE Class 10 science (NCERT syllabus): physics (light, electricity), chemistry (reactions, acids/bases, carbon compounds), biology (life processes, heredity). Explain step by step at a 15-year-old's level, with everyday examples.",
      task: "assistant", tone: "encouraging, patient teacher; simple English",
      deployTarget: "cpu", contextLen: 4096, dataAvail: "none", budget: "colab",
      path: "distill", teacher: "claude", sftCount: 12000, baseModel: "qwen3-1.7b",
      method: "qlora", framework: "unsloth", hw: "t4", seqLen: 2048, epochs: 3,
      evalHoldout: 500, quant: "q4_k_m", runtime: "ollama",
      sources: ["Synthetic data from an LLM teacher", "Books / papers / regulations (licensed)", "Public datasets (Hugging Face)"],
    },
  },
];
