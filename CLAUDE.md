# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture Overview

This is a web scraping project focused on collecting and processing Convex development pattern articles from stack.convex.dev. The codebase follows a three-stage pipeline:

1. **Pattern Discovery** (`src/blog/get-articles-link.js`) - Uses Playwright to discover article URLs from the Convex patterns page
2. **Content Scraping** (`src/blog/scrape-articles.js`) - Uses FireCrawl API to extract markdown content from discovered URLs
3. **Content Cleaning** (`src/blog/clean-articles.js`) - Post-processes scraped articles to remove navigation elements and line numbers

The workflow stores URLs in `tmp/blog/article-links.json`, raw articles in `dist/blog/articles/`, and cleaned versions in `tmp/blog/cleaned/`.

## Common Commands

```bash
# Install dependencies
pnpm install

# Discover and save article URLs from Convex patterns page
pnpm run get-articles-link

# Scrape all articles from saved URLs to markdown files
pnpm run scrape-articles

# Clean scraped articles (remove headers, line numbers, hero images)
pnpm run clean-articles
```

## Key Implementation Details

- **ES Modules**: All files use ES module syntax (`import`/`export`)
- **FireCrawl Integration**: Uses FireCrawl API for robust article extraction with API key in `src/blog/scrape-articles.js:9`
- **Rate Limiting**: Built-in 1-second delays between scraping requests to avoid API limits
- **Incremental Processing**: Scripts skip existing files to allow resuming interrupted operations
- **Content Sanitization**: Removes code block line numbers and duplicate titles while preserving article structure

## File Processing Logic

The cleaning script (`src/blog/clean-articles.js`) implements sophisticated article header detection:

- Identifies duplicate H1 titles (original + scraped title)
- Locates hero images that follow the second title
- Preserves the first title and removes navigation/metadata content
- Strips line numbers from code blocks while maintaining formatting
