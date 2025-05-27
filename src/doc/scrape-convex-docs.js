#!/usr/bin/env node

import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const REPO_URL = "https://github.com/ThomasKientz/convex-backend.git";
const CLONE_DIR = "./convex-backend-clone";
const DOCS_PATH = "./convex-backend-clone/npm-packages/docs/docs";
const OUTPUT_FILE = "./tmp/doc/convex-doc.md";

function cloneRepo() {
  console.log("Cloning repository...");

  // Remove existing clone if it exists
  if (fs.existsSync(CLONE_DIR)) {
    fs.rmSync(CLONE_DIR, { recursive: true, force: true });
  }

  try {
    execSync(`git clone ${REPO_URL} ${CLONE_DIR}`, { stdio: "inherit" });
    console.log("Repository cloned successfully");
  } catch (error) {
    console.error("Failed to clone repository:", error.message);
    process.exit(1);
  }
}

function findMarkdownFiles(dir) {
  const files = [];

  if (!fs.existsSync(dir)) {
    console.error(`Docs directory not found: ${dir}`);
    return files;
  }

  function walkDir(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (
        entry.isFile() &&
        (entry.name.endsWith(".md") || entry.name.endsWith(".mdx")) &&
        !entry.name.startsWith("_")
      ) {
        files.push({
          name: entry.name,
          path: fullPath,
          relativePath: path.relative(DOCS_PATH, fullPath),
        });
      }
    }
  }

  walkDir(dir);
  return files;
}

function readFileContent(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    console.error(`Failed to read file ${filePath}:`, error.message);
    return "";
  }
}

function mergeFiles() {
  console.log("Finding markdown files...");
  const files = findMarkdownFiles(DOCS_PATH);

  if (files.length === 0) {
    console.error("No markdown files found in the docs directory");
    return;
  }

  console.log(`Found ${files.length} markdown files`);

  // Start with home.mdx if it exists
  const homeFile = files.find((f) => f.name === "home.mdx");
  const otherFiles = files.filter((f) => f.name !== "home.mdx");

  let mergedContent = "";

  // Add home.mdx first if it exists
  if (homeFile) {
    console.log(`Processing: ${homeFile.relativePath}`);
    const content = readFileContent(homeFile.path);
    mergedContent += `# ${homeFile.name}\n\n`;
    mergedContent += `<!-- Source: ${homeFile.relativePath} -->\n\n`;
    mergedContent += content;
    mergedContent += "\n\n---\n\n";
  }

  // Add other files
  for (const file of otherFiles) {
    console.log(`Processing: ${file.relativePath}`);
    const content = readFileContent(file.path);
    mergedContent += `# ${file.name}\n\n`;
    mergedContent += `<!-- Source: ${file.relativePath} -->\n\n`;
    mergedContent += content;
    mergedContent += "\n\n---\n\n";
  }

  // Ensure output directory exists
  const outputDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write merged content
  fs.writeFileSync(OUTPUT_FILE, mergedContent);
  console.log(`Merged documentation written to: ${OUTPUT_FILE}`);
}

function cleanup() {
  console.log("Cleaning up cloned repository...");
  if (fs.existsSync(CLONE_DIR)) {
    fs.rmSync(CLONE_DIR, { recursive: true, force: true });
  }
}

function main() {
  try {
    cloneRepo();
    mergeFiles();
    cleanup();
    console.log("Documentation scraping completed successfully!");
  } catch (error) {
    console.error("Error during execution:", error.message);
    cleanup();
    process.exit(1);
  }
}

main();
