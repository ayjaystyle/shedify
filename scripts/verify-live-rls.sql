-- Run in the Supabase SQL editor as postgres after all four migrations.
-- All fictional fixtures and mutations are rolled back. No passwords are created.
begin;
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); n uuid := gen_random_uuid(); w uuid := gen_random_uuid();
begin
 insert into auth.users(id) values(a),(b),(n),(w);
 perform set_config('shedify.qa_a',a::text,true);
 perform set_config('shedify.qa_b',b::text,true);
 perform set_config('shedify.qa_n',n::text,true);
 perform set_config('shedify.qa_w',w::text,true);
end $$;
set local role authenticated;
do $$ begin
 perform set_config('request.jwt.claim.sub',current_setting('shedify.qa_a'),true);
 perform set_config('shedify.qa_ha',public.onboard_hospital('Fictional QA Hospital A','Europe/London')::text,true);
 perform set_config('request.jwt.claim.sub',current_setting('shedify.qa_b'),true);
 perform set_config('shedify.qa_hb',public.onboard_hospital('Fictional QA Hospital B','Europe/London')::text,true);
end $$;
reset role;
do $$ declare ha uuid := current_setting('shedify.qa_ha')::uuid; wa uuid; wb uuid; sa uuid; begin
 insert into public.wards(hospital_id,name) values(ha,'QA Ward A') returning id into wa;
 insert into public.wards(hospital_id,name) values(ha,'QA Ward B') returning id into wb;
 insert into public.staff(hospital_id,ward_id,full_name) values(ha,wa,'Fictional QA Nurse') returning id into sa;
 insert into public.memberships(hospital_id,user_id,role) values(ha,current_setting('shedify.qa_n')::uuid,'nurse'),(ha,current_setting('shedify.qa_w')::uuid,'ward_admin');
 insert into public.staff_accounts values(ha,sa,current_setting('shedify.qa_n')::uuid);
 insert into public.ward_admins values(ha,wa,current_setting('shedify.qa_w')::uuid);
 perform set_config('shedify.qa_wa',wa::text,true);
end $$;
set local role authenticated;
do $$ begin
 perform set_config('request.jwt.claim.sub',current_setting('shedify.qa_a'),true);
 if (select count(*) from public.hospitals) <> 1 or not exists(select 1 from public.hospitals where id=current_setting('shedify.qa_ha')::uuid) then raise exception 'Hospital A isolation failed'; end if;
 perform set_config('request.jwt.claim.sub',current_setting('shedify.qa_b'),true);
 if (select count(*) from public.hospitals) <> 1 or not exists(select 1 from public.hospitals where id=current_setting('shedify.qa_hb')::uuid) then raise exception 'Hospital B isolation failed'; end if;
 if exists(select 1 from public.staff) or exists(select 1 from public.wards) then raise exception 'Cross-hospital ward/staff leak'; end if;
 perform set_config('request.jwt.claim.sub',current_setting('shedify.qa_w'),true);
 if (select count(*) from public.wards) <> 1 or not exists(select 1 from public.wards where id=current_setting('shedify.qa_wa')::uuid) then raise exception 'Ward administrator isolation failed'; end if;
 perform set_config('request.jwt.claim.sub',current_setting('shedify.qa_n'),true);
 if (select count(*) from public.staff) <> 1 then raise exception 'Nurse own-staff read failed'; end if;
 begin
  insert into public.wards(hospital_id,name) values(current_setting('shedify.qa_ha')::uuid,'Unauthorized nurse ward');
  raise exception 'Nurse write permission failure';
 exception when insufficient_privilege then null; end;
 begin
  perform public.set_membership_role(current_setting('shedify.qa_ha')::uuid,current_setting('shedify.qa_n')::uuid,'hospital_admin');
  raise exception 'Nurse role escalation permitted';
 exception when raise_exception then
  if SQLERRM <> 'Unauthorized' then raise; end if;
 end;
end $$;
reset role;
select 'PASS: two-hospital isolation, ward scope, nurse reads, denied writes and denied role escalation' as result,
 (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity) as tables_without_rls;
rollback;
