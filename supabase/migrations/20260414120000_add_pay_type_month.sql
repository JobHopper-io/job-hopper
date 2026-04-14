-- Add monthly pay period for jobs that quote salary per month.
alter type public.pay_type add value if not exists 'month';
