alter table "public"."exclusion_lists"
  add column company_name text;

-- Backfill company_name from the legacy "Company Name" column where possible
update "public"."exclusion_lists"
set company_name = "Company Name"
where company_name is null
  and "Company Name" is not null;

alter table "public"."exclusion_lists"
  add constraint exclusion_lists_company_name_key
    unique (company_name);

alter table "public"."exclusion_lists"
  drop column "Apify Actor",
  drop column "Apify Employee Count",
  drop column "apollo data",
  drop column "Apollo Employee Count",
  drop column "Apply Link",
  drop column "Company Name",
  drop column "Description",
  drop column "Extras",
  drop column "Job Highlights",
  drop column "Job Title",
  drop column "Location",
  drop column "Meta Data",
  drop column "Reason for Apollo",
  drop column "reason for reject";

