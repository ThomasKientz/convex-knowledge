import { chromium } from "playwright";
import { writeFileSync } from "fs";
import { join } from "path";

async function scrapeConvexPatterns() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    console.log("🔍 Navigating to Convex Patterns page...");
    await page.goto("https://stack.convex.dev/tag/Patterns");
    console.log("✅ Page loaded successfully");

    console.log("📝 Extracting article links from page...");
    const links = await page.evaluate(() => {
      const main = document.querySelector("main");
      if (!main) {
        return [];
      }

      const anchors = main.querySelectorAll("a");
      return Array.from(anchors).map((a) => a.href);
    });

    console.log(`📊 Found ${links.length} total links from Patterns tag page`);

    console.log("🔧 Filtering links:");
    console.log("  - Removing duplicates");
    console.log("  - Excluding author profile pages (/author/)");

    const filteredLinks = [...new Set(links)]
      .filter((href) => !href.includes("/author/"))
      .sort();

    console.log(
      `✨ Filtered results: ${filteredLinks.length} unique article links`
    );

    console.log("💾 Saving filtered links to file...");
    const outputFile = join(process.cwd(), "tmp/blog/article-links.json");
    writeFileSync(outputFile, JSON.stringify(filteredLinks, null, 2));
    console.log(`✅ Links saved to: ${outputFile}`);

    return filteredLinks;
  } catch (error) {
    console.error("Error scraping page:", error);
    return [];
  } finally {
    await browser.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  scrapeConvexPatterns().catch(console.error);
}

export { scrapeConvexPatterns };
