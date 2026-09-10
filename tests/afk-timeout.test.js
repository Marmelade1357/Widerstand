// Regressionstest für das AFK-Timeout: Eine verbundene, aber untätige Person
// (z. B. gesperrtes Handy) als Team-Chef, beim Abstimmen oder bei der
// Missions-Karte wird nach der eingestellten Zeit automatisch übersprungen -
// mit einem sicheren, harmlosen Standardzug (zufälliges Team, Zustimmung,
// Erfolgskarte) -, damit niemand die Runde unbegrenzt blockiert. Prüft
// außerdem, dass der Host diese Funktion in den Lobby-Einstellungen
// abschalten kann. Plottkarten- und Kommandant-Variante werden hier bewusst
// ausgeschaltet, damit der Test sich auf genau die drei Phasen konzentriert,
// die das AFK-Timeout tatsächlich abdeckt.

const { startServer, stopServer, connectClient, emitAsync, waitForState, assert } = require('./helpers');

const AFK_TIMEOUT_MS = 300;
const FAST_ENV = { AFK_TIMEOUT_MS: String(AFK_TIMEOUT_MS) };

async function testEnabled() {
  const PORT = 3930;
  const proc = await startServer(PORT, FAST_ENV);
  try {
    const url = `http://localhost:${PORT}`;
    const host = await connectClient(url);

    const created = await emitAsync(host, 'createRoom', { name: 'AFKHuman' });
    assert(created.ok, `createRoom fehlgeschlagen: ${JSON.stringify(created)}`);
    const myId = created.playerId;

    host.emit('setPlotCardsEnabled', { enabled: false });
    host.emit('setCommanderEnabled', { enabled: false });
    host.emit('addBot');
    host.emit('addBot');
    host.emit('addBot');
    host.emit('addBot');
    await waitForState(host, (s) => s.players.length === 5 && !s.plotCardsEnabled && !s.commanderEnabled);
    host.emit('startGame');
    host.emit('ready');

    // Bewusst KEINE Aktion senden, egal in welcher der drei Phasen wir dran
    // sind - simuliert genau das Szenario "Handy gesperrt, Person reagiert
    // nicht", ganz gleich ob als Team-Chef, beim Abstimmen oder bei der Karte.
    const myTurnState = await waitForState(host, (s) => (
      (s.phase === 'team' && s.leaderId === myId && s.teamProposal.length === 0)
      || (s.phase === 'voting' && !s.votesSubmitted.includes(myId))
      || (s.phase === 'mission' && s.teamProposal.includes(myId) && !s.missionCardsSubmitted.includes(myId))
    ), 15000);
    const myPhase = myTurnState.phase;
    const t0 = Date.now();

    const afterState = await waitForState(host, (s) => {
      if (myPhase === 'team') return s.phase !== 'team' || s.leaderId !== myId || s.teamProposal.length > 0;
      if (myPhase === 'voting') return s.phase !== 'voting' || s.votesSubmitted.includes(myId);
      return s.phase !== 'mission' || !s.teamProposal.includes(myId) || s.missionCardsSubmitted.includes(myId);
    }, AFK_TIMEOUT_MS + 5000);
    const elapsed = Date.now() - t0;

    assert(
      elapsed >= AFK_TIMEOUT_MS - 100,
      `Zug wurde zu früh übersprungen (${elapsed}ms, Limit war ${AFK_TIMEOUT_MS}ms) - das AFK-Timeout wurde offenbar nicht abgewartet`
    );
    assert(!!afterState, `Es sollte nach dem AFK-Timeout automatisch weitergegangen sein (Phase war: ${myPhase})`);

    console.log(`OK: afk-timeout.test.js - aktiviert (Phase "${myPhase}" nach ${elapsed}ms automatisch übersprungen)`);
  } finally {
    await stopServer(proc);
  }
}

async function testDisabled() {
  const PORT = 3931;
  const proc = await startServer(PORT, FAST_ENV);
  try {
    const url = `http://localhost:${PORT}`;
    const host = await connectClient(url);
    let latestState = null;
    host.on('gameState', (s) => { latestState = s; });

    const created = await emitAsync(host, 'createRoom', { name: 'AFKHuman2' });
    assert(created.ok, `createRoom fehlgeschlagen: ${JSON.stringify(created)}`);
    const myId = created.playerId;

    host.emit('setPlotCardsEnabled', { enabled: false });
    host.emit('setCommanderEnabled', { enabled: false });
    host.emit('setAfkTimeoutEnabled', { enabled: false });
    host.emit('addBot');
    host.emit('addBot');
    host.emit('addBot');
    host.emit('addBot');
    await waitForState(host, (s) => s.players.length === 5 && s.afkTimeoutEnabled === false);
    host.emit('startGame');
    host.emit('ready');

    const myTurnState = await waitForState(host, (s) => (
      (s.phase === 'team' && s.leaderId === myId && s.teamProposal.length === 0)
      || (s.phase === 'voting' && !s.votesSubmitted.includes(myId))
      || (s.phase === 'mission' && s.teamProposal.includes(myId) && !s.missionCardsSubmitted.includes(myId))
    ), 15000);
    const myPhase = myTurnState.phase;

    // Deutlich länger als AFK_TIMEOUT_MS warten, ohne selbst zu handeln - bei
    // abgeschaltetem Timeout darf der Server NICHT automatisch für uns handeln.
    await new Promise((resolve) => setTimeout(resolve, AFK_TIMEOUT_MS * 4));

    const stillWaiting = myPhase === 'team'
      ? (latestState.phase === 'team' && latestState.leaderId === myId && latestState.teamProposal.length === 0)
      : myPhase === 'voting'
        ? (latestState.phase === 'voting' && !latestState.votesSubmitted.includes(myId))
        : (latestState.phase === 'mission' && latestState.teamProposal.includes(myId) && !latestState.missionCardsSubmitted.includes(myId));

    assert(stillWaiting, `Bei abgeschaltetem AFK-Timeout sollte die Phase "${myPhase}" NICHT automatisch weitergegangen sein`);

    console.log(`OK: afk-timeout.test.js - abgeschaltet (Phase "${myPhase}", kein automatischer Zug)`);
  } finally {
    await stopServer(proc);
  }
}

async function main() {
  await testEnabled();
  await testDisabled();
}

main().catch((err) => {
  console.error('FEHLER in afk-timeout.test.js:', err);
  process.exitCode = 1;
});
