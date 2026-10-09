-- OPTIONAL FICTIONAL DATA. Use only in a development hospital you created through Shedify.
-- Replace the placeholder with that hospital's actual UUID; this is not a credential.
begin;
set local shedify.demo_hospital = 'REPLACE_WITH_YOUR_HOSPITAL_UUID';
do $$
declare h uuid:=current_setting('shedify.demo_hospital')::uuid; w uuid; nurse uuid; rank_id uuid; junior uuid; senior uuid; q uuid; template uuid; i int;
begin
 if not exists(select 1 from public.hospitals where id=h) then raise exception 'Create the demo hospital through Shedify first'; end if;
 if exists(select 1 from public.wards where hospital_id=h and name like 'Fictional Demo %') then raise exception 'Demo already exists; use another development hospital'; end if;
 insert into public.ranks(hospital_id,name) values(h,'Fictional Registered Nurse') returning id into junior;
 insert into public.ranks(hospital_id,name) values(h,'Fictional Senior Nurse') returning id into senior;
 for i in 1..2 loop
  insert into public.wards(hospital_id,name) values(h,case when i=1 then 'Fictional Demo Critical Care' else 'Fictional Demo Surgical' end) returning id into w;
  insert into public.qualifications(hospital_id,name) values(h,case when i=1 then 'Fictional Critical Care Qualification' else 'Fictional General Nursing Qualification' end) returning id into q;
  for n in 1..4 loop
   rank_id:=case when n<=2 then junior else senior end;
   insert into public.staff(hospital_id,ward_id,full_name,rank_id) values(h,w,'Fictional Nurse '||i||'-'||n,rank_id) returning id into nurse;
   insert into public.staff_qualifications values(h,nurse,q);
  end loop;
  insert into public.rules(hospital_id,ward_id,kind,value) values(h,w,'one_shift_per_day',1),(h,w,'min_rest_minutes',660),(h,w,'max_consecutive_days',5),(h,w,'fair_shifts',1),(h,w,'fair_workload',1);
  insert into public.shift_templates(hospital_id,ward_id,name,start_time,end_time,min_staff,max_staff,required_skills) values(h,w,'Fictional Day','07:00','19:00',1,2,array[q::text]);
  insert into public.shift_templates(hospital_id,ward_id,name,start_time,end_time,min_staff,max_staff,required_skills) values(h,w,'Fictional Night','19:00','07:00',1,2,array[q::text]);
  -- A separate test template deliberately requires more qualified nurses than exist.
  insert into public.shift_templates(hospital_id,ward_id,name,start_time,end_time,min_staff,max_staff,required_skills) values(h,w,'Fictional Infeasible Test','07:00','19:00',50,50,array[q::text]);
 end loop;
end $$;
commit;
-- Use the UI to materialize Day/Night templates for one period, and the Infeasible Test for a SEPARATE period.
-- No roster or solver result is pre-generated. Both scenarios must use the actual Timefold API.
