// Outbound email templates, shared by the Node scripts (scripts/outbound-dry-run.mjs,
// scripts/outbound-live-send.mjs) and the outreach-sequences edge function
// (_shared/outreach-sequences.ts). No imports at all, so both Node and Deno load it.
//
// Institutional stage 1 is the original reviewed copy from persona-campaign-copy.md
// (moved here unchanged from outbound-dry-run.mjs). Everything marked DRAFT below is new
// copy pending approval: institutional stages 2-4 (pain point, personal help, final
// follow-up) and all four job-seeker stages. The drafts never name jobs or employers,
// quote prices or promise sponsorship.

export const PARTNER_PAGE_BASE = 'https://job-hopper.io';
const PARTNER_PAGE_PATHS = {
  university: '/universities',
  employer: '/outplacement',
  career_partner: '/career-coaches',
};

function utmQuery(campaign) {
  return new URLSearchParams({ utm_source: 'email_outbound', utm_campaign: campaign, utm_medium: 'email' });
}

// Where each outbound category's CTA link lands -- the partner landing pages (see
// src/views/*.vue), UTM-tagged so App.vue's existing capture attributes the resulting
// signup back to this exact campaign. immigration_professional/workforce_org have no
// outbound template (no connector produces those leads), so no path is needed for them.
export function partnerLeadUrl(category, campaign) {
  const path = PARTNER_PAGE_PATHS[category];
  if (!path) return null;
  return `${PARTNER_PAGE_BASE}${path}?${utmQuery(campaign)}`;
}

// Real copy from persona-campaign-copy.md, plus a career_partner template (the
// career-partner connector has since discovered real leads, see docs/apollo-limits.md).
// Grounded in the same real, reviewed copy as src/views/CareerCoaches.vue.
export const TEMPLATES = {
  university: {
    subject: 'Job-Hopper for [School Name] career services',
    body: `Hi [Name],

I run product at Job-Hopper. We help international students and visa-seeking grads find
employers that actually sponsor, backed by real DOL and USCIS filing data instead of
guesswork.

[School Name] has [X,XXX] students, which puts you in range for a campus license we'd
size around [seat range]. Happy to send over what that'd look like, no pitch
attached, just numbers.

What's the best way to get this in front of whoever handles vendor decisions for career
services?

More info: [Link]

[Your Name]
Job-Hopper`,
  },
  employer: {
    subject: 'Career transition support for the [Company] team',
    body: `Hi [Name],

Saw [Company]'s WARN notice for [X] affected employees in [location]. Job-Hopper helps
laid-off professionals find their next role faster, particularly useful for anyone on a
visa who's also racing a clock most people don't have to think about.

We put together transition packages for situations like this, [seat range], no cost to
the affected employees. Can send specifics if useful.

More info: [Link]

[Your Name]
Job-Hopper`,
  },
  career_partner: {
    subject: 'Job-Hopper partnership for [Organization]',
    body: `Hi [Name],

I run product at Job-Hopper. We match visa-seeking job seekers to employers verified
against real DOL and USCIS filing history, not a guessed "sponsors visas" tag — plus
resume advice and interview prep built in.

Thought this could be useful alongside what you already do at [Organization]. Happy to
set up a trial so you can see the match quality yourself.

More info: [Link]

[Your Name]
Job-Hopper`,
  },
};

// Used instead of TEMPLATES when the same contact_email resolves for more than one lead
// in one batch: drops every claim that's true of only one of the merged leads (student
// count, worker count, single campus name) and keeps only what's true of the group.
export const GENERIC_TEMPLATES = {
  university: {
    subject: 'Job-Hopper for your campus career services team',
    body: `Hi [Name],

I run product at Job-Hopper. We help international students and visa-seeking grads find
employers that actually sponsor, backed by real DOL and USCIS filing data instead of
guesswork.

Given the size of your student population, you'd likely be in range for a campus license.
Happy to send over what that could look like, no pitch attached, just numbers.

What's the best way to get this in front of whoever handles vendor decisions for career
services?

More info: [Link]

[Your Name]
Job-Hopper`,
  },
  employer: {
    subject: 'Career transition support for your team',
    body: `Hi [Name],

Saw your organization's recent WARN notice. Job-Hopper helps laid-off professionals find
their next role faster, particularly useful for anyone on a visa who's also racing a clock
most people don't have to think about.

We put together transition packages for situations like this, custom-sized to the group
affected, no cost to the affected employees. Can send specifics if useful.

More info: [Link]

[Your Name]
Job-Hopper`,
  },
  career_partner: {
    subject: 'Job-Hopper partnership opportunity',
    body: `Hi [Name],

I run product at Job-Hopper. We match visa-seeking job seekers to employers verified
against real DOL and USCIS filing history, not a guessed "sponsors visas" tag — plus
resume advice and interview prep built in.

Happy to set up a trial so you can see the match quality yourself.

More info: [Link]

[Your Name]
Job-Hopper`,
  },
};

// Reply-To routing by lead category. Both are real monitored mailboxes on
// job-hopper.co (Cloudflare Email Routing -> reply-ingest).
export const REPLY_TO_UNIVERSITY = 'university-partnerships@job-hopper.co';
export const REPLY_TO_DEFAULT = 'partnerships@job-hopper.co';

export function replyToForCategory(category) {
  return category === 'university' ? REPLY_TO_UNIVERSITY : REPLY_TO_DEFAULT;
}

// From-name routing, same split as Reply-To. The from *address* never changes.
export const FROM_NAME_UNIVERSITY = 'Job-Hopper University Partnerships';
export const FROM_NAME_DEFAULT = 'Job-Hopper Partnerships';

export function fromNameForCategory(category) {
  return category === 'university' ? FROM_NAME_UNIVERSITY : FROM_NAME_DEFAULT;
}

export function fill(text, replacements) {
  let out = text;
  for (const [token, value] of Object.entries(replacements)) {
    out = out.split(token).join(value);
  }
  return out;
}

export function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// The HTML body swaps the "More info: <url>" line for a real link with clean anchor
// text; everything else gets paragraph/line-break formatting.
export function renderHtmlBody(body, link) {
  const paragraphs = escapeHtml(body)
    .split('\n\n')
    .map((para) => `<p style="margin:0 0 1em;">${para.replace(/\n/g, '<br>')}</p>`)
    .join('\n');
  if (!link) return paragraphs;
  const escapedLink = escapeHtml(link);
  return paragraphs.replace(`More info: ${escapedLink}`, `More info: <a href="${escapedLink}">Learn more</a>`);
}

// [Name] is the recipient's first name (decision_maker_name); [Your Name] the sender.
export function firstName(fullName) {
  return typeof fullName === 'string' && fullName.trim() ? fullName.trim().split(/\s+/)[0] : null;
}

export function unfilledPlaceholders(subject, body) {
  return [...new Set([...subject.matchAll(/\[[^\]]+\]/g), ...body.matchAll(/\[[^\]]+\]/g)].map((m) => m[0]))];
}

function leadReplacements(category, lead, campaign, senderName) {
  const common = {
    '[Name]': firstName(lead.decision_maker_name) || '[Name]',
    '[Your Name]': senderName,
    '[Link]': partnerLeadUrl(category, campaign) || '[Link]',
  };
  if (category === 'university') {
    return {
      ...common,
      '[School Name]': lead.organization_name,
      '[X,XXX]': lead.student_size != null ? lead.student_size.toLocaleString('en-US') : '[X,XXX]',
      '[seat range]': lead.recommended_package || '[seat range]',
    };
  }
  if (category === 'employer') {
    return {
      ...common,
      '[Company]': lead.organization_name,
      '[X]': lead.signals?.workers_affected != null ? lead.signals.workers_affected.toLocaleString('en-US') : '[X]',
      '[location]': [lead.city, lead.state].filter(Boolean).join(', ') || '[location]',
      '[seat range]': lead.recommended_package || '[seat range]',
    };
  }
  return { ...common, '[Organization]': lead.organization_name };
}

function renderWith(template, replacements) {
  const subject = fill(template.subject, replacements);
  const body = fill(template.body, replacements);
  const link = replacements['[Link]'] !== '[Link]' ? replacements['[Link]'] : null;
  return { subject, body, html: renderHtmlBody(body, link), unfilled: unfilledPlaceholders(subject, body) };
}

/** The original stage-1 institutional email. */
export function renderTemplate(category, lead, campaign, senderName) {
  return renderWith(TEMPLATES[category], leadReplacements(category, lead, campaign, senderName));
}

// --- Outreach sequences ---------------------------------------------------------------

/** Stage n (1-4) is due this many days after stage 1 went out (the plan's Day 1/3/5/7). */
export const OUTREACH_STAGE_OFFSETS_DAYS = [0, 2, 4, 6];
export const OUTREACH_STAGES = OUTREACH_STAGE_OFFSETS_DAYS.length;

export const outreachSequenceKey = (campaign) => `outreach_${campaign}`;
/** email_events.campaign and utm_campaign for one outreach email. */
export const outreachCampaign = (campaign, stage) => `outreach_${campaign}_s${stage}`;

// DRAFT, pending approval: institutional stages 2-4 per category.
//   2: the pain point   3: personal help   4: final follow-up
export const LEAD_FOLLOWUPS = {
  university: {
    2: {
      subject: 'Re: Job-Hopper for [School Name] career services',
      body: `Hi [Name],

One thing we hear from career services teams: international students spend weeks
applying to employers that have never sponsored a visa, and advisors have no quick way to
tell them which ones have.

Job-Hopper answers that from public DOL and USCIS filing records, employer by employer,
so students can focus on the ones with a real sponsorship history.

More info: [Link]

[Your Name]
Job-Hopper`,
    },
    3: {
      subject: 'A quick check for [School Name]?',
      body: `Hi [Name],

If it would help, send me a few employers your students are targeting this year and I'll
show you what the public filing records say about each one's sponsorship history. No
strings attached; it's the quickest way to see whether this is useful for your team.

[Your Name]
Job-Hopper`,
    },
    4: {
      subject: 'Closing the loop',
      body: `Hi [Name],

I won't keep filling your inbox, so this is my last note. If sponsorship data for your
international students becomes a priority later, just reply to this email and I'll pick
it back up.

More info: [Link]

[Your Name]
Job-Hopper`,
    },
  },
  employer: {
    2: {
      subject: 'Re: Career transition support for the [Company] team',
      body: `Hi [Name],

For employees on a work visa, a layoff starts a short clock to find a new employer, on
top of everything else a job search involves. Generic job boards don't show which
employers have a history of sponsoring.

Job-Hopper matches people to roles and shows each employer's sponsorship history from
public DOL and USCIS filings, so the people affected can focus their search.

More info: [Link]

[Your Name]
Job-Hopper`,
    },
    3: {
      subject: 'Transition support for [Company]: happy to outline it',
      body: `Hi [Name],

If it's useful, I can put together a short outline of what transition support would look
like for the [Company] team: how people get set up and what they'd see, at no cost to the
affected employees. Just reply and tell me who should receive it.

[Your Name]
Job-Hopper`,
    },
    4: {
      subject: 'Closing the loop',
      body: `Hi [Name],

This is my last note, I don't want to crowd your inbox during a busy time. If transition
support for your team becomes useful later, reply here and I'll get it moving.

More info: [Link]

[Your Name]
Job-Hopper`,
    },
  },
  career_partner: {
    2: {
      subject: 'Re: Job-Hopper partnership for [Organization]',
      body: `Hi [Name],

A question clients often bring to career coaches: which employers actually sponsor? Most
lists online are guesses or years out of date.

Job-Hopper checks employers against public DOL and USCIS filing history, so you and your
clients can see real sponsorship records instead of a guessed label.

More info: [Link]

[Your Name]
Job-Hopper`,
    },
    3: {
      subject: 'Want to try it with a client?',
      body: `Hi [Name],

If it helps, I can set up a trial so you can try Job-Hopper with one of your clients and
judge the match quality yourself. Reply and I'll walk you through it.

[Your Name]
Job-Hopper`,
    },
    4: {
      subject: 'Closing the loop',
      body: `Hi [Name],

Last note from me. If a partnership becomes interesting later, reply to this email and
I'll pick it up from there.

More info: [Link]

[Your Name]
Job-Hopper`,
    },
  },
};

// DRAFT, pending approval: job-seeker prospects, all four stages. Stage 1 is the Day 3
// shortlist email: 3-5 verified jobs inline plus the /s/:token page link ([Jobs] and
// [Shortlist] are filled by renderOutreach from the prospect's ready shortlist). It names
// only jobs on that shortlist, makes no sponsorship claim and quotes no prices.
// [Role] falls back to "your next role".
export const PROSPECT_STAGES = {
  1: {
    subject: 'A shortlist of [Role] jobs for you',
    body: `Hi [Name],

I put together a short list of [Role] jobs that match what you're looking for:

[Jobs]

We checked that each one still looked open when we made the list, but jobs can close at
any time. See why each one fits, and apply, here: [Shortlist]

The list stays up for 14 days.

[Your Name]
Job-Hopper`,
  },
  2: {
    subject: 'Less time searching job boards',
    body: `Hi [Name],

Searching job boards one at a time takes hours, and most listings don't tell you whether
the employer has ever sponsored a visa. Job-Hopper brings matching roles to you and shows
that history for each employer.

Take a look: [Link]

[Your Name]
Job-Hopper`,
  },
  3: {
    subject: 'Can we help with your search?',
    body: `Hi [Name],

If you tell us what you're looking for (the role, the location, whether you'll need
sponsorship), someone on our team will reply personally and point you in the right
direction. Just reply to this email.

[Your Name]
Job-Hopper`,
  },
  4: {
    subject: 'Last note from Job-Hopper',
    body: `Hi [Name],

This is my last email. If you want to try Job-Hopper later, your link is here: [Link]

Good luck with your search.

[Your Name]
Job-Hopper`,
  },
};

const PROSPECT_FROM_NAME = 'Job-Hopper';

/** The public shortlist page for a token, UTM-tagged with the outreach campaign. */
export function shortlistPageUrl(token, campaign) {
  return `${PARTNER_PAGE_BASE}/s/${encodeURIComponent(token)}?${utmQuery(campaign)}`;
}

export const SHORTLIST_EMAIL_MIN_JOBS = 3;
export const SHORTLIST_EMAIL_MAX_JOBS = 5;

// Square brackets in job text would read as unfilled [Placeholders] and block the send.
const plain = (v) => String(v ?? '').replace(/\[/g, '(').replace(/\]/g, ')').replace(/\s+/g, ' ').trim();

/** "- Title, Company (Location)" lines for 3-5 shortlist jobs. Throws outside that range. */
export function shortlistJobLines(jobs) {
  if (!Array.isArray(jobs) || jobs.length < SHORTLIST_EMAIL_MIN_JOBS) {
    throw new Error(`Shortlist email needs at least ${SHORTLIST_EMAIL_MIN_JOBS} jobs`);
  }
  return jobs.slice(0, SHORTLIST_EMAIL_MAX_JOBS).map((j) => {
    const where = plain(j.location);
    const company = plain(j.company);
    return `- ${plain(j.title) || 'Untitled role'}${company ? `, ${company}` : ''}${where ? ` (${where})` : ''}`;
  }).join('\n');
}

/** Signup link for a job-seeker prospect, UTM-tagged with the outreach campaign. */
export function prospectSignupUrl(campaign) {
  return `${PARTNER_PAGE_BASE}/register?${utmQuery(campaign)}`;
}

/**
 * One outreach email (without the footer, which the sender appends). subject is
 * { kind: 'lead', lead } or { kind: 'prospect', prospect }; campaign is the base tag.
 * Returns { subject, body, html, unfilled, fromName, replyTo, templateKey, draft }.
 */
export function renderOutreach({ subject: who, stage, campaign, senderName }) {
  const tag = outreachCampaign(campaign, stage);
  if (who.kind === 'lead') {
    const { category } = who.lead;
    const replacements = leadReplacements(category, who.lead, tag, senderName);
    const template = stage === 1 ? TEMPLATES[category] : LEAD_FOLLOWUPS[category]?.[stage];
    if (!template) throw new Error(`No outreach template for ${category} stage ${stage}`);
    return {
      ...renderWith(template, replacements),
      fromName: fromNameForCategory(category),
      replyTo: replyToForCategory(category),
      templateKey: `outreach_${category}_s${stage}`,
      draft: stage > 1,
    };
  }
  const template = PROSPECT_STAGES[stage];
  if (!template) throw new Error(`No outreach template for prospect stage ${stage}`);
  const role = typeof who.prospect.target_job_title === 'string' && who.prospect.target_job_title.trim()
    ? who.prospect.target_job_title.trim()
    : null;
  const link = stage === 1 ? null : prospectSignupUrl(tag);
  const replacements = {
    '[Name]': firstName(who.prospect.first_name) || 'there',
    '[Your Name]': senderName,
    '[Link]': link ?? '[Link]',
  };
  if (stage === 1) {
    // The shortlist email: never sent without a ready shortlist of 3-5 jobs.
    if (!who.shortlist?.token) throw new Error('Prospect stage 1 needs a ready shortlist');
    replacements['[Jobs]'] = shortlistJobLines(who.shortlist.jobs);
    replacements['[Shortlist]'] = shortlistPageUrl(who.shortlist.token, tag);
  }
  const filled = renderWith(
    {
      subject: role ? template.subject.replace('[Role]', role) : template.subject.replace('[Role] jobs', 'jobs').replace('Your [Role] search', 'Your job search'),
      body: template.body.replace('[Role] jobs', role ? `${role} jobs` : 'jobs').replace('[Role] work', role ? `${role} work` : 'your next role'),
    },
    replacements,
  );
  const url = stage === 1 ? replacements['[Shortlist]'] : link;
  const anchor = stage === 1 ? 'See your shortlist' : url;
  return {
    ...filled,
    html: filled.html.replace(escapeHtml(url), `<a href="${escapeHtml(url)}">${escapeHtml(anchor)}</a>`),
    fromName: PROSPECT_FROM_NAME,
    // ponytail: job seekers reply to the general partnerships inbox (routed into
    // reply-ingest) until a job-seeker inbox exists.
    replyTo: REPLY_TO_DEFAULT,
    templateKey: `outreach_prospect_s${stage}`,
    draft: true,
  };
}
