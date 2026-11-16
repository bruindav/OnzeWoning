# Onze Woning
<!-- README — fix-1 -->

Huishandleiding als web-app: per ruimte de apparaten en installaties, met
- **Zo werkt het**: korte stappen in eenvoudige taal, met een foto per stap
- **Onderhoud**: wat moet er gebeuren, hoe vaak, wanneer het laatst gedaan is, met geschiedenis
- **Papieren**: handleidingen, facturen en offertes als link of als foto
- **Techniek**: merk, type, serienummer, garantie, installateur
- **Noodkaart**: wat te doen bij lekkage, stroomuitval of gaslucht, en wie je belt
- **Zoeken** in alles

Werkt op telefoon en computer, ook zonder internet (lezen). Foto's worden in de browser verkleind en in de database opgeslagen, dus je hebt geen Firebase Storage of Blaze-abonnement nodig.

## Eerst proberen
Open de app zonder Firebase-koppeling en kies **Bekijk met voorbeeldgegevens**. Alles blijft dan op dat apparaat.

## Koppelen aan Firebase (eenmalig)
1. Maak in de [Firebase-console](https://console.firebase.google.com) een nieuw project, bijv. `onzewoning`. Google Analytics is niet nodig.
2. **Authentication** > Aan de slag > zet **Google** en **E-mail/wachtwoord** aan.
   Ga daarna naar Settings > **Authorized domains** en voeg `bruindav.github.io` toe.
3. **Firestore Database** > Database maken > locatie `europe-west4` (Nederland) > productiemodus.
4. Firestore > **Regels**: plak de inhoud van `firestore.rules` en klik op Publiceren.
5. Projectinstellingen > Algemeen > **Jouw apps** > web-app toevoegen (`</>`). Kopieer de `firebaseConfig` naar `config.js`.
6. Open de app en log in. Je ziet dan "nog geen toegang" met jouw **gebruikers-ID**.
7. Firestore > Gegevens > collectie **`leden`** starten > document-ID = jouw gebruikers-ID > veld `naam` (tekst) = je naam.
   Doe hetzelfde voor je partner nadat die één keer heeft ingelogd.
8. Klik in de app op **Opnieuw proberen**.

## Bestanden
| Bestand | Wat |
|---|---|
| `index.html` | De pagina |
| `app.js` | Alle schermen en logica |
| `app.css` | Opmaak |
| `firebase.js` | Inloggen en database |
| `config.js` | Jouw Firebase-gegevens |
| `firestore.rules` | Beveiliging: alleen leden mogen lezen en schrijven |
| `sw.js`, `manifest.webmanifest`, `icon*` | Installeren als app en offline werken |

## Volgende fase
- Gasten uitnodigen met een link en code die tot een einddatum geldt, plus een gastenstart met wifi-QR
- "Als ik er niet ben"-overzicht
- Export naar agenda (.ics)
