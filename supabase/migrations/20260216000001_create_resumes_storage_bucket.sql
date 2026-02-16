-- Create the resumes storage bucket and RLS policies for job seeker resume uploads.
-- Bucket is private; access is via signed URLs and restricted to own files.

-- Create the bucket (private so files are only accessible via signed URLs)
INSERT INTO storage.buckets (id, name, public)
VALUES ('resumes', 'resumes', false)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload only their own resume (path: resumes/{auth.uid()}-*)
CREATE POLICY "Users can upload own resume"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'resumes'
  AND (storage.foldername(name))[1] = 'resumes'
  AND storage.filename(name) LIKE (auth.uid()::text || '%')
);

-- Allow users to read their own objects (for signed URL generation and downloads)
CREATE POLICY "Users can read own resume"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'resumes'
  AND owner_id = auth.uid()::text
);

-- Allow users to update their own objects (e.g. replace resume)
CREATE POLICY "Users can update own resume"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'resumes' AND owner_id = auth.uid()::text)
WITH CHECK (bucket_id = 'resumes' AND owner_id = auth.uid()::text);

-- Allow users to delete their own objects (e.g. replace or remove resume)
CREATE POLICY "Users can delete own resume"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'resumes'
  AND owner_id = auth.uid()::text
);
