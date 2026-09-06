(function () {
  const socket = io();

  const SESSION_KEY = 'widerstand_session';

  let session = null; // { code, playerId, token, name }
  let myRole = null; // { role, spies }
  let latestState = null;
  let prevPhase = null;
  let selectedTeam = new Set();
  let readyClicked = false;
  let votedRound = null; // voteRound already acted on
  let playedRound = null; // missionRound already acted on
  let myPlotHand = []; // eigene, ungenutzte Plottkarten (IDs)
  let commanderGuessSubmitted = false; // eigener Rateversuch in der Kommandant-Phase bereits abgeschickt

  // Muss inhaltlich mit PLOT_CARD_INFO in server.js übereinstimmen.
  const PLOT_CARD_CATALOG = {
    wiretap: { name: 'Abhörmaßnahme', icon: '🎧', category: 'immediate', desc: 'Sieh heimlich die Rolle eines Spielers.' },
    opinionLeader: { name: 'Meinungsmacher', icon: '📣', category: 'permanent', desc: 'Muss die Stimme künftig immer zuerst offenlegen.' },
    buildTrust: { name: 'Vertrauen bilden', icon: '🤝', category: 'immediate', desc: 'Der Team-Chef offenbart seine Rolle jemandem.' },
    revealSelf: { name: 'Sich offenbaren', icon: '🃏', category: 'immediate', desc: 'Zeige deine Rolle einem Spieler deiner Wahl.' },
    distrust: { name: 'Misstrauen', icon: '⚠️', category: 'held', desc: 'Kippe ein gerade angenommenes Team in eine Ablehnung.' },
    surveillance: { name: 'Überwachung', icon: '🔍', category: 'held', desc: 'Sieh heimlich, was ein Team-Mitglied zuletzt gespielt hat.' },
    leadership: { name: 'Führungsstärke', icon: '👑', category: 'held', desc: 'Übernimm zu Rundenbeginn selbst die Team-Chef-Rolle.' },
    inFocus: { name: 'Im Fokus', icon: '🔦', category: 'held', desc: 'Zwinge ein Team-Mitglied, offen zu spielen.' },
    takeResponsibility: { name: 'Verantwortung übernehmen', icon: '✋', category: 'held', desc: 'Stiehl einem Spieler eine ungenutzte Plottkarte.' },
  };

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  function $(id) { return document.getElementById(id); }
  function show(el) { el.classList.remove('hidden'); }
  function hide(el) { el.classList.add('hidden'); }

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach((s) => hide(s));
    show($(id));
  }

  let toastTimer = null;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    show(el);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => hide(el), 3200);
  }

  function saveSession() {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }
  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
    session = null;
    myRole = null;
  }
  function loadSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function myId() { return session ? session.playerId : null; }

  function el(tag, opts, children) {
    const e = document.createElement(tag);
    if (opts) {
      Object.entries(opts).forEach(([k, v]) => {
        if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = v;
        else if (k === 'html') e.innerHTML = v;
        else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
        else e.setAttribute(k, v);
      });
    }
    (children || []).forEach((c) => e.appendChild(c));
    return e;
  }

  // ---------------------------------------------------------------------
  // Start screen
  // ---------------------------------------------------------------------

  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-panel').forEach((p) => hide(p));
      show($('tab-' + btn.dataset.tab));
    });
  });

  $('btn-create').addEventListener('click', () => {
    const name = $('create-name').value.trim();
    if (!name) return toast('Bitte gib deinen Namen ein.');
    socket.emit('createRoom', { name }, (res) => {
      if (!res.ok) return toast(res.error || 'Fehler beim Erstellen.');
      session = { code: res.code, playerId: res.playerId, token: res.token, name };
      saveSession();
    });
  });

  $('btn-join').addEventListener('click', () => {
    const name = $('join-name').value.trim();
    const code = $('join-code').value.trim().toUpperCase();
    if (!name) return toast('Bitte gib deinen Namen ein.');
    if (!code) return toast('Bitte gib den Raum-Code ein.');
    socket.emit('joinRoom', { code, name }, (res) => {
      if (!res.ok) return toast(res.error || 'Beitritt fehlgeschlagen.');
      session = { code: res.code, playerId: res.playerId, token: res.token, name };
      saveSession();
    });
  });

  $('btn-leave-lobby').addEventListener('click', () => {
    socket.emit('leaveRoom');
    clearSession();
    showScreen('screen-home');
  });

  $('btn-add-bot').addEventListener('click', () => socket.emit('addBot'));
  $('btn-fill-bots').addEventListener('click', () => socket.emit('fillWithBots'));

  $('plot-toggle-checkbox').addEventListener('change', (e) => {
    if (!latestState || latestState.hostId !== myId()) { e.target.checked = latestState ? !!latestState.plotCardsEnabled : e.target.checked; return; }
    socket.emit('setPlotCardsEnabled', { enabled: e.target.checked });
  });

  $('commander-toggle-checkbox').addEventListener('change', (e) => {
    if (!latestState || latestState.hostId !== myId()) { e.target.checked = latestState ? !!latestState.commanderEnabled : e.target.checked; return; }
    socket.emit('setCommanderEnabled', { enabled: e.target.checked });
  });

  $('btn-start').addEventListener('click', () => {
    socket.emit('startGame');
  });

  $('btn-role-ready').addEventListener('click', () => {
    readyClicked = true;
    socket.emit('ready');
    renderRoleScreen();
  });

  $('btn-show-role').addEventListener('click', () => openRoleModal());
  $('btn-close-role-modal').addEventListener('click', () => hide($('role-modal')));
  $('btn-close-plot-modal').addEventListener('click', () => hide($('plot-info-modal')));

  $('btn-leave-game').addEventListener('click', () => {
    socket.emit('leaveRoom');
    clearSession();
    latestState = null;
    myRole = null;
    prevPhase = null;
    showScreen('screen-home');
  });

  // ---------------------------------------------------------------------
  // Socket events
  // ---------------------------------------------------------------------

  socket.on('connect', () => {
    const saved = loadSession();
    if (saved && saved.code && saved.token) {
      session = saved;
      socket.emit('joinRoom', { code: saved.code, name: saved.name, token: saved.token }, (res) => {
        if (!res.ok) {
          clearSession();
          showScreen('screen-home');
        } else {
          session.playerId = res.playerId;
          session.token = res.token;
          saveSession();
        }
      });
    }
  });

  socket.on('yourRole', (data) => {
    myRole = data;
    if (latestState && latestState.phase === 'roles') renderRoleScreen();
  });

  socket.on('gameState', (state) => {
    latestState = state;
    render(state);
  });

  socket.on('voteResult', (data) => {
    renderVoteReveal(data);
  });

  socket.on('missionResult', (data) => {
    renderMissionReveal(data);
  });

  socket.on('plotHand', (hand) => {
    myPlotHand = hand || [];
    if (latestState) renderPlotHandPanel(latestState);
  });

  socket.on('plotAssigned', (data) => {
    toast(`${data.icon} ${data.cardName} → ${data.targetName}`);
  });

  socket.on('plotInfo', (data) => {
    $('plot-info-title').textContent = data.title || 'Plottkarte';
    $('plot-info-text').textContent = data.text || '';
    show($('plot-info-modal'));
  });

  // ---------------------------------------------------------------------
  // Main render dispatcher
  // ---------------------------------------------------------------------

  function render(state) {
    if (state.phase === 'roles' && prevPhase !== 'roles') {
      readyClicked = false;
    }
    if (state.phase === 'commanderGuess' && prevPhase !== 'commanderGuess') {
      commanderGuessSubmitted = false;
    }
    if (state.phase !== prevPhase) {
      // Phase changed: clear transient per-round flags handled elsewhere via round ids
    }
    prevPhase = state.phase;

    if (state.phase === 'lobby') {
      showScreen('screen-lobby');
      renderLobby(state);
      return;
    }
    if (state.phase === 'roles') {
      showScreen('screen-role');
      renderRoleScreen();
      return;
    }
    showScreen('screen-game');
    renderGame(state);
  }

  // ---------------------------------------------------------------------
  // Lobby
  // ---------------------------------------------------------------------

  function renderLobby(state) {
    $('lobby-code').textContent = state.code;
    $('lobby-count').textContent = state.players.length;

    const isHost = state.hostId === myId();

    const list = $('lobby-players');
    list.innerHTML = '';
    state.players.forEach((p) => {
      const tags = [];
      if (p.isBot) tags.push(el('span', { class: 'tag bot', text: 'Bot' }));
      if (p.isHost) tags.push(el('span', { class: 'tag host', text: 'Host' }));
      if (p.id === myId()) tags.push(el('span', { class: 'tag', text: 'Ich' }));
      if (!p.isBot && !p.connected) tags.push(el('span', { class: 'tag', text: 'offline' }));
      if (p.isBot && isHost) {
        const removeBtn = el('button', { class: 'remove-bot-btn', text: '✕', title: 'Bot entfernen' });
        removeBtn.addEventListener('click', () => socket.emit('kickPlayer', { playerId: p.id }));
        tags.push(removeBtn);
      }
      const li = el('li', { class: (!p.isBot && !p.connected) ? 'disconnected' : '' }, [
        el('span', { class: 'player-name', text: (p.isBot ? '🤖 ' : '') + p.name }),
        el('span', {}, tags),
      ]);
      list.appendChild(li);
    });

    const n = state.players.length;
    const statusEl = $('lobby-status');
    const startBtn = $('btn-start');
    const botControls = $('lobby-bot-controls');
    const fillBtn = $('btn-fill-bots');
    const addBotBtn = $('btn-add-bot');

    if (isHost) {
      show(botControls);
      addBotBtn.disabled = n >= state.maxPlayers;
      if (n < state.minPlayers) show(fillBtn); else hide(fillBtn);
    } else {
      hide(botControls);
    }

    if (n < state.minPlayers) {
      statusEl.textContent = `Mindestens ${state.minPlayers} Spieler nötig (aktuell ${n}). Teile den Raum-Code mit deinen Freunden.`;
    } else {
      statusEl.textContent = isHost
        ? `Bereit! Zwischen ${state.minPlayers} und ${state.maxPlayers} Spieler sind da.`
        : 'Warte, bis der Host das Spiel startet …';
    }

    if (isHost) {
      show(startBtn);
      startBtn.disabled = n < state.minPlayers || n > state.maxPlayers;
    } else {
      hide(startBtn);
    }

    const toggleRow = $('plot-toggle-row');
    const toggleCheckbox = $('plot-toggle-checkbox');
    const toggleNote = $('plot-toggle-note');
    toggleCheckbox.checked = !!state.plotCardsEnabled;
    if (isHost) {
      toggleCheckbox.disabled = false;
      toggleRow.classList.remove('disabled');
      hide(toggleNote);
    } else {
      toggleCheckbox.disabled = true;
      toggleRow.classList.add('disabled');
      toggleNote.textContent = state.plotCardsEnabled
        ? 'Plottkarten-Variante ist aktiv (vom Host festgelegt).'
        : 'Plottkarten-Variante ist deaktiviert (vom Host festgelegt).';
      show(toggleNote);
    }

    const cmdToggleRow = $('commander-toggle-row');
    const cmdToggleCheckbox = $('commander-toggle-checkbox');
    const cmdToggleNote = $('commander-toggle-note');
    cmdToggleCheckbox.checked = !!state.commanderEnabled;
    if (isHost) {
      cmdToggleCheckbox.disabled = false;
      cmdToggleRow.classList.remove('disabled');
      hide(cmdToggleNote);
    } else {
      cmdToggleCheckbox.disabled = true;
      cmdToggleRow.classList.add('disabled');
      cmdToggleNote.textContent = state.commanderEnabled
        ? 'Kommandant-Variante ist aktiv (vom Host festgelegt).'
        : 'Kommandant-Variante ist deaktiviert (vom Host festgelegt).';
      show(cmdToggleNote);
    }

    const cardList = $('plot-card-list');
    if (!state.plotCardsEnabled) {
      hide(cardList);
    } else {
      show(cardList);
      cardList.classList.toggle('disabled', !isHost);
      cardList.innerHTML = '';
      const config = state.plotCardConfig || {};
      Object.keys(PLOT_CARD_CATALOG).forEach((cardId) => {
        const info = PLOT_CARD_CATALOG[cardId];
        const enabled = config[cardId] !== false;
        const checkbox = el('input', { type: 'checkbox' });
        checkbox.checked = enabled;
        checkbox.disabled = !isHost;
        checkbox.addEventListener('change', () => {
          socket.emit('setPlotCardConfig', { cardId, enabled: checkbox.checked });
        });
        const label = el('label', {}, [
          checkbox,
          el('span', { class: 'plot-card-list-name', text: `${info.icon} ${info.name}` }),
        ]);
        cardList.appendChild(el('li', {}, [label]));
      });
    }
  }

  // ---------------------------------------------------------------------
  // Role reveal screen + modal
  // ---------------------------------------------------------------------

  function fillRoleInto(prefix) {
    const badge = $(prefix + 'role-badge');
    const title = $(prefix + 'role-title');
    const desc = $(prefix + 'role-desc');
    const spiesBox = $(prefix + 'role-spies');
    const spiesList = $(prefix + 'role-spies-list');
    const spiesLabel = $(prefix + 'role-spies-label');

    if (!myRole) {
      badge.textContent = '?';
      badge.className = 'role-badge';
      title.textContent = 'Rolle wird geladen …';
      desc.textContent = '';
      hide(spiesBox);
      return;
    }

    if (myRole.role === 'spy') {
      badge.textContent = '🕶️';
      badge.className = 'role-badge spy';
      title.textContent = 'Du bist ein SPION 🕵🏿';
      desc.textContent = 'Dein Ziel: Verhindere unbemerkt, dass der Widerstand drei Missionen erfüllt.';
      if (spiesLabel) spiesLabel.textContent = 'Diese Spieler sind ebenfalls Spione:';
      spiesList.innerHTML = '';
      if (myRole.spies && myRole.spies.length) {
        myRole.spies.forEach((name) => spiesList.appendChild(el('li', { text: name })));
      } else {
        spiesList.appendChild(el('li', { text: '(keine weiteren Spione)' }));
      }
      show(spiesBox);
    } else if (myRole.isCommander) {
      badge.textContent = '🧭';
      badge.className = 'role-badge commander';
      title.textContent = 'Du bist im WIDERSTAND ✊🏻 – und der KOMMANDANT';
      desc.textContent = 'Dein Ziel: Bringe drei Missionen zum Erfolg. Du kennst die Spione – verrate dich nur nicht! Gewinnt der Widerstand, versuchen die Spione als letzten Trumpf noch, dich zu enttarnen.';
      if (spiesLabel) spiesLabel.textContent = 'Diese Spieler sind Spione:';
      spiesList.innerHTML = '';
      if (myRole.spies && myRole.spies.length) {
        myRole.spies.forEach((name) => spiesList.appendChild(el('li', { text: name })));
      } else {
        spiesList.appendChild(el('li', { text: '(keine Spione?)' }));
      }
      show(spiesBox);
    } else {
      badge.textContent = '🛡️';
      badge.className = 'role-badge resistance';
      title.textContent = 'Du bist im WIDERSTAND ✊🏻';
      desc.textContent = 'Dein Ziel: Finde heraus, wem du vertrauen kannst, und bringe drei Missionen zum Erfolg.';
      hide(spiesBox);
    }
  }

  function renderRoleScreen() {
    fillRoleInto('');
    if (readyClicked) {
      hide($('btn-role-ready'));
      show($('role-waiting'));
      const total = latestState ? latestState.players.length : 0;
      const ready = latestState ? latestState.readyCount : 0;
      $('role-waiting').textContent = `Warte auf die anderen Spieler … (${ready}/${total} bereit)`;
    } else {
      show($('btn-role-ready'));
      hide($('role-waiting'));
    }
  }

  function openRoleModal() {
    fillRoleInto('modal-');
    show($('role-modal'));
  }

  // ---------------------------------------------------------------------
  // Game screen
  // ---------------------------------------------------------------------

  function playerName(state, id) {
    const p = state.players.find((pp) => pp.id === id);
    return p ? p.name : '?';
  }

  // Zeigt eine Liste von Spielernamen als eigene, deutlich größere Felder
  // (statt als ein Fließtext-Satz) - z. B. für Team-Vorschlag/Abstimmung.
  function teamNameChips(state, ids) {
    const row = el('div', { class: 'team-name-chips' });
    ids.forEach((id) => {
      row.appendChild(el('div', { class: 'team-name-chip', text: playerName(state, id) }));
    });
    return row;
  }

  function renderGame(state) {
    $('game-code').textContent = state.code;

    // Mission track
    const track = $('mission-track');
    track.innerHTML = '';
    for (let i = 0; i < state.missionSizes.length; i++) {
      const result = state.missionResults[i];
      const classes = ['mission-dot'];
      if (result === 'success') classes.push('success');
      else if (result === 'fail') classes.push('fail');
      else if (i + 1 === state.missionNumber && state.phase !== 'gameover') classes.push('current');
      const dot = el('div', { class: classes.join(' ') });
      dot.textContent = result === 'success' ? '✓' : result === 'fail' ? '✗' : state.missionSizes[i];
      if (state.requiredFails[i] === 2) {
        dot.appendChild(el('span', { class: 'req2', text: '2 Fehlschläge nötig' }));
      }
      track.appendChild(dot);
    }

    // Reject track
    const rt = $('reject-track');
    rt.innerHTML = '';
    for (let i = 0; i < 5; i++) {
      rt.appendChild(el('div', { class: 'reject-dot' + (i < state.rejectCount ? ' filled' : '') }));
    }

    // Player list
    const list = $('game-players');
    list.innerHTML = '';
    state.players.forEach((p) => {
      const classes = [];
      if (p.id === myId()) classes.push('me');
      if (p.id === state.leaderId) classes.push('leader');
      if (!p.connected) classes.push('disconnected');
      const isLeaderMe = state.leaderId === myId();
      const canSelect = state.phase === 'team' && isLeaderMe;
      if (canSelect) classes.push('selectable');
      if (selectedTeam.has(p.id)) classes.push('selected');
      if (state.teamProposal && state.teamProposal.includes(p.id) && state.phase !== 'team') classes.push('selected');

      const tags = [];
      if (p.isHost) tags.push(el('span', { class: 'tag host', text: 'Host' }));
      if (p.id === state.leaderId) {
        const isForced = state.plotForcedLeaderId === p.id;
        tags.push(el('span', { class: 'tag ' + (isForced ? 'forced-leader' : 'leader'), text: isForced ? 'Team-Chef (Führungsstärke)' : 'Team-Chef' }));
      }
      if (state.plotPermanentTags && state.plotPermanentTags[p.id] && state.plotPermanentTags[p.id].includes('opinionLeader')) {
        tags.push(el('span', { class: 'tag permanent', text: '📣 stimmt zuerst ab' }));
      }
      if (state.plotFaceUpTarget === p.id && state.phase === 'mission') {
        tags.push(el('span', { class: 'tag permanent', text: '🔦 spielt offen' }));
      }
      if (state.phase === 'voting' && state.revealedVotes && state.revealedVotes[p.id] !== undefined) {
        const approved = state.revealedVotes[p.id];
        tags.push(el('span', { class: 'tag ' + (approved ? 'voted' : 'reject-tag'), text: `📣 ${approved ? 'Dafür' : 'Dagegen'}` }));
      } else if (state.phase === 'voting' && state.votesSubmitted.includes(p.id)) {
        tags.push(el('span', { class: 'tag voted', text: 'abgestimmt' }));
      }
      if (state.phase === 'mission' && state.teamProposal.includes(p.id) && state.missionCardsSubmitted.includes(p.id)) tags.push(el('span', { class: 'tag played', text: 'gespielt' }));

      const li = el('li', { class: classes.join(' ') }, [
        el('span', { class: 'player-name', text: p.name }),
        el('span', {}, tags),
      ]);
      if (canSelect) {
        li.addEventListener('click', () => toggleSelect(p.id, state));
      }
      list.appendChild(li);
    });

    renderPhaseContent(state);
    renderPlotHandPanel(state);
  }

  // ---------------------------------------------------------------------
  // Plottkarten (Held-Karten-Panel + Einsatz-Logik)
  // ---------------------------------------------------------------------

  function otherConnectedPlayers(state, excludeId) {
    return state.players.filter((p) => p.connected && p.id !== excludeId);
  }

  function playerSelect(players) {
    const select = el('select', { class: 'themed-select' });
    players.forEach((p) => select.appendChild(el('option', { value: p.id, text: p.name })));
    return select;
  }

  function renderPlotHandBadge() {
    const badge = $('plot-hand-badge');
    if (!myPlotHand.length) { hide(badge); return; }
    badge.textContent = myPlotHand.length === 1 ? '🃏 1 Plottkarte' : `🃏 ${myPlotHand.length} Plottkarten`;
    show(badge);
  }

  function renderPlotHandPanel(state) {
    renderPlotHandBadge();
    const panel = $('plot-hand-bar');
    const list = $('plot-hand-list');
    if (!myPlotHand.length) {
      hide(panel);
      $('screen-game').classList.remove('has-plot-hand');
      return;
    }
    show(panel);
    $('screen-game').classList.add('has-plot-hand');
    list.innerHTML = '';

    myPlotHand.forEach((cardId) => {
      const info = PLOT_CARD_CATALOG[cardId] || { name: cardId, icon: '🃏', desc: '' };
      const box = el('div', { class: 'plot-card' });
      box.appendChild(el('div', { class: 'plot-card-name', text: `${info.icon} ${info.name}` }));
      box.appendChild(el('div', { class: 'plot-card-desc', text: info.desc }));

      const usableNote = (msg) => box.appendChild(el('div', { class: 'muted-note', text: msg }));

      if (cardId === 'distrust') {
        const canUse = state.phase === 'voting';
        const btn = el('button', { class: 'btn secondary', text: 'Jetzt einsetzen' });
        btn.disabled = !canUse;
        btn.addEventListener('click', () => socket.emit('usePlotCard', { cardId }));
        box.appendChild(btn);
        if (!canUse) usableNote('Einsetzbar, sobald ein Team angenommen wurde.');
      } else if (cardId === 'leadership') {
        const canUse = state.phase === 'team' && (!state.teamProposal || state.teamProposal.length === 0);
        const btn = el('button', { class: 'btn secondary', text: 'Team-Chef werden' });
        btn.disabled = !canUse;
        btn.addEventListener('click', () => socket.emit('usePlotCard', { cardId }));
        box.appendChild(btn);
        if (!canUse) usableNote('Nur zu Beginn einer Runde einsetzbar, bevor ein Team vorgeschlagen wurde.');
      } else if (cardId === 'inFocus') {
        const canUse = state.phase === 'mission' && state.missionCardsSubmitted.length === 0 && state.teamProposal.length > 0;
        if (canUse) {
          const candidates = state.teamProposal.map((id) => state.players.find((p) => p.id === id)).filter(Boolean);
          const select = playerSelect(candidates);
          box.appendChild(select);
          const btn = el('button', { class: 'btn secondary', text: 'Offen spielen lassen' });
          btn.addEventListener('click', () => socket.emit('usePlotCard', { cardId, targetPlayerId: select.value }));
          box.appendChild(btn);
        } else {
          const btn = el('button', { class: 'btn secondary', text: 'Offen spielen lassen' });
          btn.disabled = true;
          box.appendChild(btn);
          usableNote('Nur zu Beginn einer Mission einsetzbar, bevor Karten gespielt wurden.');
        }
      } else if (cardId === 'surveillance') {
        const candidates = (state.lastMissionTeam || []).length
          ? state.players.filter((p) => (state.lastMissionTeam || []).includes(p.id))
          : [];
        const canUse = candidates.length > 0;
        if (canUse) {
          const select = playerSelect(candidates);
          box.appendChild(select);
          const btn = el('button', { class: 'btn secondary', text: 'Karte einsehen' });
          btn.addEventListener('click', () => socket.emit('usePlotCard', { cardId, targetPlayerId: select.value }));
          box.appendChild(btn);
        } else {
          const btn = el('button', { class: 'btn secondary', text: 'Karte einsehen' });
          btn.disabled = true;
          box.appendChild(btn);
          usableNote('Einsetzbar, sobald eine Mission durchgeführt wurde.');
        }
      } else if (cardId === 'takeResponsibility') {
        const candidates = otherConnectedPlayers(state, myId());
        const select = playerSelect(candidates);
        box.appendChild(select);
        const btn = el('button', { class: 'btn secondary', text: 'Karte stehlen' });
        btn.addEventListener('click', () => socket.emit('usePlotCard', { cardId, targetPlayerId: select.value }));
        box.appendChild(btn);
        usableNote('Klappt nur, wenn diese Person selbst noch eine Plottkarte hält.');
      }

      list.appendChild(box);
    });
  }

  function toggleSelect(id, state) {
    const size = state.missionSizes[state.missionNumber - 1];
    if (selectedTeam.has(id)) {
      selectedTeam.delete(id);
    } else {
      if (selectedTeam.size >= size) return;
      selectedTeam.add(id);
    }
    renderGame(state);
  }

  function renderPhaseContent(state) {
    const titleEl = $('phase-title');
    const content = $('phase-content');
    content.innerHTML = '';

    if (state.phase === 'plotcards') {
      titleEl.textContent = `Mission ${state.missionNumber} – Plottkarten werden verteilt`;
      const plot = state.plot || { pending: [], resolveQueue: [] };
      const leaderName = playerName(state, plot.distributingLeaderId);

      if (plot.pending.length) {
        content.appendChild(el('p', { text: `${leaderName} verteilt noch ${plot.pending.length} Plottkarte(n):` }));
        const preview = el('div', { class: 'plot-deck-preview' });
        plot.pending.forEach((c) => preview.appendChild(el('span', { class: 'plot-deck-chip', text: `${c.icon} ${c.name}` })));
        content.appendChild(preview);

        if (plot.distributingLeaderId === myId()) {
          const card = plot.pending[0];
          const box = el('div', { class: 'plot-assign-box' });
          box.appendChild(el('div', { class: 'plot-card-name', text: `${card.icon} ${card.name}` }));
          box.appendChild(el('div', { class: 'plot-card-desc', text: card.desc }));
          const candidates = otherConnectedPlayers(state, myId());
          const select = playerSelect(candidates);
          box.appendChild(select);
          const btn = el('button', { class: 'btn primary', text: 'An diesen Spieler austeilen' });
          btn.addEventListener('click', () => socket.emit('assignPlotCard', { cardId: card.id, targetPlayerId: select.value }));
          box.appendChild(btn);
          content.appendChild(box);
        } else {
          content.appendChild(el('p', { class: 'muted-note', text: `Warte, während ${leaderName} die Karten verteilt …` }));
        }
      }

      const myResolve = plot.resolveQueue.find((r) => r.actorId === myId());
      if (myResolve) {
        const card = myResolve.card;
        const box = el('div', { class: 'plot-assign-box' });
        box.appendChild(el('div', { class: 'plot-card-name', text: `${card.icon} ${card.name}` }));
        box.appendChild(el('div', { class: 'plot-card-desc', text: card.desc }));
        box.appendChild(el('p', { text: 'Wähle einen Spieler:' }));
        const candidates = otherConnectedPlayers(state, myId());
        const select = playerSelect(candidates);
        box.appendChild(select);
        const btn = el('button', { class: 'btn primary', text: 'Bestätigen' });
        btn.addEventListener('click', () => socket.emit('resolvePlotTarget', { targetPlayerId: select.value }));
        box.appendChild(btn);
        content.appendChild(box);
      } else if (plot.resolveQueue.length && !plot.pending.length) {
        const names = plot.resolveQueue.map((r) => r.actorName).join(', ');
        content.appendChild(el('p', { class: 'muted-note', text: `Warte auf: ${names} …` }));
      }
      return;
    }

    if (state.phase === 'team') {
      const size = state.missionSizes[state.missionNumber - 1];
      titleEl.textContent = `Mission ${state.missionNumber} – Team wählen (${size} Spieler nötig)`;
      const isLeaderMe = state.leaderId === myId();
      if (isLeaderMe) {
        content.appendChild(el('p', { text: `Wähle ${size} Spieler in der Liste links aus.` }));
        content.appendChild(el('p', { class: 'muted-note', text: `Ausgewählt: ${selectedTeam.size}/${size}` }));
        const btn = el('button', { class: 'btn primary', text: 'Team vorschlagen' });
        btn.disabled = selectedTeam.size !== size;
        btn.addEventListener('click', () => {
          socket.emit('proposeTeam', { memberIds: Array.from(selectedTeam) });
          selectedTeam = new Set();
        });
        content.appendChild(btn);
      } else {
        content.appendChild(el('p', { text: `${playerName(state, state.leaderId)} wählt gerade ein Team aus …` }));
      }
      if (state.rejectCount > 0) {
        content.appendChild(el('p', { class: 'muted-note', text: `Achtung: ${state.rejectCount}/5 Team-Vorschläge in Folge abgelehnt. Bei 5 gewinnen die Spione automatisch.` }));
      }
      return;
    }

    if (state.phase === 'voting') {
      titleEl.textContent = `Abstimmung über das Team von ${playerName(state, state.leaderId)}`;
      content.appendChild(el('div', { class: 'team-proposal-block' }, [
        el('p', { class: 'section-label', text: 'Vorgeschlagenes Team:' }),
        teamNameChips(state, state.teamProposal),
      ]));

      const alreadyVoted = state.votesSubmitted.includes(myId()) || votedRound === state.voteRound;
      const opinionLeaderIds = state.players
        .filter((p) => p.connected && state.plotPermanentTags && (state.plotPermanentTags[p.id] || []).includes('opinionLeader'))
        .map((p) => p.id);
      const iAmOpinionLeader = opinionLeaderIds.includes(myId());
      const leadersStillToVote = opinionLeaderIds.filter((id) => !state.votesSubmitted.includes(id));
      const mustWaitForLeaders = !iAmOpinionLeader && leadersStillToVote.length > 0;

      if (alreadyVoted) {
        content.appendChild(el('p', { class: 'muted-note', text: `Du hast abgestimmt. Warte auf die anderen (${state.votesSubmitted.length}/${state.players.length}).` }));
      } else if (mustWaitForLeaders) {
        const names = leadersStillToVote.map((id) => playerName(state, id)).join(', ');
        content.appendChild(el('p', { class: 'muted-note', text: `📣 ${names} ${leadersStillToVote.length === 1 ? 'muss' : 'müssen'} als Meinungsmacher zuerst abstimmen. Danach kannst du abstimmen.` }));
      } else {
        const row = el('div', { class: 'card-choice' });
        const yes = el('button', { class: 'btn approve', text: '✅ Dafür' });
        const no = el('button', { class: 'btn reject', text: '❌ Dagegen' });
        yes.addEventListener('click', () => { votedRound = state.voteRound; socket.emit('vote', { approve: true }); renderPhaseContent(state); });
        no.addEventListener('click', () => { votedRound = state.voteRound; socket.emit('vote', { approve: false }); renderPhaseContent(state); });
        row.appendChild(yes);
        row.appendChild(no);
        content.appendChild(row);
        if (iAmOpinionLeader) {
          content.appendChild(el('p', { class: 'muted-note', text: '📣 Du bist Meinungsmacher: Deine Stimme wird sofort für alle sichtbar.' }));
        }
      }
      content.appendChild(el('div', { id: 'vote-reveal-area' }));
      return;
    }

    if (state.phase === 'mission') {
      titleEl.textContent = `Mission ${state.missionNumber} läuft`;
      content.appendChild(el('p', { class: 'section-label', text: 'Team im Einsatz:' }));
      content.appendChild(teamNameChips(state, state.teamProposal));

      const onTeam = state.teamProposal.includes(myId());
      const alreadyPlayed = state.missionCardsSubmitted.includes(myId()) || playedRound === state.missionRound;

      if (onTeam && !alreadyPlayed) {
        content.appendChild(el('p', { text: 'Wähle verdeckt deine Karte:' }));
        const row = el('div', { class: 'card-choice' });
        const successBtn = el('button', { class: 'btn success-card', text: '✅ Erfolg' });
        successBtn.addEventListener('click', () => { playedRound = state.missionRound; socket.emit('playCard', { card: 'success' }); renderPhaseContent(state); });
        row.appendChild(successBtn);
        if (myRole && myRole.role === 'spy') {
          const failBtn = el('button', { class: 'btn fail-card', text: '❌ Fehlschlag' });
          failBtn.addEventListener('click', () => { playedRound = state.missionRound; socket.emit('playCard', { card: 'fail' }); renderPhaseContent(state); });
          row.appendChild(failBtn);
        }
        content.appendChild(row);
      } else if (onTeam && alreadyPlayed) {
        content.appendChild(el('p', { class: 'muted-note', text: `Karte gespielt. Warte auf die anderen (${state.missionCardsSubmitted.length}/${state.teamProposal.length}).` }));
      } else {
        content.appendChild(el('p', { class: 'muted-note', text: 'Das Team führt die Mission verdeckt durch. Warte auf das Ergebnis …' }));
      }
      return;
    }

    if (state.phase === 'commanderGuess') {
      titleEl.textContent = 'Der Widerstand hat drei Missionen erfüllt!';
      content.appendChild(el('p', {
        text: 'Doch die Spione bekommen jetzt noch einen letzten Trumpf: Gelingt es ihnen, den Kommandanten zu enttarnen, gewinnen sie doch noch.',
      }));

      const amSpy = myRole && myRole.role === 'spy';
      if (amSpy) {
        if (commanderGuessSubmitted) {
          content.appendChild(el('p', { class: 'muted-note', text: 'Dein Tipp wurde abgeschickt. Warte auf das Ergebnis …' }));
        } else {
          content.appendChild(el('p', { text: 'Wer ist der Kommandant? Sprecht euch ab und wählt gemeinsam eine Person:' }));
          const row = el('div', { class: 'card-choice' });
          state.players.filter((p) => p.id !== myId()).forEach((p) => {
            const btn = el('button', { class: 'btn secondary', text: p.name });
            btn.addEventListener('click', () => {
              commanderGuessSubmitted = true;
              socket.emit('guessCommander', { targetId: p.id });
              renderPhaseContent(state);
            });
            row.appendChild(btn);
          });
          content.appendChild(row);
        }
      } else {
        content.appendChild(el('p', { class: 'muted-note', text: 'Die Spione überlegen gerade, wer der Kommandant sein könnte …' }));
      }
      return;
    }

    if (state.phase === 'gameover') {
      const won = state.winner === 'resistance';
      titleEl.textContent = 'Spiel vorbei';
      content.appendChild(el('div', {
        class: 'winner-banner ' + (won ? 'resistance' : 'spies'),
        text: won ? '🛡️ Der Widerstand gewinnt!' : '🕶️ Die Spione gewinnen!',
      }));

      if (state.commanderReveal) {
        const cr = state.commanderReveal;
        const commanderName = playerName(state, cr.commanderId);
        let text;
        if (cr.guessedById) {
          const guesserName = playerName(state, cr.guessedById);
          const guessedName = playerName(state, cr.guessedId);
          text = cr.guessedId === cr.commanderId
            ? `🧭 ${guesserName} (Spion) enttarnt ${guessedName} als Kommandant! Die Spione gewinnen doch noch.`
            : `🧭 ${guesserName} (Spion) tippt auf ${guessedName} – das war falsch! Der Kommandant war ${commanderName}.`;
        } else {
          text = `🧭 Der Kommandant war ${commanderName}. Die Spione kamen nicht mehr dazu, einen Tipp abzugeben.`;
        }
        content.appendChild(el('p', { class: 'muted-note', text }));
      }

      const list = el('ul', { class: 'reveal-list' });
      (state.revealedRoles || []).forEach((r) => {
        const right = el('span', {}, [
          el('span', { class: 'role-pill ' + r.role, text: r.role === 'spy' ? '🕵🏿 Spion' : '✊🏻 Widerstand' }),
        ]);
        if (r.isCommander) right.appendChild(el('span', { class: 'role-pill commander', text: '🧭 Kommandant' }));
        list.appendChild(el('li', {}, [
          el('span', { text: r.name }),
          right,
        ]));
      });
      content.appendChild(list);

      if (state.hostId === myId()) {
        const btn = el('button', { class: 'btn primary', text: 'Neues Spiel (zurück zur Lobby)' });
        btn.addEventListener('click', () => socket.emit('resetGame'));
        content.appendChild(btn);
      } else {
        content.appendChild(el('p', { class: 'muted-note', text: 'Warte auf den Host für eine neue Runde.' }));
      }
    }
  }

  function renderVoteReveal(data) {
    const area = $('vote-reveal-area');
    if (!area) return;
    area.innerHTML = '';
    area.appendChild(el('p', { class: 'muted-note', text: data.approved ? 'Team angenommen!' : 'Team abgelehnt.' }));
    const state = latestState;
    Object.entries(data.votes).forEach(([id, approve]) => {
      area.appendChild(el('div', { class: 'vote-result-row' }, [
        el('span', { text: playerName(state, id) }),
        el('span', { class: approve ? 'vote-yes' : 'vote-no', text: approve ? 'Dafür' : 'Dagegen' }),
      ]));
    });
  }

  function shuffleArray(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  let missionRevealCloseTimer = null;

  function closeMissionRevealModal() {
    if (missionRevealCloseTimer) { clearTimeout(missionRevealCloseTimer); missionRevealCloseTimer = null; }
    hide($('mission-reveal-modal'));
  }

  // Das Overlay lässt sich absichtlich nicht wegklicken - es soll den vollen
  // dramatischen Moment abwarten und schließt sich nur automatisch (siehe
  // renderMissionReveal).

  function renderMissionReveal(data) {
    const modal = $('mission-reveal-modal');
    const cardsRow = $('mission-reveal-cards');
    const textEl = $('mission-reveal-text');
    if (!modal || !cardsRow || !textEl) return;

    if (missionRevealCloseTimer) { clearTimeout(missionRevealCloseTimer); missionRevealCloseTimer = null; }
    cardsRow.innerHTML = '';
    textEl.textContent = '';
    textEl.classList.remove('visible');

    const teamSize = data.teamSize || 0;
    const failCount = data.failCount || 0;
    const outcomes = shuffleArray(
      Array(failCount).fill('fail').concat(Array(Math.max(teamSize - failCount, 0)).fill('success'))
    );

    // Ganz bewusst sehr langsame, ruhige Aufdeck-Animation - das ist der
    // dramatische Moment des Spiels, darum darf er sich Zeit lassen. Die
    // Flip-Dauer entspricht der CSS-Transition (1.4s).
    const FIRST_DELAY = 900;
    const STAGGER = 750;
    const FLIP_DURATION = 1400;

    let lastCardStart = FIRST_DELAY;
    outcomes.forEach((outcome, i) => {
      const inner = el('div', { class: 'mission-card-inner' }, [
        el('div', { class: 'mission-card-face mission-card-back' }, [
          el('img', { src: 'cards/card-back.png', alt: 'Verdeckte Karte' }),
        ]),
        el('div', { class: 'mission-card-face mission-card-front ' + outcome }, [
          el('img', {
            src: outcome === 'fail' ? 'cards/card-fail.png' : 'cards/card-success.png',
            alt: outcome === 'fail' ? 'Fehlschlag' : 'Erfolg',
          }),
        ]),
      ]);
      const card = el('div', { class: 'mission-card' }, [inner]);
      cardsRow.appendChild(card);
      const delay = FIRST_DELAY + i * STAGGER;
      setTimeout(() => card.classList.add('flipped'), delay);
      lastCardStart = delay;
    });

    let text;
    if (data.result === 'success') {
      text = failCount > 0
        ? `✅ Mission erfolgreich! (${failCount} von ${data.needed} nötigen Sabotage-Karten)`
        : '✅ Mission erfolgreich! Niemand hat sabotiert.';
    } else {
      text = `❌ Mission gescheitert! ${failCount} ${failCount === 1 ? 'Person hat' : 'Personen haben'} sabotiert (${data.needed} nötig).`;
    }
    textEl.textContent = text;

    show(modal);

    const textDelay = lastCardStart + FLIP_DURATION + 300;
    setTimeout(() => textEl.classList.add('visible'), textDelay);

    // Schließt sich automatisch 3 Sekunden, nachdem die letzte Karte
    // aufgedeckt wurde - lässt sich nicht wegklicken (siehe oben).
    const revealCompleteDelay = lastCardStart + FLIP_DURATION;
    const autoCloseDelay = revealCompleteDelay + 3000;
    missionRevealCloseTimer = setTimeout(closeMissionRevealModal, autoCloseDelay);
  }

  // Initial screen while waiting for possible auto-reconnect
  showScreen('screen-home');
})();
