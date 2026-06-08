import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const BASE_URL = "https://www.sneakycleantn.com";
const PHONE_DISPLAY = "615-481-0464";
const PHONE_HREF = "tel:+16154810464";
const GA4_ID = "G-8ZBE3LNX5E";
const TODAY = new Date().toISOString().slice(0, 10);

const contentPath = path.join(ROOT, "content", "seo-pages.json");
const pages = JSON.parse(await fs.readFile(contentPath, "utf8"));

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function jsonForHtml(value) {
  return JSON.stringify(value, null, 2).replaceAll("<", "\\u003c");
}

function prefixedAsset(src) {
  if (/^https?:\/\//.test(src)) return src;
  return `../${src.replace(/^\/+/, "")}`;
}

function absoluteAsset(src) {
  if (/^https?:\/\//.test(src)) return src;
  return `${BASE_URL}/${src.replace(/^\/+/, "")}`;
}

function hrefForPage(href) {
  if (!href) return "#";
  if (/^(https?:|tel:|mailto:|#)/.test(href)) return href;
  return href;
}

function bookingModal() {
  return `
  <div class="booking-modal" id="booking-modal" role="dialog" aria-modal="true" aria-labelledby="booking-title">
    <div class="booking-modal__panel">
      <button class="booking-modal__close" id="booking-close" aria-label="Close">&times;</button>
      <h2 id="booking-title">Book Service</h2>
      <p class="booking-modal__sub" id="booking-subtitle"></p>

      <div id="tier-wrap">
        <label for="tier">Vehicle Size</label>
        <select id="tier"></select>
      </div>

      <label for="date">Pick a Date</label>
      <input type="date" id="date">

      <label>Available Times</label>
      <div class="slots" id="slots"><div class="empty">Choose a date to see times</div></div>

      <label for="name">Your Name</label>
      <input type="text" id="name" autocomplete="name">

      <label for="email">Email</label>
      <input type="email" id="email" autocomplete="email">

      <label for="phone">Phone</label>
      <input type="tel" id="phone" autocomplete="tel">

      <label for="notes">Vehicle + Address</label>
      <textarea id="notes" placeholder="e.g. 2021 Toyota 4Runner - 123 Main St, Murfreesboro"></textarea>

      <div class="message" id="message"></div>
      <button class="submit" id="submit" disabled>Request Booking</button>
    </div>
  </div>`;
}

function localBusinessSchema(page) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": ["LocalBusiness", "AutomotiveBusiness"],
        "@id": `${BASE_URL}/#localbusiness`,
        name: "Sneaky Clean",
        url: `${BASE_URL}/`,
        image: `${BASE_URL}/assets/images/og-image.jpg`,
        logo: `${BASE_URL}/assets/images/sneaky-clean-mascot.png`,
        telephone: "+16154810464",
        priceRange: "$$",
        description:
          "Premium mobile auto detailing that comes to you in Murfreesboro, Smyrna, Nashville, and surrounding Middle Tennessee.",
        address: {
          "@type": "PostalAddress",
          addressLocality: "Murfreesboro",
          addressRegion: "TN",
          addressCountry: "US",
        },
        areaServed: [
          "Murfreesboro, TN",
          "Smyrna, TN",
          "Nashville, TN",
          "La Vergne, TN",
          "Eagleville, TN",
          "Christiana, TN",
          "Middle Tennessee",
        ],
        sameAs: ["https://www.google.com/search?q=Sneaky+Clean+LLC+Reviews"],
      },
      {
        "@type": "Service",
        "@id": `${BASE_URL}/${page.slug}/#service`,
        name: `${page.serviceName} in ${page.serviceArea}`,
        serviceType: page.serviceName,
        provider: {
          "@id": `${BASE_URL}/#localbusiness`,
        },
        areaServed: page.serviceArea,
        description: page.description,
        url: `${BASE_URL}/${page.slug}/`,
      },
      {
        "@type": "FAQPage",
        "@id": `${BASE_URL}/${page.slug}/#faq`,
        mainEntity: page.faqs.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: faq.answer,
          },
        })),
      },
    ],
  };
}

function pageHtml(page) {
  const canonical = `${BASE_URL}/${page.slug}/`;
  const ogImage = absoluteAsset(page.heroImage);
  const proofItems = page.proof.map((item) => `<li>${escapeHtml(item)}</li>`).join("\n              ");
  const sectionCards = page.sections
    .map(
      (section) => `
          <article class="seo-info-card">
            <h2>${escapeHtml(section.heading)}</h2>
            <p>${escapeHtml(section.body)}</p>
          </article>`,
    )
    .join("");
  const gallery = page.gallery
    .map(
      (item) => `
          <figure class="case-card">
            <img src="${escapeHtml(prefixedAsset(item.src))}" alt="${escapeHtml(item.alt)}">
            <figcaption>
              <span>The Evidence</span>
              <strong>${escapeHtml(item.caption)}</strong>
            </figcaption>
          </figure>`,
    )
    .join("");
  const faqs = page.faqs
    .map(
      (faq) => `
          <article>
            <h3>${escapeHtml(faq.question)}</h3>
            <p>${escapeHtml(faq.answer)}</p>
          </article>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(page.title)}</title>
  <meta name="description" content="${escapeHtml(page.description)}">
  <link rel="canonical" href="${canonical}">
  <meta property="og:site_name" content="Sneaky Clean">
  <meta property="og:title" content="${escapeHtml(page.title)}">
  <meta property="og:description" content="${escapeHtml(page.description)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${ogImage}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(page.title)}">
  <meta name="twitter:description" content="${escapeHtml(page.description)}">
  <meta name="twitter:image" content="${ogImage}">
  <link rel="preconnect" href="https://sneaky-clean-booking.drew-martin331.workers.dev">
  <link rel="stylesheet" href="../assets/css/styles.css">
  <script async src="https://www.googletagmanager.com/gtag/js?id=${GA4_ID}"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', '${GA4_ID}');
  </script>
  <script type="application/ld+json">${jsonForHtml(localBusinessSchema(page))}</script>
</head>
<body class="seo-page">
  <header class="site-header">
    <a class="brand" href="../" aria-label="Sneaky Clean home">
      <img src="../assets/images/sneaky-clean-mascot.png" alt="Sneaky Clean detective mascot">
      <span>Sneaky Clean</span>
    </a>
    <nav class="nav" aria-label="Primary navigation">
      <a href="../#reviews">Reviews</a>
      <a href="../#evidence">Evidence</a>
      <a href="../#packages">Packages</a>
      <a href="../#membership">Membership</a>
      <a class="nav__cta" href="${PHONE_HREF}">Call Now</a>
    </nav>
  </header>

  <main id="top">
    <section class="seo-hero">
      <div class="wrap seo-hero__grid">
        <div class="seo-hero__copy">
          <a class="breadcrumb" href="../">Sneaky Clean / ${escapeHtml(page.serviceArea)}</a>
          <p class="eyebrow">${escapeHtml(page.eyebrow)}</p>
          <h1>${escapeHtml(page.headline)}</h1>
          <p class="lead">${escapeHtml(page.lead)}</p>
          <div class="actions" aria-label="Primary actions">
            <a class="button" href="${PHONE_HREF}">${escapeHtml(page.primaryCta)}</a>
            <a class="button button--dark" href="${escapeHtml(hrefForPage(page.secondaryHref))}">${escapeHtml(page.secondaryCta)}</a>
          </div>
          <ul class="trust-list">
            <li>★★★★★ 5.0 Google Rating</li>
            <li>We come to you</li>
            <li>Local Middle Tennessee business</li>
          </ul>
        </div>

        <div class="seo-hero__media" aria-label="${escapeHtml(page.caseText)}">
          <img src="${escapeHtml(prefixedAsset(page.heroImage))}" alt="${escapeHtml(page.heroAlt)}">
          <div class="detective-card">
            <img src="../assets/images/sneaky-clean-mascot.png" alt="">
            <div>
              <span>${escapeHtml(page.caseLabel)}</span>
              <strong>${escapeHtml(page.caseText)}</strong>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="section seo-intro" aria-labelledby="service-title">
      <div class="wrap seo-detail-grid">
        <div>
          <p class="eyebrow">The Brief</p>
          <h2 id="service-title">${escapeHtml(page.serviceName)} in ${escapeHtml(page.serviceArea)}</h2>
          <p>${escapeHtml(page.intro)}</p>
        </div>
        <ul class="seo-proof-list">
          ${proofItems}
        </ul>
      </div>
    </section>

    <section class="section seo-info" aria-label="${escapeHtml(page.serviceName)} details">
      <div class="wrap seo-info-grid">${sectionCards}
      </div>
    </section>

    <section class="section evidence" aria-labelledby="evidence-title">
      <div class="wrap">
        <div class="section-head section-head--split">
          <div>
            <p class="eyebrow">The Evidence</p>
            <h2 id="evidence-title">Real work. Real vehicles.</h2>
          </div>
          <p>Photos do the selling. These are the kinds of results customers actually care about.</p>
        </div>
        <div class="seo-gallery">${gallery}
        </div>
      </div>
    </section>

    <section class="section faq" aria-labelledby="faq-title">
      <div class="wrap">
        <div class="section-head">
          <p class="eyebrow">Case Notes</p>
          <h2 id="faq-title">Quick answers.</h2>
        </div>
        <div class="faq-grid">${faqs}
        </div>
      </div>
    </section>

    <section class="section final-cta" aria-labelledby="final-title">
      <div class="wrap final-cta__panel">
        <div>
          <p class="eyebrow">Open Cases</p>
          <h2 id="final-title">Ready to get on the schedule?</h2>
          <p>Call now, view packages, or send photos for a quote. Sneaky Clean comes to you.</p>
        </div>
        <div class="actions">
          <a class="button" href="${PHONE_HREF}">Call Now</a>
          <a class="button button--dark" href="#sc-bookvar-37OHZSEUAONVHAKJMBQ4YH6U">Get Quote</a>
        </div>
      </div>
    </section>
  </main>

  <footer class="site-footer">
    <div class="wrap site-footer__inner">
      <span>Professional mobile detailing throughout Middle Tennessee.</span>
      <a href="${PHONE_HREF}">${PHONE_DISPLAY}</a>
    </div>
  </footer>
${bookingModal()}

  <script src="../assets/js/main.js" defer></script>
  <script src="../assets/js/booking.js" defer></script>
</body>
</html>
`;
}

function sitemapXml() {
  const urls = [
    {
      loc: `${BASE_URL}/`,
      priority: "1.0",
      changefreq: "weekly",
    },
    ...pages.map((page) => ({
      loc: `${BASE_URL}/${page.slug}/`,
      priority: "0.8",
      changefreq: "monthly",
    })),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (url) => `  <url>
    <loc>${url.loc}</loc>
    <lastmod>${TODAY}</lastmod>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`,
  )
  .join("\n")}
</urlset>
`;
}

for (const page of pages) {
  const dir = path.join(ROOT, page.slug);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "index.html"), pageHtml(page));
  console.log(`Generated ${page.slug}/index.html`);
}

await fs.writeFile(path.join(ROOT, "sitemap.xml"), sitemapXml());
console.log(`Generated sitemap.xml with ${pages.length + 1} URLs`);
