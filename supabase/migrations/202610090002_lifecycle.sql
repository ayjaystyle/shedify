-- Server-only operations. These functions never trust a browser-supplied validation result.
create function public.roster_snapshot(p_roster uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
 'hospital_id',h.id,'timezone',h.timezone,'revision',h.revision,
 'roster',to_jsonb(r),
 'staff',coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object('skills',coalesce((select jsonb_agg(q.qualification_id::text) from public.staff_qualifications q where q.hospital_id=h.id and q.staff_id=s.id),'[]'::jsonb))) from public.staff s where s.hospital_id=h.id and s.ward_id=r.ward_id),'[]'::jsonb),
 'shifts',coalesce((select jsonb_agg(to_jsonb(s)) from public.shifts s where s.hospital_id=h.id and s.ward_id=r.ward_id and (s.start_at at time zone h.timezone)::date between r.start_date and r.end_date),'[]'::jsonb),
 'rules',coalesce((select jsonb_agg(to_jsonb(x)) from public.rules x where x.hospital_id=h.id and x.ward_id=r.ward_id),'[]'::jsonb),
 'availability',coalesce((select jsonb_agg(to_jsonb(x)) from public.availability x join public.staff s on s.id=x.staff_id where x.hospital_id=h.id and s.ward_id=r.ward_id),'[]'::jsonb),
 'preferences',coalesce((select jsonb_agg(to_jsonb(x)) from public.preferences x join public.staff s on s.id=x.staff_id where x.hospital_id=h.id and s.ward_id=r.ward_id),'[]'::jsonb),
 'assignments',coalesce((select jsonb_agg(to_jsonb(x)) from public.assignments x where x.hospital_id=h.id and x.roster_id=r.id),'[]'::jsonb),
 'history',coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object('shift',to_jsonb(s))) from public.assignments a join public.rosters published on published.id=a.roster_id join public.shifts s on s.id=a.shift_id where a.hospital_id=h.id and published.status='published' and published.id<>r.id and a.staff_id in (select id from public.staff where hospital_id=h.id and ward_id=r.ward_id)),'[]'::jsonb))
 from public.rosters r join public.hospitals h on h.id=r.hospital_id where r.id=p_roster;
$$;

create function public.create_roster(p_hospital uuid,p_ward uuid,p_start date,p_end date,p_actor uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare rid uuid; begin
 if not exists(select 1 from public.memberships where hospital_id=p_hospital and user_id=p_actor and role='hospital_admin') then raise exception 'Unauthorized'; end if;
 insert into public.rosters(hospital_id,ward_id,start_date,end_date,created_by) values(p_hospital,p_ward,p_start,p_end,p_actor) returning id into rid;
 return rid;
end $$;
create function public.enqueue_roster(p_roster uuid,p_actor uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.rosters; jid uuid; begin
 select * into r from public.rosters where id=p_roster;
 if not exists(select 1 from public.memberships where hospital_id=r.hospital_id and user_id=p_actor and role='hospital_admin') then raise exception 'Unauthorized'; end if;
 perform 1 from public.hospitals where id=r.hospital_id for update;
 select * into r from public.rosters where id=p_roster for update;
 if r.status='published' then raise exception 'Published rosters are immutable'; end if;
 if exists(select 1 from public.rosters x where x.hospital_id=r.hospital_id and x.ward_id=r.ward_id and x.status='published' and daterange(x.start_date,x.end_date,'[]') && daterange(r.start_date,r.end_date,'[]')) then raise exception 'Published period conflict'; end if;
 insert into public.jobs(hospital_id,roster_id) values(r.hospital_id,r.id) returning id into jid;
 update public.rosters set status='generating' where id=r.id;
 insert into public.audit_logs(hospital_id,actor_id,action,entity_id) values(r.hospital_id,p_actor,'roster.generate',r.id::text);
 return jid;
end $$;
create function public.claim_job(p_roster uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.jobs; begin
 -- Never retry an expired submission automatically: POST has no verified idempotency facility.
 update public.jobs set state='submission_unknown',error='Submission acknowledgement lost. Reconcile in Timefold before retrying.' where state='submitting' and lease_until<now() and (p_roster is null or roster_id=p_roster);
 select * into j from public.jobs where state in ('pending','solving') and next_poll_at<=now() and (lease_until is null or lease_until<now()) and (p_roster is null or roster_id=p_roster) order by next_poll_at for update skip locked limit 1;
 if j.id is null then return null; end if;
 update public.jobs set lease_until=now()+interval '90 seconds',attempts=attempts+1 where id=j.id;
 return to_jsonb(j);
end $$;
create function public.save_candidate(p_job uuid,p_expected bigint,p_assignments jsonb,p_validation jsonb) returns void language plpgsql security definer set search_path='' as $$
declare j public.jobs; r public.rosters; rev bigint; begin
 select * into j from public.jobs where id=p_job;
 select revision into rev from public.hospitals where id=j.hospital_id for update;
 if rev<>p_expected then raise exception 'Scheduling data changed; regenerate'; end if;
 select * into r from public.rosters where id=j.roster_id for update;
 if r.status='published' or j.state<>'solving' then raise exception 'Invalid lifecycle state'; end if;
 delete from public.assignments where roster_id=r.id;
 insert into public.assignments(hospital_id,roster_id,shift_id,staff_id) select r.hospital_id,r.id,(x->>'shift_id')::uuid,(x->>'staff_id')::uuid from jsonb_array_elements(p_assignments) x;
 update public.rosters set status=case when (p_validation->>'valid')::boolean then 'ready_for_review' else 'validation_failed' end where id=r.id;
 select revision into rev from public.hospitals where id=j.hospital_id;
 insert into public.validations(hospital_id,roster_id,revision,valid,result) values(r.hospital_id,r.id,rev,(p_validation->>'valid')::boolean,p_validation);
 update public.jobs set state='completed',lease_until=null,error=null where id=j.id;
end $$;
create function public.edit_assignments(p_roster uuid,p_actor uuid,p_expected bigint,p_assignments jsonb) returns void language plpgsql security definer set search_path='' as $$
declare r public.rosters; rev bigint; begin
 select * into r from public.rosters where id=p_roster;
 if not exists(select 1 from public.memberships where hospital_id=r.hospital_id and user_id=p_actor and role='hospital_admin') then raise exception 'Unauthorized'; end if;
 select revision into rev from public.hospitals where id=r.hospital_id for update;
 if rev<>p_expected then raise exception 'Data changed. Reload before editing'; end if;
 select * into r from public.rosters where id=p_roster for update;
 if r.status not in ('generated','ready_for_review','validation_failed') then raise exception 'Roster is not editable'; end if;
 delete from public.assignments where roster_id=r.id;
 insert into public.assignments(hospital_id,roster_id,shift_id,staff_id) select r.hospital_id,r.id,(x->>'shift_id')::uuid,(x->>'staff_id')::uuid from jsonb_array_elements(p_assignments) x;
 update public.rosters set status='generated' where id=r.id;
 insert into public.audit_logs(hospital_id,actor_id,action,entity_id) values(r.hospital_id,p_actor,'roster.edit',r.id::text);
end $$;
create function public.publish_roster(p_roster uuid,p_actor uuid,p_expected bigint,p_validation jsonb) returns void language plpgsql security definer set search_path='' as $$
declare r public.rosters; rev bigint; vid uuid; begin
 select * into r from public.rosters where id=p_roster;
 if not exists(select 1 from public.memberships where hospital_id=r.hospital_id and user_id=p_actor and role='hospital_admin') then raise exception 'Unauthorized'; end if;
 select revision into rev from public.hospitals where id=r.hospital_id for update;
 if rev<>p_expected then raise exception 'Data changed. Validate again'; end if;
 select * into r from public.rosters where id=p_roster for update;
 if r.status not in ('generated','ready_for_review','validation_failed') then raise exception 'Roster is not publishable'; end if;
 if not exists(select 1 from public.jobs where roster_id=r.id and state='completed' and external_id is not null) then raise exception 'A completed Timefold candidate is required'; end if;
 if p_validation->>'valid' is distinct from 'true' or jsonb_array_length(p_validation->'violations')<>0 then raise exception 'Invalid roster cannot be published'; end if;
 insert into public.validations(hospital_id,roster_id,revision,valid,result) values(r.hospital_id,r.id,rev,true,p_validation) returning id into vid;
 update public.rosters set status='published',published_at=now() where id=r.id;
 insert into public.publications(hospital_id,roster_id,published_by,validation_id) values(r.hospital_id,r.id,p_actor,vid);
 insert into public.audit_logs(hospital_id,actor_id,action,entity_id) values(r.hospital_id,p_actor,'roster.publish',r.id::text);
end $$;
-- Scheduling fields for a published roster cannot be changed through ordinary management APIs.
create function public.guard_published_shift() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.assignments a join public.rosters r on r.id=a.roster_id where a.shift_id=old.id and r.status='published') then raise exception 'Published shift is immutable'; end if;
 if TG_OP='DELETE' then return old; end if; return new;
end $$;
create trigger immutable_published_shift before update or delete on public.shifts for each row execute function public.guard_published_shift();

create function public.review_duty_request(p_request uuid,p_actor uuid,p_status text) returns void language plpgsql security definer set search_path='' as $$
declare d public.duty_requests; w uuid; begin
 select * into d from public.duty_requests where id=p_request for update;
 select ward_id into w from public.staff where id=d.staff_id;
 if p_status not in ('approved','rejected') then raise exception 'Invalid status'; end if;
 if not exists(select 1 from public.memberships where hospital_id=d.hospital_id and user_id=p_actor and role='hospital_admin') and not exists(select 1 from public.ward_admins a join public.memberships m using(hospital_id,user_id) where a.hospital_id=d.hospital_id and a.ward_id=w and a.user_id=p_actor and m.role='ward_admin') then raise exception 'Unauthorized'; end if;
 if d.status<>'pending' then raise exception 'Request already reviewed'; end if;
 update public.duty_requests set status=p_status,reviewed_by=p_actor where id=d.id;
 insert into public.audit_logs(hospital_id,actor_id,action,entity_id) values(d.hospital_id,p_actor,'duty_request.'||p_status,d.id::text);
 -- Approval intentionally does not mutate the published schedule.
end $$;

do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('roster_snapshot','create_roster','enqueue_roster','claim_job','save_candidate','edit_assignments','publish_roster','review_duty_request') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
