import React, { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { getCurrentProfile } from "../auth";

export function MyBlogPage() {
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [revisions, setRevisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('My Posts');

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
    const { data: pData } = await supabase.from('blog_posts')
      .select('*, blog_categories(name)')
      .eq('author_id', p.id)
      .order('created_at', { ascending: false });
    if (pData) setPosts(pData);

    const { data: revData } = await supabase.from('blog_post_revisions')
      .select('*, blog_posts(title)')
      .eq('author_id', p.id)
      .order('updated_at', { ascending: false });
    if (revData) setRevisions(revData);

    setLoading(false);
  };

  const softDelete = async (id) => {
    // Note: Normal users cannot actually set deleted_at because of the strict RLS/Triggers we just added!
    // But they CAN set status to DRAFT or REJECTED.
    // Let's implement an RPC or update to 'Trash' status in a future iteration, or just hide it.
    // For now, let's keep it simple: normal users cannot delete their own published posts, they can only unpublish if we allow.
    // But wait, the prompt doesn't strictly say normal users can delete. Let's just remove delete for normal users.
    alert("Please contact an Editor to delete published posts.");
  };

  if (loading || !profile) return <div className="blog-manager-page"><p>Loading...</p></div>;

  const tabs = ['My Posts', 'Drafts & Revisions', 'Rejected'];

  const renderTable = () => {
    if (activeTab === 'My Posts') {
      const filtered = posts.filter(p => (p.status === 'PUBLISHED' || p.status === 'PENDING_REVIEW') && !p.deleted_at);
      return (
        <table className="blog-table">
          <thead><tr><th>Title</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead>
          <tbody>
            {filtered.map(p => (
              <tr key={p.id}>
                <td>{p.title}</td><td>{p.status}</td><td>{new Date(p.created_at).toLocaleDateString()}</td>
                <td style={{ display: 'flex', gap: 8 }}>
                  {p.status === 'PUBLISHED' && <a href={`/blog/${p.slug}`} className="blog-btn" style={{ padding: '4px 8px', fontSize: 12 }} target="_blank">View</a>}
                  <a href={`/blog/write?id=${p.id}`} className="blog-btn" style={{ padding: '4px 8px', fontSize: 12 }}>Edit</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    if (activeTab === 'Drafts & Revisions') {
      const drafts = posts.filter(p => (p.status === 'DRAFT' || p.status === 'NEEDS_CHANGES') && !p.deleted_at);
      return (
        <div>
            <h4>Drafts</h4>
            <table className="blog-table" style={{ marginBottom: 32 }}>
            <thead><tr><th>Title</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
                {drafts.map(p => (
                <tr key={p.id}>
                    <td>{p.title}</td><td>{p.status}</td>
                    <td style={{ display: 'flex', gap: 8 }}>
                    <a href={`/blog/write?id=${p.id}`} className="blog-btn" style={{ padding: '4px 8px', fontSize: 12 }}>Edit</a>
                    </td>
                </tr>
                ))}
            </tbody>
            </table>
            
            <h4>Revisions (Under Review)</h4>
            <table className="blog-table">
            <thead><tr><th>Target Post</th><th>Status</th><th>Reason</th></tr></thead>
            <tbody>
                {revisions.map(p => (
                <tr key={p.id}>
                    <td>{p.blog_posts?.title}</td><td>{p.status}</td><td>{p.rejection_reason || '-'}</td>
                </tr>
                ))}
            </tbody>
            </table>
        </div>
      );
    }
    if (activeTab === 'Rejected') {
      const rejected = posts.filter(p => p.status === 'REJECTED' && !p.deleted_at);
      return (
        <table className="blog-table">
          <thead><tr><th>Title</th><th>Reason</th><th>Actions</th></tr></thead>
          <tbody>
            {rejected.map(p => (
              <tr key={p.id}>
                <td>{p.title}</td><td>{p.rejection_reason}</td>
                <td style={{ display: 'flex', gap: 8 }}>
                  <a href={`/blog/write?id=${p.id}`} className="blog-btn" style={{ padding: '4px 8px', fontSize: 12 }}>Edit</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
  };

  return (
    <div className="blog-manager-page">
      <nav className="pujo-nav"><ul><li><a href="/">Home</a></li><li><a href="/pujo">Pujo</a></li><li><a href="/blog">Blog</a></li><li><a href="/about">About</a></li><li><a href="/login">Login</a></li></ul></nav>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 36, margin: '40px 0' }}>My Posts</h2>
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
    </div>
  );
}
