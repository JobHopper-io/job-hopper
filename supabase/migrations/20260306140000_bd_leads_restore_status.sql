alter table "public"."bd_leads"
  add column "status" public.bd_leads_status default 'Ready to Process'::public.bd_leads_status;
