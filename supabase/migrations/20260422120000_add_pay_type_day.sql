-- Add daily pay period for jobs that quote salary per day.
alter type public.pay_type add value if not exists 'day';
