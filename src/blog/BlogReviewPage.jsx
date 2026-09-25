import React, { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { getCurrentProfile, ROLES } from "../auth";
import DOMPurify from "dompurify";

export function BlogReviewPage({ id }) {
  const [profile, setProfile] = useState(null);
  const [revision, setRevision] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rejectModal, setRejectModal] = useState({ open: false, type: '' });
  const [rejectReason, setRejectReason] = useState("");

  useEffect(() => {
    getCurrentProfile().then(p => {
      if (!p || (p.role !== ROLES.EDITOR && p.role !== ROLES.ADMIN)) {
        window.location.href = "/blog";
      } else {
        setProfile(p);
        loadRevision();
      }
    });
  }, [id]);

  const loadRevision = async () => {
    const { data, error } = await supabase.from('blog_post_revisions')
        .select('*, blog_posts(title, category_id, blog_categories(name)), profiles(username)')
        .eq('id', id).single();
        
    if (error) {
        // Fallback to checking if it's a direct draft/pending post rather than a revision
        const { data: postData } = await supabase.from('blog_posts')
            .select('*, blog_categories(name), profiles!blog_posts_author_id_fkey(username)')
            .eq('id', id).single();
            
        if (postData) {
            setRevision({ ...postData, isMainPost: true, profiles: postData.profiles });
        }
    } else if (data) {
        setRevision(data);
    }
    setLoading(false);
  };

  const handleApprove = async () => {
      if (revision.isMainPost) {
          const { error } = await supabase.rpc('publish_blog_post', { p_post_id: id });
          if (error) alert(error.message);
          else window.location.href = "/blog/manage";
      } else {
          const { error } = await supabase.rpc('approve_blog_post_revision', { p_revision_id: id });
          if (error) alert("Error approving: " + error.message);
          else window.location.href = "/blog/manage";
      }
  };

  const submitReject = async () => {
      const rpcName = revision.isMainPost 
        ? (rejectModal.type === 'REJECTED' ? 'reject_blog_post' : 'request_blog_changes')
        : (rejectModal.type === 'REJECTED' ? 'reject_blog_post_revision' : 'request_blog_post_revision_changes');
        
      const paramName = revision.isMainPost ? 'p_post_id' : 'p_revision_id';
      
      const { error } = await supabase.rpc(rpcName, { [paramName]: id, p_reason: rejectReason });
      if (error) alert("Error updating status: " + error.message);
      else window.location.href = "/blog/manage";
  };

  if (loading) return <div className="blog-page"><p style={{padding:100}}>Loading revision...</p></div>;
  if (!revision) return <div className="blog-page"><p style={{padding:100}}>Revision not found.</p></div>;

  const safeContent = DOMPurify.sanitize(revision.content || 'No content provided.', {
    ALLOWED_TAGS: ['p', 'h2', 'h3', 'strong', 'em', 'blockquote', 'ul', 'ol', 'li', 'a', 'figure', 'img', 'figcaption', 'hr', 'br', 'span', 'div'],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'class', 'style', 'target', 'rel']
  });

  return (
    <div className="article-page" style={{ paddingBottom: 100 }}>
        <nav className="pujo-nav">
          <ul style={{ justifyContent: 'center' }}>
            <li><a href="/blog/manage">← Back to Manager</a></li>
          </ul>
        </nav>
        
        <div style={{ maxWidth: 800, margin: '100px auto 40px auto', padding: '0 20px' }}>
            <h1 style={{ fontFamily: 'var(--serif)', fontSize: 32, marginBottom: 16 }}>Reviewing: {revision.title}</h1>
            <div style={{ display: 'flex', gap: 16, marginBottom: 32, flexWrap: 'wrap' }}>
                <span className="blog-btn" style={{ background: 'var(--gray)', padding: '4px 12px' }}>Status: {revision.status}</span>
                <span className="blog-btn" style={{ background: 'var(--gray)', padding: '4px 12px' }}>Author: {revision.profiles?.username || 'Unknown'}</span>
                {revision.blog_categories && <span className="blog-btn" style={{ background: 'var(--gray)', padding: '4px 12px' }}>Category: {revision.blog_categories?.name}</span>}
                <span className="blog-btn" style={{ background: 'var(--gray)', padding: '4px 12px' }}>Copyright Confirmed: {revision.copyright_confirmed ? "Yes" : "No"}</span>
            </div>
            
            <div style={{ display: 'flex', gap: 16, marginBottom: 40, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 24 }}>
                <button className="blog-btn" style={{ background: 'var(--green)' }} onClick={handleApprove}>Approve & Publish</button>
                <button className="blog-btn" style={{ background: 'var(--orange)' }} onClick={() => setRejectModal({ open: true, type: 'NEEDS_CHANGES' })}>Request Changes</button>
                <button className="blog-btn" style={{ background: 'var(--red)' }} onClick={() => setRejectModal({ open: true, type: 'REJECTED' })}>Reject</button>
            </div>
            
            <div style={{ marginBottom: 40 }}>
                <h3 style={{ fontSize: 16, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Cover Photo</h3>
                {revision.cover_photo ? (
                    <img src={revision.cover_photo} alt="Cover" style={{ width: '100%', maxHeight: 400, objectFit: 'cover', borderRadius: 8 }} />
                ) : <p>No cover photo provided.</p>}
            </div>
            
            <div style={{ marginBottom: 40 }}>
                <h3 style={{ fontSize: 16, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>Excerpt</h3>
                <p style={{ fontSize: 18, fontStyle: 'italic', color: 'var(--gold)' }}>{revision.excerpt || 'No excerpt provided.'}</p>
            </div>
            
            <div style={{ marginBottom: 40 }}>
                <h3 style={{ fontSize: 16, color: 'var(--muted)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 1 }}>Content</h3>
                <div className="article-content" dangerouslySetInnerHTML={{ __html: safeContent }} />
            </div>
        </div>
        
        {rejectModal.open && (
        <div className="blog-modal-backdrop">
          <div className="blog-modal">
            <h3>{rejectModal.type === 'REJECTED' ? 'Reject Post' : 'Request Changes'}</h3>
            <textarea className="blog-textarea" rows={4} placeholder="Reason..." value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
            <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
              <button className="blog-btn" onClick={submitReject}>Submit</button>
              <button className="blog-btn blog-btn-outline" onClick={() => setRejectModal({ open: false, type: '' })}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
