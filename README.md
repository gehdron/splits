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

After AI parsing, open **Assign items yourself** to add people and select them
on each receipt item. Each person's item shares, tax, tip, and total update in
the receipt review.
Shared items are split equally; parsed tax is allocated proportionally to each
person's share of the item amounts.
Open **Tip options** to split the receipt tip proportionally, set a custom tip
amount for each person, or leave the tip out of split totals. Any unassigned
items keep their associated tax and tip under **Unassigned** until they are
assigned.
After editing the receipt subtotal, tax, or tip, the displayed receipt total
updates automatically as their sum.
The scanner currently performs OCR and displays editable text; it does not yet
identify structured fields such as the merchant, line items, or total.

## Pay links (live Stripe)

Friends pay their share at `https://splits.select/pay/sh_…`, which opens Stripe
Checkout (card everywhere, Apple Pay on supported devices). Payments are live,
so keep demo amounts at $1 to $5 and refund them afterwards. Links are capped at
`SPLITS_MAX_SHARE_CENTS` (default 500, so $5) and Stripe's $0.50 minimum.

1. Run `supabase/payments.sql` once in the Supabase SQL editor (after `schema.sql`).
2. Set these in `.env.local` and in Vercel. Only `NEXT_PUBLIC_*` values reach the browser.

```env
NEXT_PUBLIC_APP_URL=https://splits.select
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...          # server only: the webhook and /pay have no signed-in user
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...        # endpoint https://splits.select/api/stripe/webhook, event checkout.session.completed
PHOTON_API_KEY=...                     # same values photon/agent.ts uses
PHOTON_PROJECT_ID=pho_prj_...
PHOTON_PLATFORM=imessage               # or email
PHOTON_AGENT_HANDLE=...
PLAID_CLIENT_ID=...                    # optional: organizer bank linking
PLAID_SECRET=...
PLAID_ENV=sandbox
SPLITS_MAX_SHARE_CENTS=500             # optional
```

How it works: on a list, **Request** next to someone who owes you creates their
link (the amount is worked out on the server from the list) and texts it with
Photon, or copies it. Stripe's webhook marks the share paid, and the list shows
it. Organizers set up payouts on `/account`: Stripe Connect Express onboarding,
then optionally a bank through Plaid. With a payout account, each payment is a
destination charge that goes to the organizer. Plaid's sandbox only works with
Stripe's test mode, so attaching a bank to a live account needs `PLAID_ENV=production`.

Without Supabase on your machine, shares are kept in `data/store.json` so you can
try the flow locally. That fallback never runs on Vercel.

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
| `/list` | Shared list |
| any other URL | 404 page (`app/global-not-found.tsx`) |

The marketing pages live in `app/(site)` with their own layout and CSS, separate from the scanner's Tailwind layout in `app/(app)`.
