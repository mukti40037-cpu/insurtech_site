const COMMENT_CATEGORY_COLORS = {
  'Bug Report': '#e96e6e', 'Feature Idea': '#3fbb7d', 'Data Issue': '#f5af3f', 'General': '#8b5cf6',
};

async function loadComments() {
  const res = await fetch('/api/comments');
  return res.json();
}
async function postComment(payload) {
  const res = await editFetch('/api/comments', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  return res.json();
}
async function deleteComment(id) {
  const res = await editFetch(`/api/comments/${id}`, { method: 'DELETE' });
  return res.json();
}

function timeAgo(iso) {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

async function renderComments() {
  const comments = await loadComments();
  document.getElementById('commentsCount').textContent = comments.length;
  const list = document.getElementById('commentsList');
  list.innerHTML = comments.length ? comments.map(c => `
    <div class="comment-card">
      <div class="comment-header">
        <span class="comment-category" style="background:${COMMENT_CATEGORY_COLORS[c.category] || '#8b5cf6'}">${escapeHtml(c.category)}</span>
        <strong>${escapeHtml(c.author)}</strong>
        <span class="subtle">${timeAgo(c.created_at)}${c.page ? ' · on ' + escapeHtml(c.page) : ''}</span>
        <span class="comment-delete" data-id="${c.id}" title="Remove">✕</span>
      </div>
      <p>${escapeHtml(c.text)}</p>
    </div>
  `).join('') : '<div class="empty-state">No comments yet — be the first to suggest an improvement!</div>';

  list.querySelectorAll('.comment-delete').forEach(el => {
    el.onclick = async () => { await deleteComment(el.dataset.id); renderComments(); };
  });
}

function initCommentsPage() {
  renderComments();
  document.getElementById('commentForm').onsubmit = async (e) => {
    e.preventDefault();
    const author = document.getElementById('commentAuthor').value.trim();
    const category = document.getElementById('commentCategory').value;
    const text = document.getElementById('commentText').value.trim();
    if (!text) return;
    await postComment({ author, category, text, page: location.hash.replace('#', '') || 'general' });
    document.getElementById('commentText').value = '';
    renderComments();
  };
}
