-- Email notification system: notification_settings, email_events, system_announcements

-- 1. Enums for notification and email event types
CREATE TYPE public.job_match_email_frequency AS ENUM ('immediate', 'daily', 'weekly');

CREATE TYPE public.email_event_type AS ENUM (
  'job_match_digest',
  'subscription_update',
  'system_announcement'
);

CREATE TYPE public.email_event_status AS ENUM ('sent', 'failed');

-- 2. notification_settings: one row per profile, drives email preferences and digest timing
CREATE TABLE IF NOT EXISTS public.notification_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  job_match_email_enabled boolean NOT NULL DEFAULT true,
  job_match_email_frequency public.job_match_email_frequency NOT NULL DEFAULT 'daily',
  subscription_updates_email_enabled boolean NOT NULL DEFAULT true,
  system_announcements_email_enabled boolean NOT NULL DEFAULT true,
  email_unsubscribed_at timestamptz,
  last_job_match_email_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_settings_profile_id_key UNIQUE (profile_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_settings_profile_id
  ON public.notification_settings(profile_id);

-- 3. email_events: log of every email send attempt (debugging, deduping, metrics)
CREATE TABLE IF NOT EXISTS public.email_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  type public.email_event_type NOT NULL,
  subject text,
  template_key text,
  payload jsonb,
  sent_at timestamptz NOT NULL DEFAULT now(),
  provider_message_id text,
  status public.email_event_status NOT NULL,
  error_message text
);

CREATE INDEX IF NOT EXISTS idx_email_events_profile_id ON public.email_events(profile_id);
CREATE INDEX IF NOT EXISTS idx_email_events_sent_at ON public.email_events(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_events_type ON public.email_events(type);

-- 4. system_announcements: broadcast announcements sent to opted-in users
CREATE TABLE IF NOT EXISTS public.system_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  title text NOT NULL,
  email_subject text NOT NULL,
  email_body_html text NOT NULL,
  published_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT system_announcements_slug_key UNIQUE (slug)
);

CREATE INDEX IF NOT EXISTS idx_system_announcements_published_at
  ON public.system_announcements(published_at) WHERE published_at IS NOT NULL;

-- 5. RLS: notification_settings — users can read/update only their own row
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notification_settings" ON public.notification_settings;
CREATE POLICY "Users can view own notification_settings" ON public.notification_settings
  FOR SELECT TO authenticated
  USING (
    profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can update own notification_settings" ON public.notification_settings;
CREATE POLICY "Users can update own notification_settings" ON public.notification_settings
  FOR UPDATE TO authenticated
  USING (
    profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can insert own notification_settings" ON public.notification_settings;
CREATE POLICY "Users can insert own notification_settings" ON public.notification_settings
  FOR INSERT TO authenticated
  WITH CHECK (
    profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
  );

-- 6. RLS: email_events — users can read only their own events (service_role writes)
ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own email_events" ON public.email_events;
CREATE POLICY "Users can view own email_events" ON public.email_events
  FOR SELECT TO authenticated
  USING (
    profile_id IN (SELECT id FROM public.profiles WHERE auth_user_id = auth.uid())
  );

-- 7. RLS: system_announcements — readable by authenticated (for display); write via service_role only
ALTER TABLE public.system_announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view published system_announcements" ON public.system_announcements;
CREATE POLICY "Authenticated can view published system_announcements" ON public.system_announcements
  FOR SELECT TO authenticated
  USING (published_at IS NOT NULL);

-- 8. Grants
GRANT SELECT, INSERT, UPDATE ON public.notification_settings TO authenticated;
GRANT SELECT ON public.email_events TO authenticated;
GRANT SELECT ON public.system_announcements TO authenticated;

-- Service role needs full access for edge functions
GRANT ALL ON public.notification_settings TO service_role;
GRANT ALL ON public.email_events TO service_role;
GRANT ALL ON public.system_announcements TO service_role;

-- 9. Trigger: ensure notification_settings row exists when profile is created (optional; can be created on first read)
-- We create on first access from edge functions / frontend instead to keep migrations simple.
