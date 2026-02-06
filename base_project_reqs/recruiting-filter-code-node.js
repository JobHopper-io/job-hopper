/**
 * Recruiting company exclusion – four-layer filter (n8n Code node or Node script).
 * SOW: nick-schepis-job-scraping-automation-sow.md Phase 3.
 * Input: items with { title, company_name, url, source, ... } and optional company_enrichment { industry, sic_code }.
 * Output: items with _filter_result: { excluded: boolean, layer?: string, reason?: string }.
 * Config can be passed in or read from env; for n8n, pass config as staticData or from a previous node.
 */

const DEFAULT_SIC = ['7361', '7363', '6411', '8742'];
const DEFAULT_NAME_PATTERNS = ['Staffing', 'Recruiting', 'Professionals Worldwide'];
const DEFAULT_INDUSTRY_LABELS = ['Staffing', 'HR Consulting', 'Business Consulting', 'Consulting'];

function getConfig(cfg) {
  return {
    sicCodes: (cfg?.recruiting_sic_codes && JSON.parse(cfg.recruiting_sic_codes)) || DEFAULT_SIC,
    namePatterns: (cfg?.recruiting_company_name_patterns && JSON.parse(cfg.recruiting_company_name_patterns)) || DEFAULT_NAME_PATTERNS,
    industryLabels: (cfg?.recruiting_industry_labels && JSON.parse(cfg.recruiting_industry_labels)) || DEFAULT_INDUSTRY_LABELS,
    manualList: (cfg?.recruiting_company_manual_list && JSON.parse(cfg.recruiting_company_manual_list)) || [],
  };
}

function layer1Sic(enrichment, config) {
  if (!enrichment?.sic_code && !enrichment?.industry) return null;
  const sic = String(enrichment.sic_code || '').trim();
  const industry = String(enrichment.industry || '').trim();
  const sicMatch = config.sicCodes.some((c) => sic.startsWith(c) || sic === c);
  const industryMatch = config.industryLabels.some((l) => industry.toLowerCase().includes(l.toLowerCase()));
  if (sicMatch || industryMatch) return { layer: 'layer1_sic', reason: sicMatch ? `SIC ${sic}` : `Industry ${industry}` };
  return null;
}

function layer2CompanyName(companyName, config) {
  const name = (companyName || '').toLowerCase();
  const match = config.namePatterns.find((p) => name.includes(p.toLowerCase()));
  if (match) return { layer: 'layer2_company_name', reason: `Pattern: ${match}` };
  return null;
}

function layer3TitleIndustryMismatch(title, enrichment, config) {
  if (!enrichment?.industry) return null;
  const industry = (enrichment.industry || '').toLowerCase();
  const isRecruitingIndustry = config.industryLabels.some((l) => industry.includes(l.toLowerCase()));
  if (!isRecruitingIndustry) return null;
  const directHireKeywords = ['maintenance', 'operator', 'technician', 'plant manager', 'production', 'manufacturing', 'machine'];
  const titleLower = (title || '').toLowerCase();
  const looksDirectHire = directHireKeywords.some((k) => titleLower.includes(k));
  if (looksDirectHire) return { layer: 'layer3_title_industry_mismatch', reason: `Title "${title}" vs industry "${enrichment.industry}"` };
  return null;
}

function layer4ManualList(companyName, config) {
  const normalized = (companyName || '').toLowerCase().trim();
  const inList = (config.manualList || []).some((c) => c.toLowerCase().trim() === normalized);
  if (inList) return { layer: 'layer4_manual_list', reason: 'On manual exclusion list' };
  return null;
}

function evaluate(job, config) {
  const enrichment = job.company_enrichment || {};
  const r1 = layer1Sic(enrichment, config);
  if (r1) return { excluded: true, ...r1 };
  const r2 = layer2CompanyName(job.company_name, config);
  if (r2) return { excluded: true, ...r2 };
  const r3 = layer3TitleIndustryMismatch(job.title, enrichment, config);
  if (r3) return { excluded: true, ...r3 };
  const r4 = layer4ManualList(job.company_name, config);
  if (r4) return { excluded: true, ...r4 };
  return { excluded: false, layer: 'passed', reason: null };
}

// n8n: use $input.all() and return items with _filter_result; config from $getNodeParameter or staticData
// Node/script: pass array of jobs and config object
function runFilter(items, configInput) {
  const config = getConfig(configInput || {});
  return items.map((item) => {
    const job = typeof item.json !== 'undefined' ? item.json : item;
    const result = evaluate(job, config);
    return { json: { ...job, _filter_result: result } };
  });
}

// Export for Node/script usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { runFilter, evaluate, getConfig };
}
