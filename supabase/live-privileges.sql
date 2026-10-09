-- Post-migration hardening, applied after the four versioned migrations.
-- Restrict anonymous SECURITY DEFINER access; preserve RLS helper execution.
begin;
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef loop
  execute format('revoke execute on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;
grant execute on function public.is_member(uuid),public.is_admin(uuid),public.owns_staff(uuid,uuid),public.can_manage_ward(uuid,uuid),public.can_read_staff(uuid,uuid),public.can_read_roster(uuid,uuid),public.can_read_shift(uuid,uuid),public.onboard_hospital(text,text),public.set_membership_role(uuid,uuid,text) to authenticated;
create schema if not exists extensions;
alter extension btree_gist set schema extensions;
commit;
