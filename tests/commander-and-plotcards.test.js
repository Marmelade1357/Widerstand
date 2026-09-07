// Regressionstest für die BEIDEN Varianten zusammen (Kommandant + Plott-
// karten aktiviert - das ist auch die Standardeinstellung in der Lobby).
// Statt ein bestimmtes Ergebnis zu erzwingen (welcher Bot Spion/Kommandant
// wird, ist zufällig), prüft dieser Test INVARIANTEN, die in jedem Spiel-
// verlauf gelten müssen. Das deckt genau die Art von Regression ab, die uns
// in dieser Session schon passiert ist (z.B. dass ein korrekter Kommandant-
// Tipp den Sieg nicht korrekt umdreht), ohne bei jedem Lauf von der
// zufälligen Rollenverteilung abzuhängen - und ist damit für CI robust statt
// gelegentlich grundlos rot ("flaky").

const { startServer, stopServer, connectClient, emitAsync, waitForState, attachAutopilot, assert } = require('./helpers');

const PORT = 3902;

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

    host.emit('setPlotCardsEnabled', { enabled: true });
    host.emit('setCommanderEnabled', { enabled: true });
    host.emit('fillWithBots'); // füllt auf 5 auf
    await waitForState(host, (s) => s.players.length === 5);
    // Auf 7 Spieler erweitern (4 Widerstand/3 Spione statt 3/2) - etwas
    // interessantere Rollenverteilung, ohne dass es für die geprüften
    // Invarianten drauf ankäme.
    host.emit('addBot');
    host.emit('addBot');
    await waitForState(host, (s) => s.players.length === 7 && s.plotCardsEnabled === true && s.commanderEnabled === true);

    host.emit('startGame');
    await waitForState(host, (s) => s.phase === 'roles');
    host.emit('ready');

    const finalState = await waitForState(host, (s) => s.phase === 'gameover', 150000);

    assert(finalState.winner === 'resistance' || finalState.winner === 'spies',
      `Gewinner sollte gesetzt sein, war: ${finalState.winner}`);

    const spyCount = (finalState.revealedRoles || []).filter((r) => r.role === 'spy').length;
    assert(spyCount === 3, `Bei 7 Spielern sollten 3 Spione dabei sein, waren aber ${spyCount}`);

    const commanderCount = (finalState.revealedRoles || []).filter((r) => r.isCommander).length;
    assert(commanderCount === 1, `Es sollte genau ein Kommandant markiert sein, waren aber ${commanderCount}`);

    // Kern-Invariante des Kommandant-Finales: Wenn ein Spion getippt hat,
    // muss "richtig getippt" und "Spione gewinnen" exakt zusammenfallen -
    // sonst wäre der Sieg beim Aufdecken falsch entschieden worden.
    if (finalState.commanderReveal && finalState.commanderReveal.guessedById) {
      const { commanderId, guessedId } = finalState.commanderReveal;
      const guessedCorrectly = guessedId === commanderId;
      const spiesWon = finalState.winner === 'spies';
      assert(guessedCorrectly === spiesWon,
        `Kommandant-Tipp und Spielausgang widersprechen sich: richtig getippt=${guessedCorrectly}, Spione gewonnen=${spiesWon}`);
    }

    console.log('OK: commander-and-plotcards.test.js');
  } finally {
    await stopServer(proc);
  }
}

main().catch((err) => {
  console.error('FEHLER in commander-and-plotcards.test.js:', err);
  process.exitCode = 1;
});
