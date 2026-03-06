alter table "public"."bd_leads"
  add column company_name text;

-- Backfill company_name from the legacy "Company Name" column where possible
update "public"."bd_leads"
set company_name = "Company Name"
where company_name is null
  and "Company Name" is not null;

-- Keep one row per company_name (smallest id), delete the rest so unique constraint can apply
delete from "public"."bd_leads" a
using "public"."bd_leads" b
where a.company_name = b.company_name
  and a.id > b.id;

alter table "public"."bd_leads"
  add constraint bd_leads_company_name_key
    unique (company_name);

alter table "public"."bd_leads"
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
  drop column "status";
