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

  // 在公开个人主页显示他人时注入"赠送活跃值"按钮 + 赠送记录入口
  const _op = window.openProfile;
  window.openProfile = async function (username) {
    if (typeof _op === 'function') await _op(username);
    const body = document.getElementById('profileBody');
    const modal = document.getElementById('profileModal');
    if (!body || !modal || !modal.classList.contains('active')) return;
    if (!body.querySelector('#giftRecBtn')) {
      const rec = document.createElement('button');
      rec.id = 'giftRecBtn';
      rec.className = 'submit-btn small ghost';
      rec.textContent = '📜 赠送记录';
      rec.style.marginTop = '1rem';
      rec.style.marginRight = '.5rem';
      rec.onclick = () => giftRecords(username);
      body.appendChild(rec);
    }
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

  // 赠送记录：展示该用户送出 / 收到的活跃值流水（公开可读，demo 级）
  async function giftRecords(username) {
    const u = await rest('users', `select=id,username&username=eq.${encodeURIComponent(username)}`);
    const arr = Array.isArray(u.data) ? u.data : [];
    if (!arr.length) { showToast('用户不存在', true); return; }
    const uidv = arr[0].id;
    const r = await rest('active_gifts', `select=amount,created_at,from_user(id,username),to_user(id,username)&or=(from_user.eq.${uidv},to_user.eq.${uidv})&order=created_at.desc&limit=80`);
    const rows = Array.isArray(r.data) ? r.data : [];
    const sent = rows.filter(x => x.from_user && x.from_user.id === uidv);
    const recv = rows.filter(x => x.to_user && x.to_user.id === uidv);
    const fmt = t => { try { return new Date(t).toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }); } catch (e) { return t; } };
    const item = x => {
      const out = !!(x.from_user && x.from_user.id === uidv);
      const other = out ? (x.to_user && x.to_user.username) : (x.from_user && x.from_user.username);
      return `<div class="gr-item"><span class="gr-dir">${out ? '送出→' : '收到←'}</span><span class="gr-who">${escapeHTML(other || '匿名')}</span><span class="gr-amt">${out ? '-' : '+'}${x.amount}</span><span class="gr-time">${fmt(x.created_at)}</span></div>`;
    };
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay active';
    overlay.id = 'giftRecModal';
    overlay.innerHTML = `<div class="modal">
      <button class="modal-close" id="giftRecClose">&times;</button>
      <h3>📜 ${escapeHTML(username)} 的赠送记录</h3>
      <div class="gr-col"><h4>送出（${sent.length}）</h4>${sent.length ? sent.map(item).join('') : '<div class="empty-hint">暂无</div>'}</div>
      <div class="gr-col"><h4>收到（${recv.length}）</h4>${recv.length ? recv.map(item).join('') : '<div class="empty-hint">暂无</div>'}</div>
    </div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    document.getElementById('giftRecClose').onclick = close;
    overlay.onclick = e => { if (e.target === overlay) close(); };
  }
})();
