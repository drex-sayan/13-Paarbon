import React, { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { getCurrentProfile, ROLES } from "../auth";

export function BlogManagerPage() {
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [reports, setReports] = useState([]);
  const [revisions, setRevisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('Pending');

  const [rejectModal, setRejectModal] = useState({ open: false, id: null, type: '', isRevision: false });
  const [rejectReason, setRejectReason] = useState("");
  const [catName, setCatName] = useState("");

  useEffect(() => {
    getCurrentProfile().then(p => {
      if (!p) {
        window.location.href = "/blog";
      } else if (p.role !== ROLES.EDITOR && p.role !== ROLES.ADMIN) {
        window.location.href = "/blog/my";
      } else {
        setProfile(p);
        loadData(p);
      }
    });
  }, []);

  const loadData = async (p) => {
    const { data: pData } = await supabase.from('blog_posts').select('*, blog_categories(name), profiles!blog_posts_author_id_fkey(username)').order('created_at', { ascending: false });
    if (pData) setPosts(pData);

    const { data: cData } = await supabase.from('blog_categories').select('*').order('name');
    if (cData) setCategories(cData);
    
    // Fix: the DB has user_id, not reporter_id
    const { data: rData } = await supabase.from('blog_reports').select('*, blog_posts(title), profiles!blog_reports_user_id_fkey(username)').eq('resolved', false);
    if (rData) setReports(rData);

    const { data: revData } = await supabase.from('blog_post_revisions').select('*, blog_posts(title), profiles(username)').eq('status', 'PENDING_REVIEW');
    if (revData) setRevisions(revData);

    setLoading(false);
  };

  const publishAction = async (id, isRevision = false) => {
    if (isRevision) {
        const { error } = await supabase.rpc('approve_blog_post_revision', { p_revision_id: id });
        if (error) alert("Error approving revision: " + error.message);
        else alert("Revision approved & merged!");
    } else {
        const { error } = await supabase.rpc('publish_blog_post', { p_post_id: id });
        if (error) alert(error.message);
    }
    loadData(profile);
  };

  const submitReject = async () => {
    const { id, type, isRevision } = rejectModal;
    if (isRevision) {
        if (type === 'REJECTED') {
            await supabase.rpc('reject_blog_post_revision', { p_revision_id: id, p_reason: rejectReason });
        } else {
            await supabase.rpc('request_blog_post_revision_changes', { p_revision_id: id, p_reason: rejectReason });
        }
    } else {
        const rpcName = type === 'REJECTED' ? 'reject_blog_post' : 'request_blog_changes';
        const { error } = await supabase.rpc(rpcName, { p_post_id: id, p_reason: rejectReason });
        if (error) alert(error.message);
    }
    setRejectModal({ open: false, id: null, type: '', isRevision: false });
    setRejectReason("");
    loadData(profile);
  };

  const toggleFeatured = async (id, currentFeatured) => {
    const { error } = await supabase.rpc('set_featured_blog_post', { p_post_id: id, p_featured: !currentFeatured });
    if (error) alert(error.message);
    loadData(profile);
  };

  const addCategory = async () => {
    if (!catName.trim()) return;
    const slug = catName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    await supabase.from('blog_categories').insert({ name: catName, slug });
    setCatName("");
    loadData(profile);
  };

  const deleteCategory = async (id) => {
    const { count } = await supabase.from('blog_posts').select('*', { count: 'exact', head: true }).eq('category_id', id);
    if (count > 0) return alert("Cannot delete category used by existing posts.");
    await supabase.from('blog_categories').delete().eq('id', id);
    loadData(profile);
  };

  const editCategory = async (id, oldName) => {
    const newName = prompt("Enter new category name:", oldName);
    if (!newName || !newName.trim()) return;
    const slug = newName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    await supabase.from('blog_categories').update({ name: newName, slug }).eq('id', id);
    loadData(profile);
  };

  const softDelete = async (id) => {
    await supabase.from('blog_posts').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    loadData(profile);
  };

  const resolveReport = async (id) => {
    await supabase.from('blog_reports').update({ resolved: true }).eq('id', id);
    loadData(profile);
  };

  if (loading || !profile) return <div className="blog-manager-page"><p>Loading...</p></div>;

  const tabs = ['Pending', 'Revisions', 'Published', 'Drafts', 'Rejected', 'Trash', 'Categories', 'Reports'];

  const renderTable = () => {
    if (activeTab === 'Pending') {
      const pending = posts.filter(p => p.status === 'PENDING_REVIEW' && !p.deleted_at);
      return (
        <table className="blog-table">
          <thead><tr><th>Title</th><th>Author</th><th>Date</th><th>Actions</th></tr></thead>
          <tbody>
            {pending.map(p => (
              <tr key={p.id}>
                <td>{p.title}</td><td>{p.profiles?.username}</td><td>{new Date(p.created_at).toLocaleDateString()}</td>
                <td style={{ display: 'flex', gap: 8 }}>
                  <a href={`/blog/manage/review/${p.id}`} className="blog-btn" style={{ padding: '4px 8px', fontSize: 12 }}>Review</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    if (activeTab === 'Revisions') {
      return (
        <table className="blog-table">
          <thead><tr><th>Post Title</th><th>Author</th><th>Date Submitted</th><th>Actions</th></tr></thead>
          <tbody>
            {revisions.map(p => (
              <tr key={p.id}>
                <td>{p.blog_posts?.title} (Revision)</td><td>{p.profiles?.username}</td><td>{new Date(p.updated_at).toLocaleDateString()}</td>
                <td style={{ display: 'flex', gap: 8 }}>
                  <a href={`/blog/manage/review/${p.id}`} className="blog-btn" style={{ padding: '4px 8px', fontSize: 12 }}>Review</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    if (activeTab === 'Published') {
      const pub = posts.filter(p => p.status === 'PUBLISHED' && !p.deleted_at);
      return (
        <table className="blog-table">
          <thead><tr><th>Title</th><th>Featured</th><th>Actions</th></tr></thead>
          <tbody>
            {pub.map(p => (
              <tr key={p.id}>
                <td>{p.title}</td>
                <td>
                  <button className="blog-btn blog-btn-outline" style={{ padding: '4px 8px', fontSize: 12, borderColor: p.is_featured ? 'var(--orange)' : '' }} onClick={() => toggleFeatured(p.id, p.is_featured)}>
                    {p.is_featured ? '★ Featured' : '☆ Feature'}
                  </button>
                </td>
                <td style={{ display: 'flex', gap: 8 }}>
                  <a href={`/blog/${p.slug}`} className="blog-btn" style={{ padding: '4px 8px', fontSize: 12 }} target="_blank">View</a>
                  <a href={`/blog/write?id=${p.id}`} className="blog-btn" style={{ padding: '4px 8px', fontSize: 12 }}>Edit</a>
                  <button className="blog-btn" style={{ padding: '4px 8px', fontSize: 12, background: 'var(--red)' }} onClick={() => softDelete(p.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    if (activeTab === 'Drafts' || activeTab === 'Rejected' || activeTab === 'Trash') {
      let filtered = [];
      if (activeTab === 'Drafts') filtered = posts.filter(p => (p.status === 'DRAFT' || p.status === 'NEEDS_CHANGES') && !p.deleted_at);
      if (activeTab === 'Rejected') filtered = posts.filter(p => p.status === 'REJECTED' && !p.deleted_at);
      if (activeTab === 'Trash') filtered = posts.filter(p => p.deleted_at);
      return (
        <table className="blog-table">
          <thead><tr><th>Title</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {filtered.map(p => (
              <tr key={p.id}>
                <td>{p.title}</td><td>{p.status}</td>
                <td style={{ display: 'flex', gap: 8 }}>
                  {activeTab !== 'Trash' && <a href={`/blog/write?id=${p.id}`} className="blog-btn" style={{ padding: '4px 8px', fontSize: 12 }}>Edit</a>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    if (activeTab === 'Categories') {
      return (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input className="blog-input" value={catName} onChange={e => setCatName(e.target.value)} placeholder="New Category Name" />
            <button className="blog-btn" onClick={addCategory}>Add</button>
          </div>
          <table className="blog-table">
            <thead><tr><th>Name</th><th>Slug</th><th>Actions</th></tr></thead>
            <tbody>
              {categories.map(c => (
                <tr key={c.id}>
                  <td>{c.name}</td><td>{c.slug}</td>
                  <td style={{ display: 'flex', gap: 8 }}>
                    <button className="blog-btn" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => editCategory(c.id, c.name)}>Edit</button>
                    <button className="blog-btn" style={{ padding: '4px 8px', fontSize: 12, background: 'var(--red)' }} onClick={() => deleteCategory(c.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    if (activeTab === 'Reports') {
      return (
        <table className="blog-table">
          <thead><tr><th>Post</th><th>Reporter</th><th>Reason</th><th>Description</th><th>Actions</th></tr></thead>
          <tbody>
            {reports.map(r => (
              <tr key={r.id}>
                <td>{r.blog_posts?.title}</td><td>{r.profiles?.username}</td><td>{r.reason}</td><td>{r.description || '-'}</td>
                <td><button className="blog-btn" style={{ padding: '4px 8px', fontSize: 12, background: 'var(--green)' }} onClick={() => resolveReport(r.id)}>Resolve</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
  };

  return (
    <div className="blog-manager-page">
      <nav className="pujo-nav" style={{ position: 'relative', background: 'transparent' }}><ul><li><a href="/">Home</a></li><li><a href="/pujo">Pujo</a></li><li><a href="/blog">Blog</a></li><li><a href="/about">About</a></li><li><a href="/login">Login</a></li></ul></nav>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 36, margin: '40px 0' }}>Moderation Dashboard</h2>
        <a href="/blog/write" className="blog-btn blog-btn-outline" style={{ display: 'block', textAlign: 'center' }}>+ New Post</a>
      </div>

      <div style={{ display: 'flex', gap: 16, borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: 24, overflowX: 'auto', paddingBottom: 8 }}>
        {tabs.map(t => (
          <button key={t} onClick={() => setActiveTab(t)} style={{ background: 'none', border: 'none', color: activeTab === t ? 'var(--gold)' : 'var(--muted)', cursor: 'pointer', padding: '8px 0', borderBottom: activeTab === t ? '2px solid var(--gold)' : '2px solid transparent' }}>
            {t}
          </button>
        ))}
      </div>

      {renderTable()}

      {rejectModal.open && (
        <div className="blog-modal-backdrop">
          <div className="blog-modal">
            <h3>{rejectModal.type === 'REJECTED' ? 'Reject Post' : 'Request Changes'}</h3>
            <textarea className="blog-textarea" rows={4} placeholder="Reason..." value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
            <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
              <button className="blog-btn" onClick={submitReject}>Submit</button>
              <button className="blog-btn blog-btn-outline" onClick={() => setRejectModal({ open: false, id: null, type: '', isRevision: false })}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
