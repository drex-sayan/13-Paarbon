-- 1. Enforce Bucket-Level Constraints
UPDATE storage.buckets
SET public = true,
    file_size_limit = 10485760, -- 10 MB limit
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'blog-images';

-- Note on SELECT Architecture (Public vs Private):
-- The blog-images bucket is deliberately kept PUBLIC.
-- Using a PRIVATE bucket with signed URLs is not feasible for this architecture because
-- the application saves literal <img> tags into the HTML content string (WYSIWYG editor).
-- Signed URLs expire, which would permanently break all inline images embedded inside the
-- blog_posts.content column. Thus, we keep the bucket public, but rigorously restrict
-- who can upload, modify, and delete files inside it.

-- 2. Drop Previously Broad Policies
DROP POLICY IF EXISTS "Images viewable by everyone" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own images" ON storage.objects;

-- 3. SELECT Policy (Public)
CREATE POLICY "Public Read Access for Blog Images"
ON storage.objects FOR SELECT
USING (bucket_id = 'blog-images');

-- 4. INSERT Policy (Strict Path Checking)
-- Path MUST be: {auth.uid()}/{post_id}/{uuid}.{ext}
-- And the {post_id} MUST exist in blog_posts and belong to auth.uid()
CREATE POLICY "Strict Insert for Blog Images"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'blog-images' AND
    auth.role() = 'authenticated' AND
    (
        public.is_editor_or_admin(auth.uid())
        OR
        (
            (string_to_array(name, '/'))[1] = auth.uid()::text AND
            EXISTS (
                SELECT 1 FROM public.blog_posts 
                WHERE id::text = (string_to_array(name, '/'))[2] 
                AND author_id = auth.uid()
            )
        )
    )
);

-- 5. UPDATE Policy (Strict Path Checking)
CREATE POLICY "Strict Update for Blog Images"
ON storage.objects FOR UPDATE
USING (
    bucket_id = 'blog-images' AND
    auth.role() = 'authenticated' AND
    (
        public.is_editor_or_admin(auth.uid())
        OR
        (
            (string_to_array(name, '/'))[1] = auth.uid()::text AND
            EXISTS (
                SELECT 1 FROM public.blog_posts 
                WHERE id::text = (string_to_array(name, '/'))[2] 
                AND author_id = auth.uid()
            )
        )
    )
);

-- 6. DELETE Policy (Strict Path Checking)
CREATE POLICY "Strict Delete for Blog Images"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'blog-images' AND
    auth.role() = 'authenticated' AND
    (
        public.is_editor_or_admin(auth.uid())
        OR
        (
            (string_to_array(name, '/'))[1] = auth.uid()::text AND
            EXISTS (
                SELECT 1 FROM public.blog_posts 
                WHERE id::text = (string_to_array(name, '/'))[2] 
                AND author_id = auth.uid()
            )
        )
    )
);

-- 7. Hard Database Protection for Maximum 5 Images
CREATE OR REPLACE FUNCTION public.enforce_blog_image_limit()
RETURNS TRIGGER AS $$
DECLARE
    img_count INT;
BEGIN
    SELECT count(*) INTO img_count FROM public.blog_images WHERE post_id = NEW.post_id;
    IF img_count >= 5 THEN
        RAISE EXCEPTION 'Maximum 5 images allowed per blog post. Additional uploads blocked by database constraint.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_blog_image_limit ON public.blog_images;
CREATE TRIGGER trigger_blog_image_limit
BEFORE INSERT ON public.blog_images
FOR EACH ROW EXECUTE FUNCTION public.enforce_blog_image_limit();
