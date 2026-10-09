create function public.set_membership_role(p_hospital uuid,p_user uuid,p_role text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.hospitals where id=p_hospital for update;
 if not public.is_admin(p_hospital) then raise exception 'Unauthorized'; end if;
 if p_role not in ('hospital_admin','ward_admin','nurse') then raise exception 'Invalid role'; end if;
 if p_role<>'hospital_admin' and exists(select 1 from public.memberships where hospital_id=p_hospital and user_id=p_user and role='hospital_admin') and (select count(*) from public.memberships where hospital_id=p_hospital and role='hospital_admin')=1 then raise exception 'Keep at least one hospital administrator'; end if;
 insert into public.memberships(hospital_id,user_id,role) values(p_hospital,p_user,p_role) on conflict(hospital_id,user_id) do update set role=excluded.role;
end $$;
revoke all on function public.set_membership_role(uuid,uuid,text) from public,anon;
grant execute on function public.set_membership_role(uuid,uuid,text) to authenticated;

create or replace function public.guard_published_shift() returns trigger language plpgsql security definer set search_path='' as $$
declare h uuid; w uuid; start_time timestamptz; tz text; begin
 h:=case when TG_OP='DELETE' then old.hospital_id else new.hospital_id end;
 w:=case when TG_OP='DELETE' then old.ward_id else new.ward_id end;
 start_time:=case when TG_OP='DELETE' then old.start_at else new.start_at end;
 select timezone into tz from public.hospitals where id=h for update;
 if exists(select 1 from public.rosters r where r.hospital_id=h and r.ward_id=w and r.status='published' and (start_time at time zone tz)::date between r.start_date and r.end_date) then raise exception 'Published period shifts are immutable'; end if;
 if TG_OP<>'INSERT' and exists(select 1 from public.assignments a join public.rosters r on r.id=a.roster_id where a.shift_id=old.id and r.status='published') then raise exception 'Published shift is immutable'; end if;
 if TG_OP='DELETE' then return old; end if; return new;
end $$;
drop trigger immutable_published_shift on public.shifts;
create trigger immutable_published_shift before insert or update or delete on public.shifts for each row execute function public.guard_published_shift();
