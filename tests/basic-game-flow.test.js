// Regressionstest für den GRUNDABLAUF ohne Varianten (kein Kommandant, keine
// Plottkarten): Raum erstellen, mit Bots auffüllen, Spiel starten, bis zum
// Spielende durchspielen. Prüft vor allem, dass der Server dabei nicht
// abstürzt oder hängen bleibt, und dass am Ende ein konsistentes Ergebnis
// steht (Gewinner gesetzt, Rollenverteilung passt zur Spielerzahl).
//
// Hinweis: Nur 'createRoom'/'joinRoom' beantworten ihr Event mit einem
// Acknowledgement-Callback. Alle anderen Events (fillWithBots, startGame,
// ready, proposeTeam, ...) sind "fire and forget" - ihre Wirkung wird über
// den nächsten passenden gameState-Broadcast geprüft (waitForState), nicht
// über eine Callback-Antwort.

const { startServer, stopServer, connectClient, emitAsync, waitForState, attachAutopilot, assert } = require('./helpers');

const PORT = 3901;

async function main() {
  const proc = await startServer(PORT);
  try {
    const url = `http://localhost:${PORT}`;
    const host = await connectClient(url);
    let myId = null;
    attachAutopilot(host, () => myId);

    const created = await emitAsync(host, 'createRoom', { name: 'TestHost' });
    assert(created.ok, `createRoom sollte erfolgreich sein, war aber: ${JSON.stringify(created)}`);
    myId = created.playerId;

    host.emit('setPlotCardsEnabled', { enabled: false });
    host.emit('setCommanderEnabled', { enabled: false });
    host.emit('fillWithBots');

    const lobbyState = await waitForState(host, (s) => s.players.length === 5 && s.plotCardsEnabled === false && s.commanderEnabled === false);
    assert(lobbyState.players.length === 5, 'Raum sollte nach fillWithBots 5 Spieler haben');

    host.emit('startGame');
    await waitForState(host, (s) => s.phase === 'roles');
    host.emit('ready');

    const finalState = await waitForState(host, (s) => s.phase === 'gameover', 120000);

    assert(finalState.winner === 'resistance' || finalState.winner === 'spies',
      `Gewinner sollte gesetzt sein, war: ${finalState.winner}`);
    assert(!finalState.commanderReveal, 'Ohne Kommandant-Variante sollte es keine commanderReveal geben');

    const spyCount = (finalState.revealedRoles || []).filter((r) => r.role === 'spy').length;
    assert(spyCount === 2, `Bei 5 Spielern sollten 2 Spione dabei sein, waren aber ${spyCount}`);

    console.log('OK: basic-game-flow.test.js');
  } finally {
    await stopServer(proc);
  }
}

main().catch((err) => {
  console.error('FEHLER in basic-game-flow.test.js:', err);
  process.exitCode = 1;
});
