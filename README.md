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

## Update Service / Package Copy

Most page copy lives in:

```text
index.html
```

The package cards are in the `#packages` section.

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
