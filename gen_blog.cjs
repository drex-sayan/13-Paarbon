const fs = require('fs');
const path = require('path');

const content = `import React, { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "./supabaseClient";
import { getCurrentProfile, ROLES } from "./auth";

// --- HELPERS ---
function useIntersectionObserver(ref, options) {
  const [isIntersecting, setIntersecting] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      setIntersecting(entry.isIntersecting);
    }, options);
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref, options]);
  return isIntersecting;
}

// --- BLOG LIST PAGE ---
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

  const filtered = useMemo(() => {
    let f = posts;
    if (selectedCat !== 'all') f = f.filter(p => p.category_id === selectedCat);
    if (query) {
      const q = query.toLowerCase();
      f = f.filter(p => p.title.toLowerCase().includes(q) || p.excerpt?.toLowerCase().includes(q));
    }
    return f;
  }, [posts, selectedCat, query]);

  const featured = filtered.length > 0 ? filtered[0] : null;
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
        <div className="blog-hero-content">
          <span className="blog-hero-kicker">Blog</span>
          <h1 className="blog-hero-title">Stories from Kolkata</h1>
          <p className="blog-hero-desc">Beyond the pandal — stories, people, art and traditions of Durga Puja.</p>
        </div>
      </div>

      <div className="blog-categories">
        <button className={\`blog-category-btn \${selectedCat === 'all' ? 'active' : ''}\`} onClick={() => setSelectedCat('all')}>All Stories</button>
        {categories.map(c => (
          <button key={c.id} className={\`blog-category-btn \${selectedCat === c.id ? 'active' : ''}\`} onClick={() => setSelectedCat(c.id)}>{c.name}</button>
        ))}
      </div>

      <div className="blog-search-wrap">
        <input className="blog-search-input" placeholder="Search stories..." value={query} onChange={e => setQuery(e.target.value)} />
      </div>

      <div className="blog-container">
        {loading ? (
          <p style={{ textAlign: 'center' }}>Loading stories...</p>
        ) : filtered.length === 0 ? (
          <p style={{ textAlign: 'center' }}>No stories found.</p>
        ) : (
          <div className="blog-grid">
            {featured && (
              <a href={\`/blog/\${featured.slug}\`} className="blog-card blog-card--featured">
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
              // Asymmetric layout logic
              let cardClass = 'blog-card--standard';
              if (i % 5 === 0) cardClass = 'blog-card--large';
              else if (i % 5 === 3) cardClass = 'blog-card--tall';

              return (
                <a href={\`/blog/\${p.slug}\`} key={p.id} className={\`blog-card \${cardClass}\`}>
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

// --- BLOG ARTICLE PAGE ---
export function BlogArticlePage({ slug }) {
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [liked, setLiked] = useState(false);

  useEffect(() => {
    getCurrentProfile().then(setProfile).catch(() => {});
    async function load() {
      const { data, error } = await supabase.from('blog_posts')
        .select('*, blog_categories(name), profiles!blog_posts_author_id_fkey(username, avatar_url)')
        .eq('slug', slug)
        .single();
      if (data) {
        setPost(data);
        // Track view (simple increment, ideally via RPC but this is fine for now)
        supabase.from('blog_posts').update({ views: data.views + 1 }).eq('id', data.id).then();
      }
      setLoading(false);
    }
    load();
  }, [slug]);

  useEffect(() => {
    if (post && profile) {
      supabase.from('blog_likes').select('id').eq('post_id', post.id).eq('user_id', profile.id).single()
        .then(({ data }) => setLiked(!!data));
    }
  }, [post, profile]);

  const toggleLike = async () => {
    if (!profile) return window.location.href = "/login";
    if (liked) {
      setLiked(false);
      setPost(p => ({ ...p, like_count: p.like_count - 1 }));
      await supabase.from('blog_likes').delete().eq('post_id', post.id).eq('user_id', profile.id);
      await supabase.from('blog_posts').update({ like_count: post.like_count - 1 }).eq('id', post.id);
    } else {
      setLiked(true);
      setPost(p => ({ ...p, like_count: p.like_count + 1 }));
      await supabase.from('blog_likes').insert({ post_id: post.id, user_id: profile.id });
      await supabase.from('blog_posts').update({ like_count: post.like_count + 1 }).eq('id', post.id);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    alert("Link copied!");
  };

  if (loading) return <div className="article-page"><p style={{padding:100}}>Loading...</p></div>;
  if (!post) return <div className="article-page"><p style={{padding:100}}>Article not found.</p></div>;

  return (
    <div className="article-page">
      <nav className="pujo-nav"><ul><li><a href="/">Home</a></li><li><a href="/pujo">Pujo</a></li><li><a href="/blog">Blog</a></li><li><a href="/about">About</a></li><li><a href="/login">Login</a></li></ul></nav>
      
      <div className="article-hero">
        <div className="article-hero-bg">
          <img src={post.cover_photo || '/images/hero.jpg'} alt={post.title} />
        </div>
        <div className="article-hero-overlay" />
        <div className="article-hero-content">
          <div className="article-meta-top">
            <span>{post.blog_categories?.name}</span>
            <span>•</span>
            <span>{new Date(post.published_at || post.created_at).toLocaleDateString()}</span>
          </div>
          <h1 className="article-title">{post.title}</h1>
          <p className="article-excerpt">{post.excerpt}</p>
          <div className="article-author-row">
            <div className="article-avatar">{post.profiles?.username?.charAt(0) || 'A'}</div>
            <div>
              <div className="article-author-name">{post.profiles?.username || 'Author'}</div>
              <div className="article-date">Author</div>
            </div>
          </div>
        </div>
      </div>

      <div className="article-body" dangerouslySetInnerHTML={{ __html: post.content }} />

      <div className="article-actions">
        <button className={\`btn-like \${liked ? 'liked' : ''}\`} onClick={toggleLike}>
          ♡ {post.like_count} Likes
        </button>
        <button className="btn-like" onClick={copyLink}>Copy Link</button>
      </div>
    </div>
  );
}

// --- BLOG WRITE PAGE ---
export function BlogWritePage() {
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({ title: "", excerpt: "", content: "", category_id: "", cover_photo: "" });
  const [categories, setCategories] = useState([]);
  const [status, setStatus] = useState("DRAFT");
  const [saving, setSaving] = useState(false);
  const [postId, setPostId] = useState(null);

  useEffect(() => {
    getCurrentProfile().then(p => {
      if (!p) window.location.href = "/login";
      else setProfile(p);
    });
    supabase.from('blog_categories').select('*').order('name').then(({data}) => {
      if(data) setCategories(data);
      if(data && data.length > 0) setForm(f => ({ ...f, category_id: data[0].id }));
    });
  }, []);

  // Extremely simple autosave logic
  useEffect(() => {
    if (!profile || !form.title) return;
    const t = setTimeout(saveDraft, 2000);
    return () => clearTimeout(t);
  }, [form]);

  const saveDraft = async () => {
    if (!profile || !form.title) return;
    setSaving(true);
    let id = postId;
    const slug = form.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
    
    if (!id) {
      const { data, error } = await supabase.from('blog_posts').insert({
        ...form, slug, author_id: profile.id, status: 'DRAFT'
      }).select().single();
      if (data) { setPostId(data.id); id = data.id; }
    } else {
      await supabase.from('blog_posts').update({ ...form, slug }).eq('id', id);
    }
    setSaving(false);
  };

  const submitReview = async () => {
    await saveDraft();
    if (!postId) return alert("Please fill out the title first.");
    await supabase.from('blog_posts').update({ status: 'PENDING_REVIEW' }).eq('id', postId);
    alert("Submitted for review!");
    window.location.href = "/blog";
  };

  if (!profile) return null;

  return (
    <div className="blog-write-page">
      <nav className="pujo-nav" style={{ position: 'relative', background: 'transparent' }}><ul><li><a href="/">Home</a></li><li><a href="/pujo">Pujo</a></li><li><a href="/blog">Blog</a></li><li><a href="/about">About</a></li><li><a href="/login">Login</a></li></ul></nav>
      <h2 style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 36, margin: '40px 0' }}>Write a Story</h2>
      
      <div className="blog-form-group">
        <label>Title</label>
        <input className="blog-input" value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="A compelling title..." />
      </div>
      
      <div className="blog-form-group">
        <label>Excerpt</label>
        <textarea className="blog-textarea" rows={2} value={form.excerpt} onChange={e => setForm({...form, excerpt: e.target.value})} placeholder="A short summary..." />
      </div>

      <div className="blog-form-group">
        <label>Category</label>
        <select className="blog-select" value={form.category_id} onChange={e => setForm({...form, category_id: e.target.value})}>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      
      <div className="blog-form-group">
        <label>Content (HTML supported)</label>
        <textarea className="blog-textarea" rows={15} value={form.content} onChange={e => setForm({...form, content: e.target.value})} placeholder="Write your story..." />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 40 }}>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>{saving ? "Saving..." : postId ? "Draft saved" : ""}</span>
        <div style={{ display: 'flex', gap: 16 }}>
          <button className="blog-btn blog-btn-outline" onClick={() => window.location.href="/blog"}>Cancel</button>
          <button className="blog-btn" onClick={submitReview}>Submit for Review</button>
        </div>
      </div>
    </div>
  );
}

// --- BLOG MANAGER PAGE ---
export function BlogManagerPage() {
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCurrentProfile().then(p => {
      if (!p || (p.role !== ROLES.EDITOR && p.role !== ROLES.ADMIN)) {
        window.location.href = "/blog";
      } else {
        setProfile(p);
        loadPosts();
      }
    });
  }, []);

  const loadPosts = async () => {
    const { data } = await supabase.from('blog_posts')
      .select('*, blog_categories(name), profiles!blog_posts_author_id_fkey(username)')
      .order('created_at', { ascending: false });
    if (data) setPosts(data);
    setLoading(false);
  };

  const updateStatus = async (id, status) => {
    await supabase.from('blog_posts').update({ status, published_at: status === 'PUBLISHED' ? new Date().toISOString() : null }).eq('id', id);
    loadPosts();
  };

  const toggleFeatured = async (id, currentFeatured) => {
    if (!currentFeatured) {
      // Unfeature all others
      await supabase.from('blog_posts').update({ is_featured: false }).eq('is_featured', true);
    }
    await supabase.from('blog_posts').update({ is_featured: !currentFeatured }).eq('id', id);
    loadPosts();
  };

  if (loading || !profile) return <div className="blog-manager-page"><p>Loading...</p></div>;

  return (
    <div className="blog-manager-page">
      <nav className="pujo-nav" style={{ position: 'relative' }}><ul><li><a href="/">Home</a></li><li><a href="/pujo">Pujo</a></li><li><a href="/blog">Blog</a></li><li><a href="/about">About</a></li><li><a href="/login">Login</a></li></ul></nav>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '40px 0' }}>
        <h2 style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 36, margin: 0 }}>Blog Manager</h2>
        <a href="/blog/write" className="blog-btn">Write Story</a>
      </div>

      <table className="blog-table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Author</th>
            <th>Status</th>
            <th>Featured</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {posts.map(p => (
            <tr key={p.id}>
              <td><strong>{p.title}</strong><br/><span style={{fontSize: 10, color: 'var(--muted)'}}>{p.blog_categories?.name}</span></td>
              <td>{p.profiles?.username}</td>
              <td><span className={\`blog-status status-\${p.status.toLowerCase()}\`}>{p.status}</span></td>
              <td>
                {p.status === 'PUBLISHED' && (
                  <button className="blog-btn-outline" style={{ padding: '4px 8px', fontSize: 10 }} onClick={() => toggleFeatured(p.id, p.is_featured)}>
                    {p.is_featured ? '★ Featured' : 'Set Featured'}
                  </button>
                )}
              </td>
              <td>
                <div style={{ display: 'flex', gap: 8 }}>
                  <a href={\`/blog/\${p.slug}\`} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>View</a>
                  {p.status === 'PENDING_REVIEW' && <button onClick={() => updateStatus(p.id, 'PUBLISHED')} style={{color:'#8f8', background:'transparent', border:'none', cursor:'pointer'}}>Publish</button>}
                  {p.status === 'PENDING_REVIEW' && <button onClick={() => updateStatus(p.id, 'REJECTED')} style={{color:'#f88', background:'transparent', border:'none', cursor:'pointer'}}>Reject</button>}
                  {p.status === 'PUBLISHED' && <button onClick={() => updateStatus(p.id, 'DRAFT')} style={{color:'#fff', background:'transparent', border:'none', cursor:'pointer'}}>Unpublish</button>}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
`;

fs.writeFileSync(path.join(__dirname, 'src', 'blog.jsx'), content);
