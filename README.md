# Sneaky Clean Static Website

Static GitHub Pages website for Sneaky Clean, a premium mobile detailing company in Murfreesboro, Tennessee.

## Project Structure

```text
index.html
assets/
  css/
    styles.css
  js/
    main.js
    booking.js
  images/
    sneaky-clean-mascot.png
    og-image.jpg
    work/
CNAME
worker.js
wrangler.jsonc
```

## Run Locally

From the repo root:

```bash
npm run dev
```

Open:

```text
http://localhost:8787
```

You can also open `index.html` directly in a browser, but the local server is closer to GitHub Pages behavior.

## Deploy With GitHub Pages

1. Push this repo to GitHub.
2. In GitHub, go to **Settings > Pages**.
3. Set **Source** to `Deploy from a branch`.
4. Select the production branch, usually `main`.
5. Set the folder to `/ (root)`.
6. Save.

The `CNAME` file points GitHub Pages to:

```text
www.sneakycleantn.com
```

In DNS, point `www.sneakycleantn.com` to GitHub Pages according to GitHub's current Pages instructions.

## Update Images

Put site images in:

```text
assets/images/
```

Completed vehicle photos live in:

```text
assets/images/work/
```

Update image references in `index.html`. The Open Graph preview image is:

```text
assets/images/og-image.jpg
```

For downloaded customer/job photos, place the originals in any local folder and run:

```bash
npm run images:prepare -- /path/to/downloaded/photos job-or-vehicle-name
```

Prepared images are written to:

```text
assets/images/seo/job-or-vehicle-name/
```

The helper supports HEIC, HEIF, JPG, JPEG, and PNG files. It skips video files; export stills from edited video first if you want to use them on the website.

## Update Service / Package Copy

Most page copy lives in:

```text
index.html
```

The package cards are in the `#packages` section.

SEO landing page copy lives in:

```text
content/seo-pages.json
```

After changing that file, regenerate the static pages and sitemap:

```bash
npm run site:generate
```

Current generated pages:

- `mobile-detailing-murfreesboro/`
- `ceramic-coating-murfreesboro/`
- `motorcycle-detailing-murfreesboro/`
- `interior-detailing-murfreesboro/`

The generated pages reuse the same booking modal, tracking scripts, styles, and GitHub Pages-friendly relative links as the homepage.

## Update Booking Service Variation IDs

Booking service IDs live in:

```text
assets/js/booking.js
```

Look for the `SERVICES` object. Keep the Cloudflare Worker URL as:

```text
https://sneaky-clean-booking.drew-martin331.workers.dev
```

## Analytics And Ads

Google Analytics is configured in `index.html` with:

```text
G-8ZBE3LNX5E
```

Google Ads conversion placeholders live in:

```text
assets/js/main.js
```

When you have the real `AW-...` conversion ID and labels, update:

```js
GOOGLE_ADS_CONVERSION_ID
GOOGLE_ADS_CALL_LABEL
GOOGLE_ADS_BOOKING_LABEL
```

Then uncomment/add the matching `gtag('config', 'AW-...')` line in `index.html`.

## Worker

The Cloudflare Worker in `worker.js` handles Square availability and booking requests.

If you update `wrangler.jsonc`, redeploy the Worker:

```bash
CLOUDFLARE_API_TOKEN="$(tr -d '\n\r ' < .cf-token)" npm run deploy:worker
```

## Sneaky Clean Growth System

Square should remain the source of truth for customers, bookings, service history, customer groups, and message history. The scripts in this repo only audit Square data and produce lightweight CSV/Markdown reports for retention work.

### What Square Handles

- Customer profiles and contact info.
- Bookings created by the website booking worker.
- Completed service/payment history through Square Orders.
- Customer groups for retention and service labels.
- Square Messages, email exports, or manual texting for follow-ups.

### What Scripts Handle

Growth scripts live in:

```text
scripts/square/
```

Reusable business files live in:

```text
growth/customer-groups.json
growth/message-templates.md
growth/memberships.csv
```

Generated customer exports and reports are ignored by git:

```text
growth/reports/
growth/exports/
```

### Square Access

The scripts read the Square token from either:

```bash
SQUARE_ACCESS_TOKEN="..."
```

or the local ignored token file created by:

```bash
./save-sq-token.sh
```

The default location comes from `wrangler.jsonc`. To audit multiple locations, run:

```bash
SQUARE_LOCATION_IDS="LOCATION_1,LOCATION_2" npm run square:audit
```

Token permissions needed:

- `CUSTOMERS_READ` for customer audits and group reads.
- `CUSTOMERS_WRITE` for creating customer groups and applying suggested groups.
- `ORDERS_READ` for service history, total visits, and total spend.

Square API references:

- Customers API: https://developer.squareup.com/reference/square/customers-api
- Customer Groups API: https://developer.squareup.com/reference/square/customer-groups-api
- Search Orders: https://developer.squareup.com/reference/square/orders-api/SearchOrders

### Customer Groups

The group system is defined in:

```text
growth/customer-groups.json
```

Current groups:

- Maintenance Member
- Recurring (existing Square group; treated as a monthly maintenance member)
- Ceramic Customer
- Paint Correction
- Motorcycle
- Reset Detail
- Refresh Detail
- Referral
- Membership Prospect
- Follow Up In 90 Days
- Needs Follow-Up
- 90+ Days Since Service

Create any missing Square customer groups:

```bash
npm run square:setup-groups
```

This uses Square's Customer Groups API where possible and writes the group ID map to:

```text
growth/exports/square-group-map.json
```

Manual Square Dashboard setup if needed:

1. Open Square Dashboard.
2. Go to **Customers > Directory**.
3. Open **Groups**.
4. Create the group names listed above exactly.
5. Use the customer audit or retention report to add customers to the right groups.

Square customer groups are best used as business labels. Date-based groups like `90+ Days Since Service` should be refreshed from the weekly retention report.

If a customer is in Square's existing `Recurring` group, the scripts treat them as a monthly maintenance member and will not include them in membership-offer lists.

### Customer Audit

Run:

```bash
npm run square:audit
```

Output:

```text
growth/reports/customer-audit-YYYY-MM-DD.csv
```

Columns include:

- Customer name
- Email
- Phone
- Last service date
- Total visits
- Total spend when Square Orders include totals
- Services purchased when Square Orders include line items
- Assigned groups
- Suggested groups
- Days since last service
- Suggested follow-up action

### Retention Report

Run weekly:

```bash
npm run square:retention
```

Outputs:

```text
growth/reports/retention-report-YYYY-MM-DD.md
growth/reports/follow-up-actions-YYYY-MM-DD.csv
```

The report highlights:

- Customers inactive 60+ days.
- Customers inactive 90+ days.
- Customers who should be offered monthly maintenance.
- Ceramic customers due for a maintenance/check-in.
- Repeat customers who have not joined membership.
- Customers missing phone or email.

### Updating Customer Groups

The audit CSV includes a `suggested_groups` column. Preview group assignments:

```bash
npm run square:apply-groups
```

Apply suggested group assignments to Square:

```bash
npm run square:apply-groups -- --apply
```

This only adds suggested groups. It does not remove old groups, because removals should be reviewed manually.

### Membership Tracking

Track active monthly members in:

```text
growth/memberships.csv
```

Membership offer:

```text
One detail per month. Customer can alternate between two vehicles.
```

Columns:

- Member name
- Email
- Phone
- Vehicle 1
- Vehicle 2
- Last serviced vehicle
- Last service date
- Next eligible service date
- Status
- Notes

Generate a simple membership due report:

```bash
npm run square:membership
```

### Follow-Up Messages

Templates live in:

```text
growth/message-templates.md
```

Recommended workflow:

1. Run `npm run square:retention`.
2. Open `growth/reports/follow-up-actions-YYYY-MM-DD.csv`.
3. Send the matching message through Square Messages, email, or manual text.
4. Add/remove `Needs Follow-Up` in Square after action is taken.
5. Add `Referral`, `Maintenance Member`, or service-specific groups when the customer converts.

### Website Tracking

The GitHub Pages site currently tracks:

- Phone link clicks as `click_call_now`.
- Quote CTA clicks as `click_quote_cta`.
- Booking/package CTA clicks as `click_booking_cta`.
- Booking request submissions as `booking_request_submitted`.

GA4 is configured in `index.html`. Google Ads conversion placeholders live in `assets/js/main.js` and should be filled in when the real Ads conversion ID and labels are available.
