-- Seed a super_admin role if it does not already exist.
insert into public.roles (name)
select 'super_admin'
where not exists (
  select 1 from public.roles where name = 'super_admin'
);

