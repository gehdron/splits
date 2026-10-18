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
After you select **Freeze frame**, the full original photo remains visible.
Select **Extract text** to prepare a higher-resolution, contrast-enhanced OCR
image and show recognized word boxes over the photo. OCR first uses a small
internal preview to estimate the text's horizontal bounds, then may crop the
image internally for a higher-resolution pass; the crop preserves the full
image height. AI parsing starts automatically after text extraction completes.
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

Restart the development server, freeze a receipt, and select **Extract text**.
The app sends the frozen photo and extracted text to Gemini 3.8 Flash after OCR
completes. You can also use **Upload receipt image or PDF** instead of the
camera. Select **Extract text** after uploading a JPEG, PNG, or WebP image to
run OCR and start automatic AI parsing; PDFs are parsed directly after upload
using a binary upload to avoid base64 request-size overhead. PDF files must be
4 MB or smaller; image files can be up to 8 MB.
The scanner shows extraction, AI parsing, and review progress; if AI parsing
fails, it displays the error and a retry option. Files must be 8 MB or smaller.
AI parsing requires a Gemini API key and may incur API charges depending on
your account and usage. OCR extraction and raw text remain available without
an API key.

After AI parsing, open **Assign items manually** to add users and select them
on each receipt item, or open **Split items with chat** to assign items with
natural-language instructions. Both controls stay in sync, and each person's
item shares, tax, tip, and total update in the receipt review.
Shared items are split equally; parsed tax is allocated proportionally to each
person's share of the item amounts.
While typing split instructions, item-name suggestions are based on the
AI-parsed receipt items and can be toggled on or off. Matching names appear as
inline completions; press **Tab** to replace the current word with the
suggested receipt item.
Open **Tip options** to split the receipt tip proportionally, set a custom tip
amount for each person, or leave the tip out of split totals. Any unassigned
items keep their associated tax and tip under **Unassigned** until they are
assigned.
After editing the receipt subtotal, tax, or tip, the displayed receipt total
updates automatically as their sum.

From the dashboard, choose **New list → Scan a receipt** to open the dedicated
camera and upload screen. After reviewing the parsed items, choose **Continue
to split chat** to return the receipt items and totals to `/detect`, where the
chat and manual assignment controls are available.

On `/list`, choose **Split with chat** to assign general list items with
natural-language instructions, or keep using the per-item controls. Each list
item has one assignee; chat assignments are saved through the same controls
and update the list totals.

Dashboard shared lists also have an **AI bot** panel for chat-based item
assignments. It uses the group members as the available assignees and is
available to group owners.

## Routes

| Route | What it is |
| --- | --- |
| `/` | Marketing site home (`app/(site)/page.tsx`) |
| `/payment-complete` | Shown after a friend pays. Fill it with `?friend=Maya&event=Dinner&amount=24.50&method=Apple%20Pay` |
| `/scan` | Receipt scanner (moved from `/`) |
| `/dashboard/item-by-item` | Dedicated receipt camera and upload screen (requires sign-in) |
| `/detect` | Receipt review, manual assignment, and split chat |
| `/list` | Shared list with manual and chat-based item assignment |
| any other URL | 404 page (`app/global-not-found.tsx`) |

The marketing pages live in `app/(site)` with their own layout and CSS, separate from the scanner's Tailwind layout in `app/(app)`.
