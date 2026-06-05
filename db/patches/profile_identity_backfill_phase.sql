-- Backfill profile identity from Supabase Auth metadata for existing users.
-- Keeps any manually saved display_name/profile_photo_url and only fills blanks.

update public.app_users au
set
  display_name = coalesce(
    nullif(au.display_name, ''),
    nullif(auth.users.raw_user_meta_data->>'full_name', ''),
    nullif(auth.users.raw_user_meta_data->>'name', '')
  ),
  profile_photo_url = coalesce(
    nullif(au.profile_photo_url, ''),
    nullif(auth.users.raw_user_meta_data->>'avatar_url', ''),
    nullif(auth.users.raw_user_meta_data->>'picture', '')
  )
from auth.users
where auth.users.id = au.user_id
  and (
    au.display_name is null
    or au.display_name = ''
    or au.profile_photo_url is null
    or au.profile_photo_url = ''
  );
