# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Website for **Falcon Venture Group**, a consulting company (Delaware Corporation) that launches and grows businesses. CEO is Yulia Berman. The site establishes business credibility and supports YouTube AdSense verification via custom meta tags.

## Commands

- **Install**: `npm install`
- **Run locally**: `npm run dev` (uses nodemon for auto-reload) or `npm start`
- **Deploy**: `fly deploy` (requires fly.io CLI authenticated)
- Server runs on `http://localhost:3000` by default

## Architecture

Plain HTML templates + Tailwind CSS (CDN) + Express server. Zero build step.

### Content/Layout Separation

- **`content/*.md`** — Page content in Markdown with YAML frontmatter. This is what gets edited for text changes.
- **`content/site.json`** — Site-wide config: company name, nav links, meta tags, AdSense snippets, footer text.
- **`templates/*.html`** — HTML layout templates with `{{placeholder}}` variables. Rarely need changing.
- **`public/`** — Static assets (CSS, images).

### Key Files

- `server.js` — Express server (~200 lines). Routes, markdown rendering, template assembly, contact form handling.
- `content/site.json` — Most frequently edited config file. The `headSnippets` array injects arbitrary HTML into `<head>` (for AdSense verification, analytics, etc).
- `templates/base.html` — Base layout (nav, footer, head). Tailwind config lives here.

### Contact Form Anti-Spam

The contact form uses obfuscated field names (`f_a7x`, `f_q9m`, `f_k3p`) plus two honeypot fields (`website`, `email`) positioned offscreen. A timestamp check rejects submissions under 3 seconds. Spam submissions get a fake success response. Real field mapping: `f_a7x`=name, `f_q9m`=email, `f_k3p`=message.

### Email Configuration

Contact form requires these env vars for email delivery (logs to console if unset):
- `SMTP_HOST`, `SMTP_PORT` (default 587), `SMTP_USER`, `SMTP_PASS`

Set on fly.io with: `fly secrets set SMTP_HOST=... SMTP_USER=... SMTP_PASS=...`

## Content Editing Patterns

When Yulia asks to change page text, edit the corresponding `content/*.md` file. When she asks to change site-wide settings (company name, nav, footer, meta tags), edit `content/site.json`. When she asks to add a verification tag or analytics snippet, add it to the `headSnippets` array in `content/site.json`. Layout/style changes go in `templates/*.html` or `public/css/custom.css`.

## Deployment

Single fly.io machine (shared-cpu-1x, 256MB). Auto-stops when idle, auto-starts on request. Region: `ewr` (Newark). Config in `fly.toml`.
