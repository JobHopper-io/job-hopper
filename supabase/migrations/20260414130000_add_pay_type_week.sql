-- Add weekly pay period for jobs that quote salary per week.
alter type public.pay_type add value if not exists 'week';
