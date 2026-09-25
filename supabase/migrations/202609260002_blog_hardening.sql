-- 1. Create blog_post_revisions table
CREATE TABLE IF NOT EXISTS public.blog_post_revisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID REFERENCES public.blog_posts(id) ON DELETE CASCADE NOT NULL,
    author_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    excerpt TEXT,
    content TEXT NOT NULL,
    cover_photo TEXT,
    status TEXT DEFAULT 'PENDING_REVIEW' NOT NULL,
    rejection_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

ALTER TABLE public.blog_post_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authors can view and manage their own revisions" ON public.blog_post_revisions
    FOR ALL USING (auth.uid() = author_id);
CREATE POLICY "Editors can view and manage all revisions" ON public.blog_post_revisions
    FOR ALL USING (public.is_editor_or_admin(auth.uid()));

-- 2. Create blog_moderation_history table
CREATE TABLE IF NOT EXISTS public.blog_moderation_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID REFERENCES public.blog_posts(id) ON DELETE CASCADE NOT NULL,
    moderator_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);
ALTER TABLE public.blog_moderation_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Editors can view moderation history" ON public.blog_moderation_history FOR SELECT USING (public.is_editor_or_admin(auth.uid()));

-- 3. Storage bucket setup
INSERT INTO storage.buckets (id, name, public) VALUES ('blog-images', 'blog-images', true) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Images viewable by everyone" ON storage.objects FOR SELECT USING (bucket_id = 'blog-images');
CREATE POLICY "Authenticated users can upload images" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'blog-images' AND auth.role() = 'authenticated');
CREATE POLICY "Users can update their own images" ON storage.objects FOR UPDATE USING (bucket_id = 'blog-images' AND auth.uid() = owner);
CREATE POLICY "Users can delete their own images" ON storage.objects FOR DELETE USING (bucket_id = 'blog-images' AND auth.uid() = owner);

-- 4. Featured constraint
DROP INDEX IF EXISTS blog_posts_single_featured;
CREATE UNIQUE INDEX blog_posts_single_featured ON public.blog_posts (is_featured) WHERE is_featured = true AND status = 'PUBLISHED' AND deleted_at IS NULL;

-- 5. RPC: Increment View
CREATE OR REPLACE FUNCTION public.increment_blog_post_view(p_post_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE public.blog_posts
    SET views = views + 1
    WHERE id = p_post_id AND status = 'PUBLISHED' AND deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. RPC: Like Post
CREATE OR REPLACE FUNCTION public.like_blog_post(p_post_id UUID)
RETURNS INT AS $$
DECLARE
    v_count INT;
BEGIN
    INSERT INTO public.blog_likes (post_id, user_id) VALUES (p_post_id, auth.uid()) ON CONFLICT DO NOTHING;
    SELECT COUNT(*) INTO v_count FROM public.blog_likes WHERE post_id = p_post_id;
    UPDATE public.blog_posts SET like_count = v_count WHERE id = p_post_id;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. RPC: Unlike Post
CREATE OR REPLACE FUNCTION public.unlike_blog_post(p_post_id UUID)
RETURNS INT AS $$
DECLARE
    v_count INT;
BEGIN
    DELETE FROM public.blog_likes WHERE post_id = p_post_id AND user_id = auth.uid();
    SELECT COUNT(*) INTO v_count FROM public.blog_likes WHERE post_id = p_post_id;
    UPDATE public.blog_posts SET like_count = v_count WHERE id = p_post_id;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. RPC: Moderation (Publish)
CREATE OR REPLACE FUNCTION public.publish_blog_post(p_post_id UUID)
RETURNS void AS $$
BEGIN
    IF NOT public.is_editor_or_admin(auth.uid()) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    UPDATE public.blog_posts SET status = 'PUBLISHED', published_at = COALESCE(published_at, timezone('utc', now())), approved_by = auth.uid(), approved_at = timezone('utc', now()), rejection_reason = NULL WHERE id = p_post_id;
    INSERT INTO public.blog_moderation_history (post_id, moderator_id, action) VALUES (p_post_id, auth.uid(), 'PUBLISHED');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. RPC: Moderation (Reject)
CREATE OR REPLACE FUNCTION public.reject_blog_post(p_post_id UUID, p_reason TEXT)
RETURNS void AS $$
BEGIN
    IF NOT public.is_editor_or_admin(auth.uid()) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    UPDATE public.blog_posts SET status = 'REJECTED', rejection_reason = p_reason WHERE id = p_post_id;
    INSERT INTO public.blog_moderation_history (post_id, moderator_id, action, reason) VALUES (p_post_id, auth.uid(), 'REJECTED', p_reason);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. RPC: Moderation (Needs Changes)
CREATE OR REPLACE FUNCTION public.request_blog_changes(p_post_id UUID, p_reason TEXT)
RETURNS void AS $$
BEGIN
    IF NOT public.is_editor_or_admin(auth.uid()) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    UPDATE public.blog_posts SET status = 'NEEDS_CHANGES', rejection_reason = p_reason WHERE id = p_post_id;
    INSERT INTO public.blog_moderation_history (post_id, moderator_id, action, reason) VALUES (p_post_id, auth.uid(), 'NEEDS_CHANGES', p_reason);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 11. RPC: Toggle Featured
CREATE OR REPLACE FUNCTION public.set_featured_blog_post(p_post_id UUID, p_featured BOOLEAN)
RETURNS void AS $$
BEGIN
    IF NOT public.is_editor_or_admin(auth.uid()) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    IF p_featured THEN
        UPDATE public.blog_posts SET is_featured = false WHERE is_featured = true;
    END IF;
    UPDATE public.blog_posts SET is_featured = p_featured WHERE id = p_post_id;
    INSERT INTO public.blog_moderation_history (post_id, moderator_id, action) VALUES (p_post_id, auth.uid(), CASE WHEN p_featured THEN 'FEATURED' ELSE 'UNFEATURED' END);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 12. Enforce Safe Inserts/Updates via Trigger
CREATE OR REPLACE FUNCTION public.enforce_safe_blog_modifications()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT public.is_editor_or_admin(auth.uid()) THEN
        -- On INSERT
        IF TG_OP = 'INSERT' THEN
            NEW.status = 'DRAFT';
            NEW.views = 0;
            NEW.like_count = 0;
            NEW.is_featured = false;
            NEW.approved_by = NULL;
            NEW.approved_at = NULL;
            NEW.deleted_at = NULL;
        END IF;
        -- On UPDATE
        IF TG_OP = 'UPDATE' THEN
            NEW.views = OLD.views;
            NEW.like_count = OLD.like_count;
            NEW.is_featured = OLD.is_featured;
            NEW.approved_by = OLD.approved_by;
            NEW.approved_at = OLD.approved_at;
            NEW.deleted_at = OLD.deleted_at;
            
            IF NEW.status NOT IN ('DRAFT', 'PENDING_REVIEW', 'REJECTED', 'NEEDS_CHANGES') THEN
                RAISE EXCEPTION 'Unauthorized status transition by normal user.';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_safe_blog_modifications ON public.blog_posts;
CREATE TRIGGER trigger_safe_blog_modifications
BEFORE INSERT OR UPDATE ON public.blog_posts
FOR EACH ROW EXECUTE FUNCTION public.enforce_safe_blog_modifications();

-- 13. Clean Slugs RPC (Deterministic)
CREATE OR REPLACE FUNCTION public.generate_unique_blog_slug(base_slug TEXT)
RETURNS TEXT AS $$
DECLARE
    new_slug TEXT := base_slug;
    counter INT := 2;
BEGIN
    WHILE EXISTS (SELECT 1 FROM public.blog_posts WHERE slug = new_slug) LOOP
        new_slug := base_slug || '-' || counter;
        counter := counter + 1;
    END LOOP;
    RETURN new_slug;
END;
$$ LANGUAGE plpgsql;

-- 14. Search Function
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE OR REPLACE FUNCTION public.search_blog_posts(search_term TEXT)
RETURNS SETOF public.blog_posts AS $$
BEGIN
    RETURN QUERY 
    SELECT p.* FROM public.blog_posts p
    LEFT JOIN public.blog_categories c ON p.category_id = c.id
    LEFT JOIN public.profiles pr ON p.author_id = pr.id
    WHERE p.status = 'PUBLISHED' AND p.deleted_at IS NULL
    AND (
        p.title ILIKE '%' || search_term || '%'
        OR p.excerpt ILIKE '%' || search_term || '%'
        OR p.content ILIKE '%' || search_term || '%'
        OR c.name ILIKE '%' || search_term || '%'
        OR pr.username ILIKE '%' || search_term || '%'
    )
    ORDER BY p.published_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
