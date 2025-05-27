# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

### Data Collection Pipeline
- `npm run build` - Full pipeline: scrapes blog, docs, helpers, then combines all
- `npm run scrape-convex-blog` - Complete blog scraping pipeline (get links → scrape → clean → combine)
- `npm run scrape-convex-docs` - Clone and scrape Convex documentation from GitHub
- `npm run fetch-convex-helpers` - Fetch convex-helpers README from GitHub
- `npm run combine-all` - Merge all scraped content into final knowledge base

### Individual Pipeline Steps
- `npm run get-articles-link` - Extract article URLs from Convex blog
- `npm run scrape-articles` - Scrape individual articles using FireCrawl
- `npm run clean-articles` - Clean and process scraped article content
- `npm run combine-articles` - Combine articles into single blog markdown

### Code Quality
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check code formatting

## Architecture Overview

This is a web scraping and content aggregation tool that builds a comprehensive Convex knowledge base by collecting content from three sources:

### Data Sources
1. **Blog Articles** (`src/blog/`) - Scrapes the Convex blog using FireCrawl API
2. **Official Documentation** (`src/doc/`) - Clones convex-backend repo and extracts docs
3. **Helper Utilities** (`src/helpers/`) - Fetches convex-helpers README from GitHub

### Pipeline Architecture
The system follows a multi-stage pipeline:
1. **Collection**: Each source has its own scraper that outputs to `tmp/` directories
2. **Processing**: Content is cleaned and formatted into markdown
3. **Aggregation**: All sources are merged into a single `convex-knowledge.md` file

### Key Files
- `src/merge-convex-knowledge.js` - Final aggregation step that combines all sources
- `src/blog/scrape-articles.js` - Uses FireCrawl API to scrape blog articles
- `src/doc/scrape-convex-docs.js` - Clones GitHub repo and extracts documentation
- `src/helpers/fetch-convex-helpers.js` - Simple HTTP fetch for helper docs

### Environment Requirements
- `FIRECRAWL_API_KEY` environment variable required for blog scraping
- Uses pnpm as package manager
- Outputs to `tmp/` directories during processing, final output is `convex-knowledge.md`

### Content Processing
- Blog articles are stored individually in `src/blog/articles/` then combined
- Documentation is extracted from cloned repo and merged into single file
- All content is ultimately combined with headers and separators in the final knowledge base