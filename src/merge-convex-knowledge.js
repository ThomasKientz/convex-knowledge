#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function mergeConvexKnowledge() {
  const tmpDir = path.join(__dirname, "../tmp");
  const blogFile = path.join(tmpDir, "blog/convex-blog.md");
  const docFile = path.join(tmpDir, "doc/convex-doc.md");
  const helpersFile = path.join(tmpDir, "helpers/convex-helpers.md");
  const outputFile = path.join("convex-knowledge.md");

  // Check if input files exist
  if (!fs.existsSync(blogFile)) {
    console.error("Error: tmp/blog/convex-blog.md not found.");
    process.exit(1);
  }

  if (!fs.existsSync(docFile)) {
    console.error("Error: tmp/doc/convex-doc.md not found.");
    process.exit(1);
  }

  if (!fs.existsSync(helpersFile)) {
    console.error("Error: tmp/helpers/convex-helpers.md not found.");
    process.exit(1);
  }

  console.log("Merging Convex knowledge files...");

  // Read the content of all files
  const blogContent = fs.readFileSync(blogFile, "utf8");
  const docContent = fs.readFileSync(docFile, "utf8");
  const helpersContent = fs.readFileSync(helpersFile, "utf8");

  // Create combined content
  let combinedContent = "# Convex Knowledge Base\n\n";
  combinedContent +=
    "This document contains comprehensive Convex knowledge including development patterns, official documentation, and helper utilities.\n\n";
  combinedContent += "---\n\n";

  // Add blog content
  combinedContent += "# Development Patterns\n\n";
  combinedContent += blogContent.replace(
    /^# Convex Development Patterns\n\n.*?\n\n---\n\n/s,
    ""
  );

  combinedContent += "\n\n---\n\n";

  // Add helpers content
  combinedContent += "# Helper Utilities\n\n";
  combinedContent += helpersContent;

  combinedContent += "\n\n---\n\n";

  // Add documentation content
  combinedContent += "# Official Documentation\n\n";
  combinedContent += docContent;

  // Write the merged file
  fs.writeFileSync(outputFile, combinedContent);

  console.log(`Merged knowledge base created: ${outputFile}`);
  console.log(
    `Total size: ${Math.round(fs.statSync(outputFile).size / 1024)} KB`
  );
}

mergeConvexKnowledge();
