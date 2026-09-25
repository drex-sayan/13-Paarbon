import React, { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { getCurrentProfile } from "../auth";

function SEO({ title, description, image, url }) {
  useEffect(() => {
    document.title = title ? `${title} | 13 Paarbon Blog` : "13 Paarbon Blog";
    
    const setMeta = (name, content) => {
      if (!content) return;
      let el = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
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
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(url)}`);
    } else if (platform === 'fb') {
      window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`);
    } else if (platform === 'x') {
      window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}`);
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
        <button className={`btn-like ${liked ? 'liked' : ''}`} onClick={toggleLike}>
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
              <a href={`/pujo/${rp.id}`} key={rp.id} className="blog-pujo-card">
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
              <a href={`/blog/${rp.slug}`} key={rp.id} className="blog-card blog-card--standard">
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
