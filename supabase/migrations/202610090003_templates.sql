create unique index one_template_shift_per_start on public.shifts(template_id,start_at) where template_id is not null;
create function public.materialize_shifts(p_template uuid,p_start date,p_end date) returns void language plpgsql security invoker set search_path='' as $$
declare t public.shift_templates; tz text; d date; local_start timestamp; local_end timestamp; s timestamptz; e timestamptz; begin
 select * into t from public.shift_templates where id=p_template;
 if t.id is null or not public.is_admin(t.hospital_id) then raise exception 'Unauthorized'; end if;
 if p_end<p_start or p_end-p_start>62 then raise exception 'Invalid date range'; end if;
 select timezone into tz from public.hospitals where id=t.hospital_id;
 for d in select generate_series(p_start,p_end,interval '1 day')::date loop
  local_start:=d+t.start_time; local_end:=d+t.end_time+case when t.end_time<=t.start_time then interval '1 day' else interval '0 day' end;
  s:=local_start at time zone tz; e:=local_end at time zone tz;
  if (s at time zone tz)<>local_start or (e at time zone tz)<>local_end then raise exception 'Nonexistent daylight-saving time. Create explicit dated shifts'; end if;
  if ((s-interval '1 hour') at time zone tz)=local_start or ((s+interval '1 hour') at time zone tz)=local_start or ((e-interval '1 hour') at time zone tz)=local_end or ((e+interval '1 hour') at time zone tz)=local_end then raise exception 'Ambiguous daylight-saving time. Create explicit dated shifts'; end if;
  insert into public.shifts(hospital_id,ward_id,template_id,name,start_at,end_at,min_staff,max_staff,required_skills) values(t.hospital_id,t.ward_id,t.id,t.name,s,e,t.min_staff,t.max_staff,t.required_skills) on conflict do nothing;
 end loop;
end $$;
revoke all on function public.materialize_shifts(uuid,date,date) from public,anon;
grant execute on function public.materialize_shifts(uuid,date,date) to authenticated;
-- Hospital time zone changes also invalidate outstanding validation snapshots.
create function public.hospital_revision() returns trigger language plpgsql set search_path='' as $$
begin
 if new.timezone<>old.timezone then
  if exists(select 1 from public.rosters where hospital_id=old.id and status='published') then raise exception 'Published hospital time zone cannot change'; end if;
  new.revision:=old.revision+1;
 end if;
 return new;
end $$;
create trigger hospital_revision before update on public.hospitals for each row execute function public.hospital_revision();
