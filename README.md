# Bhowmick Agency Distributor System

A role-separated distributor system with a desktop Master Web for the owner and a mobile PWA for staff.

## Workflow

Staff: search store → add products and quantities → optionally adjust that order's rate per kg and enter a line discount percentage → submit → record payment as QR/UPI, cash, cheque, or lend. Staff can also record a payment without creating an order from the Payments page. The consolidated packing summary converts packet counts to kilograms using each product's configured packet weight; order, invoice, and stock quantities remain in their normal sellable units.

Submitting an order records the bill in the customer's account ledger. When the same customer orders again, the payment step requires collection of at least 20% of the outstanding balance recorded before that new order. Any unpaid amount stays on the account; the owner can review the customer's balance and bill/payment history on the Payments page. For QR payments, staff must first hear the SBI soundbox confirmation and then confirm it in the app. The app does not currently receive automatic payment notifications from SBI.

Bill totals and received payment amounts are rounded to the nearest whole rupee (50 paise rounds up). Invoices show the bill's rounding adjustment separately. The 20% minimum collection is rounded up to the next whole rupee so it never falls below 20%.

Every product's master selling rate is entered in rupees per kilogram. Products can be sold loose by weight (fractional kg quantities) or as fixed-weight packets (whole packet quantities). For packet products, enter the weight of one packet in grams; the app derives the per-packet rate from the per-kg rate. For example, ₹90/kg means a 500 g packet costs ₹45 and a 200 g packet costs ₹18. Create separate product entries for distinct packet sizes when they need separate stock counts.

Stock is tracked in kg for loose products and whole packets for packet products. Product edits never change stock; use the owner's Stock page to make a logged stock adjustment. A product's selling mode cannot be changed while it has stock. When a supplier bill explicitly states total weight or packet count, Gemini can suggest a quantity in the product's sellable unit; the owner must review the extracted values before stock is changed.

Owner: reviews submitted orders → approves/generates invoice → selects invoices → prints 2 copies → prints a consolidated packing summary.

Supplier stock: upload hard-copy supplier bill → Google Gemini reads it and suggests product matches → owner corrects/reviews → owner confirms → stock is updated transactionally. Supplier purchase costs are captured from the bill, never guessed from the selling rate; missing costs must be entered during review.

Rates/GST/discounts: the owner maintains the product's master ₹/kg rate and GST. Staff devices refresh from the server automatically. Staff rate-per-kg edits and line discounts apply only to that order and never overwrite the master price. Discounts are percentages from 0% to 100%, applied to the line before GST; the server calculates and saves the corresponding sell-unit price and tax.

## Tax/reporting

The app stores customer taxpayer/non-taxpayer status and provides a three-sheet monthly outward-supplies working workbook plus an inward-supplies/purchase workbook. These are working exports, not a claim of direct GST filing compliance; tax treatment and filing format should be checked against current GST requirements and the business accountant.

## Setup

1. Install PostgreSQL and create a database.
2. Copy `server/.env.example` to `.env` and fill in values.
3. From `server`: `npm install`, then `npm run migrate`, then `npm run dev`.
4. From `client`: `npm install`, then `npm run dev`.
5. Set a unique, randomly generated `SETUP_SECRET` in `server/.env`, then open `/setup-owner` locally and enter that same value once. The example value in `.env.example` is only a placeholder; replace it before use.
6. The owner creates staff accounts from the Staff page.

Local `.env` settings are not committed or deployed. In particular, the local `SETUP_SECRET` is different from the one used by the web version. Never put real secrets in GitHub or share them in chat.

Set `GOOGLE_GEMINI_API_KEY` in `server/.env` to enable supplier-bill scanning. The default vision model is the lighter `gemini-3.5-flash-lite`; override it with `GEMINI_VISION_MODEL` if needed. Gemini API access does not require a Gemini Pro subscription, but the free API tier has usage limits. The Gemini API key is server-side only. Do not commit `.env` files or API keys.

## Deploy on Render

The repository includes a Render Blueprint that creates a PostgreSQL database and a single web service that builds and serves both the frontend and backend. It also generates the authentication secrets and runs database migrations automatically.

In Render, choose **New → Blueprint**, connect this GitHub repository, and deploy the Blueprint. No environment variables need to be entered manually. After the deploy succeeds, open the service URL and go to `/setup-owner`; enter the `SETUP_SECRET` shown in that same Render web service's Environment settings. Do not use the local `.env` value or the placeholder in `.env.example` for the web version. If the secret needs to be changed, update `SETUP_SECRET` in Render's Environment settings and wait for the service to redeploy before trying again. Do not commit the actual value to GitHub.

The Blueprint selects Render's free PostgreSQL plan. Free databases are temporary and can expire; use a paid database plan for business data you need to keep. The database created in Render is separate from the local development database and starts empty.

Invoice scanning is disabled on Render until you add `GOOGLE_GEMINI_API_KEY` to the web service's Environment settings. The API key is optional and should not be added to the Blueprint file or GitHub.
