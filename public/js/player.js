// Student / Mobile Player Client Logic
const socket = window.realtimeEngine;

const AVATARS = ['🚀', '🦊', '👾', '🦁', '🐱', '🐼', '🦄', '⚡', '🦖', '🐯', '🍕', '🎯'];
let selectedAvatar = AVATARS[0];
let currentQuestionIndex = -1;
let localTimerInterval = null;
let currentScore = 0;

// Screens
const joinScreen = document.getElementById('player-join-screen');
const lobbyScreen = document.getElementById('player-lobby-screen');
const countdownScreen = document.getElementById('player-countdown-screen');
const questionScreen = document.getElementById('player-question-screen');
const lockedScreen = document.getElementById('player-locked-screen');
const resultScreen = document.getElementById('player-result-screen');
const finishedScreen = document.getElementById('player-finished-screen');

// Elements
const topPlayerPill = document.getElementById('top-player-pill');
const topPlayerAvatar = document.getElementById('top-player-avatar');
const topPlayerName = document.getElementById('top-player-name');
const topPlayerScore = document.getElementById('top-player-score');

const joinForm = document.getElementById('join-form');
const inputPin = document.getElementById('input-pin');
const inputNickname = document.getElementById('input-nickname');
const avatarGrid = document.getElementById('avatar-grid');
const joinErrorMsg = document.getElementById('join-error-msg');
const joinErrorText = document.getElementById('join-error-text');

// Lobby
const lobbyConfirmedAvatar = document.getElementById('lobby-confirmed-avatar');
const lobbyPlayerNick = document.getElementById('lobby-player-nick');
const lobbyQuizTitle = document.getElementById('lobby-quiz-title');

// Countdown
const playerCountdownNum = document.getElementById('player-countdown-num');

// Question
const playerQIndex = document.getElementById('player-q-index');
const playerQTimer = document.getElementById('player-q-timer');
const playerQText = document.getElementById('player-q-text');

// Result
const resultStatusIconWrap = document.getElementById('result-status-icon-wrap');
const resultStatusTitle = document.getElementById('result-status-title');
const resultPointsEarned = document.getElementById('result-points-earned');
const resultStreakRow = document.getElementById('result-streak-row');
const resultStreakBonus = document.getElementById('result-streak-bonus');
const resultCurrentRank = document.getElementById('result-current-rank');

// Finished
const finalTrophyIcon = document.getElementById('final-trophy-icon');
const finalRankTagline = document.getElementById('final-rank-tagline');
const finalScoreDisplay = document.getElementById('final-score-display');
const finalAccuracyDisplay = document.getElementById('final-accuracy-display');

// Init
window.addEventListener('DOMContentLoaded', () => {
  renderAvatars();

  // Check URL query param for prefilled PIN from QR code scan
  const urlParams = new URLSearchParams(window.location.search);
  const pinParam = urlParams.get('pin');
  if (pinParam) {
    inputPin.value = pinParam.trim();
    inputNickname.focus();
  }

  initJoinForm();
  initSocketEvents();
});

function renderAvatars() {
  avatarGrid.innerHTML = '';
  AVATARS.forEach((av, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `p-2 rounded-xl text-2xl flex items-center justify-center transition border ${
      idx === 0 ? 'bg-violet-600/40 border-violet-400 scale-105' : 'bg-white/5 border-white/10 hover:bg-white/10'
    }`;
    btn.textContent = av;
    btn.onclick = () => {
      selectedAvatar = av;
      Array.from(avatarGrid.children).forEach(child => {
        child.className = 'p-2 rounded-xl text-2xl flex items-center justify-center transition border bg-white/5 border-white/10 hover:bg-white/10';
      });
      btn.className = 'p-2 rounded-xl text-2xl flex items-center justify-center transition border bg-violet-600/40 border-violet-400 scale-105';
    };
    avatarGrid.appendChild(btn);
  });
}

function initJoinForm() {
  joinForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const pin = inputPin.value.trim();
    const nickname = inputNickname.value.trim();

    if (!pin || !nickname) return;
    joinErrorMsg.classList.add('hidden');

    if (window.supabaseManager && window.supabaseManager.isConfigured()) {
      let playerId = localStorage.getItem('wg_player_id');
      if (!playerId) {
        playerId = 'p_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
        localStorage.setItem('wg_player_id', playerId);
      }
      socket.init('player', pin);
      socket.trackPresence({
        id: playerId,
        nickname: nickname,
        avatar: selectedAvatar,
        score: 0
      });

      socket.trigger('player:joined', {
        playerId,
        nickname,
        avatar: selectedAvatar,
        quizTitle: 'Live Tournament'
      });
    } else {
      socket.init('player', null);
      socket.emit('player:join', {
        pin,
        nickname,
        avatar: selectedAvatar
      });
    }
  });
}

function initSocketEvents() {
  // Successfully joined
  socket.on('player:joined', (data) => {
    showScreen(lobbyScreen);
    lobbyConfirmedAvatar.textContent = data.avatar;
    lobbyPlayerNick.textContent = data.nickname;
    lobbyQuizTitle.textContent = data.quizTitle;

    // Top pill
    topPlayerAvatar.textContent = data.avatar;
    topPlayerName.textContent = data.nickname;
    topPlayerScore.textContent = '0';
    topPlayerPill.classList.remove('hidden');

    window.sounds.playCountdownTick(880, 0.1);
  });

  // Join failed
  socket.on('player:join_failed', (data) => {
    joinErrorMsg.classList.remove('hidden');
    joinErrorText.textContent = data.message || 'Failed to join tournament';
  });

  // Countdown
  socket.on('game:countdown', ({ seconds }) => {
    showScreen(countdownScreen);
    let count = seconds;
    playerCountdownNum.textContent = count;
    window.sounds.playCountdownTick(600);

    const intv = setInterval(() => {
      count--;
      if (count > 0) {
        playerCountdownNum.textContent = count;
        window.sounds.playCountdownTick(600 + (3 - count) * 150);
      } else {
        playerCountdownNum.textContent = 'GO!';
        window.sounds.playGoBeep();
        clearInterval(intv);
      }
    }, 1000);
  });

  // New question active
  socket.on('player:new_question', (data) => {
    currentQuestionIndex = data.index;
    showScreen(questionScreen);

    playerQIndex.textContent = `Q ${data.index + 1} / ${data.totalQuestions}`;
    playerQText.textContent = data.question;

    // Enable all 4 buttons and set labels
    for (let i = 0; i < 4; i++) {
      const btn = document.getElementById(`opt-btn-${i}`);
      const text = document.getElementById(`opt-text-${i}`);
      if (data.options[i]) {
        btn.classList.remove('hidden');
        btn.disabled = false;
        btn.style.opacity = '1';
        text.textContent = data.options[i];
      } else {
        btn.classList.add('hidden');
      }
    }

    // Local countdown
    clearInterval(localTimerInterval);
    let timeLeft = data.timeLimit;
    playerQTimer.textContent = `${timeLeft}s`;
    localTimerInterval = setInterval(() => {
      timeLeft--;
      if (timeLeft >= 0) {
        playerQTimer.textContent = `${timeLeft}s`;
      } else {
        clearInterval(localTimerInterval);
      }
    }, 1000);
  });

  // Answer submitted & acknowledged
  socket.on('player:answer_recorded', () => {
    clearInterval(localTimerInterval);
    showScreen(lockedScreen);
  });

  // Question result
  socket.on('player:question_result', (data) => {
    clearInterval(localTimerInterval);
    showScreen(resultScreen);

    currentScore = data.currentScore;
    topPlayerScore.textContent = currentScore.toLocaleString();

    if (data.isCorrect) {
      window.sounds.playCorrect();
      resultStatusIconWrap.className = 'w-20 h-20 rounded-full mx-auto flex items-center justify-center text-4xl mb-4 shadow-lg bg-emerald-500/20 border-2 border-emerald-400 text-emerald-300';
      resultStatusIconWrap.innerHTML = '<i class="fa-solid fa-check"></i>';
      resultStatusTitle.textContent = 'Correct!';
      resultStatusTitle.className = 'text-3xl font-black text-emerald-400';
      resultPointsEarned.textContent = `+${data.pointsEarned.toLocaleString()}`;

      if (data.streakBonus > 0) {
        resultStreakRow.classList.remove('hidden');
        resultStreakBonus.textContent = `🔥 +${data.streakBonus} (Streak x${data.streak})`;
      } else {
        resultStreakRow.classList.add('hidden');
      }
    } else {
      window.sounds.playIncorrect();
      resultStatusIconWrap.className = 'w-20 h-20 rounded-full mx-auto flex items-center justify-center text-4xl mb-4 shadow-lg bg-red-500/20 border-2 border-red-400 text-red-300';
      resultStatusIconWrap.innerHTML = '<i class="fa-solid fa-xmark"></i>';
      resultStatusTitle.textContent = 'Incorrect!';
      resultStatusTitle.className = 'text-3xl font-black text-red-400';
      resultPointsEarned.textContent = '+0';
      resultStreakRow.classList.add('hidden');
    }

    resultCurrentRank.textContent = `#${data.currentRank} / ${data.totalPlayers}`;
  });

  // Tournament finished (Podium screen - music is ONLY played on main display)
  socket.on('player:game_finished', (data) => {
    showScreen(finishedScreen);
    finalScoreDisplay.textContent = data.score.toLocaleString();
    finalAccuracyDisplay.textContent = `${data.accuracy}%`;

    if (data.rank === 1) {
      finalTrophyIcon.textContent = '👑';
      finalRankTagline.textContent = '🏆 1st Place Champion!';
    } else if (data.rank === 2) {
      finalTrophyIcon.textContent = '🥈';
      finalRankTagline.textContent = '2nd Place Runner-Up!';
    } else if (data.rank === 3) {
      finalTrophyIcon.textContent = '🥉';
      finalRankTagline.textContent = '3rd Place Podium!';
    } else {
      finalTrophyIcon.textContent = '🏅';
      finalRankTagline.textContent = `Rank #${data.rank} of ${data.totalPlayers}`;
    }
  });

  // Kicked
  socket.on('player:kicked', (data) => {
    alert(data.message || 'You were disconnected by the host.');
    window.location.href = 'index.html';
  });
}

// Submit Answer handler
function submitAnswer(index) {
  if (currentQuestionIndex < 0) return;

  // Visual disable
  for (let i = 0; i < 4; i++) {
    const btn = document.getElementById(`opt-btn-${i}`);
    if (btn) btn.disabled = true;
  }

  const selectedBtn = document.getElementById(`opt-btn-${index}`);
  if (selectedBtn) {
    selectedBtn.classList.add('ring-4', 'ring-white');
  }

  socket.emit('player:submit_answer', {
    questionIndex: currentQuestionIndex,
    selectedIndex: index
  });

  showScreen(lockedScreen);
}

// UI helper
function showScreen(screenEl) {
  [joinScreen, lobbyScreen, countdownScreen, questionScreen, lockedScreen, resultScreen, finishedScreen].forEach(el => {
    el.classList.add('hidden');
  });
  screenEl.classList.remove('hidden');
}

// Reset view for student to join another quiz
window.giveAnotherQuiz = function() {
  currentQuestionIndex = -1;
  currentScore = 0;
  inputPin.value = '';
  showScreen(joinScreen);
  topPlayerPill.classList.add('hidden');
  inputPin.focus();
};
