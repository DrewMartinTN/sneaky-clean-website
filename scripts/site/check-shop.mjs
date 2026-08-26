#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const catalog = JSON.parse(await readFile(resolve(root, "shop/catalog.json"), "utf8"));
const home = await readFile(resolve(root, "index.html"), "utf8");
const shop = await readFile(resolve(root, "shop/index.html"), "utf8");
const sitemap = await readFile(resolve(root, "sitemap.xml"), "utf8");

const errors = [];
const slugs = new Set();
const allowedStatuses = new Set(["draft", "live", "sold_out"]);
const squareCheckout = /^https:\/\/(square\.link|checkout\.square\.site)\//;

if (catalog.schemaVersion !== 1) errors.push("shop/catalog.json must use schemaVersion 1");
if (catalog.currency !== "USD") errors.push("shop/catalog.json currency must be USD");
if (!Array.isArray(catalog.products)) errors.push("shop/catalog.json products must be an array");

for (const [index, product] of (catalog.products || []).entries()) {
  const label = `products[${index}]`;
  if (!product.slug) errors.push(`${label} is missing slug`);
  if (slugs.has(product.slug)) errors.push(`${label} repeats slug ${product.slug}`);
  slugs.add(product.slug);
  if (!allowedStatuses.has(product.status)) errors.push(`${label} has invalid status`);

  if (product.status === "live") {
    for (const field of ["name", "brand", "description", "checkoutUrl"]) {
      if (!product[field]) errors.push(`${label} is live but missing ${field}`);
    }
    if (!Number.isInteger(product.priceCents) || product.priceCents <= 0) {
      errors.push(`${label} is live but priceCents is not a positive integer`);
    }
    if (!squareCheckout.test(product.checkoutUrl || "")) {
      errors.push(`${label} is live but checkoutUrl is not an approved Square-hosted URL`);
    }
  }
}

if (!home.includes('href="shop/"')) errors.push("Homepage is missing the Shop navigation link");
if (!shop.includes('data-shop-products')) errors.push("Shop page is missing the catalog mount point");
if (!sitemap.includes("https://www.sneakycleantn.com/shop/")) errors.push("Sitemap is missing /shop/");

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}

console.log(`Shop check passed (${catalog.products.length} catalog products, ${slugs.size} unique slugs).`);
