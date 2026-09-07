# Der Widerstand – Online

Eine browserbasierte Online-Version des Gesellschaftsspiels **"Der Widerstand"** (The Resistance) zum Spielen mit Freunden – jede:r auf dem eigenen Handy/Tablet/PC, ein gemeinsamer Server übernimmt Rollen-Verteilung, Team-Auswahl, Abstimmungen und Missionen.

Basiert auf dem offiziellen Regelwerk: 5–10 Spieler, Rollen (Widerstand/Spion) und Missionsgrößen werden automatisch nach der Spieleranzahl bestimmt, inklusive der Sonderregel "2 Fehlschlag-Karten nötig" für Mission 4 bei 7+ Spielern.

## Funktionen

- **Automatisches Austeilen der Rollen** – kein Kartenmischen nötig, jeder Spieler sieht seine Rolle privat auf dem eigenen Gerät.
- **Spion-Erkennung zu Spielbeginn** – Spione sehen beim Rollen-Reveal automatisch, wer die anderen Spione sind (entspricht dem "Augen zu, Spione erkennen sich"-Moment aus der Anleitung).
- Team-Vorschlag durch den rotierenden Team-Chef, geheime Abstimmung (Pro/Contra), automatische Auswertung.
- Geheimes Ausspielen von Erfolg-/Fehlschlag-Karten während der Mission, automatische Auswertung inkl. Sonderregel für Mission 4.
- Missions-Fortschritt, Ablehnungs-Zähler (5x in Folge abgelehnt = Sieg der Spione). Bewusst **kein** Verlaufsprotokoll/Chat – niemand kann nachträglich nachsehen, wer in früheren Runden mit wem im Team war; alle Einblendungen (Mission-Ergebnis, Abstimmungs-Reveal usw.) sind transient und verschwinden wieder.
- Wiederverbindung nach Verbindungsabbruch/Neuladen der Seite (Sitzplatz & Rolle bleiben erhalten).
- Läuft komplett im Speicher – keine Datenbank nötig, ideal für einen Raspberry Pi.
- **Test-Bots** – hat man allein oder zu zweit/dritt Lust zu testen, füllt man den Raum in der Lobby per Klick mit Bots auf (mind. 5 Spieler nötig). Bots übernehmen automatisch Team-Vorschläge, Abstimmungen, das Ausspielen von Erfolg-/Fehlschlag-Karten und (falls aktiv) das Enttarnen des Kommandanten, jeweils mit kleiner, realistisch wirkender Verzögerung.
- **Plottkarten-Variante "Die Spannung steigt"** – der Host kann sie in der Lobby per Häkchen an- oder ausschalten (standardmäßig aktiviert). Details siehe eigener Abschnitt unten.
- **Kommandant-Variante** (Merlin-artig) – der Host kann sie separat in der Lobby an- oder ausschalten (standardmäßig aktiviert). Details siehe eigener Abschnitt unten.

## Plottkarten-Variante ("Die Spannung steigt")

Der Host entscheidet in der Lobby per Häkchen, ob diese Erweiterung mitgespielt wird (Standard: aktiviert), und kann zusätzlich jede der 9 Karten einzeln ab- oder anwählen (z. B. um nur "Meinungsmacher" rauszunehmen, aber den Rest zu behalten). Ist die Variante an, zieht der Server zu Beginn jeder Mission 1 Plottkarte (5–6 Spieler), 2 (7–8 Spieler) bzw. 3 Plottkarten (9–10 Spieler) aus einem gemischten Stapel der aktivierten Kartentypen. Der aktuelle Team-Chef verteilt sie offen an die anderen Spieler – wer was bekommt, wird kurz als Einblendung für alle sichtbar (verschwindet aber wieder, es gibt kein dauerhaftes Verlaufsprotokoll). Eigene, noch ungenutzte Karten liegen als Leiste am unteren Bildschirmrand, immer sichtbar, mit direkten Einsetzen-Buttons.

Es gibt drei Kartentypen:

- **Sofort-Effekt** (Abhörmaßnahme, Vertrauen bilden, Sich offenbaren): löst sich direkt bei Verteilung aus, die betroffene Person wählt sofort ein Ziel für den privaten Rolleneinblick.
- **Dauerhafter Effekt** (Meinungsmacher): die Person muss ab sofort bis Spielende bei jeder Abstimmung ihre Stimme zuerst offenlegen (im Spieler:innen-Panel als Marke sichtbar).
- **Gehaltene Karten** (Misstrauen, Überwachung, Führungsstärke, Im Fokus, Verantwortung übernehmen): landen im eigenen, privaten "Plottkarten"-Bereich neben der Spielerliste und können jederzeit im passenden Moment eingesetzt werden (Button dort aktiviert sich automatisch, sobald der Einsatz möglich ist).

**Anpassungen für die Online-Version** (das Regelwerk lässt hier bewusst Spielraum, z. B. weil es online keine feste Sitzordnung gibt):

- "Nachbar" bei der Abhörmaßnahme wurde durch "ein Spieler deiner Wahl" ersetzt.
- Die genaue Stückzahl je Kartentyp im Deck ist offiziell nicht dokumentiert; diese Version nutzt 2 Exemplare je der 9 Kartentypen (18 Karten gesamt), der Nachziehstapel wird bei Bedarf aus dem Ablagestapel neu gemischt.
- Bots verteilen Plottkarten zufällig, wenn sie Team-Chef sind, setzen ihre eigenen gehaltenen Karten aber nicht aktiv ein – das Ausprobieren dieser Karten bleibt den menschlichen Mitspieler:innen vorbehalten.

## Kommandant-Variante (Merlin-artig)

Der Host entscheidet in der Lobby per eigenem Häkchen, ob diese Variante mitgespielt wird (Standard: aktiviert), unabhängig von der Plottkarten-Variante.

Ist sie aktiv, wird beim Rollen-Austeilen zusätzlich zufällig **ein Mitglied des Widerstands** zum "Kommandanten" bestimmt. Der Kommandant sieht beim Rollen-Reveal – genau wie die Spione untereinander – alle Spione namentlich, bleibt selbst aber ganz normal Widerstand (spielt Missionskarten wie jede:r andere Widerstands-Spieler:in und muss verdeckt bleiben). Die Spione erfahren nicht, wer der Kommandant ist.

Schafft der Widerstand drei erfolgreiche Missionen, ist das Spiel noch nicht sofort vorbei: Die Spione bekommen einen letzten, einmaligen Versuch, den Kommandanten zu enttarnen. Jede:r verbundene Spion-Spieler:in kann (nachdem sich die Spione – außerhalb der App, z. B. mündlich – abgesprochen haben) auf eine:n Mitspieler:in tippen; der erste abgegebene Tipp entscheidet sofort:

- **Richtig geraten** → die Spione gewinnen doch noch.
- **Falsch geraten** → der Widerstand gewinnt, wie gehabt.

Bot-Spione raten in dieser Phase nach kurzer Verzögerung zufällig unter allen Nicht-Spionen. Am Ende zeigt die Rollenaufdeckung zusätzlich an, wer der Kommandant war.

## Projektstruktur

```
Widerstand/
├── server.js            Spiel-Server (Node.js, Express + Socket.IO)
├── package.json
├── Dockerfile           Container-Image für den Server
├── docker-compose.yml   Für den Betrieb auf dem Pi (siehe unten)
├── public/
│   ├── index.html         Oberfläche
│   ├── style.css          Design
│   └── client.js          Spiellogik im Browser
├── tests/               Automatisierte Integrationstests (siehe unten)
├── .github/workflows/   GitHub-Actions-CI, läuft bei jedem Push automatisch
└── README.md            Diese Anleitung
```

## Lokal testen (z. B. auf deinem Windows-PC)

Voraussetzung: [Node.js](https://nodejs.org) (Version 18 oder neuer empfohlen).

```bash
cd Widerstand
npm install
npm start
```

Danach im Browser öffnen: `http://localhost:3000`

Zum Testen mit mehreren "Spielern" einfach mehrere Browser-Tabs oder -Fenster öffnen.

## Automatisierte Tests

Unter `tests/` liegen ein paar Integrationstests, die den Server als echten
Prozess starten und über `socket.io-client` komplette Spiele mit Bots
durchspielen (Grundablauf, sowie Kommandant- und Plottkarten-Variante
zusammen). Sie prüfen vor allem, dass der Server dabei nicht abstürzt und am
Ende ein in sich stimmiges Ergebnis steht (z. B. dass ein korrekter
Kommandant-Tipp den Sieg auch wirklich umdreht).

```bash
npm install
npm test
```

Ein Testlauf spielt dabei echte, vollständige Partien durch - das dauert
insgesamt ein bis zwei Minuten. Bei jedem Push nach GitHub läuft das
automatisch über eine GitHub Action (`.github/workflows/ci.yml`) mit.

## Mit Freunden im selben WLAN spielen

1. Server wie oben starten (`npm start`).
2. Die lokale IP-Adresse deines Rechners herausfinden (Windows: `ipconfig`, unter "IPv4-Adresse", z. B. `192.168.1.42`).
3. Freunde im selben WLAN öffnen im Browser: `http://192.168.1.42:3000`
4. Eine Person erstellt einen Raum und teilt den 4-stelligen Raum-Code, alle anderen treten mit Namen + Code bei.

## Dauerhaft auf dem Raspberry Pi hosten – unter http://wd.oualid.de/

Läuft nach dem gleichen Docker-Muster wie deine anderen Projekte (FinanceAgent, Monitoring Shop): ein Container mit dem Node-Server, per Compose verwaltet, und dein bestehender Reverse Proxy auf dem Pi übernimmt das Routing der Domain.

Bereits belegte interne Ports auf dem Pi: `8080/8443` (FinanceAgent), `8090/8091` (Monitoring Shop). Widerstand nutzt deshalb **Port 8092**.

### 1. Projekt auf den Pi bringen

Wie bei den anderen Projekten – per `git push` auf dein Repo und auf dem Pi `git pull`, oder direkt per `scp`/USB-Stick den `Widerstand`-Ordner kopieren.

### 2. Container bauen und starten

```bash
cd Widerstand
docker compose up -d --build
```

Das war's – `docker-compose.yml` startet den Server und bindet ihn **nur lokal** an `127.0.0.1:8092` (also nicht direkt von außen erreichbar, nur über deinen Reverse Proxy). Ob der Container läuft, prüfst du mit:

```bash
docker compose ps
docker compose logs -f
```

Nach Code-Änderungen genügt erneut `docker compose up -d --build` (dein gewohntes `./deploy.sh`-Prinzip funktioniert hier genauso – ein `deploy.sh` mit `git pull && docker compose up -d --build` kannst du dir analog zu Monitoring Shop anlegen).

### 3. Reverse Proxy: wd.oualid.de → Port 8092

Trag bei deinem Reverse Proxy auf dem Pi einen neuen Eintrag für `wd.oualid.de` ein, der auf `127.0.0.1:8092` zeigt – **wichtig ist, dass WebSockets/Upgrade-Header durchgereicht werden**, sonst bricht die Live-Verbindung (Socket.IO) ab.

**Falls du klassisches nginx** (Server-Blocks) benutzt, z. B. als neue Datei `/etc/nginx/sites-available/wd.oualid.de.conf` (danach mit `sites-enabled` verlinken und `nginx -t && systemctl reload nginx`):

```nginx
server {
    listen 80;
    server_name wd.oualid.de;

    location / {
        proxy_pass http://127.0.0.1:8092;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Socket.IO braucht die Upgrade-Header, sonst bleibt die Verbindung
    # bei einem normalen HTTP-Request hängen statt auf WebSocket hochzustufen.
    location /socket.io/ {
        proxy_pass http://127.0.0.1:8092/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 90s;
    }
}
```

(Das ist exakt das gleiche Muster wie im `/socket.io/`-Block in `Monitoring Shop/frontend/nginx.conf` – dort hat es sich schon bewährt.)

**Falls du Nginx Proxy Manager (UI)** benutzt: neuen "Proxy Host" anlegen → Domain `wd.oualid.de`, Forward Hostname/IP `127.0.0.1` (bzw. die IP des Pi, falls NPM in einem eigenen Docker-Netzwerk läuft), Forward Port `8092`, Häkchen bei **"Websockets Support"** setzen. SSL-Zertifikat wie bei deinen anderen Domains direkt in NPM anfordern.

Willst du HTTPS (also `https://wd.oualid.de/`) statt nur HTTP: Zertifikat für `wd.oualid.de` genauso beantragen wie für deine bestehenden Subdomains (Certbot bei eigenem nginx, bzw. NPM-eigene Let's-Encrypt-Funktion).

### 4. DNS-Eintrag

Bei deinem DNS-Anbieter für `oualid.de` einen neuen **A-Eintrag** `wd` anlegen, der auf dieselbe IP zeigt wie deine anderen Subdomains (also die öffentliche IP, die dein Router bei Port 80/443 an den Pi weiterleitet).

Danach ist das Spiel für alle unter **http://wd.oualid.de/** erreichbar.

### Ohne Docker (Alternative)

Falls du es doch ohne Container laufen lassen willst: Node.js direkt installieren (`curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -` gefolgt von `sudo apt-get install -y nodejs`), dann `npm install` und dauerhaft im Hintergrund z. B. mit [pm2](https://pm2.keymetrics.io/) (`pm2 start server.js --name widerstand`, `pm2 save`, `pm2 startup`). Port dabei über `PORT=8092 npm start` bzw. in der pm2-Konfiguration setzen, der Reverse-Proxy-Teil oben bleibt identisch.

### Sicherheitshinweis

Es gibt aktuell keinen Zugriffsschutz (kein Passwort) – wer die URL und einen Raum-Code kennt, kann beitreten. Für ein privates Spiel im Freundeskreis meist unkritisch, aber gut zu wissen, bevor der Link weiter verbreitet wird.

## Spielablauf in der Web-Version

1. **Raum erstellen** (ein Spieler) → Raum-Code an alle anderen weitergeben.
2. Alle **treten mit Namen bei** (5–10 Spieler nötig).
3. Host klickt **"Spiel starten"** → Rollen werden automatisch verteilt, jede:r sieht privat seine Rolle; Spione sehen zusätzlich die anderen Spione, der Kommandant (falls aktiv) ebenfalls.
4. Der/die Team-Chef:in wählt reihum ein Team für die aktuelle Mission, alle stimmen geheim ab.
5. Bei Annahme spielt das Team geheim Erfolg/Fehlschlag-Karten; Spione dürfen "Fehlschlag" wählen, der Widerstand ist immer auf "Erfolg" festgelegt.
6. Nach 3 verlorenen Missionen oder 5 abgelehnten Team-Vorschlägen in Folge gewinnen die Spione sofort. Nach 3 gewonnenen Missionen bekommen die Spione (falls die Kommandant-Variante aktiv ist) noch einen letzten Rate-Versuch, den Kommandanten zu enttarnen – erst danach endet die Runde und alle Rollen werden aufgedeckt.
7. Der Host kann direkt eine neue Runde mit denselben Spielern starten.

Viel Spaß beim Spielen – und Vorsicht, wem ihr vertraut. 🕵️
