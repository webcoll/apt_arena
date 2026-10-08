const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const os = require('os');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;
const QUIZZES_FILE = path.join(__dirname, 'data', 'quizzes.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper to get local network IP addresses
function getNetworkIPs() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push({
          interface: name,
          ip: net.address,
          isPreferred: /wi-fi|wireless|wlan|ethernet/i.test(name)
        });
      }
    }
  }
  return addresses;
}

// Load Quizzes
function loadQuizzes() {
  try {
    if (fs.existsSync(QUIZZES_FILE)) {
      const data = fs.readFileSync(QUIZZES_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error reading quizzes.json:', err);
  }
  return [];
}

// Save Quizzes
function saveQuizzes(quizzes) {
  try {
    fs.writeFileSync(QUIZZES_FILE, JSON.stringify(quizzes, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Error saving quizzes.json:', err);
    return false;
  }
}

// --- REST API ---
app.get('/api/network-ips', (req, res) => {
  const ips = getNetworkIPs();
  res.json({ ips, port: PORT });
});

app.get('/api/quizzes', (req, res) => {
  res.json(loadQuizzes());
});

app.post('/api/quizzes', (req, res) => {
  const quiz = req.body;
  if (!quiz.title || !Array.isArray(quiz.questions) || quiz.questions.length === 0) {
    return res.status(400).json({ error: 'Quiz must have title and at least one question.' });
  }
  const quizzes = loadQuizzes();
  quiz.id = quiz.id || 'quiz_' + Date.now();
  quizzes.unshift(quiz);
  saveQuizzes(quizzes);
  res.json({ success: true, quiz });
});

app.put('/api/quizzes/:id', (req, res) => {
  const { id } = req.params;
  const updated = req.body;
  let quizzes = loadQuizzes();
  const idx = quizzes.findIndex(q => q.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Quiz not found' });
  quizzes[idx] = { ...quizzes[idx], ...updated, id };
  saveQuizzes(quizzes);
  res.json({ success: true, quiz: quizzes[idx] });
});

app.delete('/api/quizzes/:id', (req, res) => {
  const { id } = req.params;
  let quizzes = loadQuizzes();
  quizzes = quizzes.filter(q => q.id !== id);
  saveQuizzes(quizzes);
  res.json({ success: true });
});

app.get('/api/qrcode', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: 'url query parameter required' });
  try {
    const dataUrl = await QRCode.toDataURL(url, {
      margin: 1,
      color: {
        dark: '#1e1b4b',
        light: '#ffffff'
      },
      width: 320
    });
    res.json({ dataUrl });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// Helper: Parse Google Form HTML
function parseGoogleFormData(html) {
  // Regex to extract Google Forms public data block
  const match = html.match(/FB_PUBLIC_LOAD_DATA_\s*=\s*(\[.+?\]);\s*<\/script>/s) || 
                html.match(/var\s+FB_PUBLIC_LOAD_DATA_\s*=\s*(\[.+?\]);/s);
  if (!match) return null;

  try {
    const data = JSON.parse(match[1]);
    const formTitle = (data[1] && data[1][8]) || (data[1] && data[1][0]) || 'Imported Google Form Quiz';
    const formDesc = (data[1] && data[1][1] && data[1][0]) || '';
    const rawItems = (data[1] && data[1][1]) || [];
    const questions = [];

    rawItems.forEach((item, idx) => {
      const qTitle = item[1];
      if (!qTitle) return;

      const entry = item[4] && item[4][0];
      if (entry && Array.isArray(entry[1]) && entry[1].length >= 2) {
        // Multiple choice options
        const opts = entry[1].map(o => {
          if (Array.isArray(o)) return o[0];
          return o;
        }).filter(Boolean);

        // Ensure 2 to 4 options
        if (opts.length >= 2) {
          questions.push({
            id: 'q_gf_' + (idx + 1) + '_' + Date.now().toString(36).substr(4),
            question: qTitle.trim(),
            options: opts.slice(0, 4),
            correctIndex: 0,
            timeLimit: 20,
            points: 1000,
            explanation: item[2] || ''
          });
        }
      }
    });

    return {
      title: formTitle,
      description: formDesc,
      questions
    };
  } catch (err) {
    console.error('Error parsing Google Form JSON:', err);
    return null;
  }
}

// Endpoint: Import questions directly from a Google Form URL or HTML
app.post('/api/import-google-form', async (req, res) => {
  let { url, rawHtml } = req.body;

  if (rawHtml) {
    const result = parseGoogleFormData(rawHtml);
    if (!result || result.questions.length === 0) {
      return res.status(400).json({ error: 'Could not find any multiple choice questions in the provided HTML.' });
    }
    return res.json({ success: true, ...result });
  }

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Valid Google Form URL required.' });
  }

  // Normalize Google Form URL
  let targetUrl = url.trim();
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = 'https://' + targetUrl;
  }

  if (targetUrl.includes('docs.google.com/forms')) {
    // If edit link, convert to viewform
    targetUrl = targetUrl.replace(/\/edit(\?.*)?$/, '/viewform');
    if (!targetUrl.includes('/viewform')) {
      targetUrl = targetUrl.replace(/\/?$/, '/viewform');
    }
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });

    if (!response.ok) {
      return res.status(400).json({ 
        error: `Failed to fetch Google Form (Status ${response.status}). Ensure the form is set to "Public" or "Anyone with the link".` 
      });
    }

    const html = await response.text();
    const result = parseGoogleFormData(html);

    if (!result || !Array.isArray(result.questions) || result.questions.length === 0) {
      return res.status(400).json({ 
        error: 'No multiple-choice questions found. Ensure the form has multiple-choice questions and is publicly accessible without login.' 
      });
    }

    res.json({ success: true, ...result });
  } catch (err) {
    console.error('Google Form fetch error:', err);
    res.status(500).json({ 
      error: 'Could not connect to Google Form. Check the link and ensure it is public.' 
    });
  }
});

// --- IN-MEMORY ROOM MANAGER ---
const rooms = new Map();

function generateGamePin() {
  let pin;
  do {
    pin = Math.floor(100000 + Math.random() * 900000).toString();
  } while (rooms.has(pin));
  return pin;
}

function calculateScore(timeTakenMs, timeLimitSec, isCorrect) {
  if (!isCorrect) return 0;
  const totalMs = timeLimitSec * 1000;
  const safeTimeTaken = Math.min(timeTakenMs, totalMs);
  const timeRatio = Math.max(0, (totalMs - safeTimeTaken) / totalMs);
  // Base 500 + up to 500 for speed
  const score = Math.round(500 + 500 * timeRatio);
  return Math.min(1000, Math.max(500, score));
}

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // 1. Host creates game
  socket.on('host:create_game', ({ quizId, settings }) => {
    const quizzes = loadQuizzes();
    const quiz = quizzes.find(q => q.id === quizId) || quizzes[0];
    if (!quiz) {
      return socket.emit('error', { message: 'Quiz not found' });
    }

    const pin = generateGamePin();
    const room = {
      pin,
      hostSocketId: socket.id,
      quiz: JSON.parse(JSON.stringify(quiz)), // clone
      status: 'LOBBY',
      currentQuestionIndex: -1,
      questionTimer: null,
      questionStartTime: 0,
      questionTimeLimit: 20,
      settings: settings || {},
      players: new Map(),
      answersSubmitted: new Map()
    };

    rooms.set(pin, room);
    socket.join(`room_${pin}`);
    socket.gamePin = pin;
    socket.isHost = true;

    socket.emit('host:game_created', {
      pin,
      quizTitle: quiz.title,
      questionCount: quiz.questions.length,
      category: quiz.category
    });
    console.log(`Tournament created. PIN: ${pin}, Quiz: ${quiz.title}`);
  });

  // 2. Player joins room
  socket.on('player:join', ({ pin, nickname, avatar }) => {
    const cleanPin = (pin || '').trim();
    const room = rooms.get(cleanPin);

    if (!room) {
      return socket.emit('player:join_failed', { message: 'Tournament PIN not found! Check code.' });
    }

    const cleanNick = (nickname || '').trim().slice(0, 15);
    if (!cleanNick) {
      return socket.emit('player:join_failed', { message: 'Please enter a valid nickname.' });
    }

    // Check duplicate nickname in room
    for (const p of room.players.values()) {
      if (p.nickname.toLowerCase() === cleanNick.toLowerCase() && p.socketId !== socket.id) {
        return socket.emit('player:join_failed', { message: 'Nickname already taken! Choose another.' });
      }
    }

    const playerId = socket.playerId || uuidv4();
    const playerObj = {
      id: playerId,
      socketId: socket.id,
      nickname: cleanNick,
      avatar: avatar || '🚀',
      score: 0,
      streak: 0,
      correctCount: 0,
      lastAnswerResult: null,
      joinedAt: Date.now()
    };

    room.players.set(playerId, playerObj);
    socket.join(`room_${cleanPin}`);
    socket.gamePin = cleanPin;
    socket.playerId = playerId;
    socket.isPlayer = true;

    // Send success to player
    socket.emit('player:joined', {
      playerId,
      nickname: cleanNick,
      avatar: playerObj.avatar,
      quizTitle: room.quiz.title,
      roomStatus: room.status
    });

    // Notify host about new player
    const playerList = Array.from(room.players.values()).map(p => ({
      id: p.id,
      nickname: p.nickname,
      avatar: p.avatar,
      score: p.score
    }));

    io.to(room.hostSocketId).emit('host:player_list_updated', {
      players: playerList,
      count: playerList.length
    });
    console.log(`Player [${cleanNick}] joined game ${cleanPin}`);
  });

  // 3. Host starts tournament
  socket.on('host:start_game', () => {
    const room = rooms.get(socket.gamePin);
    if (!room || room.hostSocketId !== socket.id) return;

    if (room.players.size === 0) {
      return socket.emit('host:warning', { message: 'Waiting for at least one student to join!' });
    }

    room.status = 'COUNTDOWN';
    io.to(`room_${room.pin}`).emit('game:countdown', { seconds: 3 });

    setTimeout(() => {
      startQuestion(room, 0);
    }, 3200);
  });

  // Start a specific question
  function startQuestion(room, index) {
    if (index >= room.quiz.questions.length) {
      // Tournament finished!
      finishTournament(room);
      return;
    }

    room.currentQuestionIndex = index;
    room.status = 'QUESTION_ACTIVE';
    room.answersSubmitted.clear();

    const rawQ = room.quiz.questions[index];
    const timeLimit = room.settings.overrideTimeLimit || rawQ.timeLimit || 20;
    room.questionTimeLimit = timeLimit;
    room.questionStartTime = Date.now();

    // Prepare host payload (includes full info)
    const hostQuestionPayload = {
      index,
      totalQuestions: room.quiz.questions.length,
      question: rawQ.question,
      options: rawQ.options,
      timeLimit,
      points: rawQ.points || 1000,
      category: room.quiz.category,
      totalPlayers: room.players.size
    };

    // Prepare player payload (options with clean labels)
    const playerQuestionPayload = {
      index,
      totalQuestions: room.quiz.questions.length,
      question: rawQ.question,
      options: rawQ.options,
      timeLimit
    };

    io.to(room.hostSocketId).emit('host:new_question', hostQuestionPayload);
    // Emit to all players in the room
    for (const [pid, player] of room.players.entries()) {
      io.to(player.socketId).emit('player:new_question', playerQuestionPayload);
    }

    // Set server-side auto timer
    if (room.questionTimer) clearTimeout(room.questionTimer);
    room.questionTimer = setTimeout(() => {
      endQuestion(room);
    }, (timeLimit + 0.5) * 1000);
  }

  // 4. Player submits answer
  socket.on('player:submit_answer', ({ questionIndex, selectedIndex }) => {
    const room = rooms.get(socket.gamePin);
    if (!room || room.status !== 'QUESTION_ACTIVE' || room.currentQuestionIndex !== questionIndex) {
      return;
    }

    const playerId = socket.playerId;
    const player = room.players.get(playerId);
    if (!player || room.answersSubmitted.has(playerId)) return; // already answered

    const rawQ = room.quiz.questions[questionIndex];
    const timeTakenMs = Date.now() - room.questionStartTime;
    const isCorrect = selectedIndex === rawQ.correctIndex;

    let pointsEarned = 0;
    let streakBonus = 0;

    if (isCorrect) {
      const basePoints = calculateScore(timeTakenMs, room.questionTimeLimit, true);
      player.streak += 1;
      // Streak bonus: 2 => +100, 3 => +200, 4 => +300, 5+ => +500
      if (player.streak >= 2) {
        streakBonus = Math.min(500, (player.streak - 1) * 100);
      }
      pointsEarned = basePoints + streakBonus;
      player.score += pointsEarned;
      player.correctCount += 1;
    } else {
      player.streak = 0;
    }

    player.lastAnswerResult = {
      selectedIndex,
      isCorrect,
      pointsEarned,
      streakBonus,
      streak: player.streak
    };

    room.answersSubmitted.set(playerId, {
      selectedIndex,
      isCorrect,
      timeTakenMs,
      pointsEarned
    });

    // Notify player that answer was locked in
    socket.emit('player:answer_recorded', {
      selectedIndex
    });

    // Notify host of live count update
    io.to(room.hostSocketId).emit('host:answer_count_update', {
      answeredCount: room.answersSubmitted.size,
      totalPlayers: room.players.size
    });

    // If all connected players have answered, wrap up question early!
    if (room.answersSubmitted.size >= room.players.size) {
      if (room.questionTimer) clearTimeout(room.questionTimer);
      // Brief 600ms pause so final click feels natural before revealing
      setTimeout(() => {
        if (room.status === 'QUESTION_ACTIVE') {
          endQuestion(room);
        }
      }, 600);
    }
  });

  // End active question and tally stats
  function endQuestion(room) {
    if (room.status !== 'QUESTION_ACTIVE') return;
    room.status = 'QUESTION_ENDED';
    if (room.questionTimer) clearTimeout(room.questionTimer);

    const qIdx = room.currentQuestionIndex;
    const rawQ = room.quiz.questions[qIdx];

    // Compute distribution of answers
    const optionCounts = [0, 0, 0, 0];
    let correctCount = 0;
    let fastestPlayer = null;
    let fastestTime = Infinity;

    for (const [pId, ans] of room.answersSubmitted.entries()) {
      if (ans.selectedIndex >= 0 && ans.selectedIndex < 4) {
        optionCounts[ans.selectedIndex]++;
      }
      if (ans.isCorrect) {
        correctCount++;
        if (ans.timeTakenMs < fastestTime) {
          fastestTime = ans.timeTakenMs;
          const p = room.players.get(pId);
          if (p) fastestPlayer = p.nickname;
        }
      }
    }

    // Sort players to calculate ranks
    const sorted = Array.from(room.players.values()).sort((a, b) => b.score - a.score);
    const ranks = new Map();
    sorted.forEach((p, idx) => ranks.set(p.id, idx + 1));

    // Send host question summary
    io.to(room.hostSocketId).emit('host:question_result', {
      correctIndex: rawQ.correctIndex,
      explanation: rawQ.explanation || '',
      optionCounts,
      answeredCount: room.answersSubmitted.size,
      totalPlayers: room.players.size,
      correctCount,
      accuracyPercent: room.players.size > 0 ? Math.round((correctCount / room.players.size) * 100) : 0,
      fastestPlayer: fastestPlayer ? `${fastestPlayer} (${(fastestTime / 1000).toFixed(2)}s)` : null
    });

    // Send individual results to each player
    for (const [pId, player] of room.players.entries()) {
      const res = player.lastAnswerResult || {
        selectedIndex: -1,
        isCorrect: false,
        pointsEarned: 0,
        streakBonus: 0,
        streak: 0
      };

      io.to(player.socketId).emit('player:question_result', {
        ...res,
        correctIndex: rawQ.correctIndex,
        currentScore: player.score,
        currentRank: ranks.get(pId) || 1,
        totalPlayers: room.players.size
      });
    }
  }

  // 5. Host reveals leaderboard
  socket.on('host:show_leaderboard', () => {
    const room = rooms.get(socket.gamePin);
    if (!room || room.hostSocketId !== socket.id) return;

    room.status = 'LEADERBOARD';

    const sortedPlayers = Array.from(room.players.values())
      .sort((a, b) => b.score - a.score)
      .map((p, idx) => ({
        rank: idx + 1,
        id: p.id,
        nickname: p.nickname,
        avatar: p.avatar,
        score: p.score,
        streak: p.streak
      }));

    io.to(room.hostSocketId).emit('host:leaderboard_data', {
      players: sortedPlayers,
      currentIndex: room.currentQuestionIndex,
      totalQuestions: room.quiz.questions.length,
      isLastQuestion: room.currentQuestionIndex + 1 >= room.quiz.questions.length
    });

    io.to(`room_${room.pin}`).emit('game:leaderboard_active');
  });

  // 6. Host advances to next question
  socket.on('host:next_question', () => {
    const room = rooms.get(socket.gamePin);
    if (!room || room.hostSocketId !== socket.id) return;

    const nextIdx = room.currentQuestionIndex + 1;
    if (nextIdx >= room.quiz.questions.length) {
      finishTournament(room);
    } else {
      startQuestion(room, nextIdx);
    }
  });

  // Finish tournament & podium reveal
  function finishTournament(room) {
    room.status = 'FINISHED';

    const rankedPlayers = Array.from(room.players.values())
      .sort((a, b) => b.score - a.score)
      .map((p, idx) => ({
        rank: idx + 1,
        id: p.id,
        nickname: p.nickname,
        avatar: p.avatar,
        score: p.score,
        correctCount: p.correctCount,
        accuracy: Math.round((p.correctCount / room.quiz.questions.length) * 100)
      }));

    // Emit finale to host display
    io.to(room.hostSocketId).emit('host:game_finished', {
      quizTitle: room.quiz.title,
      podium: rankedPlayers.slice(0, 3),
      allPlayers: rankedPlayers,
      totalQuestions: room.quiz.questions.length
    });

    // Emit final rank & trophy to players
    rankedPlayers.forEach(p => {
      io.to(room.players.get(p.id).socketId).emit('player:game_finished', {
        rank: p.rank,
        score: p.score,
        totalPlayers: rankedPlayers.length,
        accuracy: p.accuracy
      });
    });
  }

  // Host kicks a player from lobby
  socket.on('host:kick_player', ({ playerId }) => {
    const room = rooms.get(socket.gamePin);
    if (!room || room.hostSocketId !== socket.id) return;

    const p = room.players.get(playerId);
    if (p) {
      io.to(p.socketId).emit('player:kicked', { message: 'You were removed by the host.' });
      room.players.delete(playerId);
      const playerList = Array.from(room.players.values()).map(pl => ({
        id: pl.id,
        nickname: pl.nickname,
        avatar: pl.avatar,
        score: pl.score
      }));
      io.to(room.hostSocketId).emit('host:player_list_updated', {
        players: playerList,
        count: playerList.length
      });
    }
  });

  // Disconnect handler
  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
    if (socket.isHost && socket.gamePin) {
      const room = rooms.get(socket.gamePin);
      if (room && room.hostSocketId === socket.id) {
        // Room host disconnected, notify players
        io.to(`room_${socket.gamePin}`).emit('game:host_disconnected', {
          message: 'The host has disconnected.'
        });
      }
    } else if (socket.isPlayer && socket.gamePin) {
      const room = rooms.get(socket.gamePin);
      if (room) {
        if (room.status === 'LOBBY') {
          // If in lobby, remove player
          room.players.delete(socket.playerId);
          const playerList = Array.from(room.players.values()).map(pl => ({
            id: pl.id,
            nickname: pl.nickname,
            avatar: pl.avatar,
            score: pl.score
          }));
          io.to(room.hostSocketId).emit('host:player_list_updated', {
            players: playerList,
            count: playerList.length
          });
        }
      }
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`🎉 Live MCQ Tournament Server is Running!`);
  console.log(`🌐 Local Host:   http://localhost:${PORT}`);
  const ips = getNetworkIPs();
  ips.forEach(net => {
    console.log(`📱 LAN Network:  http://${net.ip}:${PORT}  (${net.interface})`);
  });
  console.log(`=======================================================`);
});
