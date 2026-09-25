import React, { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { getCurrentProfile } from "../auth";
import DOMPurify from "dompurify";

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
  const [errorMsg, setErrorMsg] = useState(null);
  const [profile, setProfile] = useState(null);
  const [liked, setLiked] = useState(false);
  const [reportModal, setReportModal] = useState(false);
  const [reportReason, setReportReason] = useState("Inappropriate");
  const [reportDesc, setReportDesc] = useState("");

  useEffect(() => {
    async function init() {
      try {
        const prof = await getCurrentProfile();
        setProfile(prof);
      } catch (e) {}
      
      const { data, error } = await supabase.from('blog_posts')
        .select('*, blog_categories(name), profiles!blog_posts_author_id_fkey(username)')
        .eq('slug', slug)
        .is('deleted_at', null)
        .eq('status', 'PUBLISHED')
        .single();
        
      if (error) {
        console.error("Fetch Post Error:", error);
        if (error.code === 'PGRST116') {
          // Zero rows returned (not found)
          setPost(null);
          setErrorMsg("Article not found.");
        } else {
          setPost(null);
          setErrorMsg("Unable to load this article.");
        }
      } else if (data) {
        setPost(data);
        supabase.rpc('increment_blog_post_view', { p_post_id: data.id }).then();
        
        supabase.from('blog_posts')
          .select('id, slug, title, cover_photo, excerpt')
          .eq('category_id', data.category_id)
          .eq('status', 'PUBLISHED')
          .is('deleted_at', null)
          .neq('id', data.id)
          .limit(3)
          .then(({ data: rel }) => setRelatedPosts(rel || []));

        supabase.from('blog_related_pujos')
          .select('pujos(id, name, location)')
          .eq('post_id', data.id)
          .then(({ data: relP }) => {
             if (relP) setRelatedPujos(relP.map(rp => rp.pujos).filter(Boolean));
          });
      }
      setLoading(false);
    }
    init();
  }, [slug]);

  useEffect(() => {
    if (post && profile) {
      supabase.from('blog_likes').select('id').eq('post_id', post.id).eq('user_id', profile.id).single()
        .then(({ data }) => setLiked(!!data));
    }
  }, [post, profile]);

  const toggleLike = async () => {
    if (!profile) return window.location.href = "/login?redirect=/blog/" + slug;
    
    // Optimistic UI update
    setLiked(!liked);
    setPost(p => ({ ...p, like_count: liked ? Math.max(0, p.like_count - 1) : p.like_count + 1 }));
    
    const rpcName = liked ? 'unlike_blog_post' : 'like_blog_post';
    const { data: newCount, error } = await supabase.rpc(rpcName, { p_post_id: post.id });
    
    if (!error && typeof newCount === 'number') {
      setPost(p => ({ ...p, like_count: newCount }));
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    const toast = document.createElement("div");
    toast.innerText = "Link copied";
    toast.className = "blog-toast";
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
  };

  const share = (platform) => {
    const url = window.location.href;
    if (platform === 'copy') {
      copyLink();
    } else if (platform === 'wa') {
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(url)}`);
    } else if (platform === 'fb') {
      window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`);
    } else if (platform === 'x') {
      window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}`);
    }
  };

  const submitReport = async () => {
    if (!profile) return alert("Please log in to report.");
    const { error } = await supabase.from('blog_reports').insert({ 
      post_id: post.id, 
      user_id: profile.id, 
      reason: reportReason,
      description: reportDesc
    });
    if (error) {
       alert("Unable to report this story.");
    } else {
       setReportModal(false);
       setReportDesc("");
       const toast = document.createElement("div");
       toast.innerText = "Report Submitted";
       toast.className = "blog-toast";
       document.body.appendChild(toast);
       setTimeout(() => toast.remove(), 2500);
    }
  };

  if (loading) return <div className="article-page"><p style={{padding:100}}>Loading article...</p></div>;
  if (errorMsg) return <div className="article-page"><p style={{padding:100}}>{errorMsg}</p></div>;
  if (!post) return <div className="article-page"><p style={{padding:100}}>Article not found.</p></div>;

  const publishedDate = post.published_at ? new Date(post.published_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';
  const updatedDate = (post.updated_at && post.updated_at !== post.published_at) ? new Date(post.updated_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';

  const sanitizedContent = DOMPurify.sanitize(post.content, {
    ALLOWED_TAGS: ['p', 'h2', 'h3', 'strong', 'em', 'blockquote', 'ul', 'ol', 'li', 'a', 'figure', 'img', 'figcaption', 'hr', 'br', 'span', 'div'],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'class', 'style', 'target', 'rel']
  });

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
            <span>?</span>
            <span>Published {publishedDate}{updatedDate && updatedDate !== publishedDate && ` (Updated ${updatedDate})`}</span>
          </div>
          <h1 className="article-title">{post.title}</h1>
          <p className="article-excerpt">{post.excerpt}</p>
          <div className="article-author-row">
            <div className="article-avatar">
              {(post.profiles?.username?.[0] || 'A').toUpperCase()}
            </div>
            <div>
              <div className="article-author-name">{post.profiles?.username || 'Unknown'}</div>
              <div className="article-date">Author</div>
            </div>
          </div>
        </div>
      </div>

      <div className="article-body animate-reveal" dangerouslySetInnerHTML={{ __html: sanitizedContent }} />

      <div className="article-actions animate-reveal">
        <button className={`btn-like ${liked ? 'liked' : ''}`} onClick={toggleLike}>
          ♥ {post.like_count} Likes
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
                <p>Location / Maps +'</p>
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
            {(reportReason === 'Other' || reportReason === 'Copyright issue' || reportReason === 'Incorrect information') && (
               <textarea className="blog-input" style={{marginTop: 12, width: '100%', minHeight: 80, boxSizing: 'border-box'}} placeholder="Please describe the issue..." value={reportDesc} onChange={e => setReportDesc(e.target.value)} />
            )}
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
