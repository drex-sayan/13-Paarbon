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
  if (activeTab === 'My Posts' || activeTab === 'All') filteredPosts = posts.filter(p => !p.deleted_at);
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
          <button key={t} className={`blog-category-btn ${activeTab === t ? 'active' : ''}`} onClick={() => setActiveTab(t)}>
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
                <td><span className={`blog-status status-${p.status.toLowerCase()}`}>{p.status}</span></td>
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
                    <a href={`/blog/${p.slug}`} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>View</a>
                    
                    {!isEditor && (p.status === 'DRAFT' || p.status === 'REJECTED' || p.status === 'NEEDS_CHANGES') && (
                      <a href={`/blog/write?id=${p.id}`} style={{ textDecoration: 'underline' }}>Edit</a>
                    )}
                    
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
