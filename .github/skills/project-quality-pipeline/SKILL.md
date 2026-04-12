---
name: project-quality-pipeline
description: 'Führt die vollständige Qualitätsprüfung für dieses Angular-Repo aus: Tests, Test-Coverage, Lint, API-Dokumentation, Production-Build und optional einen Git-Release von develop nach master mit Versionsbump und Tag. Verwenden bei Projektcheck, Merge-Vorbereitung, Release-Check, CI-Nachstellung oder wenn Fehler notfalls behoben und die Pipeline erneut validiert werden sollen.'
argument-hint: 'Optional: Fokus oder Abweichungen nennen, z. B. nur blockierende Fehler beheben, Coverage-Gate streng prüfen oder zusätzlich den Git-Release von develop nach master mit Versionsbump und Tag durchführen.'
user-invocable: true
---

# Project Quality Pipeline

## Wann verwenden

- Wenn das Projekt vor Merge, Review oder Release vollständig geprüft werden soll.
- Wenn dieselbe lokale Reihenfolge wie in einer Qualitäts-Pipeline reproduziert werden soll.
- Wenn nach Änderungen klar belegt werden soll, ob Tests, Coverage, Lint, Doku-Erzeugung und Build erfolgreich sind.
- Wenn fehlgeschlagene Qualitätschecks notfalls direkt repariert und erneut geprüft werden sollen.
- Wenn nach erfolgreicher Validierung develop kontrolliert auf master releast werden soll.
- Wenn für den Release zusätzlich package.json und package-lock.json versioniert sowie ein Git-Tag gesetzt werden sollen.

Typische Trigger:

- Projekt testen, Coverage prüfen und bauen
- Projekt testen, Coverage prüfen, bauen und releasen
- Release mit Versionsbump und Tag vorbereiten
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
10. Wenn ein Git-Release verlangt ist, zuerst einen sauberen Worktree und synchronisierte Remotes sicherstellen.
11. Falls während der Reparaturphase Codeänderungen entstanden sind, diese sauber auf develop committen und nach origin/develop pushen, bevor master angefasst wird.
12. Vor dem Release die Zielversion festlegen. Wenn weder exakte SemVer noch Bump-Typ wie patch, minor oder major genannt ist, diese Information einholen statt zu raten.
13. package.json und package-lock.json konsistent auf die Zielversion anheben und die Versionsänderung auf develop committen.
14. develop mit origin/develop und master mit origin/master per Fast-Forward synchronisieren.
15. develop nach master mergen, in der Regel mit einem expliziten Merge-Commit, damit der Release nachvollziehbar bleibt.
16. Auf master einen annotierten Tag für die Release-Version erzeugen.
17. Den Merge nach origin/master pushen und den Tag nach origin übertragen.
18. Ergebnisse knapp zusammenfassen: erfolgreich, fehlgeschlagen, relevante Fehlermeldungen, erzeugte Artefakte, Zielversion, Commit-, Merge- und Tag-Stand.

## Entscheidungslogik

- Wenn ein Schritt fehlschlägt, den Fehler zuerst präzise berichten und keine Folge-Schritte stillschweigend als erfolgreich annehmen.
- Wenn der Nutzer einen Reparaturauftrag impliziert, die Ursache beheben und den fehlgeschlagenen Schritt erneut ausführen, bevor die Pipeline fortgesetzt wird.
- Wenn Tests fehlschlagen, zuerst funktionale Korrektheit herstellen; Coverage erst danach bewerten.
- Wenn nur Coverage am Threshold scheitert, gezielt fehlende Testfälle ergänzen statt unverbundene Implementierungen umzubauen.
- Wenn Coverage wegen Branch-, Statement- oder Function-Threshold scheitert, die betroffenen Dateien und Schwellen explizit nennen.
- Wenn nur ein Teilbereich gefragt ist, nicht unnötig die ganze Pipeline laufen lassen.
- Wenn Doku erwähnt wird, in diesem Repo standardmäßig Compodoc über npm run docs:api verwenden.
- Wenn ein Release verlangt ist, nur releasen, wenn Tests, Coverage, Lint, Doku und Build erfolgreich abgeschlossen sind.
- Vor einem Release immer prüfen, dass keine ungeplanten lokalen Änderungen offen sind.
- Wenn ein Release mit Versionsbump verlangt ist, niemals eine Versionsnummer erfinden. Ohne explizite Zielversion oder klaren Bump-Typ erst nachfragen oder den Schritt als offen markieren.
- Wenn package.json geändert wird, package-lock.json auf dieselbe Version mitziehen.
- Wenn develop oder master lokal hinter origin zurückliegen, zuerst fast-forward aktualisieren statt mit veraltetem Stand zu mergen.
- Wenn ein Merge-Konflikt entsteht, nicht stillschweigend weiterlaufen, sondern Konfliktstellen und nächsten sinnvollen Lösungsschritt berichten.
- Wenn kein expliziter Tag- oder Versionswunsch genannt ist, keinen Versionsbump, kein Tag und kein GitHub-Release erfinden.
- Wenn das Tag-Schema nicht genannt ist, standardmäßig ein nachvollziehbares SemVer-Tag wie vX.Y.Z verwenden und diese Annahme benennen.
- Wenn ein Fehler nach einem Fix weiterhin besteht, den Nutzer nicht mit verdeckten Wiederholungen blockieren, sondern den aktuellen Stand und die nächste sinnvolle Reparaturrichtung berichten.

## Qualitätskriterien

- Tests laufen ohne Fehler durch.
- Das Coverage-Gate läuft ohne Fehler durch.
- Lint meldet keine Verstöße.
- Dokumentation wird erfolgreich nach documentation/compodoc erzeugt.
- Der Production-Build läuft erfolgreich durch.
- Ein optionaler Release hebt die Version konsistent an, merged den validierten Stand von develop nachvollziehbar nach master, setzt einen annotierten Tag und pusht Branch und Tag zum Remote.
- Die Abschlussmeldung nennt klar, welcher Schritt bestanden oder fehlgeschlagen ist und ob Fixes vorgenommen wurden.

## Repo-spezifische Hinweise

- Dieses Repo nutzt Angular 21, Vitest über ng test und ESLint über ng lint.
- Für Coverage-Prüfungen gibt es npm run test:coverage:ci mit den Thresholds 97 Prozent Statements, 93.5 Prozent Branches und 94.5 Prozent Functions.
- Die API-Dokumentation wird in documentation/compodoc geschrieben.
- Der Build-Befehl ist auf die Production-Konfiguration festgelegt.
- Einzelne Spec-Läufe sollten in diesem Repo über den Angular-Include-Filter angestoßen werden, nicht über rohe Vitest-CLI-Flags.
- Das aktuelle Branch-Modell verwendet develop und master; origin zeigt auf master.
- Für den Release dieses Repos ist develop die Integrationsbasis und master der Ziel-Branch für den veröffentlichbaren Stand.
- package.json und package-lock.json sind beide im Repo vorhanden und müssen bei einem Versionsbump synchron bleiben.
- Die aktuelle Paketversion steht in package.json; Release-Tags sollten zu dieser SemVer passen.

## Git-Release-Checkliste

- git status muss sauber sein, bevor master geändert wird.
- git fetch origin vor Branch-Synchronisation ausführen.
- Zielversion oder Bump-Typ vor dem Versionsschritt eindeutig festlegen.
- package.json und package-lock.json gemeinsam aktualisieren und den Versionscommit noch auf develop erstellen.
- develop und master jeweils mit pull --ff-only oder äquivalentem Fast-Forward auf den Remote-Stand bringen.
- Falls lokale Fixes aus der Pipeline entstanden sind: auf develop committen und erst danach mergen.
- Merge develop nach master bewusst und nachvollziehbar durchführen.
- Annotierten Tag für die Release-Version erstellen.
- Branch und Tag pushen.
- Nach dem Push verifizieren, dass origin/master und der Remote-Tag den erwarteten Stand enthalten.

## Abschluss

- Bei vollem Erfolg kurz bestätigen, dass Tests, Coverage, Lint, Doku und Build erfolgreich waren und ob zusätzlich develop nach master releast, die Version angehoben und ein Tag erstellt wurde.
- Bei Fehlern den ersten blockierenden Schritt, die relevante Ursache, bereits versuchte Fixes und die sinnvolle nächste Reparaturrichtung nennen.
