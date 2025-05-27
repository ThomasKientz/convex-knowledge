#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function removeLineNumbers(content) {
  const lines = content.split("\n");
  let inCodeBlock = false;

  return lines
    .map((line) => {
      // Track code block boundaries
      if (line.trim().startsWith("```")) {
        inCodeBlock = !inCodeBlock;
        return line;
      }

      // Only remove line numbers from inside code blocks
      if (inCodeBlock) {
        // Match line numbers at start of line (1-3 digits followed by space, tab, or code)
        const match = line.match(/^(\d{1,3})([ \t].*|[a-zA-Z].*|\/\/.*|$)/);
        if (match) {
          return match[2] || "";
        }
      }

      return line;
    })
    .join("\n");
}

function cleanArticleHeader(content) {
  const lines = content.split("\n");
  let titleCount = 0;
  let firstTitleIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Count H1 titles
    if (line.startsWith("# ")) {
      titleCount++;
      if (titleCount === 1) {
        firstTitleIndex = i;
      }
      // After finding the second title, look for the hero image
      if (titleCount === 2) {
        // Look for the hero image after the second title
        for (let j = i + 1; j < lines.length; j++) {
          const nextLine = lines[j].trim();
          if (nextLine.startsWith("![") && !nextLine.includes("avatar")) {
            // Found hero image, content starts after next non-empty line
            for (let k = j + 1; k < lines.length; k++) {
              if (lines[k].trim() !== "") {
                // Preserve first title + empty line + content
                let cleanedContent =
                  lines[firstTitleIndex] + "\n\n" + lines.slice(k).join("\n");
                return removeLineNumbers(cleanedContent);
              }
            }
          }
          // If we find content before an image, start from there
          if (nextLine !== "" && !nextLine.startsWith("![")) {
            // Preserve first title + empty line + content
            let cleanedContent =
              lines[firstTitleIndex] + "\n\n" + lines.slice(j).join("\n");
            return removeLineNumbers(cleanedContent);
          }
        }
      }
    }
  }

  // Fallback: if pattern not found, return original content
  return removeLineNumbers(content);
}

function cleanAllArticles() {
  const articlesDir = path.join(__dirname, "articles");
  const cleanedDir = path.join(__dirname, "../../tmp/blog/cleaned");

  // Create cleaned directory if it doesn't exist
  if (!fs.existsSync(cleanedDir)) {
    fs.mkdirSync(cleanedDir, { recursive: true });
  }

  const files = fs
    .readdirSync(articlesDir)
    .filter((file) => file.endsWith(".md"));

  console.log(`Found ${files.length} blog articles to clean`);

  files.forEach((file) => {
    const inputPath = path.join(articlesDir, file);
    const outputPath = path.join(cleanedDir, file);
    const content = fs.readFileSync(inputPath, "utf8");
    const cleanedContent = cleanArticleHeader(content);

    fs.writeFileSync(outputPath, cleanedContent);

    if (cleanedContent !== content) {
      console.log(`Cleaned: ${file}`);
    } else {
      console.log(`Copied unchanged: ${file}`);
    }
  });

  console.log(`All articles processed! Clean versions saved to ${cleanedDir}`);
}

cleanAllArticles();
