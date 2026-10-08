// Host / Display Logic
const socket = window.realtimeEngine;

// State
let currentGamePin = null;
let currentQuizId = null;
let currentQuizData = null;
let networkIPs = [];
let selectedIP = window.location.hostname;
let selectedPort = window.location.port || '3000';
let activeTimerInterval = null;
let currentQuestionTimeLimit = 20;
let finalStandings = [];
let currentAnswers = new Map();
let currentHostPlayers = new Map();

// DOM Elements
const lobbyScreen = document.getElementById('lobby-screen');
const countdownOverlay = document.getElementById('countdown-overlay');
const countdownNum = document.getElementById('countdown-num');
const questionScreen = document.getElementById('question-screen');
const resultScreen = document.getElementById('result-screen');
const leaderboardScreen = document.getElementById('leaderboard-screen');
const podiumScreen = document.getElementById('podium-screen');

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

// Timer elements
const timerNumber = document.getElementById('timer-number');
const timerRing = document.getElementById('timer-ring');
const answeredCounterText = document.getElementById('answered-counter-text');
const skipQuestionBtn = document.getElementById('skip-question-btn');

// Question display elements
const questionIndexBadge = document.getElementById('question-index-badge');
const questionCategoryBadge = document.getElementById('question-category-badge');
const liveQuestionText = document.getElementById('live-question-text');

// Result elements
const showLeaderboardBtn = document.getElementById('show-leaderboard-btn');
const statAccuracy = document.getElementById('stat-accuracy');
const statFastest = document.getElementById('stat-fastest');
const statFastestName = document.getElementById('stat-fastest-name');
const resultExplanationText = document.getElementById('result-explanation-text');

// Leaderboard elements
const leaderboardList = document.getElementById('leaderboard-list');
const nextQuestionBtn = document.getElementById('next-question-btn');
const nextQuestionBtnText = document.getElementById('next-question-btn-text');

// Podium elements
const downloadResultsBtn = document.getElementById('download-results-btn');
const fullStandingsTable = document.getElementById('full-standings-table');

// Initialize on load
window.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  currentQuizId = urlParams.get('quizId') || 'quiz_tech_stars';

  await initNetworkIPs();
  initHostEvents();
  initSoundToggle();
  initFullscreen();

  // Create game session
  if (window.supabaseManager && window.supabaseManager.isConfigured()) {
    // Static Hostinger Supabase Mode
    const localPin = Math.floor(100000 + Math.random() * 900000).toString();
    currentGamePin = localPin;
    socket.init('host', localPin);

    // Fetch quiz data from Supabase or fallback
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

    // Trigger local creation
    socket.trigger('host:game_created', {
      pin: localPin,
      quizTitle: quiz.title,
      questionCount: quiz.questions.length,
      category: quiz.category
    });
  } else {
    // Socket.io Mode (Node backend)
    socket.init('host', null);
    socket.emit('host:create_game', { quizId: currentQuizId });
  }
});

// Setup IP detection & selector
async function initNetworkIPs() {
  const isCloudHost = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';

  try {
    const res = await fetch('/api/network-ips');
    const data = await res.json();
    networkIPs = data.ips || [];
    selectedPort = data.port || '3000';

    networkIpSelect.innerHTML = '';

    if (isCloudHost) {
      const cloudOpt = document.createElement('option');
      cloudOpt.value = window.location.hostname;
      cloudOpt.textContent = `🌐 ${window.location.hostname} (Live Cloud)`;
      cloudOpt.selected = true;
      networkIpSelect.appendChild(cloudOpt);
      selectedIP = window.location.hostname;
    }

    // Prefer Wi-Fi or LAN IP
    let preferred = networkIPs.find(n => n.isPreferred) || networkIPs[0];

    networkIPs.forEach(n => {
      const opt = document.createElement('option');
      opt.value = n.ip;
      opt.textContent = `📶 ${n.interface} (${n.ip})`;
      if (!isCloudHost && preferred && preferred.ip === n.ip) opt.selected = true;
      networkIpSelect.appendChild(opt);
    });

    // Also add localhost option
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

  // Fallback for Hostinger Static Hosting (Fast public QR generator)
  lobbyQrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(joinUrl)}`;
  lobbyQrImg.onload = () => qrLoading.classList.add('hidden');
  lobbyQrImg.onerror = () => qrLoading.classList.add('hidden');
}

// Socket & Host Events
function initHostEvents() {
  // Game created
  socket.on('host:game_created', ({ pin, quizTitle, questionCount, category }) => {
    currentGamePin = pin;
    lobbyPinDisplay.textContent = `${pin.slice(0, 3)} ${pin.slice(3)}`;
    headerQuizTitle.textContent = quizTitle;
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

    // Play subtle enter chirp
    window.sounds.playCountdownTick(800, 0.05);
  });

  // Start countdown
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
      }
    }, 1000);
  });

  // New Question active
  socket.on('host:new_question', (data) => {
    countdownOverlay.classList.add('hidden');
    showScreen(questionScreen);

    // Play ongoing quiz background music
    window.sounds.playOngoingMusic();

    questionIndexBadge.textContent = `Q ${data.index + 1} / ${data.totalQuestions}`;
    questionCategoryBadge.textContent = data.category || 'Trivia';
    liveQuestionText.textContent = data.question;
    answeredCounterText.textContent = `0 / ${data.totalPlayers} Answered`;

    // Render 4 options
    for (let i = 0; i < 4; i++) {
      const optEl = document.getElementById(`host-opt-${i}`);
      const textEl = document.getElementById(`host-opt-text-${i}`);
      const countEl = document.getElementById(`host-opt-count-${i}`);

      if (data.options[i]) {
        optEl.classList.remove('hidden');
        textEl.textContent = data.options[i];
        countEl.classList.add('hidden');
        countEl.textContent = '0';
        // Reset classes
        optEl.classList.remove('opacity-30', 'ring-4', 'ring-emerald-400', 'scale-105');
      } else {
        optEl.classList.add('hidden');
      }
    }

    // Start timer animation
    currentQuestionTimeLimit = data.timeLimit || 20;
    startQuestionTimer(currentQuestionTimeLimit);
  });

  // Live answer count
  socket.on('host:answer_count_update', ({ answeredCount, totalPlayers }) => {
    answeredCounterText.textContent = `${answeredCount} / ${totalPlayers} Answered`;
  });

  // Question Result
  socket.on('host:question_result', (data) => {
    clearInterval(activeTimerInterval);
    showScreen(resultScreen);
    window.sounds.stopOngoingMusic();
    window.sounds.playTimesUp();

    // Highlight correct option in small preview
    statAccuracy.textContent = `Accuracy: ${data.accuracyPercent}%`;
    if (data.fastestPlayer) {
      statFastest.classList.remove('hidden');
      statFastestName.textContent = `Fastest: ${data.fastestPlayer}`;
    } else {
      statFastest.classList.add('hidden');
    }

    resultExplanationText.textContent = data.explanation || 'No explanation provided.';

    // Populate chart bars
    const maxVotes = Math.max(...data.optionCounts, 1);
    data.optionCounts.forEach((count, idx) => {
      const bar = document.getElementById(`chart-bar-${idx}`);
      const text = document.getElementById(`chart-count-${idx}`);
      text.textContent = count;

      const heightPercent = Math.max(8, Math.round((count / maxVotes) * 100));
      bar.style.height = `${heightPercent}%`;

      // Highlight correct answer bar
      if (idx === data.correctIndex) {
        bar.classList.add('ring-4', 'ring-emerald-400');
      } else {
        bar.classList.remove('ring-4', 'ring-emerald-400');
      }
    });
  });

  // Leaderboard data
  socket.on('host:leaderboard_data', ({ players, currentIndex, totalQuestions, isLastQuestion }) => {
    showScreen(leaderboardScreen);
    window.sounds.playLeaderboardFanfare();
    renderLeaderboard(players);

    if (isLastQuestion) {
      nextQuestionBtnText.textContent = 'VIEW GRAND PODIUM 🏆';
    } else {
      nextQuestionBtnText.textContent = 'NEXT QUESTION ➔';
    }
  });

  // Grand Finale
  socket.on('host:game_finished', (data) => {
    showScreen(podiumScreen);
    finalStandings = data.allPlayers;
    window.sounds.playVictory();

    // Trigger celebration confetti
    triggerConfetti();

    // Render 1st, 2nd, 3rd
    const [p1, p2, p3] = data.podium;
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

    // Render full scoreboard
    renderFullStandings(data.allPlayers);
  });
}

// Timer Controller
function startQuestionTimer(seconds) {
  clearInterval(activeTimerInterval);
  let timeLeft = seconds;
  const circumference = 2 * Math.PI * 24; // r=24 -> ~150.79

  timerNumber.textContent = timeLeft;
  timerRing.style.strokeDasharray = circumference;
  timerRing.style.strokeDashoffset = 0;
  timerRing.setAttribute('stroke', '#8b5cf6');

  activeTimerInterval = setInterval(() => {
    timeLeft--;
    timerNumber.textContent = timeLeft;

    const progress = (seconds - timeLeft) / seconds;
    timerRing.style.strokeDashoffset = circumference * progress;

    if (timeLeft <= 5 && timeLeft > 0) {
      timerRing.setAttribute('stroke', '#ef4444');
      window.sounds.playTimerTick(true);
    } else if (timeLeft > 0) {
      window.sounds.playTimerTick(false);
    }

    if (timeLeft <= 0) {
      clearInterval(activeTimerInterval);
    }
  }, 1000);
}

// Render Players in Lobby
function renderPlayersGrid(players) {
  if (!players || players.length === 0) {
    noPlayersMsg.classList.remove('hidden');
    playersGrid.innerHTML = '';
    playersGrid.appendChild(noPlayersMsg);
    return;
  }

  noPlayersMsg.classList.add('hidden');
  playersGrid.innerHTML = '';

  players.forEach(p => {
    const chip = document.createElement('div');
    chip.className = 'glass-card rounded-2xl p-3 flex items-center justify-between border border-white/10 hover:border-violet-500/50 transition group scale-pop';
    chip.innerHTML = `
      <div class="flex items-center space-x-2.5 truncate">
        <span class="text-2xl">${p.avatar || '🚀'}</span>
        <span class="font-bold text-white text-sm truncate">${escapeHtml(p.nickname)}</span>
      </div>
      <button class="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 text-xs p-1 transition" title="Kick player" onclick="kickPlayer('${p.id}')">
        <i class="fa-solid fa-times"></i>
      </button>
    `;
    playersGrid.appendChild(chip);
  });
}

window.kickPlayer = function(playerId) {
  socket.emit('host:kick_player', { playerId });
};

// Render Leaderboard
function renderLeaderboard(players) {
  leaderboardList.innerHTML = '';

  players.forEach((p, index) => {
    const row = document.createElement('div');
    let rankColor = 'bg-slate-800 text-slate-300';
    let medal = '';

    if (index === 0) {
      rankColor = 'bg-amber-400 text-slate-950 font-black shadow-lg shadow-amber-500/30';
      medal = '👑';
    } else if (index === 1) {
      rankColor = 'bg-slate-300 text-slate-950 font-black';
      medal = '🥈';
    } else if (index === 2) {
      rankColor = 'bg-amber-700 text-white font-black';
      medal = '🥉';
    }

    const streakBadge = p.streak >= 2 
      ? `<span class="px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 text-xs font-black border border-orange-500/40">🔥 x${p.streak}</span>`
      : '';

    row.className = 'glass-card rounded-2xl p-3.5 flex items-center justify-between transition duration-200 hover:border-violet-500/40 scale-pop';
    row.innerHTML = `
      <div class="flex items-center space-x-3.5">
        <div class="w-9 h-9 rounded-xl ${rankColor} flex items-center justify-center font-extrabold text-sm shrink-0">
          ${p.rank}
        </div>
        <div class="text-3xl">${p.avatar || '🚀'}</div>
        <div class="flex items-center space-x-2">
          <span class="font-extrabold text-white text-base">${escapeHtml(p.nickname)}</span>
          ${medal ? `<span class="text-sm">${medal}</span>` : ''}
          ${streakBadge}
        </div>
      </div>
      <div class="font-mono font-black text-violet-300 text-lg">
        ${p.score.toLocaleString()} <span class="text-xs text-slate-400 font-sans font-normal">pts</span>
      </div>
    `;
    leaderboardList.appendChild(row);
  });
}

// Render Full Standings Table
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

// Confetti Blast
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

// UI Helpers
function showScreen(screenEl) {
  [lobbyScreen, questionScreen, resultScreen, leaderboardScreen, podiumScreen].forEach(el => {
    el.classList.add('hidden');
  });
  screenEl.classList.remove('hidden');
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

// Start button
startGameBtn.addEventListener('click', () => {
  socket.emit('host:start_game');
});

// Skip question button
skipQuestionBtn.addEventListener('click', () => {
  socket.emit('host:reveal_answer');
});

// Show leaderboard
showLeaderboardBtn.addEventListener('click', () => {
  socket.emit('host:show_leaderboard');
});

// Next question
nextQuestionBtn.addEventListener('click', () => {
  socket.emit('host:next_question');
});

// Sound Toggle
function initSoundToggle() {
  soundBtn.addEventListener('click', () => {
    const isMuted = window.sounds.toggleMute();
    soundIcon.className = isMuted ? 'fa-solid fa-volume-xmark text-red-400' : 'fa-solid fa-volume-high';
  });
}

// Fullscreen
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

// Test Bot Simulator (Allows host to test tournament immediately)
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

  // Automatically answer incoming questions after random delay
  botSocket.on('player:new_question', (data) => {
    const delay = Math.random() * 3000 + 1500;
    setTimeout(() => {
      const randomPick = Math.floor(Math.random() * data.options.length);
      botSocket.emit('player:submit_answer', {
        questionIndex: data.index,
        selectedIndex: randomPick
      });
    }, delay);
  });
});
