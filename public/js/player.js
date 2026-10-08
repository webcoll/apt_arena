// Student / Mobile Player Client Logic
const socket = window.realtimeEngine;

const AVATARS = ['🚀', '🦊', '👾', '🦁', '🐱', '🐼', '🦄', '⚡', '🦖', '🐯', '🍕', '🎯'];
let selectedAvatar = AVATARS[0];
let currentQuestionIndex = -1;
let localTimerInterval = null;
let currentScore = 0;
let questionStartTime = 0;
let questionTimeLimit = 20;

// Screens
const joinScreen = document.getElementById('player-join-screen');
const lobbyScreen = document.getElementById('player-lobby-screen');
const countdownScreen = document.getElementById('player-countdown-screen');
const questionScreen = document.getElementById('player-question-screen');
const waitingPodiumScreen = document.getElementById('player-waiting-podium-screen');
const finishedScreen = document.getElementById('player-finished-screen');

// Header Elements
const topPlayerPill = document.getElementById('top-player-pill');
const topPlayerAvatar = document.getElementById('top-player-avatar');
const topPlayerName = document.getElementById('top-player-name');
const topPlayerScore = document.getElementById('top-player-score');

// Join Screen
const joinForm = document.getElementById('join-form');
const inputPin = document.getElementById('input-pin');
const inputNickname = document.getElementById('input-nickname');
const avatarGrid = document.getElementById('avatar-grid');
const joinErrorMsg = document.getElementById('join-error-msg');
const joinErrorText = document.getElementById('join-error-text');

// Lobby Screen
const lobbyConfirmedAvatar = document.getElementById('lobby-confirmed-avatar');
const lobbyPlayerNick = document.getElementById('lobby-player-nick');
const lobbyQuizTitle = document.getElementById('lobby-quiz-title');

// Countdown Screen
const playerCountdownNum = document.getElementById('player-countdown-num');

// Question Screen
const playerQIndex = document.getElementById('player-q-index');
const playerQTimer = document.getElementById('player-q-timer');
const playerQText = document.getElementById('player-q-text');

// Feedback Overlay
const feedbackOverlay = document.getElementById('player-feedback-overlay');
const feedbackIconWrap = document.getElementById('feedback-icon-wrap');
const feedbackTitle = document.getElementById('feedback-title');
const feedbackPoints = document.getElementById('feedback-points');
const feedbackStreak = document.getElementById('feedback-streak');

// Waiting for Podium Screen
const waitingScoreDisplay = document.getElementById('waiting-score-display');
const waitingSolvedDisplay = document.getElementById('waiting-solved-display');

// Finished Screen
const finalTrophyIcon = document.getElementById('final-trophy-icon');
const finalRankTagline = document.getElementById('final-rank-tagline');
const finalScoreDisplay = document.getElementById('final-score-display');
const finalAccuracyDisplay = document.getElementById('final-accuracy-display');

// Init on load
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

    // Top player pill
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

  // New question active (starts race on phone)
  socket.on('player:new_question', (data) => {
    renderQuestion(data);
  });

  // Answer feedback from server (self-paced transition)
  socket.on('player:answer_feedback', (data) => {
    clearInterval(localTimerInterval);

    currentScore = data.currentScore;
    topPlayerScore.textContent = currentScore.toLocaleString();

    // Show quick feedback overlay
    if (data.isCorrect) {
      window.sounds.playCorrect();
      feedbackIconWrap.className = 'w-24 h-24 rounded-full flex items-center justify-center text-5xl mb-4 shadow-2xl bg-emerald-500/20 border-2 border-emerald-400 text-emerald-300';
      feedbackIconWrap.innerHTML = '<i class="fa-solid fa-check"></i>';
      feedbackTitle.textContent = 'Correct!';
      feedbackTitle.className = 'text-3xl font-black text-emerald-400 mb-2';
      feedbackPoints.textContent = `+${data.pointsEarned.toLocaleString()} pts`;
      if (data.streakBonus > 0) {
        feedbackStreak.classList.remove('hidden');
        feedbackStreak.textContent = `🔥 Streak x${data.streak} (+${data.streakBonus} bonus)`;
      } else {
        feedbackStreak.classList.add('hidden');
      }
    } else {
      window.sounds.playIncorrect();
      feedbackIconWrap.className = 'w-24 h-24 rounded-full flex items-center justify-center text-5xl mb-4 shadow-2xl bg-red-500/20 border-2 border-red-400 text-red-300';
      feedbackIconWrap.innerHTML = '<i class="fa-solid fa-xmark"></i>';
      feedbackTitle.textContent = 'Incorrect!';
      feedbackTitle.className = 'text-3xl font-black text-red-400 mb-2';
      feedbackPoints.textContent = '+0 pts';
      feedbackStreak.classList.add('hidden');
    }

    feedbackOverlay.classList.remove('hidden');

    // After 900ms, load next question or transition to waiting screen
    setTimeout(() => {
      feedbackOverlay.classList.add('hidden');

      if (data.isFinished) {
        // Student completed all questions!
        waitingScoreDisplay.textContent = `${data.currentScore.toLocaleString()} pts`;
        waitingSolvedDisplay.textContent = `${data.questionsAnswered} / ${data.totalQuestions} Solved`;
        showScreen(waitingPodiumScreen);
      } else if (data.nextQuestion) {
        // Load next question immediately
        renderQuestion(data.nextQuestion);
      }
    }, 900);
  });

  // Tournament finished & full scores released by host
  socket.on('player:game_finished', (data) => {
    clearInterval(localTimerInterval);
    if (feedbackOverlay) feedbackOverlay.classList.add('hidden');
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

// Render active question on student phone
function renderQuestion(data) {
  currentQuestionIndex = data.index;
  questionTimeLimit = data.timeLimit || 20;
  questionStartTime = Date.now();

  showScreen(questionScreen);
  if (feedbackOverlay) feedbackOverlay.classList.add('hidden');

  playerQIndex.textContent = `Q ${data.index + 1} / ${data.totalQuestions}`;
  playerQText.textContent = data.question;

  // Reset and enable all 4 option buttons
  for (let i = 0; i < 4; i++) {
    const btn = document.getElementById(`opt-btn-${i}`);
    const text = document.getElementById(`opt-text-${i}`);
    if (btn && text) {
      if (data.options[i]) {
        btn.classList.remove('hidden', 'ring-4', 'ring-white', 'opacity-50');
        btn.disabled = false;
        text.textContent = data.options[i];
      } else {
        btn.classList.add('hidden');
      }
    }
  }

  // Question local timer
  clearInterval(localTimerInterval);
  let timeLeft = questionTimeLimit;
  playerQTimer.textContent = `${timeLeft}s`;

  localTimerInterval = setInterval(() => {
    timeLeft--;
    if (timeLeft >= 0) {
      playerQTimer.textContent = `${timeLeft}s`;
    } else {
      clearInterval(localTimerInterval);
      // Timeout auto-submit (incorrect)
      submitAnswer(-1);
    }
  }, 1000);
}

// Submit Answer handler
function submitAnswer(index) {
  if (currentQuestionIndex < 0) return;
  clearInterval(localTimerInterval);

  // Disable buttons to prevent double-submit
  for (let i = 0; i < 4; i++) {
    const btn = document.getElementById(`opt-btn-${i}`);
    if (btn) btn.disabled = true;
  }

  if (index >= 0) {
    const selectedBtn = document.getElementById(`opt-btn-${index}`);
    if (selectedBtn) selectedBtn.classList.add('ring-4', 'ring-white');
  }

  const timeTakenMs = Math.max(100, Date.now() - questionStartTime);

  socket.emit('player:submit_answer', {
    questionIndex: currentQuestionIndex,
    selectedIndex: index,
    timeTakenMs
  });
}

// UI helper: screen switcher
function showScreen(screenEl) {
  [joinScreen, lobbyScreen, countdownScreen, questionScreen, waitingPodiumScreen, finishedScreen].forEach(el => {
    if (el) el.classList.add('hidden');
  });
  if (screenEl) screenEl.classList.remove('hidden');
}

// Reset view for student to join another quiz directly
window.giveAnotherQuiz = function() {
  currentQuestionIndex = -1;
  currentScore = 0;
  inputPin.value = '';
  showScreen(joinScreen);
  topPlayerPill.classList.add('hidden');
  inputPin.focus();
};
