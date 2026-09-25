-- 1. Add Copyright and Description fields
ALTER TABLE public.blog_posts ADD COLUMN IF NOT EXISTS copyright_confirmed BOOLEAN NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS copyright_confirmed_at TIMESTAMPTZ;
ALTER TABLE public.blog_post_revisions ADD COLUMN IF NOT EXISTS copyright_confirmed BOOLEAN NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS copyright_confirmed_at TIMESTAMPTZ;
ALTER TABLE public.blog_reports ADD COLUMN IF NOT EXISTS description TEXT;

-- 2. Tighten Revision RLS
DROP POLICY IF EXISTS "Authors can view and manage their own revisions" ON public.blog_post_revisions;

CREATE POLICY "Authors can SELECT their own revisions" ON public.blog_post_revisions FOR SELECT USING (auth.uid() = author_id);
CREATE POLICY "Authors can INSERT their own revisions" ON public.blog_post_revisions FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Authors can UPDATE their own revisions" ON public.blog_post_revisions FOR UPDATE USING (auth.uid() = author_id);
CREATE POLICY "Authors can DELETE their own revisions" ON public.blog_post_revisions FOR DELETE USING (auth.uid() = author_id);

-- Enforce Safe Revision Updates (prevent status manipulation by author)
CREATE OR REPLACE FUNCTION public.enforce_safe_revision_modifications()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NOT public.is_editor_or_admin(auth.uid()) THEN
        IF TG_OP = 'UPDATE' THEN
            -- Normal users cannot manually push an approved status or spoof author_id
            NEW.author_id = OLD.author_id;
            NEW.post_id = OLD.post_id;
            -- Allow transition to PENDING_REVIEW from REJECTED/NEEDS_CHANGES, but not to arbitrary statuses
            IF NEW.status NOT IN ('PENDING_REVIEW', 'NEEDS_CHANGES', 'REJECTED') THEN
                RAISE EXCEPTION 'Unauthorized revision status transition.';
            END IF;
            IF OLD.status = 'APPROVED' THEN
                RAISE EXCEPTION 'Cannot modify an approved revision.';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_safe_revision_modifications ON public.blog_post_revisions;
CREATE TRIGGER trigger_safe_revision_modifications
BEFORE UPDATE ON public.blog_post_revisions
FOR EACH ROW EXECUTE FUNCTION public.enforce_safe_revision_modifications();

-- 3. Secure Revision Approval RPC
CREATE OR REPLACE FUNCTION public.approve_blog_post_revision(p_revision_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_rev RECORD;
    v_post RECORD;
BEGIN
    IF NOT public.is_editor_or_admin(auth.uid()) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    
    SELECT * INTO v_rev FROM public.blog_post_revisions WHERE id = p_revision_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Revision not found'; END IF;
    IF v_rev.status != 'PENDING_REVIEW' THEN RAISE EXCEPTION 'Revision not pending review'; END IF;
    
    SELECT * INTO v_post FROM public.blog_posts WHERE id = v_rev.post_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Target post not found'; END IF;
    
    -- Atomically update main post
    UPDATE public.blog_posts
    SET title = v_rev.title,
        excerpt = v_rev.excerpt,
        content = v_rev.content,
        cover_photo = v_rev.cover_photo,
        updated_at = timezone('utc', now()),
        approved_by = auth.uid(),
        approved_at = timezone('utc', now()),
        copyright_confirmed = v_rev.copyright_confirmed,
        copyright_confirmed_at = v_rev.copyright_confirmed_at
    WHERE id = v_post.id;
    
    -- Moderation history
    INSERT INTO public.blog_moderation_history (post_id, moderator_id, action) 
    VALUES (v_post.id, auth.uid(), 'REVISION_APPROVED');
    
    -- Delete revision
    DELETE FROM public.blog_post_revisions WHERE id = p_revision_id;
END;
$$;

-- 4. Secure and Recreate ALL RPCs with SET search_path = public
CREATE OR REPLACE FUNCTION public.increment_blog_post_view(p_post_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    UPDATE public.blog_posts
    SET views = views + 1
    WHERE id = p_post_id AND status = 'PUBLISHED' AND deleted_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.like_blog_post(p_post_id UUID)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_count INT;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    INSERT INTO public.blog_likes (post_id, user_id) VALUES (p_post_id, auth.uid()) ON CONFLICT DO NOTHING;
    SELECT COUNT(*) INTO v_count FROM public.blog_likes WHERE post_id = p_post_id;
    UPDATE public.blog_posts SET like_count = v_count WHERE id = p_post_id;
    RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.unlike_blog_post(p_post_id UUID)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_count INT;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    DELETE FROM public.blog_likes WHERE post_id = p_post_id AND user_id = auth.uid();
    SELECT COUNT(*) INTO v_count FROM public.blog_likes WHERE post_id = p_post_id;
    UPDATE public.blog_posts SET like_count = v_count WHERE id = p_post_id;
    RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_blog_post(p_post_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NOT public.is_editor_or_admin(auth.uid()) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    UPDATE public.blog_posts SET status = 'PUBLISHED', published_at = COALESCE(published_at, timezone('utc', now())), approved_by = auth.uid(), approved_at = timezone('utc', now()), rejection_reason = NULL WHERE id = p_post_id;
    INSERT INTO public.blog_moderation_history (post_id, moderator_id, action) VALUES (p_post_id, auth.uid(), 'PUBLISHED');
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_blog_post(p_post_id UUID, p_reason TEXT)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NOT public.is_editor_or_admin(auth.uid()) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    UPDATE public.blog_posts SET status = 'REJECTED', rejection_reason = p_reason WHERE id = p_post_id;
    INSERT INTO public.blog_moderation_history (post_id, moderator_id, action, reason) VALUES (p_post_id, auth.uid(), 'REJECTED', p_reason);
END;
$$;

CREATE OR REPLACE FUNCTION public.request_blog_changes(p_post_id UUID, p_reason TEXT)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NOT public.is_editor_or_admin(auth.uid()) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    UPDATE public.blog_posts SET status = 'NEEDS_CHANGES', rejection_reason = p_reason WHERE id = p_post_id;
    INSERT INTO public.blog_moderation_history (post_id, moderator_id, action, reason) VALUES (p_post_id, auth.uid(), 'NEEDS_CHANGES', p_reason);
END;
$$;

-- 5. Featured Story Enforcement
CREATE OR REPLACE FUNCTION public.set_featured_blog_post(p_post_id UUID, p_featured BOOLEAN)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_status TEXT;
    v_deleted_at TIMESTAMPTZ;
BEGIN
    IF NOT public.is_editor_or_admin(auth.uid()) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    
    SELECT status, deleted_at INTO v_status, v_deleted_at FROM public.blog_posts WHERE id = p_post_id;
    
    IF p_featured THEN
        IF v_status != 'PUBLISHED' OR v_deleted_at IS NOT NULL THEN
            RAISE EXCEPTION 'Only active published posts can be featured.';
        END IF;
        UPDATE public.blog_posts SET is_featured = false WHERE is_featured = true;
    END IF;
    
    UPDATE public.blog_posts SET is_featured = p_featured WHERE id = p_post_id;
    INSERT INTO public.blog_moderation_history (post_id, moderator_id, action) VALUES (p_post_id, auth.uid(), CASE WHEN p_featured THEN 'FEATURED' ELSE 'UNFEATURED' END);
END;
$$;
