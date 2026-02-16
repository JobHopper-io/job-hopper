-- One-off: convert any legacy label values in users.target_role_categories to canonical values.
-- Labels (old) -> values (current): e.g. 'Operations / Production' -> 'operations'.
-- Run once; after this, app expects only values in target_role_categories.

UPDATE users u
SET target_role_categories = (
  SELECT array_agg(
    CASE elem
      WHEN 'Operations / Production' THEN 'operations'
      WHEN 'Maintenance / Technical' THEN 'maintenance'
      WHEN 'Engineering' THEN 'engineering'
      WHEN 'Supervisory / Management' THEN 'management'
      WHEN 'Director / VP / Executive' THEN 'executive'
      WHEN 'Other' THEN 'other'
      ELSE elem
    END
  )
  FROM unnest(COALESCE(u.target_role_categories, ARRAY[]::text[])) AS elem
)
WHERE u.target_role_categories IS NOT NULL
  AND array_length(u.target_role_categories, 1) > 0;
