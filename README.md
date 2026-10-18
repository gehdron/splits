# Splits Receipt Scanner

The app uses your camera to capture a receipt and Tesseract.js to extract its
printed text in the browser.

## Run locally

```bash
npm install
npm run dev
```

Open the live app at [https://www.splits.select](https://www.splits.select) and allow camera access.
The camera guide follows the device orientation, and captured photos are
rotated to match it when the camera stream uses the opposite orientation. Use
**Switch camera** to change cameras. For better live recognition, place the
receipt inside the on-screen guide, fill as much of it as possible, keep it
flat, hold the camera steady, and use bright even lighting. The live scanner
focuses on the guided area, enlarges it, and boosts image contrast before OCR.
After you select **Take photo**, the full original photo remains visible and
OCR starts automatically. It prepares a higher-resolution, contrast-enhanced
image and shows recognized word boxes over the photo. OCR first uses a small
internal preview to estimate the text's horizontal bounds, then may crop the
image internally for a higher-resolution pass; the crop preserves the full
image height. AI parsing starts automatically after text extraction completes.
Camera access is available on the live HTTPS site. For local development,
`npm run dev` serves the app at `http://localhost:3001`.

OCR extracts and displays the recognized text and word boxes. Gemini
automatically organizes the receipt into editable item and total fields after
extraction. Review results against the original because OCR and AI can make
mistakes.

For optional AI parsing, create `.env.local` in the project root and add:

```env
GEMINI_API_KEY=your_gemini_api_key
```

Restart the development server and take a receipt photo. The app sends the
frozen photo and extracted text to Gemini 3.8 Flash after OCR completes. You can
also use **Upload receipt image or PDF** instead of the camera. Image uploads
start OCR and AI parsing automatically; PDFs are parsed directly after upload
using a binary upload to avoid base64 request-size overhead. PDF files must be
4 MB or smaller; image files can be up to 8 MB.
The scanner shows extraction, AI parsing, and review progress; if AI parsing
fails, it displays the error and a retry option. Files must be 8 MB or smaller.
AI parsing requires a Gemini API key and may incur API charges depending on
your account and usage. OCR extraction and raw text remain available without
an API key.

From the dashboard, choose **New list → Scan a receipt** to open the dedicated
camera and upload screen. After reviewing the parsed items and totals, save the
receipt to a named group list from the receipt review. Item assignment and the
AI split chat are available on the list page.

On `/list`, enter a name before creating a list. During receipt uploads, Gemini
can suggest a name; suggestions are shown separately and never replace your
typed name unless you choose **Use suggestion**. Receipt item names appear as
live suggestions in the split chat; press **Tab** or choose a suggestion to
correct a partial or mistyped item name. Assign an item to multiple people from
its assignee menu; its price is split evenly, and tax and tip are allocated
proportionally. Subtotal, tax, tip, and total appear below the item list, and
scanned receipt totals are checked against the item amounts. The AI split chat
can assign an item to multiple people. The list owner can delete a list; unpaid
payment links are expired first, while completed payments remain recorded.

If you already use the production file-backed shared-list tables in Supabase,
re-run `supabase/shared-lists.sql` to add the receipt-total columns used by the
list page.

## Routes

| Route | What it is |
| --- | --- |
| `/` | Marketing site home (`app/(site)/page.tsx`) |
| `/pay/sh_…` | A friend's pay link. Opens Stripe Checkout |
| `/payment-complete` | Shown after a friend pays (`?share=sh_…`). The older `?friend=Maya&event=Dinner&amount=24.50&method=Apple%20Pay` form still works |
| `/api/stripe/webhook` | Stripe webhook. Marks shares paid |
| `/dashboard/item-by-item` | Receipt scanner, opened from "Split this charge" |
| `/account` | Account, payouts (Stripe Connect) and bank (Plaid) |
| `/scan` | Receipt scanner (moved from `/`) |
| `/dashboard/item-by-item` | Dedicated receipt camera and upload screen (requires sign-in) |
| `/list` | Shared list with manual and chat-based item assignment |
| any other URL | 404 page (`app/global-not-found.tsx`) |

The marketing pages live in `app/(site)` with their own layout and CSS, separate from the scanner's Tailwind layout in `app/(app)`.
