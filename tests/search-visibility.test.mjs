import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const profile = JSON.parse(read("content/business-profile.json"));
const urls = [...read("sitemap.xml").matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
const pages = urls.map((url) => ({ url, file: path.join(new URL(url).pathname, "index.html").replace(/^\//, "") }));
const graphs = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((match) => {
  const data = JSON.parse(match[1]);
  return data["@graph"] || [data];
});

test("all sitemap pages exist, are indexable and use their own canonical URL", () => {
  assert.equal(new Set(urls).size, urls.length, "duplicate sitemap URLs");
  for (const { url, file } of pages) {
    const html = read(file);
    assert.ok(html.includes(`<link rel="canonical" href="${url}">`), file);
    assert.doesNotMatch(html, /<meta[^>]+name="robots"[^>]+noindex/i, file);
    assert.equal((html.match(/<h1(?:\s|>)/g) || []).length, 1, `${file}: one primary heading`);
    assert.doesNotThrow(() => graphs(html), `${file}: valid JSON-LD`);
  }
});

test("business identity, profile links and starting prices agree across the site", () => {
  for (const { file } of pages) {
    const html = read(file);
    const business = graphs(html).find((node) => node["@id"] === `${profile.url}#localbusiness`);
    assert.ok(business, `${file}: business information is present`);
    assert.equal(business.telephone, "+17178709439", file);
    assert.equal(business.foundingDate, "2025", file);
    assert.deepEqual(business.sameAs, profile.profiles.map((p) => p.url), file);
    for (const [name, price] of [["Refresh Detail", "249"], ["Full Reset Detail", "399"], ["Interior Only", "150"]]) {
      const offer = business.hasOfferCatalog.itemListElement.find((offer) => offer.name === name);
      assert.equal(offer.priceSpecification.minPrice, price, `${file}: ${name} starts at the right price`);
      assert.equal(offer.price, undefined, `${file}: do not represent a starting price as a fixed total`);
    }
    assert.ok(html.includes('aria-label="About Sneaky Clean"'), `${file}: visible profile links`);
    for (const href of ["about/", "case-studies/", "yelp.com/biz/sneaky-clean-murfreesboro"]) assert.ok(html.includes(href), file);
    assert.doesNotMatch(html, /(?:Refresh Detail — from \$199|Full Reset Detail — from \$299)/, `${file}: stale booking labels`);
  }
});

test("case studies have matching photo records, service links and article metadata", () => {
  const studies = JSON.parse(read("content/case-studies.json"));
  for (const study of studies) {
    const html = read(`case-studies/${study.slug}/index.html`);
    const article = graphs(html).find((node) => node["@type"] === "Article");
    assert.equal(article.headline, study.title);
    assert.equal(article.image.length, study.images.length);
    assert.ok(html.includes(`href="/${study.serviceUrl}"`));
    assert.ok(html.includes(`href="/${study.quoteUrl}"`));
    for (const photo of study.images) {
      for (const variant of [".webp", "-640.avif", "-960.avif", "-1200.avif"]) {
        assert.ok(fs.existsSync(path.join(root, `assets/images/evidence/${photo.src}${variant}`)), `${photo.src}${variant}`);
      }
    }
    assert.equal(article.datePublished, undefined, "do not invent a date for the job");
    assert.equal(article.contentLocation, undefined, "do not invent a job location");
  }
});

test("internal links and referenced local images resolve on every indexable page", () => {
  for (const { url, file } of pages) {
    const html = read(file);
    for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const value = match[1].replaceAll("&amp;", "&");
      if (/^(#|tel:|sms:|mailto:|data:)/.test(value)) continue;
      const target = new URL(value, url);
      if (target.origin !== new URL(profile.url).origin) continue;
      const relative = decodeURIComponent(target.pathname).replace(/^\//, "");
      const targetFile = path.join(root, relative.endsWith("/") || !relative ? `${relative}index.html` : relative);
      assert.ok(fs.existsSync(targetFile), `${file}: broken local reference ${value}`);
    }
  }
});
