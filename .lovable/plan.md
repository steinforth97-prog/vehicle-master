## Ziel

Wohnmobil-Fotos automatisch vor den Firmeneingang („Autohaus am Ring") setzen. Das Fahrzeug wird freigestellt, proportionsgetreu auf den festen Hintergrund komponiert, der Hintergrund bei Bedarf aufgehellt.

## Ablauf für dich (User)

1. In den **Einstellungen** lädst du den Firmenhintergrund einmalig hoch (das Foto vom Eingang).
2. In der **Foto-Galerie** eines Wohnmobils klickst du bei einem Bild auf **„Mit Firmenhintergrund"**.
3. Eine Vorschau öffnet sich (Original ↔ Komposition).
4. Optional: Schieberegler **Hintergrund-Helligkeit** (−20 % … +40 %).
5. Mit **Übernehmen** wird das Ergebnis als neues Foto in der Galerie gespeichert (Original bleibt erhalten).

## Was die KI macht

- Erkennt das Wohnmobil im Foto und stellt es sauber frei (inkl. Räder, Schatten unter den Reifen).
- Setzt es **proportionsgetreu** vor den Firmeneingang — keine Verzerrung, Seitenverhältnis bleibt erhalten.
- Platzierung: zentriert auf dem gepflasterten Vorplatz, Fahrzeug-Grundlinie auf der Pflasterfläche, Größe an Gebäudehöhe angepasst.
- Beleuchtung & Schattenwurf werden an den sonnigen Hintergrund angeglichen.
- Hintergrund-Helligkeit/-Kontrast wird je nach Slider-Wert leicht angehoben.

## Qualitätskontrolle

Nach jedem Composite läuft ein zweiter KI-Check: stimmen Proportionen (Höhe Fahrzeug vs. Gebäude), keine Verzerrung, keine doppelten Räder, Fahrzeug steht auf dem Boden? Bei Auffälligkeit erscheint eine Warnung mit „Erneut generieren"-Button.

## Technische Umsetzung

- **Neuer Storage-Eintrag**: `company_settings.background_image_url` (+ `storage_path`). Upload-UI in `src/routes/einstellungen.tsx` (Bucket `company-assets`).
- **Neue Edge Function** `composite-vehicle-bg`:
  - Input: `vehicleImageBase64`, `backgroundImageBase64`, `brightness` (−20…40).
  - Modell: `google/gemini-2.5-flash-image` über Lovable AI Gateway (gleicher Pfad wie `edit-vehicle-image`).
  - Prompt erzwingt: nur Fahrzeug aus Bild 1 übernehmen, exakt platzieren auf Bild 2, Originalproportionen, kein Stretching, Schatten realistisch, Hintergrund mit Helligkeitsanpassung.
  - Zweiter Call mit Validierungs-Prompt → JSON `{ ok, issues[] }`.
- **Neue UI-Komponente** `BackgroundCompositeDialog.tsx` (verwendet bestehendes `PhotoEditor`-Muster):
  - Zwei-Spalten-Vorschau Original/Ergebnis
  - Slider Helligkeit
  - Buttons: Erneut generieren · Übernehmen (speichert als neue Zeile in `motorhome_images`) · Abbrechen
- **Einstieg**: zusätzlicher Action-Button in `MotorhomeGallery.tsx` (neben Edit/Download/Star).
- Gleicher Flow optional auch in `VehicleGallery.tsx` aktivierbar (1 Toggle in Einstellungen).

## Offene Punkte

- Soll dieselbe Funktion auch für **Autos** (PKW-Galerie) verfügbar sein, oder erstmal nur Wohnmobile?
- Soll es **mehrere Hintergründe** geben (z. B. Eingang + Hofansicht), zwischen denen du je Foto wählst?