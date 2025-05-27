#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function combineArticles() {
  const cleanedDir = path.join(__dirname, "../../tmp/blog/cleaned");
  const outputFile = path.join(__dirname, "../../tmp/blog/convex-blog.md");

  if (!fs.existsSync(cleanedDir)) {
    console.error(
      "Error: tmp/blog/cleaned directory not found. Run npm run clean-articles first."
    );
    process.exit(1);
  }

  const files = fs
    .readdirSync(cleanedDir)
    .filter((file) => file.endsWith(".md"))
    .sort();

  console.log(`Found ${files.length} cleaned blog articles to combine`);

  let combinedContent = "# Convex Development Patterns\n\n";
  combinedContent +=
    "This document contains all Convex development patterns scraped from stack.convex.dev.\n\n";
  combinedContent += "---\n\n";

  files.forEach((file, index) => {
    const filePath = path.join(cleanedDir, file);
    const content = fs.readFileSync(filePath, "utf8");

    // Add the article content
    combinedContent += content;

    // Add separator between articles (except for the last one)
    if (index < files.length - 1) {
      combinedContent += "\n\n---\n\n";
    }

    console.log(`Added: ${file}`);
  });

  fs.writeFileSync(outputFile, combinedContent);
  console.log(`\nAll blog articles combined into: ${outputFile}`);
  console.log(
    `Total size: ${Math.round(fs.statSync(outputFile).size / 1024)} KB`
  );
}

combineArticles();
