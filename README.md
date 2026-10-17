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

## Routes

| Route | What it is |
| --- | --- |
| `/` | Marketing site home (`app/(site)/page.tsx`) |
| `/payment-complete` | Shown after a friend pays. Fill it with `?friend=Maya&event=Dinner&amount=24.50&method=Apple%20Pay` |
| `/scan` | Receipt scanner (moved from `/`) |
| `/list` | Shared list |
| any other URL | 404 page (`app/global-not-found.tsx`) |

The marketing pages live in `app/(site)` with their own layout and CSS, separate from the scanner's Tailwind layout in `app/(app)`.
