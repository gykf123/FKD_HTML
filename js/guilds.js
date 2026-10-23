/* v1.9 工会模块：排名 / 我的工会 / 创建 / 申请(会长审核) / 退出 / 成员与赠送入口 */
(function () {
  const API = SUPABASE_URL;
  const ANON = SUPABASE_ANON_KEY;

  function token() { return getToken(); }
  function meId() { const p = parseToken(); return p ? p.sub : null; }

  async function rpc(name, body) {
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 12000);
      const r = await fetch(`${API}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: { 'apikey': ANON, 'Authorization': `Bearer ${token()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
        signal: ctrl.signal
      });
      clearTimeout(to);
      return { status: r.status, data: await r.json().catch(() => ({ ok: false })) };
    } catch (e) {
      showToast('网络异常，请稍后重试', true);
      return { status: 0, data: null };
    }
  }
  async function rest(path, query) {
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 12000);
      const r = await fetch(`${API}/rest/v1/${path}?${query}`, { headers: { 'apikey': ANON, 'Authorization': `Bearer ${token()}` }, signal: ctrl.signal });
      clearTimeout(to);
      return { status: r.status, data: await r.json().catch(() => null) };
    } catch (e) {
      showToast('网络异常，请稍后重试', true);
      return { status: 0, data: null };
    }
  }

  function initGuilds() {
    const root = document.getElementById('guildRoot');
    if (!root) return;
    if (root.dataset.ready === '1') { loadGuildRank(); return; }
    root.dataset.ready = '1';
    root.innerHTML = `
      <div class="guild-head"><h2><svg class="ui-ic" aria-hidden="true"><use href="#ic-flag"></use></svg> 工会</h2>
        <button class="submit-btn small" id="openCreateGuildBtn"><svg class="ui-ic" aria-hidden="true"><use href="#ic-plus"></use></svg> 创建工会</button>
      </div>
      <div class="guild-tabs">
        <button class="guild-tab active" data-gtab="rank"><svg class="ui-ic" aria-hidden="true"><use href="#ic-trophy"></use></svg> 工会排名</button>
        <button class="guild-tab" data-gtab="mine"><svg class="ui-ic" aria-hidden="true"><use href="#ic-users"></use></svg> 我的工会</button>
      </div>
      <div class="subpanel active" id="guildRankPanel"><div class="guild-list" id="guildRankList"><div class="empty-hint">加载中...</div></div></div>
      <div class="subpanel" id="guildMinePanel">
        <div class="guild-list" id="guildMineList"></div>
        <div class="guild-apply-box">
          <input id="guildApplyInput" placeholder="输入工会名搜索并申请加入" />
          <button class="submit-btn small" id="guildSearchBtn">搜索</button>
          <div class="guild-search-result" id="guildSearchResult"></div>
        </div>
      </div>
      <div class="modal-overlay" id="createGuildModal">
        <div class="modal">
          <button class="modal-close" id="closeCreateGuildModal">&times;</button>
          <h3><svg class="ui-ic" aria-hidden="true"><use href="#ic-plus"></use></svg> 创建工会</h3>
          <div class="form-group"><label>工会名称</label><input id="cgName" placeholder="最多 20 字" maxlength="20"/></div>
          <div class="form-group"><label>简称/标签（可选）</label><input id="cgTag" placeholder="如 FKD" maxlength="10"/></div>
          <div class="form-group"><label>简介（可选）</label><textarea id="cgDesc" rows="3" maxlength="200"></textarea></div>
          <div class="form-group gm-switch"><label for="cgRecruiting"><input type="checkbox" id="cgRecruiting"/> 开启招募（工会排名卡会显示招募公告）</label></div>
          <div class="form-group"><label>招募语（选填，最多 100 字）</label><input id="cgRecruitNote" placeholder="例如：萌新友好，每晚组队挖矿！" maxlength="100"/></div>
          <button class="submit-btn" id="cgSubmitBtn">创建</button>
          <div class="form-message" id="cgMessage"></div>
        </div>
      </div>
      <div class="modal-overlay" id="guildManageModal">
        <div class="modal">
          <button class="modal-close" id="closeGuildManage">&times;</button>
          <h3 id="gmTitle">工会管理</h3>
          <div class="form-message" id="gmManageMsg"></div>
          <div id="gmManageBody"></div>
        </div>
      </div>`;
    root.querySelectorAll('.guild-tab').forEach(t => {
      t.onclick = () => {
        root.querySelectorAll('.guild-tab').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        const tab = t.dataset.gtab;
        document.getElementById('guildRankPanel').classList.toggle('active', tab === 'rank');
        document.getElementById('guildMinePanel').classList.toggle('active', tab === 'mine');
        if (tab === 'rank') loadGuildRank(); else loadMyGuilds();
      };
    });
    document.getElementById('openCreateGuildBtn').onclick = () => modalOpen('createGuildModal');
    document.getElementById('closeCreateGuildModal').onclick = () => document.getElementById('createGuildModal').classList.remove('active');
    document.getElementById('closeGuildManage').onclick = () => document.getElementById('guildManageModal').classList.remove('active');
    document.getElementById('cgSubmitBtn').onclick = createGuild;
    document.getElementById('guildSearchBtn').onclick = searchGuild;
    loadGuildRank();
  }

  async function loadGuildRank() {
    stopGuildChat();
    const box = document.getElementById('guildRankList');
    if (!box) return;
    box.innerHTML = '<div class="empty-hint">加载中...</div>';
    const { data } = await rpc('guild_rank_list', { p_limit: 50 });
    // PostgREST 对 returns json 的 RPC 返回的是数组本体（不是 {list:[...]} 包裹），
    // 早年这里写成 data.list 导致排名列表永远渲染成"还没有工会"——兼容两种形态。
    const list = Array.isArray(data) ? data : ((data && data.list) || []);
    if (!list.length) { box.innerHTML = '<div class="empty-hint">还没有工会，快去创建一个吧！</div>'; return; }
    box.innerHTML = list.map((g, i) => {
      const rank = i + 1;
      const top = rank <= 3 ? ' guild-top' : '';
      const recBadge = g.recruiting ? '<span class="recruit-badge" title="该工会正在招募"><svg class="ui-ic" aria-hidden="true"><use href="#ic-megaphone"></use></svg> 招募中</span>' : '';
      const recNote = (g.recruiting && g.recruit_note) ? `<div class="gc-recruit-note">${escapeHTML(g.recruit_note)}</div>` : '';
      return `<div class="guild-card${top}${g.recruiting ? ' is-recruiting' : ''}">
        <div class="gc-rank">${rank}</div>
        <div class="gc-main">
          <div class="gc-name">${escapeHTML(g.name)}${recBadge}${g.tag ? `<span class="gc-tag">${escapeHTML(g.tag)}</span>` : ''}</div>
          <div class="gc-meta">成员 ${g.member_count || 0} 人 · 积分总和 ${(window.fmtPts||String)(g.total_active || 0)}</div>
          ${recNote}
        </div>
        <div class="gc-actions"><button class="submit-btn small" data-rank="${g.id}">成员</button></div>
      </div>`;
    }).join('');
    box.querySelectorAll('[data-rank]').forEach(b => b.onclick = () => showGuildMembers(b.dataset.rank, true));
  }

  async function loadMyGuilds() {
    stopGuildChat();
    const box = document.getElementById('guildMineList');
    if (!box) return;
    const uid = meId();
    if (!uid) {
      box.innerHTML = '<div class="empty-hint">请先 <a href="#" id="gLoginLink">登录</a> 查看你的工会</div>';
      const l = document.getElementById('gLoginLink');
      if (l) l.onclick = e => { e.preventDefault(); openAuthModal('login'); };
      return;
    }
    box.innerHTML = '<div class="empty-hint">加载中...</div>';
    const appr = await rest('guild_members', `select=guild_id,role,guilds(id,name,tag)&user_id=eq.${uid}&status=eq.approved`);
    const pend = await rest('guild_members', `select=guild_id,guilds(id,name,tag)&user_id=eq.${uid}&status=eq.pending`);
    const a = Array.isArray(appr.data) ? appr.data : [];
    const p = Array.isArray(pend.data) ? pend.data : [];
    if (!a.length && !p.length) {
      box.innerHTML = '<div class="empty-hint">你还没加入任何工会，搜索并申请加入，或自己创建。</div>';
      return;
    }
    let html = '';
    html += p.map(g => `<div class="guild-card"><div class="gc-main"><div class="gc-name">${escapeHTML(g.guilds ? g.guilds.name : '工会')}</div><div class="gc-meta">申请待审核</div></div></div>`).join('');
    html += a.map(g => {
      const gid = g.guilds ? g.guilds.id : g.guild_id;
      const isOwner = (g.role === 'owner');
      return `<div class="guild-card">
        <div class="gc-main"><div class="gc-name">${escapeHTML(g.guilds ? g.guilds.name : '工会')}${g.guilds && g.guilds.tag ? `<span class="gc-tag">${escapeHTML(g.guilds.tag)}</span>` : ''}</div><div class="gc-meta">${isOwner ? '<svg class="ui-ic" aria-hidden="true"><use href="#ic-crown"></use></svg> 会长' : '成员'}</div></div>
        <div class="gc-actions">
          <button class="submit-btn small" data-mem="${gid}">成员</button>
          ${isOwner ? '<button class="submit-btn small" data-manage="' + gid + '">管理</button>' : ''}
          ${isOwner ? '<button class="submit-btn small" data-pend="' + gid + '">待审批</button>' : ''}
          <button class="submit-btn small ghost" data-leave="${gid}">退出</button>
        </div>
      </div>`;
    }).join('');
    box.innerHTML = html;
    box.querySelectorAll('[data-mem]').forEach(b => b.onclick = () => showGuildMembers(b.dataset.mem, false));
    box.querySelectorAll('[data-manage]').forEach(b => b.onclick = () => openManage(b.dataset.manage));
    box.querySelectorAll('[data-pend]').forEach(b => b.onclick = () => showGuildPending(b.dataset.pend));
    box.querySelectorAll('[data-leave]').forEach(b => b.onclick = () => leaveGuild(b.dataset.leave));
  }

  async function createGuild() {
    const uid = meId();
    if (!uid) { showToast('请先登录', true); openAuthModal('login'); return; }
    const name = document.getElementById('cgName').value.trim();
    const tag = document.getElementById('cgTag').value.trim();
    const desc = document.getElementById('cgDesc').value.trim();
    const msg = document.getElementById('cgMessage');
    if (!name) { msg.textContent = '工会名不能为空'; msg.className = 'form-message error'; return; }
    const { data } = await rpc('create_guild', { p_name: name, p_tag: tag, p_desc: desc });
    if (data && data.ok) {
      showToast('工会创建成功！');
      const recruiting = document.getElementById('cgRecruiting').checked;
      const note = document.getElementById('cgRecruitNote').value.trim();
      if (recruiting && data.guild_id) {
        await rpc('set_guild_recruit', { p_guild: data.guild_id, p_recruiting: true, p_note: note });
      }
      document.getElementById('createGuildModal').classList.remove('active');
      document.getElementById('cgName').value = ''; document.getElementById('cgTag').value = ''; document.getElementById('cgDesc').value = '';
      document.getElementById('cgRecruiting').checked = false; document.getElementById('cgRecruitNote').value = '';
      loadMyGuilds();
    } else { msg.textContent = (data && data.msg) || '创建失败'; msg.className = 'form-message error'; }
  }

  async function searchGuild() {
    const q = document.getElementById('guildApplyInput').value.trim();
    const box = document.getElementById('guildSearchResult');
    if (!q) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="empty-hint">搜索中...</div>';
    const { data } = await rest('guilds', `select=id,name,tag&name=ilike.*${encodeURIComponent(q)}*&limit=10`);
    if (!Array.isArray(data) || !data.length) { box.innerHTML = '<div class="empty-hint">没有匹配的工会</div>'; return; }
    box.innerHTML = data.map(g => `
      <div class="guild-card">
        <div class="gc-main"><div class="gc-name">${escapeHTML(g.name)}${g.tag ? `<span class="gc-tag">${escapeHTML(g.tag)}</span>` : ''}</div></div>
        <div class="gc-actions"><button class="submit-btn small" data-apply="${g.id}">申请加入</button></div>
      </div>`).join('');
    box.querySelectorAll('[data-apply]').forEach(b => b.onclick = () => applyGuild(b.dataset.apply));
  }

  async function applyGuild(gid) {
    const uid = meId();
    if (!uid) { showToast('请先登录', true); openAuthModal('login'); return; }
    const { data } = await rpc('apply_guild', { p_guild: gid });
    if (data && data.ok) { showToast('已提交申请，等待会长审核'); document.getElementById('guildApplyInput').value = ''; document.getElementById('guildSearchResult').innerHTML = ''; }
    else showToast((data && data.msg) || '申请失败', true);
  }

  async function showGuildMembers(gid, fromRank) {
    const box = document.getElementById('guildMineList');
    box.innerHTML = '<div class="empty-hint">加载中...</div>';
    const { data } = await rest('guild_members', `select=user_id,role,users(id,username,avatar_url,active_value)&guild_id=eq.${gid}&status=eq.approved`);
    const list = Array.isArray(data) ? data : [];
    let html = `<button class="submit-btn small ghost" id="gmBack"><svg class="ui-ic" aria-hidden="true"><use href="#ic-arrow-left"></use></svg> 返回</button><div class="guild-members">`;
    if (!list.length) html += '<div class="empty-hint">暂无成员</div>';
    html += list.map(m => {
      const u = m.users || {};
      const av = u.avatar_url ? `<img class="hall-avatar" src="${escapeHTML(u.avatar_url)}" onerror="this.style.display='none'"/>` : `<div class="hall-avatar hall-avatar-empty">${escapeHTML((u.username || '?').slice(0, 1))}</div>`;
      const isMe = (u.id === meId());
      return `<div class="guild-member">
        ${av}
        <span class="gm-name">${escapeHTML(u.username || '匿名')}${m.role === 'owner' ? ' <svg class="ui-ic" aria-hidden="true"><use href="#ic-crown"></use></svg>' : ''}</span>
        <span class="gm-av">积分 ${(window.fmtPts||String)(u.active_value || 0)}</span>
        ${isMe ? '' : `<button class="submit-btn small" data-gift="${u.id}" data-gname="${escapeHTML(u.username || '')}"><svg class="ui-ic" aria-hidden="true"><use href="#ic-gift"></use></svg> 赠送</button>`}
      </div>`;
    }).join('');
    html += '</div>';
    const isMember = list.some(m => (m.users || {}).id === meId());
    if (isMember) {
      html += `<div class="guild-chat" id="guildChatBox">
        <div class="gc-chat-head"><svg class="ui-ic" aria-hidden="true"><use href="#ic-message"></use></svg> 工会聊天 <span class="gc-chat-tip">仅本工会成员可见 · 5 秒自动刷新</span></div>
        <div class="gc-chat-msgs" id="guildChatMsgs"><div class="empty-hint">加载中...</div></div>
        <div class="gc-chat-row">
          <input id="guildChatInput" maxlength="500" placeholder="说点什么…（Enter 发送）"/>
          <button class="submit-btn small" id="guildChatSend">发送</button>
        </div>
      </div>`;
    } else {
      html += `<div class="guild-chat guild-chat-locked"><div class="empty-hint">加入工会即可参与群聊</div></div>`;
    }
    box.innerHTML = html;
    const back = document.getElementById('gmBack');
    if (back) back.onclick = () => fromRank ? loadGuildRank() : loadMyGuilds();
    box.querySelectorAll('[data-gift]').forEach(b => b.onclick = () => window.giftUser(b.dataset.gift, b.dataset.gname));
    if (isMember) wireGuildChat(gid);
  }

  // ---------- 工会内聊天（v1.9.20） ----------
  let _chatTimer = null;
  function stopGuildChat() { if (_chatTimer) { clearInterval(_chatTimer); _chatTimer = null; } }
  async function loadGuildChat(gid) {
    const box = document.getElementById('guildChatMsgs');
    if (!box) return;
    const { data } = await rest('guild_messages', `select=id,content,created_at,users(id,username,avatar_url)&guild_id=eq.${gid}&order=created_at.desc&limit=50`);
    const list = Array.isArray(data) ? data.slice().reverse() : [];
    if (!list.length) { box.innerHTML = '<div class="empty-hint">还没有消息，来说第一句吧</div>'; return; }
    const uid = meId();
    box.innerHTML = list.map(m => {
      const u = m.users || {};
      const av = u.avatar_url ? `<img class="gc-avatar" src="${escapeHTML(u.avatar_url)}" onerror="this.style.display='none'"/>` : `<div class="gc-avatar gc-avatar-empty">${escapeHTML((u.username || '?').slice(0, 1))}</div>`;
      const mine = (u.id === uid);
      const t = m.created_at ? new Date(m.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
      return `<div class="gc-msg${mine ? ' mine' : ''}">${av}<div class="gc-bubble"><div class="gc-sender">${escapeHTML(u.username || '匿名')}${mine ? '（我）' : ''}<span class="gc-time">${t}</span></div><div class="gc-text">${escapeHTML(m.content)}</div></div></div>`;
    }).join('');
    box.scrollTop = box.scrollHeight;
  }
  async function sendGuildMessage(gid) {
    const input = document.getElementById('guildChatInput');
    const content = (input.value || '').trim();
    if (!content) return;
    if (content.length > 500) { showToast('消息最多 500 字', true); return; }
    const btn = document.getElementById('guildChatSend');
    btn.disabled = true;
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 12000);
      const r = await fetch(`${API}/rest/v1/guild_messages`, {
        method: 'POST',
        headers: { 'apikey': ANON, 'Authorization': `Bearer ${token()}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ guild_id: gid, user_id: meId(), content: content }),
        signal: ctrl.signal
      });
      clearTimeout(to);
      if (r.ok) { input.value = ''; loadGuildChat(gid); }
      else { const d = await r.json().catch(() => ({})); showToast(d.message || d.error || '发送失败', true); }
    } catch (e) { showToast('网络异常，请稍后重试', true); }
    btn.disabled = false;
  }
  function wireGuildChat(gid) {
    stopGuildChat();
    loadGuildChat(gid);
    _chatTimer = setInterval(() => loadGuildChat(gid), 5000);
    const send = document.getElementById('guildChatSend');
    const input = document.getElementById('guildChatInput');
    if (send) send.onclick = () => sendGuildMessage(gid);
    if (input) input.onkeydown = (e) => { if (e.key === 'Enter') sendGuildMessage(gid); };
  }

  async function showGuildPending(gid) {
    const box = document.getElementById('guildMineList');
    box.innerHTML = '<div class="empty-hint">加载中...</div>';
    const { data } = await rest('guild_members', `select=user_id,users(id,username)&guild_id=eq.${gid}&status=eq.pending`);
    const list = Array.isArray(data) ? data : [];
    let html = `<button class="submit-btn small ghost" id="gpBack"><svg class="ui-ic" aria-hidden="true"><use href="#ic-arrow-left"></use></svg> 返回</button><div class="guild-pending">`;
    if (!list.length) html += '<div class="empty-hint">没有待审核的申请</div>';
    html += list.map(m => {
      const u = m.users || {};
      return `<div class="gp-item"><span class="gp-name">${escapeHTML(u.username || '匿名')}</span>
        <button class="submit-btn small" data-app="1" data-uid="${u.id}" data-gid="${gid}">批准</button>
        <button class="submit-btn small ghost" data-app="0" data-uid="${u.id}" data-gid="${gid}">拒绝</button></div>`;
    }).join('');
    html += '</div>';
    box.innerHTML = html;
    const back = document.getElementById('gpBack'); if (back) back.onclick = loadMyGuilds;
    box.querySelectorAll('[data-app]').forEach(b => b.onclick = () => handleApply(b.dataset.gid, b.dataset.uid, b.dataset.app === '1'));
  }

  async function handleApply(gid, uid, approve) {
    const { data } = await rpc('handle_guild_apply', { p_guild: gid, p_user: uid, p_approve: approve });
    if (data && data.ok) { showToast(approve ? '已批准加入' : '已拒绝'); showGuildPending(gid); }
    else showToast((data && data.msg) || '操作失败', true);
  }

  async function leaveGuild(gid) {
    if (!confirm('确定退出该工会？')) return;
    const { data } = await rpc('leave_guild', { p_guild: gid });
    if (data && data.ok) { showToast('已退出工会'); loadMyGuilds(); }
    else showToast((data && data.msg) || '退出失败', true);
  }

  async function openManage(gid) {
    const overlay = document.getElementById('guildManageModal');
    const body = document.getElementById('gmManageBody');
    const msg = document.getElementById('gmManageMsg');
    msg.textContent = ''; msg.className = 'form-message';
    body.innerHTML = '<div class="empty-hint">加载成员中...</div>';
    modalOpen('guildManageModal');
    const gInfo = await rest('guilds', `select=recruiting,recruit_note&id=eq.${gid}&limit=1`);
    const gRow = (gInfo.data && gInfo.data[0]) || {};
    const { data } = await rest('guild_members', `select=user_id,users(id,username)&guild_id=eq.${gid}&status=eq.approved&role=neq.owner`);
    const members = Array.isArray(data) ? data : [];
    let html = '<p class="gm-section-title">转让会长（选择一名成员）</p>';
    if (!members.length) html += '<div class="empty-hint">暂无其他成员可转让</div>';
    else html += '<div class="gm-transfer-list">' + members.map(m => {
      const u = m.users || {};
      return `<div class="gp-item"><span class="gp-name">${escapeHTML(u.username || '匿名')}</span><button class="submit-btn small" data-transfer="${u.id}">转让</button></div>`;
    }).join('') + '</div>';
    html += '<hr class="gm-div"/><p class="gm-section-title">招募设置</p>'
      + '<label class="gm-switch"><input type="checkbox" id="gmRecruiting"' + (gRow.recruiting ? ' checked' : '') + '/> 开启招募（排名卡显示招募公告）</label>'
      + '<input id="gmRecruitNote" maxlength="100" placeholder="招募语，如：萌新友好，每晚组队挖矿！" value="' + escapeHTML(gRow.recruit_note || '') + '"/>'
      + '<button class="submit-btn small" id="gmRecruitSave">保存招募设置</button>'
      + '<hr class="gm-div"/><button class="submit-btn danger" id="gmDissolve">解散工会</button>';
    body.innerHTML = html;
    body.querySelectorAll('[data-transfer]').forEach(b => b.onclick = async () => {
      if (!confirm('确定将会长转让给该成员？')) return;
      const r = await rpc('transfer_guild', { p_guild: gid, p_to_user: b.dataset.transfer });
      if (r.data && r.data.ok) { showToast('会长已转让'); overlay.classList.remove('active'); loadMyGuilds(); loadGuildRank(); }
      else { msg.textContent = (r.data && r.data.msg) || '转让失败'; msg.className = 'form-message error'; }
    });
    const rs = document.getElementById('gmRecruitSave');
    if (rs) rs.onclick = async () => {
      const on = document.getElementById('gmRecruiting').checked;
      const note = document.getElementById('gmRecruitNote').value.trim();
      const r = await rpc('set_guild_recruit', { p_guild: gid, p_recruiting: on, p_note: note });
      if (r.data && r.data.ok) { showToast('招募设置已保存'); loadGuildRank(); }
      else { msg.textContent = (r.data && r.data.msg) || '保存失败'; msg.className = 'form-message error'; }
    };
    const dis = document.getElementById('gmDissolve');
    if (dis) dis.onclick = async () => {
      if (!confirm('解散后工会与所有成员关系将永久删除，确定？')) return;
      const r = await rpc('dissolve_guild', { p_guild: gid });
      if (r.data && r.data.ok) { showToast('工会已解散'); overlay.classList.remove('active'); loadMyGuilds(); loadGuildRank(); }
      else { msg.textContent = (r.data && r.data.msg) || '解散失败'; msg.className = 'form-message error'; }
    };
  }

  const _sw = window.switchView;
  window.switchView = function (name) { if (typeof _sw === 'function') _sw(name); if (name === 'guilds') initGuilds(); };
})();
