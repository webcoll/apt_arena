// Host / Display Logic - Live Stadium Pitch Arena
const socket = window.realtimeEngine;

// State
let currentGamePin = null;
let currentQuizId = null;
let currentQuizData = null;
let networkIPs = [];
let selectedIP = window.location.hostname;
let selectedPort = window.location.port || '3000';
let finalStandings = [];
let currentLeaderboardPlayers = [];
let currentTotalQuestions = 5;
let raceChartInstance = null;
let podiumChartInstance = null;

// Screens
const lobbyScreen = document.getElementById('lobby-screen');
const countdownOverlay = document.getElementById('countdown-overlay');
const countdownNum = document.getElementById('countdown-num');
const raceScreen = document.getElementById('race-screen');
const podiumScreen = document.getElementById('podium-screen');

// Lobby Elements
const headerQuizTitle = document.getElementById('header-quiz-title');
const lobbyPinDisplay = document.getElementById('lobby-pin-display');
const lobbyQrImg = document.getElementById('lobby-qr-img');
const qrLoading = document.getElementById('qr-loading');
const copyLinkBtn = document.getElementById('copy-link-btn');
const copyBtnText = document.getElementById('copy-btn-text');
const networkIpSelect = document.getElementById('network-ip-select');

const playerCountBadge = document.getElementById('player-count-badge');
const playersGrid = document.getElementById('players-grid');
const noPlayersMsg = document.getElementById('no-players-msg');
const startGameBtn = document.getElementById('start-game-btn');
const addBotBtn = document.getElementById('add-bot-btn');
const quizSummaryInfo = document.getElementById('quiz-summary-info');

const soundBtn = document.getElementById('sound-btn');
const soundIcon = document.getElementById('sound-icon');
const fullscreenBtn = document.getElementById('fullscreen-btn');

// Race Screen Elements
const raceQuizTitle = document.getElementById('race-quiz-title');
const raceProgressCount = document.getElementById('race-progress-count');
const raceProgressBar = document.getElementById('race-progress-bar');
const raceStatusNote = document.getElementById('race-status-note');
const viewTabPitch = document.getElementById('view-tab-pitch');
const viewTabChart = document.getElementById('view-tab-chart');
const releaseScoresBtn = document.getElementById('release-scores-btn');
const raceTickerText = document.getElementById('race-ticker-text');
const pitchViewContainer = document.getElementById('pitch-view-container');
const chartViewContainer = document.getElementById('chart-view-container');
const racersLanesContainer = document.getElementById('racers-lanes-container');

// Podium Elements
const downloadResultsBtn = document.getElementById('download-results-btn');
const fullStandingsTable = document.getElementById('full-standings-table');

// Initialize on DOM Ready
window.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  currentQuizId = urlParams.get('quizId') || 'quiz_tech_stars';

  await initNetworkIPs();
  initHostEvents();
  initSoundToggle();
  initFullscreen();
  initRaceViewTabs();

  // Create game session
  if (window.supabaseManager && window.supabaseManager.isConfigured()) {
    // Static Hostinger Supabase Mode
    const localPin = Math.floor(100000 + Math.random() * 900000).toString();
    currentGamePin = localPin;
    socket.init('host', localPin);

    let quiz = null;
    try {
      const { data } = await window.supabaseManager.client.from('quizzes').select('*').eq('id', currentQuizId).single();
      if (data) quiz = data;
    } catch (e) {}

    if (!quiz) {
      quiz = {
        id: currentQuizId,
        title: '⚡ Tech & Coding Superstars',
        category: 'Technology',
        questions: [
          { question: 'Which language structures modern web pages?', options: ['Python', 'HTML', 'C++', 'Java'], correctIndex: 1, timeLimit: 15, points: 1000, explanation: 'HTML structures web docs.' },
          { question: 'What does API stand for?', options: ['Automated Program Interface', 'Application Programming Interface', 'Applied Protocol Integration', 'Advanced Processing Instruction'], correctIndex: 1, timeLimit: 20, points: 1000, explanation: 'Application Programming Interface.' },
          { question: 'Which company created JavaScript in 1995?', options: ['Microsoft', 'Netscape', 'Sun Microsystems', 'Apple'], correctIndex: 1, timeLimit: 20, points: 1000, explanation: 'Netscape created JS.' }
        ]
      };
    }
    currentQuizData = quiz;

    socket.trigger('host:game_created', {
      pin: localPin,
      quizTitle: quiz.title,
      questionCount: quiz.questions.length,
      category: quiz.category
    });
  } else {
    // Render Node.js Mode
    socket.init('host', null);
    socket.emit('host:create_game', { quizId: currentQuizId });
  }
});

// Network IP Discovery
async function initNetworkIPs() {
  const isCloudHost = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';

  try {
    const res = await fetch('/api/network-ip');
    const data = await res.json();
    networkIPs = data.interfaces || [];
    selectedPort = data.port || '3000';

    networkIpSelect.innerHTML = '';

    if (isCloudHost) {
      const cloudOpt = document.createElement('option');
      cloudOpt.value = window.location.hostname;
      cloudOpt.textContent = `🌐 Public Cloud (${window.location.hostname})`;
      cloudOpt.selected = true;
      networkIpSelect.appendChild(cloudOpt);
      selectedIP = window.location.hostname;
    }

    let preferred = networkIPs.find(n => n.isPreferred) || networkIPs[0];

    networkIPs.forEach(n => {
      const opt = document.createElement('option');
      opt.value = n.ip;
      opt.textContent = `📶 ${n.interface} (${n.ip})`;
      if (!isCloudHost && preferred && preferred.ip === n.ip) opt.selected = true;
      networkIpSelect.appendChild(opt);
    });

    const localOpt = document.createElement('option');
    localOpt.value = 'localhost';
    localOpt.textContent = `💻 Localhost (This PC)`;
    networkIpSelect.appendChild(localOpt);

    if (!isCloudHost) {
      if (preferred) {
        selectedIP = preferred.ip;
      } else {
        selectedIP = 'localhost';
        localOpt.selected = true;
      }
    }

    networkIpSelect.addEventListener('change', () => {
      selectedIP = networkIpSelect.value;
      updateQRCode();
    });
  } catch (err) {
    selectedIP = window.location.hostname || 'localhost';
  }
}

function getStudentJoinUrl() {
  if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return `${window.location.origin}/player.html?pin=${currentGamePin}`;
  }
  const portPart = (selectedPort && selectedPort !== '80') ? `:${selectedPort}` : '';
  const protocol = window.location.protocol;
  return `${protocol}//${selectedIP}${portPart}/player.html?pin=${currentGamePin}`;
}

async function updateQRCode() {
  if (!currentGamePin) return;
  const joinUrl = getStudentJoinUrl();

  qrLoading.classList.remove('hidden');
  try {
    const res = await fetch(`/api/qrcode?url=${encodeURIComponent(joinUrl)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.dataUrl) {
        lobbyQrImg.src = data.dataUrl;
        qrLoading.classList.add('hidden');
        return;
      }
    }
  } catch (err) {}

  // Fallback public QR generator
  lobbyQrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(joinUrl)}`;
  lobbyQrImg.onload = () => qrLoading.classList.add('hidden');
  lobbyQrImg.onerror = () => qrLoading.classList.add('hidden');
}

// Socket & Host Events
function initHostEvents() {
  // Game created
  socket.on('host:game_created', ({ pin, quizTitle, questionCount, category }) => {
    currentGamePin = pin;
    currentTotalQuestions = questionCount || 5;
    lobbyPinDisplay.textContent = `${pin.slice(0, 3)} ${pin.slice(3)}`;
    headerQuizTitle.textContent = quizTitle;
    raceQuizTitle.textContent = quizTitle;
    document.getElementById('quiz-title-badge').classList.remove('hidden');
    quizSummaryInfo.textContent = `${questionCount} Questions &bull; ${category || 'Quiz'}`;

    updateQRCode();
  });

  // Player roster updated
  socket.on('host:player_list_updated', ({ players, count }) => {
    playerCountBadge.textContent = count;
    renderPlayersGrid(players);

    if (count > 0) {
      startGameBtn.removeAttribute('disabled');
    } else {
      startGameBtn.setAttribute('disabled', 'true');
    }

    window.sounds.playCountdownTick(800, 0.05);
  });

  // Start countdown (3-2-1)
  socket.on('game:countdown', ({ seconds }) => {
    showScreen(countdownOverlay);
    let count = seconds;
    countdownNum.textContent = count;
    window.sounds.playCountdownTick(600);

    const intv = setInterval(() => {
      count--;
      if (count > 0) {
        countdownNum.textContent = count;
        window.sounds.playCountdownTick(600 + (3 - count) * 150);
      } else {
        countdownNum.textContent = 'GO!';
        window.sounds.playGoBeep();
        clearInterval(intv);

        // Switch straight to the LIVE RACE ARENA!
        setTimeout(() => {
          showScreen(raceScreen);
          window.sounds.playOngoingMusic();
        }, 500);
      }
    }, 1000);
  });

  // Real-time race update from student answers
  socket.on('host:race_update', (data) => {
    countdownOverlay.classList.add('hidden');
    if (raceScreen.classList.contains('hidden')) {
      showScreen(raceScreen);
      window.sounds.playOngoingMusic();
    }

    currentLeaderboardPlayers = data.players || [];
    currentTotalQuestions = data.totalQuestions || currentTotalQuestions;

    // Render racers gliding on the pitch
    renderPitchLanes(data.players, currentTotalQuestions);

    // Update progress counters
    raceProgressCount.textContent = `${data.finishedCount} / ${data.totalPlayers}`;
    const pct = data.totalPlayers > 0 ? Math.round((data.finishedCount / data.totalPlayers) * 100) : 0;
    raceProgressBar.style.width = `${pct}%`;

    if (data.allFinished) {
      raceStatusNote.textContent = '🎉 All students have finished! Ready to release final scores!';
      raceStatusNote.className = 'text-[11px] text-emerald-400 font-extrabold mt-1 animate-pulse';
      releaseScoresBtn.classList.add('animate-bounce', 'ring-4', 'ring-amber-300');
    } else {
      raceStatusNote.textContent = `${data.finishedCount} of ${data.totalPlayers} students finished (${pct}%)`;
      raceStatusNote.className = 'text-[11px] text-slate-400 mt-1';
    }

    if (data.latestEvent) {
      raceTickerText.textContent = data.latestEvent;
    }

    // Update real-time battle graph if active
    if (chartViewContainer && !chartViewContainer.classList.contains('hidden')) {
      renderRaceChart(data.players, 'race-live-chart-canvas');
    }
  });

  // Grand Finale - declared when Host clicks "RELEASE FULL SCORE"
  socket.on('host:game_finished', (data) => {
    showScreen(podiumScreen);
    finalStandings = data.allPlayers;

    // Switch music to finale on display screen
    window.sounds.stopOngoingMusic();
    window.sounds.playTournamentEndMusic();

    // Trigger celebration confetti
    triggerConfetti();

    // Render 1st, 2nd, 3rd podium pillars
    const [p1, p2, p3] = data.podium || [];
    if (p1) {
      document.getElementById('podium-p1-avatar').textContent = p1.avatar;
      document.getElementById('podium-p1-name').textContent = p1.nickname;
      document.getElementById('podium-p1-score').textContent = `${p1.score.toLocaleString()} pts`;
    }
    if (p2) {
      document.getElementById('podium-p2-avatar').textContent = p2.avatar;
      document.getElementById('podium-p2-name').textContent = p2.nickname;
      document.getElementById('podium-p2-score').textContent = `${p2.score.toLocaleString()} pts`;
    }
    if (p3) {
      document.getElementById('podium-p3-avatar').textContent = p3.avatar;
      document.getElementById('podium-p3-name').textContent = p3.nickname;
      document.getElementById('podium-p3-score').textContent = `${p3.score.toLocaleString()} pts`;
    }

    // Render full standings table
    renderFullStandings(data.allPlayers);

    // Render tournament battle timeline graph
    setTimeout(() => {
      renderRaceChart(data.allPlayers, 'podium-race-chart');
    }, 400);
  });
}

// Render dynamic runner cards across the stadium pitch
function renderPitchLanes(players, totalQuestions) {
  if (!racersLanesContainer) return;
  racersLanesContainer.innerHTML = '';

  if (!players || players.length === 0) {
    racersLanesContainer.innerHTML = '<div class="text-center text-slate-400 py-16 text-sm font-semibold">Racers lining up at the start line...</div>';
    return;
  }

  const totalQ = totalQuestions || 5;

  players.forEach((p) => {
    const lane = document.createElement('div');
    lane.className = 'racer-lane-card relative w-full h-14 rounded-2xl bg-black/40 border border-emerald-500/20 flex items-center px-2 overflow-hidden transition-all duration-300 hover:border-emerald-400/40';

    // Calculate progression percentage across the pitch
    const questionsAnswered = p.questionsAnswered || 0;
    let posPercent = 0;

    if (p.isFinished) {
      posPercent = 86; // Crosses the finish line!
    } else if (totalQ > 0) {
      posPercent = Math.min(84, (questionsAnswered / totalQ) * 84);
    }

    let rankBadgeClass = 'bg-slate-800 text-slate-300 border border-white/10';
    let rankText = `#${p.rank}`;
    let borderHighlight = '';

    if (p.rank === 1) {
      rankBadgeClass = 'bg-amber-400 text-slate-950 font-black shadow-lg shadow-amber-400/40';
      rankText = '👑 #1';
      borderHighlight = 'border-amber-400/60 shadow-md shadow-amber-400/20';
    } else if (p.rank === 2) {
      rankBadgeClass = 'bg-slate-300 text-slate-950 font-black';
      rankText = '🥈 #2';
    } else if (p.rank === 3) {
      rankBadgeClass = 'bg-amber-700 text-white font-black';
      rankText = '🥉 #3';
    }

    const statusBadge = p.isFinished
      ? '<span class="text-[10px] font-black bg-amber-400 text-slate-950 px-2 py-0.5 rounded-full shadow">🏁 FINISHED</span>'
      : `<span class="text-[10px] font-bold text-emerald-300 bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-500/30">Q ${questionsAnswered}/${totalQ}</span>`;

    const streakBadge = (p.streak && p.streak >= 2)
      ? `<span class="text-[10px] font-black text-orange-400 bg-orange-500/20 px-1.5 py-0.5 rounded border border-orange-500/40">🔥 x${p.streak}</span>`
      : '';

    lane.innerHTML = `
      <!-- Lane guideline -->
      <div class="absolute inset-x-0 h-px bg-emerald-500/15 top-1/2 -translate-y-1/2 pointer-events-none"></div>

      <!-- Sliding runner entity -->
      <div class="runner-entity absolute flex items-center space-x-2 transition-all duration-700 ease-out z-10" style="left: ${posPercent}%;">
        <div class="px-2 py-0.5 rounded-lg text-xs font-black shrink-0 ${rankBadgeClass}">
          ${rankText}
        </div>
        <div class="text-3xl filter drop-shadow animate-pulse">${p.avatar || '🚀'}</div>
        <div class="glass-card px-3 py-1 rounded-xl flex items-center space-x-2 border border-white/20 shadow-xl bg-slate-900/90 ${borderHighlight}">
          <span class="font-extrabold text-white text-xs whitespace-nowrap">${escapeHtml(p.nickname)}</span>
          <span class="font-mono font-bold text-amber-300 text-xs">${p.score.toLocaleString()} pts</span>
          ${statusBadge}
          ${streakBadge}
        </div>
      </div>
    `;

    racersLanesContainer.appendChild(lane);
  });
}

// Render Lobby Players Grid
function renderPlayersGrid(players) {
  playersGrid.innerHTML = '';

  if (!players || players.length === 0) {
    noPlayersMsg.classList.remove('hidden');
    return;
  }
  noPlayersMsg.classList.add('hidden');

  players.forEach((p, idx) => {
    const card = document.createElement('div');
    card.className = 'glass-card p-3 rounded-2xl flex items-center space-x-3 border border-white/10 hover:border-violet-500/50 transition transform hover:-translate-y-0.5 scale-pop relative group';
    card.innerHTML = `
      <div class="text-3xl">${p.avatar || '🚀'}</div>
      <div class="truncate flex-1">
        <div class="font-extrabold text-white text-sm truncate">${escapeHtml(p.nickname)}</div>
        <div class="text-[11px] text-slate-400">Ready to Race</div>
      </div>
      <button onclick="kickPlayer('${p.id}')" title="Remove student" class="opacity-0 group-hover:opacity-100 transition p-1 text-slate-400 hover:text-red-400 text-xs">
        <i class="fa-solid fa-xmark"></i>
      </button>
    `;
    playersGrid.appendChild(card);
  });
}

window.kickPlayer = function(playerId) {
  socket.emit('host:kick_player', { playerId });
};

// View Tabs: Stadium Pitch vs Live Battle Graph
function initRaceViewTabs() {
  if (!viewTabPitch || !viewTabChart) return;

  viewTabPitch.addEventListener('click', () => {
    viewTabPitch.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition bg-emerald-600 text-white shadow flex items-center space-x-1.5';
    viewTabChart.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition text-slate-300 hover:text-white flex items-center space-x-1.5';
    pitchViewContainer.classList.remove('hidden');
    chartViewContainer.classList.add('hidden');
  });

  viewTabChart.addEventListener('click', () => {
    viewTabChart.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition bg-emerald-600 text-white shadow flex items-center space-x-1.5';
    viewTabPitch.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition text-slate-300 hover:text-white flex items-center space-x-1.5';
    pitchViewContainer.classList.add('hidden');
    chartViewContainer.classList.remove('hidden');
    renderRaceChart(currentLeaderboardPlayers, 'race-live-chart-canvas');
  });
}

// Render Live Race Trajectory Chart (Chart.js)
function renderRaceChart(players, canvasId) {
  if (typeof Chart === 'undefined') return;
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  if (!players || players.length === 0) return;

  const topPlayers = players.slice(0, 8);

  const vibrantColors = [
    '#f59e0b', // Amber/Gold (Rank 1)
    '#38bdf8', // Sky Blue (Rank 2)
    '#ec4899', // Pink (Rank 3)
    '#10b981', // Emerald
    '#a855f7', // Purple
    '#f97316', // Orange
    '#06b6d4', // Cyan
    '#e11d48'  // Rose
  ];

  let maxSteps = 1;
  topPlayers.forEach(p => {
    if (p.scoreHistory && p.scoreHistory.length > maxSteps) {
      maxSteps = p.scoreHistory.length;
    }
  });

  const labels = Array.from({ length: maxSteps }, (_, i) => i === 0 ? 'Start' : `Q${i}`);

  const datasets = topPlayers.map((p, idx) => {
    const color = vibrantColors[idx % vibrantColors.length];
    const data = p.scoreHistory && p.scoreHistory.length > 0
      ? p.scoreHistory
      : [0, p.score || 0];

    return {
      label: `${p.avatar || '🚀'} ${p.nickname}`,
      data: data,
      borderColor: color,
      backgroundColor: color,
      borderWidth: 3,
      tension: 0.35,
      pointRadius: 5,
      pointHoverRadius: 8,
      pointBackgroundColor: color,
      pointBorderColor: '#0f172a',
      pointBorderWidth: 2,
      fill: false
    };
  });

  if (canvasId === 'race-live-chart-canvas' && raceChartInstance) {
    raceChartInstance.destroy();
    raceChartInstance = null;
  } else if (canvasId === 'podium-race-chart' && podiumChartInstance) {
    podiumChartInstance.destroy();
    podiumChartInstance = null;
  }

  const ctx = canvas.getContext('2d');
  const newChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            color: '#e2e8f0',
            font: { size: 12, weight: 'bold' },
            boxWidth: 14,
            usePointStyle: true,
            pointStyle: 'circle',
            padding: 12
          }
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleColor: '#f8fafc',
          bodyColor: '#cbd5e1',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          padding: 10,
          callbacks: {
            label: function(context) {
              return ` ${context.dataset.label}: ${context.parsed.y.toLocaleString()} pts`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.06)' },
          ticks: { color: '#94a3b8', font: { weight: 'bold' } },
          title: {
            display: true,
            text: 'Timeline / Questions Solved',
            color: '#64748b',
            font: { size: 11, weight: '600' }
          }
        },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(255, 255, 255, 0.06)' },
          ticks: {
            color: '#94a3b8',
            font: { weight: 'bold' },
            callback: function(val) {
              return val >= 1000 ? (val / 1000) + 'k' : val;
            }
          },
          title: {
            display: true,
            text: 'Points',
            color: '#64748b',
            font: { size: 11, weight: '600' }
          }
        }
      }
    }
  });

  if (canvasId === 'race-live-chart-canvas') {
    raceChartInstance = newChart;
  } else if (canvasId === 'podium-race-chart') {
    podiumChartInstance = newChart;
  }
}

// Render Full Standings Table on Grand Podium
function renderFullStandings(players) {
  fullStandingsTable.innerHTML = '';
  players.forEach(p => {
    const row = document.createElement('div');
    row.className = 'flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5 text-sm';
    row.innerHTML = `
      <div class="flex items-center space-x-3">
        <span class="font-bold text-slate-400 w-6">#${p.rank}</span>
        <span class="text-xl">${p.avatar}</span>
        <span class="font-bold text-white">${escapeHtml(p.nickname)}</span>
      </div>
      <div class="flex items-center space-x-6 text-xs text-slate-300">
        <span>Accuracy: <strong class="text-emerald-400">${p.accuracy}%</strong></span>
        <span class="font-mono font-bold text-amber-300 text-sm">${p.score.toLocaleString()} pts</span>
      </div>
    `;
    fullStandingsTable.appendChild(row);
  });
}

// Confetti Blast on Podium
function triggerConfetti() {
  if (typeof confetti === 'function') {
    const duration = 4000;
    const end = Date.now() + duration;

    (function frame() {
      confetti({
        particleCount: 5,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.7 }
      });
      confetti({
        particleCount: 5,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.7 }
      });
      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    }());
  }
}

// UI Screen Switcher
function showScreen(screenEl) {
  [lobbyScreen, raceScreen, podiumScreen].forEach(el => {
    if (el) el.classList.add('hidden');
  });
  if (screenEl) screenEl.classList.remove('hidden');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Copy link button
copyLinkBtn.addEventListener('click', () => {
  const url = getStudentJoinUrl();
  navigator.clipboard.writeText(url).then(() => {
    copyBtnText.textContent = 'Copied to Clipboard! ✓';
    setTimeout(() => {
      copyBtnText.textContent = 'Copy Student Join Link';
    }, 2000);
  });
});

// Start Tournament button
startGameBtn.addEventListener('click', () => {
  socket.emit('host:start_game');
});

// Release Full Scores & Declare Podium button
releaseScoresBtn.addEventListener('click', () => {
  socket.emit('host:release_scores');
});

// Sound Toggle
function initSoundToggle() {
  soundBtn.addEventListener('click', () => {
    const isMuted = window.sounds.toggleMute();
    soundIcon.className = isMuted ? 'fa-solid fa-volume-xmark text-red-400' : 'fa-solid fa-volume-high';
  });
}

// Fullscreen Toggle
function initFullscreen() {
  fullscreenBtn.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      fullscreenBtn.innerHTML = '<i class="fa-solid fa-compress"></i>';
    } else {
      document.exitFullscreen().catch(() => {});
      fullscreenBtn.innerHTML = '<i class="fa-solid fa-expand"></i>';
    }
  });
}

// CSV Export
downloadResultsBtn.addEventListener('click', () => {
  if (!finalStandings || finalStandings.length === 0) return;
  let csv = 'Rank,Nickname,Score,Accuracy\n';
  finalStandings.forEach(p => {
    csv += `${p.rank},"${p.nickname.replace(/"/g, '""')}",${p.score},${p.accuracy}%\n`;
  });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `APT_Arena_Tournament_${currentGamePin}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

// Test Bot Simulator (Allows host to test self-paced live race immediately)
addBotBtn.addEventListener('click', () => {
  const botNames = ['Alex_Pro', 'Sam_Quizzer', 'Nova_Tech', 'Pixel_Genius', 'Rocket_Ace', 'Cyber_Fox'];
  const botAvatars = ['🦊', '👾', '🚀', '⚡', '🦁', '🎯'];
  const randomName = botNames[Math.floor(Math.random() * botNames.length)] + '_' + Math.floor(Math.random() * 90 + 10);
  const randomAvatar = botAvatars[Math.floor(Math.random() * botAvatars.length)];

  // Connect a virtual player socket
  const botSocket = io();
  botSocket.emit('player:join', {
    pin: currentGamePin,
    nickname: randomName,
    avatar: randomAvatar
  });

  function botAnswerQuestion(qData) {
    const delay = Math.random() * 2500 + 1200; // 1.2s to 3.7s
    setTimeout(() => {
      const pick = Math.floor(Math.random() * (qData.options?.length || 4));
      botSocket.emit('player:submit_answer', {
        questionIndex: qData.index,
        selectedIndex: pick,
        timeTakenMs: Math.round(delay)
      });
    }, delay);
  }

  // When race starts, bot receives Q0
  botSocket.on('player:new_question', (data) => {
    botAnswerQuestion(data);
  });

  // When bot answers, it receives feedback and next question
  botSocket.on('player:answer_feedback', (data) => {
    if (data.nextQuestion && !data.isFinished) {
      botAnswerQuestion(data.nextQuestion);
    }
  });
});
