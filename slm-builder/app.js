/* ============================================================================
 * SLM Builder Studio — app.js (wizard UI + state)
 * Depends on gen.js (catalogs, estimators, generators, zip, markdown).
 * ==========================================================================*/

"use strict";

/* ------------------------------- State ----------------------------------- */

const DEFAULTS = {
  // 1. Define
  name: "my-domain-slm",
  domain: "general",
  domainText: "",
  topic: "",
  task: "assistant",
  tone: "professional, friendly",
  languages: "English",
  deployTarget: "gpu24",
  contextLen: 4096,
  privacy: false,
  // 2. Path
  dataAvail: "small",
  budget: "single24",
  path: "finetune",
  // 3. Data
  sources: ["Synthetic data from an LLM teacher", "Public datasets (Hugging Face)"],
  sftCount: 10000,
  prefCount: 5000,
  cptTokens: 1,
  teacher: "claude",
  // 4. Model
  baseModel: "qwen3-1.7b",
  scratchParams: 125,
  // 5. Training
  method: "qlora",
  framework: "unsloth",
  hw: "rtx4090",
  seqLen: 2048,
  epochs: 3,
  lr: "2e-4",
  batch: 4,
  gradAccum: 4,
  loraR: 16,
  stageDpo: false,
  stageGrpo: false,
  tracking: "wandb",
  // 6. Eval
  evalHoldout: 500,
  benches: ["mmlu", "hellaswag", "arc_easy"],
  // 7. Deploy
  quant: "q4_k_m",
  runtime: "ollama",
};

let S = loadState();
let currentStep = 0;
let visited = new Set([0]);

function loadState() {
  try {
    const raw = localStorage.getItem("slm-builder-state");
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch (e) { /* ignore */ }
  return { ...DEFAULTS };
}
function persist() {
  try { localStorage.setItem("slm-builder-state", JSON.stringify(S)); } catch (e) { /* ignore */ }
}

/* ------------------------------ Helpers ---------------------------------- */

const $ = sel => document.querySelector(sel);
const el = id => document.getElementById(id);

function toast(msg) {
  const t = el("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2200);
}

function slug(s) {
  return (s || "my-domain-slm").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "my-domain-slm";
}

function field(label, inner, hint) {
  return `<div class="field"><label>${label}</label>${inner}${hint ? `<div class="hint">${hint}</div>` : ""}</div>`;
}
function textInput(k, ph) {
  return `<input type="text" data-k="${k}" value="${String(S[k]).replace(/"/g, "&quot;")}" placeholder="${ph || ""}">`;
}
function numInput(k, min, max, step) {
  return `<input type="number" data-k="${k}" value="${S[k]}" min="${min}" max="${max}" step="${step || 1}">`;
}
function select(k, opts) {
  return `<select data-k="${k}">` + opts.map(([v, t]) =>
    `<option value="${v}"${String(S[k]) === String(v) ? " selected" : ""}>${t}</option>`).join("") + `</select>`;
}
function cards(k, items) {
  return `<div class="cards">` + items.map(it => `
    <div class="card${S[k] === it.v ? " selected" : ""}" data-k="${k}" data-v="${it.v}">
      <div class="t">${it.t}${it.badge ? `<span class="badge ${it.badgeCls || ""}">${it.badge}</span>` : ""}</div>
      <div class="d">${it.d}</div>
    </div>`).join("") + `</div>`;
}
function checks(k, items) {
  return `<div class="checks">` + items.map(it => {
    const v = typeof it === "string" ? it : it.v;
    const label = typeof it === "string" ? it : it.t;
    const sm = typeof it === "string" ? "" : (it.d ? `<span class="sm"> — ${it.d}</span>` : "");
    const on = (S[k] || []).includes(v);
    return `<label><input type="checkbox" data-arr="${k}" value="${v.replace(/"/g, "&quot;")}"${on ? " checked" : ""}><span>${label}${sm}</span></label>`;
  }).join("") + `</div>`;
}
function toggle(k, label, hint) {
  return `<label style="display:flex;gap:9px;align-items:flex-start;cursor:pointer;font-size:13.5px;margin:8px 0">
    <input type="checkbox" data-k="${k}"${S[k] ? " checked" : ""} style="margin-top:4px;accent-color:var(--accent)">
    <span><b>${label}</b>${hint ? `<span class="sm" style="color:var(--muted);font-size:12px"> — ${hint}</span>` : ""}</span></label>`;
}
function stat(v, k, cls) {
  return `<div class="stat ${cls || ""}"><div class="v">${v}</div><div class="k">${k}</div></div>`;
}

/* ------------------------- Recommendation logic --------------------------- */

function recommendPath() {
  if (S.dataAvail === "large" && (S.budget === "multi" || S.budget === "cluster")) return "cpt";
  if (S.dataAvail === "none") return "distill";
  return "finetune";
}

function recommendModel() {
  const target = S.deployTarget;
  if (target === "edge") return "smollm2-360m";
  if (target === "cpu") return S.task === "code" ? "qwen3-1.7b" : "qwen3-1.7b";
  if (target === "server") return S.task === "code" || S.task === "extraction" ? "qwen3-4b" : "phi-4-mini";
  return "qwen3-1.7b"; // gpu24
}

function recommendMethod() {
  const gpu = pickGpu(S.hw);
  const m = S.path === "scratch" ? { params: scratchArch(S.scratchParams).actualM / 1000 } : pickModel(S.baseModel);
  if (vramNeeded(m.params, "full", S.seqLen) <= gpu.vram * 0.9) return "full";
  if (vramNeeded(m.params, "lora", S.seqLen) <= gpu.vram * 0.9) return "lora";
  return "qlora";
}

/* ------------------------------- Steps ------------------------------------ */

const STEPS = [
  { id: "define",  title: "Define",     render: stepDefine },
  { id: "path",    title: "Build path", render: stepPath },
  { id: "data",    title: "Data",       render: stepData },
  { id: "model",   title: "Model",      render: stepModel },
  { id: "train",   title: "Training",   render: stepTrain },
  { id: "eval",    title: "Evaluation", render: stepEval },
  { id: "deploy",  title: "Deployment", render: stepDeploy },
  { id: "export",  title: "Export",     render: stepExport },
];

function stepDefine() {
  return `
  <h2>1 · Define your SLM</h2>
  <p class="sub">Everything downstream — data prompts, training configs, system prompt, deployment — is generated from these answers.
  New here? <a href="#" id="goto-examples">Start from an example</a> (cricket quiz game, support bot, tutor…) and tweak from there.</p>

  <div class="grid2">
    ${field("Project name", textInput("name", "support-bot-slm"), "Used for file names, model names, output dirs.")}
    ${field("Domain", select("domain", [
      ["general", "General purpose"], ["legal", "Legal"], ["medical", "Medical / healthcare"],
      ["finance", "Finance"], ["support", "Customer support"], ["ecommerce", "E-commerce / retail"],
      ["education", "Education"], ["science", "Science / research"], ["code", "Software / code"],
      ["sports", "Sports / gaming"], ["custom", "Custom (describe below)"],
    ]), "Drives dataset suggestions and prompt templates.")}
  </div>
  ${S.domain === "custom" ? field("Custom domain", textInput("domainText", "e.g. maritime logistics, veterinary medicine, Tamil literature"), "Any topic works — the generators adapt.") : ""}
  ${field("Topic focus <span style='color:var(--muted);font-weight:400'>(optional but powerful)</span>",
    `<textarea data-k="topic" placeholder="e.g. Indian income-tax rules for salaried employees; troubleshooting Kubernetes networking; GDPR compliance for SaaS startups">${escapeHtml(S.topic)}</textarea>`,
    "The narrower the focus, the better a small model performs. 1–3 sentences describing exactly what it should be expert in.")}

  <h3>Task type</h3>
  ${cards("task", [
    { v: "assistant", t: "💬 Domain assistant", d: "Open-ended expert chat & advice in your domain. The most common choice." },
    { v: "qa", t: "❓ Q&A / RAG answerer", d: "Answers questions, optionally grounded in provided context (pairs well with RAG)." },
    { v: "summarization", t: "📝 Summarizer", d: "Condenses domain documents: reports, tickets, papers, calls." },
    { v: "extraction", t: "🧾 Structured extraction", d: "Text → JSON: entities, fields, classifications with a schema." },
    { v: "classification", t: "🏷️ Classifier", d: "Routes/labels text: intent, priority, category, sentiment." },
    { v: "code", t: "⌨️ Code assistant", d: "Generates/explains code for a specific stack or internal framework." },
    { v: "quiz", t: "🎲 Quiz generator", d: "Quiz-master for games: emits questions as strict JSON (options, answer, difficulty, explanation) and checks answers." },
  ])}

  <h3>Behavior & constraints</h3>
  <div class="grid3">
    ${field("Tone / persona", textInput("tone", "professional, friendly"), "")}
    ${field("Languages", textInput("languages", "English"), "Multilingual? Qwen3 is the strongest small multilingual base.")}
    ${field("Target context length", select("contextLen", [[2048, "2K — short exchanges"], [4096, "4K — typical chat"], [8192, "8K — long docs"], [16384, "16K — very long docs"]]), "")}
  </div>

  <h3>Where will it run?</h3>
  ${cards("deployTarget", [
    { v: "cpu", t: "💻 Laptop / CPU-only", d: "Runs via llama.cpp/Ollama, quantized. Keep the model ≤ 2B for snappy responses." },
    { v: "gpu24", t: "🎮 Single GPU (8–24 GB)", d: "Consumer GPU or small cloud instance. Sweet spot: 1–4B models.", badge: "Common", badgeCls: "blue" },
    { v: "server", t: "🖥️ GPU server / cloud", d: "vLLM with batching for many users. Up to 4B+ models comfortably." },
    { v: "edge", t: "📱 Mobile / edge / browser", d: "≤ 0.6B models, aggressive quantization, ONNX/ExecuTorch runtimes." },
  ])}
  ${toggle("privacy", "Strict privacy / on-prem only", "no data leaves your infrastructure; affects teacher-model advice and adds de-identification steps")}
  `;
}

function stepPath() {
  const rec = recommendPath();
  const names = { finetune: "Fine-tune an existing SLM", distill: "Distill from an LLM teacher", cpt: "Continued pretraining + SFT", scratch: "Pretrain from scratch" };
  return `
  <h2>2 · Choose your build path</h2>
  <p class="sub">Answer two questions and the studio recommends a path. You can override — every path generates a complete pipeline.</p>

  <div class="grid2">
    ${field("How much domain training data do you already have?", select("dataAvail", [
      ["none", "None yet — starting from zero"],
      ["small", "Small — hundreds to a few thousand examples/documents"],
      ["medium", "Medium — 10K+ examples or ~100MB+ of domain text"],
      ["large", "Large — GBs of domain text (wikis, archives, corpora)"],
    ]))}
    ${field("Compute budget", select("budget", [
      ["colab", "Free tier — Colab/Kaggle T4"],
      ["single24", "Single 24 GB GPU (own or ~$0.5/hr cloud)"],
      ["multi", "Multi-GPU node (~$5–15/hr)"],
      ["cluster", "Cluster budget ($1K+ for the project)"],
    ]))}
  </div>

  <div class="callout good"><b>Recommended for you: ${names[rec]}.</b>
  <span class="muted">Based on your data availability and budget. This is the industry-standard route for this situation.</span></div>

  ${cards("path", [
    { v: "finetune", t: "🎯 Fine-tune an existing SLM", badge: rec === "finetune" ? "Recommended" : "Most popular", badgeCls: "green",
      d: "QLoRA/LoRA on a strong open base (Qwen3, Llama 3.2, Phi-4-mini…). Hours on one GPU, ~$0–20. Delivers 95% of the value for 1% of the cost. Start here unless you have a strong reason not to." },
    { v: "distill", t: "🧪 Distill from an LLM teacher", badge: rec === "distill" ? "Recommended" : "No data needed", badgeCls: rec === "distill" ? "green" : "blue",
      d: "A frontier LLM (Claude/GPT/large open model) generates your training set, then you fine-tune a small student on it. This is how Phi and many domain SLMs are built. Perfect when you have zero data." },
    { v: "cpt", t: "📚 Continued pretraining + SFT", badge: rec === "cpt" ? "Recommended" : "Deep expertise", badgeCls: rec === "cpt" ? "green" : "amber",
      d: "First soak the base model in GBs of raw domain text (teaches vocabulary & facts), then SFT for behavior. Needed when the domain is far from the base model's knowledge. Days of GPU time." },
    { v: "scratch", t: "🔬 Pretrain from scratch", badge: "Full control", badgeCls: "amber",
      d: "Train your own architecture and tokenizer on your own corpus (nanoGPT/nanochat style). Maximal control & learning; needs ~20 tokens per parameter and real GPU budget. Choose for research, novel languages/formats, or education." },
  ])}

  <table class="mini">
    <tr><th>Path</th><th>Data needed</th><th>Compute</th><th>Wall clock</th><th>Typical cost</th></tr>
    <tr><td>Fine-tune</td><td class="num">1K–50K pairs</td><td>1 GPU</td><td>hours</td><td class="num">$0–20</td></tr>
    <tr><td>Distill</td><td class="num">none (teacher generates)</td><td>1 GPU + API</td><td>hours–days</td><td class="num">$10–200 API</td></tr>
    <tr><td>CPT + SFT</td><td class="num">0.5–10B tokens</td><td>1–8 GPUs</td><td>days</td><td class="num">$50–2K</td></tr>
    <tr><td>From scratch</td><td class="num">~20× params tokens</td><td>1–8+ GPUs</td><td>days–weeks</td><td class="num">$50 (125M) – $10K+ (1B+)</td></tr>
  </table>
  `;
}

function stepData() {
  const tb = tokenBudget(S.scratchParams);
  const hints = DOMAIN_DATASET_HINTS[S.domain] || DOMAIN_DATASET_HINTS.general;
  return `
  <h2>3 · Plan your data</h2>
  <p class="sub">Data quality is 80% of the outcome. The studio generates a data plan, a synthetic-data pipeline, and a cleaning/splitting script from this step.</p>

  <h3>Sources you'll draw from</h3>
  ${checks("sources", [
    { v: "Synthetic data from an LLM teacher", t: "🤖 Synthetic (LLM teacher)", d: "highest leverage; generator script included" },
    { v: "Public datasets (Hugging Face)", t: "🤗 Public datasets", d: "curated suggestions for your domain below" },
    { v: "Internal documents (wikis, manuals, PDFs)", t: "📄 Internal documents", d: "convert to Q&A with the teacher prompts" },
    { v: "Support tickets / chat logs / emails", t: "🎫 Tickets & chat logs", d: "real user language; de-identify first" },
    { v: "Websites / knowledge bases (scraped with permission)", t: "🌐 Web / KB content", d: "check licenses & robots.txt" },
    { v: "Expert-written examples (SMEs)", t: "👩‍🏫 Expert-written", d: "small but gold — worth 10× synthetic" },
    { v: "Existing structured data (DBs, spreadsheets)", t: "🗄️ Structured data", d: "template into Q&A pairs" },
    { v: "Books / papers / regulations (licensed)", t: "📚 Books & papers", d: "great for CPT corpora" },
  ])}

  <div class="callout"><b>For "${S.domain}" specifically, mine these first:</b><br>
  ${hints.map(h => `· ${escapeHtml(h)}`).join("<br>")}</div>

  <h3>Quantity targets</h3>
  <div class="grid3">
    ${field("SFT examples", numInput("sftCount", 200, 500000, 100),
      "Start at 1–10K. LIMA showed 1K excellent examples can beat 50K mediocre ones.")}
    ${S.stageDpo ? field("Preference pairs (DPO)", numInput("prefCount", 500, 100000, 100), "Chosen vs. rejected answers.") : ""}
    ${S.path === "cpt" ? field("CPT corpus (billions of tokens)", numInput("cptTokens", 0.1, 50, 0.1), "~4 GB text ≈ 1B tokens.") : ""}
    ${field("Frozen eval set (held out)", numInput("evalHoldout", 100, 5000, 50), "Never trained on; your ship gate.")}
  </div>
  ${S.path === "scratch" ? `<div class="callout warn"><b>From-scratch pretraining corpus:</b> your ~${scratchArch(S.scratchParams).actualM}M-param model wants
  <b>~${fmtNum(tb.tokens)} tokens (~${tb.textGB.toFixed(0)} GB of raw text)</b> (Chinchilla ~${tb.mult}× params). Blend your domain corpus with a
  general web corpus like <code>HuggingFaceFW/fineweb-edu</code> (aim ≥ 30% domain share).</div>` : ""}

  <h3>Synthetic data teacher</h3>
  ${cards("teacher", [
    { v: "claude", t: "Claude (Anthropic API)", d: "Excellent instruction-following & long expert answers. Generator script uses the Anthropic SDK." },
    { v: "gpt", t: "OpenAI API", d: "GPT-4.1-class teachers. Generator script uses the OpenAI SDK." },
    { v: "qwen", t: "Open teacher (self-hosted / OpenRouter)", d: `Qwen3-235B, DeepSeek-V3, Llama-405B via any OpenAI-compatible endpoint. ${S.privacy ? "<b>Best fit for your privacy constraint.</b>" : "Cheapest at scale; fully private if self-hosted."}` },
  ])}
  ${S.privacy && S.teacher !== "qwen" ? `<div class="callout warn"><b>Privacy note:</b> you set "on-prem only" but chose a hosted teacher API. Either use an open teacher served locally (vLLM), or ensure only non-sensitive seed content is sent to the API.</div>` : ""}

  <div class="callout"><b>Pipeline you'll get:</b> taxonomy generation (50 subtopics) → diverse question generation per subtopic → gold-answer generation with your system prompt → LLM self-critique filter (drops scores &lt; 4) → dedup/split. Resumable, with a small pilot mode (<code>--n 500</code>) to validate quality before spending on the full run.</div>
  `;
}

function stepModel() {
  if (S.path === "scratch") {
    const arch = scratchArch(S.scratchParams);
    const tb = tokenBudget(S.scratchParams);
    return `
    <h2>4 · Design your model</h2>
    <p class="sub">From-scratch path: pick a parameter budget and the studio derives a standard GPT architecture, tokenizer size, and token budget.</p>

    ${field(`Model size: <b>~${S.scratchParams}M parameters</b>`,
      `<input type="range" data-k="scratchParams" min="10" max="1500" step="5" value="${S.scratchParams}">`,
      "10–50M: toy/learning · 125M: GPT-2 small class, trainable for ~$50 · 350M–1B: genuinely useful narrow models · >1B: needs multi-GPU")}

    <div class="stats">
      ${stat(arch.actualM + "M", "actual params")}
      ${stat(`${arch.layers}×${arch.d}`, "layers × d_model")}
      ${stat(arch.heads, "attn heads")}
      ${stat(fmtNum(arch.vocab), "BPE vocab")}
      ${stat(fmtNum(tb.tokens), "token budget")}
      ${stat("~" + tb.textGB.toFixed(0) + " GB", "raw text needed")}
    </div>

    <div class="callout"><b>What gets generated:</b> <code>tokenizer_train.py</code> (custom ${fmtNum(arch.vocab)} BPE on your corpus) and
    <code>pretrain_scratch.py</code> — a compact, readable nanoGPT-style trainer (weight tying, cosine schedule, warmup, grad clipping,
    bf16, torch.compile). For >1B params, graduate to <a href="https://github.com/Lightning-AI/litgpt" target="_blank">litgpt</a> or
    <a href="https://github.com/karpathy/nanochat" target="_blank">nanochat</a> — same concepts, production plumbing.</div>

    <div class="callout warn"><b>Reality check:</b> a from-scratch ${arch.actualM}M model will be far weaker at general skills than a fine-tuned
    Qwen3-0.6B. Choose this path for control, research, novel tokenizers/languages, or learning — not for maximum quality per dollar.</div>
    `;
  }

  const rec = recommendModel();
  return `
  <h2>4 · Pick your base model</h2>
  <p class="sub">The 2026 small-model landscape, curated. Recommendation is based on your deploy target (${S.deployTarget}) and task (${S.task}).</p>

  ${cards("baseModel", MODELS.map(m => ({
    v: m.id,
    t: `${m.id} · ${m.params}B`,
    badge: m.id === rec ? "Recommended" : m.lic,
    badgeCls: m.id === rec ? "green" : (m.lic === "Apache-2.0" || m.lic === "MIT" ? "blue" : ""),
    d: `${m.note}<br><span style="opacity:.75">${m.hf} · ctx ${fmtNum(m.ctx)} · serve ~${vramServe(m.params).toFixed(1)} GB @4-bit</span>`,
  })))}

  <div class="callout"><b>How to choose:</b>
  <b>License</b> — Apache-2.0/MIT (Qwen3, SmolLM, Phi-4-mini, TinyLlama) are safest for commercial products; Llama/Gemma licenses are workable but read them.
  <b>Size</b> — smallest that passes your eval gate: 0.6B for edge/simple tasks, 1–2B for focused assistants, 3–4B when reasoning quality matters.
  <b>Multilingual</b> — Qwen3 leads. <b>Math/reasoning</b> — Phi-4-mini. <b>Open recipe</b> — SmolLM3 publishes its full training pipeline.</div>
  `;
}

function stepTrain() {
  const isScratch = S.path === "scratch";
  const paramsB = isScratch ? scratchArch(S.scratchParams).actualM / 1000 : pickModel(S.baseModel).params;
  const gpu = pickGpu(S.hw);
  const need = vramNeeded(paramsB, S.method, S.seqLen);
  const fits = need <= gpu.vram * 0.92;
  const recM = recommendMethod();

  return `
  <h2>5 · Configure training</h2>
  <p class="sub">Sensible defaults are pre-filled. The studio checks that your configuration fits your hardware.</p>

  <h3>Hardware</h3>
  ${field("Training GPU", select("hw", GPUS.map(g => [g.id, g.name])))}
  <div class="stats">
    ${stat(gpu.vram + " GB", "available VRAM")}
    ${stat(need.toFixed(1) + " GB", "estimated need", fits ? "ok" : "bad")}
    ${stat(fits ? "FITS ✓" : "TOO BIG ✗", "verdict", fits ? "ok" : "bad")}
  </div>
  ${!fits ? `<div class="callout bad"><b>Won't fit.</b> Options: switch to QLoRA, pick a smaller base model, shorten the sequence length, or lower the batch size (raise grad-accum to compensate).</div>` : ""}

  <h3>Method ${recM !== S.method ? `<span class="badge blue" style="text-transform:none">tip: ${recM.toUpperCase()} also fits your GPU</span>` : ""}</h3>
  ${cards("method", [
    { v: "qlora", t: "QLoRA (4-bit + adapters)", badge: "Default", badgeCls: "green", d: "Base frozen in 4-bit, small trainable adapters. ~1-2% quality trade for 10× less VRAM. Fine-tunes 4B models on a free T4." },
    { v: "lora", t: "LoRA (16-bit + adapters)", d: "Adapters on a bf16 base. Slightly better than QLoRA, needs ~2.5× the memory." },
    { v: "full", t: "Full fine-tune", d: "Update every weight. Best quality ceiling; needs ~16 GB VRAM per 1B params. Usually unnecessary for domain SLMs." },
  ])}

  <h3>Framework</h3>
  ${cards("framework", [
    { v: "unsloth", t: "Unsloth", badge: "Fastest 1-GPU", badgeCls: "green", d: "2–5× faster, ~70% less VRAM via custom kernels. Single GPU only. Great on Colab. Generates a ready train_sft.py." },
    { v: "axolotl", t: "Axolotl", badge: "YAML + multi-GPU", badgeCls: "blue", d: "Config-driven; DeepSpeed/FSDP multi-GPU; huge community recipes. Generates axolotl_sft.yml." },
    { v: "trl", t: "HF TRL (plain)", d: "Pure transformers+peft+trl script — maximum transparency and hackability. Generates train_sft.py." },
  ])}

  <h3>Hyperparameters</h3>
  <div class="grid3">
    ${field("Epochs", numInput("epochs", 1, 10), "2–3 for 1K–20K examples; 1 for 50K+.")}
    ${field("Learning rate", textInput("lr"), "LoRA/QLoRA: 2e-4 · full FT: 2e-5 · DPO: 5e-6.")}
    ${field("Sequence length (train)", select("seqLen", [[1024, "1024"], [2048, "2048"], [4096, "4096"], [8192, "8192"]]), "Longest example you'll train on; VRAM scales with it.")}
    ${field("Per-device batch size", numInput("batch", 1, 64), "")}
    ${field("Gradient accumulation", numInput("gradAccum", 1, 64), `Effective batch = <span id="eff-batch">${S.batch * S.gradAccum}</span>. Aim 16–64.`)}
    ${S.method !== "full" ? field("LoRA rank (r)", select("loraR", [[8, "8 — lightest"], [16, "16 — default"], [32, "32 — more capacity"], [64, "64 — near-full-FT (CPT)"]]), "alpha auto-set to 2×r.") : ""}
  </div>

  <h3>Stages</h3>
  ${toggle("stageDpo", "Add DPO preference tuning after SFT", "teaches style/judgment beyond imitation; needs chosen/rejected pairs (generator prompt included). Do it once SFT is solid.")}
  ${toggle("stageGrpo", "Plan a GRPO reasoning stage (advanced)", "RL with verifiable rewards (math/code/exact answers). Noted in the runbook; use TRL's GRPOTrainer when you get there.")}

  <div class="grid2">
  ${field("Experiment tracking", select("tracking", [["wandb", "Weights & Biases"], ["none", "None / console logs"]]))}
  </div>
  `;
}

function stepEval() {
  return `
  <h2>6 · Define evaluation</h2>
  <p class="sub">If you can't measure it, you can't improve it — and you definitely can't ship it. Three layers, generated into <code>eval/</code>.</p>

  <h3>Layer 1 — general-ability smoke test (lm-evaluation-harness)</h3>
  <p class="sub" style="margin-bottom:8px">Run on base AND tuned model; a &gt;5-point drop = catastrophic forgetting.</p>
  ${checks("benches", [
    { v: "mmlu", t: "MMLU", d: "broad knowledge, 57 subjects" },
    { v: "hellaswag", t: "HellaSwag", d: "commonsense" },
    { v: "arc_easy", t: "ARC-Easy", d: "science QA" },
    { v: "arc_challenge", t: "ARC-Challenge", d: "harder science QA" },
    { v: "gsm8k", t: "GSM8K", d: "grade-school math (reasoning)" },
    { v: "truthfulqa_mc2", t: "TruthfulQA", d: "resistance to misconceptions" },
    { v: "winogrande", t: "WinoGrande", d: "coreference commonsense" },
    { v: "humaneval", t: "HumanEval", d: "code generation (code tasks)" },
  ])}

  <h3>Layer 2 — domain test set + LLM judge</h3>
  <div class="grid2">
    ${field("Frozen test set size", numInput("evalHoldout", 100, 5000, 50), "Split out by prepare_data.py; never trained on, never regenerated.")}
    ${field("Judge model", select("teacher", [["claude", "Claude (Anthropic API)"], ["gpt", "OpenAI API"], ["qwen", "Open judge (self-hosted)"]]), "Reuses your teacher choice; a strong judge scores correctness/helpfulness/style 1–5.")}
  </div>
  <div class="callout"><b>Ship gate:</b> judge mean ≥ 4.0/5 <i>and</i> ≥ base model + 0.5. Judging the base model once gives you the baseline — skipping that comparison is the #1 eval mistake.</div>

  <h3>Layer 3 — human review</h3>
  <div class="callout good">Generated into <code>eval/EVAL_PLAN.md</code>: 25-answer expert review with an error taxonomy (factual, stale, format, over/under-refusal, hallucinated citation), 20 adversarial prompts (injection, out-of-scope, PII fishing), and a latency check on your target hardware.</div>
  `;
}

function stepDeploy() {
  const m = pickModel(S.baseModel);
  const paramsB = S.path === "scratch" ? scratchArch(S.scratchParams).actualM / 1000 : m.params;
  return `
  <h2>7 · Deployment & scale</h2>
  <p class="sub">From a local demo to a production service with a feedback flywheel. All files generated into <code>deploy/</code>.</p>

  <h3>Quantization</h3>
  ${cards("quant", [
    { v: "q4_k_m", t: "Q4_K_M", badge: "Default", badgeCls: "green", d: "~4.5 bits/weight. Best size/quality trade; the community standard. ~" + (paramsB * 0.65).toFixed(1) + " GB file." },
    { v: "q5_k_m", t: "Q5_K_M", d: "Noticeably closer to fp16 quality, ~20% bigger." },
    { v: "q8_0", t: "Q8_0", d: "Near-lossless; use when quality regressions from Q4 show up in your judge scores." },
  ])}

  <h3>Runtime</h3>
  ${cards("runtime", [
    { v: "ollama", t: "🦙 Ollama", badge: "Easiest", badgeCls: "green", d: "One-command local serving with an OpenAI-compatible API. Perfect for laptops, demos, small teams. Modelfile generated." },
    { v: "vllm", t: "⚡ vLLM", badge: "Production", badgeCls: "blue", d: "Continuous batching, prefix caching, high throughput on GPUs. The default for real multi-user services. serve script generated." },
    { v: "llamacpp", t: "🔧 llama.cpp server", d: "Minimal-footprint C++ server for the GGUF; CPU or GPU; embedded/edge friendly." },
  ])}

  <div class="stats">
    ${stat("~" + (paramsB * 0.65).toFixed(1) + " GB", "GGUF size @ Q4")}
    ${stat("~" + vramServe(paramsB).toFixed(1) + " GB", "serve VRAM @4-bit")}
    ${stat(S.contextLen, "context length")}
  </div>

  <h3>What gets generated</h3>
  <table class="mini">
    <tr><th>File</th><th>Purpose</th></tr>
    <tr><td><code>export_gguf.sh</code></td><td>HF → GGUF conversion + quantization via llama.cpp</td></tr>
    <tr><td><code>Modelfile</code></td><td>Ollama packaging with your system prompt baked in</td></tr>
    <tr><td><code>serve_vllm.sh</code></td><td>Production OpenAI-compatible serving</td></tr>
    <tr><td><code>app_fastapi.py</code></td><td>API gateway: system prompt, logging, <b>/feedback endpoint that feeds retraining</b></td></tr>
    <tr><td><code>Dockerfile</code></td><td>Containerized gateway + docker-compose sketch with vLLM</td></tr>
    <tr><td><code>gradio_demo.py</code></td><td>Instant chat UI for demos and human review</td></tr>
    <tr><td><code>SCALING.md</code></td><td>Load tiers, reliability/perf/observability checklists, retraining flywheel, versioning</td></tr>
  </table>

  <div class="callout good"><b>The flywheel is the point:</b> the FastAPI gateway logs every request and captures 👍/👎 + corrections. Weekly you export that feedback into the dataset; monthly you retrain and re-run the eval gates. That loop — not the first training run — is what makes a production-grade domain model.</div>
  `;
}

let activeArtifact = 0;
function stepExport() {
  S.name = slug(S.name);
  const arts = buildArtifacts(S);
  if (activeArtifact >= arts.length) activeArtifact = 0;
  const groups = [...new Set(arts.map(a => a.group))];
  const active = arts[activeArtifact];

  return `
  <h2>8 · Your generated pipeline</h2>
  <p class="sub">${arts.length} files, customized to every answer you gave. Download the bundle, follow <code>README_RUNBOOK.md</code> top to bottom, and you'll have a working ${escapeHtml(ctxSummary(S).dom)} SLM.</p>

  <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px">
    <button class="btn primary" id="btn-zip">⬇ Download all (${S.name}.zip)</button>
    <button class="btn" id="btn-dl-file">Download this file</button>
    <button class="btn" id="btn-copy">Copy this file</button>
  </div>

  <div class="artifacts">
    <div class="filelist">
      ${groups.map(g => `<div class="group">${g}</div>` + arts.map((a, i) => a.group !== g ? "" :
        `<button data-art="${i}" class="${i === activeArtifact ? "active" : ""}">${a.path}</button>`).join("")).join("")}
    </div>
    <div class="codebox">
      <div class="bar"><span>${active.path}</span><span class="spacer"></span><span>${active.content.split("\n").length} lines</span></div>
      <pre>${escapeHtml(active.content)}</pre>
    </div>
  </div>
  `;
}

/* ------------------------------ Rendering --------------------------------- */

function renderNav() {
  el("stepnav").innerHTML = STEPS.map((s, i) => `
    <button class="${i === currentStep ? "active" : ""}${visited.has(i) && i !== currentStep ? " done" : ""}" data-step="${i}">
      <span class="num">${i + 1}</span><span>${s.title}</span>
    </button>`).join("");
}

function render() {
  renderNav();
  const panel = el("steppanel");
  panel.innerHTML = STEPS[currentStep].render() + `
    <div class="stepnav">
      <button class="btn" id="nav-prev" ${currentStep === 0 ? "disabled style='opacity:.4'" : ""}>← ${currentStep > 0 ? STEPS[currentStep - 1].title : ""}</button>
      ${currentStep < STEPS.length - 1
        ? `<button class="btn primary" id="nav-next">${STEPS[currentStep + 1].title} →</button>`
        : `<button class="btn primary" id="nav-restart">Start a new project</button>`}
    </div>`;
  bind(panel);
  window.scrollTo({ top: 0 });
}

function bind(panel) {
  // text / number / textarea — update state on input only; never re-render on blur
  // (a blur-triggered re-render would destroy the element the user is clicking into)
  panel.querySelectorAll("input[type=text][data-k], input[type=number][data-k], textarea[data-k]").forEach(inp => {
    inp.addEventListener("input", () => {
      const k = inp.dataset.k;
      S[k] = inp.type === "number" ? Number(inp.value) : inp.value;
      persist();
      const eff = el("eff-batch");
      if (eff && (k === "batch" || k === "gradAccum")) eff.textContent = S.batch * S.gradAccum;
    });
  });
  // range slider — live re-render of stats via change; show label on input
  panel.querySelectorAll("input[type=range][data-k]").forEach(inp => {
    inp.addEventListener("input", () => { S[inp.dataset.k] = Number(inp.value); persist(); });
    inp.addEventListener("change", () => render());
  });
  // selects
  panel.querySelectorAll("select[data-k]").forEach(sel => {
    sel.addEventListener("change", () => {
      const v = sel.value;
      S[sel.dataset.k] = /^-?\d+$/.test(v) ? Number(v) : v;
      persist(); render();
    });
  });
  // toggles
  panel.querySelectorAll("input[type=checkbox][data-k]").forEach(cb => {
    cb.addEventListener("change", () => { S[cb.dataset.k] = cb.checked; persist(); render(); });
  });
  // checkbox arrays
  panel.querySelectorAll("input[type=checkbox][data-arr]").forEach(cb => {
    cb.addEventListener("change", () => {
      const k = cb.dataset.arr;
      const set = new Set(S[k] || []);
      cb.checked ? set.add(cb.value) : set.delete(cb.value);
      S[k] = [...set];
      persist();
    });
  });
  // cards
  panel.querySelectorAll(".card[data-k]").forEach(card => {
    card.addEventListener("click", () => {
      S[card.dataset.k] = card.dataset.v;
      persist(); render();
    });
  });
  // artifact list
  panel.querySelectorAll("[data-art]").forEach(b => {
    b.addEventListener("click", () => { activeArtifact = Number(b.dataset.art); render(); });
  });
  // "start from an example" shortcut on step 1
  const gx = el("goto-examples");
  if (gx) gx.addEventListener("click", e => { e.preventDefault(); showTab("examples"); });
  // step nav
  const prev = el("nav-prev"), next = el("nav-next"), restart = el("nav-restart");
  if (prev) prev.addEventListener("click", () => go(currentStep - 1));
  if (next) next.addEventListener("click", () => go(currentStep + 1));
  if (restart) restart.addEventListener("click", () => {
    if (confirm("Reset all answers and start a new project?")) {
      S = { ...DEFAULTS }; persist(); go(0);
    }
  });
  // export actions
  const zip = el("btn-zip");
  if (zip) zip.addEventListener("click", () => {
    const arts = buildArtifacts(S);
    downloadBlob(makeZip(arts.map(a => ({ path: `${S.name}/${a.path}`, content: a.content }))), `${S.name}.zip`);
    toast(`Downloaded ${arts.length} files as ${S.name}.zip`);
  });
  const dl = el("btn-dl-file");
  if (dl) dl.addEventListener("click", () => {
    const a = buildArtifacts(S)[activeArtifact];
    downloadBlob(new Blob([a.content], { type: "text/plain" }), a.path.split("/").pop());
  });
  const cp = el("btn-copy");
  if (cp) cp.addEventListener("click", async () => {
    const a = buildArtifacts(S)[activeArtifact];
    await navigator.clipboard.writeText(a.content);
    toast(`Copied ${a.path}`);
  });
}

function go(step) {
  currentStep = Math.max(0, Math.min(STEPS.length - 1, step));
  visited.add(currentStep);
  render();
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/* --------------------------- Tabs & top actions ---------------------------- */

const TABS = ["builder", "examples", "guide"];
function showTab(name) {
  document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("active", b.dataset.tab === name));
  TABS.forEach(t => { el("tab-" + t).style.display = t === name ? "" : "none"; });
  window.scrollTo({ top: 0 });
}
el("tabs").addEventListener("click", e => {
  const btn = e.target.closest("button[data-tab]");
  if (btn) showTab(btn.dataset.tab);
});

/* ------------------------------ Examples ---------------------------------- */

function renderExamples() {
  el("examples-list").innerHTML = `
    <h2 style="margin:0 0 4px">Example projects</h2>
    <p class="sub" style="color:var(--muted);margin:0 0 20px">One click loads the whole wizard — domain, data plan, model, training, deployment — with sensible choices for that use case. Review each step, tweak anything, then export from step 8.</p>
    <div class="cards" style="grid-template-columns:repeat(auto-fill,minmax(320px,1fr))">
      ${TEMPLATES.map(t => `
        <div class="card" data-tpl="${t.id}" style="display:flex;flex-direction:column;gap:8px">
          <div class="t" style="font-size:15px">${t.icon} ${t.title}</div>
          <div class="d">${t.d || t.desc}</div>
          <div class="pill-row" style="margin:2px 0 6px">${t.tags.map(tag => `<span class="badge blue">${tag}</span>`).join("")}</div>
          <button class="btn primary sm" data-tpl-load="${t.id}" style="align-self:flex-start">Load this example</button>
        </div>`).join("")}
    </div>
    <div class="callout" style="margin-top:22px"><b>Want a different one?</b> Load the closest template, then change the topic on step 1 — every generated file adapts. A "football quiz" is the cricket template with one sentence edited.</div>`;

  el("examples-list").addEventListener("click", e => {
    const btn = e.target.closest("[data-tpl-load]");
    if (!btn) return;
    const tpl = TEMPLATES.find(t => t.id === btn.dataset.tplLoad);
    if (!tpl) return;
    S = { ...DEFAULTS, ...tpl.state };
    persist();
    activeArtifact = 0;
    visited = new Set([0]);
    showTab("builder");
    go(0);
    toast(`Loaded "${tpl.title}" — review each step, then export`);
  });
}
renderExamples();

el("stepnav").addEventListener("click", e => {
  const b = e.target.closest("button[data-step]");
  if (b) go(Number(b.dataset.step));
});

el("btn-save").addEventListener("click", () => {
  downloadBlob(new Blob([JSON.stringify(S, null, 2)], { type: "application/json" }), `${slug(S.name)}-project.json`);
  toast("Project saved as JSON");
});
el("btn-load").addEventListener("click", () => el("file-load").click());
el("file-load").addEventListener("change", async e => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    S = { ...DEFAULTS, ...JSON.parse(await f.text()) };
    persist(); go(0);
    toast("Project loaded");
  } catch (err) {
    toast("Could not parse that file");
  }
  e.target.value = "";
});
el("btn-reset").addEventListener("click", () => {
  if (confirm("Reset all answers?")) { S = { ...DEFAULTS }; persist(); go(0); }
});

/* -------------------------------- Guide ----------------------------------- */

(function initGuide() {
  const md = el("guide-md");
  if (md) el("guide-html").innerHTML = renderMarkdown(md.textContent.trim());
})();

/* -------------------------------- Boot ------------------------------------ */

render();
