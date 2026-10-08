// Audio System using Web Audio API + Custom MP3 Soundtracks
class SoundManager {
  constructor() {
    this.ctx = null;
    this.muted = false;

    // Custom background tracks
    this.ongoingTrack = new Audio('assets/music/ongoing.mp3');
    this.ongoingTrack.loop = true;
    this.ongoingTrack.volume = 0.4;

    this.tournamentEndTrack = new Audio('assets/music/tournament-end.mp3');
    this.tournamentEndTrack.loop = false;
    this.tournamentEndTrack.volume = 0.6;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    this.ongoingTrack.muted = this.muted;
    this.tournamentEndTrack.muted = this.muted;
    if (this.muted) {
      this.stopOngoingMusic();
      this.stopTournamentEndMusic();
    }
    return this.muted;
  }

  // --- Background Music Tracks ---
  playOngoingMusic() {
    if (this.muted) return;
    this.stopTournamentEndMusic();
    try {
      this.ongoingTrack.currentTime = 0;
      const promise = this.ongoingTrack.play();
      if (promise !== undefined) {
        promise.catch(err => console.log('Audio autoplay prevented or waiting for interaction:', err));
      }
    } catch (e) {
      console.warn('Audio play error:', e);
    }
  }

  stopOngoingMusic() {
    try {
      this.ongoingTrack.pause();
      this.ongoingTrack.currentTime = 0;
    } catch (e) {}
  }

  playTournamentEndMusic() {
    if (this.muted) return;
    this.stopOngoingMusic();
    try {
      this.tournamentEndTrack.currentTime = 0;
      const promise = this.tournamentEndTrack.play();
      if (promise !== undefined) {
        promise.catch(err => console.log('Audio autoplay prevented:', err));
      }
    } catch (e) {
      console.warn('Audio play error:', e);
    }
  }

  stopTournamentEndMusic() {
    try {
      this.tournamentEndTrack.pause();
      this.tournamentEndTrack.currentTime = 0;
    } catch (e) {}
  }

  // --- Interactive FX Synthesizer ---
  playCountdownTick(freq = 600, duration = 0.1) {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.5, this.ctx.currentTime + duration);

    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  playGoBeep() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(880, this.ctx.currentTime);
    osc.frequency.setValueAtTime(1174.66, this.ctx.currentTime + 0.1);

    gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.35);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.35);
  }

  playTimerTick(isUrgent = false) {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    const freq = isUrgent ? 880 : 440;
    osc.type = isUrgent ? 'sawtooth' : 'sine';
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

    gain.gain.setValueAtTime(isUrgent ? 0.12 : 0.06, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.08);
  }

  playTimesUp() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(260, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(130, this.ctx.currentTime + 0.4);

    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.4);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.4);
  }

  playCorrect() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime + idx * 0.07);

      gain.gain.setValueAtTime(0.2, this.ctx.currentTime + idx * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + idx * 0.07 + 0.35);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(this.ctx.currentTime + idx * 0.07);
      osc.stop(this.ctx.currentTime + idx * 0.07 + 0.35);
    });
  }

  playIncorrect() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const notes = [311.13, 293.66]; // Eb4, D4
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime + idx * 0.12);

      gain.gain.setValueAtTime(0.18, this.ctx.currentTime + idx * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + idx * 0.12 + 0.25);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(this.ctx.currentTime + idx * 0.12);
      osc.stop(this.ctx.currentTime + idx * 0.12 + 0.25);
    });
  }

  playLeaderboardFanfare() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const notes = [440, 554.37, 659.25, 880];
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime + idx * 0.09);

      gain.gain.setValueAtTime(0.2, this.ctx.currentTime + idx * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + idx * 0.09 + 0.4);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(this.ctx.currentTime + idx * 0.09);
      osc.stop(this.ctx.currentTime + idx * 0.09 + 0.4);
    });
  }

  playVictory() {
    // Play the user's custom tournament-end.mp3 track!
    this.playTournamentEndMusic();
  }
}

window.sounds = new SoundManager();
