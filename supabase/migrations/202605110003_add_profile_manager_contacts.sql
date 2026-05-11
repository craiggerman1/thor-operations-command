alter table public.profiles
  add column if not exists contact_mobile text,
  add column if not exists contact_whatsapp text;
