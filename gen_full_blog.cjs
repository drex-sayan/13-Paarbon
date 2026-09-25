const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'src', 'blog');
if (!fs.existsSync(dir)) fs.mkdirSync(dir);

const files = {};

files['index.jsx'] = `
export { BlogListPage } from './BlogListPage';
export { BlogArticlePage } from './BlogArticlePage';
export { BlogWritePage } from './BlogWritePage';
export { BlogManagerPage } from './BlogManagerPage';
`;

files['BlogListPage.jsx'] = `
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
    // Scroll reveal observer
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
        <button className={\`blog-category-btn \${selectedCat === 'all' ? 'active' : ''}\`} onClick={() => { setSelectedCat('all'); setPage(1); }}>All Stories</button>
        {categories.map(c => (
          <button key={c.id} className={\`blog-category-btn \${selectedCat === c.id ? 'active' : ''}\`} onClick={() => { setSelectedCat(c.id); setPage(1); }}>{c.name}</button>
        ))}
      </div>

      <div className="blog-search-wrap animate-reveal">
        <input className="blog-search-input" placeholder="Search stories..." value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} />
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
`;

files['BlogArticlePage.jsx'] = `
import React, { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { getCurrentProfile } from "../auth";

function SEO({ title, description, image, url }) {
  useEffect(() => {
    document.title = title ? \`\${title} | 13 Paarbon Blog\` : "13 Paarbon Blog";
    
    const setMeta = (name, content) => {
      if (!content) return;
      let el = document.querySelector(\`meta[name="\${name}"], meta[property="\${name}"]\`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(name.startsWith('og:') ? 'property' : 'name', name);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    setMeta("description", description);
    setMeta("og:title", title);
    setMeta("og:description", description);
    setMeta("og:image", image);
    setMeta("og:url", url);
  }, [title, description, image, url]);
  return null;
}

export function BlogArticlePage({ slug }) {
  const [post, setPost] = useState(null);
  const [relatedPosts, setRelatedPosts] = useState([]);
  const [relatedPujos, setRelatedPujos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [liked, setLiked] = useState(false);
  const [reportModal, setReportModal] = useState(false);
  const [reportReason, setReportReason] = useState("Inappropriate");

  useEffect(() => {
    getCurrentProfile().then(setProfile).catch(() => {});
    async function load() {
      const { data, error } = await supabase.from('blog_posts')
        .select('*, blog_categories(name), profiles!blog_posts_author_id_fkey(username, avatar_url)')
        .eq('slug', slug)
        .single();
        
      if (data) {
        setPost(data);
        supabase.from('blog_posts').update({ views: data.views + 1 }).eq('id', data.id).then();
        
        // Load related stories
        supabase.from('blog_posts')
          .select('id, slug, title, cover_photo, excerpt')
          .eq('category_id', data.category_id)
          .eq('status', 'PUBLISHED')
          .neq('id', data.id)
          .limit(3)
          .then(({ data: rel }) => setRelatedPosts(rel || []));

        // Load related pujos
        supabase.from('blog_related_pujos')
          .select('pujos(id, name, location)')
          .eq('post_id', data.id)
          .then(({ data: relP }) => {
             if (relP) setRelatedPujos(relP.map(rp => rp.pujos).filter(Boolean));
          });
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

  const submitReport = async () => {
    if (!profile) return window.location.href = "/login";
    await supabase.from('blog_reports').insert({ post_id: post.id, user_id: profile.id, reason: reportReason });
    setReportModal(false);
    alert("Report submitted.");
  };

  const share = (platform) => {
    const url = window.location.href;
    if (platform === 'copy') {
      navigator.clipboard.writeText(url);
      alert("Link copied!");
    } else if (platform === 'wa') {
      window.open(\`https://api.whatsapp.com/send?text=\${encodeURIComponent(url)}\`);
    } else if (platform === 'fb') {
      window.open(\`https://www.facebook.com/sharer/sharer.php?u=\${encodeURIComponent(url)}\`);
    } else if (platform === 'x') {
      window.open(\`https://twitter.com/intent/tweet?url=\${encodeURIComponent(url)}\`);
    }
  };

  if (loading) return <div className="article-page"><p style={{padding:100}}>Loading...</p></div>;
  if (!post) return <div className="article-page"><p style={{padding:100}}>Article not found.</p></div>;

  return (
    <div className="article-page">
      <SEO title={post.title} description={post.excerpt} image={post.cover_photo} url={window.location.href} />
      <nav className="pujo-nav"><ul><li><a href="/">Home</a></li><li><a href="/pujo">Pujo</a></li><li><a href="/blog">Blog</a></li><li><a href="/about">About</a></li><li><a href="/login">Login</a></li></ul></nav>
      
      <div className="article-hero">
        <div className="article-hero-bg">
          <img src={post.cover_photo || '/images/hero.jpg'} alt={post.title} />
        </div>
        <div className="article-hero-overlay" />
        <div className="article-hero-content animate-reveal">
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

      <div className="article-body animate-reveal" dangerouslySetInnerHTML={{ __html: post.content }} />

      <div className="article-actions animate-reveal">
        <button className={\`btn-like \${liked ? 'liked' : ''}\`} onClick={toggleLike}>
          ♡ {post.like_count} Likes
        </button>
        <div className="article-share">
          <button className="btn-like" onClick={() => share('copy')}>Copy Link</button>
          <button className="btn-like" onClick={() => share('wa')}>WhatsApp</button>
          <button className="btn-like" onClick={() => share('fb')}>Facebook</button>
          <button className="btn-like" onClick={() => share('x')}>X</button>
          <button className="btn-like" style={{ borderColor: 'transparent', color: 'var(--muted)' }} onClick={() => setReportModal(true)}>Report</button>
        </div>
      </div>

      {relatedPujos.length > 0 && (
        <div className="article-related-pujos animate-reveal">
          <h3>Explore The Pujos</h3>
          <div className="blog-pujo-list">
            {relatedPujos.map(rp => (
              <a href={\`/pujo/\${rp.id}\`} key={rp.id} className="blog-pujo-card">
                <h4>{rp.name}</h4>
                <p>Location / Maps →</p>
              </a>
            ))}
          </div>
        </div>
      )}

      {relatedPosts.length > 0 && (
        <div className="article-related-stories animate-reveal">
          <h3>Related Stories</h3>
          <div className="blog-grid" style={{ padding: '0 24px', maxWidth: 1400, margin: '0 auto' }}>
            {relatedPosts.map(rp => (
              <a href={\`/blog/\${rp.slug}\`} key={rp.id} className="blog-card blog-card--standard">
                <div className="blog-card-img-wrap"><img src={rp.cover_photo || '/images/hero.jpg'} className="blog-card-img" /></div>
                <div className="blog-card-content">
                  <h2 className="blog-card-title" style={{ fontSize: 18 }}>{rp.title}</h2>
                  <p className="blog-card-excerpt" style={{ fontSize: 12 }}>{rp.excerpt}</p>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {reportModal && (
        <div className="blog-modal-backdrop" onClick={() => setReportModal(false)}>
          <div className="blog-modal" onClick={e => e.stopPropagation()}>
            <h3>Report Article</h3>
            <select className="blog-select" value={reportReason} onChange={e => setReportReason(e.target.value)}>
              <option>Inappropriate</option>
              <option>Copyright issue</option>
              <option>Incorrect information</option>
              <option>Spam</option>
              <option>Other</option>
            </select>
            <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
              <button className="blog-btn" onClick={submitReport}>Submit</button>
              <button className="blog-btn blog-btn-outline" onClick={() => setReportModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
`;

files['BlogWritePage.jsx'] = `
import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../supabaseClient";
import { getCurrentProfile } from "../auth";

export function BlogWritePage() {
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({ title: "", excerpt: "", content: "", category_id: "", cover_photo: "" });
  const [categories, setCategories] = useState([]);
  const [pujos, setPujos] = useState([]);
  const [selectedPujos, setSelectedPujos] = useState([]);
  
  const [status, setStatus] = useState("DRAFT");
  const [postId, setPostId] = useState(null);
  const [rejectionReason, setRejectionReason] = useState("");
  
  const [saving, setSaving] = useState(false);
  const [copyrightConfirmed, setCopyrightConfirmed] = useState(false);
  
  const contentRef = useRef(null);

  useEffect(() => {
    getCurrentProfile().then(p => {
      if (!p) window.location.href = "/login";
      else setProfile(p);
    });
    supabase.from('blog_categories').select('*').order('name').then(({data}) => {
      if(data) setCategories(data);
      if(data && data.length > 0 && !form.category_id) setForm(f => ({ ...f, category_id: data[0].id }));
    });
    supabase.from('pujos').select('id, name').order('name').then(({data}) => {
      if (data) setPujos(data);
    });
  }, []);

  useEffect(() => {
    if (!profile || !form.title) return;
    const t = setTimeout(saveDraft, 2000);
    return () => clearTimeout(t);
  }, [form, selectedPujos]);

  const saveDraft = async () => {
    if (!profile || !form.title) return;
    setSaving(true);
    let id = postId;
    const slug = form.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
    
    let currentStatus = status;
    if (status === 'REJECTED' || status === 'NEEDS_CHANGES') currentStatus = 'DRAFT'; // edits revert it
    
    if (!id) {
      const { data, error } = await supabase.from('blog_posts').insert({
        ...form, slug, author_id: profile.id, status: currentStatus
      }).select().single();
      if (data) { setPostId(data.id); id = data.id; setStatus(data.status); }
    } else {
      await supabase.from('blog_posts').update({ ...form, slug, status: currentStatus }).eq('id', id);
    }
    
    if (id) {
      await supabase.from('blog_related_pujos').delete().eq('post_id', id);
      if (selectedPujos.length > 0) {
        const pujoInserts = selectedPujos.map(pid => ({ post_id: id, pujo_id: pid }));
        await supabase.from('blog_related_pujos').insert(pujoInserts);
      }
    }
    setSaving(false);
  };

  const submitReview = async () => {
    if (!copyrightConfirmed) return alert("You must confirm copyright ownership.");
    if (!form.title || !form.content || !form.cover_photo) return alert("Title, content, and cover photo are required.");
    
    await saveDraft();
    if (!postId) return;
    
    await supabase.from('blog_posts').update({ status: 'PENDING_REVIEW' }).eq('id', postId);
    alert("Submitted for review!");
    window.location.href = "/blog";
  };

  const uploadImage = async (e, type) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return alert("Max size 10MB");
    
    const ext = file.name.split('.').pop();
    const path = \`\${crypto.randomUUID()}.\${ext}\`;
    
    setSaving(true);
    const { error } = await supabase.storage.from('blog-images').upload(path, file);
    if (!error) {
      const { data } = supabase.storage.from('blog-images').getPublicUrl(path);
      if (type === 'cover') {
        setForm({ ...form, cover_photo: data.publicUrl });
      } else {
        // Insert inline image HTML
        const imgHtml = \`<figure class="article-inline-image"><img src="\${data.publicUrl}" /><figcaption class="article-image-caption">Caption</figcaption></figure>\`;
        setForm({ ...form, content: form.content + imgHtml });
      }
    }
    setSaving(false);
  };

  const execCommand = (cmd, val=null) => {
    document.execCommand(cmd, false, val);
    if (contentRef.current) {
      setForm({ ...form, content: contentRef.current.innerHTML });
    }
  };

  if (!profile) return null;

  return (
    <div className="blog-write-page">
      <nav className="pujo-nav" style={{ position: 'relative', background: 'transparent' }}><ul><li><a href="/">Home</a></li><li><a href="/pujo">Pujo</a></li><li><a href="/blog">Blog</a></li><li><a href="/about">About</a></li><li><a href="/login">Login</a></li></ul></nav>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 36, margin: '40px 0' }}>Write a Story</h2>
        <a href="/blog/manage" className="blog-btn blog-btn-outline" style={{ display: 'block', textAlign: 'center' }}>My Posts / Manager</a>
      </div>

      {rejectionReason && (
        <div style={{ background: 'rgba(200,0,0,0.2)', padding: 16, marginBottom: 24, border: '1px solid #f88' }}>
          <strong>Status: {status}</strong><br/>
          Reason: {rejectionReason}
        </div>
      )}
      
      <div className="blog-form-group">
        <label>Title</label>
        <input className="blog-input" value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="A compelling title..." />
      </div>
      
      <div className="blog-form-group">
        <label>Excerpt</label>
        <textarea className="blog-textarea" rows={2} value={form.excerpt} onChange={e => setForm({...form, excerpt: e.target.value})} placeholder="A short summary..." />
      </div>

      <div className="blog-form-group" style={{ display: 'flex', gap: 16 }}>
        <div style={{ flex: 1 }}>
          <label>Category</label>
          <select className="blog-select" value={form.category_id} onChange={e => setForm({...form, category_id: e.target.value})}>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label>Cover Photo (Required)</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="file" id="coverUpload" style={{ display: 'none' }} accept="image/jpeg,image/png,image/webp" onChange={e => uploadImage(e, 'cover')} />
            <button className="blog-btn blog-btn-outline" onClick={() => document.getElementById('coverUpload').click()}>Upload Cover</button>
            {form.cover_photo && <span style={{ fontSize: 10, alignSelf: 'center' }}>✓ Uploaded</span>}
          </div>
        </div>
      </div>

      <div className="blog-form-group">
        <label>Related Pujos</label>
        <select className="blog-select" multiple size={3} value={selectedPujos} onChange={e => setSelectedPujos(Array.from(e.target.selectedOptions, o => o.value))}>
          {pujos.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      
      <div className="blog-form-group">
        <label>Content</label>
        <div className="blog-toolbar" style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <button type="button" onClick={() => execCommand('formatBlock', 'H2')}>H2</button>
          <button type="button" onClick={() => execCommand('formatBlock', 'H3')}>H3</button>
          <button type="button" onClick={() => execCommand('bold')}>B</button>
          <button type="button" onClick={() => execCommand('italic')}>I</button>
          <button type="button" onClick={() => execCommand('formatBlock', 'BLOCKQUOTE')}>Quote</button>
          <button type="button" onClick={() => execCommand('insertUnorderedList')}>List</button>
          <input type="file" id="inlineUpload" style={{ display: 'none' }} accept="image/jpeg,image/png,image/webp" onChange={e => uploadImage(e, 'inline')} />
          <button type="button" onClick={() => document.getElementById('inlineUpload').click()}>Insert Image</button>
        </div>
        <div 
          ref={contentRef}
          className="blog-textarea blog-editor-content" 
          contentEditable 
          style={{ minHeight: 300, background: 'rgba(255,255,255,0.05)' }}
          onBlur={e => setForm({...form, content: e.currentTarget.innerHTML})}
          dangerouslySetInnerHTML={{ __html: form.content }}
        />
      </div>

      <div className="blog-form-group">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, textTransform: 'none', color: 'var(--cream)' }}>
          <input type="checkbox" checked={copyrightConfirmed} onChange={e => setCopyrightConfirmed(e.target.checked)} />
          I confirm that I have the right to publish this content and these photographs.
        </label>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 40 }}>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>{saving ? "Saving..." : postId ? \`Draft saved (\${status})\` : ""}</span>
        <div style={{ display: 'flex', gap: 16 }}>
          <button className="blog-btn blog-btn-outline" onClick={() => window.location.href="/blog"}>Cancel</button>
          <button className="blog-btn" onClick={submitReview}>Submit for Review</button>
        </div>
      </div>
    </div>
  );
}
`;

files['BlogManagerPage.jsx'] = `
import React, { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { getCurrentProfile, ROLES } from "../auth";

export function BlogManagerPage() {
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('My Posts');

  // Modal states
  const [rejectModal, setRejectModal] = useState({ open: false, id: null, type: '' });
  const [rejectReason, setRejectReason] = useState("");
  const [catName, setCatName] = useState("");

  useEffect(() => {
    getCurrentProfile().then(p => {
      if (!p) {
        window.location.href = "/blog";
      } else {
        setProfile(p);
        loadData(p);
      }
    });
  }, []);

  const loadData = async (p) => {
    // If not editor/admin, only load their own posts
    let postQuery = supabase.from('blog_posts').select('*, blog_categories(name), profiles!blog_posts_author_id_fkey(username)').order('created_at', { ascending: false });
    if (p.role !== ROLES.EDITOR && p.role !== ROLES.ADMIN) {
      postQuery = postQuery.eq('author_id', p.id);
    }
    const { data: pData } = await postQuery;
    if (pData) setPosts(pData);

    if (p.role === ROLES.EDITOR || p.role === ROLES.ADMIN) {
      const { data: cData } = await supabase.from('blog_categories').select('*').order('name');
      if (cData) setCategories(cData);
      
      const { data: rData } = await supabase.from('blog_reports').select('*, blog_posts(title), profiles!blog_reports_user_id_fkey(username)').eq('resolved', false);
      if (rData) setReports(rData);
    }
    setLoading(false);
  };

  const updateStatus = async (id, status, reason = null) => {
    await supabase.from('blog_posts').update({ 
      status, 
      published_at: status === 'PUBLISHED' ? new Date().toISOString() : null,
      rejection_reason: reason
    }).eq('id', id);
    setRejectModal({ open: false, id: null, type: '' });
    setRejectReason("");
    loadData(profile);
  };

  const toggleFeatured = async (id, currentFeatured) => {
    if (!currentFeatured) {
      await supabase.from('blog_posts').update({ is_featured: false }).eq('is_featured', true);
    }
    await supabase.from('blog_posts').update({ is_featured: !currentFeatured }).eq('id', id);
    loadData(profile);
  };

  const addCategory = async () => {
    if (!catName.trim()) return;
    const slug = catName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    await supabase.from('blog_categories').insert({ name: catName, slug });
    setCatName("");
    loadData(profile);
  };

  const softDelete = async (id) => {
    await supabase.from('blog_posts').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    loadData(profile);
  };

  const restore = async (id) => {
    await supabase.from('blog_posts').update({ deleted_at: null }).eq('id', id);
    loadData(profile);
  };

  const resolveReport = async (id) => {
    await supabase.from('blog_reports').update({ resolved: true }).eq('id', id);
    loadData(profile);
  };

  if (loading || !profile) return <div className="blog-manager-page"><p>Loading...</p></div>;

  const isEditor = profile.role === ROLES.EDITOR || profile.role === ROLES.ADMIN;
  
  let tabs = [];
  if (isEditor) {
    tabs = ['All', 'Pending', 'Published', 'Drafts', 'Rejected', 'Trash', 'Categories', 'Reports'];
  } else {
    tabs = ['My Posts'];
  }

  let filteredPosts = posts;
  if (activeTab === 'My Posts') filteredPosts = posts;
  else if (activeTab === 'All') filteredPosts = posts.filter(p => !p.deleted_at);
  else if (activeTab === 'Pending') filteredPosts = posts.filter(p => p.status === 'PENDING_REVIEW' && !p.deleted_at);
  else if (activeTab === 'Published') filteredPosts = posts.filter(p => p.status === 'PUBLISHED' && !p.deleted_at);
  else if (activeTab === 'Drafts') filteredPosts = posts.filter(p => p.status === 'DRAFT' && !p.deleted_at);
  else if (activeTab === 'Rejected') filteredPosts = posts.filter(p => (p.status === 'REJECTED' || p.status === 'NEEDS_CHANGES') && !p.deleted_at);
  else if (activeTab === 'Trash') filteredPosts = posts.filter(p => p.deleted_at);

  return (
    <div className="blog-manager-page">
      <nav className="pujo-nav" style={{ position: 'relative' }}><ul><li><a href="/">Home</a></li><li><a href="/pujo">Pujo</a></li><li><a href="/blog">Blog</a></li><li><a href="/about">About</a></li><li><a href="/login">Login</a></li></ul></nav>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '40px 0' }}>
        <h2 style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 36, margin: 0 }}>
          {isEditor ? 'Blog Manager' : 'My Blog'}
        </h2>
        <a href="/blog/write" className="blog-btn">Write Story</a>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 24, overflowX: 'auto' }}>
        {tabs.map(t => (
          <button key={t} className={\`blog-category-btn \${activeTab === t ? 'active' : ''}\`} onClick={() => setActiveTab(t)}>
            {t}
          </button>
        ))}
      </div>

      {activeTab === 'Categories' && isEditor ? (
        <div>
          <h3>Manage Categories</h3>
          <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
            <input className="blog-input" style={{ width: 300 }} value={catName} onChange={e => setCatName(e.target.value)} placeholder="New Category Name" />
            <button className="blog-btn" onClick={addCategory}>Add</button>
          </div>
          <table className="blog-table">
            <thead><tr><th>Name</th><th>Slug</th></tr></thead>
            <tbody>
              {categories.map(c => <tr key={c.id}><td>{c.name}</td><td>{c.slug}</td></tr>)}
            </tbody>
          </table>
        </div>
      ) : activeTab === 'Reports' && isEditor ? (
        <div>
          <h3>Active Reports</h3>
          <table className="blog-table">
            <thead><tr><th>Post</th><th>Reporter</th><th>Reason</th><th>Actions</th></tr></thead>
            <tbody>
              {reports.map(r => (
                <tr key={r.id}>
                  <td>{r.blog_posts?.title}</td>
                  <td>{r.profiles?.username}</td>
                  <td>{r.reason} - {r.description}</td>
                  <td>
                    <button className="blog-btn-outline" style={{ padding: '4px 8px' }} onClick={() => resolveReport(r.id)}>Resolve</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <table className="blog-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Author</th>
              <th>Status</th>
              {isEditor && <th>Featured</th>}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredPosts.map(p => (
              <tr key={p.id}>
                <td><strong>{p.title}</strong><br/><span style={{fontSize: 10, color: 'var(--muted)'}}>{p.blog_categories?.name}</span></td>
                <td>{p.profiles?.username}</td>
                <td><span className={\`blog-status status-\${p.status.toLowerCase()}\`}>{p.status}</span></td>
                {isEditor && (
                  <td>
                    {p.status === 'PUBLISHED' && !p.deleted_at && (
                      <button className="blog-btn-outline" style={{ padding: '4px 8px', fontSize: 10 }} onClick={() => toggleFeatured(p.id, p.is_featured)}>
                        {p.is_featured ? '★ Featured' : 'Set Featured'}
                      </button>
                    )}
                  </td>
                )}
                <td>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <a href={\`/blog/\${p.slug}\`} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>View</a>
                    
                    {/* User Actions */}
                    {!isEditor && (p.status === 'DRAFT' || p.status === 'REJECTED' || p.status === 'NEEDS_CHANGES') && (
                      <a href={\`/blog/write?id=\${p.id}\`} style={{ textDecoration: 'underline' }}>Edit</a>
                    )}
                    
                    {/* Editor Actions */}
                    {isEditor && !p.deleted_at && (
                      <>
                        {p.status === 'PENDING_REVIEW' && <button onClick={() => updateStatus(p.id, 'PUBLISHED')} style={{color:'#8f8', background:'transparent', border:'none', cursor:'pointer'}}>Publish</button>}
                        {p.status === 'PENDING_REVIEW' && <button onClick={() => setRejectModal({ open: true, id: p.id, type: 'REJECTED' })} style={{color:'#f88', background:'transparent', border:'none', cursor:'pointer'}}>Reject</button>}
                        {p.status === 'PENDING_REVIEW' && <button onClick={() => setRejectModal({ open: true, id: p.id, type: 'NEEDS_CHANGES' })} style={{color:'#fd8', background:'transparent', border:'none', cursor:'pointer'}}>Changes</button>}
                        {p.status === 'PUBLISHED' && <button onClick={() => updateStatus(p.id, 'DRAFT')} style={{color:'#fff', background:'transparent', border:'none', cursor:'pointer'}}>Unpublish</button>}
                        <button onClick={() => softDelete(p.id)} style={{color:'#f88', background:'transparent', border:'none', cursor:'pointer'}}>Delete</button>
                      </>
                    )}
                    {isEditor && p.deleted_at && (
                      <button onClick={() => restore(p.id)} style={{color:'#8f8', background:'transparent', border:'none', cursor:'pointer'}}>Restore</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {rejectModal.open && (
        <div className="blog-modal-backdrop" onClick={() => setRejectModal({ open: false, id: null, type: '' })}>
          <div className="blog-modal" onClick={e => e.stopPropagation()}>
            <h3>{rejectModal.type === 'REJECTED' ? 'Reject Article' : 'Request Changes'}</h3>
            <textarea className="blog-textarea" rows={4} value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Provide a reason..." />
            <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
              <button className="blog-btn" onClick={() => updateStatus(rejectModal.id, rejectModal.type, rejectReason)}>Submit</button>
              <button className="blog-btn blog-btn-outline" onClick={() => setRejectModal({ open: false, id: null, type: '' })}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
`;

for (const [name, content] of Object.entries(files)) {
  fs.writeFileSync(path.join(dir, name), content);
}

const cssAdditions = \`
/* Blog Toolbar & Editor */
.blog-toolbar button {
  background: rgba(255,255,255,0.1);
  border: 1px solid rgba(255,255,255,0.2);
  color: var(--cream);
  padding: 4px 8px;
  cursor: pointer;
  font-family: var(--mono);
  font-size: 11px;
}
.blog-toolbar button:hover {
  background: var(--cream);
  color: var(--black);
}

/* Animations */
.animate-reveal {
  opacity: 0;
  transform: translateY(20px);
  animation: blogReveal 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
@keyframes blogReveal {
  to { opacity: 1; transform: translateY(0); }
}

.blog-card {
  opacity: 0;
  transform: translateY(30px);
  transition: opacity 0.8s ease, transform 0.8s ease, box-shadow 0.4s ease;
}
.blog-card.is-visible {
  opacity: 1;
  transform: translateY(0);
}

/* Modals */
.blog-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.8);
  backdrop-filter: blur(4px);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
}
.blog-modal {
  background: var(--black);
  border: 1px solid rgba(255,255,255,0.2);
  padding: 32px;
  width: 100%;
  max-width: 500px;
}

/* Related Pujos */
.blog-pujo-list {
  display: flex;
  gap: 16px;
  overflow-x: auto;
  padding: 16px 24px;
}
.blog-pujo-card {
  min-width: 200px;
  border: 1px solid rgba(255,255,255,0.2);
  padding: 16px;
  background: rgba(255,255,255,0.02);
}
.blog-pujo-card h4 {
  margin: 0 0 8px 0;
  font-family: var(--serif);
  font-style: italic;
  font-weight: 400;
}
\`;

fs.appendFileSync(path.join(__dirname, 'src', 'blog.css'), cssAdditions);
