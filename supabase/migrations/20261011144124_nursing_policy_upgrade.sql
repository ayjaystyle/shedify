-- Additive upgrade: preserve identities, staff, assignments and published periods.
alter table public.staff add column morning_enabled boolean not null default true,
 add column afternoon_enabled boolean not null default true, add column night_enabled boolean not null default true,
 add column category text not null default 'nurse' check(category in ('nurse','attendant')),
 add column no_weekends boolean not null default false, add column permissions_locked boolean not null default false;
alter table public.hospitals add column maximum_consecutive_days integer check(maximum_consecutive_days between 1 and 31), add column minimum_rest_minutes integer check(minimum_rest_minutes between 0 and 2880);
alter table public.ranks add column abbreviation text, add column seniority integer not null default 0,
 add column active boolean not null default true;
create trigger rank_revision before insert or update or delete on public.ranks for each row execute function public.touch_revision();
create trigger rank_audit after insert or update or delete on public.ranks for each row execute function public.audit_mutation();
create function public.guard_staff_permissions() returns trigger language plpgsql set search_path='' as $$ begin
 if not public.is_admin(new.hospital_id) and (new.permissions_locked is distinct from old.permissions_locked or (old.permissions_locked and row(new.morning_enabled,new.afternoon_enabled,new.night_enabled,new.no_weekends,new.category) is distinct from row(old.morning_enabled,old.afternoon_enabled,old.night_enabled,old.no_weekends,old.category))) then raise exception 'Hospital-locked scheduling permissions cannot be overridden'; end if;
 return new; end $$;
create trigger staff_permission_guard before update on public.staff for each row execute function public.guard_staff_permissions();
alter table public.shift_templates alter column max_staff drop not null;
alter table public.shifts alter column max_staff drop not null;
alter table public.shift_templates add column shift_type text not null default 'unspecified' check(shift_type in ('morning','afternoon','night','unspecified')),
 add column weekday_min integer check(weekday_min>0), add column weekday_max integer,
 add column weekend_min integer check(weekend_min>0), add column weekend_max integer,
 add column special_day integer check(special_day between 0 and 6), add column special_min integer check(special_min>0), add column special_max integer,
 add column effective_from date, add column effective_until date,
 add check(weekday_max is null or weekday_max>=coalesce(weekday_min,min_staff)),
 add check(weekend_max is null or weekend_max>=coalesce(weekend_min,min_staff)),
 add check(special_max is null or special_max>=coalesce(special_min,min_staff)),
 add check(effective_until is null or effective_from is null or effective_until>=effective_from);
alter table public.shifts add column shift_type text not null default 'unspecified' check(shift_type in ('morning','afternoon','night','unspecified')), add column times_confirmed boolean not null default false;
alter table public.shift_templates add column times_confirmed boolean not null default false;
alter table public.availability add column leave_type text not null default 'unavailable' check(leave_type in ('unavailable','annual','sick','other')), add column note text;
alter table public.preferences add column shift_type text not null default 'all' check(shift_type in ('all','morning','afternoon','night')), add column note text;
create table public.ward_policies (
 id uuid primary key default gen_random_uuid(), hospital_id uuid not null, ward_id uuid not null,
 enabled boolean not null default false, senior_rank_ids uuid[] not null default '{}', no_weekend_rank_ids uuid[] not null default '{}',
 head_staff_id uuid, effective_from date not null, safety_reference text, max_night_minutes integer check(max_night_minutes between 1 and 1440),
 institutional_approved boolean not null default false, institutional_approved_by uuid references auth.users(id),
 unique(hospital_id,ward_id), foreign key(hospital_id,ward_id) references public.wards(hospital_id,id),
 foreign key(hospital_id,head_staff_id) references public.staff(hospital_id,id)
);
create table public.night_teams (
 id uuid primary key default gen_random_uuid(), hospital_id uuid not null, roster_id uuid not null, staff_id uuid not null,
 week_start date not null check(extract(isodow from week_start)=1),
 unique(roster_id,week_start,staff_id), foreign key(hospital_id,roster_id) references public.rosters(hospital_id,id),
 foreign key(hospital_id,staff_id) references public.staff(hospital_id,id)
);
create table public.rotation_obligations (
 id uuid primary key default gen_random_uuid(), hospital_id uuid not null, ward_id uuid not null, staff_id uuid not null,
 night_start date not null, off_start date generated always as(night_start+7) stored,
 afternoon_start date generated always as(night_start+14) stored, source_roster_id uuid not null,
 unique(hospital_id,ward_id,staff_id,night_start), foreign key(hospital_id,ward_id) references public.wards(hospital_id,id),
 foreign key(hospital_id,staff_id) references public.staff(hospital_id,id), foreign key(hospital_id,source_roster_id) references public.rosters(hospital_id,id)
);
create table public.public_holidays (
 id uuid primary key default gen_random_uuid(), hospital_id uuid not null references public.hospitals(id), day date not null, name text not null,
 unique(hospital_id,day)
);
create index night_team_roster on public.night_teams(hospital_id,roster_id,week_start);
create index rotation_staff_dates on public.rotation_obligations(hospital_id,ward_id,staff_id,night_start);
do $$ declare t text; begin
 foreach t in array array['ward_policies','night_teams','rotation_obligations','public_holidays'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('create trigger revision_before_write before insert or update or delete on public.%I for each row execute function public.touch_revision()',t);
  execute format('create trigger audit_write after insert or update or delete on public.%I for each row execute function public.audit_mutation()',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
 foreach t in array array['ward_policies','night_teams','public_holidays'] loop
  execute format('grant insert,update,delete on public.%I to authenticated',t);
  execute format('create policy administrator_write on public.%I for all to authenticated using(public.is_admin(hospital_id)) with check(public.is_admin(hospital_id))',t);
 end loop;
end $$;
-- Reviews capture the exact tenant revision; any later configuration invalidates the review.
create table public.roster_reviews (
 id uuid primary key default gen_random_uuid(), hospital_id uuid not null, roster_id uuid not null,
 reviewed_by uuid not null references auth.users(id), revision bigint not null, reviewed_at timestamptz not null default now(),
 foreign key(hospital_id,roster_id) references public.rosters(hospital_id,id)
);
alter table public.roster_reviews enable row level security;
revoke all on public.roster_reviews from anon,authenticated;
grant select on public.roster_reviews to authenticated;
grant all on public.roster_reviews to service_role;
create policy review_read on public.roster_reviews for select to authenticated using(public.can_read_roster(hospital_id,roster_id));
create function public.review_roster(p_roster uuid,p_actor uuid,p_expected bigint,p_validation jsonb) returns void language plpgsql security definer set search_path='' as $$
declare r public.rosters; rev bigint; begin
 select * into r from public.rosters where id=p_roster;
 if not exists(select 1 from public.memberships m where m.hospital_id=r.hospital_id and m.user_id=p_actor and (m.role='hospital_admin' or (m.role='ward_admin' and exists(select 1 from public.ward_admins a where a.hospital_id=r.hospital_id and a.ward_id=r.ward_id and a.user_id=p_actor)))) then raise exception 'Unauthorized'; end if;
 select revision into rev from public.hospitals where id=r.hospital_id for update;
 if rev<>p_expected or r.status not in ('generated','ready_for_review','validation_failed') or p_validation->>'valid' is distinct from 'true' or jsonb_array_length(p_validation->'violations')<>0 then raise exception 'Roster must pass current validation before review'; end if;
 insert into public.roster_reviews(hospital_id,roster_id,reviewed_by,revision) values(r.hospital_id,r.id,p_actor,rev);
 insert into public.audit_logs(hospital_id,actor_id,action,entity_id) values(r.hospital_id,p_actor,'roster.ward_review',r.id::text);
end $$;
revoke all on function public.review_roster(uuid,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.review_roster(uuid,uuid,bigint,jsonb) to service_role;
create policy policy_read on public.ward_policies for select to authenticated using(public.can_manage_ward(hospital_id,ward_id));
create policy team_read on public.night_teams for select to authenticated using(public.can_read_roster(hospital_id,roster_id));
create policy rotation_read on public.rotation_obligations for select to authenticated using(public.can_read_staff(hospital_id,staff_id));
create policy holiday_read on public.public_holidays for select to authenticated using(public.is_member(hospital_id));
create function public.guard_nursing_configuration() returns trigger language plpgsql set search_path='' as $$
declare r public.rosters; begin
 if TG_TABLE_NAME='ward_policies' then
  if TG_OP='DELETE' then raise exception 'Ward policies are retained for scheduling history'; end if;
  if TG_OP='UPDATE' and new.ward_id<>old.ward_id then raise exception 'Policy ward cannot change'; end if;
  if extract(isodow from new.effective_from)<>1 then raise exception 'Policy must take effect on a Monday'; end if;
  if new.institutional_approved and (nullif(trim(new.safety_reference),'') is null or new.max_night_minutes is null) then raise exception 'Institutional approval requires a reference and duration limit'; end if;
  if TG_OP='UPDATE' and old.enabled and not new.enabled then raise exception 'Mandatory policy cannot be disabled through ordinary configuration'; end if;
  if TG_OP='UPDATE' and old.enabled and new.effective_from<>old.effective_from then raise exception 'Enabled policy effective date cannot be moved to bypass obligations'; end if;
  if TG_OP='INSERT' or new.institutional_approved is distinct from old.institutional_approved then
   if new.institutional_approved and not public.is_admin(new.hospital_id) then raise exception 'Institutional approval requires hospital oversight'; end if;
   new.institutional_approved_by:=case when new.institutional_approved then auth.uid() else null end;
  elsif TG_OP='UPDATE' and (to_jsonb(new)-'institutional_approved'-'institutional_approved_by') is distinct from (to_jsonb(old)-'institutional_approved'-'institutional_approved_by') then
   new.institutional_approved:=false; new.institutional_approved_by:=null;
  end if;
  if exists(select 1 from unnest(new.senior_rank_ids||new.no_weekend_rank_ids) x where not exists(select 1 from public.ranks a where a.id=x and a.hospital_id=new.hospital_id)) then raise exception 'Rank belongs to another hospital'; end if;
  if new.head_staff_id is not null and not exists(select 1 from public.staff where id=new.head_staff_id and hospital_id=new.hospital_id and ward_id=new.ward_id) then raise exception 'Head must belong to this ward'; end if;
  if new.institutional_approved then
   if TG_OP='UPDATE' and old.institutional_approved then new.institutional_approved_by:=old.institutional_approved_by; else new.institutional_approved_by:=auth.uid(); end if;
  else new.institutional_approved_by:=null; end if;
 else
  select * into r from public.rosters where id=case when TG_OP='DELETE' then old.roster_id else new.roster_id end;
  if r.status='published' then raise exception 'Published Night team is immutable'; end if;
  if TG_OP<>'DELETE' and (new.week_start<r.start_date or new.week_start+6>r.end_date or not exists(select 1 from public.staff where id=new.staff_id and hospital_id=r.hospital_id and ward_id=r.ward_id)) then raise exception 'Night team is outside roster/ward'; end if;
 end if;
 if TG_OP='DELETE' then return old; end if; return new;
end $$;
create trigger nursing_policy_guard before insert or update or delete on public.ward_policies for each row execute function public.guard_nursing_configuration();
create trigger nursing_team_guard before insert or update or delete on public.night_teams for each row execute function public.guard_nursing_configuration();
create function public.guard_four_week_period() returns trigger language plpgsql set search_path='' as $$
declare previous_end date; begin
 perform 1 from public.hospitals where id=new.hospital_id for update;
 if exists(select 1 from public.ward_policies where hospital_id=new.hospital_id and ward_id=new.ward_id and enabled and effective_from<=new.end_date) then
  if extract(isodow from new.start_date)<>1 or new.end_date-new.start_date<>27 then raise exception 'Use a 28-day Monday-Sunday roster'; end if;
  if exists(select 1 from public.rosters where hospital_id=new.hospital_id and ward_id=new.ward_id and id<>new.id and daterange(start_date,end_date,'[]')&&daterange(new.start_date,new.end_date,'[]')) then raise exception 'Roster periods cannot overlap'; end if;
  select max(end_date) into previous_end from public.rosters where hospital_id=new.hospital_id and ward_id=new.ward_id and status='published' and end_date<new.start_date;
  if previous_end is not null and new.start_date<>previous_end+1 then raise exception 'Roster must continue directly from previous published period'; end if;
 end if; return new;
end $$;
create trigger nursing_roster_period before insert on public.rosters for each row execute function public.guard_four_week_period();
alter function public.roster_snapshot(uuid) rename to roster_snapshot_base;
create function public.roster_snapshot(p_roster uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select public.roster_snapshot_base(p_roster)||jsonb_build_object(
 'hospital_limits',(select jsonb_build_object('maximum_consecutive_days',h.maximum_consecutive_days,'minimum_rest_minutes',h.minimum_rest_minutes) from public.hospitals h where h.id=r.hospital_id),
 'policy',(select to_jsonb(p) from public.ward_policies p where p.hospital_id=r.hospital_id and p.ward_id=r.ward_id and p.enabled and p.effective_from<=r.end_date),
 'night_teams',coalesce((select jsonb_agg(to_jsonb(n)) from public.night_teams n where n.roster_id=r.id),'[]'::jsonb),
 'obligations',coalesce((select jsonb_agg(to_jsonb(o)) from public.rotation_obligations o where o.hospital_id=r.hospital_id and o.ward_id=r.ward_id),'[]'::jsonb),
 'holidays',coalesce((select jsonb_agg(to_jsonb(d)) from public.public_holidays d where d.hospital_id=r.hospital_id and d.day between r.start_date and r.end_date),'[]'::jsonb))
 from public.rosters r where r.id=p_roster;
$$;
revoke all on function public.roster_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.roster_snapshot(uuid) to service_role;
alter function public.publish_roster(uuid,uuid,bigint,jsonb) rename to publish_roster_base;
create function public.publish_roster(p_roster uuid,p_actor uuid,p_expected bigint,p_validation jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.publish_roster_base(p_roster,p_actor,p_expected,p_validation);
 insert into public.rotation_obligations(hospital_id,ward_id,staff_id,night_start,source_roster_id)
 select n.hospital_id,r.ward_id,n.staff_id,n.week_start,r.id from public.night_teams n join public.rosters r on r.id=n.roster_id where r.id=p_roster on conflict do nothing;
end $$;
revoke all on function public.publish_roster(uuid,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.publish_roster(uuid,uuid,bigint,jsonb) to service_role;
create or replace function public.materialize_shifts(p_template uuid,p_start date,p_end date) returns void language plpgsql security invoker set search_path='' as $$
declare t public.shift_templates; tz text; d date; s timestamptz; e timestamptz; lo timestamp; hi timestamp; mn integer; mx integer; begin
 select * into t from public.shift_templates where id=p_template;
 if t.id is null or not public.can_manage_ward(t.hospital_id,t.ward_id) then raise exception 'Unauthorized'; end if;
 if p_end<p_start or p_end-p_start>62 then raise exception 'Invalid date range'; end if;
 select timezone into tz from public.hospitals where id=t.hospital_id;
 for d in select generate_series(p_start,p_end,interval '1 day')::date loop
  mn:=t.min_staff; mx:=t.max_staff;
  if (t.effective_from is null or d>=t.effective_from) and (t.effective_until is null or d<=t.effective_until) then
   if extract(isodow from d)<=5 and t.weekday_min is not null then mn:=t.weekday_min; mx:=t.weekday_max; end if;
   if extract(isodow from d)>5 and t.weekend_min is not null then mn:=t.weekend_min; mx:=t.weekend_max; end if;
   if extract(dow from d)=t.special_day and t.special_min is not null then mn:=t.special_min; mx:=t.special_max; end if;
  end if;
  if mx is not null and mx<mn then raise exception 'Minimum exceeds maximum'; end if;
  lo:=d+t.start_time; hi:=d+t.end_time+case when t.end_time<=t.start_time then interval '1 day' else interval '0 day' end;
  s:=lo at time zone tz; e:=hi at time zone tz;
  if (s at time zone tz)<>lo or (e at time zone tz)<>hi or ((s-interval '1 hour') at time zone tz)=lo or ((s+interval '1 hour') at time zone tz)=lo or ((e-interval '1 hour') at time zone tz)=hi or ((e+interval '1 hour') at time zone tz)=hi then raise exception 'Ambiguous/nonexistent local time'; end if;
  insert into public.shifts(hospital_id,ward_id,template_id,name,start_at,end_at,min_staff,max_staff,required_skills,shift_type,times_confirmed) values(t.hospital_id,t.ward_id,t.id,t.name,s,e,mn,mx,t.required_skills,t.shift_type,t.times_confirmed) on conflict do nothing;
 end loop;
end $$;
drop policy admin_write on public.shift_templates;
create policy template_manager_write on public.shift_templates for all to authenticated using(public.can_manage_ward(hospital_id,ward_id)) with check(public.can_manage_ward(hospital_id,ward_id));
drop policy shifts_write on public.shifts;
create policy shifts_manager_write on public.shifts for all to authenticated using(public.can_manage_ward(hospital_id,ward_id)) with check(public.can_manage_ward(hospital_id,ward_id));
drop policy administrator_write on public.ward_policies;
create policy policy_manager_write on public.ward_policies for all to authenticated using(public.can_manage_ward(hospital_id,ward_id)) with check(public.can_manage_ward(hospital_id,ward_id));
drop policy administrator_write on public.night_teams;
create policy team_manager_write on public.night_teams for all to authenticated using(public.can_read_roster(hospital_id,roster_id) and exists(select 1 from public.rosters r where r.id=roster_id and public.can_manage_ward(hospital_id,r.ward_id))) with check(exists(select 1 from public.rosters r where r.id=roster_id and public.can_manage_ward(hospital_id,r.ward_id)));
do $$ declare t text; begin
 foreach t in array array['availability','preferences'] loop
 execute format('drop policy availability_write on public.%I',t);
 execute format('create policy span_manager_write on public.%I for all to authenticated using(exists(select 1 from public.staff s where s.id=staff_id and s.hospital_id=%I.hospital_id and public.can_manage_ward(s.hospital_id,s.ward_id))) with check(exists(select 1 from public.staff s where s.id=staff_id and s.hospital_id=%I.hospital_id and public.can_manage_ward(s.hospital_id,s.ward_id)))',t,t,t);
 end loop;
end $$;
-- Expand only scoped planning RPCs; publication remains hospital oversight.
do $$ declare definition text; name text; begin
 foreach name in array array['create_roster','enqueue_roster','edit_assignments'] loop
  select pg_get_functiondef(p.oid) into definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=name;
  if name='create_roster' then
   definition:=replace(definition,'role=''hospital_admin''','(role=''hospital_admin'' or (role=''ward_admin'' and exists(select 1 from public.ward_admins wa where wa.hospital_id=p_hospital and wa.ward_id=p_ward and wa.user_id=p_actor)))');
  else
   definition:=replace(definition,'role=''hospital_admin''','(role=''hospital_admin'' or (role=''ward_admin'' and exists(select 1 from public.ward_admins wa where wa.hospital_id=r.hospital_id and wa.ward_id=r.ward_id and wa.user_id=p_actor)))');
  end if;
  execute definition;
 end loop;
end $$;

create function public.guard_rank_removal() returns trigger language plpgsql set search_path='' as $$ begin
 if exists(select 1 from public.staff where rank_id=old.id) or exists(select 1 from public.ward_policies where old.id=any(senior_rank_ids||no_weekend_rank_ids)) or exists(select 1 from public.shift_templates where ('rank:'||old.id::text)=any(required_skills)) or exists(select 1 from public.shifts where ('rank:'||old.id::text)=any(required_skills)) then raise exception 'Referenced rank cannot be deleted; archive it instead'; end if;
 return old; end $$;
create trigger rank_removal_guard before delete on public.ranks for each row execute function public.guard_rank_removal();

create function public.guard_annual_leave() returns trigger language plpgsql set search_path='' as $$
declare entitlement integer; tz text; begin
 if new.leave_type<>'annual' then return new; end if;
 perform 1 from public.hospitals where id=new.hospital_id for update;
 select case when s.category='attendant' then 28 else 42 end,h.timezone into entitlement,tz from public.staff s join public.hospitals h on h.id=s.hospital_id where s.id=new.staff_id and s.hospital_id=new.hospital_id;
 if exists(
  select extract(year from d) from (
   select new.start_at start_at,new.end_at end_at union all
   select a.start_at,a.end_at from public.availability a where a.hospital_id=new.hospital_id and a.staff_id=new.staff_id and a.leave_type='annual' and a.id<>new.id
  ) a cross join lateral generate_series((a.start_at at time zone tz)::date,((a.end_at-interval '1 microsecond') at time zone tz)::date,interval '1 day') d
  group by extract(year from d) having count(distinct d)>entitlement
 ) then raise exception 'Annual leave exceeds the calendar-year entitlement'; end if;
 return new; end $$;
create trigger annual_leave_guard before insert or update on public.availability for each row execute function public.guard_annual_leave();
