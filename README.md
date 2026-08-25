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

### Sort Downloaded Photos

After downloading a Drive folder, launch the local photo sorter:

```bash
npm run images:sort -- /path/to/downloaded/job-folder
```

Open:

```text
http://localhost:8791
```

By default, sorted copies go into:

```text
/path/to/downloaded/job-folder/_sneaky-sorted/
```

You can choose a separate output folder:

```bash
npm run images:sort -- /path/to/downloaded/job-folder /path/to/sorted-output
```

The sorter creates folders for:

- Site Favorites
- Before
- After
- Interior
- Exterior
- Ceramic
- Motorcycle
- Needs Edit
- Archive

Use the number keys `1` through `9` to toggle the selected file into those folders. Arrow keys move between files. Originals are copied into the sorted folders, not moved or deleted. The sorter also writes:

```text
sort-manifest.csv
```

inside the output folder.

### Import A Drive Folder Through Codex

Codex can access Google Drive through the connected Drive app. The local sorter cannot directly inherit those Google credentials, so Drive imports use a manifest that Codex creates from the folder listing and raw file fetches.

Import a manifest without opening the sorter:

```bash
npm run images:import-drive -- growth/private/drive-imports/sneaky-pics.json imports/sneaky-pics
```

Import a manifest and immediately open the sorter:

```bash
npm run images:sort -- growth/private/drive-imports/sneaky-pics.json
```

To choose where the raw imported files land:

```bash
npm run images:sort -- growth/private/drive-imports/sneaky-pics.json --import-dir=imports/sneaky-pics
```

Raw imported files are intentionally ignored by git:

```text
imports/
```

The importer supports manifest entries with either `b64_string` or `download_url`. It writes a `drive-import-manifest.csv` into the import folder so you can trace local files back to Drive IDs.

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

## Apartment Pop-Up System

The pop-up flow keeps Square as the customer source of truth while preventing residents from booking random dates before a property event is approved.

Public pages:

- Resident request: `https://www.sneakycleantn.com/pop-up/`
- Property manager inquiry: `https://www.sneakycleantn.com/host-a-pop-up/`
- Printable resident QR card: `https://www.sneakycleantn.com/pop-up/qr-card.html`

The resident QR files live in:

```text
assets/images/pop-up/resident-pop-up-qr.png
assets/images/pop-up/resident-pop-up-qr.svg
```

Regenerate them with:

```bash
npm run site:popup-qr
```

### What Square Handles

- Resident and property-manager contact profiles.
- Apartment community, unit, vehicle, availability, upgrade interest and consent fields.
- `Apartment Pop-Up Interest` and `Apartment Property Manager` customer groups.
- The hidden `Resident Pop-Up — $60 Express Clean (Template)` appointment service.
- Confirmed event appointments and payments after the event is approved.

The template is fixed at $60 and 45 minutes. It stays unavailable for online booking until a real community event is confirmed. Upgrade interest is captured without prices; do not publish upgrades until pricing is decided.

### What The Scripts Handle

Initialize or audit the Square configuration without changing anything:

```bash
npm run square:setup-popup -- --dry-run
```

Apply missing groups, fields and the hidden template:

```bash
npm run square:setup-popup
```

Generate the community threshold report:

```bash
npm run square:popup-report
```

Reports are written to `growth/reports/` as Markdown and CSV. A community is flagged when it has two or more resident profiles in the interest group. The report recommends outreach but never confirms an event automatically.

After Drew approves a community and service window, preview a community-specific hidden service:

```bash
npm run square:create-popup-event -- --community "Community Name"
```

Create it only after approval:

```bash
npm run square:create-popup-event -- --community "Community Name" --apply
```

### Manual Square Steps For A Confirmed Event

1. Open the newly created community service in **Square Dashboard > Appointments > Services**.
2. Assign the lead tech or appropriate bookable team member.
3. Keep the service private until the property date and arrival window are confirmed.
4. Configure the confirmed event availability and optional 5-minute buffer.
5. Set payment to pay at service initially.
6. Set the cancellation cutoff to either 12 or 24 hours.
7. Enable online booking only for the confirmed event, then disable it when the event closes.
8. Send the confirmed booking link to residents from that community's report.

Team-member service assignment, cancellation settings, event-specific availability, resident messaging and final event approval remain manual Square Dashboard steps. The API does not turn a two-resident threshold into an approved event.

### Form And Customer Fields

Resident requests require name, mobile phone, email, apartment community, unit/building, vehicle year/make/model/color, general availability, the fixed $60 service, upgrade interest and SMS consent. Vehicle-condition notes are optional.

Property inquiries require community and manager details, property address, estimated vehicle count, preferred dates/window, setup area and on-site permission. Property notes are optional.

The Worker endpoints are:

```text
POST /popup/resident
POST /popup/manager
```

Each successful request creates or updates a Square customer, assigns the appropriate group and writes the pop-up custom fields. A repeat submission from the same customer updates that customer's current pop-up fields; it does not create a separate historical form record.

### GitHub Form Architecture

The GitHub Pages forms are the permanent public intake experience. Do not recreate or redirect them through Square Online. Both forms submit to the Cloudflare Worker, which creates or updates the Square customer, assigns the correct pop-up group, and stores the full intake as Square customer custom attributes.

Square customer records created through the Customers API do not generate Square Messages notifications. Owner email or SMS alerts are a separate notification concern and must not replace or shorten the GitHub forms. The permanent resident QR continues pointing to `https://www.sneakycleantn.com/pop-up/`.

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
growth/private/memberships.csv
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
growth/private/memberships.csv
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

### Reactivation Text Campaign

Generate a prioritized texting call sheet with a ready-to-send draft per customer:

```bash
npm run square:text-campaign
```

Outputs:

```text
growth/reports/text-campaign-YYYY-MM-DD.md
growth/reports/text-campaign-YYYY-MM-DD.csv
```

The Markdown file is the working list, ordered by expected response rate
(membership closes, then 60-90 day, 30-60 day, 90-180 day, 180+ day, and
never-booked leads). The CSV has a `status` column for tracking sent /
replied / booked. The script automatically excludes monthly members,
customers with upcoming bookings, anyone serviced in the last 30 days,
and internal records. Update `HANDLED_NAMES` and `HOLD_NOTES` in
`scripts/square/text-campaign.mjs` as situations change. Send the texts
manually through Square Messages; the script never sends anything.

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
