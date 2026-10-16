import fs from "node:fs/promises";
import path from "node:path";
import { business, businessSchema, profileLinks } from "./business-schema.mjs";

const root = process.cwd();
const services = JSON.parse(await fs.readFile(path.join(root, "content/seo-pages.json"), "utf8"));
const routes = ["", "shop/", "host-a-pop-up/", "fleet-commercial/", ...services.map((page) => `${page.slug}/`)];
for (const route of routes) {
  const filename = path.join(root, route, "index.html");
  let html = await fs.readFile(filename, "utf8");
  let foundBusiness = false;
  html = html.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g, (script, source) => {
    const schema = JSON.parse(source);
    const nodes = schema["@graph"] || [schema];
    for (let index = 0; index < nodes.length; index++) {
      if (nodes[index]["@id"] === `${business.url}#localbusiness`) {
        nodes[index] = { ...businessSchema(), ...(nodes[index].mainEntityOfPage ? { mainEntityOfPage: nodes[index].mainEntityOfPage } : {}) };
        foundBusiness = true;
      }
    }
    return `<script type="application/ld+json">${JSON.stringify(schema, null, 2).replaceAll("<", "\\u003c")}</script>`;
  });
  if (!foundBusiness) {
    const schema = { "@context": "https://schema.org", "@graph": [businessSchema(), { "@type": "WebPage", "@id": `${business.url}${route}#webpage`, url: `${business.url}${route}`, about: { "@id": `${business.url}#localbusiness` } }] };
    html = html.replace("</head>", `  <script type="application/ld+json">${JSON.stringify(schema, null, 2).replaceAll("<", "\\u003c")}</script>\n</head>`);
  }
  // Add only verified profiles; a shared footer keeps future regenerations consistent.
  if (html.includes('aria-label="About Sneaky Clean"')) {
    html = html.replace(/<nav aria-label="About Sneaky Clean">[\s\S]*?<\/nav>/, profileLinks(route ? "../" : ""));
  } else {
    html = html.replace(/(<footer class="site-footer">[\s\S]*?<div class="wrap site-footer__inner">)/, `$1\n      ${profileLinks(route ? "../" : "")}`);
  }
  await fs.writeFile(filename, html);
  console.log(`Synced business identity: ${route || "/"}`);
}
