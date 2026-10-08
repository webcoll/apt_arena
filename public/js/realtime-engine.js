// Universal Realtime Engine
// Bridges between Supabase Realtime (for Hostinger Static Hosting) and Socket.io (Localhost/Node)

class UniversalRealtimeEngine {
  constructor() {
    this.mode = 'socketio'; // 'supabase' or 'socketio'
    this.channel = null;
    this.socket = null;
    this.callbacks = new Map();
    this.pin = null;
    this.role = 'player'; // 'host' or 'player'
    this.presenceList = [];
  }

  init(role, pin) {
    this.role = role;
    this.pin = pin;

    // Check if Supabase is configured
    if (window.supabaseManager && window.supabaseManager.isConfigured()) {
      this.mode = 'supabase';
      console.log('⚡ UniversalRealtimeEngine: Running in SUPABASE REALTIME mode (Hostinger Static Compatible)');
      this.initSupabaseChannel();
    } else {
      this.mode = 'socketio';
      console.log('🔌 UniversalRealtimeEngine: Running in SOCKET.IO mode');
      if (typeof io === 'function') {
        this.socket = io();
        this.initSocketEvents();
      }
    }
  }

  // --- SUPABASE REALTIME CHANNELS ---
  initSupabaseChannel() {
    const sb = window.supabaseManager.client;
    const channelName = `tournament_${this.pin}`;

    this.channel = sb.channel(channelName, {
      config: {
        broadcast: { self: false },
        presence: { key: this.role === 'host' ? 'host' : (localStorage.getItem('wg_player_id') || ('p_' + Date.now())) }
      }
    });

    // Listen to broadcast events
    const supportedEvents = [
      'host:game_created',
      'host:player_list_updated',
      'host:new_question',
      'host:answer_count_update',
      'host:question_result',
      'host:leaderboard_data',
      'host:game_finished',
      'game:countdown',
      'player:joined',
      'player:new_question',
      'player:answer_recorded',
      'player:question_result',
      'player:game_finished',
      'player:submit_answer'
    ];

    supportedEvents.forEach(evt => {
      this.channel.on('broadcast', { event: evt }, ({ payload }) => {
        this.trigger(evt, payload);
      });
    });

    // Track Presence (Lobby players)
    this.channel.on('presence', { event: 'sync' }, () => {
      const state = this.channel.presenceState();
      const players = [];
      Object.keys(state).forEach(key => {
        if (key !== 'host') {
          const pData = state[key][0];
          if (pData) players.push(pData);
        }
      });
      this.presenceList = players;
      if (this.role === 'host') {
        this.trigger('host:player_list_updated', {
          players: players,
          count: players.length
        });
      }
    });

    this.channel.subscribe(status => {
      console.log(`Supabase Channel [${channelName}] status:`, status);
      if (status === 'SUBSCRIBED') {
        this.trigger('connected', { mode: 'supabase' });
      }
    });
  }

  // --- SOCKET.IO EVENTS ---
  initSocketEvents() {
    if (!this.socket) return;
    this.socket.onAny((event, data) => {
      this.trigger(event, data);
    });
    this.socket.on('connect', () => {
      this.trigger('connected', { mode: 'socketio' });
    });
  }

  // Subscribe to an event
  on(event, callback) {
    if (!this.callbacks.has(event)) {
      this.callbacks.set(event, []);
    }
    this.callbacks.get(event).push(callback);

    // If socket.io mode, also forward directly
    if (this.mode === 'socketio' && this.socket) {
      this.socket.on(event, callback);
    }
  }

  // Emit event to network
  emit(event, data) {
    if (this.mode === 'supabase' && this.channel) {
      this.channel.send({
        type: 'broadcast',
        event: event,
        payload: data
      });
    } else if (this.mode === 'socketio' && this.socket) {
      this.socket.emit(event, data);
    }
  }

  // Track presence (Player joins)
  trackPresence(playerData) {
    if (this.mode === 'supabase' && this.channel) {
      this.channel.track(playerData);
    }
  }

  trigger(event, data) {
    const list = this.callbacks.get(event);
    if (list) {
      list.forEach(cb => {
        try { cb(data); } catch (e) { console.error('Error in event handler for', event, e); }
      });
    }
  }
}

window.realtimeEngine = new UniversalRealtimeEngine();
