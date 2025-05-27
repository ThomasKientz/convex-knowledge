# Convex Knowledge Aggregator

A comprehensive knowledge base builder for [Convex](https://www.convex.dev/) that aggregates content from multiple sources to create an LLM-friendly reference file for accelerated development.

## Overview

This tool automatically scrapes and combines Convex knowledge from three key sources:

- **[Convex Blog](https://stack.convex.dev/)** - Development patterns, best practices, and tutorials
- **Official Documentation** - Complete API reference and guides from the Convex repository
- **Convex Helpers** - Community utilities and helper functions

The output is a single, structured markdown file (`convex-knowledge.md`) optimized for Large Language Models to provide comprehensive Convex context for development assistance.

## Quick Start

### Prerequisites

- Node.js (with ES modules support)
- pnpm package manager
- [FireCrawl API key](https://firecrawl.dev/) for blog scraping

### Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd convex-knowledge
```

2. Install dependencies:
```bash
pnpm install
```

3. Set up environment variables:
```bash
echo "FIRECRAWL_API_KEY=your_api_key_here" > .env
```

### Build Knowledge Base

Generate the complete knowledge base:
```bash
npm run build
```

This will create `convex-knowledge.md` containing all aggregated Convex knowledge.

## Usage

### Full Pipeline
```bash
npm run build
```
Runs the complete pipeline: scrapes blog → scrapes docs → fetches helpers → combines all

### Individual Components
```bash
# Blog content only
npm run scrape-convex-blog

# Documentation only  
npm run scrape-convex-docs

# Helper utilities only
npm run fetch-convex-helpers

# Combine existing scraped content
npm run combine-all
```

### Development
```bash
# Format code
npm run format

# Check formatting
npm run format:check
```

## Output

The final `convex-knowledge.md` file contains:

1. **Development Patterns** - Blog articles with real-world examples and best practices
2. **Helper Utilities** - Community-contributed helper functions and utilities
3. **Official Documentation** - Complete API reference and implementation guides

The file is structured with clear sections, headers, and source attribution for easy LLM consumption.

## Use Cases

- **AI-Assisted Development**: Provide the knowledge file as context to LLMs (Claude, GPT, etc.) when working on Convex projects
- **Documentation Reference**: Offline access to comprehensive Convex knowledge
- **Team Onboarding**: Single source of truth for Convex development patterns and practices
- **Knowledge Base Maintenance**: Regularly updated aggregation of Convex ecosystem knowledge

## Architecture

- **Modular Scrapers**: Separate scrapers for each content source
- **Staged Processing**: Content is cleaned and formatted before aggregation
- **Temporary Storage**: Uses `tmp/` directories during processing
- **Single Output**: Final consolidated knowledge base in root directory

## Contributing

The scrapers are designed to handle content updates automatically. To refresh the knowledge base with latest content, simply run `npm run build`.

## License

ISC