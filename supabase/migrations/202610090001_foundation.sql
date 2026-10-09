-- All tenant relationships use composite foreign keys. Public registration grants no memberships.
create extension if not exists btree_gist;
create table public.hospitals (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 160),
 timezone text not null default 'Europe/London', contact text, location text,
 revision bigint not null default 0, created_at timestamptz not null default now()
);
create table public.profiles (id uuid primary key references auth.users(id) on delete cascade, display_name text);
create table public.memberships (
 hospital_id uuid not null references public.hospitals(id), user_id uuid not null references auth.users(id),
 role text not null check(role in ('hospital_admin','ward_admin','nurse')), primary key(hospital_id,user_id)
);
create table public.wards (
 id uuid primary key default gen_random_uuid(), hospital_id uuid not null references public.hospitals(id),
 name text not null, active boolean not null default true, unique(hospital_id,id), unique(hospital_id,name)
);
create table public.ward_admins (
 hospital_id uuid not null, ward_id uuid not null, user_id uuid not null,
 primary key(hospital_id,ward_id,user_id), foreign key(hospital_id,ward_id) references public.wards(hospital_id,id),
 foreign key(hospital_id,user_id) references public.memberships(hospital_id,user_id)
);
create table public.ranks (
 id uuid primary key default gen_random_uuid(), hospital_id uuid not null references public.hospitals(id), name text not null,
 unique(hospital_id,id), unique(hospital_id,name)
);
create table public.qualifications (
 id uuid primary key default gen_random_uuid(), hospital_id uuid not null references public.hospitals(id), name text not null,
 unique(hospital_id,id), unique(hospital_id,name)
);
create table public.staff (
 id uuid primary key default gen_random_uuid(), hospital_id uuid not null references public.hospitals(id), ward_id uuid not null,
 full_name text not null, rank_id uuid, active boolean not null default true, eligible boolean not null default true,
 contact text, unique(hospital_id,id), foreign key(hospital_id,ward_id) references public.wards(hospital_id,id),
 foreign key(hospital_id,rank_id) references public.ranks(hospital_id,id)
);
create table public.staff_qualifications (
 hospital_id uuid not null, staff_id uuid not null, qualification_id uuid not null,
 primary key(hospital_id,staff_id,qualification_id), foreign key(hospital_id,staff_id) references public.staff(hospital_id,id),
 foreign key(hospital_id,qualification_id) references public.qualifications(hospital_id,id)
);
create table public.staff_accounts (
 hospital_id uuid not null, staff_id uuid not null, user_id uuid not null unique references auth.users(id),
 primary key(hospital_id,staff_id), foreign key(hospital_id,staff_id) references public.staff(hospital_id,id),
 foreign key(hospital_id,user_id) references public.memberships(hospital_id,user_id)
);
create table public.shift_templates (
 id uuid primary key default gen_random_uuid(), hospital_id uuid not null references public.hospitals(id), ward_id uuid not null,
 name text not null, start_time time not null, end_time time not null, min_staff int not null check(min_staff > 0),
 max_staff int not null check(max_staff >= min_staff), required_skills text[] not null default '{}',
 unique(hospital_id,id), foreign key(hospital_id,ward_id) references public.wards(hospital_id,id)
);
create table public.shifts (
 id uuid primary key default gen_random_uuid(), hospital_id uuid not null references public.hospitals(id), ward_id uuid not null,
 template_id uuid, name text not null, start_at timestamptz not null, end_at timestamptz not null,
 min_staff int not null check(min_staff > 0), max_staff int not null check(max_staff >= min_staff),
 required_skills text[] not null default '{}', check(end_at > start_at), check(end_at <= start_at + interval '48 hours'),
 unique(hospital_id,id), foreign key(hospital_id,ward_id) references public.wards(hospital_id,id),
 foreign key(hospital_id,template_id) references public.shift_templates(hospital_id,id)
);
create table public.rules (
 id uuid primary key default gen_random_uuid(), hospital_id uuid not null references public.hospitals(id), ward_id uuid not null,
 kind text not null check(kind in ('one_shift_per_day','max_consecutive_days','min_rest_minutes','fair_shifts','fair_workload')),
 value int not null check(value >= 0), active boolean not null default true,
 unique(hospital_id,id), unique(hospital_id,ward_id,kind), foreign key(hospital_id,ward_id) references public.wards(hospital_id,id),
 check((kind='max_consecutive_days' and value between 1 and 31) or (kind='min_rest_minutes' and value between 0 and 2880) or (kind in ('one_shift_per_day','fair_shifts','fair_workload') and value=1))
);
create table public.availability (
 id uuid primary key default gen_random_uuid(), hospital_id uuid not null, staff_id uuid not null,
 start_at timestamptz not null, end_at timestamptz not null, check(end_at > start_at),
 foreign key(hospital_id,staff_id) references public.staff(hospital_id,id)
);
create table public.preferences (
 id uuid primary key default gen_random_uuid(), hospital_id uuid not null, staff_id uuid not null,
 start_at timestamptz not null, end_at timestamptz not null, preferred boolean not null default false,
 check(end_at > start_at), foreign key(hospital_id,staff_id) references public.staff(hospital_id,id)
);
create table public.rosters (
 id uuid primary key default gen_random_uuid(), hospital_id uuid not null references public.hospitals(id), ward_id uuid not null,
 start_date date not null, end_date date not null, check(end_date >= start_date), check(end_date-start_date <= 62),
 status text not null default 'draft' check(status in ('draft','generating','generated','validation_failed','ready_for_review','published')),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), published_at timestamptz,
 unique(hospital_id,id), foreign key(hospital_id,ward_id) references public.wards(hospital_id,id),
 exclude using gist (hospital_id with =, ward_id with =, daterange(start_date,end_date,'[]') with &&) where (status='published')
);
create table public.assignments (
 hospital_id uuid not null, roster_id uuid not null, shift_id uuid not null, staff_id uuid not null,
 primary key(hospital_id,roster_id,shift_id,staff_id),
 foreign key(hospital_id,roster_id) references public.rosters(hospital_id,id),
 foreign key(hospital_id,shift_id) references public.shifts(hospital_id,id),
 foreign key(hospital_id,staff_id) references public.staff(hospital_id,id)
);
create table public.jobs (
 id uuid primary key default gen_random_uuid(), hospital_id uuid not null, roster_id uuid not null,
 state text not null default 'pending' check(state in ('pending','submitting','solving','completed','failed','cancelled','submission_unknown')),
 external_id text unique, input jsonb, snapshot jsonb, attempts int not null default 0,
 next_poll_at timestamptz not null default now(), lease_until timestamptz, created_at timestamptz not null default now(),
 error text, unique(hospital_id,id), foreign key(hospital_id,roster_id) references public.rosters(hospital_id,id)
);
create unique index one_active_job on public.jobs(roster_id) where state in ('pending','submitting','solving','submission_unknown');
create table public.validations (
 id uuid primary key default gen_random_uuid(), hospital_id uuid not null, roster_id uuid not null,
 revision bigint not null, valid boolean not null, result jsonb not null, created_at timestamptz not null default now(),
 foreign key(hospital_id,roster_id) references public.rosters(hospital_id,id)
);
create table public.publications (
 id uuid primary key default gen_random_uuid(), hospital_id uuid not null, roster_id uuid not null,
 published_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 validation_id uuid not null references public.validations(id), foreign key(hospital_id,roster_id) references public.rosters(hospital_id,id)
);
create table public.duty_requests (
 id uuid primary key default gen_random_uuid(), hospital_id uuid not null, roster_id uuid not null, shift_id uuid not null, staff_id uuid not null,
 requested_change text not null, reason text not null, status text not null default 'pending' check(status in ('pending','approved','rejected')),
 created_at timestamptz not null default now(), reviewed_by uuid references auth.users(id),
 foreign key(hospital_id,roster_id,shift_id,staff_id) references public.assignments(hospital_id,roster_id,shift_id,staff_id)
);
create table public.audit_logs (
 id bigint generated always as identity primary key, hospital_id uuid not null references public.hospitals(id),
 actor_id uuid, action text not null, entity_id text, created_at timestamptz not null default now()
);
create index staff_by_ward on public.staff(hospital_id,ward_id);
create index shifts_by_period on public.shifts(hospital_id,ward_id,start_at);
create index assignments_by_staff on public.assignments(hospital_id,staff_id);
create index jobs_due on public.jobs(state,next_poll_at);
create index availability_by_staff on public.availability(hospital_id,staff_id,start_at);
create index rosters_by_ward on public.rosters(hospital_id,ward_id,start_date);
create index ward_admin_user on public.ward_admins(hospital_id,user_id);

create function public.is_admin(h uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.memberships where hospital_id=h and user_id=auth.uid() and role='hospital_admin');
$$;
create function public.is_member(h uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.memberships where hospital_id=h and user_id=auth.uid());
$$;
create function public.can_manage_ward(h uuid,w uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.is_admin(h) or exists(select 1 from public.ward_admins a join public.memberships m using(hospital_id,user_id) where a.hospital_id=h and a.ward_id=w and a.user_id=auth.uid() and m.role='ward_admin');
$$;
create function public.owns_staff(h uuid,s uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.staff_accounts where hospital_id=h and staff_id=s and user_id=auth.uid());
$$;
create function public.can_read_staff(h uuid,s uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.owns_staff(h,s) or exists(select 1 from public.staff where hospital_id=h and id=s and public.can_manage_ward(h,ward_id));
$$;
create function public.can_read_roster(h uuid,r uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.rosters where hospital_id=h and id=r and (public.can_manage_ward(h,ward_id) or (status='published' and exists(select 1 from public.staff_accounts a join public.staff s using(hospital_id) where a.staff_id=s.id and a.hospital_id=h and a.user_id=auth.uid() and s.ward_id=rosters.ward_id))));
$$;
create function public.can_read_shift(h uuid,s uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.shifts where hospital_id=h and id=s and public.can_manage_ward(h,ward_id)) or exists(select 1 from public.assignments a join public.rosters r on r.id=a.roster_id where a.hospital_id=h and a.shift_id=s and r.status='published' and public.owns_staff(h,a.staff_id));
$$;
do $$ declare t text; begin
 foreach t in array array['hospitals','profiles','memberships','wards','ward_admins','ranks','qualifications','staff','staff_qualifications','staff_accounts','shift_templates','shifts','rules','availability','preferences','rosters','assignments','jobs','validations','publications','duty_requests','audit_logs'] loop
 execute format('alter table public.%I enable row level security',t);
 end loop;
end $$;
create policy hospital_read on public.hospitals for select to authenticated using(public.is_member(id));
create policy hospital_edit on public.hospitals for update to authenticated using(public.is_admin(id)) with check(public.is_admin(id));
-- revision is never directly writable by clients.
revoke update on public.hospitals from authenticated;
grant update(name,timezone,contact,location) on public.hospitals to authenticated;
create policy profile_self on public.profiles for all to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy membership_read on public.memberships for select to authenticated using(user_id=auth.uid() or public.is_admin(hospital_id));
create policy membership_admin on public.memberships for insert to authenticated with check(public.is_admin(hospital_id));
create policy ward_admin_read on public.ward_admins for select to authenticated using(user_id=auth.uid() or public.is_admin(hospital_id));
create policy ward_admin_write on public.ward_admins for all to authenticated using(public.is_admin(hospital_id)) with check(public.is_admin(hospital_id));
create policy wards_read on public.wards for select to authenticated using(public.can_manage_ward(hospital_id,id) or exists(select 1 from public.staff_accounts a join public.staff s on s.id=a.staff_id where a.hospital_id=wards.hospital_id and a.user_id=auth.uid() and s.ward_id=wards.id));
create policy wards_write on public.wards for all to authenticated using(public.is_admin(hospital_id)) with check(public.is_admin(hospital_id));
do $$ declare t text; begin
 foreach t in array array['ranks','qualifications'] loop
 execute format('create policy reference_read on public.%I for select to authenticated using(public.is_member(hospital_id))',t);
 execute format('create policy reference_write on public.%I for all to authenticated using(public.is_admin(hospital_id)) with check(public.is_admin(hospital_id))',t);
 end loop;
end $$;
create policy staff_read on public.staff for select to authenticated using(public.can_read_staff(hospital_id,id));
create policy staff_insert on public.staff for insert to authenticated with check(public.can_manage_ward(hospital_id,ward_id));
create policy staff_update on public.staff for update to authenticated using(public.can_manage_ward(hospital_id,ward_id)) with check(public.can_manage_ward(hospital_id,ward_id));
create policy staff_skills_read on public.staff_qualifications for select to authenticated using(public.can_read_staff(hospital_id,staff_id));
create policy staff_skills_write on public.staff_qualifications for all to authenticated using(public.is_admin(hospital_id)) with check(public.is_admin(hospital_id));
create policy links_read on public.staff_accounts for select to authenticated using(user_id=auth.uid() or public.is_admin(hospital_id));
create policy links_write on public.staff_accounts for all to authenticated using(public.is_admin(hospital_id)) with check(public.is_admin(hospital_id));
do $$ declare t text; begin
 foreach t in array array['shift_templates','rules'] loop
 execute format('create policy ward_read on public.%I for select to authenticated using(public.can_manage_ward(hospital_id,ward_id))',t);
 execute format('create policy admin_write on public.%I for all to authenticated using(public.is_admin(hospital_id)) with check(public.is_admin(hospital_id))',t);
 end loop;
end $$;
create policy shifts_read on public.shifts for select to authenticated using(public.can_read_shift(hospital_id,id));
create policy shifts_write on public.shifts for all to authenticated using(public.is_admin(hospital_id)) with check(public.is_admin(hospital_id));
do $$ declare t text; begin
 foreach t in array array['availability','preferences'] loop
 execute format('create policy availability_read on public.%I for select to authenticated using(public.can_read_staff(hospital_id,staff_id))',t);
 execute format('create policy availability_write on public.%I for all to authenticated using(public.is_admin(hospital_id)) with check(public.is_admin(hospital_id))',t);
 end loop;
end $$;
create policy roster_read on public.rosters for select to authenticated using(public.can_read_roster(hospital_id,id));
create policy assignment_read on public.assignments for select to authenticated using(exists(select 1 from public.rosters r where r.hospital_id=assignments.hospital_id and r.id=assignments.roster_id and (public.can_manage_ward(r.hospital_id,r.ward_id) or (r.status='published' and public.owns_staff(assignments.hospital_id,assignments.staff_id)))));
do $$ declare t text; begin
 foreach t in array array['jobs','validations','publications'] loop
 execute format('create policy roster_meta_read on public.%I for select to authenticated using(exists(select 1 from public.rosters r where r.id=roster_id and public.can_manage_ward(hospital_id,r.ward_id)))',t);
 end loop;
end $$;
create policy request_read on public.duty_requests for select to authenticated using(public.can_read_staff(hospital_id,staff_id));
create policy request_insert on public.duty_requests for insert to authenticated with check(status='pending' and reviewed_by is null and public.owns_staff(hospital_id,staff_id) and exists(select 1 from public.rosters r where r.id=roster_id and r.status='published'));
create policy audit_read on public.audit_logs for select to authenticated using(public.is_admin(hospital_id));
-- All lifecycle changes go through server-only RPCs; service role is never sent to clients.

create function public.onboard_hospital(p_name text,p_timezone text) returns uuid language plpgsql security definer set search_path='' as $$
declare h uuid; begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not exists(select 1 from pg_timezone_names where name=p_timezone) then raise exception 'Invalid time zone'; end if;
 insert into public.hospitals(name,timezone) values(p_name,p_timezone) returning id into h;
 insert into public.memberships(hospital_id,user_id,role) values(h,auth.uid(),'hospital_admin');
 insert into public.audit_logs(hospital_id,actor_id,action,entity_id) values(h,auth.uid(),'hospital.onboard',h::text);
 return h;
end $$;
revoke all on function public.onboard_hospital(text,text) from public,anon;
grant execute on function public.onboard_hospital(text,text) to authenticated;

-- Mutation trigger serializes scheduling changes with publication and increments a tenant revision.
create function public.touch_revision() returns trigger language plpgsql security definer set search_path='' as $$
declare h uuid; begin
 h:=case when TG_OP='DELETE' then old.hospital_id else new.hospital_id end;
 if TG_OP='UPDATE' and old.hospital_id<>new.hospital_id then raise exception 'Hospital cannot change'; end if;
 update public.hospitals set revision=revision+1 where id=h;
 if TG_OP='DELETE' then return old; end if; return new;
end $$;
do $$ declare t text; begin
 foreach t in array array['wards','staff','staff_qualifications','shift_templates','shifts','rules','availability','preferences','rosters','assignments'] loop
 execute format('create trigger revision_before_write before insert or update or delete on public.%I for each row execute function public.touch_revision()',t);
 end loop;
end $$;
create function public.audit_mutation() returns trigger language plpgsql security definer set search_path='' as $$
declare obj jsonb; begin
 obj:=case when TG_OP='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 insert into public.audit_logs(hospital_id,actor_id,action,entity_id) values((obj->>'hospital_id')::uuid,auth.uid(),TG_TABLE_NAME||'.'||lower(TG_OP),coalesce(obj->>'id',obj->>'staff_id'));
 if TG_OP='DELETE' then return old; end if; return new;
end $$;
do $$ declare t text; begin
 foreach t in array array['wards','memberships','ward_admins','staff','staff_accounts','staff_qualifications','shift_templates','shifts','rules','availability','preferences','duty_requests'] loop
 execute format('create trigger audit_write after insert or update or delete on public.%I for each row execute function public.audit_mutation()',t);
 end loop;
end $$;
