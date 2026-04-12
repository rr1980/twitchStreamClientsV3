---
name: project-quality-pipeline
description: 'Führt die vollständige Qualitätsprüfung für dieses Angular-Repo aus: Tests, Test-Coverage, Lint, API-Dokumentation und anschließend Production-Build. Verwenden bei Projektcheck, Merge-Vorbereitung, Release-Check, CI-Nachstellung oder wenn Fehler notfalls behoben und die Pipeline erneut validiert werden sollen.'
argument-hint: 'Optional: Fokus oder Abweichungen nennen, z. B. nur blockierende Fehler beheben, Coverage-Gate streng prüfen oder nach einem Fix die komplette Pipeline erneut laufen lassen.'
user-invocable: true
---

# Project Quality Pipeline

## Wann verwenden

- Wenn das Projekt vor Merge, Review oder Release vollständig geprüft werden soll.
- Wenn dieselbe lokale Reihenfolge wie in einer Qualitäts-Pipeline reproduziert werden soll.
- Wenn nach Änderungen klar belegt werden soll, ob Tests, Coverage, Lint, Doku-Erzeugung und Build erfolgreich sind.
- Wenn fehlgeschlagene Qualitätschecks notfalls direkt repariert und erneut geprüft werden sollen.

Typische Trigger:

- Projekt testen, Coverage prüfen und bauen
- vollständiger Projektcheck
- Release-Check
- CI lokal nachstellen
- vor Übergabe validieren

## Ablauf

1. Im Repository-Stamm arbeiten und zuerst den gewünschten Umfang bestätigen.
2. Tests ausführen mit npm test.
3. Wenn Tests fehlschlagen und der Nutzer einen Reparaturauftrag impliziert, die Ursache beheben und die Tests erneut ausführen.
4. Coverage-Gate ausführen mit npm run test:coverage:ci.
5. Wenn Coverage fehlschlägt und ein Fix im Rahmen der Aufgabe liegt, die betroffenen Tests oder Implementierungen anpassen und Coverage erneut prüfen.
6. Lint ausführen mit npm run lint.
7. Wenn Lint fehlschlägt und ein Fix im Rahmen der Aufgabe liegt, die Verstöße beheben und Lint erneut ausführen.
8. API-Dokumentation erzeugen mit npm run docs:api.
9. Production-Build ausführen mit npm run build.
10. Ergebnisse knapp zusammenfassen: erfolgreich, fehlgeschlagen, relevante Fehlermeldungen, erzeugte Artefakte.

## Entscheidungslogik

- Wenn ein Schritt fehlschlägt, den Fehler zuerst präzise berichten und keine Folge-Schritte stillschweigend als erfolgreich annehmen.
- Wenn der Nutzer einen Reparaturauftrag impliziert, die Ursache beheben und den fehlgeschlagenen Schritt erneut ausführen, bevor die Pipeline fortgesetzt wird.
- Wenn Tests fehlschlagen, zuerst funktionale Korrektheit herstellen; Coverage erst danach bewerten.
- Wenn nur Coverage am Threshold scheitert, gezielt fehlende Testfälle ergänzen statt unverbundene Implementierungen umzubauen.
- Wenn Coverage wegen Branch-, Statement- oder Function-Threshold scheitert, die betroffenen Dateien und Schwellen explizit nennen.
- Wenn nur ein Teilbereich gefragt ist, nicht unnötig die ganze Pipeline laufen lassen.
- Wenn Doku erwähnt wird, in diesem Repo standardmäßig Compodoc über npm run docs:api verwenden.
- Wenn ein Fehler nach einem Fix weiterhin besteht, den Nutzer nicht mit verdeckten Wiederholungen blockieren, sondern den aktuellen Stand und die nächste sinnvolle Reparaturrichtung berichten.

## Qualitätskriterien

- Tests laufen ohne Fehler durch.
- Das Coverage-Gate läuft ohne Fehler durch.
- Lint meldet keine Verstöße.
- Dokumentation wird erfolgreich nach documentation/compodoc erzeugt.
- Der Production-Build läuft erfolgreich durch.
- Die Abschlussmeldung nennt klar, welcher Schritt bestanden oder fehlgeschlagen ist und ob Fixes vorgenommen wurden.

## Repo-spezifische Hinweise

- Dieses Repo nutzt Angular 21, Vitest über ng test und ESLint über ng lint.
- Für Coverage-Prüfungen gibt es npm run test:coverage:ci mit den Thresholds 97 Prozent Statements, 93.5 Prozent Branches und 94.5 Prozent Functions.
- Die API-Dokumentation wird in documentation/compodoc geschrieben.
- Der Build-Befehl ist auf die Production-Konfiguration festgelegt.
- Einzelne Spec-Läufe sollten in diesem Repo über den Angular-Include-Filter angestoßen werden, nicht über rohe Vitest-CLI-Flags.

## Abschluss

- Bei vollem Erfolg kurz bestätigen, dass Tests, Coverage, Lint, Doku und Build erfolgreich waren.
- Bei Fehlern den ersten blockierenden Schritt, die relevante Ursache, bereits versuchte Fixes und die sinnvolle nächste Reparaturrichtung nennen.
