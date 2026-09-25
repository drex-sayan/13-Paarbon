ALTER TABLE public.pujos
ADD COLUMN background_photo_id UUID REFERENCES public.photos(id) ON DELETE SET NULL;
