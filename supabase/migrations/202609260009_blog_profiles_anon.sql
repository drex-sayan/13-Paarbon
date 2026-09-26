-- Allow anon to select specific columns from profiles to render blog authors
GRANT SELECT (id, username, role) ON public.profiles TO anon;

-- Allow anon to view profiles for authors
CREATE POLICY "Public profiles are viewable by everyone" 
ON public.profiles FOR SELECT 
USING (true);
