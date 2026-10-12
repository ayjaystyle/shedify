create function public.revoke_night_authorization_after_hours_change() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if (old.shift_type='night' or new.shift_type='night') and (
  (TG_TABLE_NAME='shift_templates' and row(to_jsonb(old)->'start_time',to_jsonb(old)->'end_time',old.shift_type) is distinct from row(to_jsonb(new)->'start_time',to_jsonb(new)->'end_time',new.shift_type))
  or (TG_TABLE_NAME='shifts' and row(to_jsonb(old)->'start_at',to_jsonb(old)->'end_at',old.shift_type) is distinct from row(to_jsonb(new)->'start_at',to_jsonb(new)->'end_at',new.shift_type))
 ) then
  update public.ward_policies set institutional_approved=false,institutional_approved_by=null
  where hospital_id=new.hospital_id and ward_id=new.ward_id and institutional_approved;
 end if;
 return new;
end $$;
create trigger night_template_hours_review after update on public.shift_templates for each row execute function public.revoke_night_authorization_after_hours_change();
create trigger night_dated_hours_review after update on public.shifts for each row execute function public.revoke_night_authorization_after_hours_change();
