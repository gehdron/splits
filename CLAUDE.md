# Splits

Project guide for Claude, Cursor and teammates. Read this before writing code or design. Items marked **[confirm]** are decisions the team has not locked yet; ask before assuming.

## 1. Product

**Splits** splits a shared bill by what each person actually ordered, then sends each person a link to pay their own share. Friends do not install an app and do not need an account.

**Core flow (the MVP, in this order):**
1. **Scan and itemize.** A photo of a receipt (or a past bank charge) becomes a list of items with quantity, price, tax and tip.
2. **Claim and assign.** Friends claim items, or the organizer assigns them. Shared plates split evenly between the people who claimed them. Per-person totals update automatically.
3. **Pay by link.** Each person gets a link to a mobile checkout. Apple Pay on supported devices, card everywhere else. Links are sent by message (Photon).

**AI layer (Grok API):**
- Reminders written in a chosen tone (friendly, funny, firm) that mention what the person ordered.
- Voice reminders sent with the payment link (Grok Voice).
- Recap card image once the bill is settled (Grok Imagine).
- "Why do I owe this?" explanation of a person's total.
- Stretch: dispute helper, project supply-list planner.

**Out of scope for the hackathon:** price comparison and web scraping, advanced shopping-list features, any financial advice features, real money movement.

### Hackathon context
- Draft submission Saturday 10 p.m. (locks plan and scope). Final submission Sunday 10 a.m.
- Deliverables: working live link, repository with README and setup steps, 3-minute edited video.
- Video must show: receipt scan, item assignment, link dispatch, checkout (simulated), and the AI reminder.
- Judging (Visa rubric): functionality, design, creativity, track applicability.
- Target sponsor tracks (pick up to three, document the fit for each): Visa, Grok (Imagine or Voice), Photon. SideShift is optional. **[confirm]**

### Team and workflow
- Vincent: proposal and design doc, frontend, mobile UI/UX, slide deck.
- Camera extraction and AI image/receipt integration: second teammate.
- Backend and stack: Gordon. Fourth teammate pending.
- Shared GitHub repo. Each person works in separate files or modules to avoid conflicts. Push to main with agreed conventions. Tasks live in a shared Google Sheet.
- Domain: usesplits.com. Preview deploys on Vercel for phone testing.

## 2. Engineering rules

- **Web app, mobile first.** Responsive website with mobile-friendly checkout pages. TypeScript frontend. Framework **[confirm: Next.js]**.
- **Money math is code, not AI.** Totals, tax and tip allocation, and per-person amounts are computed deterministically. After parsing a receipt, verify the items sum to the total and flag mismatches. The model may explain a number but never produces it.
- **Receipt parsing** uses vision to return structured JSON (item, quantity, price, tax, tip). Validate the JSON shape before using it. Show low-confidence lines to the user for confirmation.
- **Payments are simulated (demo-safe mode).** No real charges and no real transactions. Use hosted checkout in test mode (Stripe or equivalent). Apple Pay appears on supported mobile browsers through the hosted checkout. Never handle raw card numbers in our code.
- **Secrets** (Grok key, payment keys, Photon keys) live in environment variables, never in the client bundle or the repo.
- **Messaging** through Photon dispatches claim and payment links to iMessage, SMS or email.
- Keep AI output friendly and non-judgmental. Reminders never shame or threaten.
- Prefer small, separate modules: receipt vision, assignment logic, checkout, messaging, AI copy. Keep interfaces typed.
- Before merging: run on a real phone, check the full flow end to end, and confirm the README matches reality.

## 3. Website (marketing site)

The "Daylight" concept is the chosen direction. Source designs live in the **Splits Website** canvas: https://claude.ai/artifact/MVMmNNHo5yhAF1EDV1h8z2

**Pages**
- **Home.** Hero with headline "No more chasing friends for $14.", statement section with scroll highlights, Apple Pay section with an Apple Pay | Card toggle, sticky "how it works" story, six feature tabs, use cases, FAQ (5 questions), closing section (text-thread CTA plus oversized "Splits" wordmark footer).
- **Payment complete.** Shown to a friend after they pay their share. Deliberately simple: logo halves close together, "You're all paid up.", one line about the payment, one quiet link to try Splits.
- **404.** Diagonally split "404" in green and purple, plain explanation, ways back.

**Decisions already made**
- No contact page, no thank-you page for sign-ups, no early-access waitlist. The primary call to action is **Try Splits**, linking to the live app **[confirm app URL; currently https://app.example.com]**.
- Contact is by email only **[confirm address; currently hello@example.com]**, with the promise "We reply within 2 business days."
- Conversion items: CTA above the fold, sticky mobile CTA bar, floating contact button (opens email).
- On hold: team photo, real reviews. Skipped: maps, last-updated date, breadcrumbs.
- Not built yet: privacy policy and terms pages. Footer links are placeholders.
- Product visuals (app screens, step images, feature visuals) are **placeholders** until real screenshots exist.

## 4. Design reference

### 4.1 Principles
- **Persuade mode.** The page exists to get someone to try the app. Earn attention, then action.
- **The split is the identity.** A square cut diagonally into two pieces with a gap. Use it as structure (seams, edges, clipped corners, converging halves), not as decoration.
- **One authored moment per page.** Everything else stays quiet. Do not animate every section.
- **Plain language, specific, calm.** No hype.

### 4.2 Logo
- Mark: two triangles with a gap between them (concept 2, "diagonal split tile").
  - Top-left piece: `polygon 10,10 48,10 10,48`. Bottom-right piece: `polygon 56,16 56,56 16,56`. Fill and stroke the same color, `stroke-width 6`, `stroke-linejoin round` (gives soft corners).
  - Centered viewBox: `3 3 60 60`.
- Wordmark: "Splits" in Outfit 600, letter-spacing -0.02em. Always set in Outfit, even if the page body uses another face.
- Logo kit (`splits-logo.zip`): mark, wordmark, horizontal and stacked lockups, app icon and favicon, each in `on-dark`, `on-light`, `white`, `ink`. Use `on-dark` on #0B1020 and `on-light` on light backgrounds. Do not redraw the mark.
- Keep clear space of at least half the mark's height. Do not stretch, rotate, outline or recolor outside the palette.

### 4.3 Color
Brand colors stay **green and purple**. Neutrals carry everything else.

| Role | Light surfaces | Dark surfaces |
| --- | --- | --- |
| Ink (text, primary buttons) | `#0B1020` | `#FFFFFF` text on `#0B1020` |
| Secondary text | `#454F75` (body), `#2A3354` (lead) | `#C9CFE6` |
| Paper (page background) | `#F4F6FB` | `#0B1020` |
| Surface | `#FFFFFF` | `#121A36` |
| Hairlines | `#D3D9EA` | `#232D52` |
| Green (brand) | `#0FB67F` | `#2EF2A6` |
| Purple (brand, action, focus) | `#6C4DFF` | `#8B7BFF` |
| Pale green | `#D6F6E7`, `#E4F8EF` | |
| Pale purple | `#E7E2FF`, `#ECE8FF` | |
| Highlight marker | `#7FF0C4`, `#CFC5FF` | |

- Use the bright mint `#2EF2A6` only on dark or inside the dark app-icon tile; on light backgrounds use `#0FB67F`.
- Purple `#6C4DFF` is the one action and focus color. Do not spend it on decoration.
- Secondary text is tinted toward the ink hue, never neutral gray. Contrast: body 4.5:1, large text 3:1, controls and focus 3:1.
- No gradient washes, glow, or gradient text. Flat fills.

### 4.4 Typography
- **Display and wordmark:** Outfit, 500 to 600. **Body and UI:** Manrope, 400, 500, 700. One role per face.
- Display sizes `clamp(40px, 5.6vw, 96px)`, never above 6rem. Line-height about 1. Letter-spacing -0.04em at display sizes (do not go tighter). Use `text-wrap: balance` on headings.
- Body 17 to 20px, line-height 1.6 to 1.65, measure 65 characters or less.
- Hierarchy comes from size, weight and space, not from color or labels.
- Money and receipt-like data use tabular numerals (`font-variant-numeric: tabular-nums`).
- Typographic apostrophes and quotes in copy (don't, "like this").

### 4.5 Layout and shape
- Content width 1240px max, 40px side padding (24px on mobile). Section padding 96 to 128px, less on mobile.
- Separate with hairlines and space, not boxed cards. Never nest cards.
- Radii: buttons and inputs 12px, panels 24 to 28px, pills 999px, placeholder blocks 8 to 24px.
- Alignment: left-align text blocks; center only focused moments (payment complete, 404, closing headline).
- Responsive down to phone width. Grids collapse to one column at 900px.

### 4.6 Components
- **Primary button:** ink background, white text, 50 to 56px tall. On hover a purple fill rises from the bottom (`transform` only). `:active` scales to 0.98.
- **Secondary action:** text link with a 2px green underline.
- **Inputs:** 54px tall, 1.5px border `#B9C1DA`, radius 12px, always with a visible or screen-reader label. Focus: 3px purple outline, 3px offset.
- **Segmented control (Apple Pay | Card):** real `<button>` elements with `aria-pressed`, pale-purple track, white active segment.
- **Tabs and accordions:** sliding 3px purple indicator for tabs; FAQ opens with `grid-template-rows` 0fr to 1fr and a plus that rotates to minus.
- **Text-thread CTA:** chat panel with incoming bubbles (light gray-blue) and one outgoing purple bubble, the action button acts as the reply.
- **Receipt motif** (404 and footer concepts only): zigzag edges, dashed rules, dotted leaders, tabular numbers.
- **Floating contact button:** bottom right, ink pill, opens email. **Sticky mobile CTA:** full-width bar, phones only, fades in after about 300px of scroll.
- Icons: drawn inline SVG, one stroke weight (2px, round caps). No emoji, no icon-tile stacks above headings.

### 4.7 Motion
- Easing: `cubic-bezier(0.16, 1, 0.3, 1)` for arrivals. No bounce or elastic.
- Durations: 150 to 300ms feedback, 400 to 600ms transitions, up to about 1.1s for the one authored entrance.
- Signature moves: headline lines rise through a mask; the two logo halves slide together (payment complete); the "Splits" wordmark splits apart when the email field is focused (retired with the waitlist, keep as a pattern); panels redistribute like shares.
- Scroll-driven effects use `animation-timeline: view()` inside `@supports`, with a visible static fallback. Content is visible by default.
- Animate `transform`, `opacity`, `clip-path`. Avoid layout properties (except grid-track techniques).
- Every animation has a `prefers-reduced-motion` path.

### 4.8 Copy
- Plain, sentence case, active voice. Buttons name what happens: **Try Splits**.
- Headline for home: "No more chasing friends for $14." Closing line: "Ready when the check arrives."
- Apple Pay wording: "Apple Pay on supported devices. Card everywhere else."
- Promise: "We reply within 2 business days."
- Placeholders are explicit: `[Friend name]`, `[your email address]`, `$--.--`. Never invent statistics, testimonials or prices.
- Avoid: em dashes, three-beat slogans, buzzwords (seamless, effortless, unlock, game-changing), exclamation marks.
- Errors name the problem and the way out ("We can't find that page. The link may be old or mistyped.").
- Footer always carries: "Payments are simulated in this demo. Apple Pay is a trademark of Apple Inc."

### 4.9 Apple Pay
- Until launch, write "Apple Pay" as plain text and show the choice as an **Apple Pay | Card** toggle.
- Do not draw or approximate the Apple logo or button. Use Apple's official Apple Pay mark and button from Apple's design resources and follow their guidelines before launch.
- Always say "on supported devices".

### 4.10 Accessibility floor
- Contrast as above. Visible keyboard focus on every control. Touch targets at least 44px.
- Real `<button>`, `<a>`, `<input>` with `<label>`. Decorative SVG is `aria-hidden`.
- Text selection and focus rings use palette colors (selection is mint with ink text).
- Respect reduced motion and browser zoom.

### 4.11 Avoid (generic look to refuse)
Dot-grid or glow backgrounds, spotlight halos, gradient text, glass or blur as decoration, same-size card rows of icon plus heading plus text, kickers or eyebrow labels above headings, section numbers unless the content is a real sequence (the three steps are), hard offset shadows, marquees, pulsing dots, blinking cursors, bounce easing, Inter or Roboto, a second typeface without a job, shapes standing in for photos.

## 5. Reference files
- Website designs: https://claude.ai/artifact/MVMmNNHo5yhAF1EDV1h8z2 (Home, Payment complete, 404).
- Explorations, not in use: five Daylight layouts, five footer options, five 404 concepts, five landing concepts (earlier canvases).
- Logo kit: `splits-logo.zip` (SVG and PNG, with a README of colors and usage).
- Meeting notes and plan: "Hackathon Plan, Scope, and Timeline".

## 6. When in doubt
- Ask before changing the brand colors, the logo, or the cut list.
- Prefer the simplest thing that makes the demo flow work end to end.
- If a design choice is not covered here, follow section 4.1 and keep it quiet.

## 7. Repository layout (website)

The marketing site is static HTML, CSS and vanilla JavaScript in this folder. See `README.md` for running and deploying.

- `index.html` (home), `payment-complete.html`, `404.html`
- `css/home.css`, `css/payment-complete.css`, `css/404.css` (each page's styles are scoped under a root class: `.p2` home, `.pt` payment complete, `.pn` 404)
- `js/home.js` (hero effect, Apple Pay | Card toggle, feature tabs, FAQ), `js/payment-complete.js` (fills the page from URL parameters)
- `assets/` favicon, apple-touch icon, logo SVGs

When editing: keep the design tokens in section 4 (they are CSS variables on the root class), keep content visible without JavaScript or scroll-driven animation support, and keep every animation behind `prefers-reduced-motion`. The sticky nav relies on the page root using `overflow-x: clip`, not `overflow: hidden`.
