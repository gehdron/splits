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
Select **Extract text** to run OCR again and review or edit the result; AI
parsing runs automatically after extraction completes.
Camera access requires a secure context: use `localhost` for local development
and HTTPS when accessing the app from another device.

OCR extracts and displays the recognized text and word boxes. Gemini
automatically organizes the receipt into editable item and total fields after
extraction. Review results against the original because OCR and AI can make
mistakes.

For optional AI parsing, create `.env.local` in the project root and add:

```env
GEMINI_API_KEY=your_gemini_api_key
```

Restart the development server and freeze a receipt. The app sends the frozen
photo and extracted text to Gemini 3.8 Flash automatically. You can also use
**Upload receipt image or PDF** instead of the camera. JPEG, PNG, and WebP
images go through OCR before automatic AI parsing; PDFs are parsed directly.
Files must be 8 MB or smaller. AI parsing requires a Gemini API key and may
incur API charges depending on your account and usage. OCR extraction and raw
text remain available without an API key.

After AI parsing, select **Split items with chat** to assign receipt items
using natural-language instructions. Shared items are split equally; parsed
tax is allocated proportionally to each person's share of the item amounts.
Open **Tip options** to split the receipt tip proportionally, set a custom tip
amount for each person, or leave the tip out of split totals. Any unassigned
items keep their associated tax and tip under **Unassigned** until they are
assigned.
After editing the receipt subtotal, tax, or tip, the displayed receipt total
updates automatically as their sum.
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
