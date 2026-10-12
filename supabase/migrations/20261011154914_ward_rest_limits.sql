alter table public.ward_policies
 add column minimum_rest_minutes integer check(minimum_rest_minutes between 0 and 2880),
 add column maximum_consecutive_days integer check(maximum_consecutive_days between 1 and 31);
