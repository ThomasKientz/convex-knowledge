#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function fetchConvexHelpers() {
  const url =
    "https://raw.githubusercontent.com/get-convex/convex-helpers/refs/heads/main/packages/convex-helpers/README.md";
  const outputDir = path.join(__dirname, "../../tmp/helpers");
  const outputFile = path.join(outputDir, "convex-helpers.md");

  console.log("Fetching convex-helpers README...");

  try {
    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Fetch the README content
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const content = await response.text();

    // Write to file
    fs.writeFileSync(outputFile, content);

    console.log(`Convex helpers README saved to: ${outputFile}`);
    console.log(
      `File size: ${Math.round(fs.statSync(outputFile).size / 1024)} KB`
    );
  } catch (error) {
    console.error("Error fetching convex-helpers README:", error.message);
    process.exit(1);
  }
}

fetchConvexHelpers();
