-- SORA Step 14 test records
-- Before running this file:
-- 1. Create the Auth users in Supabase Dashboard > Authentication > Users.
-- 2. Replace the two email values below with those test-user emails.
-- 3. Run this only in the development project.
-- This file creates application records only. It does not create passwords.

-- Test users used by the records below.
-- Replace these values before running:
--   admin.test@example.com
--   member.test@example.com

-- Confirm the Auth users exist first.
select id, email
from auth.users
where email in ('admin.test@example.com', 'member.test@example.com');

-- Create or update the admin application profile.
insert into public.profiles (
  user_id,
  role_id,
  username,
  first_name,
  last_name
)
select
  u.id,
  r.role_id,
  'test_admin',
  'Test',
  'Admin'
from auth.users u
join public.roles r on r.name = 'admin'
where u.email = 'admin.test@example.com'
on conflict (user_id) do update
set role_id = excluded.role_id,
    username = excluded.username,
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    updated_at = now();

-- Create or update the member application profile.
insert into public.profiles (
  user_id,
  role_id,
  username,
  first_name,
  last_name
)
select
  u.id,
  r.role_id,
  'test_member',
  'Test',
  'Member'
from auth.users u
join public.roles r on r.name = 'reader'
where u.email = 'member.test@example.com'
on conflict (user_id) do update
set role_id = excluded.role_id,
    username = excluded.username,
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    updated_at = now();

-- Give the test member a Guild Member membership.
insert into public.memberships (
  user_id,
  membership_type_id,
  membership_number,
  status,
  started_at,
  expires_at
)
select
  p.user_id,
  mt.membership_type_id,
  'TEST-MEMBER-001',
  'ACTIVE',
  now(),
  now() + interval '30 days'
from public.profiles p
join public.membership_types mt on mt.name = 'Guild Member'
where p.username = 'test_member'
on conflict (membership_number) do update
set user_id = excluded.user_id,
    membership_type_id = excluded.membership_type_id,
    status = excluded.status,
    expires_at = excluded.expires_at,
    updated_at = now();

-- Add a test shelf, book, physical copy, kiosk, and seats.
insert into public.shelves (name, shelf_code, is_public_location)
values ('Test Shelf', 'TEST', true)
on conflict (shelf_code) do update
set name = excluded.name,
    is_public_location = excluded.is_public_location;

insert into public.books (
  source_book_id,
  title,
  author,
  volume_number,
  acquisition_status,
  is_primary_book
)
values (
  'TEST-SORA-001',
  'SORA Test Book',
  'Test Author',
  '1',
  'IN_LIBRARY',
  true
)
on conflict (source_book_id) do update
set title = excluded.title,
    author = excluded.author,
    volume_number = excluded.volume_number,
    acquisition_status = excluded.acquisition_status,
    is_primary_book = excluded.is_primary_book,
    updated_at = now();

insert into public.book_copies (
  book_id,
  source_copy_id,
  identifier_type,
  identifier_value,
  shelf_id,
  status
)
select
  b.book_id,
  'TEST-SORA-COPY-001',
  'BARCODE',
  'TEST-BARCODE-001',
  s.shelf_id,
  'IN_SHELF'
from public.books b
join public.shelves s on s.shelf_code = 'TEST'
where b.source_book_id = 'TEST-SORA-001'
on conflict (identifier_value) do update
set book_id = excluded.book_id,
    shelf_id = excluded.shelf_id,
    status = excluded.status,
    updated_at = now();

insert into public.kiosks (name, location, status)
values ('Test Kiosk', 'Development Test Area', 'ACTIVE')
on conflict (name) do update
set location = excluded.location,
    status = excluded.status;

insert into public.seats (seat_number, area, status)
values
  ('TEST-01', 'Development Test Area', 'AVAILABLE'),
  ('TEST-02', 'Development Test Area', 'AVAILABLE')
on conflict (seat_number) do update
set area = excluded.area,
    status = excluded.status;

-- Create one member visit and one walk-in visit.
insert into public.visits (
  user_id,
  membership_id,
  kiosk_id,
  visitor_type,
  check_in_method,
  scheduled_end_at,
  checked_in_by,
  temporary_reference,
  status
)
select
  p.user_id,
  m.membership_id,
  k.kiosk_id,
  'MEMBER',
  'MANUAL',
  now() + interval '2 hours',
  a.user_id,
  null,
  'ACTIVE'
from public.profiles p
join public.memberships m on m.user_id = p.user_id
join public.kiosks k on k.name = 'Test Kiosk'
join public.profiles a on a.username = 'test_admin'
where p.username = 'test_member'
  and m.membership_number = 'TEST-MEMBER-001'
  and not exists (
    select 1
    from public.visits v
    where v.user_id = p.user_id
      and v.status = 'ACTIVE'
  );

insert into public.visits (
  kiosk_id,
  visitor_type,
  temporary_reference,
  check_in_method,
  status
)
select
  k.kiosk_id,
  'WALK_IN',
  'TEST-WALKIN-001',
  'KIOSK',
  'ACTIVE'
from public.kiosks k
where k.name = 'Test Kiosk'
on conflict (temporary_reference) do nothing;

-- Verify the records created by this script.
select p.username, r.name as role_name, p.first_name, p.last_name
from public.profiles p
join public.roles r on r.role_id = p.role_id
where p.username in ('test_admin', 'test_member')
order by p.username;

select m.membership_number, p.username, mt.name as membership_type, m.status
from public.memberships m
join public.profiles p on p.user_id = m.user_id
join public.membership_types mt on mt.membership_type_id = m.membership_type_id
where m.membership_number = 'TEST-MEMBER-001';

select b.title, bc.identifier_value, bc.status, s.name as shelf
from public.book_copies bc
join public.books b on b.book_id = bc.book_id
left join public.shelves s on s.shelf_id = bc.shelf_id
where bc.identifier_value = 'TEST-BARCODE-001';

select visit_id, visitor_type, user_id, temporary_reference, status
from public.visits
where temporary_reference = 'TEST-WALKIN-001'
   or user_id = (select user_id from public.profiles where username = 'test_member');
