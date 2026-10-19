-- Programa la revisión de alertas cada minuto, con la app cerrada.
-- Supabase (plan gratis) llama a /api/cron/alerts de la app en Vercel usando
-- pg_cron (el reloj) y pg_net (la llamada HTTP). El secreto queda guardado en
-- Supabase Vault, no en texto plano dentro del job.
--
-- Antes de ejecutarlo, reemplaza PEGA_AQUI_TU_CRON_SECRET por el mismo valor
-- que pusiste en la variable CRON_SECRET de Vercel.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret('https://plataforma-trading-chi.vercel.app/api/cron/alerts', 'alerts_url');
select vault.create_secret('PEGA_AQUI_TU_CRON_SECRET', 'cron_secret');

select cron.schedule(
  'evaluar-alertas',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'alerts_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- Para revisar que corre:
--   select * from cron.job_run_details order by start_time desc limit 5;
--   select status_code, content from net._http_response order by created desc limit 5;
-- Para pausarlo:  select cron.unschedule('evaluar-alertas');
