// scripts/generate-seo-pages.mjs
//
// Static SEO page generator.
//
// Runs at Netlify build time, AFTER `vite build`. Reads whatever is currently
// in the `seo_pages` Supabase table (populated independently by n8n) and writes
// one crawlable static HTML file per indexed row into `dist/<url_path>/index.html`,
// then writes `dist/sitemap.xml`.
//
// This file touches NOTHING in the data pipeline. It is display-only.
//
// Security invariants:
//   - SUPABASE_SERVICE_ROLE_KEY is read from process.env ONLY. It is used solely
//     to query the table at build time. It is never logged and never written into
//     any generated file.
//
// The render/helper functions are exported so they can be unit-tested and
// exercised against fixtures. `main()` only runs when the file is invoked
// directly (see the guard at the bottom).

import { createClient } from '@supabase/supabase-js';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const SITE_SUFFIX = 'Job-Hopper';
const DIST_DIR = 'dist';

// --------------------------------------------------------------------------
// Escaping helpers
// --------------------------------------------------------------------------

/** Escape text for use in HTML element/attribute contexts. */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Serialize a value for embedding inside a <script type="application/ld+json">.
 * Escapes `<`, `>` and `&` so a value containing "</script>" (or an HTML comment
 * sequence) cannot break out of the script element.
 */
export function jsonLdScript(obj) {
  return JSON.stringify(obj, null, 2)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

// --------------------------------------------------------------------------
// URL / path helpers
// --------------------------------------------------------------------------

/** Join SITE_URL and a leading-slash url_path into one absolute URL. */
export function absoluteUrl(siteUrl, urlPath) {
  const origin = siteUrl.replace(/\/+$/, '');
  const path = urlPath.startsWith('/') ? urlPath : `/${urlPath}`;
  return `${origin}${path}`;
}

/**
 * Resolve the on-disk output file for a row, keyed DIRECTLY off url_path.
 * Strips the leading slash and writes to <distRoot>/<url_path>/index.html.
 * Throws if the path would escape the dist root (defensive; data is ours).
 */
export function outputFileForUrlPath(distRoot, urlPath) {
  const relative = urlPath.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!relative) {
    throw new Error(`Refusing to write for empty url_path: ${JSON.stringify(urlPath)}`);
  }
  const root = resolve(distRoot);
  const target = resolve(root, relative, 'index.html');
  if (target !== join(root, relative, 'index.html') || !target.startsWith(root + sep)) {
    throw new Error(`url_path resolves outside dist root, refusing: ${JSON.stringify(urlPath)}`);
  }
  return target;
}

// --------------------------------------------------------------------------
// Breadcrumb / related-search derivation (from url_path, no slug rebuild)
// --------------------------------------------------------------------------

/** Human-readable label from a url path segment: "software-engineer" -> "Software Engineer". */
export function humanizeSegment(segment) {
  return decodeURIComponent(segment)
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Breadcrumb trail derived from url_path segments. Each crumb has {name, urlPath}. */
export function breadcrumbTrail(urlPath) {
  const segments = urlPath.replace(/^\/+/, '').replace(/\/+$/, '').split('/').filter(Boolean);
  const crumbs = [{ name: 'Home', urlPath: '/' }];
  let acc = '';
  for (const seg of segments) {
    acc += `/${seg}`;
    crumbs.push({ name: humanizeSegment(seg), urlPath: acc });
  }
  return crumbs;
}

/**
 * Pick 3–5 related pages for `row` from the already-queried set `allRows`.
 * Prefers rows that share a url_path segment (same role or same location),
 * then fills with any other row. No extra DB calls.
 */
export function relatedPages(row, allRows, max = 5) {
  const own = new Set(row.url_path.split('/').filter(Boolean));
  const others = allRows.filter((r) => r.url_path !== row.url_path);
  const scored = others
    .map((r) => {
      const segs = r.url_path.split('/').filter(Boolean);
      const shared = segs.filter((s) => own.has(s)).length;
      return { r, shared };
    })
    .sort((a, b) => b.shared - a.shared);
  return scored.slice(0, max).map((s) => s.r);
}

// --------------------------------------------------------------------------
// Template selection
// --------------------------------------------------------------------------

/**
 * Choose the template for a row by page type. `page_type` may not exist yet;
 * read it defensively and default to the listing template.
 */
export function pickTemplate(row) {
  const type = row.page_type ?? 'listing';
  switch (type) {
    case 'content':
      return renderContentPage;
    case 'listing':
    default:
      return renderListingPage;
  }
}

// --------------------------------------------------------------------------
// Listing template
// --------------------------------------------------------------------------

/** Render one sample-listing card. `sponsorship_signal` is omitted when absent. */
function listingCard(listing) {
  const title = escapeHtml(listing?.title ?? '');
  const company = escapeHtml(listing?.company ?? '');
  const posted = escapeHtml(listing?.posted_date ?? '');
  const signal = listing?.sponsorship_signal;
  const signalHtml = signal
    ? `<span class="card-signal">Sponsorship: ${escapeHtml(signal)}</span>`
    : '';
  return `        <li class="job-card">
          <h3 class="card-title">${title}</h3>
          <div class="card-meta">
            <span class="card-company">${company}</span>
            ${posted ? `<span class="card-posted">Posted ${posted}</span>` : ''}
            ${signalHtml}
          </div>
        </li>`;
}

/**
 * Render a listing (aggregation) page.
 *
 * Structured data is ItemList + BreadcrumbList ONLY. JobPosting markup is
 * deliberately NOT emitted here: this is an aggregation page, and JobPosting on
 * an aggregation page risks a domain-wide Google manual action. Everything in
 * the JSON-LD is also rendered visibly on the page.
 */
export function renderListingPage(row, { siteUrl, related = [] }) {
  const canonical = absoluteUrl(siteUrl, row.url_path);
  const h1 = row.h1 ?? '';
  const title = `${h1} | ${SITE_SUFFIX}`;
  const metaDescription = row.meta_description ?? '';
  const jobCount = Number.isFinite(row.job_count) ? row.job_count : 0;
  const listings = Array.isArray(row.sample_listings) ? row.sample_listings : [];
  const crumbs = breadcrumbTrail(row.url_path);

  const breadcrumbNav = crumbs
    .map((c, i) =>
      i === crumbs.length - 1
        ? `<span aria-current="page">${escapeHtml(c.name)}</span>`
        : `<a href="${escapeHtml(c.urlPath)}">${escapeHtml(c.name)}</a>`,
    )
    .join('<span class="crumb-sep"> / </span>');

  const cards = listings.map(listingCard).join('\n');

  const relatedHtml = related.length
    ? `      <section class="related">
        <h2>Related searches</h2>
        <ul class="related-list">
${related
  .map((r) => `          <li><a href="${escapeHtml(r.url_path)}">${escapeHtml(r.h1 ?? r.url_path)}</a></li>`)
  .join('\n')}
        </ul>
      </section>`
    : '';

  // JSON-LD: ItemList of the visible sample listings + BreadcrumbList.
  const itemListLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: h1,
    numberOfItems: listings.length,
    itemListElement: listings.map((l, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: [l?.title, l?.company].filter(Boolean).join(' — '),
    })),
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: absoluteUrl(siteUrl, c.urlPath),
    })),
  };

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(metaDescription)}" />
  <link rel="canonical" href="${escapeHtml(canonical)}" />
  <script type="application/ld+json">
${jsonLdScript(itemListLd)}
  </script>
  <script type="application/ld+json">
${jsonLdScript(breadcrumbLd)}
  </script>
</head>
<body>
  <main class="seo-page seo-listing">
    <nav class="breadcrumb" aria-label="Breadcrumb">${breadcrumbNav}</nav>
    <header class="seo-header">
      <h1>${escapeHtml(h1)}</h1>
      <p class="job-count-badge">${escapeHtml(String(jobCount))} open ${jobCount === 1 ? 'role' : 'roles'}</p>
      <p class="intro">${escapeHtml(row.intro_copy ?? '')}</p>
    </header>
    <section class="listings">
      <ul class="job-cards">
${cards}
      </ul>
    </section>
    <section class="cta">
      <a class="cta-button" href="${escapeHtml(absoluteUrl(siteUrl, '/register'))}">See all ${escapeHtml(String(jobCount))} roles</a>
    </section>
${relatedHtml}
  </main>
</body>
</html>
`;
}

// --------------------------------------------------------------------------
// Content template (Type 3 problem/frustration pages) — STUB ONLY
// --------------------------------------------------------------------------

export function renderContentPage() {
  // TODO: content page template — built in a later task.
  // Will read a `page_data` jsonb column for the headline stat and emit
  // Article / FAQPage structured data. Not implemented yet, so fail loudly
  // rather than emit an empty/broken page if a content row appears early.
  throw new Error('Content page template not implemented yet (page_type="content").');
}

// --------------------------------------------------------------------------
// Sitemap
// --------------------------------------------------------------------------

/** Build sitemap.xml for the given rows (already indexed-only). Absolute URLs. */
export function buildSitemap(rows, siteUrl) {
  const urls = rows
    .map((row) => {
      const loc = escapeHtml(absoluteUrl(siteUrl, row.url_path));
      const lastmod = row.last_generated
        ? `\n    <lastmod>${escapeHtml(new Date(row.last_generated).toISOString())}</lastmod>`
        : '';
      return `  <url>\n    <loc>${loc}</loc>${lastmod}\n  </url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function main() {
  const supabaseUrl = requireEnv('SUPABASE_URL');
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  // SITE_URL is required: canonical tags and the sitemap need the real origin.
  const siteUrl = requireEnv('SITE_URL');

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: rows, error } = await supabase
    .from('seo_pages')
    .select('*')
    .eq('indexed', true);

  if (error) {
    throw new Error(`Failed to query seo_pages: ${error.message}`);
  }

  const pages = rows ?? [];
  console.log(`Generating ${pages.length} indexed SEO page(s)...`);

  let written = 0;
  for (const row of pages) {
    const template = pickTemplate(row);
    const html = template(row, { siteUrl, related: relatedPages(row, pages) });
    const outFile = outputFileForUrlPath(DIST_DIR, row.url_path);
    await mkdir(dirname(outFile), { recursive: true });
    await writeFile(outFile, html, 'utf8');
    written += 1;
  }

  // Sitemap is written last, after every page exists.
  const sitemap = buildSitemap(pages, siteUrl);
  await writeFile(join(DIST_DIR, 'sitemap.xml'), sitemap, 'utf8');

  console.log(`Wrote ${written} page(s) and dist/sitemap.xml`);
}

// Only run main() when invoked directly (not when imported for tests/fixtures).
const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((err) => {
    // Never log env values; only the error message.
    console.error(err.message);
    process.exit(1);
  });
}
