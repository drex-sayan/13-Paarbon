import React, { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "../supabaseClient";

export function BlogListPage() {
  const [posts, setPosts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedCat, setSelectedCat] = useState("all");
  const [page, setPage] = useState(1);
  const LIMIT = 9;

  useEffect(() => {
    async function load() {
      const { data: cats } = await supabase.from('blog_categories').select('*').order('name');
      if (cats) setCategories(cats);

      const { data: p } = await supabase.from('blog_posts')
        .select('*, blog_categories(name), profiles!blog_posts_author_id_fkey(username, avatar_url)')
        .eq('status', 'PUBLISHED')
        .is('deleted_at', null)
        .order('is_featured', { ascending: false })
        .order('published_at', { ascending: false });
      
      if (p) setPosts(p);
      setLoading(false);
    }
    load();
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible');
        }
      });
    }, { rootMargin: "0px 0px -10% 0px" });

    const cards = document.querySelectorAll('.blog-card:not(.is-visible)');
    cards.forEach(c => observer.observe(c));
    return () => observer.disconnect();
  }, [posts, query, selectedCat, page]);

  const filtered = useMemo(() => {
    let f = posts;
    if (selectedCat !== 'all') f = f.filter(p => p.category_id === selectedCat);
    if (query) {
      const q = query.toLowerCase();
      f = f.filter(p => p.title.toLowerCase().includes(q) || p.excerpt?.toLowerCase().includes(q));
    }
    return f;
  }, [posts, selectedCat, query]);

  const featured = filtered.length > 0 && !query && selectedCat === 'all' ? filtered[0] : null;
  const gridPosts = filtered.slice(featured ? 1 : 0, page * LIMIT);
  const hasMore = gridPosts.length < (filtered.length - (featured ? 1 : 0));

  return (
    <div className="blog-page">
      <nav className="pujo-nav"><ul><li><a href="/">Home</a></li><li><a href="/pujo">Pujo</a></li><li><a href="/blog" aria-current="page">Blog</a></li><li><a href="/about">About</a></li><li><a href="/login">Login</a></li></ul></nav>
      
      <div className="blog-hero">
        <div className="blog-hero-bg">
          <img src="/images/hero.jpg" alt="Blog Hero" />
        </div>
        <div className="blog-hero-overlay" />
        <div className="blog-hero-content animate-reveal">
          <span className="blog-hero-kicker">Blog</span>
          <h1 className="blog-hero-title">Stories from Kolkata</h1>
          <p className="blog-hero-desc">Beyond the pandal — stories, people, art and traditions of Durga Puja.</p>
        </div>
      </div>

      <div className="blog-categories animate-reveal">
        <button className={`blog-category-btn ${selectedCat === 'all' ? 'active' : ''}`} onClick={() => { setSelectedCat('all'); setPage(1); }}>All Stories</button>
        {categories.map(c => (
          <button key={c.id} className={`blog-category-btn ${selectedCat === c.id ? 'active' : ''}`} onClick={() => { setSelectedCat(c.id); setPage(1); }}>{c.name}</button>
        ))}
      </div>

      <div className="blog-search-wrap animate-reveal" style={{ display: 'flex', gap: 16, alignItems: 'center', justifyContent: 'center' }}>
        <input className="blog-search-input" placeholder="Search stories..." value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} />
        <a href="/blog/manage" className="blog-btn blog-btn-outline" style={{ padding: '8px 16px', borderRadius: 20 }}>My Blog</a>
      </div>

      <div className="blog-container">
        {loading ? (
          <p style={{ textAlign: 'center' }}>Loading stories...</p>
        ) : filtered.length === 0 ? (
          <p style={{ textAlign: 'center' }}>No stories found.</p>
        ) : (
          <div className="blog-grid">
            {featured && (
              <a href={`/blog/${featured.slug}`} className="blog-card blog-card--featured">
                <div className="blog-card-img-wrap">
                  <img src={featured.cover_photo || '/images/hero.jpg'} alt={featured.title} className="blog-card-img" />
                </div>
                <div className="blog-card-content">
                  <span className="blog-card-category">{featured.blog_categories?.name}</span>
                  <h2 className="blog-card-title">{featured.title}</h2>
                  <p className="blog-card-excerpt">{featured.excerpt}</p>
                  <div className="blog-card-meta">
                    <span>{featured.profiles?.username || 'Unknown'}</span>
                    <span>{new Date(featured.published_at || featured.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              </a>
            )}
            
            {gridPosts.map((p, i) => {
              let cardClass = 'blog-card--standard';
              if (i % 5 === 0) cardClass = 'blog-card--large';
              else if (i % 5 === 3) cardClass = 'blog-card--tall';

              return (
                <a href={`/blog/${p.slug}`} key={p.id} className={`blog-card ${cardClass}`}>
                  <div className="blog-card-img-wrap">
                    <img src={p.cover_photo || '/images/hero.jpg'} alt={p.title} className="blog-card-img" />
                  </div>
                  <div className="blog-card-content">
                    <span className="blog-card-category">{p.blog_categories?.name}</span>
                    <h2 className="blog-card-title">{p.title}</h2>
                    <p className="blog-card-excerpt">{p.excerpt}</p>
                    <div className="blog-card-meta">
                      <span>{p.profiles?.username || 'Unknown'}</span>
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        )}
        
        {hasMore && (
          <div style={{ textAlign: 'center', marginTop: 60 }}>
            <button className="blog-btn blog-btn-outline" onClick={() => setPage(p => p + 1)}>Load More</button>
          </div>
        )}
      </div>
    </div>
  );
}
