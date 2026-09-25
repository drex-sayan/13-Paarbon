-- 1. Create delete_blog_post RPC
CREATE OR REPLACE FUNCTION public.delete_blog_post(p_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_status TEXT;
BEGIN
    IF NOT public.is_editor_or_admin(auth.uid()) THEN RAISE EXCEPTION 'Unauthorized'; END IF;

    SELECT status INTO v_status FROM public.blog_posts WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Post not found'; END IF;

    PERFORM set_config('blog.trusted_internal', 'true', true);
    
    UPDATE public.blog_posts 
    SET deleted_at = timezone('utc', now()), updated_at = timezone('utc', now()) 
    WHERE id = p_id;
    
    INSERT INTO public.blog_moderation_history (post_id, moderator_id, action) 
    VALUES (p_id, auth.uid(), 'SOFT_DELETED');
END;
$$;

-- 2. Create restore_blog_post RPC
CREATE OR REPLACE FUNCTION public.restore_blog_post(p_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_deleted_at TIMESTAMPTZ;
BEGIN
    IF NOT public.is_editor_or_admin(auth.uid()) THEN RAISE EXCEPTION 'Unauthorized'; END IF;

    SELECT deleted_at INTO v_deleted_at FROM public.blog_posts WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Post not found'; END IF;
    IF v_deleted_at IS NULL THEN 
        RETURN; /* Already restored/not deleted, idempotent */ 
    END IF;
    
    PERFORM set_config('blog.trusted_internal', 'true', true);
    
    UPDATE public.blog_posts 
    SET deleted_at = NULL, updated_at = timezone('utc', now()) 
    WHERE id = p_id;
    
    INSERT INTO public.blog_moderation_history (post_id, moderator_id, action) 
    VALUES (p_id, auth.uid(), 'RESTORED');
END;
$$;

-- 3. Security Grants
REVOKE EXECUTE ON FUNCTION public.delete_blog_post FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_blog_post TO authenticated;

REVOKE EXECUTE ON FUNCTION public.restore_blog_post FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_blog_post TO authenticated;
