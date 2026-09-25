-- 1. Create the foolproof triggers that rely on transaction-local setting
CREATE OR REPLACE FUNCTION public.enforce_safe_revision_modifications()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    -- Allow if called from trusted RPC
    IF current_setting('blog.trusted_internal', true) = 'true' THEN
        RETURN NEW;
    END IF;

    -- Allow if the user is explicitly an editor/admin acting directly (e.g. from Supabase Studio or manual overrides)
    IF public.is_editor_or_admin(auth.uid()) THEN
        RETURN NEW;
    END IF;

    -- Standard user direct UPDATE/INSERT constraints
    IF TG_OP = 'UPDATE' THEN
        IF NEW.status IS DISTINCT FROM OLD.status THEN RAISE EXCEPTION 'Cannot modify status directly. Use submission RPCs.'; END IF;
        IF NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason THEN RAISE EXCEPTION 'Cannot modify rejection reason.'; END IF;
        IF NEW.author_id IS DISTINCT FROM OLD.author_id THEN RAISE EXCEPTION 'Cannot modify author_id directly.'; END IF;
        IF NEW.post_id IS DISTINCT FROM OLD.post_id THEN RAISE EXCEPTION 'Cannot modify post_id directly.'; END IF;
    ELSIF TG_OP = 'INSERT' THEN
        IF NEW.status NOT IN ('DRAFT', 'EDITING') THEN RAISE EXCEPTION 'New revisions must start as DRAFT.'; END IF;
    END IF;
    
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_safe_revision_modifications ON public.blog_post_revisions;
CREATE TRIGGER ensure_safe_revision_modifications
BEFORE INSERT OR UPDATE ON public.blog_post_revisions
FOR EACH ROW EXECUTE FUNCTION public.enforce_safe_revision_modifications();


-- 2. Post Modifications Trigger
CREATE OR REPLACE FUNCTION public.enforce_safe_post_modifications()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF current_setting('blog.trusted_internal', true) = 'true' THEN
        RETURN NEW;
    END IF;

    IF public.is_editor_or_admin(auth.uid()) THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF NEW.status IS DISTINCT FROM OLD.status THEN RAISE EXCEPTION 'Cannot modify status directly. Use submission RPCs.'; END IF;
        IF NEW.views IS DISTINCT FROM OLD.views THEN RAISE EXCEPTION 'Cannot modify views directly.'; END IF;
        IF NEW.like_count IS DISTINCT FROM OLD.like_count THEN RAISE EXCEPTION 'Cannot modify like_count directly.'; END IF;
        IF NEW.is_featured IS DISTINCT FROM OLD.is_featured THEN RAISE EXCEPTION 'Cannot modify is_featured directly.'; END IF;
        IF NEW.approved_by IS DISTINCT FROM OLD.approved_by THEN RAISE EXCEPTION 'Cannot modify approved_by directly.'; END IF;
        IF NEW.approved_at IS DISTINCT FROM OLD.approved_at THEN RAISE EXCEPTION 'Cannot modify approved_at directly.'; END IF;
        IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN RAISE EXCEPTION 'Cannot modify deleted_at directly.'; END IF;
        IF NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason THEN RAISE EXCEPTION 'Cannot modify rejection reason.'; END IF;
        IF NEW.author_id IS DISTINCT FROM OLD.author_id THEN RAISE EXCEPTION 'Cannot modify author_id directly.'; END IF;
    ELSIF TG_OP = 'INSERT' THEN
        IF NEW.status != 'DRAFT' THEN RAISE EXCEPTION 'New posts must start as DRAFT.'; END IF;
        IF NEW.views != 0 THEN RAISE EXCEPTION 'Views must start at 0.'; END IF;
        IF NEW.like_count != 0 THEN RAISE EXCEPTION 'Like count must start at 0.'; END IF;
        IF NEW.is_featured = true THEN RAISE EXCEPTION 'Cannot insert featured posts directly.'; END IF;
        IF NEW.approved_by IS NOT NULL THEN RAISE EXCEPTION 'Cannot insert approved_by directly.'; END IF;
        IF NEW.approved_at IS NOT NULL THEN RAISE EXCEPTION 'Cannot insert approved_at directly.'; END IF;
    END IF;
    
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_safe_post_modifications ON public.blog_posts;
CREATE TRIGGER ensure_safe_post_modifications
BEFORE INSERT OR UPDATE ON public.blog_posts
FOR EACH ROW EXECUTE FUNCTION public.enforce_safe_post_modifications();


-- 3. Redefine RPCs to use the trusted flag
CREATE OR REPLACE FUNCTION public.submit_blog_post_for_review(p_id UUID, p_is_revision BOOLEAN)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_author UUID;
    v_copyright BOOLEAN;
    v_title TEXT;
    v_content TEXT;
    v_cover TEXT;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

    IF p_is_revision THEN
        SELECT author_id, copyright_confirmed, title, content, cover_photo 
        INTO v_author, v_copyright, v_title, v_content, v_cover
        FROM public.blog_post_revisions WHERE id = p_id;
    ELSE
        SELECT author_id, copyright_confirmed, title, content, cover_photo 
        INTO v_author, v_copyright, v_title, v_content, v_cover
        FROM public.blog_posts WHERE id = p_id;
    END IF;

    IF v_author IS NULL THEN RAISE EXCEPTION 'Post/Revision not found'; END IF;
    IF v_author != auth.uid() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    IF v_copyright IS NOT TRUE THEN RAISE EXCEPTION 'Copyright must be explicitly confirmed before submission.'; END IF;
    IF v_title IS NULL OR trim(v_title) = '' THEN RAISE EXCEPTION 'Title is required.'; END IF;
    IF v_content IS NULL OR trim(v_content) = '' OR v_content = '<p></p>' OR v_content = '<br>' THEN RAISE EXCEPTION 'Content is required.'; END IF;
    IF v_cover IS NULL OR trim(v_cover) = '' THEN RAISE EXCEPTION 'Cover photo is required.'; END IF;

    PERFORM set_config('blog.trusted_internal', 'true', true);
    
    IF p_is_revision THEN
        UPDATE public.blog_post_revisions SET status = 'PENDING_REVIEW', updated_at = timezone('utc', now()) WHERE id = p_id;
    ELSE
        UPDATE public.blog_posts SET status = 'PENDING_REVIEW', updated_at = timezone('utc', now()) WHERE id = p_id;
    END IF;
END;
$$;


CREATE OR REPLACE FUNCTION public.publish_blog_post(p_post_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NOT public.is_editor_or_admin(auth.uid()) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    PERFORM set_config('blog.trusted_internal', 'true', true);
    UPDATE public.blog_posts SET status = 'PUBLISHED', published_at = COALESCE(published_at, timezone('utc', now())), approved_by = auth.uid(), approved_at = timezone('utc', now()), rejection_reason = NULL WHERE id = p_post_id;
    INSERT INTO public.blog_moderation_history (post_id, moderator_id, action) VALUES (p_post_id, auth.uid(), 'PUBLISHED');
END;
$$;


CREATE OR REPLACE FUNCTION public.reject_blog_post(p_post_id UUID, p_reason TEXT)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NOT public.is_editor_or_admin(auth.uid()) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    PERFORM set_config('blog.trusted_internal', 'true', true);
    UPDATE public.blog_posts SET status = 'REJECTED', rejection_reason = p_reason WHERE id = p_post_id;
    INSERT INTO public.blog_moderation_history (post_id, moderator_id, action, reason) VALUES (p_post_id, auth.uid(), 'REJECTED', p_reason);
END;
$$;


CREATE OR REPLACE FUNCTION public.request_blog_changes(p_post_id UUID, p_reason TEXT)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NOT public.is_editor_or_admin(auth.uid()) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    PERFORM set_config('blog.trusted_internal', 'true', true);
    UPDATE public.blog_posts SET status = 'NEEDS_CHANGES', rejection_reason = p_reason WHERE id = p_post_id;
    INSERT INTO public.blog_moderation_history (post_id, moderator_id, action, reason) VALUES (p_post_id, auth.uid(), 'NEEDS_CHANGES', p_reason);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_featured_blog_post(p_post_id UUID, p_featured BOOLEAN)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_status TEXT;
    v_deleted_at TIMESTAMPTZ;
BEGIN
    IF NOT public.is_editor_or_admin(auth.uid()) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    
    SELECT status, deleted_at INTO v_status, v_deleted_at FROM public.blog_posts WHERE id = p_post_id;
    IF v_status != 'PUBLISHED' OR v_deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'Only active published posts can be featured.';
    END IF;

    PERFORM set_config('blog.trusted_internal', 'true', true);

    IF p_featured THEN
        UPDATE public.blog_posts SET is_featured = false WHERE is_featured = true;
        UPDATE public.blog_posts SET is_featured = true WHERE id = p_post_id;
    ELSE
        UPDATE public.blog_posts SET is_featured = false WHERE id = p_post_id;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_blog_post_revision(p_revision_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_post_id UUID;
    v_title TEXT;
    v_excerpt TEXT;
    v_content TEXT;
    v_cover_photo TEXT;
    v_category_id UUID;
BEGIN
    IF NOT public.is_editor_or_admin(auth.uid()) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    
    SELECT post_id, title, excerpt, content, cover_photo, category_id
    INTO v_post_id, v_title, v_excerpt, v_content, v_cover_photo, v_category_id
    FROM public.blog_post_revisions WHERE id = p_revision_id AND status = 'PENDING_REVIEW';
    
    IF NOT FOUND THEN RAISE EXCEPTION 'Pending revision not found'; END IF;

    PERFORM set_config('blog.trusted_internal', 'true', true);
    
    UPDATE public.blog_posts 
    SET title = v_title, excerpt = v_excerpt, content = v_content, cover_photo = v_cover_photo, category_id = v_category_id, updated_at = timezone('utc', now())
    WHERE id = v_post_id;
    
    DELETE FROM public.blog_post_revisions WHERE id = p_revision_id;
    INSERT INTO public.blog_moderation_history (post_id, moderator_id, action) VALUES (v_post_id, auth.uid(), 'REVISION_APPROVED');
END;
$$;


CREATE OR REPLACE FUNCTION public.reject_blog_post_revision(p_revision_id UUID, p_reason TEXT)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_post_id UUID;
BEGIN
    IF NOT public.is_editor_or_admin(auth.uid()) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    
    SELECT post_id INTO v_post_id FROM public.blog_post_revisions WHERE id = p_revision_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Revision not found'; END IF;
    
    PERFORM set_config('blog.trusted_internal', 'true', true);
    UPDATE public.blog_post_revisions SET status = 'REJECTED', rejection_reason = p_reason WHERE id = p_revision_id;
    INSERT INTO public.blog_moderation_history (post_id, moderator_id, action, reason) VALUES (v_post_id, auth.uid(), 'REVISION_REJECTED', p_reason);
END;
$$;


CREATE OR REPLACE FUNCTION public.request_blog_post_revision_changes(p_revision_id UUID, p_reason TEXT)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_post_id UUID;
BEGIN
    IF NOT public.is_editor_or_admin(auth.uid()) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    
    SELECT post_id INTO v_post_id FROM public.blog_post_revisions WHERE id = p_revision_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Revision not found'; END IF;
    
    PERFORM set_config('blog.trusted_internal', 'true', true);
    UPDATE public.blog_post_revisions SET status = 'NEEDS_CHANGES', rejection_reason = p_reason WHERE id = p_revision_id;
    INSERT INTO public.blog_moderation_history (post_id, moderator_id, action, reason) VALUES (v_post_id, auth.uid(), 'REVISION_NEEDS_CHANGES', p_reason);
END;
$$;


CREATE OR REPLACE FUNCTION public.increment_blog_post_view(p_post_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_status TEXT;
    v_deleted_at TIMESTAMPTZ;
BEGIN
    SELECT status, deleted_at INTO v_status, v_deleted_at FROM public.blog_posts WHERE id = p_post_id;
    IF v_status = 'PUBLISHED' AND v_deleted_at IS NULL THEN
        PERFORM set_config('blog.trusted_internal', 'true', true);
        UPDATE public.blog_posts SET views = views + 1 WHERE id = p_post_id;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.like_blog_post(p_post_id UUID)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_count INT;
    v_status TEXT;
    v_deleted_at TIMESTAMPTZ;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    
    SELECT status, deleted_at INTO v_status, v_deleted_at FROM public.blog_posts WHERE id = p_post_id;
    IF v_status != 'PUBLISHED' OR v_deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot like a non-published post.';
    END IF;

    INSERT INTO public.blog_likes (post_id, user_id) VALUES (p_post_id, auth.uid()) ON CONFLICT DO NOTHING;
    SELECT COUNT(*) INTO v_count FROM public.blog_likes WHERE post_id = p_post_id;
    
    PERFORM set_config('blog.trusted_internal', 'true', true);
    UPDATE public.blog_posts SET like_count = v_count WHERE id = p_post_id;
    RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.unlike_blog_post(p_post_id UUID)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_count INT;
    v_status TEXT;
    v_deleted_at TIMESTAMPTZ;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    
    SELECT status, deleted_at INTO v_status, v_deleted_at FROM public.blog_posts WHERE id = p_post_id;
    IF v_status != 'PUBLISHED' OR v_deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot unlike a non-published post.';
    END IF;

    DELETE FROM public.blog_likes WHERE post_id = p_post_id AND user_id = auth.uid();
    SELECT COUNT(*) INTO v_count FROM public.blog_likes WHERE post_id = p_post_id;
    
    PERFORM set_config('blog.trusted_internal', 'true', true);
    UPDATE public.blog_posts SET like_count = v_count WHERE id = p_post_id;
    RETURN v_count;
END;
$$;
