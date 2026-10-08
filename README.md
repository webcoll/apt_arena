# ⚡ WayGround Live MCQ Tournament Platform

A live interactive quiz competition platform inspired by [Wayground](https://wayground.com) and Kahoot/Quizizz. Built for live student participation, big-screen projector displays, mobile QR code scanning, and real-time competitive leaderboards.

---

## 🌟 Key Features

### 1. 🖥️ Host & Projector Display (`/host.html`)
- **Dynamic 6-Digit Game PIN & Real-Time QR Code**:
  - Automatically generates a scannable high-resolution QR code configured to your local Wi-Fi / LAN IP (`http://<YOUR_IP>:3000/player.html?pin=XXXXXX`).
  - Network switcher: easily switch between Wi-Fi, Ethernet, or Localhost.
  - One-click join link copying.
- **Live Waiting Lobby**:
  - Real-time animated student roster showing nicknames & custom avatars.
  - Host can kick inappropriate participants.
  - **"Add Test Student" button**: lets you simulate and test the entire tournament experience with virtual AI students in 1 click!
- **Cinematic Question Screen**:
  - High-contrast typography readable across large auditoriums or classrooms.
  - Synchronized SVG circular countdown timer with color transitions (purple ➔ red).
  - Real-time answer counter: displays `X / Y Answered` as students submit.
  - 4 iconic color-coded shape options (▲ Red, ◆ Blue, ● Yellow, ■ Green).
- **Question Breakdown & Live Voting Chart**:
  - Animated bar chart showing how many students picked each option.
  - Reveals correct answer with checkmark celebration.
  - Shows question accuracy %, fastest student responder, and question explanation.
- **Dynamic Live Leaderboard**:
  - Top ranking standings with rank medals, avatars, scores, and streak multipliers (`🔥 x3`).
- **Grand Finale & Olympic Podium**:
  - Animated 1st, 2nd, and 3rd place pillars with crowns, trophies, and celebratory confetti cannons (`canvas-confetti`).
  - Full standings scoreboard with accuracy percentage.
  - One-click CSV export of tournament results for teachers/hosts.

---

### 2. 📱 Student / Mobile Experience (`/player.html`)
- **Instant QR Code Camera Join**:
  - Point phone camera at projector screen to auto-open with the Game PIN already filled in!
  - 12 fun avatars (🚀, 🦊, 👾, 🦁, 🐱, 🐼, 🦄, ⚡, 🦖, 🐯, 🍕, 🎯).
  - Enter custom nickname and join with zero login friction.
- **Tactile Answering**:
  - Synchronized 3-2-1 countdown.
  - Massive, colorful touch-friendly response cards.
  - Instant tactile feedback: "Answer Locked In! 🔒".
- **Real-Time Result Feedback**:
  - Dynamic score calculation based on speed & accuracy (up to 1,000 points per question).
  - Consecutive streak bonus multipliers (`🔥 Streak x2 (+100)`).
  - Live ranking updates (`#1 of 24`).
  - Custom podium & trophy screen at tournament completion.

---

### 3. ✏️ Quiz Studio & Authoring (`/creator.html`)
- **Pre-Loaded Quizzes**:
  1. *⚡ Tech & Coding Superstars*
  2. *🚀 Science & Cosmic Wonders*
  3. *🌍 Mega World Trivia*
- **Quiz Creator**:
  - Create, edit, and delete custom quizzes.
  - Set custom question time limits (10s, 15s, 20s, 30s, 60s).
  - Add 4 multiple-choice options with radio selection for the correct answer.
  - Add detailed explanations revealed after the timer expires.
  - Import / Export quiz sets as JSON.

---

### 4. 🔊 Built-in Web Audio Synthesizer (`js/sound.js`)
- Zero external audio file dependencies! Pure browser Web Audio API synthesizer for:
  - Lobby ticks & player joins
  - 3-2-1 countdown beeps
  - Question timer urgency ticks
  - Correct answer celebratory chimes & incorrect buzzers
  - Leaderboard drumrolls & Olympic victory fanfare
  - Mute/Unmute toggle.

---

## 🚀 How to Run the Platform

1. **Start the Server**:
   ```bash
   node server.js
   ```

2. **Access URLs**:
   - **Local PC**: [http://localhost:3000](http://localhost:3000)
   - **Host / Big Screen Display**: [http://localhost:3000/host.html](http://localhost:3000/host.html)
   - **Student Mobile Join**: [http://localhost:3000/player.html](http://localhost:3000/player.html)
   - **Quiz Studio**: [http://localhost:3000/creator.html](http://localhost:3000/creator.html)

3. **Students on Mobile Devices**:
   - Ensure the student phones and host PC are on the same Wi-Fi network.
   - Point the mobile camera directly at the QR code displayed on `/host.html` (e.g. `http://192.168.8.33:3000/player.html?pin=...`).
