-- Voice-memo notes upload audio files into the existing private note-images bucket.
-- The bucket was created without MIME restrictions, but ensure audio types are allowed
-- in case the bucket was later restricted to images only in the dashboard.
update storage.buckets
set allowed_mime_types = null
where id = 'note-images';
