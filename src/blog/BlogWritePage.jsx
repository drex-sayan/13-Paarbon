import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../supabaseClient";
import { getCurrentProfile } from "../auth";
import DOMPurify from "dompurify";

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
      if (!p) window.location.href = "/login?redirect=/blog/write";
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
    
    const isEditor = profile.role === 'admin' || profile.role === 'editor';
    const safeContent = DOMPurify.sanitize(form.content || "<p></p>", {
      ALLOWED_TAGS: ['p', 'h2', 'h3', 'strong', 'em', 'blockquote', 'ul', 'ol', 'li', 'a', 'figure', 'img', 'figcaption', 'hr', 'br', 'span', 'div'],
      ALLOWED_ATTR: ['href', 'src', 'alt', 'class', 'style', 'target', 'rel']
    });

    let currentStatus = status;
    if (status === 'REJECTED' || status === 'NEEDS_CHANGES') currentStatus = 'DRAFT'; 
    
    if (status === 'PUBLISHED' && !isEditor) {
      // Normal user editing a published post -> save to revisions table as DRAFT (autosave)
      const { data, error } = await supabase.from('blog_post_revisions').upsert({
          post_id: id,
          author_id: profile.id,
          title: form.title,
          excerpt: form.excerpt,
          content: safeContent,
          cover_photo: form.cover_photo,
          status: 'DRAFT',
          copyright_confirmed: copyrightConfirmed,
          copyright_confirmed_at: copyrightConfirmed ? new Date().toISOString() : null
      }, { onConflict: 'post_id' }).select().single();
      
      if (error) console.error("Revision error", error);
      setSaving(false);
      return id;
    }

    if (!id) {
      const baseSlug = form.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
      const { data: slugData } = await supabase.rpc('generate_unique_blog_slug', { base_slug: baseSlug });
      const finalSlug = slugData || baseSlug;

      const { data, error } = await supabase.from('blog_posts').insert({
        ...form, 
        content: safeContent, 
        slug: finalSlug, 
        author_id: profile.id, 
        status: 'DRAFT',
        copyright_confirmed: copyrightConfirmed,
        copyright_confirmed_at: copyrightConfirmed ? new Date().toISOString() : null
      }).select().single();
      
      if (error) console.error("Save Draft Error:", error);
      if (data) { setPostId(data.id); id = data.id; setStatus(data.status); }
    } else {
      await supabase.from('blog_posts').update({ 
        ...form, 
        content: safeContent, 
        status: currentStatus,
        copyright_confirmed: copyrightConfirmed,
        copyright_confirmed_at: copyrightConfirmed ? new Date().toISOString() : null
      }).eq('id', id);
    }
    
    if (id) {
      await supabase.from('blog_related_pujos').delete().eq('post_id', id);
      if (selectedPujos.length > 0) {
        const pujoInserts = selectedPujos.map(pid => ({ post_id: id, pujo_id: pid }));
        await supabase.from('blog_related_pujos').insert(pujoInserts);
      }
    }
    setSaving(false);
    return id;
  };

  const submitReview = async () => {
    if (!copyrightConfirmed) return alert("You must confirm copyright ownership.");
    
    const currentContent = contentRef.current ? contentRef.current.innerHTML : form.content;
    
    if (!form.title) return alert("Please add a Title before submitting.");
    if (!currentContent || currentContent === "<br>") return alert("Please add some Content before submitting.");
    if (!form.cover_photo) return alert("Please upload a Cover Photo before submitting.");
    
    setForm({...form, content: currentContent});
    
    const finalId = await saveDraft() || postId;
    if (!finalId) return alert("Error saving draft. Please try again.");
    
    const isEditor = profile.role === 'admin' || profile.role === 'editor';
    
    if (isEditor) {
       await supabase.rpc('publish_blog_post', { p_post_id: finalId });
       alert("Published successfully!");
       window.location.href = "/blog/manage";
    } else {
       const isRevision = status === 'PUBLISHED';
       let targetId = finalId;
       
       if (isRevision) {
         // Get the actual revision id
         const { data: rev } = await supabase.from('blog_post_revisions').select('id').eq('post_id', finalId).single();
         if (rev) targetId = rev.id;
       }
       
       const { error } = await supabase.rpc('submit_blog_post_for_review', { p_id: targetId, p_is_revision: isRevision });
       if (error) {
         alert("Error submitting for review: " + error.message);
         return;
       }
       alert(isRevision ? "Revision submitted for review! The original article remains published until approved." : "Submitted for review!");
       window.location.href = "/blog/my";
    }
  };

  const checkImageCount = () => {
    const html = contentRef.current ? contentRef.current.innerHTML : form.content;
    const div = document.createElement('div');
    div.innerHTML = html;
    const inlineCount = div.getElementsByTagName('img').length;
    const coverCount = form.cover_photo ? 1 : 0;
    return inlineCount + coverCount;
  };

  const uploadImage = async (e, type) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Frontend File Validation
    if (file.size > 10 * 1024 * 1024) return alert("Max size 10MB");
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) return alert("Only JPEG, PNG, or WEBP images are allowed.");

    if (checkImageCount() >= 5) {
      alert("Maximum 5 images allowed per article (including cover).");
      return;
    }

    // Force creating a draft if we don't have a post ID yet
    let currentPostId = postId;
    if (!currentPostId) {
      if (!form.title) {
         alert("Please enter a Title first before uploading images. We need to create a draft to store them securely.");
         return;
      }
      currentPostId = await saveDraft();
      if (!currentPostId) {
         alert("Could not create draft. Image upload failed.");
         return;
      }
    }
    
    const ext = file.name.split('.').pop();
    const path = `${profile.id}/${currentPostId}/${crypto.randomUUID()}.${ext}`;
    
    setSaving(true);
    const { error } = await supabase.storage.from('blog-images').upload(path, file);
    if (!error) {
      const { data } = supabase.storage.from('blog-images').getPublicUrl(path);
      
      // Keep track in blog_images table
      await supabase.from('blog_images').insert({
          post_id: currentPostId,
          storage_path: path,
          caption: type === 'cover' ? 'Cover' : ''
      });
      
      if (type === 'cover') {
        if (form.cover_photo) {
          // Attempt to clean up old cover image
          const oldUrl = form.cover_photo;
          const oldPathMatch = oldUrl.match(/blog-images\/(.+)$/);
          if (oldPathMatch && oldPathMatch[1]) {
             const oldPath = oldPathMatch[1];
             await supabase.storage.from('blog-images').remove([oldPath]);
             await supabase.from('blog_images').delete().eq('storage_path', oldPath);
          }
        }
        setForm({ ...form, cover_photo: data.publicUrl });
      } else {
        const imgHtml = `<figure class="article-inline-image"><img src="${data.publicUrl}" /><figcaption class="article-image-caption">Caption</figcaption></figure><p><br></p>`;
        execCommand('insertHTML', imgHtml);
      }
    } else {
      alert("Upload failed: " + error.message);
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
      <nav className="pujo-nav"><ul><li><a href="/">Home</a></li><li><a href="/pujo">Pujo</a></li><li><a href="/blog">Blog</a></li><li><a href="/about">About</a></li><li><a href="/login">Login</a></li></ul></nav>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 36, margin: '40px 0' }}>Write a Story</h2>
        <a href={profile.role === 'admin' || profile.role === 'editor' ? "/blog/manage" : "/blog/my"} className="blog-btn blog-btn-outline" style={{ display: 'block', textAlign: 'center' }}>My Posts</a>
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
          <button className="blog-btn" onClick={submitReview}>Submit</button>
        </div>
      </div>
    </div>
  );
}
