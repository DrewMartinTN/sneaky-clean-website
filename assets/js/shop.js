(function () {
  const productGrid = document.querySelector("[data-shop-products]");
  if (!productGrid) return;

  const money = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  });

  function emptyState(message) {
    const wrapper = document.createElement("div");
    wrapper.className = "shop-empty";

    const title = document.createElement("strong");
    title.textContent = "Nothing is for sale yet.";

    const copy = document.createElement("p");
    copy.textContent = message;

    wrapper.append(title, copy);
    productGrid.replaceChildren(wrapper);
  }

  function productCard(product) {
    const article = document.createElement("article");
    article.className = "shop-product-card";

    if (product.image) {
      const image = document.createElement("img");
      image.src = product.image;
      image.alt = product.imageAlt || product.name;
      image.width = 720;
      image.height = 540;
      image.loading = "lazy";
      image.decoding = "async";
      article.append(image);
    }

    const body = document.createElement("div");
    body.className = "shop-product-card__body";

    const brand = document.createElement("span");
    brand.className = "shop-product-card__brand";
    brand.textContent = product.brand;

    const title = document.createElement("h3");
    title.textContent = product.name;

    const description = document.createElement("p");
    description.textContent = product.description;

    const footer = document.createElement("div");
    footer.className = "shop-product-card__footer";

    const price = document.createElement("strong");
    price.textContent = money.format(product.priceCents / 100);

    const checkout = document.createElement("a");
    checkout.className = "button";
    checkout.href = product.checkoutUrl;
    checkout.rel = "noopener";
    checkout.textContent = "Buy with Square";
    checkout.addEventListener("click", () => {
      if (typeof window.gtag === "function") {
        window.gtag("event", "begin_checkout", {
          currency: "USD",
          value: product.priceCents / 100,
          items: [{ item_id: product.slug, item_name: product.name, price: product.priceCents / 100 }],
        });
      }
    });

    footer.append(price, checkout);
    body.append(brand, title, description, footer);
    article.append(body);
    return article;
  }

  fetch("/shop/catalog.json", { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error("Catalog unavailable");
      return response.json();
    })
    .then((catalog) => {
      const products = Array.isArray(catalog.products)
        ? catalog.products.filter((product) => product.status === "live")
        : [];

      if (!products.length) {
        emptyState("The first products will appear after dealer approval and an owner-reviewed opening order.");
        return;
      }

      productGrid.replaceChildren(...products.map(productCard));
    })
    .catch(() => {
      emptyState("The catalog could not be loaded. Please check back soon.");
    });
})();
