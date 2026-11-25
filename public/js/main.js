import { World } from './world.js';
import { Net } from './net.js';

const $ = (s) => document.querySelector(s);
const COLOR_CHOICES = ['#35d0ff', '#ff4d8d', '#ffcf5c', '#6ee7a8', '#b06bff', '#ff8a3d'];

const app = {
  name: localStorage.getItem('cw.name') || '',
  color: localStorage.getItem('cw.color') || COLOR_CHOICES[0],
  code: (new URLSearchParams(location.search).get('room') || '').toUpperCase(),
  myId: null,
  hostId: null,
  phase: 'menu',
  room: null,
  state: null,
  firing: false,
  jumpHeld: false,
  started: false,
  lastItemSig: ''
};

const net = new Net();
let world = null;
let stick = { x: 0, y: 0, active: false, id: null };
let look = { id: null, x: 0, y: 0 };
const keys = Object.create(null);
let pickupBtn = null;
let motionAcc = 0;
let fireAcc = 0;
let hintAcc = 0;

// ---------------------------------------------------------------- başlat
function boot() {
  try {
    world = new World($('#scene'));
    world.showMenuBackdrop();
  } catch (err) {
    document.body.innerHTML =
      '<div style="padding:40px;font-family:sans-serif;color:#fff">Bu cihazda 3B görüntü açılamadı (WebGL). Tarayıcını güncelleyip tekrar dene.</div>';
    console.error(err);
    return;
  }

  buildSwatches();
  persistColorSelection();
  $('#nameInput').value = app.name;
  if (app.code) $('#codeInput').value = app.code;

  bindUi();
  bindStick();
  bindLook();
  bindKeys();
  bindNet();

  // hata ayıklama / test için sahne tutamacı
  window.__cw = { world, app, net };

  requestAnimationFrame(loop);
}

function buildSwatches() {
  const wrap = $('#swatches');
  wrap.innerHTML = '';
  for (const c of COLOR_CHOICES) {
    const b = document.createElement('button');
    b.className = 'swatch' + (c === app.color ? ' active' : '');
    b.style.background = `linear-gradient(140deg, ${c}, ${shade(c, -30)})`;
    b.dataset.color = c;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      app.color = c;
      [...wrap.children].forEach((x) => x.classList.toggle('active', x.dataset.color === c));
      persistColorSelection();
      toast('Renk ' + c + ' seçildi');
    });
    wrap.appendChild(b);
  }
}

// Ensure color selection persists across sessions
function persistColorSelection() {
  try {
    localStorage.setItem('cw.color', app.color);
    localStorage.setItem('cw.name', app.name || '');
  } catch (e) {
    // Ignore storage errors on private/browsers
  }
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

// ---------------------------------------------------------------- arayüz bağlama
function bindUi() {
  $('#createBtn').addEventListener('click', () => {
    try { joinGame(''); } catch(e) { toast('Sunucuya bağlanılamadı.'); }
  });
  $('#joinBtn').addEventListener('click', () => {
    const code = $('#codeInput').value.trim().toUpperCase();
    if (code.length !== 5) {
      toast('Oda kodu 5 karakter olmalı.');
      return;
    }
    joinGame(code);
  });
  $('#codeInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('#joinBtn').click();
  });
  $('#nameInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('#createBtn').click();
  });

  $('#copyBtn').addEventListener('click', async () => {
    const link = location.origin + '/?room=' + (app.code || '');
    try {
      await navigator.clipboard.writeText(link);
      toast('Davet bağlantısı kopyalandı');
    } catch {
      toast('Bağlantı: ' + link);
    }
  });

  $('#leaveBtn').addEventListener('click', () => {
    net.send('leave');
    setTimeout(() => location.reload(), 120);
  });

  $('#startBtn').addEventListener('click', () => net.send('start'));

  $('#mapList').addEventListener('click', (e) => {
    const card = e.target.closest('.map-card');
    if (!card) return;
    if (app.hostId !== app.myId) {
      toast('Haritayı sadece host seçebilir.');
      return;
    }
    net.send('selectMap', { mapId: card.dataset.map });
  });

  const craftInput = $('#craftInput');
  $('#craftBtn').addEventListener('click', submitCraft);
  craftInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitCraft();
      craftInput.blur();
    }
  });

  $('#inv').addEventListener('click', (e) => {
    const slot = e.target.closest('.slot');
    if (!slot) return;
    net.send('switch', { index: Number(slot.dataset.index) });
  });

  pickupBtn = document.querySelector('[data-act="pickup"]');

  // Chat input (HUD'da yoksa atla - panel sonradan gelebilir)
  const chatInput = $('#chatInput');
  const sendBtn = $('#sendBtn');
  if (chatInput && sendBtn) {
    sendBtn.addEventListener('click', sendChat);
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendChat();
        chatInput.value = '';
      }
    });
  }

  for (const btn of document.querySelectorAll('[data-act]')) {
    const act = btn.dataset.act;
    const down = (e) => {
      e.preventDefault();
      btn.classList.add('held');
      if (act === 'jump') app.jumpHeld = true;
      if (act === 'fire') app.firing = true;
      if (act === 'pickup') collectCube();
    };
    const up = (e) => {
      e.preventDefault();
      btn.classList.remove('held');
      if (act === 'jump') app.jumpHeld = false;
      if (act === 'fire') app.firing = false;
    };
    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('pointerleave', up);
  }

  // Settings menu binding
  $('#openSettingsBtn').addEventListener('click', () => { try { showScreen('settings'); } catch(e) { console.error(e); } });
  $('#closeSettingsBtn').addEventListener('click', () => showScreen('lobby'));
  $('#applySettingsBtn').addEventListener('click', () => { try { applySettings(); } catch(e) { console.error(e); } });

  // Mode selector in lobby
  $('#lobbyModeSelector').addEventListener('click', (e) => { try {
    const btn = e.target.closest('.mode-btn');
    if (!btn) return;
    const mode = btn.dataset.mode;
    // Visual update
    [...$('#lobbyModeSelector').children].forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    // Send to server
    net.send('selectMode', { mode });
  } catch(e) { console.error(e); }
  });

  // Settings apply function
  function applySettings() {
    const playerCount = parseInt($('#playerCountInput').value);
    const roundTime = parseInt($('#roundTimeInput').value);
    localStorage.setItem('cw.playerCount', playerCount);
    localStorage.setItem('cw.roundTime', roundTime);
    $('#playerCountValue').textContent = playerCount;
    $('#roundTimeValue').textContent = roundTime;
    // Graphics quality kalitesi
    app.graphicsQuality = localStorage.getItem('cw.graphicsQuality') || 'medium';
    toast('Ayarlar uygulandı');
    showScreen('lobby');
  }

  // Initialize from localStorage
  const savedPlayerCount = localStorage.getItem('cw.playerCount');
  const savedRoundTime = localStorage.getItem('cw.roundTime');
  if (savedPlayerCount) $('#playerCountInput').val(savedPlayerCount);
  if (savedRoundTime) $('#roundTimeInput').val(savedRoundTime);
  $('#playerCountValue').textContent = savedPlayerCount || 8;
  $('#roundTimeValue').textContent = savedRoundTime || 5;
}
function sendChat() {
  const text = ($('#chatInput').value || '').trim();
  if (!text) return;
  net.send('say', { text });
  $('#chatInput').value = '';
}

function sendEmote() {
  const text = ($('#chatInput').value || '').trim();
  const emotes = ['hehe', 'tmmm', 'wow', 'merhaba', 'yardım', 'aslan', 'mermi', 'bazooka'];
  if (emotes.includes(text.toLowerCase())) {
    net.send('emote', { text });
  } else {
    net.send('say', { text });
  }
  $('#chatInput').value = '';
}

function bindStick() {
  const el = $('#stick');
  const knob = $('#knob');
  const R = 42;

  const move = (e) => {
    const rect = el.getBoundingClientRect();
    let dx = e.clientX - (rect.left + rect.width / 2);
    let dy = e.clientY - (rect.top + rect.height / 2);
    const d = Math.hypot(dx, dy);
    if (d > R) {
      dx = (dx / d) * R;
      dy = (dy / d) * R;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    stick.x = dx / R;
    stick.y = dy / R;
  };

  el.addEventListener('pointerdown', (e) => {
    stick.active = true;
    stick.id = e.pointerId;
    el.setPointerCapture(e.pointerId);
    move(e);
  });
  el.addEventListener('pointermove', (e) => {
    if (!stick.active || e.pointerId !== stick.id) return;
    move(e);
  });
  const end = (e) => {
    if (e.pointerId !== stick.id) return;
    stick.active = false;
    stick.id = null;
    stick.x = 0;
    stick.y = 0;
    knob.style.transform = 'translate(0px, 0px)';
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('pointerleave', end);
}

function bindLook() {
  window.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, input, .stick, .inv, .craft, .overlay-card, #menu, #lobby')) return;
    if (look.id !== null) return;
    look.id = e.pointerId;
    look.x = e.clientX;
    look.y = e.clientY;
    if (world && world.me) world.canvas.style.cursor = 'grabbing';
  });

  window.addEventListener('pointermove', (e) => {
    if (look.id !== e.pointerId) return;
    const dx = e.clientX - look.x;
    const dy = e.clientY - look.y;
    look.x = e.clientX;
    look.y = e.clientY;
    world?.setLook(dx, dy);
  });

  const end = (e) => {
    if (look.id !== e.pointerId) return;
    look.id = null;
    if (world) world.canvas.style.cursor = 'grab';
  };
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
}

function bindKeys() {
  window.addEventListener('keydown', (e) => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    const k = e.key.toLowerCase();
    keys[k] = true;
    if (k === ' ') e.preventDefault();
    if (k === 'e') collectCube();
    if (k === 'f') app.firing = true;
    if (k === 'shift') keys.shift = true;
    if (k === 'Escape') {
      // Menüyü aç/kapat
      if (app.phase === 'playing') {
        // Menüyü gizle/göster
        $('#menu').classList.toggle('hidden', false);
        $('#lobby').classList.toggle('hidden', true);
        $('#hud').classList.toggle('hidden', true);
        app.phase = 'menu';
        world?.showMenuBackdrop();
        app.firing = false;
      }
    }
    if (['1', '2', '3', '4'].includes(k)) net.send('switch', { index: Number(k) - 1 });
  });
  window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    keys[k] = false;
    if (k === 'f') app.firing = false;
  });
  window.addEventListener('blur', () => {
    for (const k of Object.keys(keys)) keys[k] = false;
    app.firing = false;
    app.jumpHeld = false;
  });
}

// ---------------------------------------------------------------- mikrofon desteği (ULTRA)
app.micEnabled = false;
app.micStream = null;
app.micLevel = 0;
app.micSensitivity = 'medium';
app.micHistory = [];
app.micPhraseIndex = 0;

// Ultra mikrofon konfigürasyonu
app.micConfig = {
  sensitivity: 'medium',
  autoSend: true,
  phraseCooldown: 500,
  historySize: 10,
  minVolumeThreshold: 0.02,
  useVisualizer: true,
  customPhrases: ['wow', 'hehe', 'tmmm', 'merhaba', 'yardım', 'aslan', 'mermi', 'bazooka', 'dragon'],
  volumeHistory: [],
  isCalibrated: false,
  calibrationLevel: 0.1
};

// Ultra ses analyzer - daha hassas ve 64 bin frekans
app.micAnalyzer = {
  context: null,
  analyser: null,
  track: null,
  data: new Float32Array(64),
  rms: 0,
  peak: 0,
  avgRms: 0,
  smoothedRms: 0,
  bars: new Array(16).fill(0),
  // Renk temaları
  colors: {
    low: 0x35d0ff,
    medium: 0xffd93d,
    high: 0xff5555
  }
};

// Visualizer canvas element
app.micVisualizer = null;

// Kalibrasyon fonksiyonu - ortam ses seviyesini ayarlar
async function calibrateMic() {
  if (!app.micAnalyzer.context) return;
  // 500ms boyunca ses ölç
  const start = Date.now();
  let sum = 0;
  let count = 0;
  while (Date.now() - start < 1000) {
    const data = new Float32Array(app.micAnalyzer.analyser.frequencyBinCount);
    app.micAnalyzer.analyser.getFloatFrequencyData(data);
    for (let i = 0; i < data.length; i++) {
      sum += Math.abs(data[i]);
      count++;
    }
    await new Promise(r => setTimeout(r, 5));
  }
  app.micConfig.calibrationLevel = sum / count;
  app.micConfig.isCalibrated = true;
  console.log('Mic calibrated:', app.micConfig.calibrationLevel);
}

// Ultra mikrofon bağlama fonksiyonu
async function bindMic() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    app.micStream = stream;
    app.micAnalyzer.context = new AudioContext();
    app.micAnalyzer.analyser = app.micAnalyzer.context.createAnalyser();
    app.micAnalyzer.analyser.fftSize = 64;
    app.micAnalyzer.track = stream;
    const track = stream.getAudioTracks()[0];

    // Visualizer canvas oluştur
    const visualizerCanvas = document.createElement('canvas');
    visualizerCanvas.id = 'micVisualizer';
    visualizerCanvas.style.cssText = 'position:absolute; bottom:60px; right:20px; width:60px; height:30px; background:rgba(0,0,0,0.5); border-radius:4px; z-index:1000;';
    visualizerCanvas.getContext('2d').fillStyle = '#35d0ff';
    document.body.appendChild(visualizerCanvas);
    app.micVisualizer = visualizerCanvas;

    // Mikrofon toggle butonu
    const micToggle = document.createElement('button');
    micToggle.id = 'micToggle';
    micToggle.style.cssText = 'position:absolute; bottom:20px; right:20px; padding:6px 12px; background:#35d0ff; color:#000; border:none; border-radius:4px; font-size:12px; z-index:1000; display:none;';
    micToggle.textContent = 'MİKROFON: KAPALI';
    micToggle.onclick = () => {
      app.micEnabled = !app.micEnabled;
      micToggle.textContent = app.micEnabled ? 'MİKROFON: AÇIK' : 'MİKROFON: KAPALI';
      if (app.micEnabled) {
        track.enabled = true;
      } else {
        track.enabled = false;
      }
    };
    document.body.appendChild(micToggle);

    // Kalibrasyon
    await calibrateMic();

    // Ses seviyesini takip et
    track.enabled = app.micEnabled;
    app.micAnalyzer.track = track;

    // Volume change event
    track.onvolumechange = () => {
      try {
        const data = new Float32Array(app.micAnalyzer.analyser.frequencyBinCount);
        app.micAnalyzer.analyser.getFloatFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          sum += data[i] * data[i];
        }
        const rms = Math.sqrt(sum / data.length);
        app.micLevel = Math.min(255, Math.max(0, Math.round(rms * 255)));
        // Smooth the level
        app.micHistory.push(app.micLevel);
        if (app.micHistory.length > app.micConfig.historySize) {
          app.micHistory.shift();
        }
        app.micAvgLevel = app.micHistory.reduce((a, b) => a + b, 0) / app.micHistory.length;
        
        // Update visualizer
        if (app.micVisualizer) {
          const ctx = app.micVisualizer.getContext('2d');
          ctx.clearRect(0, 0, 60, 30);
          const barWidth = 3;
          const maxHeight = 20;
          app.micAnalyzer.bars = data.map((d, i) => {
            const normalized = Math.abs(d) * 10;
            return Math.min(normalized, maxHeight);
          });
          app.micAnalyzer.bars.forEach((height, i) => {
            ctx.fillStyle = app.micConfig.sensitivity === 'high' ? app.micColors.high : (app.micConfig.sensitivity === 'medium' ? app.micColors.medium : app.micColors.low);
            ctx.fillRect(i * 4, 30 - height, barWidth, height);
          });
        }

        // Auto-send if enabled and threshold exceeded
        if (app.micConfig.autoSend && app.micEnabled && app.micAvgLevel > 128 && app.phase === 'playing') {
          // Debounce: only send if enough time passed
          const now = Date.now();
          if (now - app.micLastSend > app.micConfig.phraseCooldown) {
            app.micLastSend = now;
            const phrases = app.micConfig.customPhrases;
            const phrase = phrases[Math.floor(Math.random() * phrases.length)];
            net.send('say', { text: phrase });
          }
        }
      } catch (e) {
        // Mic error silently
      }
    };

    // Continuous volume monitoring
    setInterval(() => {
      if (!app.micEnabled) return;
      try {
        const data = new Float32Array(app.micAnalyzer.analyser.frequencyBinCount);
        app.micAnalyzer.analyser.getFloatFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          sum += data[i] * data[i];
        }
        const rms = Math.sqrt(sum / data.length);
        app.micLevel = Math.min(255, Math.max(0, Math.round(rms * 255)));
        app.micHistory.push(app.micLevel);
        if (app.micHistory.length > app.micConfig.historySize) {
          app.micHistory.shift();
        }
        app.micAvgLevel = app.micHistory.reduce((a, b) => a + b, 0) / app.micHistory.length;

        // Update visualizer
        if (app.micVisualizer) {
          const ctx = app.micVisualizer.getContext('2d');
          ctx.clearRect(0, 0, 60, 30);
          app.micAnalyzer.bars.forEach((height, i) => {
            ctx.fillStyle = app.micConfig.sensitivity === 'high' ? app.micColors.high : (app.micConfig.sensitivity === 'medium' ? app.micColors.medium : app.micColors.low);
            ctx.fillRect(i * 4, 30 - height, 3, height);
          });
        }

        // Auto-send logic
        if (app.micConfig.autoSend && app.micEnabled && app.micAvgLevel > 128 && app.phase === 'playing') {
          const now = Date.now();
          if (now - app.micLastSend > app.micConfig.phraseCooldown) {
            app.micLastSend = now;
            const phrases = app.micConfig.customPhrases;
            const phrase = phrases[Math.floor(Math.random() * phrases.length)];
            net.send('say', { text: phrase });
          }
        }
      } catch (e) {
        // Mic disabled or expired
      }
    }, 50);

    // UI update
    micToggle.style.display = 'block';
    micToggle.textContent = app.micEnabled ? 'MİKROFON: AÇIK' : 'MİKROFON: KAPALI';
    updateMicStatus();

    function updateMicStatus() {
      const sensitivityLabels = { low: 'Düşük', medium: 'Orta', high: 'Yüksek' };
      document.getElementById('micSensitivity').textContent = sensitivityLabels[app.micSensitivity];
    }

    // Hotkey: M tuşu mikrofonu aç/kapama
    document.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 'm' && app.phase === 'playing') {
        app.micEnabled = !app.micEnabled;
        micToggle.textContent = app.micEnabled ? 'MİKROFON: AÇIK' : 'MİKROFON: KAPALI';
        track.enabled = app.micEnabled;
      }
    });

    // Calibrate on startup when user speaks first time
    const firstSpeechTimeout = setTimeout(() => {
      if (app.micEnabled && app.micLevel > 50) {
        calibrateMic();
        clearTimeout(firstSpeechTimeout);
      }
    }, 2000);

  } catch (err) {
    console.error('Mikrofon erişilemedi:', err);
    const micToggle = document.getElementById('micToggle');
    if (micToggle) micToggle.style.display = 'none';
    // Fallback: always show button in demo mode
    if (window.location.hostname === 'localhost') {
      micToggle.style.display = 'block';
      micToggle.textContent = 'MİKROFON: DEMO MODU';
    }
  }
}

// ---------------------------------------------------------------- ağ
// ---------------------------------------------------------------- ağ
function bindNet() {
  net.on('welcome', (m) => {
    app.myId = m.id;

// Team support
app.team = null; // "red" or "blue"
// Team colors
app.TEAM_COLORS = { red: 0xff0000, blue: 0x0000ff };

// Update HUD with team score
function updateTeamScore() {
  if (!app.state || !app.state.players) return;
  const me = app.state.players.find(p => p.id === app.myId);
  if (!me) return;
  // Count team cubes
  let teamCubes = 0;
  let opponentCubes = 0;
  const teamColor = me.team;
  if (teamColor) {
    for (const p of app.state.players) {
      if (p.team === teamColor) teamCubes += p.cubes;
      else opponentCubes += p.cubes;
    }
  }
  // Update UI
  const scoreEl = document.getElementById('teamScore');
  if (scoreEl) {
    scoreEl.textContent = teamCubes + " Küp"
  }
}

// Call update
setInterval(updateTeamScore, 2000);

// End of team support code
    app.hostId = m.hostId;
    app.code = m.code;
    app.name = m.name;
    app.color = m.color;
    localStorage.setItem('cw.name', m.name);
    localStorage.setItem('cw.color', m.color);
    $('#roomChip').textContent = 'ODA · ' + m.code;
    hideLoader();
    showScreen('lobby');
  });

  net.on('room', (m) => {
    app.room = m;
    app.hostId = m.hostId;
    app.phase = m.phase;
    if (m.code) app.code = m.code;
    renderLobby(m);
    if (m.phase === 'lobby') {
      if (app.started) {
        app.started = false;
        hideOverlay();
        showScreen('lobby');
        $('#hud').classList.add('hidden');
        world?.showMenuBackdrop();
      }
      $('#startBtn').disabled = m.hostId !== app.myId;
    }
  });

  net.on('map', (m) => {
    app.phase = 'playing';
    app.started = true;
    $('#hud').classList.remove('hidden');
    $('#menu').classList.add('hidden');
    $('#lobby').classList.add('hidden');
    $('#overlay').classList.add('hidden');
    world.buildMap(m.map, m.cubes);
    if (app.myId) world.setLocalPlayer(app.myId, app.name, app.color);
    $('#inv').innerHTML = '';
    $('#killfeed').innerHTML = '';
    hideAiCard();
    toast(`${m.map.name} · küpleri topla!`);
  });

  net.on('spawn', (m) => {
    world?.setSpawn(m.pos);
  });

  net.on('state', (m) => {
    app.state = m;
    app.phase = m.phase;
    updateHud(m);
  });

  net.on('event', onEvent);

  // Chat say messages
  net.on('say', (m) => {
    const name = m.name || 'Oyuncu';
    const text = m.text || '';
    addFeed(`<b>${escapeHtml(name)}</b> · ${escapeHtml(text)}`);
  });

  net.on('emote', (m) => {
    const name = m.name || 'Oyuncu';
    const text = m.text || '';
    addFeed(`<i>${escapeHtml(name)} · ${escapeHtml(text)}</i>`);
  });

  // Game mode selection from client
  net.on('selectMode', (m) => {
    const mode = GAME_MODES[m.mode] || GAME_MODES.classic;
    app.selectedMode = m.mode;
    // Update mode display if we're in lobby
    if (app.phase === 'lobby') {
      const modeTr = {
        classic: 'Klasik mod',
        survival: 'Survival mod',
        team: 'Takım modu',
        battleroyale: 'Battle Royale mod'
      }[m.mode] || 'Klasik mod';
      toast(`${modeTr} seçildi`);
    }
  });

  net.on('announce', (m) => {
    toast(m.text);
  });

  net.on('craftResult', (m) => {
    // yapay zekâ "düşünüyor" hissi için kısa gecikme
    setTimeout(() => renderCraftResult(m), 320);
  });

  net.on('roundEnd', (m) => {
    showResults(m.results);
  });

  net.on('errorMsg', (m) => {
    hideLoader();
    toast(m.text || 'Bir hata oldu.');
  });

  net.on('notice', (m) => toast(m.text));

  net.on('closed', () => {
    if (!app.myId) return;
    showOverlay(
      `<h2>Bağlantı koptu</h2><p>Sunucu ile bağlantı kesildi. Tekrar bağlanmayı dene.</p>
       <button class="btn primary block" onclick="location.reload()">YENİDEN BAĞLAN</button>`
    );
  });
}

async function joinGame(code) {
  const name = ($('#nameInput').value || app.name || '').trim().slice(0, 14) || 'Oyuncu';
  app.name = name;
  localStorage.setItem('cw.name', name);
  localStorage.setItem('cw.color', app.color);
  showLoader(code ? 'Odaya giriliyor…' : 'Oda kuruluyor…');
  try {
    if (!net.isOpen) await net.connect();
    net.send('join', { name, color: app.color, code });
  } catch (err) {
    hideLoader();
    toast('Sunucuya bağlanılamadı. Birazdan tekrar dene.');
    console.error(err);
  }
}

// ---------------------------------------------------------------- oyun olayları
function onEvent(ev) {
  switch (ev.kind) {
    case 'cubeTaken':
      world.hideCube(ev.id, ev.by === app.myId);
      // Visual feedback for collected cubes
      if (ev.by === app.myId) {
        addFeed('<b>⬛</b> ' + (ev.amount || 125) + ' küp toplandı!');
        // Particle burst at cube position
        world.burst(ev.x, ev.y + 0.5, ev.z, 0x6ee7a8, 8, 4);
      }
      break;
    case 'cubeBack':
      world.showCube(ev.id);
      break;
    case 'boom':
      world.boom(ev.x, ev.y, ev.z, ev.radius, ev.color);
      break;
    case 'hit':
      world.burst(ev.x, ev.y, ev.z, 0xff6a6a, 6, 3.5);
      break;
    case 'shoot':
      if (ev.by === app.myId) world.muzzleFlash(ev.x, ev.y, ev.z, ev.color || 0xffcf5c);
      break;
    case 'melee':
      world.meleeSwing(ev.x, ev.y, ev.z, ev.color || 0x35d0ff);
      break;
    case 'heal':
      world.ring(ev.x, ev.y, ev.z, 0x6ee7a8, 1.8);
      break;
    case 'kill':
      addFeed(
        `<b>${escapeHtml(ev.killer)}</b> ${escapeHtml(ev.victim)}'i devirdi`
      );
      break;
    case 'craft':
      if (ev.id === app.myId) {
        addFeed(`<b>${escapeHtml(ev.item.label)}</b> hazır!`);
        showItemReady(ev.item.label);
      } else {
        addFeed(`<b>${escapeHtml(ev.name)}</b> inşa etti: ${escapeHtml(ev.item.label)}`);
      }
      break;
    case 'buildStart':
      if (ev.id !== app.myId) addFeed(`<b>${escapeHtml(ev.name)}</b> üretiyor: ${escapeHtml(ev.label)}`);
      break;
    case 'say':
      if (ev.text.startsWith('/team')) {
        const text = ev.text.replace('/team', '').trim();
        if (text && ev.id === app.myId) {
          addFeed('<b>[TEAM]</b> ' + escapeHtml(ev.name) + ': ' + escapeHtml(text));
        } else if (text) {
          addFeed('<b>[TEAM]</b> ' + escapeHtml(ev.name) + ': ' + escapeHtml(text));
        }
      } else if (ev.text.startsWith('/all')) {
        const text = ev.text.replace('/all', '').trim();
        if (text) {
          addFeed('<b>[' + (ev.id === app.myId ? 'ALL' : 'OTHER') + ']</b> ' + escapeHtml(ev.name) + ': ' + escapeHtml(text));
        }
      } else if (ev.id === app.myId) {
        addFeed(`<b>${escapeHtml(ev.name)}</b> · ${escapeHtml(ev.text)}`);
      } else {
        addFeed(`<b>${escapeHtml(ev.name)}</b> · ${escapeHtml(ev.text)}`);
      }
      break;
    case 'announce':
      toast(ev.text);
      break;
    case 'respawn':
      if (ev.id === app.myId) world.setSpawn([ev.x, 0, ev.z]);
      break;
    default:
      break;
  }
}

// ---------------------------------------------------------------- kontroller
function collectCube() {
  if (!app.state || app.phase !== 'playing') return;
  const cube = world.nearestCube(world.local.pos);
  if (!cube) {
    toast('Yakında küp yok. Biraz dolaş.');
    return;
  }
  // Very close = auto-collect, farther = press button
  const d = Math.hypot(cube.x - world.local.pos.x, cube.z - world.local.pos.z);
  if (d < 1) {
    // Auto-collect: no button press needed
    net.send('collect', { id: cube.id, auto: true });
  } else {
    // Press button to collect
    net.send('collect', { id: cube.id });
  }
}

// Emote system
function doEmote(emote) {
  if (app.phase !== 'playing') return;
  const emotes = {'dance': 2000, 'wave': 1500, 'taunt': 2500};
  const duration = emotes[emote];
  if (!duration) return;
  app.local.emote = emote;
  app.local.emoteStart = Date.now();
  net.send('emote', { type: emote });
  console.log('Emote:', emote);
}

// Spectator mode (F3)
document.addEventListener('keydown', (e) => {
  if (e.key === 'F3' && app.phase === 'playing') {
    app.spectating = !app.spectating;
    console.log('Spectator mode:', app.spectating);
  }
});

// Add emote shortcut: press E to dance (chat input is created later, so delegate)
document.addEventListener('keydown', (e) => {
  if (e.key === 'e' && e.target && e.target.id === 'chatInput') {
    e.preventDefault();
    doEmote('dance');
  }
});

function tryFire() {
  if (app.phase !== 'playing') return;
  const dir = world.getAimDir();
  net.send('fire', { dir: { x: dir.x, y: dir.y, z: dir.z } });
}

// ---------------------------------------------------------------- döngü
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (app.phase === 'playing' || app.phase === 'ended') {
    world.update(dt, { state: app.state, input: currentInput() });

    motionAcc += dt;
    if (motionAcc > 0.066) {
      motionAcc = 0;
      net.send('motion', world.getMotion());
    }

    fireAcc += dt;
    if (app.firing && fireAcc > 0.09) {
      fireAcc = 0;
      tryFire();
    }

    hintAcc += dt;
    if (hintAcc > 0.2) {
      hintAcc = 0;
      const near = world.nearestCube(world.local.pos);
      $('#pickupHint').classList.toggle('hidden', !near || !world.local.alive);
      pickupBtn.classList.toggle('ready', !!near && world.local.alive);
    }
  } else {
    world.updateMenu(dt);
  }

  requestAnimationFrame(loop);
}

function currentInput() {
  let fwd = -stick.y;
  let side = stick.x;
  if (keys.w || keys.arrowup) fwd += 1;
  if (keys.s || keys.arrowdown) fwd -= 1;
  if (keys.d || keys.arrowright) side += 1;
  if (keys.a || keys.arrowleft) side -= 1;

  const yaw = world.camYaw;
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);
  let wx = fx * fwd + rx * side;
  let wz = fz * fwd + rz * side;
  const m = Math.hypot(wx, wz);
  if (m > 1) {
    wx /= m;
    wz /= m;
  }
  return { wx, wz, jump: app.jumpHeld || !!keys[' '], sprint: !!keys.shift };
}

// ---------------------------------------------------------------- HUD
function updateHud(state) {
  const me = state.players.find((p) => p.id === app.myId);
  if (!me) return;

  // Chat initialization (once)
  if (!app.chatInit) {
    app.chatInit = true;
    const chatPanel = $('#chatPanel');
    const chatMessages = $('#chatMessages');
    const chatInput = $('#chatInput');
    const sendBtn = $('.chat-send');
    if (chatPanel[0] && chatMessages[0] && chatInput[0] && sendBtn[0]) {
      // Send button
      sendBtn.addEventListener('click', () => {
        const text = (chatInput.value || '').trim();
        if (text) {
          net.send('say', { text });
          addChatMsg('Sen', text);
          chatInput.value = '';
        }
      });
      // Enter to send
      chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          if (sendBtn.click) sendBtn.click();
        }
      });
      // Auto-scroll
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  }

  $('#cubeCount').textContent = me.cubes;
  const hp = Math.max(0, Math.round(me.hp));
  $('#hpFill').style.width = hp + '%';
  $('#hpFill').classList.toggle('low', hp < 35);
  $('#scoreLine').textContent = `K ${me.kills} · Ö ${me.deaths}`;
  $('#timer').textContent = formatTime(state.timeLeft);

  const sig = me.items.map((i) => i.id).join(',') + '|' + me.active;
  if (sig !== app.lastItemSig) {
    app.lastItemSig = sig;
    renderInv(me);
  }

  if (me.building) {
    const card = $('#aiCard');
    card.classList.remove('hidden');
    const bar = card.querySelector('.bar > i');
    if (bar) bar.style.width = Math.round(me.building.progress * 100) + '%';
    const label = card.querySelector('[data-build-label]');
    if (label) label.textContent = `${me.building.label} · %${Math.round(me.building.progress * 100)}`;
    else if (!card.querySelector('.ai-name')) {
      card.innerHTML = buildCardHtml(me.building.label, 0);
      updateBuildBar(me.building.progress);
    }
    updateBuildBar(me.building.progress);
  }

  if (me.hp <= 0 && !app.deadShown) {
    app.deadShown = true;
    showOverlay(`<h2>DEVRİLDİN</h2><p>Yeniden doğuyorsun…</p>`);
    setTimeout(() => {
      hideOverlay();
      app.deadShown = false;
    }, 2200);
  }
}

function updateBuildBar(progress) {
  const bar = $('#aiCard .bar > i');
  if (bar) bar.style.width = Math.round(progress * 100) + '%';
  const label = $('#aiCard [data-build-label]');
  if (label) label.textContent = `%${Math.round(progress * 100)}`;
}

function renderInv(me) {
  const wrap = $('#inv');
  if (!me.items.length) {
    wrap.innerHTML = '';
    return;
  }
  wrap.innerHTML = me.items
    .map(
      (it, i) => `<div class="slot ${i === me.active ? 'active' : ''}" data-index="${i}">
        <i style="background:${it.glow || it.color}"></i>
        <span>${escapeHtml(it.label)}</span>
        <b>${i + 1}</b>
      </div>`
    )
    .join('');
}

function formatTime(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

// ---------------------------------------------------------------- üretim paneli
function submitCraft() {
  const input = $('#craftInput');
  const text = input.value.trim();
  if (!text) {
    toast('Ne inşa edelim? Örn: bazooka, aslan, buz kılıcı');
    input.focus();
    return;
  }
  const card = $('#aiCard');
  card.classList.remove('hidden');
  card.innerHTML = `
    <div class="ai-head">
      <span class="ai-name">CubeMind hesaplıyor…</span>
      <span class="ai-badge">analiz</span>
    </div>
    <div class="bar"><i style="width:40%"></i></div>
    <div class="ai-foot"><span>"${escapeHtml(text)}"</span><span>maliyet çıkarılıyor</span></div>`;
  net.send('craft', { text });
}

function renderCraftResult(res) {
  const card = $('#aiCard');
  if (!res || !res.spec) {
    card.classList.remove('hidden');
    card.innerHTML = `<div class="err">CubeMind bir şey üretemedi, farklı bir şey dene.</div>`;
    return;
  }
  const s = res.spec;
  const col = '#' + (s.palette[1] >>> 0).toString(16).padStart(6, '0');
  const tags = (s.tags || []).slice(0, 3).join(' · ');
  const affordable = app.state ? (app.state.players.find((p) => p.id === app.myId)?.cubes ?? 0) >= s.cost : false;

  let status;
  if (res.ok) {
    status = `<span class="ok">İnşa başladı — ${s.cost} küp harcandı</span>`;
  } else if (res.reason === 'cubes') {
    status = `<span class="err">${res.missing} küp daha lazım</span>`;
  } else if (res.reason === 'busy') {
    status = `<span class="err">Zaten bir icat inşa ediliyor</span>`;
  } else if (res.reason === 'dead') {
    status = `<span class="err">Önce yeniden doğ</span>`;
  } else {
    status = `<span class="err">Şu an olmadı</span>`;
  }

  card.classList.remove('hidden');
  card.innerHTML = `
    <div class="ai-head">
      <span class="ai-name">${escapeHtml(s.label)}</span>
      <span class="ai-badge" style="color:${col};border-color:${col}">CubeMind</span>
    </div>
    <div class="ai-meta">
      <span>${escapeHtml(s.categoryLabel)}</span>
      <span>Güç <b>${s.power}/10</b></span>
      ${s.stats.damage ? `<span>Hasar <b>${s.stats.damage}</b></span>` : ''}
      <span>${escapeHtml(tags)}</span>
    </div>
    <div class="cost-line">
      <span class="cost">${s.cost}</span>
      <span class="small">küp · ${s.duration}s üretim</span>
      <span class="small" style="margin-left:auto">${status}</span>
    </div>
    ${res.ok ? `<div class="bar gold"><i style="width:0%"></i></div><div class="ai-foot"><span data-build-label="1">%0</span><span>${escapeHtml(s.labelEn)}</span></div>` : `<div class="ai-foot"><span>${affordable ? 'Hazır' : 'Yetersiz küp'}</span><span>${escapeHtml(s.labelEn)}</span></div>`}
    <div style="font-size:10px;color:#8fa8c8;line-height:1.45">${escapeHtml(s.summary)}</div>
    ${res.ok ? '' : `<div class="ai-foot"><span>${(s.breakdown || []).map((b) => `${escapeHtml(b.label)} +${b.value}`).join(' · ')}</span></div>`}
  `;
}

function buildCardHtml(label, progress) {
  return `
    <div class="ai-head"><span class="ai-name">${escapeHtml(label)}</span><span class="ai-badge">inşa</span></div>
    <div class="bar gold"><i style="width:${Math.round(progress * 100)}%"></i></div>
    <div class="ai-foot"><span data-build-label>%${Math.round(progress * 100)}</span><span>CubeMind üretiyor</span></div>`;
}

function showItemReady(label) {
  const card = $('#aiCard');
  card.classList.remove('hidden');
  card.innerHTML = `<div class="ai-head"><span class="ai-name">${escapeHtml(label)} HAZIR</span><span class="ai-badge ok">tamam</span></div>
    <div class="ai-foot"><span>Ateş için ATEŞ'e bas</span><span>${escapeHtml(label)}</span></div>`;
  setTimeout(hideAiCard, 4200);
}

function hideAiCard() {
  $('#aiCard').classList.add('hidden');
  $('#aiCard').innerHTML = '';
}

// ---------------------------------------------------------------- lobi
function renderLobby(room) {
  $('#roomCode').textContent = room.code;
  $('#roomChip').textContent = 'ODA · ' + room.code;
  $('#playerCount').textContent = `${room.players.length}/8`;
  $('#playerChips').innerHTML = room.players
    .map(
      (p) => `<span class="pchip"><span class="dot" style="background:${p.color}"></span>${escapeHtml(p.name)}${
        p.isHost ? '<span class="host">HOST</span>' : ''
      }</span>`
    )
    .join('');

  const isHost = room.hostId === app.myId;
  $('#startBtn').disabled = !isHost;
  $('#startBtn').textContent = isHost ? 'SAVAŞI BAŞLAT' : 'HOST BEKLENİYOR…';
  $('#lobbyNote').textContent = isHost
    ? 'Sen host’sun · haritayı seç ve başlat'
    : 'Host haritayı seçip savaşı başlatacak';

  const list = $('#mapList');
  if (room.phase === 'lobby') showScreen('lobby');

  list.innerHTML = room.maps
    .map((m) => {
      const c1 = '#' + (m.theme.accent >>> 0).toString(16).padStart(6, '0');
      return `<div class="map-card ${m.id === room.mapId ? 'active' : ''}" data-map="${m.id}" style="--c1:${c1}">
        ${isHost ? '' : '<span class="lock">host seçer</span>'}
        <span class="pill">${m.radius}m</span>
        <b>${escapeHtml(m.name)}</b>
        <span>${escapeHtml(m.tag)}</span>
      </div>`;
    })
    .join('');

  // Chat input for lobby
  const chatHtml = `
    <div class="lobby-chat">
      <span class="chat-label">CHAT</span>
      <input type="text" id="lobbyChatInput" placeholder="Mesaj gir…" maxlength="48" />
      <button class="chat-send">Gönder</button>
    </div>`;
  $('#lobby').insertAdjacentHTML('beforeend', chatHtml);

  const lobbyChatInput = $('#lobbyChatInput');
  const chatSendBtn = $('#lobby').querySelector('.chat-send');
  const addLobbyChatMsg = (name, text) => {
    const div = document.createElement('div');
    div.style.cssText = 'padding:2px 6px; font-size:11px; color:#888; margin:1px 0;';
    div.textContent = `${name}: ${text}`;
    $('#playerChips').insertAdjacentElement('beforeend', div);
    $('#playerChips').scrollTop = $('#playerChips').scrollHeight;
  };

  if (chatSendBtn) {
    chatSendBtn.addEventListener('click', () => {
      const text = (lobbyChatInput.value || '').trim();
      if (text) {
        net.send('say', { text });
        lobbyChatInput.value = '';
      }
    });
  }
  lobbyChatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      if (chatSendBtn) chatSendBtn.click();
    }
  });
}

// ---------------------------------------------------------------- ekranlar
function showScreen(name) {
  if (name === 'settings') {
    $('#settings').classList.remove('hidden');
    $('#menu').classList.add('hidden');
    $('#lobby').classList.add('hidden');
    $('#hud').classList.add('hidden');
    return;
  }
  $('#menu').classList.toggle('hidden', name !== 'menu');
  $('#lobby').classList.toggle('hidden', name !== 'lobby');
  $('#hud').classList.toggle('hidden', name !== 'game');
  if (name === 'game') {
    $('#hud').classList.remove('hidden');
    $('#menu').classList.add('hidden');
    $('#lobby').classList.add('hidden');
  }
}

function showOverlay(html) {
  $('#overlayCard').innerHTML = html;
  $('#overlay').classList.remove('hidden');
}

function hideOverlay() {
  $('#overlay').classList.add('hidden');
}

function showResults(results) {
  const rows = (results || [])
    .map(
      (r, i) => `<div class="result-row">
        <span class="dot" style="background:${r.color}"></span>
        <span>${i + 1}. ${escapeHtml(r.name)}</span>
        <b>${r.kills}K / ${r.deaths}Ö · ${r.cubes}⬛</b>
      </div>`
    )
    .join('');
  const host = app.hostId === app.myId;
  showOverlay(`
    <h2>SAVAŞ BİTTİ</h2>
    <p>${results?.[0] ? `<b>${escapeHtml(results[0].name)}</b> arenayı domine etti.` : ''}</p>
    <div style="display:flex;flex-direction:column;gap:6px">${rows}</div>
    ${
      host
        ? `<button class="btn primary block" id="toLobbyBtn">LOBİYE DÖN</button>`
        : `<p class="hintline center">Host lobiye dönünce yeni maç başlayabilir.</p>`
    }`);
  const btn = $('#toLobbyBtn');
  if (btn) btn.addEventListener('click', () => net.send('backToLobby'));
}

function showLoader(text) {
  $('#loaderText').textContent = text;
  $('#loader').classList.remove('hidden');
}

function hideLoader() {
  $('#loader').classList.add('hidden');
}

function toast(text) {
  const el = document.createElement('div');
  el.textContent = text;
  $('#toasts').appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 320);
  }, 2200);
}

function addFeed(html) {
  const feed = $('#killfeed');
  const div = document.createElement('div');
  div.innerHTML = html;
  feed.appendChild(div);
  while (feed.children.length > 4) feed.firstElementChild.remove();
  setTimeout(() => {
    div.style.transition = 'opacity .4s';
    div.style.opacity = '0';
    setTimeout(() => div.remove(), 420);
  }, 5200);
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
// Round timer variables
app.roundTime = 300; // 5 dakika
app.roundElapsed = 0;

// Round countdown display
app.roundStartTime = null;

// Colorblind mode
app.colorblindMode = false;

// Toggle colorblind mode
function toggleColorblindMode() {
  app.colorblindMode = !app.colorblindMode;
  // Apply color palette adjustment
  const html = document.documentElement;
  if (app.colorblindMode) {
    html.style.filter = "invert(15%) hue-rotate(180deg)";
    localStorage.setItem("cw.colorblindMode", "true");
  } else {
    html.style.filter = "none";
    localStorage.setItem("cw.colorblindMode", "false");
  }
}

// Apply on game start
if (localStorage.getItem("cw.colorblindMode") === "true") {
  toggleColorblindMode();
}

// Color palettes for different modes
const COLOR_PALETTES = {
  normal: {
    primary: "#35d0ff",
    secondary: "#ff4d8d",
    accent: "#ffcf5c",
    background: "#060a16",
    text: "#ffffff",
    cube: "#ffd700",
    ground: "#121a30"
  },
  colorblind: {
    primary: "#ffd700",
    secondary: "#2a9d8f",
    accent: "#e9c46a",
    background: "#060a16",
    text: "#ffffff",
    cube: "#e94e77",
    ground: "#121a30"
  }
}
if (app.room && app.room.roundStartsAt) {
  app.roundStartTime = app.room.roundStartsAt;
}

// Visual round timer element
const roundTimerEl = document.createElement('div');
roundTimerEl.style.cssText = 'position: fixed; top: 140px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.8); color: #ffd700; padding: 8px 16px; border-radius: 6px; font-size: 14px; z-index: 9999; white-space: nowrap;';
roundTimerEl.id = 'roundTimer';
roundTimerEl.textContent = '';
// Power-up HUD display
app.powerUps = { speed: false, shield: false, doubleCubes: false };

// Update power-up UI
function updatePowerUPUI() {
  const hud = $('#hud');
  if (!hud) return;
  
  // Remove old power-up indicators
  const oldInd = document.querySelector('.powerup-indicator');
  if (oldInd) oldInd.remove();
  
  // Show active power-ups
  const indicators = [];
  if (app.powerUps.speed) indicators.push('<b>HIZ: 2x</b>');
  if (app.powerUps.shield) indicators.push('<b>KUNAK: Aktif</b>');
  if (app.powerUps.doubleCubes) indicators.push('<b>ÇİFT KÜP</b>');
  
  if (indicators.length > 0) {
    const indicator = document.createElement('div');
    indicator.className = 'powerup-indicator';
    indicator.style.cssText = 'position: fixed; top: 70px; left: 20px; background: rgba(0,0,0,0.8); color: #00ff00; padding: 8px 12px; border-radius: 6px; font-size: 12px; z-index: 9999; font-weight: bold; border: 1px solid #00ff00;'
    indicator.innerHTML = ' | '.join(indicators);
    hud.appendChild(indicator);
  }
}

// Call update on frame
setInterval(updatePowerUPUI, 1000);

// End of power-up HUD code



// Player statistics display
app.playerStats = { kills: 0, deaths: 0, cubes: 0, matches: 0 };

// Update player stats function
function updatePlayerStats() {
  if (!app.state) return;
  const me = app.state.players.find(p => p.id === app.myId);
  if (!me) return;
  
  app.playerStats.kills = me.kills;
  app.playerStats.deaths = me.deaths;
  app.playerStats.cubes = me.cubes;
  app.playerStats.matches = me.matches || 0;
  
  // Update UI
  const statsEl = document.getElementById('playerStats');
  if (statsEl) {
    statsEl.innerHTML = '\n' + '<b>KILL:</b> ' + me.kills + '<br>' + '<b>ÖLÜ:</b> ' + me.deaths + '<br>' + '<b>KÜP:</b> ' + me.cubes + '<br>' + '<b>MAÇ:</b> ' + (me.matches || 0);
  }
}

// Update stats every 2 seconds
setInterval(updatePlayerStats, 2000);

// Add stats panel to HUD
function addStatsPanel() {
  const hud = $('#hud');
  if (!hud) return;
  const statsPanel = document.createElement('div');
  statsPanel.style.cssText = 'position: fixed; top: 100px; left: 20px; background: rgba(0,0,0,0.8); color: #fff; padding: 10px; border-radius: 6px; font-size: 12px; z-index: 9999; max-width: 150px;';
  statsPanel.id = 'playerStats';
  statsPanel.innerHTML = '<b>ISTATİSTIKLER</b>\n<KILL:> 0<br><ÖLÜ:> 0<br><KÜP:> 0<br><MAÇ:> 0';
  hud.appendChild(statsPanel);
}

// Call after HUD is initialized
if (app.phase === 'playing') {
  setTimeout(addStatsPanel, 1000);
}
document.body.appendChild(roundTimerEl);

// Start round countdown
if (app.roundStartTime) {
  const updateTimer = setInterval(() => {
    const elapsed = Date.now() - app.roundStartTime;
    const remaining = Math.max(0, app.roundTime - elapsed);
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    roundTimerEl.textContent = '[' + minutes + ':' + (seconds < 10 ? '0' : '') + seconds + ']';
    if (remaining <= 0) {
      clearInterval(updateTimer);
      roundTimerEl.textContent = 'ZAMAN Bitti!';

// Round win effects
// Show winner announcement
addFeed("<b>🏆 Tur Bitti!</b>");

// Round win particle effects
if (app.phase === "playing") {
  app.phase = "round_end";
  // Celebrate with particles
  setTimeout(() => {
    // Spawn celebration particles at center
    const centerX = (app.room?.width || 40) / 2;
    const centerY = 1.5;
    const centerZ = (app.room?.length || 40) / 2;
    for (let i = 0; i < 50; i++) {
      setTimeout(() => {
        world.burst(centerX, centerY, centerZ, 0xffd700, 8, 2);
      }, i * 50);
    }
  }, 1000);

// Reset after 5 seconds
  setTimeout(() => {
    app.phase = "playing";
    roundTimerEl.textContent = '[' + Math.floor(app.roundTime / 60000) + ':00]';
    roundTimerEl.style.background = "rgba(0,0,0,0.8)";
  }, 5000);
}
      roundTimerEl.style.background = 'rgba(255,0,0,0.9)';
    }
  }, 1000);
}

// Update timer when round changes
const roomUpdater = setInterval(() => {
  const rm = app.room;
  if (!rm) return;
  if (rm.phase === 'playing' && !app.roundStartTime) {
    app.roundStartTime = Date.now();
    roundTimerEl.textContent = '[' + Math.floor(app.roundTime / 60000) + ':00]';
  }
  if (rm.phase !== 'playing') {
    clearInterval(roomUpdater);
    roundTimerEl.remove();
  }
}, 1000);

// End of escapeHtml function



boot();

function addChatMsg(name, text) {
  const chatMessages = $('#chatMessages');
  if (!chatMessages) return;
  const div = document.createElement('div');
  div.style.cssText = 'padding:2px 6px; font-size:11px; color:#888; margin:1px 0;';
  div.textContent = name + ': ' + text;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}
