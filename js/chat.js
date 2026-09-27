/* v1.9 聊天模块：私聊 + 群聊 */
(function () {
  const API = SUPABASE_URL, ANON = SUPABASE_ANON_KEY;
  function token() { return getToken(); }
  function meId() { const p = parseToken(); return p ? p.sub : null; }
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

  let chatReady = false, chatConv = null, pollTimer = null;

  function renderBubble(m) {
    return `<div class="chat-bubble ${m.sender_id === meId() ? 'me' : ''}"><div class="cb-name">${escapeHTML(m.sender_name || '')}</div>${escapeHTML(m.content)}</div>`;
  }
  function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }
  function startPolling() { stopPolling(); pollTimer = setInterval(pollNew, 3000); }
  async function pollNew() {
    if (!chatConv) return;
    const box = document.getElementById('chatMsgs');
    if (!box) return;
    const r = chatConv.type === 'dm'
      ? await rpc('get_dm_history', { p_with: chatConv.peer })
      : await rpc('get_group_messages', { p_group: chatConv.gid });
    const list = (r.data && r.data.list) || [];
    const fresh = list.filter(m => m.created_at > chatConv.lastTs);
    if (!fresh.length) return;
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
    box.insertAdjacentHTML('beforeend', fresh.map(renderBubble).join(''));
    chatConv.lastTs = fresh[fresh.length - 1].created_at;
    if (atBottom) box.scrollTop = box.scrollHeight;
    if (chatConv.type === 'dm') { rpc('mark_dm_read', { p_with: chatConv.peer }); loadConversations('dm', true); }
  }

  function initChat() {
    const root = document.getElementById('chatRoot');
    if (!root) return;
    if (!chatReady) {
      chatReady = true;
      root.innerHTML = `
        <div class="chat-layout">
          <div class="chat-sidebar">
            <div class="chat-sidebar-head"><h3>💬 聊天</h3><button class="submit-btn small" id="chatNewBtn">＋</button></div>
            <div class="chat-subtabs">
              <div class="chat-subtab active" data-ctab="dm">私聊</div>
              <div class="chat-subtab" data-ctab="group">群聊</div>
            </div>
            <div class="chat-conv-list" id="chatConvList"></div>
          </div>
          <div class="chat-main" id="chatMain"><div class="chat-empty">选择一个会话开始聊天</div></div>
        </div>
        <div class="modal-overlay" id="chatNewModal">
          <div class="modal">
            <button class="modal-close" id="closeChatNew">&times;</button>
            <h3>新建</h3>
            <div class="chat-subtabs">
              <div class="chat-subtab active" data-ntab="dm">私聊</div>
              <div class="chat-subtab" data-ntab="group">群聊</div>
            </div>
            <div id="chatNewBody"></div>
          </div>
        </div>`;
      document.getElementById('chatNewBtn').onclick = openChatNew;
      document.getElementById('closeChatNew').onclick = () => document.getElementById('chatNewModal').classList.remove('active');
      root.querySelectorAll('.chat-subtab[data-ctab]').forEach(t => t.onclick = () => {
        root.querySelectorAll('.chat-subtab[data-ctab]').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        loadConversations(t.dataset.ctab);
      });
    }
    loadConversations('dm');
  }

  async function loadConversations(type, silent) {
    const list = document.getElementById('chatConvList');
    const uid = meId();
    if (!uid) { list.innerHTML = '<div class="chat-empty">请先登录</div>'; return; }
    if (!silent) list.innerHTML = '<div class="chat-empty">加载中...</div>';
    let data = [];
    if (type === 'dm') { const r = await rpc('list_dm_conversations', {}); data = (r.data && r.data.list) || []; }
    else { const r = await rpc('list_my_groups', {}); data = (r.data && r.data.list) || []; }
    if (!data.length) { list.innerHTML = `<div class="chat-empty">还没有${type === 'dm' ? '私聊' : '群组'}，点右上角 ＋ 开始</div>`; return; }
    if (type === 'dm') {
      list.innerHTML = data.map(c => `<div class="conv-item" data-peer="${c.peer}">
        <span class="ci-name">${escapeHTML(c.uname || '用户')}</span>
        ${c.unread ? `<span class="ci-unread">${c.unread}</span>` : ''}
        <div class="ci-last">${escapeHTML((c.last_content || '').slice(0, 20))}</div>
      </div>`).join('');
      list.querySelectorAll('.conv-item').forEach(el => el.onclick = () => openDM(el.dataset.peer, el.querySelector('.ci-name').textContent));
    } else {
      list.innerHTML = data.map(g => `<div class="conv-item" data-gid="${g.id}">
        <span class="ci-name">${escapeHTML(g.name || '群')}</span>
        <div class="ci-last">${escapeHTML((g.last_content || '').slice(0, 20))}</div>
      </div>`).join('');
      list.querySelectorAll('.conv-item').forEach(el => el.onclick = () => openGroup(el.dataset.gid, el.querySelector('.ci-name').textContent));
    }
  }

  async function openDM(peer, name) {
    chatConv = { type: 'dm', peer, name, lastTs: '' };
    const main = document.getElementById('chatMain');
    main.innerHTML = `<div class="chat-msgs" id="chatMsgs"></div>
      <div class="chat-input-bar"><input id="chatInput" placeholder="发消息给 ${escapeHTML(name)}..."/><button class="submit-btn small" id="chatSend">发送</button></div>`;
    document.getElementById('chatSend').onclick = sendCurrent;
    document.getElementById('chatInput').onkeydown = e => { if (e.key === 'Enter') sendCurrent(); };
    const r = await rpc('get_dm_history', { p_with: peer });
    const list = (r.data && r.data.list) || [];
    const box = document.getElementById('chatMsgs');
    box.innerHTML = list.map(renderBubble).join('');
    box.scrollTop = box.scrollHeight;
    chatConv.lastTs = list.length ? list[list.length - 1].created_at : '';
    rpc('mark_dm_read', { p_with: peer });
    startPolling();
  }

  async function openGroup(gid, name) {
    chatConv = { type: 'group', gid, name, lastTs: '' };
    const main = document.getElementById('chatMain');
    main.innerHTML = `<div class="chat-msgs" id="chatMsgs"></div>
      <div class="chat-input-bar"><input id="chatInput" placeholder="在 ${escapeHTML(name)} 发消息..."/><button class="submit-btn small" id="chatSend">发送</button></div>`;
    document.getElementById('chatSend').onclick = sendCurrent;
    document.getElementById('chatInput').onkeydown = e => { if (e.key === 'Enter') sendCurrent(); };
    const list = await renderGroupMsgs(gid);
    chatConv.lastTs = list.length ? list[list.length - 1].created_at : '';
    startPolling();
  }
  async function renderGroupMsgs(gid) {
    const r = await rpc('get_group_messages', { p_group: gid });
    const list = (r.data && r.data.list) || [];
    const box = document.getElementById('chatMsgs');
    if (!box) return list;
    box.innerHTML = list.map(renderBubble).join('');
    box.scrollTop = box.scrollHeight;
    return list;
  }

  async function sendCurrent() {
    const uid = meId(); if (!uid) { showToast('请先登录', true); openAuthModal('login'); return; }
    const inp = document.getElementById('chatInput'); if (!inp) return;
    const text = inp.value.trim(); if (!text) return;
    let r;
    if (chatConv.type === 'dm') r = await rpc('send_dm', { p_to: chatConv.peer, p_content: text });
    else r = await rpc('send_group_msg', { p_group: chatConv.gid, p_content: text });
    if (r.data && r.data.ok) { inp.value = ''; if (chatConv.type === 'dm') openDM(chatConv.peer, chatConv.name); else renderGroupMsgs(chatConv.gid); }
    else showToast((r.data && r.data.msg) || '发送失败', true);
  }

  function openChatNew() {
    document.getElementById('chatNewModal').classList.add('active');
    const tab = document.querySelector('.chat-subtab[data-ntab].active');
    renderChatNew(document.getElementById('chatNewBody'), tab ? tab.dataset.ntab : 'dm');
    document.querySelectorAll('.chat-subtab[data-ntab]').forEach(t => t.onclick = () => {
      document.querySelectorAll('.chat-subtab[data-ntab]').forEach(x => x.classList.remove('active'));
      t.classList.add('active'); renderChatNew(document.getElementById('chatNewBody'), t.dataset.ntab);
    });
  }
  function renderChatNew(body, tab) {
    if (tab === 'dm') {
      body.innerHTML = `<div class="form-group"><label>对方用户名</label><input id="cnPeer" placeholder="输入用户名"/></div>
        <div class="form-group"><label>消息</label><input id="cnMsg" placeholder="第一句问候"/></div>
        <button class="submit-btn" id="cnSend">发送</button><div class="form-message" id="cnMsg2"></div>`;
      document.getElementById('cnSend').onclick = async () => {
        const name = document.getElementById('cnPeer').value.trim();
        const text = document.getElementById('cnMsg').value.trim();
        if (!name || !text) return;
        const u = await rest('users', `select=id,username&username=eq.${encodeURIComponent(name)}`);
        const arr = Array.isArray(u.data) ? u.data : [];
        if (!arr.length) { document.getElementById('cnMsg2').textContent = '找不到该用户'; return; }
        const r = await rpc('send_dm', { p_to: arr[0].id, p_content: text });
        if (r.data && r.data.ok) { showToast('已发送'); document.getElementById('chatNewModal').classList.remove('active'); loadConversations('dm'); openDM(arr[0].id, arr[0].username); }
        else document.getElementById('cnMsg2').textContent = (r.data && r.data.msg) || '发送失败';
      };
    } else {
      body.innerHTML = `<div class="form-group"><label>群名</label><input id="cnGName" placeholder="群名称"/></div>
        <div class="form-group"><label>邀请成员（用户名，逗号分隔）</label><input id="cnMembers" placeholder="user1,user2"/></div>
        <button class="submit-btn" id="cnCreate">创建</button><div class="form-message" id="cnMsg2"></div>`;
      document.getElementById('cnCreate').onclick = async () => {
        const gname = document.getElementById('cnGName').value.trim();
        const names = document.getElementById('cnMembers').value.split(',').map(s => s.trim()).filter(Boolean);
        if (!gname) return;
        let members = [];
        if (names.length) { const u = await rest('users', `select=id,username&username=in.(${encodeURIComponent(names.join(','))})`); members = Array.isArray(u.data) ? u.data.map(x => x.id) : []; }
        const r = await rpc('create_group', { p_name: gname, p_members: members });
        if (r.data && r.data.ok) { showToast('群已创建'); document.getElementById('chatNewModal').classList.remove('active'); loadConversations('group'); openGroup(r.data.group_id, gname); }
        else document.getElementById('cnMsg2').textContent = (r.data && r.data.msg) || '创建失败';
      };
    }
  }

  const _sw = window.switchView;
  window.switchView = function (name) { if (typeof _sw === 'function') _sw(name); if (name === 'chat') initChat(); else stopPolling(); };
})();
