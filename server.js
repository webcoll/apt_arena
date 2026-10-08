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
      scoreHistory: [0],
      attemptHistory: [0],
      timeHistory: [0],
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
  // 3. Host starts tournament race
  socket.on('host:start_game', () => {
    const room = rooms.get(socket.gamePin);
    if (!room || room.hostSocketId !== socket.id) return;

    if (room.players.size === 0) {
      return socket.emit('host:warning', { message: 'Waiting for at least one student to join!' });
    }

    room.status = 'COUNTDOWN';
    io.to(`room_${room.pin}`).emit('game:countdown', { seconds: 3 });

    setTimeout(() => {
      startRace(room);
    }, 3200);
  });

  // Start the live self-paced race
  function startRace(room) {
    room.status = 'RACE_ACTIVE';
    room.raceStartTime = Date.now();

    const totalQuestions = room.quiz.questions.length;
    const q0 = room.quiz.questions[0];

    // Deliver question 1 to each student's phone
    for (const player of room.players.values()) {
      player.currentQuestionIndex = 0;
      player.questionsAnswered = 0;
      player.isFinished = false;
      player.score = 0;
      player.correctCount = 0;
      player.streak = 0;
      player.scoreHistory = [0];
      player.attemptHistory = [0];
      player.timeHistory = [0];
      player.questionStartTime = Date.now();

      const timeLimit = room.settings.overrideTimeLimit || q0.timeLimit || 20;
      io.to(player.socketId).emit('player:new_question', {
        index: 0,
        totalQuestions,
        question: q0.question,
        options: q0.options,
        timeLimit
      });
    }

    // Broadcast race started to host display
    sendRaceUpdate(room, '🏁 The Live Tournament Race has started! Students are solving questions on their phones.');
  }

  // Broadcast real-time pitch standings to host display
  function sendRaceUpdate(room, latestEvent = null) {
    const totalPlayers = room.players.size;
    const totalQuestions = room.quiz.questions.length;

    const sorted = Array.from(room.players.values())
      .sort((a, b) => b.score - a.score || b.correctCount - a.correctCount || (a.timeHistory[a.timeHistory.length - 1] || 0) - (b.timeHistory[b.timeHistory.length - 1] || 0));

    let finishedCount = 0;
    const racers = sorted.map((p, idx) => {
      if (p.isFinished) finishedCount++;
      const progress = totalQuestions > 0 ? Math.min(100, Math.round(((p.questionsAnswered || 0) / totalQuestions) * 100)) : 0;
      return {
        id: p.id,
        rank: idx + 1,
        nickname: p.nickname,
        avatar: p.avatar,
        score: p.score,
        correctCount: p.correctCount,
        questionsAnswered: p.questionsAnswered || 0,
        totalQuestions,
        progressPercent: progress,
        isFinished: !!p.isFinished,
        streak: p.streak,
        scoreHistory: p.scoreHistory || [0],
        attemptHistory: p.attemptHistory || [0],
        timeHistory: p.timeHistory || [0]
      };
    });

    io.to(room.hostSocketId).emit('host:race_update', {
      players: racers,
      finishedCount,
      totalPlayers,
      totalQuestions,
      quizTitle: room.quiz.title,
      allFinished: (finishedCount >= totalPlayers && totalPlayers > 0),
      latestEvent
    });
  }

  // 4. Student submits answer on phone (self-paced)
  socket.on('player:submit_answer', ({ questionIndex, selectedIndex, timeTakenMs }) => {
    const room = rooms.get(socket.gamePin);
    if (!room || room.status !== 'RACE_ACTIVE') return;

    const playerId = socket.playerId;
    const player = room.players.get(playerId);
    if (!player || player.isFinished) return;
    if (player.currentQuestionIndex !== questionIndex) return;

    const rawQ = room.quiz.questions[questionIndex];
    if (!rawQ) return;

    const timeLimit = room.settings.overrideTimeLimit || rawQ.timeLimit || 20;
    const timeTaken = (typeof timeTakenMs === 'number' && timeTakenMs > 0)
      ? timeTakenMs
      : (Date.now() - (player.questionStartTime || Date.now()));

    const isCorrect = (selectedIndex === rawQ.correctIndex);
    let pointsEarned = 0;
    let streakBonus = 0;

    if (isCorrect) {
      const basePoints = calculateScore(timeTaken, timeLimit, true);
      player.streak += 1;
      if (player.streak >= 2) {
        streakBonus = Math.min(500, (player.streak - 1) * 100);
      }
      pointsEarned = basePoints + streakBonus;
      player.score += pointsEarned;
      player.correctCount += 1;
    } else {
      player.streak = 0;
    }

    player.questionsAnswered = (player.questionsAnswered || 0) + 1;
    player.scoreHistory = player.scoreHistory || [0];
    player.attemptHistory = player.attemptHistory || [0];
    player.timeHistory = player.timeHistory || [0];

    player.scoreHistory.push(player.score);
    player.attemptHistory.push(player.correctCount);

    const elapsedSec = parseFloat(Math.min(timeLimit, timeTaken / 1000).toFixed(1));
    const lastTotalTime = player.timeHistory[player.timeHistory.length - 1] || 0;
    player.timeHistory.push(parseFloat((lastTotalTime + elapsedSec).toFixed(1)));

    const nextIdx = questionIndex + 1;
    player.currentQuestionIndex = nextIdx;
    const isFinished = nextIdx >= room.quiz.questions.length;
    player.isFinished = isFinished;
    player.questionStartTime = Date.now();

    // Send answer feedback & next question to this student's phone
    const nextQ = !isFinished ? room.quiz.questions[nextIdx] : null;
    socket.emit('player:answer_feedback', {
      questionIndex,
      selectedIndex,
      isCorrect,
      correctIndex: rawQ.correctIndex,
      pointsEarned,
      streakBonus,
      streak: player.streak,
      currentScore: player.score,
      questionsAnswered: player.questionsAnswered,
      totalQuestions: room.quiz.questions.length,
      isFinished,
      nextQuestion: nextQ ? {
        index: nextIdx,
        totalQuestions: room.quiz.questions.length,
        question: nextQ.question,
        options: nextQ.options,
        timeLimit: room.settings.overrideTimeLimit || nextQ.timeLimit || 20
      } : null
    });

    const eventMsg = isCorrect
      ? `⚡ ${player.nickname} answered Q${questionIndex + 1} correctly! (+${pointsEarned} pts)`
      : `❌ ${player.nickname} missed Q${questionIndex + 1}`;

    // Send instant live pitch update to host display
    sendRaceUpdate(room, eventMsg);
  });

  // 5. Host releases full scores & declares podium
  socket.on('host:release_scores', () => {
    const room = rooms.get(socket.gamePin);
    if (!room || room.hostSocketId !== socket.id) return;
    finishTournament(room);
  });

  // Finish tournament & podium reveal
  function finishTournament(room) {
    room.status = 'FINISHED';

    const rankedPlayers = Array.from(room.players.values())
      .sort((a, b) => b.score - a.score || b.correctCount - a.correctCount || (a.timeHistory[a.timeHistory.length - 1] || 0) - (b.timeHistory[b.timeHistory.length - 1] || 0))
      .map((p, idx) => ({
        rank: idx + 1,
        id: p.id,
        nickname: p.nickname,
        avatar: p.avatar,
        score: p.score,
        correctCount: p.correctCount,
        accuracy: room.quiz.questions.length > 0 ? Math.round((p.correctCount / room.quiz.questions.length) * 100) : 0,
        scoreHistory: p.scoreHistory || [0],
        attemptHistory: p.attemptHistory || [0],
        timeHistory: p.timeHistory || [0]
      }));

    // Emit finale to host display
    io.to(room.hostSocketId).emit('host:game_finished', {
      quizTitle: room.quiz.title,
      podium: rankedPlayers.slice(0, 3),
      allPlayers: rankedPlayers,
      totalQuestions: room.quiz.questions.length
    });

    // Emit final rank & scores to student phones
    rankedPlayers.forEach(p => {
      const playerObj = room.players.get(p.id);
      if (playerObj) {
        io.to(playerObj.socketId).emit('player:game_finished', {
          rank: p.rank,
          score: p.score,
          accuracy: p.accuracy,
          totalPlayers: rankedPlayers.length,
          podium: rankedPlayers.slice(0, 3)
        });
      }
    });
    console.log(`Tournament [${room.pin}] finalized by host. Winner: ${rankedPlayers[0]?.nickname || 'None'}`);
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
