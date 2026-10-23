-- Laris · menu image storage
-- Product photos are uploaded through the uploadMenuImageAction server action
-- (service role, membership enforced in code), so no storage.objects write policies
-- are required. The bucket is public so <img> can render photos by URL.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('menu-images', 'menu-images', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;
