// Der Widerstand (The Resistance) - Online-Server
// Einfacher, selbst-gehosteter Mehrspieler-Server auf Basis von Express + Socket.IO.
// Kann lokal, im Heimnetz oder z.B. auf einem Raspberry Pi laufen.

const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// Spielregeln / Konstanten (siehe Regelwerk "Der Widerstand")
// ---------------------------------------------------------------------------

const ROLE_CONFIG = {
  5: { resistance: 3, spies: 2 },
  6: { resistance: 4, spies: 2 },
  7: { resistance: 4, spies: 3 },
  8: { resistance: 5, spies: 3 },
  9: { resistance: 6, spies: 3 },
  10: { resistance: 6, spies: 4 },
};

const MISSION_SIZES = {
  5: [2, 3, 2, 3, 3],
  6: [2, 3, 4, 3, 4],
  7: [2, 3, 3, 4, 4],
  8: [3, 4, 4, 5, 5],
  9: [3, 4, 4, 5, 5],
  10: [3, 4, 4, 5, 5],
};

function requiredFailsFor(playerCount, missionIndex) {
  // Sonderregel: ab 7 Spielern braucht die 4. Mission (Index 3) zwei Fehlschlag-Karten.
  if (playerCount >= 7 && missionIndex === 3) return 2;
  return 1;
}

// ---------------------------------------------------------------------------
// Plottkarten-Variante ("Die Spannung steigt") - immer aktiv.
// Adaptions-Hinweise (Regelwerk lässt einiges für Online-Spiel offen):
//  - Es gibt keine feste Sitzordnung; "Nachbar" bei Abhörmaßnahme wird daher
//    durch "ein Spieler deiner Wahl" ersetzt.
//  - Deck-Zusammensetzung (2x jede Karte = 18 Stück, Nachziehstapel wird bei
//    Bedarf aus dem Ablagestapel neu gemischt) ist eine eigene, ausbalancierte
//    Wahl, da das Original keine exakten Stückzahlen nennt.
//  - Karten werden offen verteilt (jeder sieht, wer was bekommt) und daher
//    auch offen im Verlauf protokolliert.
// ---------------------------------------------------------------------------

const PLOT_CARD_INFO = {
  wiretap: {
    id: 'wiretap', name: 'Abhörmaßnahme', icon: '🎧', category: 'immediate',
    desc: 'Du siehst sofort heimlich die Rolle eines Spielers deiner Wahl (du darfst darüber sprechen, aber die Karte nicht zeigen).',
  },
  opinionLeader: {
    id: 'opinionLeader', name: 'Meinungsmacher', icon: '📣', category: 'permanent',
    desc: 'Diese Person muss ab sofort bei jeder Abstimmung ihre Stimme immer als Erste offenlegen (dauerhaft bis Spielende).',
  },
  buildTrust: {
    id: 'buildTrust', name: 'Vertrauen bilden', icon: '🤝', category: 'immediate',
    desc: 'Der aktuelle Team-Chef muss seine/ihre Rolle sofort einem Spieler eigener Wahl offenbaren.',
  },
  revealSelf: {
    id: 'revealSelf', name: 'Sich offenbaren', icon: '🃏', category: 'immediate',
    desc: 'Du musst deine eigene Rolle sofort einem Spieler deiner Wahl zeigen.',
  },
  distrust: {
    id: 'distrust', name: 'Misstrauen', icon: '⚠️', category: 'held',
    desc: 'Einmalig einsetzbar: Kippt ein soeben angenommenes Team zurück in eine Ablehnung.',
  },
  surveillance: {
    id: 'surveillance', name: 'Überwachung', icon: '🔍', category: 'held',
    desc: 'Einmalig einsetzbar: Sieh dir heimlich an, welche Karte ein bestimmtes Team-Mitglied bei der letzten Mission gespielt hat.',
  },
  leadership: {
    id: 'leadership', name: 'Führungsstärke', icon: '👑', category: 'held',
    desc: 'Einmalig einsetzbar: Übernimm zu Beginn einer Runde (bevor ein Team vorgeschlagen wurde) selbst die Team-Chef-Rolle.',
  },
  inFocus: {
    id: 'inFocus', name: 'Im Fokus', icon: '🔦', category: 'held',
    desc: 'Einmalig einsetzbar: Zwinge ein Team-Mitglied, seine Missionskarte offen (für alle sichtbar) zu spielen.',
  },
  takeResponsibility: {
    id: 'takeResponsibility', name: 'Verantwortung übernehmen', icon: '✋', category: 'held',
    desc: 'Einmalig einsetzbar: Stiehl einem anderen Spieler eine seiner ungenutzten Plottkarten.',
  },
};
const PLOT_CARD_IDS = Object.keys(PLOT_CARD_INFO);
const PLOT_COPIES_PER_CARD = 2;

function plotCardsPerRound(playerCount) {
  if (playerCount <= 6) return 1;
  if (playerCount <= 8) return 2;
  return 3;
}

function defaultPlotCardConfig() {
  const config = {};
  PLOT_CARD_IDS.forEach((id) => { config[id] = true; });
  return config;
}

function buildPlotDeck(config) {
  const deck = [];
  PLOT_CARD_IDS.forEach((id) => {
    if (config && config[id] === false) return; // einzelne Karte in der Lobby deaktiviert
    for (let i = 0; i < PLOT_COPIES_PER_CARD; i++) deck.push(id);
  });
  return shuffle(deck);
}

function drawPlotCards(room, count) {
  const drawn = [];
  for (let i = 0; i < count; i++) {
    if (room.plotDeck.length === 0) {
      if (room.plotDiscard.length === 0) break;
      room.plotDeck = shuffle(room.plotDiscard);
      room.plotDiscard = [];
    }
    drawn.push(room.plotDeck.pop());
  }
  return drawn;
}

const MIN_PLAYERS = 5;
const MAX_PLAYERS = 10;
const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ohne verwechselbare Zeichen

function makeRoomCode() {
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) {
      code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
    }
  } while (rooms.has(code));
  return code;
}

function makeId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------------------------------------------------------------------
// Raumverwaltung
// ---------------------------------------------------------------------------

const rooms = new Map(); // code -> room
const ROOM_CLEANUP_MS = 3 * 60 * 60 * 1000; // Räume ohne Aktivität nach 3h entsorgen

function createRoom() {
  const code = makeRoomCode();
  const room = {
    code,
    hostId: null,
    players: [], // { id, token, name, socketId, connected }
    phase: 'lobby', // lobby | roles | plotcards | team | voting | mission | commanderGuess | gameover
    leaderIndex: 0,
    missionNumber: 1, // 1..5
    missionSizes: [],
    requiredFails: [],
    teamProposal: [],
    votes: {}, // playerId -> bool
    revealedVotes: {}, // playerId -> bool, nur für "Meinungsmacher" (öffentlich, sofort sichtbar)
    missionCards: {}, // playerId -> 'success'|'fail'
    missionResults: [], // 'success'|'fail' pro Mission
    rejectCount: 0,
    roles: {}, // playerId -> 'resistance'|'spy'
    ready: new Set(),
    voteHistory: [],
    winner: null,
    logs: [],
    voteRound: 0,
    missionRound: 0,
    lastActivity: Date.now(),
    cleanupTimer: null,
    // Plottkarten-Variante - in der Lobby vom Host aktivierbar/deaktivierbar
    plotCardsEnabled: true,
    plotCardConfig: defaultPlotCardConfig(), // cardId -> bool, in der Lobby einzeln umschaltbar
    plotDeck: [],
    plotDiscard: [],
    plotHands: {}, // playerId -> [cardId, ...] (ungenutzte, gehaltene Karten)
    plotPermanent: {}, // playerId -> { opinionLeader: true }
    plotAssign: null, // { pending:[cardId,...], resolveQueue:[{card,actorId,recipientId}] }
    plotForcedLeaderId: null,
    plotLeadershipLocked: false,
    plotFaceUpTarget: null,
    plotSurveillanceInspected: new Set(),
    lastMissionNumber: null,
    lastMissionTeam: [],
    lastMissionCards: null,
    voteApprovedPending: false,
    pendingTimeout: null,
    // "Kommandant"-Variante (Merlin-artig) - in der Lobby vom Host aktivierbar/deaktivierbar
    commanderEnabled: true,
    commanderId: null, // playerId eines Widerstandsmitglieds, das die Spione kennt
    commanderGuessedId: null,
    commanderGuessedBy: null,
  };
  rooms.set(code, room);
  touchRoom(room);
  return room;
}

function touchRoom(room) {
  room.lastActivity = Date.now();
  if (room.cleanupTimer) clearTimeout(room.cleanupTimer);
  room.cleanupTimer = setTimeout(() => {
    rooms.delete(room.code);
  }, ROOM_CLEANUP_MS);
}

function log(room, text) {
  room.logs.push({ text, at: Date.now() });
  if (room.logs.length > 200) room.logs.shift();
}

function publicPlayer(room, p) {
  return {
    id: p.id,
    name: p.name,
    connected: p.connected,
    isHost: p.id === room.hostId,
    isBot: p.isBot === true,
  };
}

function currentLeader(room) {
  if (!room.players.length) return null;
  return room.players[room.leaderIndex % room.players.length];
}

// Wie currentLeader(), berücksichtigt aber "Führungsstärke" (temporäre Übernahme
// der Team-Chef-Rolle für genau einen Vorschlag, ohne die normale Rotation zu ändern).
function activeLeader(room) {
  if (room.plotForcedLeaderId) {
    const p = findPlayer(room, room.plotForcedLeaderId);
    if (p) return p;
  }
  return currentLeader(room);
}

function publicState(room) {
  const leader = activeLeader(room);
  const permanentTags = {};
  Object.keys(room.plotPermanent).forEach((pid) => {
    const tags = Object.keys(room.plotPermanent[pid] || {});
    if (tags.length) permanentTags[pid] = tags;
  });
  return {
    code: room.code,
    phase: room.phase,
    players: room.players.map((p) => publicPlayer(room, p)),
    hostId: room.hostId,
    leaderId: leader ? leader.id : null,
    missionNumber: room.missionNumber,
    missionSizes: room.missionSizes,
    requiredFails: room.requiredFails,
    teamProposal: room.teamProposal,
    votesSubmitted: Object.keys(room.votes),
    revealedVotes: room.revealedVotes || {},
    missionCardsSubmitted: Object.keys(room.missionCards),
    missionResults: room.missionResults,
    rejectCount: room.rejectCount,
    winner: room.winner,
    plotCardsEnabled: room.plotCardsEnabled,
    plotCardConfig: room.plotCardConfig,
    commanderEnabled: room.commanderEnabled,
    readyCount: room.ready.size,
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    voteRound: room.voteRound,
    missionRound: room.missionRound,
    revealedRoles: room.phase === 'gameover'
      ? room.players.map((p) => ({ id: p.id, name: p.name, role: room.roles[p.id], isCommander: room.commanderId === p.id }))
      : null,
    commanderReveal: (room.phase === 'gameover' && room.commanderEnabled && room.commanderId)
      ? { commanderId: room.commanderId, guessedId: room.commanderGuessedId, guessedById: room.commanderGuessedBy }
      : null,
    plotPermanentTags: permanentTags,
    plotFaceUpTarget: room.plotFaceUpTarget,
    plotForcedLeaderId: room.plotForcedLeaderId,
    lastMissionTeam: room.lastMissionTeam || [],
    lastMissionNumber: room.lastMissionNumber,
    plot: room.phase === 'plotcards' && room.plotAssign ? {
      distributingLeaderId: currentLeader(room) ? currentLeader(room).id : null,
      pending: room.plotAssign.pending.map((id) => PLOT_CARD_INFO[id]),
      resolveQueue: room.plotAssign.resolveQueue.map((r) => ({
        card: PLOT_CARD_INFO[r.card],
        actorId: r.actorId,
        actorName: (findPlayer(room, r.actorId) || {}).name || '?',
      })),
    } : null,
  };
}

function broadcastState(room) {
  io.to(room.code).emit('gameState', publicState(room));
  room.players.forEach((p) => {
    if (p.socketId) io.to(p.socketId).emit('plotHand', room.plotHands[p.id] || []);
  });
  scheduleBotTurnIfNeeded(room);
}

function findPlayer(room, playerId) {
  return room.players.find((p) => p.id === playerId);
}

function sendRoleTo(room, player) {
  if (!player.socketId) return;
  const role = room.roles[player.id];
  if (!role) return;
  const isCommander = room.commanderId === player.id;
  let spies = [];
  if (role === 'spy') {
    spies = room.players
      .filter((p) => room.roles[p.id] === 'spy' && p.id !== player.id)
      .map((p) => p.name);
  } else if (isCommander) {
    spies = room.players
      .filter((p) => room.roles[p.id] === 'spy')
      .map((p) => p.name);
  }
  io.to(player.socketId).emit('yourRole', { role, spies, isCommander });
}

function advanceLeader(room) {
  room.leaderIndex = (room.leaderIndex + 1) % room.players.length;
}

// Startet eine neue Missionsrunde: zuerst werden Plottkarten verteilt
// ("zu Beginn jeder Runde"), danach geht es normal in die Team-Phase.
function startPlotCardsPhase(room) {
  room.teamProposal = [];
  room.votes = {};
  room.missionCards = {};
  room.plotFaceUpTarget = null;
  if (!room.plotCardsEnabled) {
    finishPlotCardsPhase(room);
    return;
  }
  const count = plotCardsPerRound(room.players.length);
  const drawn = drawPlotCards(room, count);
  if (drawn.length === 0) {
    finishPlotCardsPhase(room);
    return;
  }
  room.phase = 'plotcards';
  room.plotAssign = { pending: drawn, resolveQueue: [] };
  const leader = currentLeader(room);
  log(room, `Mission ${room.missionNumber}: ${drawn.length} Plottkarte(n) werden gezogen. ${leader ? leader.name : 'Der Team-Chef'} verteilt sie.`);
}

function finishPlotCardsPhase(room) {
  room.plotAssign = null;
  room.phase = 'team';
  log(room, `Mission ${room.missionNumber}: ${currentLeader(room).name} ist Team-Chef und wählt ein Team.`);
}

function assignPlotCardToPlayer(room, cardId, targetId) {
  const info = PLOT_CARD_INFO[cardId];
  const target = findPlayer(room, targetId);
  if (!info || !target) return;
  log(room, `${target.name} erhält die Plottkarte „${info.name}“.`);
  // Verteilung ist laut Regelwerk offen (alle sehen, wer was bekommt) - daher
  // ein kurzer, nicht gespeicherter Hinweis an alle (kein Verlauf/Historie).
  io.to(room.code).emit('plotAssigned', { icon: info.icon, cardName: info.name, targetName: target.name });
  if (info.category === 'held') {
    room.plotHands[targetId] = room.plotHands[targetId] || [];
    room.plotHands[targetId].push(cardId);
  } else if (info.category === 'permanent') {
    room.plotPermanent[targetId] = room.plotPermanent[targetId] || {};
    room.plotPermanent[targetId][cardId] = true;
    log(room, `${target.name} muss von nun an bei Abstimmungen die Stimme immer zuerst offenlegen.`);
  } else if (info.category === 'immediate') {
    const leader = currentLeader(room);
    const actorId = cardId === 'buildTrust' ? (leader ? leader.id : targetId) : targetId;
    room.plotAssign.resolveQueue.push({ card: cardId, actorId, recipientId: targetId });
  }
}

function handleAssignPlotCard(room, leaderId, cardId, targetId) {
  if (room.phase !== 'plotcards' || !room.plotAssign) return;
  const leader = currentLeader(room);
  if (!leader || leader.id !== leaderId) return;
  const idx = room.plotAssign.pending.indexOf(cardId);
  if (idx === -1) return;
  const target = findPlayer(room, targetId);
  if (!target || target.id === leaderId || !target.connected) return;
  room.plotAssign.pending.splice(idx, 1);
  assignPlotCardToPlayer(room, cardId, targetId);
  touchRoom(room);
  if (room.plotAssign.pending.length === 0 && room.plotAssign.resolveQueue.length === 0) {
    finishPlotCardsPhase(room);
  }
  broadcastState(room);
}

function handleResolvePlotTarget(room, actorId, targetId) {
  if (room.phase !== 'plotcards' || !room.plotAssign) return;
  const idx = room.plotAssign.resolveQueue.findIndex((r) => r.actorId === actorId);
  if (idx === -1) return;
  const entry = room.plotAssign.resolveQueue[idx];
  const actor = findPlayer(room, actorId);
  const target = findPlayer(room, targetId);
  if (!actor || !target || target.id === actorId) return;
  room.plotAssign.resolveQueue.splice(idx, 1);

  if (entry.card === 'wiretap') {
    const role = room.roles[target.id];
    if (actor.socketId) {
      io.to(actor.socketId).emit('plotInfo', {
        title: 'Abhörmaßnahme',
        text: `${target.name} ist: ${role === 'spy' ? 'Spion' : 'Widerstand'}.`,
      });
    }
    log(room, `${actor.name} nutzt die Abhörmaßnahme, um jemanden heimlich zu beobachten.`);
  } else if (entry.card === 'revealSelf') {
    const role = room.roles[actor.id];
    if (target.socketId) {
      io.to(target.socketId).emit('plotInfo', {
        title: 'Sich offenbaren',
        text: `${actor.name} zeigt dir heimlich seine/ihre Rolle: ${role === 'spy' ? 'Spion' : 'Widerstand'}.`,
      });
    }
    log(room, `${actor.name} offenbart jemandem heimlich die eigene Rolle.`);
  } else if (entry.card === 'buildTrust') {
    const role = room.roles[actor.id];
    if (target.socketId) {
      io.to(target.socketId).emit('plotInfo', {
        title: 'Vertrauen bilden',
        text: `Team-Chef ${actor.name} zeigt dir heimlich seine/ihre Rolle: ${role === 'spy' ? 'Spion' : 'Widerstand'}.`,
      });
    }
    log(room, `Team-Chef ${actor.name} offenbart jemandem heimlich die eigene Rolle.`);
  }

  touchRoom(room);
  if (room.plotAssign.pending.length === 0 && room.plotAssign.resolveQueue.length === 0) {
    finishPlotCardsPhase(room);
  }
  broadcastState(room);
}

function handleUsePlotCard(room, playerId, cardId, targetId) {
  if (room.phase === 'commanderGuess' || room.phase === 'gameover') return;
  const player = findPlayer(room, playerId);
  if (!player) return;
  const hand = room.plotHands[playerId] || [];
  const idx = hand.indexOf(cardId);
  if (idx === -1) return;

  if (cardId === 'distrust') {
    if (!(room.phase === 'voting' && room.voteApprovedPending)) return;
    hand.splice(idx, 1);
    room.plotDiscard.push(cardId);
    log(room, `${player.name} spielt Misstrauen – das angenommene Team wird doch noch abgelehnt!`);
    if (room.pendingTimeout) clearTimeout(room.pendingTimeout);
    resolveVoteOutcome(room, false);
    return;
  }

  if (cardId === 'surveillance') {
    const target = findPlayer(room, targetId);
    if (!target || !room.lastMissionCards || room.lastMissionCards[targetId] === undefined) return;
    const key = `${room.lastMissionNumber}:${targetId}`;
    if (room.plotSurveillanceInspected.has(key)) return;
    room.plotSurveillanceInspected.add(key);
    hand.splice(idx, 1);
    room.plotDiscard.push(cardId);
    const val = room.lastMissionCards[targetId];
    if (player.socketId) {
      io.to(player.socketId).emit('plotInfo', {
        title: 'Überwachung',
        text: `${target.name} hat bei Mission ${room.lastMissionNumber} eine ${val === 'fail' ? 'Fehlschlag' : 'Erfolgs'}-Karte gespielt.`,
      });
    }
    log(room, `${player.name} nutzt Überwachung.`);
    touchRoom(room);
    broadcastState(room);
    return;
  }

  if (cardId === 'leadership') {
    if (!(room.phase === 'team' && room.teamProposal.length === 0 && !room.plotLeadershipLocked)) return;
    hand.splice(idx, 1);
    room.plotDiscard.push(cardId);
    room.plotForcedLeaderId = playerId;
    room.plotLeadershipLocked = true;
    log(room, `${player.name} übernimmt mit Führungsstärke die Team-Chef-Rolle für diese Runde.`);
    touchRoom(room);
    broadcastState(room);
    return;
  }

  if (cardId === 'inFocus') {
    const target = findPlayer(room, targetId);
    if (!(room.phase === 'mission' && Object.keys(room.missionCards).length === 0)) return;
    if (!target || !room.teamProposal.includes(targetId)) return;
    hand.splice(idx, 1);
    room.plotDiscard.push(cardId);
    room.plotFaceUpTarget = targetId;
    log(room, `${player.name} setzt Im Fokus ein: ${target.name}s Missionskarte wird offen gespielt.`);
    touchRoom(room);
    broadcastState(room);
    return;
  }

  if (cardId === 'takeResponsibility') {
    if (room.phase === 'lobby' || room.phase === 'roles' || room.phase === 'gameover') return;
    const target = findPlayer(room, targetId);
    if (!target || targetId === playerId) return;
    const targetHand = room.plotHands[targetId] || [];
    if (targetHand.length === 0) return;
    const stolen = targetHand.shift();
    hand.splice(idx, 1);
    room.plotDiscard.push(cardId);
    room.plotHands[playerId] = room.plotHands[playerId] || [];
    room.plotHands[playerId].push(stolen);
    log(room, `${player.name} übernimmt Verantwortung und stiehlt eine Plottkarte von ${target.name}.`);
    touchRoom(room);
    broadcastState(room);
    return;
  }
}

function checkGameEnd(room) {
  const successes = room.missionResults.filter((r) => r === 'success').length;
  const fails = room.missionResults.filter((r) => r === 'fail').length;
  if (successes >= 3) {
    if (room.commanderEnabled && room.commanderId) {
      room.phase = 'commanderGuess';
      log(room, 'Der Widerstand hat drei Missionen erfolgreich abgeschlossen. Die Spione haben nun einen letzten Versuch, den Kommandanten zu enttarnen.');
      return true;
    }
    room.winner = 'resistance';
    room.phase = 'gameover';
    log(room, 'Der Widerstand hat drei Missionen erfolgreich abgeschlossen. Der Widerstand gewinnt!');
    return true;
  }
  if (fails >= 3) {
    room.winner = 'spies';
    room.phase = 'gameover';
    log(room, 'Drei Missionen sind gescheitert. Die Spione gewinnen!');
    return true;
  }
  return false;
}

// Kommandant-Variante: Nachdem der Widerstand drei Missionen gewonnen hat,
// dürfen die Spione noch einmal versuchen, den Kommandanten zu enttarnen.
// Jeder verbundene Spion darf einen Tipp abgeben; der erste gültige Tipp
// entscheidet sofort über Sieg oder Niederlage der Spione.
function handleGuessCommander(room, playerId, targetId) {
  if (room.phase !== 'commanderGuess') return;
  if (room.roles[playerId] !== 'spy') return;
  const guesser = findPlayer(room, playerId);
  const target = findPlayer(room, targetId);
  if (!guesser || !target) return;
  const correct = targetId === room.commanderId;
  room.commanderGuessedId = targetId;
  room.commanderGuessedBy = playerId;
  room.winner = correct ? 'spies' : 'resistance';
  room.phase = 'gameover';
  if (correct) {
    log(room, `${guesser.name} (Spion) enttarnt ${target.name} als Kommandant! Die Spione gewinnen doch noch.`);
  } else {
    log(room, `${guesser.name} (Spion) tippt auf ${target.name} als Kommandant – falsch! Der Widerstand gewinnt.`);
  }
  touchRoom(room);
  broadcastState(room);
}

// ---------------------------------------------------------------------------
// Bots (zum Testen, wenn weniger als 5 echte Spieler da sind)
// ---------------------------------------------------------------------------

const BOT_NAME_POOL = [
  'Bot Falke', 'Bot Adler', 'Bot Wolf', 'Bot Fuchs', 'Bot Rabe',
  'Bot Luchs', 'Bot Bär', 'Bot Viper', 'Bot Phoenix', 'Bot Schatten',
];

function addBot(room) {
  if (room.players.length >= MAX_PLAYERS) return null;
  const usedNames = new Set(room.players.map((p) => p.name));
  const name = BOT_NAME_POOL.find((n) => !usedNames.has(n)) || `Bot ${room.players.length + 1}`;
  const bot = { id: makeId(), token: null, name, socketId: null, connected: true, isBot: true };
  room.players.push(bot);
  log(room, `${name} (Bot) wurde hinzugefügt.`);
  return bot;
}

function randomDelay(min = 1300, max = 2800) {
  return min + Math.random() * (max - min);
}

function pickRandomTeam(room, size) {
  return shuffle(room.players.map((p) => p.id)).slice(0, size);
}

function decideBotVote(room, bot) {
  // Direkt vor dem automatischen Spione-Sieg (5 Ablehnungen) nicht zusätzlich blockieren,
  // damit ein Testspiel nicht rein zufällig durch Bots verloren geht.
  if (room.rejectCount >= 4) return true;
  const role = room.roles[bot.id];
  if (role === 'spy') return Math.random() < 0.7;
  return Math.random() < 0.85;
}

function decideBotCard(room, bot) {
  const role = room.roles[bot.id];
  if (role !== 'spy') return 'success';
  return Math.random() < 0.5 ? 'fail' : 'success';
}

// Bots "raten" beim Kommandant-Enttarnen einfach zufällig unter allen
// Widerstands-wirkenden Mitspielern (sie kennen zwar die Mitspione, aber
// nicht, wer der Kommandant ist - das wäre sonst kein echter Rate-Versuch).
function decideBotCommanderGuess(room, bot) {
  const candidates = room.players.filter((p) => room.roles[p.id] !== 'spy');
  if (!candidates.length) return null;
  return candidates[Math.floor(Math.random() * candidates.length)].id;
}

// Prüft, ob im aktuellen Phasenzustand ein Bot am Zug ist, und plant dessen
// Aktion mit einer kleinen, menschlich wirkenden Verzögerung ein. Wird nach
// jedem Broadcast aufgerufen; die Prüfungen in den setTimeout-Callbacks
// verhindern doppelte/veraltete Aktionen.
function scheduleBotTurnIfNeeded(room) {
  if (room.phase === 'plotcards' && room.plotAssign) {
    const assign = room.plotAssign;
    const leader = currentLeader(room);
    if (assign.pending.length > 0 && leader && leader.isBot) {
      const cardId = assign.pending[0];
      setTimeout(() => {
        if (!rooms.has(room.code)) return;
        if (room.phase !== 'plotcards' || !room.plotAssign) return;
        if (room.plotAssign.pending[0] !== cardId) return;
        const candidates = room.players.filter((p) => p.connected && p.id !== leader.id);
        if (!candidates.length) return;
        const target = candidates[Math.floor(Math.random() * candidates.length)];
        handleAssignPlotCard(room, leader.id, cardId, target.id);
      }, randomDelay());
    }
    assign.resolveQueue
      .filter((r) => { const a = findPlayer(room, r.actorId); return a && a.isBot; })
      .forEach((entry) => {
        setTimeout(() => {
          if (!rooms.has(room.code)) return;
          if (room.phase !== 'plotcards' || !room.plotAssign) return;
          if (!room.plotAssign.resolveQueue.includes(entry)) return;
          const candidates = room.players.filter((p) => p.connected && p.id !== entry.actorId);
          if (!candidates.length) return;
          const target = candidates[Math.floor(Math.random() * candidates.length)];
          handleResolvePlotTarget(room, entry.actorId, target.id);
        }, randomDelay());
      });
  } else if (room.phase === 'team') {
    const leader = activeLeader(room);
    if (!leader || !leader.isBot) return;
    const missionNumber = room.missionNumber;
    const rejectCount = room.rejectCount;
    setTimeout(() => {
      if (!rooms.has(room.code)) return;
      if (room.phase !== 'team') return;
      if (room.missionNumber !== missionNumber || room.rejectCount !== rejectCount) return;
      const currentLead = activeLeader(room);
      if (!currentLead || currentLead.id !== leader.id) return;
      const size = room.missionSizes[room.missionNumber - 1];
      const memberIds = pickRandomTeam(room, size);
      handleProposeTeam(room, leader.id, memberIds);
    }, randomDelay());
  } else if (room.phase === 'voting') {
    const round = room.voteRound;
    room.players.filter((p) => p.isBot && room.votes[p.id] === undefined).forEach((bot) => {
      setTimeout(() => {
        if (!rooms.has(room.code)) return;
        if (room.phase !== 'voting' || room.voteRound !== round) return;
        if (room.votes[bot.id] !== undefined) return;
        handleVote(room, bot.id, decideBotVote(room, bot));
      }, randomDelay());
    });
  } else if (room.phase === 'mission') {
    const round = room.missionRound;
    room.teamProposal
      .map((id) => findPlayer(room, id))
      .filter((p) => p && p.isBot && room.missionCards[p.id] === undefined)
      .forEach((bot) => {
        setTimeout(() => {
          if (!rooms.has(room.code)) return;
          if (room.phase !== 'mission' || room.missionRound !== round) return;
          if (room.missionCards[bot.id] !== undefined) return;
          handlePlayCard(room, bot.id, decideBotCard(room, bot));
        }, randomDelay());
      });
  } else if (room.phase === 'commanderGuess') {
    room.players.filter((p) => p.isBot && room.roles[p.id] === 'spy').forEach((bot) => {
      setTimeout(() => {
        if (!rooms.has(room.code)) return;
        if (room.phase !== 'commanderGuess') return;
        const targetId = decideBotCommanderGuess(room, bot);
        if (!targetId) return;
        handleGuessCommander(room, bot.id, targetId);
      }, randomDelay());
    });
  }
}

// ---------------------------------------------------------------------------
// Geteilte Spiellogik (von echten Spielern per Socket UND von Bots genutzt)
// ---------------------------------------------------------------------------

function handleProposeTeam(room, leaderId, memberIds) {
  if (room.phase !== 'team') return;
  const leader = activeLeader(room);
  if (!leader || leader.id !== leaderId) return;
  const size = room.missionSizes[room.missionNumber - 1];
  const unique = Array.from(new Set(memberIds || []));
  if (unique.length !== size) return;
  if (!unique.every((id) => findPlayer(room, id))) return;

  room.teamProposal = unique;
  room.votes = {};
  room.revealedVotes = {};
  room.phase = 'voting';
  room.voteRound += 1;
  log(room, `${leader.name}${leader.isBot ? ' (Bot)' : ''} schlägt ein Team vor: ${unique.map((id) => findPlayer(room, id).name).join(', ')}.`);
  touchRoom(room);
  broadcastState(room);
}

function resolveVoteOutcome(room, approved) {
  room.voteApprovedPending = false;
  room.pendingTimeout = null;
  room.plotLeadershipLocked = false;
  room.plotForcedLeaderId = null;
  if (approved) {
    room.phase = 'mission';
    room.missionCards = {};
    room.missionRound += 1;
    room.plotFaceUpTarget = null;
    log(room, 'Das Team führt die Mission durch.');
  } else {
    room.rejectCount += 1;
    if (room.rejectCount >= 5) {
      room.winner = 'spies';
      room.phase = 'gameover';
      log(room, 'Fünf Team-Vorschläge in Folge wurden abgelehnt. Die Spione gewinnen!');
    } else {
      advanceLeader(room);
      room.teamProposal = [];
      room.votes = {};
      room.phase = 'team';
      log(room, `Mission ${room.missionNumber}: ${currentLeader(room).name} ist Team-Chef und wählt ein Team.`);
    }
  }
  touchRoom(room);
  broadcastState(room);
}

// Spieler mit der Plottkarte "Meinungsmacher" (permanent), die noch verbunden sind -
// diese müssen laut Karteneffekt ihre Stimme immer zuerst offenlegen.
function getConnectedOpinionLeaderIds(room) {
  return room.players
    .filter((p) => p.connected && room.plotPermanent[p.id] && room.plotPermanent[p.id].opinionLeader)
    .map((p) => p.id);
}

function handleVote(room, playerId, approve) {
  if (room.phase !== 'voting') return;
  const player = findPlayer(room, playerId);
  if (!player) return;
  if (room.votes[playerId] !== undefined) return;

  const opinionLeaderIds = getConnectedOpinionLeaderIds(room);
  if (!opinionLeaderIds.includes(playerId)) {
    const allLeadersVoted = opinionLeaderIds.every((id) => room.votes[id] !== undefined);
    if (!allLeadersVoted) return; // muss warten, bis die Meinungsmacher zuerst abgestimmt haben
  }

  room.votes[player.id] = !!approve;
  if (opinionLeaderIds.includes(playerId)) {
    // Meinungsmacher: Stimme wird sofort offen für alle sichtbar (nicht erst bei der Auszählung).
    room.revealedVotes[playerId] = !!approve;
  }
  touchRoom(room);
  broadcastState(room); // zeigt, wer schon abgestimmt hat (nicht wie) - außer bei offengelegten Stimmen

  if (Object.keys(room.votes).length >= room.players.length) {
    const approvals = room.players.filter((p) => room.votes[p.id]).length;
    const approved = approvals > room.players.length / 2;
    const leader = currentLeader(room);
    room.voteHistory.push({
      missionNumber: room.missionNumber,
      leaderId: leader.id,
      team: room.teamProposal,
      votes: { ...room.votes },
      approved,
    });
    io.to(room.code).emit('voteResult', {
      votes: { ...room.votes },
      approved,
      team: room.teamProposal,
    });
    log(room, approved
      ? `Team wurde angenommen (${approvals}/${room.players.length} dafür).`
      : `Team wurde abgelehnt (${approvals}/${room.players.length} dafür).`);

    // Wenn angenommen: kurzes Zeitfenster, in dem eine gehaltene "Misstrauen"-Karte
    // die Annahme noch kippen kann (siehe handleUsePlotCard).
    room.voteApprovedPending = approved;
    room.pendingTimeout = setTimeout(() => {
      if (!rooms.has(room.code)) return;
      resolveVoteOutcome(room, approved);
    }, 3500);
  }
}

function handlePlayCard(room, playerId, card) {
  if (room.phase !== 'mission') return;
  const player = findPlayer(room, playerId);
  if (!player || !room.teamProposal.includes(player.id)) return;
  if (room.missionCards[playerId] !== undefined) return;
  const role = room.roles[player.id];
  const chosen = role === 'resistance' ? 'success' : (card === 'fail' ? 'fail' : 'success');
  room.missionCards[player.id] = chosen;
  if (room.plotFaceUpTarget === player.id) {
    log(room, `Im Fokus: ${player.name} spielt offen eine ${chosen === 'fail' ? 'Fehlschlag' : 'Erfolgs'}-Karte.`);
  }
  touchRoom(room);
  broadcastState(room); // zeigt nur, wer schon gespielt hat

  if (Object.keys(room.missionCards).length >= room.teamProposal.length) {
    const failCount = Object.values(room.missionCards).filter((c) => c === 'fail').length;
    const needed = room.requiredFails[room.missionNumber - 1];
    const result = failCount >= needed ? 'fail' : 'success';
    room.missionResults.push(result);
    room.lastMissionNumber = room.missionNumber;
    room.lastMissionTeam = [...room.teamProposal];
    room.lastMissionCards = { ...room.missionCards };
    io.to(room.code).emit('missionResult', {
      missionNumber: room.missionNumber,
      failCount,
      needed,
      result,
      teamSize: room.teamProposal.length,
    });
    log(room, `Mission ${room.missionNumber} ist ${result === 'success' ? 'ERFOLGREICH' : 'GESCHEITERT'} (${failCount} Fehlschlag-Karte${failCount === 1 ? '' : 'n'}).`);

    setTimeout(() => {
      if (!rooms.has(room.code)) return;
      room.rejectCount = 0;
      const over = checkGameEnd(room);
      if (!over) {
        room.missionNumber += 1;
        advanceLeader(room);
        startPlotCardsPhase(room);
      }
      touchRoom(room);
      broadcastState(room);
    }, 4000);
  }
}

// ---------------------------------------------------------------------------
// Socket.IO
// ---------------------------------------------------------------------------

io.on('connection', (socket) => {
  socket.on('createRoom', ({ name }, cb) => {
    try {
      name = (name || '').trim().slice(0, 20) || 'Spieler';
      const room = createRoom();
      const player = {
        id: makeId(),
        token: makeId(),
        name,
        socketId: socket.id,
        connected: true,
      };
      room.hostId = player.id;
      room.players.push(player);
      socket.join(room.code);
      socket.data.roomCode = room.code;
      socket.data.playerId = player.id;
      log(room, `${name} hat den Raum erstellt.`);
      touchRoom(room);
      cb({ ok: true, code: room.code, playerId: player.id, token: player.token });
      broadcastState(room);
    } catch (err) {
      cb({ ok: false, error: 'Raum konnte nicht erstellt werden.' });
    }
  });

  socket.on('joinRoom', ({ code, name, token }, cb) => {
    code = (code || '').trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return cb({ ok: false, error: 'Diesen Raum gibt es nicht.' });

    // Reconnect via Token?
    if (token) {
      const existing = room.players.find((p) => p.token === token);
      if (existing) {
        existing.socketId = socket.id;
        existing.connected = true;
        socket.join(room.code);
        socket.data.roomCode = room.code;
        socket.data.playerId = existing.id;
        touchRoom(room);
        log(room, `${existing.name} ist wieder verbunden.`);
        cb({ ok: true, code: room.code, playerId: existing.id, token: existing.token, rejoined: true });
        broadcastState(room);
        if (room.phase !== 'lobby') sendRoleTo(room, existing);
        return;
      }
    }

    if (room.phase !== 'lobby') {
      return cb({ ok: false, error: 'Das Spiel läuft bereits. Bitte warte auf die nächste Runde.' });
    }
    if (room.players.length >= MAX_PLAYERS) {
      return cb({ ok: false, error: 'Der Raum ist bereits voll (max. 10 Spieler).' });
    }
    name = (name || '').trim().slice(0, 20) || 'Spieler';
    if (room.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      return cb({ ok: false, error: 'Dieser Name ist im Raum bereits vergeben.' });
    }
    const player = {
      id: makeId(),
      token: makeId(),
      name,
      socketId: socket.id,
      connected: true,
    };
    room.players.push(player);
    if (!room.hostId) room.hostId = player.id;
    socket.join(room.code);
    socket.data.roomCode = room.code;
    socket.data.playerId = player.id;
    touchRoom(room);
    log(room, `${name} ist dem Raum beigetreten.`);
    cb({ ok: true, code: room.code, playerId: player.id, token: player.token });
    broadcastState(room);
  });

  socket.on('leaveRoom', () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return;
    const player = findPlayer(room, socket.data.playerId);
    if (!player) return;

    if (room.phase === 'lobby') {
      // Vor Spielstart: Sitzplatz wird komplett freigegeben.
      room.players = room.players.filter((p) => p.id !== player.id);
      if (room.hostId === player.id) {
        room.hostId = room.players.length ? room.players[0].id : null;
      }
      log(room, `${player.name} hat den Raum verlassen.`);
    } else {
      // Spiel läuft schon: wie ein Verbindungsabbruch behandeln, der Sitzplatz
      // bleibt erhalten (Team-/Missionslogik referenziert sonst fehlende Spieler-IDs).
      player.connected = false;
      log(room, `${player.name} hat das Spiel verlassen.`);
    }

    socket.leave(room.code);
    socket.data.roomCode = null;
    socket.data.playerId = null;
    touchRoom(room);
    if (room.players.length === 0) {
      rooms.delete(room.code);
    } else {
      broadcastState(room);
    }
  });

  socket.on('kickPlayer', ({ playerId }) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.phase !== 'lobby') return;
    if (socket.data.playerId !== room.hostId) return;
    if (playerId === room.hostId) return;
    room.players = room.players.filter((p) => p.id !== playerId);
    touchRoom(room);
    broadcastState(room);
  });

  // Bots hinzufügen, um allein oder zu wenigen Freunden das Spiel testen zu können.
  socket.on('addBot', () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.phase !== 'lobby') return;
    if (socket.data.playerId !== room.hostId) return;
    if (room.players.length >= MAX_PLAYERS) return;
    addBot(room);
    touchRoom(room);
    broadcastState(room);
  });

  // Füllt den Raum in einem Schritt mit Bots bis zur Mindestspielerzahl auf.
  socket.on('fillWithBots', () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.phase !== 'lobby') return;
    if (socket.data.playerId !== room.hostId) return;
    while (room.players.length < MIN_PLAYERS) {
      if (!addBot(room)) break;
    }
    touchRoom(room);
    broadcastState(room);
  });

  // Plottkarten-Variante in der Lobby an-/ausschalten (nur Host, nur vor Spielstart)
  socket.on('setPlotCardsEnabled', ({ enabled }) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.phase !== 'lobby') return;
    if (socket.data.playerId !== room.hostId) return;
    room.plotCardsEnabled = !!enabled;
    touchRoom(room);
    broadcastState(room);
  });

  // Einzelne Plottkarte in der Lobby an-/ausschalten (nur Host, nur vor Spielstart)
  socket.on('setPlotCardConfig', ({ cardId, enabled }) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.phase !== 'lobby') return;
    if (socket.data.playerId !== room.hostId) return;
    if (!PLOT_CARD_INFO[cardId]) return;
    room.plotCardConfig[cardId] = !!enabled;
    touchRoom(room);
    broadcastState(room);
  });

  // "Kommandant"-Variante in der Lobby an-/ausschalten (nur Host, nur vor Spielstart)
  socket.on('setCommanderEnabled', ({ enabled }) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.phase !== 'lobby') return;
    if (socket.data.playerId !== room.hostId) return;
    room.commanderEnabled = !!enabled;
    touchRoom(room);
    broadcastState(room);
  });

  // Kommandant-Variante: Ein Spion versucht, den Kommandanten zu enttarnen.
  socket.on('guessCommander', ({ targetId }) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return;
    handleGuessCommander(room, socket.data.playerId, targetId);
  });

  socket.on('startGame', () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return;
    if (socket.data.playerId !== room.hostId) return;
    if (room.phase !== 'lobby') return;
    const n = room.players.length;
    if (n < MIN_PLAYERS || n > MAX_PLAYERS) return;

    const config = ROLE_CONFIG[n];
    const ids = room.players.map((p) => p.id);
    const shuffled = shuffle(ids);
    const spyIds = new Set(shuffled.slice(0, config.spies));
    room.roles = {};
    ids.forEach((id) => {
      room.roles[id] = spyIds.has(id) ? 'spy' : 'resistance';
    });

    if (room.commanderEnabled) {
      const resistanceIds = ids.filter((id) => !spyIds.has(id));
      room.commanderId = resistanceIds.length
        ? resistanceIds[Math.floor(Math.random() * resistanceIds.length)]
        : null;
    } else {
      room.commanderId = null;
    }
    room.commanderGuessedId = null;
    room.commanderGuessedBy = null;

    room.missionSizes = MISSION_SIZES[n];
    room.requiredFails = [0, 1, 2, 3, 4].map((i) => requiredFailsFor(n, i));
    room.missionNumber = 1;
    room.missionResults = [];
    room.rejectCount = 0;
    room.voteHistory = [];
    room.winner = null;
    room.ready = new Set();
    room.leaderIndex = Math.floor(Math.random() * room.players.length);
    room.phase = 'roles';
    room.logs = [];
    // Plottkarten-Variante zurücksetzen/neu mischen (nur falls aktiviert)
    room.plotDeck = room.plotCardsEnabled ? buildPlotDeck(room.plotCardConfig) : [];
    room.plotDiscard = [];
    room.plotHands = {};
    room.plotPermanent = {};
    room.plotAssign = null;
    room.plotForcedLeaderId = null;
    room.plotLeadershipLocked = false;
    room.plotFaceUpTarget = null;
    room.plotSurveillanceInspected = new Set();
    room.lastMissionNumber = null;
    room.lastMissionTeam = [];
    room.lastMissionCards = null;
    room.voteApprovedPending = false;
    if (room.pendingTimeout) clearTimeout(room.pendingTimeout);
    room.pendingTimeout = null;
    log(room, 'Das Spiel beginnt. Rollen wurden ausgeteilt.');
    touchRoom(room);

    // Bots müssen nicht manuell auf "bereit" klicken.
    room.players.filter((p) => p.isBot).forEach((p) => room.ready.add(p.id));

    room.players.forEach((p) => sendRoleTo(room, p));
    broadcastState(room);
  });

  socket.on('ready', () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.phase !== 'roles') return;
    room.ready.add(socket.data.playerId);
    touchRoom(room);
    if (room.ready.size >= room.players.length) {
      startPlotCardsPhase(room);
    }
    broadcastState(room);
  });

  socket.on('proposeTeam', ({ memberIds }) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return;
    handleProposeTeam(room, socket.data.playerId, memberIds);
  });

  socket.on('vote', ({ approve }) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return;
    handleVote(room, socket.data.playerId, approve);
  });

  socket.on('playCard', ({ card }) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return;
    handlePlayCard(room, socket.data.playerId, card);
  });

  // Plottkarten-Variante
  socket.on('assignPlotCard', ({ cardId, targetPlayerId }) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return;
    handleAssignPlotCard(room, socket.data.playerId, cardId, targetPlayerId);
  });

  socket.on('resolvePlotTarget', ({ targetPlayerId }) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return;
    handleResolvePlotTarget(room, socket.data.playerId, targetPlayerId);
  });

  socket.on('usePlotCard', ({ cardId, targetPlayerId }) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return;
    handleUsePlotCard(room, socket.data.playerId, cardId, targetPlayerId);
  });

  socket.on('resetGame', () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return;
    if (socket.data.playerId !== room.hostId) return;
    room.phase = 'lobby';
    room.roles = {};
    room.missionResults = [];
    room.teamProposal = [];
    room.votes = {};
    room.revealedVotes = {};
    room.missionCards = {};
    room.rejectCount = 0;
    room.voteHistory = [];
    room.winner = null;
    room.ready = new Set();
    room.logs = [];
    room.plotDeck = [];
    room.plotDiscard = [];
    room.plotHands = {};
    room.plotPermanent = {};
    room.plotAssign = null;
    room.plotForcedLeaderId = null;
    room.plotLeadershipLocked = false;
    room.plotFaceUpTarget = null;
    room.plotSurveillanceInspected = new Set();
    room.lastMissionNumber = null;
    room.lastMissionTeam = [];
    room.lastMissionCards = null;
    room.voteApprovedPending = false;
    if (room.pendingTimeout) clearTimeout(room.pendingTimeout);
    room.pendingTimeout = null;
    room.commanderId = null;
    room.commanderGuessedId = null;
    room.commanderGuessedBy = null;
    log(room, 'Zurück zur Lobby. Bereit für eine neue Runde.');
    touchRoom(room);
    broadcastState(room);
  });

  socket.on('disconnect', () => {
    const room = rooms.get(socket.data.roomCode);
    if (!room) return;
    const player = findPlayer(room, socket.data.playerId);
    if (!player) return;
    player.connected = false;
    log(room, `${player.name} hat die Verbindung verloren.`);
    touchRoom(room);
    broadcastState(room);
  });
});

server.listen(PORT, () => {
  console.log(`Der Widerstand läuft auf Port ${PORT}`);
  console.log(`Lokal öffnen unter: http://localhost:${PORT}`);
});
