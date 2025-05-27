import FireCrawlApp from "@mendable/firecrawl-js";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = new FireCrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY });

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getFilenameFromUrl(url) {
  const path = new URL(url).pathname;
  const slug = path.split("/").pop() || "article";
  return slugify(slug);
}

async function scrapeAllArticles() {
  try {
    const linksFile = join(__dirname, "../../tmp/blog/article-links.json");
    const links = JSON.parse(readFileSync(linksFile, "utf8"));

    const outputDir = join(__dirname, "articles");
    mkdirSync(outputDir, { recursive: true });

    console.log(`Starting to scrape ${links.length} blog articles...`);
    let scraped = 0;
    let skipped = 0;
    let failed = 0;

    for (let i = 0; i < links.length; i++) {
      const url = links[i];
      const filename = getFilenameFromUrl(url);
      const outputPath = join(outputDir, `${filename}.md`);

      // Skip if file already exists
      if (existsSync(outputPath)) {
        skipped++;
        console.log(
          `[${i + 1}/${links.length}] ⏭️  Skipping (exists): ${filename}.md`
        );
        continue;
      }

      try {
        console.log(`[${i + 1}/${links.length}] 🔄 Scraping: ${url}`);

        const scrapeResult = await app.scrapeUrl(url, {
          formats: ["markdown"],
          onlyMainContent: true,
        });

        if (scrapeResult.success && scrapeResult.markdown) {
          const title = scrapeResult.metadata?.title || filename;
          const content = `# ${title}\n\n${scrapeResult.markdown}`;
          writeFileSync(outputPath, content);
          scraped++;
          console.log(`[${i + 1}/${links.length}] ✅ Saved: ${filename}.md`);
        } else {
          failed++;
          console.log(`[${i + 1}/${links.length}] ❌ Failed to scrape: ${url}`);
          console.log(
            `🐛 Debug - Failure reason: success=${scrapeResult.success}, hasMarkdown=${!!scrapeResult.markdown}`
          );
          if (scrapeResult.error) {
            console.log(`🐛 Debug - Error details:`, scrapeResult.error);
          }
        }

        // Add delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        failed++;
        console.error(
          `[${i + 1}/${links.length}] ❌ Error scraping ${url}:`,
          error.message
        );
        console.error(`🐛 Debug - Full error:`, error);
      }
    }

    console.log("\n📊 Scraping Summary:");
    console.log(`✅ Scraped: ${scraped}`);
    console.log(`⏭️  Skipped: ${skipped}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📁 Total files in src/blog/articles/: ${scraped + skipped}`);

    console.log("Scraping completed!");
  } catch (error) {
    console.error("Error:", error);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  scrapeAllArticles().catch(console.error);
}

export { scrapeAllArticles };
