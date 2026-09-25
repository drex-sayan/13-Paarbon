CREATE OR REPLACE FUNCTION public.is_editor_or_admin(user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  user_role TEXT;
BEGIN
  SELECT role INTO user_role FROM public.profiles WHERE id = user_id;
  RETURN user_role IN ('editor', 'admin');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
