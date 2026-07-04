/* ============================================================
   QuizVerse — game engine
   Modes: classic | jeopardy | mastermind | rapidfire
   ============================================================ */

(() => {
  "use strict";

  /* ---------------- helpers ---------------- */
  const $ = (id) => document.getElementById(id);
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const sample = (arr, n) => shuffle(arr).slice(0, n);
  const decodeHTML = (s) => {
    const t = document.createElement("textarea");
    t.innerHTML = s;
    return t.value;
  };

  /* ---------------- persistent settings ---------------- */
  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem("quizverse:" + key);
        return v === null ? fallback : JSON.parse(v);
      } catch { return fallback; }
    },
    set(key, val) {
      try { localStorage.setItem("quizverse:" + key, JSON.stringify(val)); } catch {}
    },
  };

  let soundOn = store.get("sound", true);
  let theme = store.get("theme", "dark");

  /* ---------------- sound (WebAudio blips) ---------------- */
  let audioCtx = null;
  function beep(freq, dur = 0.12, type = "sine", gain = 0.08) {
    if (!soundOn) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(gain, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
      o.connect(g).connect(audioCtx.destination);
      o.start();
      o.stop(audioCtx.currentTime + dur);
    } catch {}
  }
  const sfx = {
    correct: () => { beep(660, 0.1); setTimeout(() => beep(880, 0.15), 90); },
    wrong: () => beep(180, 0.28, "sawtooth", 0.06),
    click: () => beep(440, 0.05, "triangle", 0.05),
    tick: () => beep(900, 0.04, "square", 0.03),
    fanfare: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.18), i * 130)),
    daily: () => [392, 523, 659, 784].forEach((f, i) => setTimeout(() => beep(f, 0.14, "triangle"), i * 100)),
  };

  /* ---------------- toast ---------------- */
  let toastTimer = null;
  function toast(msg, ms = 2200) {
    const el = $("toast");
    el.textContent = msg;
    el.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add("hidden"), ms);
  }

  /* ---------------- screens ---------------- */
  const SCREENS = ["home", "setup", "quiz", "jeopardy", "results", "scores", "about"];
  function show(name) {
    SCREENS.forEach((s) => $("screen-" + s).classList.toggle("active", s === name));
    window.scrollTo({ top: 0 });
  }

  /* ---------------- game state ---------------- */
  const G = {
    mode: null,          // classic | jeopardy | mastermind | rapidfire
    source: "local",     // local | online
    topic: "any",        // category key | 'any' | opentdb id
    difficulty: "medium",
    count: 10,
    questions: [],
    index: 0,
    score: 0,
    correct: 0,
    wrong: 0,
    passed: 0,
    streak: 0,
    bestStreak: 0,
    fifty: 2,
    round: 1,            // mastermind rounds
    timer: null,         // interval handle
    timeLeft: 0,
    timeTotal: 0,
    locked: false,       // answer lock during reveal
    jeo: null,           // jeopardy board state
  };

  function stopTimer() {
    if (G.timer) { clearInterval(G.timer); G.timer = null; }
  }

  /* ============================================================
     QUESTION SOURCING
     ============================================================ */

  // Draw N questions from the local bank. topic 'any' mixes all categories.
  function drawLocal(topic, difficulty, n) {
    const cats = topic === "any" ? CATEGORY_KEYS : [topic];
    let pool = [];
    for (const c of cats) {
      const cat = QUESTION_BANK[c];
      const diffs = difficulty === "mixed" ? DIFFICULTIES : [difficulty];
      for (const d of diffs) {
        for (const q of cat[d]) {
          pool.push({ category: cat.name, difficulty: d, question: q[0], correct: q[1], wrongs: q.slice(2) });
        }
      }
    }
    return sample(pool, Math.min(n, pool.length));
  }

  // Fetch questions from Open Trivia DB. topic is an OpenTDB category id or 'any'.
  async function fetchOnline(topic, difficulty, n) {
    let url = `https://opentdb.com/api.php?amount=${n}&type=multiple`;
    if (topic !== "any") url += `&category=${topic}`;
    if (difficulty !== "mixed") url += `&difficulty=${difficulty}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    if (data.response_code !== 0 || !data.results?.length) throw new Error("No questions returned");
    return data.results.map((r) => ({
      category: decodeHTML(r.category),
      difficulty: r.difficulty,
      question: decodeHTML(r.question),
      correct: decodeHTML(r.correct_answer),
      wrongs: r.incorrect_answers.map(decodeHTML),
    }));
  }

  let onlineCategories = null; // cached [{id, name}]
  async function loadOnlineCategories() {
    if (onlineCategories) return onlineCategories;
    const res = await fetch("https://opentdb.com/api_category.php");
    const data = await res.json();
    onlineCategories = data.trivia_categories.map((c) => ({ id: String(c.id), name: c.name.replace(/^Entertainment: |^Science: /, "") }));
    return onlineCategories;
  }

  /* ============================================================
     SETUP SCREEN
     ============================================================ */

  const MODE_META = {
    classic:    { title: "🎯 Classic Quiz — setup", source: true,  topic: true,  diff: true,  count: true,  topicLabel: "Topic" },
    mastermind: { title: "🧠 Mastermind — setup",   source: false, topic: true,  diff: true,  count: false, topicLabel: "Your specialist subject" },
    rapidfire:  { title: "⚡ Rapid Fire — setup",    source: false, topic: false, diff: true,  count: false, topicLabel: "Topic" },
    jeopardy:   { title: "🟦 Jeopardy",             source: false, topic: false, diff: false, count: false, topicLabel: "Topic" },
  };

  function openSetup(mode) {
    G.mode = mode;
    if (mode === "jeopardy") { startJeopardy(); return; }

    const meta = MODE_META[mode];
    $("setup-title").textContent = meta.title;
    $("setup-source-block").classList.toggle("hidden", !meta.source);
    $("setup-topic-block").classList.toggle("hidden", !meta.topic);
    $("setup-difficulty-block").classList.toggle("hidden", !meta.diff);
    $("setup-count-block").classList.toggle("hidden", !meta.count);
    $("topic-label").textContent = meta.topicLabel;

    // reset source to local each time (online list loads lazily)
    G.source = "local";
    document.querySelectorAll("#source-pills .pill").forEach((p) => p.classList.toggle("selected", p.dataset.source === "local"));
    renderTopicPills();
    show("setup");
  }

  function renderTopicPills() {
    const wrap = $("topic-pills");
    wrap.innerHTML = "";
    const addPill = (value, label, selected) => {
      const b = document.createElement("button");
      b.className = "pill" + (selected ? " selected" : "");
      b.dataset.topic = value;
      b.textContent = label;
      b.addEventListener("click", () => {
        G.topic = value;
        wrap.querySelectorAll(".pill").forEach((p) => p.classList.toggle("selected", p === b));
        sfx.click();
      });
      wrap.appendChild(b);
    };

    if (G.source === "local") {
      G.topic = "any";
      addPill("any", "🎲 Any topic", true);
      for (const key of CATEGORY_KEYS) addPill(key, `${QUESTION_BANK[key].icon} ${QUESTION_BANK[key].name}`, false);
    } else {
      G.topic = "any";
      addPill("any", "🎲 Any topic", true);
      wrap.insertAdjacentHTML("beforeend", `<span class="hint">Loading categories…</span>`);
      loadOnlineCategories()
        .then((cats) => {
          wrap.querySelector(".hint")?.remove();
          for (const c of cats) addPill(c.id, c.name, false);
        })
        .catch(() => {
          wrap.querySelector(".hint")?.remove();
          toast("⚠️ Couldn't load online categories — check your connection.");
        });
    }
  }

  /* ============================================================
     SHARED QUIZ RENDERING
     ============================================================ */

  function renderHud() {
    $("hud-score").textContent = G.score;
    $("hud-streak").textContent = "🔥 " + G.streak;
  }

  function renderQuestion() {
    const q = G.questions[G.index];
    if (!q) { endGame(); return; }
    G.locked = false;

    if (G.mode === "classic") {
      $("hud-progress-label").textContent = "Question";
      $("hud-progress").textContent = `${G.index + 1}/${G.questions.length}`;
    } else {
      $("hud-progress-label").textContent = "Answered";
      $("hud-progress").textContent = String(G.correct + G.wrong);
    }
    renderHud();

    $("q-category").textContent = q.category;
    const diffEl = $("q-difficulty");
    diffEl.textContent = q.difficulty;
    diffEl.className = "q-diff " + q.difficulty;
    $("q-text").textContent = q.question;

    const options = shuffle([q.correct, ...q.wrongs]);
    const wrap = $("answers");
    wrap.innerHTML = "";
    options.forEach((opt, i) => {
      const b = document.createElement("button");
      b.className = "answer-btn";
      b.innerHTML = `<span class="answer-key">${"ABCD"[i]}</span><span>${escapeHTML(opt)}</span>`;
      b.dataset.answer = opt;
      b.addEventListener("click", () => answer(b, opt === q.correct));
      wrap.appendChild(b);
    });

    $("btn-fifty").disabled = G.fifty <= 0 || G.mode === "rapidfire";
    $("fifty-count").textContent = "×" + G.fifty;
  }

  function escapeHTML(s) {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function revealAnswers(clickedBtn) {
    const q = G.questions[G.index];
    document.querySelectorAll("#answers .answer-btn").forEach((b) => {
      b.disabled = true;
      if (b.dataset.answer === q.correct) b.classList.add("correct");
      else if (b === clickedBtn) b.classList.add("wrong");
    });
  }

  function answer(btn, isCorrect) {
    if (G.locked) return;
    G.locked = true;
    revealAnswers(btn);

    if (isCorrect) {
      G.correct++;
      G.streak++;
      G.bestStreak = Math.max(G.bestStreak, G.streak);
      sfx.correct();
      if (G.mode === "classic") {
        G.score += 10 + Math.min(G.streak - 1, 5) * 2; // streak bonus
      } else if (G.mode === "mastermind") {
        G.score += 10;
      } else if (G.mode === "rapidfire") {
        G.score += 10;
        if (G.streak > 0 && G.streak % 3 === 0) {
          G.score += 15;
          toast("🔥 Streak bonus +15!");
        }
      }
    } else {
      G.wrong++;
      G.streak = 0;
      sfx.wrong();
      if (G.mode === "rapidfire") G.score = Math.max(-50, G.score - 5);
    }
    renderHud();

    const delay = G.mode === "classic" ? 1200 : 700;
    setTimeout(nextQuestion, delay);
  }

  function nextQuestion() {
    // the game may have ended (timer expiry / quit) while the reveal delay ran
    if (!$("screen-quiz").classList.contains("active")) return;
    G.index++;
    if (G.mode === "classic") {
      if (G.index >= G.questions.length) { endGame(); return; }
      renderQuestion();
    } else {
      // timed modes recycle: draw more if we run out
      if (G.index >= G.questions.length) {
        const more = drawLocal(G.mode === "mastermind" && G.round === 1 ? G.topic : "any", G.difficulty, 20);
        G.questions.push(...shuffle(more));
      }
      renderQuestion();
    }
  }

  /* ---------------- lifelines ---------------- */
  function useFifty() {
    if (G.fifty <= 0 || G.locked) return;
    const q = G.questions[G.index];
    const wrongBtns = [...document.querySelectorAll("#answers .answer-btn")].filter((b) => b.dataset.answer !== q.correct);
    sample(wrongBtns, 2).forEach((b) => b.classList.add("faded"));
    G.fifty--;
    $("fifty-count").textContent = "×" + G.fifty;
    $("btn-fifty").disabled = G.fifty <= 0;
    sfx.click();
  }

  function passQuestion() {
    if (G.locked) return;
    G.locked = true;
    G.passed++;
    G.streak = 0;
    revealAnswers(null);
    toast("Passed ⏭");
    setTimeout(nextQuestion, G.mode === "classic" ? 900 : 500);
  }

  /* ============================================================
     MODE STARTERS
     ============================================================ */

  function resetGame() {
    stopTimer();
    Object.assign(G, {
      questions: [], index: 0, score: 0, correct: 0, wrong: 0, passed: 0,
      streak: 0, bestStreak: 0, fifty: 2, round: 1, timeLeft: 0, timeTotal: 0, locked: false, jeo: null,
    });
  }

  async function startGame() {
    resetGame();
    $("round-banner").classList.add("hidden");

    if (G.mode === "classic") {
      $("hud-timer-wrap").classList.add("hidden");
      $("timer-bar-track").classList.add("hidden");
      $("btn-skip").disabled = false;

      if (G.source === "online") {
        $("btn-start").disabled = true;
        toast("Fetching questions…");
        try {
          G.questions = await fetchOnline(G.topic, G.difficulty, G.count);
        } catch (e) {
          toast("⚠️ Online fetch failed — using built-in questions instead.");
          G.questions = drawLocal("any", G.difficulty, G.count);
        }
        $("btn-start").disabled = false;
      } else {
        G.questions = drawLocal(G.topic, G.difficulty, G.count);
      }
      show("quiz");
      renderQuestion();

    } else if (G.mode === "mastermind") {
      G.round = 1;
      G.fifty = 0;
      $("btn-fifty").disabled = true;
      $("btn-skip").disabled = false;
      G.questions = shuffle(drawLocal(G.topic, G.difficulty, 40));
      show("quiz");
      startRoundTimer(90, "Round 1 · Specialist");
      const topicName = G.topic === "any" ? "Any topic" : QUESTION_BANK[G.topic].name;
      banner(`🧠 Round 1 — Specialist subject: ${topicName} (90s)`);
      renderQuestion();

    } else if (G.mode === "rapidfire") {
      G.fifty = 0;
      $("btn-fifty").disabled = true;
      $("btn-skip").disabled = false;
      G.questions = shuffle(drawLocal("any", G.difficulty, 60));
      show("quiz");
      startRoundTimer(90, "Rapid Fire");
      banner("⚡ Rapid Fire — 90 seconds · +10 right · −5 wrong");
      renderQuestion();
    }
  }

  function banner(text) {
    const el = $("round-banner");
    el.textContent = text;
    el.classList.remove("hidden");
  }

  function startRoundTimer(seconds, label) {
    stopTimer();
    G.timeTotal = seconds;
    G.timeLeft = seconds;
    $("hud-timer-wrap").classList.remove("hidden");
    $("hud-timer-label").textContent = label;
    $("timer-bar-track").classList.remove("hidden");
    updateTimerUI();
    G.timer = setInterval(() => {
      G.timeLeft--;
      updateTimerUI();
      if (G.timeLeft <= 5 && G.timeLeft > 0) sfx.tick();
      if (G.timeLeft <= 0) {
        stopTimer();
        onRoundEnd();
      }
    }, 1000);
  }

  function updateTimerUI() {
    const m = Math.floor(G.timeLeft / 60);
    const s = G.timeLeft % 60;
    $("hud-timer").textContent = `${m}:${String(s).padStart(2, "0")}`;
    $("hud-timer-wrap").classList.toggle("urgent", G.timeLeft <= 10);
    $("timer-bar").style.width = (G.timeLeft / G.timeTotal) * 100 + "%";
  }

  function onRoundEnd() {
    if (G.mode === "mastermind" && G.round === 1) {
      G.round = 2;
      G.locked = true;
      banner("🧠 Round 2 — General knowledge (120s)");
      toast("Round 2: General knowledge!");
      sfx.daily();
      G.questions = shuffle(drawLocal("any", "mixed", 60));
      G.index = 0;
      setTimeout(() => {
        startRoundTimer(120, "Round 2 · General");
        renderQuestion();
      }, 1600);
    } else {
      endGame();
    }
  }

  /* ============================================================
     JEOPARDY
     ============================================================ */

  const JEO_VALUES = [200, 400, 600, 800, 1000];
  const JEO_ROW_DIFF = ["easy", "easy", "medium", "medium", "hard"];

  function startJeopardy() {
    resetGame();
    const catKeys = sample(CATEGORY_KEYS, 5);
    const board = catKeys.map((key) => {
      const cat = QUESTION_BANK[key];
      return {
        key,
        name: cat.name,
        icon: cat.icon,
        clues: JEO_ROW_DIFF.map((diff, row) => {
          const pool = cat[diff];
          const q = pool[Math.floor(Math.random() * pool.length)];
          return {
            value: JEO_VALUES[row],
            used: false,
            q: { category: cat.name, difficulty: diff, question: q[0], correct: q[1], wrongs: q.slice(2) },
          };
        }),
      };
    });
    // avoid duplicate questions within a category column
    board.forEach((col) => {
      const seen = new Set();
      col.clues.forEach((clue) => {
        let guard = 0;
        while (seen.has(clue.q.question) && guard++ < 20) {
          const pool = QUESTION_BANK[col.key][clue.q.difficulty];
          const q = pool[Math.floor(Math.random() * pool.length)];
          clue.q = { category: col.name, difficulty: clue.q.difficulty, question: q[0], correct: q[1], wrongs: q.slice(2) };
        }
        seen.add(clue.q.question);
      });
    });

    G.jeo = {
      board,
      remaining: 25,
      dailyDouble: [Math.floor(Math.random() * 5), Math.floor(Math.random() * 5)], // [col, row]
      timer: null,
    };
    renderJeopardyBoard();
    show("jeopardy");
  }

  function renderJeopardyBoard() {
    const wrap = $("jeopardy-board");
    wrap.innerHTML = "";
    G.jeo.board.forEach((col) => {
      const h = document.createElement("div");
      h.className = "jeo-cat-head";
      h.textContent = `${col.icon} ${col.name}`;
      wrap.appendChild(h);
    });
    for (let row = 0; row < 5; row++) {
      G.jeo.board.forEach((col, ci) => {
        const clue = col.clues[row];
        const b = document.createElement("button");
        b.className = "jeo-cell";
        b.textContent = "$" + clue.value;
        b.disabled = clue.used;
        b.addEventListener("click", () => openClue(ci, row));
        wrap.appendChild(b);
      });
    }
    $("jeo-score").textContent = "$" + G.score;
    $("jeo-remaining").textContent = G.jeo.remaining;
  }

  function openClue(ci, row) {
    const clue = G.jeo.board[ci].clues[row];
    if (clue.used) return;
    clue.used = true;
    G.jeo.remaining--;

    const isDD = G.jeo.dailyDouble[0] === ci && G.jeo.dailyDouble[1] === row;
    const stake = isDD ? clue.value * 2 : clue.value;

    $("jeo-clue-cat").textContent = G.jeo.board[ci].name;
    $("jeo-clue-value").textContent = "$" + stake;
    $("daily-double").classList.toggle("hidden", !isDD);
    if (isDD) sfx.daily();
    $("jeo-clue-text").textContent = clue.q.question;

    const wrap = $("jeo-answers");
    wrap.innerHTML = "";
    let answered = false;

    const finish = (delta, btn) => {
      if (answered) return;
      answered = true;
      clearInterval(G.jeo.timer);
      wrap.querySelectorAll(".answer-btn").forEach((b) => {
        b.disabled = true;
        if (b.dataset.answer === clue.q.correct) b.classList.add("correct");
        else if (b === btn) b.classList.add("wrong");
      });
      if (delta > 0) { G.correct++; sfx.correct(); }
      else if (delta < 0) { G.wrong++; sfx.wrong(); }
      G.score += delta;
      setTimeout(() => {
        $("jeo-modal").classList.add("hidden");
        renderJeopardyBoard();
        if (G.jeo.remaining <= 0) setTimeout(endGame, 400);
      }, 1300);
    };

    shuffle([clue.q.correct, ...clue.q.wrongs]).forEach((opt, i) => {
      const b = document.createElement("button");
      b.className = "answer-btn";
      b.innerHTML = `<span class="answer-key">${"ABCD"[i]}</span><span>${escapeHTML(opt)}</span>`;
      b.dataset.answer = opt;
      b.addEventListener("click", () => finish(opt === clue.q.correct ? stake : -stake, b));
      wrap.appendChild(b);
    });

    // 20-second clue timer
    let t = 20;
    const bar = $("jeo-timer-bar");
    bar.style.width = "100%";
    clearInterval(G.jeo.timer);
    G.jeo.timer = setInterval(() => {
      t--;
      bar.style.width = (t / 20) * 100 + "%";
      if (t <= 5 && t > 0) sfx.tick();
      if (t <= 0) {
        toast("⏰ Time's up!");
        finish(-stake, null);
      }
    }, 1000);

    $("jeo-modal").classList.remove("hidden");
  }

  /* ============================================================
     RESULTS & HIGH SCORES
     ============================================================ */

  const MODE_ICONS = { classic: "🎯", jeopardy: "🟦", mastermind: "🧠", rapidfire: "⚡" };
  const MODE_NAMES = { classic: "Classic Quiz", jeopardy: "Jeopardy", mastermind: "Mastermind", rapidfire: "Rapid Fire" };

  function endGame() {
    stopTimer();
    if (G.jeo) clearInterval(G.jeo.timer);
    $("jeo-modal").classList.add("hidden");

    const total = G.correct + G.wrong;
    const acc = total ? Math.round((G.correct / total) * 100) : 0;

    $("results-title").textContent = MODE_ICONS[G.mode] + " " + MODE_NAMES[G.mode] + " — finished!";
    $("results-score").textContent = G.mode === "jeopardy" ? "$" + G.score : G.score;
    $("results-score-label").textContent = G.mode === "jeopardy" ? "winnings" : "points";

    const verdicts = [
      [95, "🏆 Flawless! Quizmaster material.", "🤯"],
      [80, "🌟 Brilliant performance!", "🎉"],
      [60, "👏 Solid effort — keep it up!", "😄"],
      [40, "🙂 Not bad. A little revision goes a long way.", "🙂"],
      [0,  "📚 Every master was once a beginner. Try again!", "💪"],
    ];
    const v = verdicts.find(([min]) => acc >= min);
    $("results-verdict").textContent = v[1] + ` (${acc}% accuracy)`;
    $("results-emoji").textContent = v[2];

    const stats = [
      ["✅ " + G.correct, "correct"],
      ["❌ " + G.wrong, "wrong"],
      ["🔥 " + G.bestStreak, "best streak"],
    ];
    if (G.passed) stats.push(["⏭ " + G.passed, "passed"]);
    $("results-stats").innerHTML = stats.map(([b, s]) => `<div class="stat-box"><b>${b}</b><span>${s}</span></div>`).join("");

    // high score
    const scores = store.get("scores", {});
    const prev = scores[G.mode]?.score ?? -Infinity;
    const isRecord = G.score > prev && total > 0;
    if (isRecord) {
      scores[G.mode] = {
        score: G.score,
        accuracy: acc,
        date: new Date().toISOString().slice(0, 10),
        detail: G.mode === "classic" ? topicName() + " · " + G.difficulty : "",
      };
      store.set("scores", scores);
      sfx.fanfare();
    } else if (acc >= 60) {
      sfx.fanfare();
    }
    $("new-record").classList.toggle("hidden", !isRecord);

    show("results");
  }

  function topicName() {
    if (G.topic === "any") return "Any topic";
    if (G.source === "online") return (onlineCategories?.find((c) => c.id === G.topic)?.name) ?? "Online";
    return QUESTION_BANK[G.topic]?.name ?? "Any topic";
  }

  function renderScores() {
    const scores = store.get("scores", {});
    const list = $("scores-list");
    const entries = Object.entries(scores);
    if (!entries.length) {
      list.innerHTML = `<p class="scores-empty">No games played yet — go set a record! 🎮</p>`;
      return;
    }
    list.innerHTML = entries.map(([mode, s]) => `
      <div class="score-row">
        <span class="mode">${MODE_ICONS[mode] ?? "🎮"}</span>
        <span class="detail"><b>${MODE_NAMES[mode] ?? mode}</b><span>${s.detail ? s.detail + " · " : ""}${s.accuracy}% accuracy · ${s.date}</span></span>
        <span class="points">${mode === "jeopardy" ? "$" + s.score : s.score}</span>
      </div>`).join("");
  }

  /* ============================================================
     WIRE-UP
     ============================================================ */

  function goHome() {
    stopTimer();
    if (G.jeo) clearInterval(G.jeo.timer);
    $("jeo-modal").classList.add("hidden");
    show("home");
  }

  // mode cards
  document.querySelectorAll(".mode-card").forEach((card) => {
    card.addEventListener("click", () => { sfx.click(); openSetup(card.dataset.mode); });
  });

  // setup pills
  document.querySelectorAll("#source-pills .pill").forEach((p) => {
    p.addEventListener("click", () => {
      G.source = p.dataset.source;
      document.querySelectorAll("#source-pills .pill").forEach((x) => x.classList.toggle("selected", x === p));
      if (G.source === "online" && !navigator.onLine) toast("⚠️ You appear to be offline — online questions may not load.");
      renderTopicPills();
      sfx.click();
    });
  });
  document.querySelectorAll("#difficulty-pills .pill").forEach((p) => {
    p.addEventListener("click", () => {
      G.difficulty = p.dataset.diff;
      document.querySelectorAll("#difficulty-pills .pill").forEach((x) => x.classList.toggle("selected", x === p));
      sfx.click();
    });
  });
  document.querySelectorAll("#count-pills .pill").forEach((p) => {
    p.addEventListener("click", () => {
      G.count = Number(p.dataset.count);
      document.querySelectorAll("#count-pills .pill").forEach((x) => x.classList.toggle("selected", x === p));
      sfx.click();
    });
  });

  // nav buttons
  $("btn-home").addEventListener("click", goHome);
  $("btn-setup-back").addEventListener("click", goHome);
  $("btn-start").addEventListener("click", startGame);
  $("btn-fifty").addEventListener("click", useFifty);
  $("btn-skip").addEventListener("click", passQuestion);
  $("btn-quit").addEventListener("click", endGame);
  $("btn-jeo-quit").addEventListener("click", endGame);
  $("btn-replay").addEventListener("click", () => (G.mode === "jeopardy" ? startJeopardy() : openSetup(G.mode)));
  $("btn-results-home").addEventListener("click", goHome);
  $("btn-scores").addEventListener("click", () => { renderScores(); show("scores"); });
  $("btn-scores-back").addEventListener("click", goHome);
  $("btn-scores-clear").addEventListener("click", () => {
    store.set("scores", {});
    renderScores();
    toast("Scores cleared");
  });
  $("btn-about").addEventListener("click", () => show("about"));
  $("btn-about-back").addEventListener("click", goHome);

  // keyboard: A-D / 1-4 answer, F = fifty, P = pass
  document.addEventListener("keydown", (e) => {
    const quizActive = $("screen-quiz").classList.contains("active");
    const jeoOpen = !$("jeo-modal").classList.contains("hidden");
    if (!quizActive && !jeoOpen) return;
    const wrap = jeoOpen ? $("jeo-answers") : $("answers");
    const idx = "1234".includes(e.key) ? Number(e.key) - 1 : "abcd".includes(e.key.toLowerCase()) && e.key.length === 1 ? "abcd".indexOf(e.key.toLowerCase()) : -1;
    if (idx >= 0) wrap.querySelectorAll(".answer-btn")[idx]?.click();
    else if (quizActive && e.key.toLowerCase() === "f") useFifty();
    else if (quizActive && e.key.toLowerCase() === "p") passQuestion();
  });

  /* ---------------- theme & sound ---------------- */
  function applyTheme() {
    document.documentElement.dataset.theme = theme;
    $("btn-theme").textContent = theme === "dark" ? "🌙" : "☀️";
  }
  $("btn-theme").addEventListener("click", () => {
    theme = theme === "dark" ? "light" : "dark";
    store.set("theme", theme);
    applyTheme();
  });
  $("btn-sound").addEventListener("click", () => {
    soundOn = !soundOn;
    store.set("sound", soundOn);
    $("btn-sound").textContent = soundOn ? "🔊" : "🔇";
    if (soundOn) sfx.click();
  });
  applyTheme();
  $("btn-sound").textContent = soundOn ? "🔊" : "🔇";

  /* ---------------- online status ---------------- */
  function updateNet() {
    const el = $("net-status");
    el.classList.toggle("offline", !navigator.onLine);
    el.title = navigator.onLine ? "Online — live questions available" : "Offline — using built-in questions";
  }
  window.addEventListener("online", updateNet);
  window.addEventListener("offline", updateNet);
  updateNet();

  /* ---------------- PWA install ---------------- */
  let deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    $("btn-install").classList.remove("hidden");
  });
  $("btn-install").addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    $("btn-install").classList.add("hidden");
  });

  /* ---------------- service worker ---------------- */
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }
})();
