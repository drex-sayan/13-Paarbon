import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { supabase } from "./supabaseClient";
import AuthPage from "./AuthPage";
import { getCurrentProfile, ROLES } from "./auth";
import "./styles.css";

const frames = [
  { image: "/images/hero.jpg", eyebrow: "", text: "", position: "50% 38%" },
  { image: "/images/photo2.jpg", eyebrow: "THE STORY", text: "We are Bengalis, living through thirteen festivals in twelve months, each carrying a story of its own.", position: "50% 48%" },
  { image: "/images/photo3.jpg", eyebrow: "THE FRAME", text: "In every frame, colour, ritual, and emotion come together to tell stories passed down through generations.", position: "50% 52%" },
  { image: "/images/photo4.jpg", eyebrow: "THE FEELING", text: "From the quiet devotion of dawn to the electric vibrancy of celebration, every moment is felt deep within our bones. 13 Paarbon captures these fleeting moments through the lens, preserving the soul of Bengal — one photograph at a time.", position: "58% 50%" }
];

function useSequenceProgress(ref) {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const update = () => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const total = ref.current.offsetHeight - window.innerHeight;
      setProgress(total <= 0 ? 0 : Math.min(1, Math.max(0, -rect.top / total)));
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => { window.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
  }, [ref]);
  return progress;
}

function IntroSequence() {
  const ref = useRef(null);
  const progress = useSequenceProgress(ref);
  const segment = 1 / frames.length;
  const active = Math.min(frames.length - 1, Math.floor(progress / segment));
  const local = (progress - active * segment) / segment;
  return (
    <section ref={ref} id="home" className="sequence">
      <div className="sticky-stage">
        <div className="ambient" />
        {frames.map((frame, i) => {
          let opacity = i === active ? 1 : 0;
          if (i === active && active < frames.length - 1) opacity = 1 - Math.max(0, local - 0.58) / 0.42;
          if (i === active + 1 && local > 0.52) opacity = (local - 0.52) / 0.48;
          if (Math.abs(i - active) > 1) opacity = 0;
          const scale = i === active ? (i === 0 ? 1 + local * .012 : 1.02 + local * .025) : i === active + 1 ? 1.035 : 1.02;
          return <div key={frame.image} className="frame" style={{ opacity, zIndex: i === active + 1 ? 3 : 2 }}><img src={frame.image} alt="Durga Puja" style={{ objectPosition: frame.position, transform: `scale(${scale})` }} /></div>;
        })}
        <div className="vignette" />
        <header className={`nav ${active > 0 ? "nav-scrolled" : ""}`}><nav><a href="/">HOME</a><a href="/pujo">PUJO</a><a href="#blog">BLOG</a><a href="#about">ABOUT</a><a href="/login">LOGIN</a></nav></header>
        <div className={`hero-title ${active > 0 ? "hidden" : ""}`}><p>STORIES • FRAMES • JOURNEYS</p><h1>13 PAARBON</h1></div>
        <div className={`story-copy ${active > 0 ? "visible" : ""}`}><span>{frames[active].eyebrow}</span><p>{frames[active].text}</p></div>
        <div className="progress-dots">{frames.map((_, i) => <i key={i} className={i === active ? "active" : ""} />)}</div>
        <div className={`scroll-hint ${active > 0 ? "hidden" : ""}`}><span /> SCROLL SLOWLY</div>
      </div>
    </section>
  );
}



const FALLBACK = "/images/hero.jpg";

function randomId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => chars[b % chars.length]).join("");
}

const DEFAULT_PUJOS = [
  {
    id: "singhi-park",
    name: "Singhi Park Sarbojonin Durga Puja",
    theme: "Heritage Architecture & Traditional Craft",
    description: "Since 1941, Singhi Park Sarbojonin Durga Puja has been synonymous with grandeur, classical pandal structures, and breathtaking lighting. One of South Kolkata's most celebrated pujos.",
    location: "https://www.google.com/maps/search/?api=1&query=Singhi+Park+Sarbojonin+Durga+Puja+Ballygunge+Kolkata",
    createdAt: "2026-09-01T00:00:00Z",
    backgroundPhotoId: "singhi-1",
    bgUrl: "/images/photo2.jpg",
    photos: [
      { id: "singhi-1", key: "singhi-1", url: "/images/photo2.jpg", name: "Singhi Park 1" },
      { id: "singhi-2", key: "singhi-2", url: "/images/hero.jpg", name: "Singhi Park 2" },
      { id: "singhi-3", key: "singhi-3", url: "/images/photo3.jpg", name: "Singhi Park 3" },
      { id: "singhi-4", key: "singhi-4", url: "/images/photo4.jpg", name: "Singhi Park 4" }
    ]
  },
  {
    id: "deshapriya-park",
    name: "Deshapriya Park",
    theme: "Grandeur & Universal Celebration",
    description: "Deshapriya Park is famous across Bengal for its massive crowd-pulling installations, colossal pandals, and electric festive atmosphere in the heart of South Kolkata.",
    location: "https://www.google.com/maps/search/?api=1&query=Deshapriya+Park+Durga+Puja+Kolkata",
    createdAt: "2026-09-02T00:00:00Z",
    backgroundPhotoId: "deshapriya-1",
    bgUrl: "/images/photo3.jpg",
    photos: [
      { id: "deshapriya-1", key: "deshapriya-1", url: "/images/photo3.jpg", name: "Deshapriya 1" },
      { id: "deshapriya-2", key: "deshapriya-2", url: "/images/photo4.jpg", name: "Deshapriya 2" },
      { id: "deshapriya-3", key: "deshapriya-3", url: "/images/hero.jpg", name: "Deshapriya 3" }
    ]
  },
  {
    id: "mudiali-club",
    name: "Mudiali Club",
    theme: "Artistic Harmony & Ecology",
    description: "Renowned for its eco-conscious themes, delicate craftsmanship, and traditional serenity, Mudiali Club creates an immersive aesthetic sanctuary each year.",
    location: "https://www.google.com/maps/search/?api=1&query=Mudiali+Club+Durga+Puja+Kolkata",
    createdAt: "2026-09-03T00:00:00Z",
    backgroundPhotoId: "mudiali-1",
    bgUrl: "/images/photo4.jpg",
    photos: [
      { id: "mudiali-1", key: "mudiali-1", url: "/images/photo4.jpg", name: "Mudiali 1" },
      { id: "mudiali-2", key: "mudiali-2", url: "/images/photo2.jpg", name: "Mudiali 2" },
      { id: "mudiali-3", key: "mudiali-3", url: "/images/photo3.jpg", name: "Mudiali 3" }
    ]
  },
  {
    id: "ekdalia-evergreen",
    name: "Ekdalia Evergreen Club",
    theme: "Temple Architecture & Illuminations",
    description: "An icon of Gariahat since 1943, Ekdalia Evergreen is acclaimed for recreating ancient Indian temples, traditional idol forms, and legendary Chandannagar lighting.",
    location: "https://www.google.com/maps/search/?api=1&query=Ekdalia+Evergreen+Club+Kolkata",
    createdAt: "2026-09-04T00:00:00Z",
    backgroundPhotoId: "ekdalia-1",
    bgUrl: "/images/hero.jpg",
    photos: [
      { id: "ekdalia-1", key: "ekdalia-1", url: "/images/hero.jpg", name: "Ekdalia 1" },
      { id: "ekdalia-2", key: "ekdalia-2", url: "/images/photo3.jpg", name: "Ekdalia 2" },
      { id: "ekdalia-3", key: "ekdalia-3", url: "/images/photo2.jpg", name: "Ekdalia 3" }
    ]
  }
];

async function loadPujos() {
  try {
    const { data, error } = await supabase
      .from("pujos")
      .select("id, name, theme, description, location, created_at, background_photo_id, photos!photos_pujo_id_fkey(id, storage_path, sort_order, created_at)")
      .order("created_at", { ascending: true });

    if (error || !data || data.length === 0) {
      return DEFAULT_PUJOS;
    }

    const items = (data || []).map(p => {
      const sortedPhotos = (p.photos || []).sort((a, b) => {
        if (a.sort_order !== b.sort_order) return (a.sort_order || 0) - (b.sort_order || 0);
        return new Date(a.created_at) - new Date(b.created_at);
      });

      let bgPhoto = sortedPhotos.find(photo => photo.id === p.background_photo_id) || sortedPhotos[0];
      let bgUrl = null;
      if (bgPhoto) {
        const { data: publicData } = supabase.storage.from("pujo-images").getPublicUrl(bgPhoto.storage_path);
        bgUrl = publicData.publicUrl;
      }

      return {
        id: p.id,
        name: p.name,
        theme: p.theme || "",
        description: p.description || "",
        location: p.location || "",
        createdAt: p.created_at,
        backgroundPhotoId: p.background_photo_id,
        bgUrl: bgUrl
      };
    });

    return items.length ? items : DEFAULT_PUJOS;
  } catch (err) {
    return DEFAULT_PUJOS;
  }
}

async function createPujo(pujo) {
  const { data, error } = await supabase
    .from("pujos")
    .insert({
      id: pujo.id,
      name: pujo.name,
      theme: pujo.theme,
      description: pujo.description,
      location: pujo.location
    })
    .select()
    .single();

  if (error) throw error;

  return {
    id: data.id,
    name: data.name,
    theme: data.theme || "",
    description: data.description || "",
    location: data.location || "",
    createdAt: data.created_at
  };
}

async function updatePujo(pujoId, changes) {
  const { data, error } = await supabase
    .from("pujos")
    .update(changes)
    .eq("id", pujoId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function setPujoBackground(pujoId, photoId) {
  const { error } = await supabase
    .from("pujos")
    .update({ background_photo_id: photoId })
    .eq("id", pujoId);
  if (error) throw error;
}

async function getPhotos(pujoId) {
  try {
    const { data, error } = await supabase
      .from("photos")
      .select("id, pujo_id, storage_path, sort_order, created_at")
      .eq("pujo_id", pujoId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error || !data || data.length === 0) {
      const def = DEFAULT_PUJOS.find(p => p.id === pujoId);
      return def?.photos || [];
    }

    return (data || []).map(photo => {
      const { data: publicData } = supabase
        .storage
        .from("pujo-images")
        .getPublicUrl(photo.storage_path);

      return {
        key: photo.id,
        id: photo.id,
        pujoId: photo.pujo_id,
        storagePath: photo.storage_path,
        name: photo.storage_path.split("/").pop() || "photo",
        url: publicData.publicUrl
      };
    });
  } catch (err) {
    const def = DEFAULT_PUJOS.find(p => p.id === pujoId);
    return def?.photos || [];
  }
}

async function putPhotos(pujoId, files, startOrder = 0) {
  const uploaded = [];

  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const extension = file.name.includes(".")
        ? "." + file.name.split(".").pop().toLowerCase()
        : "";
      const storagePath = `${pujoId}/${crypto.randomUUID()}${extension}`;

      const { error: uploadError } = await supabase
        .storage
        .from("pujo-images")
        .upload(storagePath, file, {
          contentType: file.type,
          upsert: false
        });

      if (uploadError) throw uploadError;
      uploaded.push(storagePath);

      const { error: rowError } = await supabase
        .from("photos")
        .insert({
          pujo_id: pujoId,
          storage_path: storagePath,
          sort_order: startOrder + i
        });

      if (rowError) throw rowError;
    }
  } catch (error) {
    if (uploaded.length) {
      await supabase
        .storage
        .from("pujo-images")
        .remove(uploaded);
    }
    throw error;
  }
}

async function deletePujo(pujoId) {
  const { data: photos, error: photoLoadError } = await supabase.from("photos").select("id, storage_path").eq("pujo_id", pujoId);
  if (photoLoadError) throw photoLoadError;
  const paths = (photos || []).map(p => p.storage_path).filter(Boolean);
  if (paths.length) {
    const { error: storageError } = await supabase.storage.from("pujo-images").remove(paths);
    if (storageError) throw storageError;
  }
  const { error: photoDeleteError } = await supabase.from("photos").delete().eq("pujo_id", pujoId);
  if (photoDeleteError) throw photoDeleteError;
  const { error } = await supabase.from("pujos").delete().eq("id", pujoId);
  if (error) throw error;
}

async function deletePhoto(photo) {
  const { error: storageError } = await supabase
    .storage
    .from("pujo-images")
    .remove([photo.storagePath]);

  if (storageError) throw storageError;

  const { error: rowError } = await supabase
    .from("photos")
    .delete()
    .eq("id", photo.id);

  if (rowError) throw rowError;
}

function Modal({ children, className = "", onClose }) {
  return <div className="pujo-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}><div className={`pujo-modal ${className}`}>{children}</div></div>;
}

function Lightbox({ photo, onClose, onDownload }) {
  return (
    <Modal onClose={onClose} className="lightbox-modal">
      <div className="lightbox-inner">
        <button className="lightbox-close" onClick={onClose} aria-label="Close">×</button>
        <img src={photo.url} alt={photo.name} className="lightbox-image" />
        <button className="lightbox-download" onClick={onDownload} aria-label="Download image">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        </button>
      </div>
    </Modal>
  );
}

function AddPujoModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ name: "", theme: "", description: "", location: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const update = (key) => (e) => setForm(v => ({ ...v, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || saving) return;

    setSaving(true);
    setError("");

    try {
      const pujo = await createPujo({
        id: randomId(),
        name: form.name.trim(),
        theme: form.theme.trim(),
        description: form.description.trim(),
        location: form.location.trim()
      });
      onCreated(pujo);
    } catch (err) {
      console.error(err);
      setError(err?.message || "Could not create Pujo.");
    } finally {
      setSaving(false);
    }
  };

  return <Modal onClose={saving ? undefined : onClose} className="add-modal">
    <button className="modal-x" onClick={onClose} aria-label="Close">×</button>
    <div className="modal-kicker">ADD PUJO</div><h2>Add Pujo</h2>
    <form onSubmit={submit}>
      <label>NAME<input value={form.name} onChange={update("name")} required /></label>
      <label>THEME<input value={form.theme} onChange={update("theme")} /></label>
      <label>THEME DESCRIPTION<textarea value={form.description} onChange={update("description")} /></label>
      <label>LOCATION / GOOGLE MAPS<input placeholder="Paste Google Maps Link" value={form.location} onChange={update("location")} /></label>
      {error && <div className="pujo-form-error">{error}</div>}
      <button className="modal-submit" type="submit" disabled={saving}>{saving ? "SAVING…" : "GENERATE ID"}</button>
    </form>
  </Modal>;
}

function ConfirmModal({ pujo, onClose }) {
  const copy = async () => { try { await navigator.clipboard.writeText(pujo.id); } catch {} };
  return <Modal onClose={onClose} className="confirm-modal">
    <button className="modal-x" onClick={onClose} aria-label="Close">×</button>
    <div className="confirm-row"><span>Name of the Pujo</span><strong>{pujo.name}</strong></div>
    <div className="confirm-row"><span>Theme</span><strong>{pujo.theme || "—"}</strong></div>
    <div className="confirm-row confirm-id"><span>ID</span><strong>{pujo.id}</strong><button onClick={copy}>Copy Id</button></div>
  </Modal>;
}

function PujoListPage() {
  const [profile, setProfile] = useState(null);
  const [pujos, setPujos] = useState([]);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [created, setCreated] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [hoveredPujoId, setHoveredPujoId] = useState(null);

  useEffect(() => {
    getCurrentProfile().then(setProfile).catch(() => setProfile(null));
    let active = true;
    loadPujos()
      .then(items => {
        if (active) setPujos(items);
      })
      .catch(err => {
        console.error(err);
        if (active) setLoadError("Could not load Pujos.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return pujos;
    return pujos.filter(p => p.name.toLocaleLowerCase().includes(q.toLocaleLowerCase()) || p.id.includes(q));
  }, [pujos, query]);

  const [activeBgUrls, setActiveBgUrls] = useState(new Set());

  const activePujo = hoveredPujoId ? pujos.find(p => p.id === hoveredPujoId) : null;
  const activeBgUrl = activePujo?.bgUrl || null;

  useEffect(() => {
    if (activeBgUrl) {
      setActiveBgUrls(prev => {
        if (prev.has(activeBgUrl)) return prev;
        const next = new Set(prev);
        next.add(activeBgUrl);
        return next;
      });
    }
  }, [activeBgUrl]);

  useEffect(() => {
    const isMobile = window.matchMedia("(pointer: coarse)").matches;
    if (!isMobile) return;

    let intersecting = new Set();
    let hasScrolled = false;
    let currentHover = null;
    
    const applyIntersection = () => {
      if (!hasScrolled) return;
      const nextId = intersecting.size > 0 ? Array.from(intersecting)[0] : null;
      if (nextId !== currentHover) {
        currentHover = nextId;
        setHoveredPujoId(nextId);
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          const id = entry.target.getAttribute('data-pujo-id');
          if (entry.isIntersecting) {
            intersecting.add(id);
          } else {
            intersecting.delete(id);
          }
        });
        applyIntersection();
      },
      {
        rootMargin: "-40% 0px -40% 0px",
        threshold: 0
      }
    );

    const onScroll = () => {
      if (!hasScrolled) {
        hasScrolled = true;
        applyIntersection();
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });

    const rows = document.querySelectorAll('.pujo-row');
    rows.forEach(r => observer.observe(r));

    return () => {
      window.removeEventListener('scroll', onScroll);
      observer.disconnect();
      setHoveredPujoId(null);
    };
  }, [filtered]);

  return <main className="pujo-page"><div className="pujo pujo-list-page">
    <div className="pujo__background" />
    {Array.from(activeBgUrls).map(url => (
      <div 
        key={url}
        className="pujo__background--dynamic" 
        style={{ backgroundImage: `url(${url})`, opacity: url === activeBgUrl ? 1 : 0 }} 
      />
    ))}
    <nav className="pujo-nav"><ul><li><a href="/">Home</a></li><li><a href="/pujo" aria-current="page">Pujo</a></li><li><a href="#blog">Blog</a></li><li><a href="#about">About</a></li><li><a href="/login">Login</a></li></ul></nav>
    <section className="pujo-toolbar"><label className="pujo-search"><span className="sr-only">Search your Pujo</span><input type="search" placeholder="Search your Pujo" value={query} onChange={e => setQuery(e.target.value)} /></label><button className="pujo-control pujo-control--filter" disabled aria-label="Filter">
          <svg className="pujo-filter-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
            {/* top slider line */}
            <line x1="3" y1="6" x2="21" y2="6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            <circle cx="8" cy="6" r="2.2" fill="currentColor"/>
            {/* middle slider line */}
            <line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            <circle cx="16" cy="12" r="2.2" fill="currentColor"/>
            {/* bottom slider line */}
            <line x1="3" y1="18" x2="21" y2="18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            <circle cx="11" cy="18" r="2.2" fill="currentColor"/>
          </svg>
          <span className="sr-only">Filter</span>
        </button>{(profile?.role === ROLES.EDITOR || profile?.role === ROLES.ADMIN) && <button className="pujo-control pujo-control--add" onClick={() => setAdding(true)}>Add Pujo</button>}</section>
    <section className="pujo-list-wrap">
      <div className="pujo-list">
        {filtered.map((p, i) => <a key={p.id} data-pujo-id={p.id} className="pujo-row" href={`/pujo/${encodeURIComponent(p.id)}`} onMouseEnter={() => setHoveredPujoId(p.id)} onMouseLeave={() => setHoveredPujoId(null)} onFocus={() => setHoveredPujoId(p.id)} onBlur={() => setHoveredPujoId(null)} onClick={() => { if (window.matchMedia("(pointer: coarse)").matches) setHoveredPujoId(null); }}>
          <span className="pujo-row__name">{i + 1}. {p.name}</span>
          <span className="pujo-row__right">
            <small className="pujo-row__id">{p.id}</small>
            <span className="pujo-row__direction" onClick={e => {
              e.stopPropagation();
              e.preventDefault();
              const url = p.location || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name)}`;
              window.open(url, "_blank", "noopener,noreferrer");
            }}>Direction</span>
          </span>
        </a>)}
      </div>
      {loading && <p className="pujo-empty">Loading…</p>}
      {!loading && loadError && <p className="pujo-empty">{loadError}</p>}
      {!loading && !loadError && !filtered.length && <p className="pujo-empty">No Pujo found</p>}
    </section>
    {adding && <AddPujoModal onClose={() => setAdding(false)} onCreated={(p) => {
      setPujos(current => [...current, p]);
      setAdding(false);
      setCreated(p);
    }} />}
    {created && <ConfirmModal pujo={created} onClose={() => setCreated(null)} />}
  </div></main>;
}

function PujoDetailPage({ pujo }) {
  const [profile, setProfile] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [galleryLoading, setGalleryLoading] = useState(true);
  const [bgId, setBgId] = useState(pujo.backgroundPhotoId);
  const heroRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const [editDesc, setEditDesc] = useState(false);
  const [descDraft, setDescDraft] = useState(pujo.description || pujo.theme || "");
  const [descValue, setDescValue] = useState(pujo.description || pujo.theme || "");
  const [lightbox, setLightbox] = useState(null);
  useEffect(() => {
    let active = true;
    setPhotos([]);
    setGalleryLoading(true);
    getCurrentProfile().then(setProfile).catch(() => setProfile(null));
    getPhotos(pujo.id)
      .then(data => { if (active) setPhotos(data); })
      .catch(() => {})
      .finally(() => { if (active) setGalleryLoading(false); });
    return () => { active = false; };
  }, [pujo.id]);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      if (!heroRef.current) return;
      const scrollY = window.scrollY || window.pageYOffset || 0;
      const travel = window.innerHeight;
      const p = Math.max(-1, Math.min(1, scrollY / travel));
      heroRef.current.style.setProperty("--scroll-depth", `${(p * 18).toFixed(2)}px`);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  const urls = photos;
  // Only fall back to the default Durga image after the fetch has settled and
  // genuinely returned no photos.  While galleryLoading is true, gallery is
  // null — render sites check galleryLoading before touching gallery[0].
  const gallery = galleryLoading
    ? null
    : photos.length
      ? photos
      : [{ key: "fallback", url: FALLBACK, name: "Fallback" }];

  const upload = async (e) => {
    const files = Array.from(e.target.files || []).slice(0, Math.max(0, 10 - photos.length));
    if (!files.length) {
      e.target.value = "";
      return;
    }

    setUploading(true);
    try {
      await putPhotos(pujo.id, files, photos.length);
      setPhotos(await getPhotos(pujo.id));
    } catch (err) {
      console.error(err);
    } finally {
      setTimeout(() => setUploading(false), 450);
      e.target.value = "";
    }
  };

  const direction = () => {
    const url = pujo.location || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pujo.name)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const saveDescription = async () => {
    try {
      await updatePujo(pujo.id, { description: descDraft });
      setDescValue(descDraft);
      setEditDesc(false);
    } catch (err) {
      console.error(err);
    }
  };
  return <main className="pujo-detail-page">
    <div className="detail-backdrop-wrap">
      {galleryLoading
        ? <div className="detail-backdrop detail-backdrop--skeleton" />
        : <div className="detail-backdrop" style={{ backgroundImage: `url(${gallery[0].url})` }} />
      }
    </div>
    <div className="detail-grain" />
    <nav className="detail-nav"><a href="/">Home</a><a href="/pujo">Pujo</a><a href="#blog">Blog</a><a href="#about">About</a><a href="/login">Login</a></nav>
    <section ref={heroRef} className="detail-hero">
      <aside className="detail-panel reveal-panel">
        <div className="detail-title">{pujo.name}</div>
        {editDesc ? (
          <div className="detail-edit-wrap">
            <textarea className="detail-edit-textarea" value={descDraft} onChange={e => setDescDraft(e.target.value)} rows={5} />
            <div className="detail-edit-actions">
              <button className="detail-edit-save" onClick={saveDescription}>Save</button>
              <button className="detail-edit-cancel" onClick={() => { setDescDraft(descValue); setEditDesc(false); }}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="detail-copy">{descValue || "A Durga Puja story waiting to be documented."}</div>
        )}
        <div className="detail-actions">
          <button onClick={direction}>Direction</button>
          {(profile?.role === ROLES.EDITOR || profile?.role === ROLES.ADMIN) && <><button onClick={() => fileRef.current?.click()}>Upload Photos</button>
          <button onClick={() => setEditDesc(true)}>Edit Description</button><button onClick={async () => { if (!window.confirm(`Delete ${pujo.name}? This cannot be undone.`)) return; try { await deletePujo(pujo.id); window.location.href = "/pujo"; } catch (err) { console.error(err); } }}>Delete Pujo</button></>}
        </div>
        <input ref={fileRef} className="hidden-file" type="file" accept="image/*" multiple onChange={upload} />
        <div className="detail-id">{pujo.id}</div>
      </aside>
      <div className="hero-image-wrap">
        {galleryLoading
          ? <div className="hero-image-skeleton" aria-hidden="true" />
          : <img src={gallery[0].url} alt={pujo.name} />
        }
      </div>
    </section>
    <section className="detail-gallery" id="gallery">
      <div className="gallery-heading"><span>Gallery</span><small>{Math.min(photos.length,10)} / 10</small></div>
      {photos.length ? <div className={`gallery-grid count-${Math.min(photos.length,10)}`}>{urls.map((p, i) => <figure key={p.key} className={`gallery-item item-${i}`}><img src={p.url} alt={`${pujo.name} ${i + 1}`} /><figcaption className="gallery-item-actions"><button className="gallery-expand" aria-label="Expand image" onClick={e => { e.stopPropagation(); setLightbox(p); }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg></button><a className="gallery-download" href={p.url} download={p.name} aria-label="Download image"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></a>{(profile?.role === ROLES.EDITOR || profile?.role === ROLES.ADMIN) && <>
        {bgId === p.id ? <span className="gallery-bg-indicator">Background</span> : <button className="gallery-set-bg" onClick={async e => {
          e.stopPropagation();
          try {
            await setPujoBackground(pujo.id, p.id);
            setBgId(p.id);
          } catch(err) { console.error(err); }
        }}>Set BG</button>}
        <button className="gallery-delete" aria-label="Delete photo" onClick={async e => {
  e.stopPropagation();
  try {
    await deletePhoto(p);
    if (bgId === p.id) { await setPujoBackground(pujo.id, null); setBgId(null); }
    setPhotos(await getPhotos(pujo.id));
  } catch (err) {
    console.error(err);
  }
}}>×</button></>}</figcaption></figure>)}</div> : <div className="gallery-empty">No photos yet.</div>}
    </section>
    {lightbox && <Lightbox photo={lightbox} onClose={() => setLightbox(null)} onDownload={() => { const a = document.createElement('a'); a.href = lightbox.url; a.download = lightbox.name; a.click(); }} />}
    {uploading && <div className="upload-status"><span className="upload-ring" />Uploading photos…</div>}
    <div className="detail-scroll-cue">SCROLL</div>
  </main>;
}

function PujoDetailRoute({ id }) {
  const [pujo, setPujo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    loadPujos()
      .then(items => {
        if (!active) return;
        setPujo(items.find(p => p.id === id) || null);
      })
      .catch(err => {
        console.error(err);
        if (active) setPujo(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [id]);

  if (loading) return <main className="pujo-detail-page" />;
  return pujo ? <PujoDetailPage pujo={pujo} /> : <PujoListPage />;
}


function AboutPage() {
  return (
    <main className="about-page">
      <div className="about-background" aria-hidden="true" />
      <header className="about-nav">
        <nav aria-label="Primary navigation">
          <a href="/">HOME</a>
          <a href="/pujo">PUJO</a>
          <span className="about-disabled-link" aria-disabled="true">BLOG</span>
          <a href="/about" aria-current="page">ABOUT</a>
          <a href="/login">LOGIN</a>
        </nav>
      </header>

      <section className="about-content" aria-labelledby="about-title">
        <div className="about-panel">
          <h1 id="about-title">About Us</h1>
          <h2>Celebrating Durga Puja Through Every Picture</h2>

          <p>
            Welcome to 13Paarbon, a public platform created to celebrate the beauty,
            creativity, and spirit of Durga Puja through photographs.
          </p>
          <p>
            Durga Puja is more than a festival-it is a celebration of art, tradition,
            community, creativity, and devotion. Every year, countless Puja committees
            create unique pandals, beautiful idols, stunning decorations, and memorable
            experiences. Our goal is to bring these moments together in one place.
          </p>

          <h2>What We Do</h2>
          <p>
            Our platform allows people to share and discover photographs of Durga Puja
            celebrations from different places. Each photograph can be accompanied by
            the name of the Puja, pandal, and location, making it easier for visitors to
            identify and explore different celebrations.
          </p>
          <p>
            Whether you are looking for beautifully decorated pandals, unique Durga
            idols, creative themes, or simply want to remember a Puja you visited, our
            platform makes it easy to explore them through photographs.
          </p>

          <h2>Our Vision</h2>
          <p>
            We want to build a digital visual archive of Durga Puja-a place where
            memories from different celebrations can be preserved and shared with
            everyone.
          </p>
          <p>
            We believe that every Puja has a story to tell, and every photograph can
            preserve a small part of that story for years to come.
          </p>

          <h2>Join the Community</h2>
          <p>
            Everyone is welcome to explore the collection and share their own Durga Puja
            photographs.
          </p>
          <p className="about-highlight">📸 Capture it.</p>
          <p className="about-highlight">🪔 Share it.</p>
          <p className="about-highlight">🌺 Preserve the celebration.</p>
          <p>
            Together, let's create a growing digital collection that celebrates the
            beauty and diversity of Durga Puja.
          </p>
        </div>
      </section>
    </main>
  );
}

function App() {
  // Keep the existing Home/Pujo components untouched while allowing their
  // existing #about links to open the functional About page.
  const [hash, setHash] = useState(() => window.location.hash.toLowerCase());

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash.toLowerCase());

    const onDisabledNavigation = (event) => {
      const link = event.target.closest?.('a[href="#blog"]');
      if (link) event.preventDefault();
    };

    window.addEventListener("hashchange", onHashChange);
    document.addEventListener("click", onDisabledNavigation);
    return () => {
      window.removeEventListener("hashchange", onHashChange);
      document.removeEventListener("click", onDisabledNavigation);
    };
  }, []);

  const path = window.location.pathname.replace(/\/+$/, "") || "/";

  // The existing Home and Pujo navigation already use #about. Handle that
  // hash at the app/router level so neither page's visual/component code has
  // to be changed.
  if (path === "/login") return <AuthPage />;
  if (hash === "#about") return <AboutPage />;
  if (path === "/about") return <AboutPage />;
  if (path === "/pujo") return <PujoListPage />;
  if (path.startsWith("/pujo/")) {
    const id = decodeURIComponent(path.slice("/pujo/".length));
    return <PujoDetailRoute id={id} />;
  }
  return <IntroSequence />;
}

createRoot(document.getElementById("root")).render(<App />);
