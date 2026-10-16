import fs from "node:fs";

// The same identity and starting prices are used on the homepage and generated pages.
export const business = JSON.parse(fs.readFileSync(new URL("../../content/business-profile.json", import.meta.url), "utf8"));

export function businessSchema() {
  return {
    "@type": ["LocalBusiness", "AutomotiveBusiness"],
    "@id": `${business.url}#localbusiness`,
    name: business.name,
    url: business.url,
    image: `${business.url}assets/images/og-image.jpg`,
    logo: `${business.url}assets/images/sneaky-clean-mascot.png`,
    telephone: business.telephone,
    priceRange: "$$",
    description: business.description,
    foundingDate: business.foundingYear,
    address: { "@type": "PostalAddress", addressLocality: "Murfreesboro", addressRegion: "TN", addressCountry: "US" },
    areaServed: business.areaServed,
    sameAs: business.profiles.map((profile) => profile.url),
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "Mobile detailing services",
      itemListElement: business.services.map((service) => ({
        "@type": "Offer",
        name: service.name,
        url: new URL(service.url, business.url).href,
        description: service.description,
        ...(service.startingPrice ? {
          priceSpecification: {
            "@type": "PriceSpecification",
            minPrice: String(service.startingPrice),
            priceCurrency: "USD",
            valueAddedTaxIncluded: false,
          },
        } : {}),
        itemOffered: {
          "@type": "Service",
          name: service.name,
          url: new URL(service.url, business.url).href,
          provider: { "@id": `${business.url}#localbusiness` },
        },
      })),
    },
  };
}

export function profileLinks(prefix = "") {
  return `<nav aria-label="About Sneaky Clean"><a href="${prefix}about/">About Sneaky Clean</a> · <a href="${prefix}case-studies/">Detailing case studies</a> · <a href="${business.profiles[0].url}" target="_blank" rel="noopener">Google Business Profile</a> · <a href="${business.profiles[1].url}" target="_blank" rel="noopener">Yelp</a></nav>`;
}
