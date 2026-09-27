/* v1.9 赠送活跃值：全局 giftUser + 个人主页注入赠送按钮 */
(function () {
  const API = SUPABASE_URL, ANON = SUPABASE_ANON_KEY;
  function token() { return getToken(); }
  function meId() { const p = parseToken(); return p ? p.sub : null; }
  function meName() { const p = parseToken(); return p ? p.username : null; }
  async function rpc(name, body) {
    const r = await fetch(`${API}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { 'apikey': ANON, 'Authorization': `Bearer ${token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    });
    return { status: r.status, data: await r.json().catch(() => ({ ok: false })) };
  }
  async function rest(path, q) {
    const r = await fetch(`${API}/rest/v1/${path}?${q}`, { headers: { 'apikey': ANON, 'Authorization': `Bearer ${token()}` } });
    return { status: r.status, data: await r.json().catch(() => null) };
  }

  window.giftUser = async function (targetId, targetName) {
    const uid = meId();
    if (!uid) { showToast('请先登录', true); openAuthModal('login'); return; }
    if (targetId === uid) { showToast('不能送给自己', true); return; }
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay active';
    overlay.id = 'giftModal';
    overlay.innerHTML = `<div class="modal">
      <button class="modal-close" id="giftClose">&times;</button>
      <h3>🎁 赠送活跃值</h3>
      <p>赠送给：<strong>${escapeHTML(targetName || '该用户')}</strong></p>
      <div class="gift-row"><input id="giftAmount" type="number" min="1" placeholder="数量"/><button class="submit-btn" id="giftConfirm">赠送</button></div>
      <div class="gift-balance" id="giftBal"></div>
      <div class="form-message" id="giftMsg"></div>
    </div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    document.getElementById('giftClose').onclick = close;
    overlay.onclick = e => { if (e.target === overlay) close(); };
    document.getElementById('giftConfirm').onclick = async () => {
      const amt = parseInt(document.getElementById('giftAmount').value, 10);
      const msg = document.getElementById('giftMsg');
      if (!amt || amt <= 0) { msg.textContent = '请输入大于 0 的数量'; msg.className = 'form-message error'; return; }
      const r = await rpc('gift_active', { p_to: targetId, p_amount: amt });
      if (r.data && r.data.ok) { showToast(`已赠送 ${amt} 活跃值`); close(); if (window.renderHall) window.renderHall(); }
      else { msg.textContent = (r.data && r.data.msg) || '赠送失败'; msg.className = 'form-message error'; }
    };
  };

  // 在公开个人主页显示他人时注入"赠送活跃值"按钮
  const _op = window.openProfile;
  window.openProfile = async function (username) {
    if (typeof _op === 'function') await _op(username);
    const body = document.getElementById('profileBody');
    const modal = document.getElementById('profileModal');
    if (!body || !modal || !modal.classList.contains('active')) return;
    if (username === meName()) return;
    if (body.querySelector('#giftEntryBtn')) return;
    const btn = document.createElement('button');
    btn.id = 'giftEntryBtn';
    btn.className = 'submit-btn small';
    btn.textContent = '🎁 赠送活跃值';
    btn.style.marginTop = '1rem';
    btn.onclick = async () => {
      const u = await rest('users', `select=id,username&username=eq.${encodeURIComponent(username)}`);
      const arr = Array.isArray(u.data) ? u.data : [];
      if (arr.length) window.giftUser(arr[0].id, arr[0].username);
    };
    body.appendChild(btn);
  };
})();
