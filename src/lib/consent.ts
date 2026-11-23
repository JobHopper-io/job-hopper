/**
 * Consent wordings shown in the app. Each version and its exact text are also seeded in
 * public.consent_wordings (migration 20261121120000); a consent_records row stores the
 * version the person saw. Changing a text means a new version in both places, never an
 * edit of an existing one.
 */

export const MARKETING_EMAIL_WORDING_VERSION = 'marketing_email_v1'
export const MARKETING_EMAIL_WORDING_TEXT =
  'Send me job search tips, product news and offers by email. Optional. Unsubscribe anytime.'

export const SMS_WORDING_VERSION = 'sms_v1'
