/* ==========================================================================
   AetherOS v2.4 - Çekirdek Sistem Durumu (State Management)
   ========================================================================== */
const STORAGE_KEY = "aether_os_state_v2";

const defaultState = {
  pomodoros: 4,
  focusMinutes: 110,
  streak: 5,
  tasks: [
    { id: "t1", title: "Web Audio API ile Pembe Gürültü DSP filtresini yaz", tag: "Algoritma", status: "done" },
    { id: "t2", title: "60FPS FFT Frekans Spektrum Analizörünü bağla", tag: "Frontend", status: "doing" },
    { id: "t3", title: "Trigonometrik SVG Radar grafiğini kalibre et", tag: "Mimari", status: "todo" },
    { id: "t4", title: "Binaural 432Hz/440Hz Alfa dalgası faz testi", tag: "Test", status: "todo" }
  ]
};

let state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || defaultState;

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  renderRadarChart();
}

function sysLog(msg) {
  const logBox = document.getElementById("sys-log");
  const time = new Date().toLocaleTimeString("tr-TR", { hour12: false });
  const div = document.createElement("div");
  div.className = "log-entry";
  div.innerHTML = `<span>[${time}]</span> ${msg}`;
  logBox.prepend(div);
}

/* ==========================================================================
   1. SİSTEM SAATİ & TELEMETRİ BAŞLATICI
   ========================================================================== */
function updateClock() {
  document.getElementById("sys-clock").textContent = new Date().toLocaleTimeString("tr-TR", { hour12: false });
}
setInterval(updateClock, 1000);
updateClock();
sysLog("AetherOS çekirdeği başlatıldı. Tüm modüller çevrimiçi.");

/* ==========================================================================
   2. KRONO-ODAK (POMODORO) & SVG DAİRESEL İLERLEME MOTORU
   ========================================================================== */
const RING_CIRCUMFERENCE = 2 * Math.PI * 90; // r=90 -> 565.48
let totalSeconds = 25 * 60;
let remainingSeconds = totalSeconds;
let timerInterval = null;
let isRunning = false;

const ringFill = document.getElementById("ring-fill");
const timerDisplay = document.getElementById("timer-display");
const timerStateLabel = document.getElementById("timer-state-label");
const timerToggleBtn = document.getElementById("timer-toggle");

function updateTimerUI() {
  const mins = String(Math.floor(remainingSeconds / 60)).padStart(2, "0");
  const secs = String(remainingSeconds % 60).padStart(2, "0");
  timerDisplay.textContent = `${mins}:${secs}`;

  const offset = RING_CIRCUMFERENCE - (remainingSeconds / totalSeconds) * RING_CIRCUMFERENCE;
  ringFill.style.strokeDashoffset = offset;

  document.getElementById("stat-pomodoros").textContent = state.pomodoros;
  document.getElementById("stat-minutes").textContent = state.focusMinutes;
  document.getElementById("streak-count").textContent = state.streak;
}

function playSynthesizedChime() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(528, ctx.currentTime); // 528Hz Solfeggio tonu
  osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.6);
  gain.gain.setValueAtTime(0.25, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.4);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 1.5);
}

function toggleTimer() {
  if (isRunning) {
    clearInterval(timerInterval);
    isRunning = false;
    timerStateLabel.textContent = "DURAKLATILDI";
    timerToggleBtn.textContent = "▶ Devam Et";
    sysLog("Krono-Odak sayacı duraklatıldı.");
  } else {
    isRunning = true;
    timerStateLabel.textContent = "ODAK AKTİF";
    timerToggleBtn.textContent = "⏸ Duraklat";
    sysLog("Derin odak oturumu başlatıldı.");

    timerInterval = setInterval(() => {
      if (remainingSeconds > 0) {
        remainingSeconds--;
        updateTimerUI();
      } else {
        clearInterval(timerInterval);
        isRunning = false;
        state.pomodoros += 1;
        state.focusMinutes += Math.round(totalSeconds / 60);
        saveState();
        playSynthesizedChime();
        timerStateLabel.textContent = "TAMAMLANDI";
        timerToggleBtn.textContent = "▶ Başlat";
        sysLog("🎯 Oturum tamamlandı! Telemetri verileri güncellendi.");
        updateTimerUI();
      }
    }, 1000);
  }
}

document.getElementById("timer-toggle").addEventListener("click", toggleTimer);
document.getElementById("timer-reset").addEventListener("click", () => {
  clearInterval(timerInterval);
  isRunning = false;
  remainingSeconds = totalSeconds;
  timerStateLabel.textContent = "HAZIR";
  timerToggleBtn.textContent = "▶ Başlat (Space)";
  updateTimerUI();
  sysLog("Zamanlayıcı sıfırlandı.");
});

document.querySelectorAll(".mode-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".mode-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    clearInterval(timerInterval);
    isRunning = false;
    totalSeconds = parseInt(btn.dataset.time, 10) * 60;
    remainingSeconds = totalSeconds;
    timerStateLabel.textContent = btn.dataset.mode.toUpperCase();
    timerToggleBtn.textContent = "▶ Başlat";
    updateTimerUI();
  });
});

/* ==========================================================================
   3. WEB AUDIO API PROSEDÜREL SES SENTEZLEYİCİ & 60FPS FFT SPEKTRUM
   ========================================================================== */
let audioCtx = null;
let analyser = null;
let isAudioPlaying = false;
let rainGain, deepGain, binauralGain;
let animFrameId = null;

function initAudioEngine() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  audioCtx = new AudioContextClass();
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 128;

  const bufferSize = audioCtx.sampleRate * 3; // 3 saniyelik döngüsel tampon

  // 1. KANAL: Pembe Gürültü (Paul Kellet Algoritması ile Yağmur Sentezi)
  const pinkBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const pinkOut = pinkBuffer.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    pinkOut[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.04;
    b6 = white * 0.115926;
  }
  const pinkSource = audioCtx.createBufferSource();
  pinkSource.buffer = pinkBuffer;
  pinkSource.loop = true;

  const rainFilter = audioCtx.createBiquadFilter();
  rainFilter.type = "lowpass";
  rainFilter.frequency.value = 850;

  rainGain = audioCtx.createGain();
  rainGain.gain.value = document.getElementById("vol-rain").value / 100;

  pinkSource.connect(rainFilter);
  rainFilter.connect(rainGain);
  rainGain.connect(analyser);
  pinkSource.start();

  // 2. KANAL: Kahverengi Gürültü (Brownian Motion Derin Uzay Sentezi)
  const brownBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const brownOut = brownBuffer.getChannelData(0);
  let lastOut = 0.0;
  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;
    brownOut[i] = (lastOut + (0.02 * white)) / 1.02;
    lastOut = brownOut[i];
    brownOut[i] *= 0.22;
  }
  const brownSource = audioCtx.createBufferSource();
  brownSource.buffer = brownBuffer;
  brownSource.loop = true;

  const deepFilter = audioCtx.createBiquadFilter();
  deepFilter.type = "lowpass";
  deepFilter.frequency.value = 180;

  deepGain = audioCtx.createGain();
  deepGain.gain.value = document.getElementById("vol-deep").value / 100;

  brownSource.connect(deepFilter);
  deepFilter.connect(deepGain);
  deepGain.connect(analyser);
  brownSource.start();

  // 3. KANAL: Binaural Alfa Dalgaları (432Hz Sol + 440Hz Sağ = 8Hz Alfa Odak)
  const oscLeft = audioCtx.createOscillator();
  const oscRight = audioCtx.createOscillator();
  const panLeft = audioCtx.createStereoPanner();
  const panRight = audioCtx.createStereoPanner();

  oscLeft.type = "sine";
  oscRight.type = "sine";
  oscLeft.frequency.value = 432;
  oscRight.frequency.value = 440;
  panLeft.pan.value = -0.8;
  panRight.pan.value = 0.8;

  binauralGain = audioCtx.createGain();
  binauralGain.gain.value = (document.getElementById("vol-binaural").value / 100) * 0.15;

  oscLeft.connect(panLeft).connect(binauralGain);
  oscRight.connect(panRight).connect(binauralGain);
  binauralGain.connect(analyser);

  oscLeft.start();
  oscRight.start();

  analyser.connect(audioCtx.destination);
}

function drawSpectrum() {
  const canvas = document.getElementById("audio-canvas");
  const ctx = canvas.getContext("2d");
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  function renderFrame() {
    animFrameId = requestAnimationFrame(renderFrame);
    analyser.getByteFrequencyData(dataArray);

    ctx.fillStyle = "#05080f";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const barWidth = (canvas.width / bufferLength) * 1.6;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      const barHeight = (dataArray[i] / 255) * canvas.height;
      const grad = ctx.createLinearGradient(0, canvas.height, 0, 0);
      grad.addColorStop(0, "#6366f1");
      grad.addColorStop(1, "#38bdf8");

      ctx.fillStyle = grad;
      ctx.fillRect(x, canvas.height - barHeight, barWidth - 2, barHeight);
      x += barWidth;
    }
  }
  renderFrame();
}

const audioMasterBtn = document.getElementById("audio-master-btn");
const freqStatus = document.getElementById("freq-status");

audioMasterBtn.addEventListener("click", () => {
  if (!audioCtx) {
    initAudioEngine();
  }

  if (isAudioPlaying) {
    audioCtx.suspend();
    cancelAnimationFrame(animFrameId);
    isAudioPlaying = false;
    audioMasterBtn.textContent = "🔇 Sentezleyiciyi Başlat";
    audioMasterBtn.classList.remove("active");
    freqStatus.textContent = "DSP MOTORU DURAKLATILDI";
    sysLog("WebAudio sentezleyici askıya alındı.");
  } else {
    audioCtx.resume();
    drawSpectrum();
    isAudioPlaying = true;
    audioMasterBtn.textContent = "🔊 DSP Aktif (Çalıyor)";
    audioMasterBtn.classList.add("active");
    freqStatus.textContent = "432Hz/440Hz + PEMBE GÜRÜLTÜ AKTİF";
    sysLog("WebAudio prosedürel ses motoru başlatıldı.");
  }
});

// Mikser Kaydırıcıları
document.getElementById("vol-rain").addEventListener("input", (e) => {
  document.getElementById("val-rain").textContent = `${e.target.value}%`;
  if (rainGain) rainGain.gain.value = e.target.value / 100;
});
document.getElementById("vol-deep").addEventListener("input", (e) => {
  document.getElementById("val-deep").textContent = `${e.target.value}%`;
  if (deepGain) deepGain.gain.value = e.target.value / 100;
});
document.getElementById("vol-binaural").addEventListener("input", (e) => {
  document.getElementById("val-binaural").textContent = `${e.target.value}%`;
  if (binauralGain) binauralGain.gain.value = (e.target.value / 100) * 0.15;
});

/* ==========================================================================
   4. SÜRÜKLE-BIRAK (DRAG & DROP) KANBAN GÖREV MOTORU
   ========================================================================== */
function renderKanban() {
  const zones = {
    todo: document.getElementById("zone-todo"),
    doing: document.getElementById("zone-doing"),
    done: document.getElementById("zone-done")
  };

  Object.values(zones).forEach(z => (z.innerHTML = ""));

  const counts = { todo: 0, doing: 0, done: 0 };

  state.tasks.forEach(task => {
    counts[task.status]++;
    const card = document.createElement("div");
    card.className = "task-card";
    card.draggable = true;
    card.dataset.id = task.id;

    card.innerHTML = `
      <div class="task-title">${task.title}</div>
      <div class="task-meta">
        <span class="task-badge">${task.tag}</span>
        <button class="task-del" title="Görevi Sil" data-del="${task.id}">✕</button>
      </div>
    `;

    card.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", task.id);
    });

    zones[task.status].appendChild(card);
  });

  document.getElementById("count-todo").textContent = counts.todo;
  document.getElementById("count-doing").textContent = counts.doing;
  document.getElementById("count-done").textContent = counts.done;
}

// Sürükle-Bırak Alanları
document.querySelectorAll(".kanban-col").forEach(col => {
  const zone = col.querySelector(".col-dropzone");
  const status = col.dataset.status;

  col.addEventListener("dragover", (e) => {
    e.preventDefault();
    zone.classList.add("drag-over");
  });

  col.addEventListener("dragleave", () => {
    zone.classList.remove("drag-over");
  });

  col.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("drag-over");
    const taskId = e.dataTransfer.getData("text/plain");
    const task = state.tasks.find(t => t.id === taskId);
    if (task && task.status !== status) {
      task.status = status;
      saveState();
      renderKanban();
      sysLog(`Görev taşındı: "${task.title.slice(0, 22)}..." -> ${status.toUpperCase()}`);
    }
  });
});

// Yeni Görev Ekleme & Silme
document.getElementById("task-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = document.getElementById("task-input");
  const tag = document.getElementById("task-tag").value;
  if (!input.value.trim()) return;

  state.tasks.push({
    id: "t_" + Date.now(),
    title: input.value.trim(),
    tag,
    status: "todo"
  });

  input.value = "";
  saveState();
  renderKanban();
  sysLog(`Yeni görev eklendi [${tag}].`);
});

document.querySelector(".kanban-board").addEventListener("click", (e) => {
  const delId = e.target.dataset.del;
  if (delId) {
    state.tasks = state.tasks.filter(t => t.id !== delId);
    saveState();
    renderKanban();
    sysLog("Görev matristen silindi.");
  }
});

/* ==========================================================================
   5. TRİGONOMETRİK ÖZEL SVG RADAR GRAFİĞİ MOTORU
   ========================================================================== */
function renderRadarChart() {
  const svg = document.getElementById("radar-svg");
  const cx = 130, cy = 130, maxR = 85;

  const doneCount = state.tasks.filter(t => t.status === "done").length;
  const totalTasks = Math.max(state.tasks.length, 1);

  // 5 Eksenli Dinamik Metrikler (0 - 100 arası)
  const metrics = [
    { label: "ODAK", val: Math.min(100, 45 + state.pomodoros * 10) },
    { label: "TESLİMAT", val: Math.round((doneCount / totalTasks) * 100) || 40 },
    { label: "DERİNLİK", val: Math.min(100, 35 + Math.round(state.focusMinutes / 3)) },
    { label: "SERİ", val: Math.min(100, state.streak * 18) },
    { label: "DENGE", val: 82 }
  ];

  const totalAxes = metrics.length;
  let svgHTML = "";

  // 1. Arka Plan Çokgen Ağları (%33, %66, %100)
  [0.35, 0.68, 1].forEach(level => {
    const pts = metrics.map((_, i) => {
      const angle = (Math.PI * 2 * i) / totalAxes - Math.PI / 2;
      const x = cx + Math.cos(angle) * (maxR * level);
      const y = cy + Math.sin(angle) * (maxR * level);
      return `${x},${y}`;
    }).join(" ");
    svgHTML += `<polygon points="${pts}" fill="none" stroke="rgba(148,163,184,0.18)" stroke-width="1"/>`;
  });

  // 2. Eksen Çizgileri ve Etiketler
  metrics.forEach((m, i) => {
    const angle = (Math.PI * 2 * i) / totalAxes - Math.PI / 2;
    const x = cx + Math.cos(angle) * maxR;
    const y = cy + Math.sin(angle) * maxR;
    const lx = cx + Math.cos(angle) * (maxR + 24);
    const ly = cy + Math.sin(angle) * (maxR + 18);

    svgHTML += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="rgba(148,163,184,0.2)" stroke-width="1"/>`;
    svgHTML += `<text x="${lx}" y="${ly}" fill="#94a3b8" font-size="9" font-family="JetBrains Mono" text-anchor="middle" dominant-baseline="middle">${m.label} (${m.val}%)</text>`;
  });

  // 3. Veri Çokgeni
  const dataPoints = metrics.map((m, i) => {
    const angle = (Math.PI * 2 * i) / totalAxes - Math.PI / 2;
    const r = (m.val / 100) * maxR;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    return `${x},${y}`;
  }).join(" ");

  svgHTML += `<polygon points="${dataPoints}" fill="rgba(56, 189, 248, 0.25)" stroke="#38bdf8" stroke-width="2"/>`;

  svg.innerHTML = svgHTML;
}

/* ==========================================================================
   6. KOMUT PALETİ (CTRL + K) & TELEMETRİ DIŞA AKTARIM
   ========================================================================== */
const commands = [
  { name: "▶ Krono-Odak Sayacını Başlat / Durdur", shortcut: "Space", action: toggleTimer },
  { name: "🔊 WebAudio Sentezleyiciyi Aç / Kapat", shortcut: "M", action: () => audioMasterBtn.click() },
  { name: "📥 Telemetri Raporunu JSON Olarak İndir", shortcut: "E", action: exportTelemetry },
  { name: "🗑️ Fabrika Ayarlarına Dön (Veriyi Sıfırla)", shortcut: "R", action: () => {
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  }}
];

const cmdModal = document.getElementById("cmd-modal");
const cmdInput = document.getElementById("cmd-input");
const cmdList = document.getElementById("cmd-list");

function renderCommands(filter = "") {
  cmdList.innerHTML = "";
  commands
    .filter(c => c.name.toLowerCase().includes(filter.toLowerCase()))
    .forEach(c => {
      const li = document.createElement("li");
      li.className = "cmd-item";
      li.innerHTML = `<span>${c.name}</span><kbd>${c.shortcut}</kbd>`;
      li.addEventListener("click", () => {
        c.action();
        cmdModal.classList.add("hidden");
      });
      cmdList.appendChild(li);
    });
}

document.getElementById("cmd-trigger").addEventListener("click", () => {
  cmdModal.classList.remove("hidden");
  cmdInput.value = "";
  renderCommands();
  cmdInput.focus();
});

cmdInput.addEventListener("input", (e) => renderCommands(e.target.value));

window.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    cmdModal.classList.toggle("hidden");
    if (!cmdModal.classList.contains("hidden")) {
      cmdInput.value = "";
      renderCommands();
      cmdInput.focus();
    }
  } else if (e.key === "Escape") {
    cmdModal.classList.add("hidden");
  }
});

function exportTelemetry() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
  const a = document.createElement("a");
  a.href = dataStr;
  a.download = "aether-os-telemetry.json";
  a.click();
  sysLog("Telemetri raporu (.json) dışa aktarıldı.");
}

document.getElementById("export-telemetry").addEventListener("click", exportTelemetry);

// Başlangıç Çizimleri
updateTimerUI();
renderKanban();
renderRadarChart();