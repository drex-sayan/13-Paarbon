-- 1. Remove duplicate revisions to safely add UNIQUE constraint
DELETE FROM public.blog_post_revisions a USING (
    SELECT MAX(updated_at) as max_updated_at, post_id
    FROM public.blog_post_revisions 
    GROUP BY post_id HAVING COUNT(*) > 1
) b
WHERE a.post_id = b.post_id AND a.updated_at < b.max_updated_at;

-- Delete any remaining exact duplicates that had the exact same updated_at
DELETE FROM public.blog_post_revisions a USING (
    SELECT MIN(id::text)::uuid as min_id, post_id
    FROM public.blog_post_revisions 
    GROUP BY post_id HAVING COUNT(*) > 1
) b
WHERE a.post_id = b.post_id AND a.id != b.min_id;

-- Add the UNIQUE constraint on post_id so there's only 1 active revision per post
ALTER TABLE public.blog_post_revisions DROP CONSTRAINT IF EXISTS blog_post_revisions_post_id_key;
ALTER TABLE public.blog_post_revisions ADD CONSTRAINT blog_post_revisions_post_id_key UNIQUE (post_id);


-- 2. Foolproof Trigger for Revisions (Detecting RPC vs Direct UPDATE securely)
CREATE OR REPLACE FUNCTION public.enforce_safe_revision_modifications()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    -- If the query comes from the PostgREST authenticated/anon role natively, block workflow transitions.
    -- When called from our SECURITY DEFINER RPCs, current_user will be 'postgres' (or the owner role).
    IF current_user IN ('authenticated', 'anon') THEN
        IF TG_OP = 'UPDATE' THEN
            -- Block any attempt to change status directly
            IF NEW.status IS DISTINCT FROM OLD.status THEN
                RAISE EXCEPTION 'Cannot modify status directly. Use submission RPCs.';
            END IF;
            
            -- Block modifying moderator fields
            IF NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason THEN
                RAISE EXCEPTION 'Cannot modify rejection reason.';
            END IF;
            
            -- Block spoofing author/post ID
            NEW.author_id = OLD.author_id;
            NEW.post_id = OLD.post_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_safe_revision_modifications ON public.blog_post_revisions;
CREATE TRIGGER ensure_safe_revision_modifications
BEFORE UPDATE ON public.blog_post_revisions
FOR EACH ROW EXECUTE FUNCTION public.enforce_safe_revision_modifications();


-- 3. Apply the same foolproof trigger logic for main blog_posts to block direct publish/pending transitions
CREATE OR REPLACE FUNCTION public.enforce_safe_post_modifications()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF current_user IN ('authenticated', 'anon') THEN
        IF TG_OP = 'UPDATE' THEN
            IF NEW.status IS DISTINCT FROM OLD.status THEN
                RAISE EXCEPTION 'Cannot modify post status directly. Use submission RPCs.';
            END IF;
            IF NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason THEN
                RAISE EXCEPTION 'Cannot modify rejection reason.';
            END IF;
            NEW.author_id = OLD.author_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_safe_post_modifications ON public.blog_posts;
CREATE TRIGGER ensure_safe_post_modifications
BEFORE UPDATE ON public.blog_posts
FOR EACH ROW EXECUTE FUNCTION public.enforce_safe_post_modifications();


-- 4. Solidify the Submit RPC natively inside Postgres to enforce rules regardless of React UI
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

    IF p_is_revision THEN
        UPDATE public.blog_post_revisions SET status = 'PENDING_REVIEW', updated_at = timezone('utc', now()) WHERE id = p_id;
    ELSE
        UPDATE public.blog_posts SET status = 'PENDING_REVIEW', updated_at = timezone('utc', now()) WHERE id = p_id;
    END IF;
END;
$$;
