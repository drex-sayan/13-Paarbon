-- Blog Categories Table
CREATE TABLE public.blog_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

-- Initial Categories
INSERT INTO public.blog_categories (name, slug) VALUES 
('Culture', 'culture'),
('Puja', 'puja'),
('Art & Design', 'art-design'),
('Kolkata', 'kolkata'),
('Photography', 'photography'),
('People', 'people');

-- Blog Posts Table
CREATE TYPE blog_post_status AS ENUM ('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'REJECTED', 'NEEDS_CHANGES');

CREATE TABLE public.blog_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    excerpt TEXT,
    content TEXT NOT NULL,
    category_id UUID REFERENCES public.blog_categories(id) ON DELETE RESTRICT,
    author_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    status blog_post_status DEFAULT 'DRAFT' NOT NULL,
    is_featured BOOLEAN DEFAULT FALSE NOT NULL,
    cover_photo TEXT,
    views INTEGER DEFAULT 0 NOT NULL,
    like_count INTEGER DEFAULT 0 NOT NULL,
    published_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE,
    updated_by UUID REFERENCES public.profiles(id),
    approved_by UUID REFERENCES public.profiles(id),
    approved_at TIMESTAMP WITH TIME ZONE,
    rejection_reason TEXT
);

-- Blog Images Table (for tracking images related to a post, max 5)
CREATE TABLE public.blog_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID REFERENCES public.blog_posts(id) ON DELETE CASCADE NOT NULL,
    storage_path TEXT NOT NULL,
    caption TEXT,
    credit TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

-- Blog Likes Table (prevent duplicate likes)
CREATE TABLE public.blog_likes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID REFERENCES public.blog_posts(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
    UNIQUE(post_id, user_id)
);

-- Blog Reports Table
CREATE TABLE public.blog_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID REFERENCES public.blog_posts(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    reason TEXT NOT NULL,
    description TEXT,
    resolved BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

-- Blog Related Pujos Table
CREATE TABLE public.blog_related_pujos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID REFERENCES public.blog_posts(id) ON DELETE CASCADE NOT NULL,
    pujo_id TEXT REFERENCES public.pujos(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
    UNIQUE(post_id, pujo_id)
);

-- Trigger to update updated_at on blog_posts
CREATE OR REPLACE FUNCTION update_blog_post_modtime()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER trigger_update_blog_post_modtime
BEFORE UPDATE ON public.blog_posts
FOR EACH ROW
EXECUTE FUNCTION update_blog_post_modtime();

-- RLS Setup
ALTER TABLE public.blog_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_related_pujos ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user is editor/admin
CREATE OR REPLACE FUNCTION public.is_editor_or_admin(user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  user_role TEXT;
BEGIN
  SELECT role INTO user_role FROM public.profiles WHERE id = user_id;
  RETURN user_role IN ('EDITOR', 'ADMIN');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Categories RLS
CREATE POLICY "Categories are viewable by everyone" ON public.blog_categories FOR SELECT USING (true);
CREATE POLICY "Editors can manage categories" ON public.blog_categories FOR ALL USING (public.is_editor_or_admin(auth.uid()));

-- Posts RLS
CREATE POLICY "Published non-deleted posts are viewable by everyone" ON public.blog_posts FOR SELECT 
USING (status = 'PUBLISHED' AND deleted_at IS NULL);

CREATE POLICY "Authors can view their own posts" ON public.blog_posts FOR SELECT 
USING (author_id = auth.uid());

CREATE POLICY "Editors can view all posts" ON public.blog_posts FOR SELECT 
USING (public.is_editor_or_admin(auth.uid()));

CREATE POLICY "Authors can insert posts" ON public.blog_posts FOR INSERT 
WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Authors can update their own editable posts" ON public.blog_posts FOR UPDATE 
USING (auth.uid() = author_id AND status IN ('DRAFT', 'REJECTED', 'NEEDS_CHANGES'));

CREATE POLICY "Editors can update all posts" ON public.blog_posts FOR UPDATE 
USING (public.is_editor_or_admin(auth.uid()));

-- Images RLS
CREATE POLICY "Images viewable by everyone" ON public.blog_images FOR SELECT USING (true);
CREATE POLICY "Authors can insert images for their posts" ON public.blog_images FOR INSERT 
WITH CHECK (EXISTS (SELECT 1 FROM public.blog_posts WHERE id = post_id AND author_id = auth.uid()));
CREATE POLICY "Authors can delete images for their posts" ON public.blog_images FOR DELETE
USING (EXISTS (SELECT 1 FROM public.blog_posts WHERE id = post_id AND author_id = auth.uid()));
CREATE POLICY "Editors can manage images" ON public.blog_images FOR ALL USING (public.is_editor_or_admin(auth.uid()));

-- Likes RLS
CREATE POLICY "Likes are viewable by everyone" ON public.blog_likes FOR SELECT USING (true);
CREATE POLICY "Users can insert their own likes" ON public.blog_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own likes" ON public.blog_likes FOR DELETE USING (auth.uid() = user_id);

-- Reports RLS
CREATE POLICY "Editors can view reports" ON public.blog_reports FOR SELECT USING (public.is_editor_or_admin(auth.uid()));
CREATE POLICY "Authenticated users can insert reports" ON public.blog_reports FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Editors can update reports" ON public.blog_reports FOR UPDATE USING (public.is_editor_or_admin(auth.uid()));

-- Related Pujos RLS
CREATE POLICY "Related pujos viewable by everyone" ON public.blog_related_pujos FOR SELECT USING (true);
CREATE POLICY "Authors can manage related pujos for their posts" ON public.blog_related_pujos FOR ALL 
USING (EXISTS (SELECT 1 FROM public.blog_posts WHERE id = post_id AND author_id = auth.uid()));
CREATE POLICY "Editors can manage related pujos" ON public.blog_related_pujos FOR ALL USING (public.is_editor_or_admin(auth.uid()));
