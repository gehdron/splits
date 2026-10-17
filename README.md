# Splits Receipt Scanner

The app uses your camera to capture a receipt and Tesseract.js to extract its
printed text in the browser.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3001](http://localhost:3001) and allow camera access.
Use **Switch camera** to change cameras. For better live recognition, place the
receipt inside the on-screen guide, fill as much of it as possible, keep it
flat, hold the camera steady, and use bright even lighting. The live scanner
focuses on the guided area, enlarges it, and boosts image contrast before OCR.
After you select **Freeze frame**, the app prepares a higher-resolution,
contrast-enhanced OCR image and shows the word boxes over the original; select
**Extract text** to run OCR again and review or edit the result.
Camera access requires a secure context: use `localhost` for local development
and HTTPS when accessing the app from another device.

The scanner currently performs OCR and displays editable text; it does not yet
identify structured fields such as the merchant, line items, or total.
