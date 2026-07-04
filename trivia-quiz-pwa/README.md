# 🎮 QuizVerse — Trivia Quiz Game (PWA)

An interactive, installable trivia quiz web app with **four game modes**, **14 built-in topics × 3 difficulty levels** (330+ hand-picked questions that work fully offline), and **online mode** that pulls fresh questions on any topic from the [Open Trivia Database](https://opentdb.com) (24 categories, thousands of questions).

No build step, no dependencies — plain HTML/CSS/JS.

## 🕹️ Game modes

| Mode | Inspired by | Rules |
|------|-------------|-------|
| 🎯 **Classic Quiz** | Pub quiz | Pick topic, difficulty & length. +10 per correct with streak bonuses, two 50:50 lifelines, pass allowed. |
| 🟦 **Jeopardy** | Jeopardy! | 5×5 board of categories & dollar values ($200–$1000). Correct adds, wrong subtracts. Hidden **Daily Double** doubles the stake. 20s per clue. |
| 🧠 **Mastermind** | BBC Mastermind | Round 1: 90s on your **specialist subject**. Round 2: 120s general knowledge. Pass allowed, clock never stops. |
| ⚡ **Rapid Fire** | Tata Crucible buzzer round | 90-second blitz: +10 right, **−5 wrong**, +15 bonus every 3-streak. |

## ✨ Features

- 📴 **Offline-first PWA** — service worker caches the whole app; installable via *Add to Home Screen*
- 🌐 **Any topic in the world** — online mode fetches from Open Trivia DB by category & difficulty, with automatic fallback to the built-in bank
- 🌙 Dark / ☀️ light theme, sound effects (Web Audio, no audio files), responsive layout
- 🏅 Per-mode high scores saved locally
- ⌨️ Keyboard play: `1–4` / `A–D` to answer, `F` for 50:50, `P` to pass

## 🚀 Run it

Serve the folder over HTTP (service workers need http(s), not `file://`):

```bash
cd trivia-quiz-pwa
python3 -m http.server 8080
# open http://localhost:8080
```

Or deploy the folder as-is to any static host (GitHub Pages, Netlify, Vercel, S3…).

## 📁 Structure

```
trivia-quiz-pwa/
├── index.html            # app shell (all screens)
├── manifest.webmanifest  # PWA manifest
├── sw.js                 # service worker (offline cache)
├── css/style.css         # theme-aware styles
├── js/questions.js       # built-in question bank (14 topics × 3 difficulties)
├── js/app.js             # game engine (all four modes)
└── icons/                # app icons
```

## 🧩 Adding questions

Edit `js/questions.js` — each entry is `[question, correctAnswer, wrong1, wrong2, wrong3]` under a category's `easy` / `medium` / `hard` pool. New categories automatically appear in the topic picker, Jeopardy board rotation, and mixed-mode draws.
