import fs from "node:fs/promises";
import path from "node:path";
import { business, businessSchema, profileLinks } from "./business-schema.mjs";

const root = process.cwd();
const cases = JSON.parse(await fs.readFile(path.join(root, "content/case-studies.json"), "utf8"));
const e = (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const json = (value) => JSON.stringify(value, null, 2).replaceAll("<", "\\u003c");
const absolute = (route) => new URL(route, business.url).href;

function image(photo, eager = false) {
  const src = `/assets/images/evidence/${photo.src}`;
  return `<figure class="proof-photo"><picture><source type="image/avif" srcset="${src}-640.avif 640w, ${src}-960.avif 960w, ${src}-1200.avif 1200w" sizes="(max-width: 700px) calc(100vw - 2rem), 560px"><img src="${src}.webp" alt="${e(photo.alt)}" width="${photo.width}" height="${photo.height}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"></picture><figcaption>${e(photo.label)}</figcaption></figure>`;
}

function card(study) {
  const photo = study.images[1];
  return `<article class="seo-info-card proof-card">${image(photo)}<p class="eyebrow">${e(study.service)}</p><h2><a href="/case-studies/${e(study.slug)}/">${e(study.vehicle)}</a></h2><p>${e(study.intro)}</p><a class="text-link" href="/case-studies/${e(study.slug)}/">View the case study</a></article>`;
}

function layout({ route, title, description, body, nodes = [], imageUrl }) {
  const url = absolute(route);
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      businessSchema(),
      { "@type": "WebSite", "@id": `${business.url}#website`, url: business.url, name: business.name, publisher: { "@id": `${business.url}#localbusiness` } },
      { "@type": route === "about/" ? "AboutPage" : route === "case-studies/" ? "CollectionPage" : "WebPage", "@id": `${url}#webpage`, url, name: title, description, isPartOf: { "@id": `${business.url}#website` }, about: { "@id": `${business.url}#localbusiness` }, ...(nodes.length ? { mainEntity: { "@id": `${url}#content` } } : {}) },
      ...nodes,
    ],
  };
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${e(title)} | Sneaky Clean</title>
  <meta name="description" content="${e(description)}">
  <link rel="canonical" href="${url}">
  <link rel="icon" href="/favicon.ico" sizes="any">
  <meta name="theme-color" content="#001210">
  <meta property="og:site_name" content="Sneaky Clean">
  <meta property="og:title" content="${e(title)} | Sneaky Clean">
  <meta property="og:description" content="${e(description)}">
  <meta property="og:type" content="${route.startsWith("case-studies/") && route !== "case-studies/" ? "article" : "website"}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${imageUrl || absolute("assets/images/og-image.jpg")}">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="stylesheet" href="/assets/css/styles.css?v=20261016-search">
  <link rel="stylesheet" href="/assets/css/proof.css?v=20261016">
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-8ZBE3LNX5E"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-8ZBE3LNX5E');
    gtag('config', 'AW-17685937498');
  </script>
  <script type="application/ld+json">${json(graph)}</script>
</head>
<body class="proof-page">
  <header class="site-header">
    <a class="brand" href="/" aria-label="Sneaky Clean home"><img src="/assets/images/sneaky-clean-mascot.png" alt="Sneaky Clean detective mascot" width="879" height="879"><span>Sneaky Clean</span></a>
    <nav class="nav" aria-label="Primary navigation"><a href="/about/">About</a><a href="/case-studies/">Case Studies</a><a href="/#packages">Services &amp; Pricing</a><a href="tel:${business.telephone}">${business.phoneDisplay}</a><a class="nav__cta" href="/#sc-book-interior">Book Interior Only</a></nav>
  </header>
  <main id="top">${body}</main>
  <footer class="site-footer"><div class="wrap site-footer__inner"><span>Sneaky Clean · Mobile auto detailing · Murfreesboro, Tennessee · Established 2025</span><p class="business-hours">Business hours: ${business.hoursDisplay}</p>${profileLinks("/")}<nav aria-label="Sneaky Clean services"><a href="/mobile-detailing-murfreesboro/">Mobile detailing</a> · <a href="/interior-detailing-murfreesboro/">Interior detailing</a> · <a href="/ceramic-coating-murfreesboro/">Ceramic coating</a> · <a href="/fleet-commercial/">Fleet services</a></nav><a href="tel:${business.telephone}">${business.phoneDisplay}</a></div></footer>
  <nav class="mobile-bar" aria-label="Quick actions"><a href="tel:${business.telephone}">Call</a><a href="sms:${business.telephone}">Text</a><a class="mobile-bar__book" href="/#sc-book-interior">Book Interior Only</a></nav>
  <script src="/assets/js/main.js?v=20260927-ads" defer></script>
</body>
</html>
`;
}

const cta = (study) => `<section class="section final-cta"><div class="wrap final-cta__panel"><div><p class="eyebrow">Your next detail</p><h2>Let's take care of yours.</h2><p>We come to homes, workplaces and approved locations in Murfreesboro, Smyrna and surrounding Middle Tennessee communities.</p></div><div class="actions"><a class="button" href="/${study?.quoteUrl || "#sc-book-interior"}">${study?.quoteText || "Book Interior Only"}</a><a class="button button--dark" href="tel:${business.telephone}">Call Drew</a></div></div></section>`;

const indexBody = `<section class="section"><div class="wrap proof-intro"><a class="breadcrumb" href="/">Sneaky Clean / The Evidence</a><p class="eyebrow">The Evidence</p><h1>Real vehicles. Real results.</h1><p class="lead">A closer look at interior and exterior detailing by Sneaky Clean. Follow the work through the original photos and see what changed.</p></div></section><section class="section proof-list"><div class="wrap seo-info-grid">${cases.map(card).join("")}</div></section>${cta()}`;
const files = [{ route: "case-studies/", title: "Mobile Detailing Case Studies", description: "See real Sneaky Clean detailing results: Silverado interior before-and-after photos and a Porsche 911 exterior wash and finished result.", body: indexBody,
  nodes: [{ "@type": "ItemList", "@id": `${absolute("case-studies/")}#content`, itemListElement: cases.map((study, index) => ({ "@type": "ListItem", position: index + 1, name: study.title, url: absolute(`case-studies/${study.slug}/`) })) }] }];

for (const study of cases) {
  const route = `case-studies/${study.slug}/`;
  const url = absolute(route);
  files.push({ route, title: study.title, description: study.description, imageUrl: absolute(`assets/images/evidence/${study.images[1].src}.webp`),
    nodes: [{ "@type": "Article", "@id": `${url}#content`, headline: study.title, description: study.description, mainEntityOfPage: { "@id": `${url}#webpage` }, author: { "@id": `${business.url}#localbusiness` }, publisher: { "@id": `${business.url}#localbusiness` }, about: { "@type": "Car", name: study.vehicle }, image: study.images.map((photo) => ({ "@type": "ImageObject", contentUrl: absolute(`assets/images/evidence/${photo.src}.webp`), caption: photo.alt, width: photo.width, height: photo.height })), articleBody: [study.intro, ...study.sections.map((s) => `${s.heading}. ${s.body}`)].join("\n\n") }],
    body: `<article><section class="section"><div class="wrap proof-intro"><a class="breadcrumb" href="/case-studies/">Sneaky Clean / Case Studies</a><p class="eyebrow">${e(study.service)} · ${e(study.vehicle)}</p><h1>${e(study.title)}</h1><p class="lead">${e(study.intro)}</p><a class="text-link" href="/${study.serviceUrl}">${e(study.serviceLinkText)}</a></div></section><section class="section proof-list"><div class="wrap seo-info-grid">${study.sections.map((section) => `<section class="seo-info-card"><h2>${e(section.heading)}</h2><p>${e(section.body)}</p></section>`).join("")}</div></section><section class="section"><div class="wrap"><h2>The photo record</h2><div class="proof-photo-grid">${study.images.map((photo, index) => image(photo, index < 2)).join("")}</div></div></section></article>${cta(study)}`,
  });
}

files.push({ route: "about/", title: "About Sneaky Clean & Drew", description: "Meet Drew, owner of Sneaky Clean. Founded in 2025, Sneaky Clean brings mobile auto detailing to homes, workplaces and approved locations around Murfreesboro, TN.",
  body: `<section class="section"><div class="wrap proof-intro"><a class="breadcrumb" href="/">Sneaky Clean / About</a><p class="eyebrow">Murfreesboro, Tennessee · Established 2025</p><h1>Detailing that comes to you.</h1><p class="lead">I'm Drew, the owner of Sneaky Clean. I started the business in 2025 with a simple approach: careful work, clear communication and practical recommendations for your vehicle.</p></div></section><section class="section proof-list"><div class="wrap seo-info-grid"><section class="seo-info-card"><h2>Local care. At your location.</h2><p>Sneaky Clean is a mobile auto detailing business based in Murfreesboro, Tennessee. We come to homes, workplaces, apartments with permission, and other approved locations in Murfreesboro, Smyrna and surrounding Middle Tennessee communities.</p><p><a class="text-link" href="/mobile-detailing-murfreesboro/">Explore mobile detailing</a> · <a class="text-link" href="/mobile-detailing-smyrna/">Detailing in Smyrna</a></p></section><section class="seo-info-card"><h2>The right service for your vehicle.</h2><p>Choose a Refresh Detail for regular upkeep, a Full Reset Detail for a deeper interior and exterior clean, or an interior-only detail. Paint correction, ceramic coating, motorcycle care and fleet work are quoted for the vehicle and the work required.</p><p><a class="text-link" href="/#packages">View services and current starting prices</a></p></section><section class="seo-info-card"><h2>Real vehicles. Real results.</h2><p>Our photo case studies show actual vehicles detailed by Sneaky Clean. Take a closer look at the Silverado interior before and after cleaning, or follow the Porsche 911 exterior wash through to the finished result.</p><p><a class="text-link" href="/case-studies/">See the work</a></p></section><section class="seo-info-card"><h2>Get in touch.</h2><p>Business hours: ${business.hoursDisplay}</p><p>Call or text <a href="tel:${business.telephone}">${business.phoneDisplay}</a> to discuss your vehicle and location, or request a quote online. Live online appointment times run Monday, Wednesday and Friday. Text to request a Tuesday or Thursday rush slot.</p><p><a class="text-link" href="${business.profiles[0].url}" target="_blank" rel="noopener">Find Sneaky Clean on Google</a> · <a class="text-link" href="${business.profiles[1].url}" target="_blank" rel="noopener">Find Sneaky Clean on Yelp</a></p></section></div></section>${cta()}`,
});

for (const page of files) {
  const dir = path.join(root, page.route);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "index.html"), layout(page));
  console.log(`Generated ${page.route}index.html`);
}
