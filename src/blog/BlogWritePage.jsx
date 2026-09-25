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

    const params = new URLSearchParams(window.location.search);
    const editId = params.get('id');
    if (editId) {
      loadEdit(editId);
    }
  }, []);

  const loadEdit = async (id) => {
    const { data } = await supabase.from('blog_posts').select('*').eq('id', id).single();
    if (data) {
      setForm({ title: data.title, excerpt: data.excerpt, content: data.content, category_id: data.category_id, cover_photo: data.cover_photo });
      setPostId(data.id);
      setStatus(data.status);
      setRejectionReason(data.rejection_reason);
      
      const { data: rp } = await supabase.from('blog_related_pujos').select('pujo_id').eq('post_id', data.id);
      if (rp) setSelectedPujos(rp.map(r => r.pujo_id));
      
      if (contentRef.current) contentRef.current.innerHTML = data.content;
    }
  };

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
    if (status === 'REJECTED' || status === 'NEEDS_CHANGES') currentStatus = 'DRAFT'; 
    
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
    
    // Fallback to ref in case state is lagging
    const currentContent = contentRef.current ? contentRef.current.innerHTML : form.content;
    
    if (!form.title) return alert("Please add a Title before submitting.");
    if (!currentContent || currentContent === "<br>") return alert("Please add some Content before submitting.");
    if (!form.cover_photo) return alert("Please upload a Cover Photo before submitting.");
    
    // Ensure form state has latest content before saving
    setForm({...form, content: currentContent});
    
    await saveDraft();
    if (!postId) return;
    
    await supabase.from('blog_posts').update({ status: 'PENDING_REVIEW', content: currentContent }).eq('id', postId);
    alert("Submitted for review!");
    window.location.href = "/blog";
  };

  const uploadImage = async (e, type) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return alert("Max size 10MB");
    
    const ext = file.name.split('.').pop();
    const path = `${crypto.randomUUID()}.${ext}`;
    
    setSaving(true);
    const { error } = await supabase.storage.from('blog-image').upload(path, file);
    if (!error) {
      const { data } = supabase.storage.from('blog-image').getPublicUrl(path);
      if (type === 'cover') {
        setForm({ ...form, cover_photo: data.publicUrl });
      } else {
        const imgHtml = `<figure class="article-inline-image"><img src="${data.publicUrl}" /><figcaption class="article-image-caption">Caption</figcaption></figure><p><br></p>`;
        execCommand('insertHTML', imgHtml);
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
        <div className="blog-toolbar" style={{ display: 'flex', gap: 8, marginBottom: 8, overflowX: 'auto', paddingBottom: 8 }}>
          <button type="button" onClick={() => execCommand('formatBlock', 'H2')}>H2</button>
          <button type="button" onClick={() => execCommand('formatBlock', 'H3')}>H3</button>
          <button type="button" onClick={() => execCommand('bold')}>B</button>
          <button type="button" onClick={() => execCommand('italic')}>I</button>
          <button type="button" onClick={() => execCommand('formatBlock', 'BLOCKQUOTE')}>Quote</button>
          <button type="button" onClick={() => execCommand('insertUnorderedList')}>List</button>
          <button type="button" onClick={() => execCommand('justifyLeft')}>Align L</button>
          <button type="button" onClick={() => execCommand('justifyCenter')}>Align C</button>
          <input type="file" id="inlineUpload" style={{ display: 'none' }} accept="image/jpeg,image/png,image/webp" onChange={e => uploadImage(e, 'inline')} />
          <button type="button" onClick={() => document.getElementById('inlineUpload').click()}>Insert Image</button>
        </div>
        <div 
          ref={contentRef}
          className="blog-textarea blog-editor-content" 
          contentEditable 
          style={{ minHeight: 300, background: 'rgba(255,255,255,0.05)' }}
          onBlur={e => setForm({...form, content: e.currentTarget.innerHTML})}
          onInput={e => setForm({...form, content: e.currentTarget.innerHTML})}
        />
      </div>

      <div className="blog-form-group">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, textTransform: 'none', color: 'var(--cream)' }}>
          <input type="checkbox" checked={copyrightConfirmed} onChange={e => setCopyrightConfirmed(e.target.checked)} />
          I confirm that I have the right to publish this content and these photographs.
        </label>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 40 }}>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>{saving ? "Saving..." : postId ? `Draft saved (${status})` : ""}</span>
        <div style={{ display: 'flex', gap: 16 }}>
          <button className="blog-btn blog-btn-outline" onClick={() => window.location.href="/blog"}>Cancel</button>
          <button className="blog-btn" onClick={submitReview}>Submit for Review</button>
        </div>
      </div>
    </div>
  );
}

