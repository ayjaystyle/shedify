-- Optional deployment setup, NOT a core migration. Configure real values in Supabase Vault UI.
-- Required Vault names: shedify_app_url (the actual HTTPS origin), shedify_cron_secret (same as Vercel CRON_SECRET).
-- Enable pg_cron and pg_net using Supabase Integrations before running.
select cron.schedule('shedify-worker','* * * * *', $job$
 select net.http_get(
   url := (select decrypted_secret from vault.decrypted_secrets where name='shedify_app_url') || '/api/cron',
   headers := jsonb_build_object('Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='shedify_cron_secret')),
   timeout_milliseconds := 55000
 );
$job$);
