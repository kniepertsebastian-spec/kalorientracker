import { describe, expect, it } from "vitest";
import { decodeEntities, extractJsonLdRecipe, pageText, pageTitle, vttToText } from "./extract.js";

const page = (jsonLd: unknown, extra = "") => `<html><head><title>Rezeptseite</title>
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>${extra}</head><body><p>Text</p></body></html>`;

describe("extractJsonLdRecipe", () => {
  it("reads a plain Recipe", () => {
    const recipe = extractJsonLdRecipe(
      page({
        "@context": "https://schema.org",
        "@type": "Recipe",
        name: "Protein-Pasta",
        recipeYield: ["2", "2 Portionen"],
        recipeIngredient: ["250 g Vollkornnudeln", "10 ml Oliven&ouml;l", "<b>2</b> Knoblauchzehen"],
        recipeInstructions: [{ "@type": "HowToStep", text: "Nudeln kochen." }, { "@type": "HowToStep", text: "Mischen." }],
      }),
    );
    expect(recipe).toEqual({
      name: "Protein-Pasta",
      yield: "2 Portionen",
      ingredients: ["250 g Vollkornnudeln", "10 ml Olivenöl", "2 Knoblauchzehen"],
      instructions: ["Nudeln kochen.", "Mischen."],
    });
  });

  it("finds the Recipe inside @graph, with @type as a list and sections of steps", () => {
    const recipe = extractJsonLdRecipe(
      page({
        "@graph": [
          { "@type": "WebPage", name: "Seite" },
          {
            "@type": ["Recipe", "NewsArticle"],
            name: "Bowl",
            recipeYield: 4,
            recipeIngredient: ["100 g Reis"],
            recipeInstructions: [{ "@type": "HowToSection", name: "Teil 1", itemListElement: [{ "@type": "HowToStep", text: "A" }, { "@type": "HowToStep", text: "B" }] }],
          },
        ],
      }),
    );
    expect(recipe).toMatchObject({ name: "Bowl", yield: "4", ingredients: ["100 g Reis"], instructions: ["A", "B"] });
  });

  it("splits instructions given as one text and skips broken blocks", () => {
    const html = `<script type="application/ld+json">{ kaputt</script>` + page({ "@type": "Recipe", name: "X", recipeIngredient: [], recipeInstructions: "Eins.\nZwei." });
    expect(extractJsonLdRecipe(html)).toMatchObject({ ingredients: [], instructions: ["Eins.", "Zwei."], yield: null });
  });

  it("returns null without a Recipe", () => {
    expect(extractJsonLdRecipe(page({ "@type": "Article", name: "News" }))).toBeNull();
    expect(extractJsonLdRecipe("<html></html>")).toBeNull();
  });
});

describe("page text", () => {
  const html = `<html><head><title>Titel &amp; mehr</title><meta property="og:description" content="Ein schnelles Rezept"><style>p{}</style></head>
<body><nav>Menü</nav><script>var x = 1;</script><h1>Quark-Bowl</h1><p>250 g Magerquark<br>1 Banane</p><footer>Impressum</footer></body></html>`;

  it("keeps the readable text and drops scripts, styles and navigation", () => {
    expect(pageText(html)).toBe("Titel & mehr\nEin schnelles Rezept\nQuark-Bowl\n250 g Magerquark\n1 Banane");
  });

  it("prefers og:title", () => {
    expect(pageTitle(`<meta property="og:title" content="OG Titel"><title>T</title>`)).toBe("OG Titel");
    expect(pageTitle("<p>ohne</p>")).toBeNull();
  });

  it("cuts long pages", () => {
    expect(pageText(`<body><p>${"a".repeat(100)}</p></body>`, 20)).toHaveLength(20);
  });

  it("decodes entities", () => {
    expect(decodeEntities("&frac12; TL &#8211; &#x2013; &auml; &unbekannt;")).toBe("½ TL – – ä &unbekannt;");
  });
});

describe("vttToText", () => {
  it("drops timings and repeated lines", () => {
    const vtt = `WEBVTT
Kind: captions
Language: de

00:00:00.000 --> 00:00:02.000
Heute machen wir

00:00:02.000 --> 00:00:04.000
Heute machen wir
<00:00:02.500><c>eine</c> Bowl

1
00:00:04.000 --> 00:00:06.000
mit 250 Gramm Quark`;
    expect(vttToText(vtt)).toBe("Heute machen wir eine Bowl mit 250 Gramm Quark");
  });
});
