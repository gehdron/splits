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
contrast-enhanced OCR image and shows the word boxes over the original. OCR
first uses a small internal preview to estimate the text's horizontal bounds,
then may crop the image internally for a higher-resolution pass; the full
original photo remains visible, and the crop preserves the full image height.
Select **Extract text** to run OCR again and review or edit the result.
Camera access requires a secure context: use `localhost` for local development
and HTTPS when accessing the app from another device.

OCR extracts and displays the recognized text and word boxes. It does not
organize the text into items or totals on its own. Select **Parse with AI** to
organize OCR text into editable item and total fields; review results against
the original because OCR and AI can make mistakes.

For optional AI parsing, create `.env.local` in the project root and add:

```env
GEMINI_API_KEY=your_gemini_api_key
```

Restart the development server, freeze a receipt, and select
**Parse photo with AI**. The app sends both the frozen receipt photo and
extracted text to Gemini 3.8 Flash; the photo is sent only when you select this
button and must be 8 MB or smaller. AI parsing requires a Gemini API key and
may incur API charges depending on your account and usage. OCR extraction and
the raw text remain available without an API key.
