-- Add a nullable radius column (in miles) to profiles for distance-based job matching.
alter table public.profiles
  add column if not exists location_radius_miles integer;

