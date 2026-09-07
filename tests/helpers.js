// Kleine Hilfsfunktionen für die Integrationstests unter tests/.
//
// Diese Tests starten den echten server.js als Kindprozess auf einem
// Test-Port und steuern das Spiel über einen echten socket.io-client -
// genau wie ein Browser es tun würde. Das prüft den kompletten Server-Code
// (Rollen, Team-Vorschlag/Abstimmung, Missionen, Plottkarten, Kommandant)
// end-to-end, statt einzelne Funktionen isoliert zu testen.

const { spawn } = require('child_process');
const path = require('path');
const { io } = require('socket.io-client');

function startServer(port) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
      env: Object.assign({}, process.env, { PORT: String(port) }),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let started = false;
    const onData = (data) => {
      if (!started && data.toString().includes('läuft auf Port')) {
        started = true;
        proc.stdout.off('data', onData);
        resolve(proc);
      }
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', (d) => process.stderr.write(`[server:${port}] ${d}`));
    proc.on('error', reject);
    proc.on('exit', (code) => {
      if (!started) reject(new Error(`Server (Port ${port}) beendete sich vorzeitig mit Code ${code}`));
    });
    setTimeout(() => { if (!started) reject(new Error('Timeout beim Serverstart')); }, 8000);
  });
}

function stopServer(proc) {
  return new Promise((resolve) => {
    if (!proc || proc.killed) return resolve();
    proc.once('exit', () => resolve());
    proc.kill();
    setTimeout(resolve, 2000); // Sicherheitsnetz, falls 'exit' nicht rechtzeitig feuert
  });
}

function connectClient(url) {
  return new Promise((resolve, reject) => {
    const socket = io(url, { transports: ['websocket'], reconnection: false });
    const timer = setTimeout(() => reject(new Error('Timeout beim Verbinden mit dem Server')), 5000);
    socket.once('connect', () => { clearTimeout(timer); resolve(socket); });
    socket.once('connect_error', (err) => { clearTimeout(timer); reject(err); });
  });
}

function emitAsync(socket, event, payload) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout bei Event "${event}"`)), 5000);
    socket.emit(event, payload, (res) => { clearTimeout(timer); resolve(res); });
  });
}

// Wartet auf den nächsten gameState, der `predicate` erfüllt.
function waitForState(socket, predicate, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('gameState', handler);
      reject(new Error('Timeout beim Warten auf einen bestimmten Spielzustand'));
    }, timeoutMs);
    function handler(state) {
      if (predicate(state)) {
        clearTimeout(timer);
        socket.off('gameState', handler);
        resolve(state);
      }
    }
    socket.on('gameState', handler);
  });
}

// Hängt einen simplen "Autopilot" an einen Test-Client: er verhält sich wie
// ein kooperativer, immer ehrlicher Mitspieler (schlägt ein Team vor, sobald
// er Team-Chef ist, stimmt immer zu, spielt immer "Erfolg", tippt als Spion
// im Kommandant-Finale auf einen zufälligen Mitspieler). Die eigentlichen
// Bots im Raum handeln bereits selbstständig serverseitig - der Autopilot
// deckt nur den einen "echten" Test-Client ab, damit das Spiel unabhängig
// davon durchläuft, wer zufällig Team-Chef/Spion/Kommandant wird.
function attachAutopilot(socket, getMyId) {
  let myRole = null;
  socket.on('yourRole', (r) => { myRole = r; });

  socket.on('gameState', (state) => {
    const myId = getMyId();
    if (!myId) return;

    if (state.phase === 'plotcards' && state.plot) {
      const otherId = () => {
        const other = state.players.find((p) => p.connected && p.id !== myId);
        return other ? other.id : null;
      };
      if (state.plot.distributingLeaderId === myId && (state.plot.pending || []).length > 0) {
        const card = state.plot.pending[0];
        const targetId = otherId();
        if (targetId) socket.emit('assignPlotCard', { cardId: card.id, targetPlayerId: targetId });
        return;
      }
      const myResolve = (state.plot.resolveQueue || []).find((r) => r.actorId === myId);
      if (myResolve) {
        const targetId = otherId();
        if (targetId) socket.emit('resolvePlotTarget', { targetPlayerId: targetId });
        return;
      }
      return;
    }
    if (state.phase === 'team' && state.leaderId === myId && (state.teamProposal || []).length === 0) {
      const size = state.missionSizes[state.missionNumber - 1];
      const memberIds = state.players.map((p) => p.id).slice(0, size);
      socket.emit('proposeTeam', { memberIds });
      return;
    }
    if (state.phase === 'voting' && !(state.votesSubmitted || []).includes(myId)) {
      socket.emit('vote', { approve: true });
      return;
    }
    if (state.phase === 'mission'
      && (state.teamProposal || []).includes(myId)
      && !(state.missionCardsSubmitted || []).includes(myId)) {
      socket.emit('playCard', { card: 'success' });
      return;
    }
    if (state.phase === 'commanderGuess' && myRole && myRole.role === 'spy') {
      const target = state.players.find((p) => p.id !== myId);
      if (target) socket.emit('guessCommander', { targetId: target.id });
    }
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion fehlgeschlagen: ${message}`);
}

module.exports = { startServer, stopServer, connectClient, emitAsync, waitForState, attachAutopilot, assert };
