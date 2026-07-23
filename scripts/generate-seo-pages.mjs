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

//
// Resilience invariant:
//   - This generator runs on EVERY Netlify build, including plain app deploys.
//     A single malformed/unsupported row must never fail the build. Such rows are
//     warned about and skipped; every other page is still generated.
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
 *
 * Returns `null` for any page type we cannot render yet. Callers must skip
 * null rows — never fail the build over one unsupported row.
 */
export function pickTemplate(row) {
  const type = row.page_type ?? 'listing';
  switch (type) {
    case 'listing':
      return renderListingPage;
    case 'content':
      return renderContentPage;
    default:
      return null;
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
export function renderListingPage(row, { siteUrl, related = [], signupUrl = '/register' }) {
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
  <link rel="stylesheet" href="/seo-pages.css" />
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
      <a class="cta-button" href="${escapeHtml(signupUrl)}">See all ${escapeHtml(String(jobCount))} roles</a>
    </section>
${relatedHtml}
  </main>
</body>
</html>
`;
}

// --------------------------------------------------------------------------
// Content template (Type 3 stat/editorial pages)
// --------------------------------------------------------------------------

/** 16000 -> "16,000". Falls back to "0" for non-finite input. */
function formatNumber(n) {
  return Number.isFinite(n) ? n.toLocaleString('en-US') : '0';
}

/** ISO string for a date-ish value, or undefined if absent/unparseable. */
function toIso(value) {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/**
 * Breadcrumb for content pages: Home / Career Advice / {section}. Deliberately
 * NOT the listing template's url-segment breadcrumb — "Jobs" and "Jobs / Ghost
 * Jobs" have no real page behind them (bare /jobs redirects to /dashboard, and
 * there's no hub page for /jobs/ghost-jobs), so linking those crumbs 404s.
 */
function contentBreadcrumb(row) {
  const pd = row.page_data ?? {};
  let section;
  if (row.url_path.startsWith('/jobs/ghost-jobs/')) {
    section = `Ghost Jobs · ${pd.city_name ?? humanizeSegment(row.url_path.split('/').filter(Boolean).pop())}`;
  } else {
    section = humanizeSegment(row.url_path.split('/').filter(Boolean).pop());
  }
  return [
    { name: 'Home', urlPath: '/' },
    { name: 'Career Advice', urlPath: null },
    { name: section, urlPath: row.url_path },
  ];
}

/**
 * Up to `max` OTHER content pages for "Related reading", highest ghost rate
 * first (rows without a numeric ghost_rate_pct, e.g. the resume-advice hook
 * page, sort last but are still eligible). Pulled from the already-queried
 * set; no extra DB calls.
 */
export function relatedContentPages(row, allRows, max = 5) {
  return allRows
    .filter((r) => r.url_path !== row.url_path && (r.page_type ?? 'listing') === 'content')
    .sort(
      (a, b) =>
        Number(b.page_data?.ghost_rate_pct ?? -1) - Number(a.page_data?.ghost_rate_pct ?? -1),
    )
    .slice(0, max);
}

/**
 * CTA target/label for a content row. City ghost-jobs pages try to link the
 * matching Type 1 listing page (same city slug, among already-queried rows);
 * everything else falls back to signupUrl. Deliberately never includes a
 * number in the label (a 0%-fresh city would otherwise read "0 listings").
 */
function contentCta(row, allRows, signupUrl) {
  const pd = row.page_data ?? {};
  if (typeof pd.ghost_rate_pct !== 'number') {
    return { href: signupUrl, label: 'Get your free resume check' };
  }
  if (pd.city_name && pd.scope !== 'national') {
    const citySlug = row.url_path.split('/').filter(Boolean).pop();
    const match = allRows.find(
      (r) =>
        (r.page_type ?? 'listing') === 'listing' &&
        r.url_path.split('/').filter(Boolean).pop() === citySlug,
    );
    if (match) {
      return { href: match.url_path, label: `See verified fresh ${pd.city_name} listings` };
    }
  }
  return { href: signupUrl, label: 'Browse verified job listings' };
}

/**
 * Render a content (stat/editorial) page. No job grid, no ItemList/JobPosting
 * JSON-LD — this is an Article. Branches on `page_data.ghost_rate_pct`: only
 * render the stat callout when it's actually a number (some content rows,
 * e.g. the resume-advice hook page, have no stat at all).
 */
export function renderContentPage(row, { siteUrl, signupUrl = '/register', allRows = [] } = {}) {
  const pd = row.page_data;
  if (!pd || typeof pd !== 'object') {
    throw new Error(`content row has missing/invalid page_data: ${row.url_path}`);
  }

  const canonical = absoluteUrl(siteUrl, row.url_path);
  const h1 = row.h1 ?? '';
  const title = `${h1} | ${SITE_SUFFIX}`;
  const metaDescription = row.meta_description ?? '';
  const crumbs = contentBreadcrumb(row);
  const hasStat = typeof pd.ghost_rate_pct === 'number';

  const breadcrumbNav = crumbs
    .map((c, i) =>
      i === crumbs.length - 1
        ? `<span aria-current="page">${escapeHtml(c.name)}</span>`
        : c.urlPath
          ? `<a href="${escapeHtml(c.urlPath)}">${escapeHtml(c.name)}</a>`
          : `<span>${escapeHtml(c.name)}</span>`,
    )
    .join('<span class="crumb-sep"> / </span>');

  const statHtml = hasStat
    ? `    <section class="stat-callout">
      <p class="stat-percent">${escapeHtml(String(pd.ghost_rate_pct))}%</p>
      <p class="stat-label">of postings tracked may no longer be active</p>
      <p class="stat-note">Based on how long each posting has been live — a staleness proxy, not a confirmed count of filled or fake roles.</p>
      <dl class="stat-details">
        <div><dt>Total postings tracked</dt><dd>${formatNumber(pd.total_postings)}</dd></div>
        <div><dt>Stale (${formatNumber(pd.stale_threshold_days)}+ days old)</dt><dd>${formatNumber(pd.stale_postings)}</dd></div>
        <div><dt>Fresh (posted in last ${formatNumber(pd.fresh_threshold_days)} days)</dt><dd>${formatNumber(pd.fresh_count)}</dd></div>
      </dl>
    </section>`
    : '';

  const cta = contentCta(row, allRows, signupUrl);

  const contentRelated = relatedContentPages(row, allRows);
  const relatedHtml = contentRelated.length
    ? `      <section class="related">
        <h2>Related reading</h2>
        <ul class="related-list">
${contentRelated
  .map((r) => `          <li><a href="${escapeHtml(r.url_path)}">${escapeHtml(r.h1 ?? r.url_path)}</a></li>`)
  .join('\n')}
        </ul>
      </section>`
    : '';

  const articleLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: h1,
    description: metaDescription,
    datePublished: toIso(pd.computed_at) ?? toIso(row.last_generated),
    dateModified: toIso(row.last_generated) ?? toIso(pd.computed_at),
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      ...(c.urlPath ? { item: absoluteUrl(siteUrl, c.urlPath) } : {}),
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
  <link rel="stylesheet" href="/seo-pages.css" />
  <script type="application/ld+json">
${jsonLdScript(articleLd)}
  </script>
  <script type="application/ld+json">
${jsonLdScript(breadcrumbLd)}
  </script>
</head>
<body>
  <main class="seo-page seo-content">
    <nav class="breadcrumb" aria-label="Breadcrumb">${breadcrumbNav}</nav>
    <header class="seo-header">
      <h1>${escapeHtml(h1)}</h1>
    </header>
${statHtml}
    <section class="content-body">
      <p class="intro">${escapeHtml(row.intro_copy ?? '')}</p>
    </section>
    <section class="cta">
      <a class="cta-button" href="${escapeHtml(cta.href)}">${escapeHtml(cta.label)}</a>
    </section>
${relatedHtml}
  </main>
</body>
</html>
`;
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

  // SIGNUP_URL decouples the CTA from this origin (the app may live elsewhere).
  // Optional: fall back to a relative /register, but warn so the fallback is visible.
  const signupUrl = process.env.SIGNUP_URL;
  if (!signupUrl) {
    console.warn('WARNING: SIGNUP_URL is unset; CTA falling back to relative "/register".');
  }
  const ctaHref = signupUrl || '/register';

  const pages = rows ?? [];
  console.log(`Generating ${pages.length} indexed SEO page(s)...`);

  const generated = [];
  const skipped = [];
  for (const row of pages) {
    const template = pickTemplate(row);
    if (!template) {
      // Unknown/unsupported page_type: skip this row, never fail the build.
      console.warn(
        `WARNING: skipping ${row.url_path} — unsupported page_type "${row.page_type ?? 'listing'}".`,
      );
      skipped.push(row.url_path);
      continue;
    }
    try {
      const html = template(row, {
        siteUrl,
        signupUrl: ctaHref,
        related: relatedPages(row, pages),
        allRows: pages,
      });
      if (html == null) {
        // Template declined to render (e.g. content row with missing page_data).
        console.warn(`WARNING: skipping ${row.url_path} — missing/invalid page_data.`);
        skipped.push(row.url_path);
        continue;
      }
      const outFile = outputFileForUrlPath(DIST_DIR, row.url_path);
      await mkdir(dirname(outFile), { recursive: true });
      await writeFile(outFile, html, 'utf8');
      generated.push(row);
    } catch (rowErr) {
      // A malformed row must not take the whole build (and the site) down.
      console.warn(`WARNING: skipping ${row.url_path} — render failed: ${rowErr.message}`);
      skipped.push(row.url_path);
    }
  }

  // Sitemap is written last, after every page exists. Only successfully
  // generated pages are listed (skipped rows have no file to serve).
  const sitemap = buildSitemap(generated, siteUrl);
  await writeFile(join(DIST_DIR, 'sitemap.xml'), sitemap, 'utf8');

  console.log(
    `SEO generation complete: ${generated.length} generated, ${skipped.length} skipped.` +
      (skipped.length ? ` Skipped: ${skipped.join(', ')}` : ''),
  );
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
