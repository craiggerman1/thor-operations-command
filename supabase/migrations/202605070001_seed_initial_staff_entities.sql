with brisbane as (
  select id from public.regions where lower(name) = 'brisbane' limit 1
), seed(display_name, role) as (
  values
    ('Craig', 'National Operations Manager'),
    ('Harry', 'Wash Hand'),
    ('Aman', 'Wash Hand'),
    ('Harman', 'Wash Hand'),
    ('Garry', 'Wash Hand'),
    ('Samar', 'Wash Hand'),
    ('Shant', 'Wash Hand'),
    ('Shivam', 'Wash Hand'),
    ('Narinder', 'Wash Hand'),
    ('Saksham', 'Wash Hand'),
    ('Ritesh', 'Wash Hand'),
    ('Darshan', 'Wash Hand'),
    ('Bhumik', 'Wash Hand'),
    ('John', 'Wash Hand'),
    ('Pawan', 'Wash Hand'),
    ('Tim', 'Wash Hand'),
    ('Steve', 'Wash Hand'),
    ('Yadvinder', 'Wash Hand'),
    ('Jatin', 'Wash Hand'),
    ('Parth', 'Wash Hand'),
    ('Arani', 'Wash Hand'),
    ('Sainath', 'Wash Hand')
), inserted as (
  insert into public.staff_profiles (
    display_name,
    role,
    status,
    primary_region_id,
    availability_sheet_name,
    induction_sheet_name,
    contact_visible_to_odin
  )
  select
    seed.display_name,
    seed.role,
    'active',
    brisbane.id,
    upper(seed.display_name),
    upper(seed.display_name),
    true
  from seed
  cross join brisbane
  where not exists (
    select 1 from public.staff_profiles existing
    where lower(existing.display_name) = lower(seed.display_name)
  )
  returning id
)
insert into public.staff_profile_regions (staff_profile_id, region_id)
select staff_profiles.id, brisbane.id
from public.staff_profiles
join seed on lower(staff_profiles.display_name) = lower(seed.display_name)
cross join brisbane
on conflict do nothing;
