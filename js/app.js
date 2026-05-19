// ============================================================
// app.js — Main application orchestration
// ============================================================

let chatEngine;
let currentAgent = null;
let partyTopic = '';

// ---- Init ----
document.addEventListener('DOMContentLoaded', () => {
  const chatArea = document.getElementById('chat-area');
  const chatInput = document.getElementById('chat-input');
  const sendBtn = document.getElementById('send-btn');

  chatEngine = new ChatEngine(chatArea, chatInput, sendBtn);

  renderAgentList();
  selectAgent(AGENTS[0].id);
  checkConnection();

  // Send message
  sendBtn.addEventListener('click', handleSend);
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  // Suggestion cards
  chatArea.addEventListener('click', (e) => {
    const card = e.target.closest('.suggestion-card');
    if (card) {
      chatInput.value = card.dataset.prompt;
      chatInput.focus();
    }
  });

  // Sidebar toggle (mobile)
  document.getElementById('menu-toggle')?.addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });

  // Settings modal
  document.getElementById('btn-settings')?.addEventListener('click', openSettings);
  document.getElementById('settings-save')?.addEventListener('click', saveSettings);
  document.getElementById('btn-refresh-models')?.addEventListener('click', loadModels);

  // Party mode
  document.getElementById('btn-party')?.addEventListener('click', openPartyModal);
  document.getElementById('party-start')?.addEventListener('click', startParty);
  document.getElementById('btn-stop-party')?.addEventListener('click', stopParty);

  // New chat
  document.getElementById('btn-new-chat')?.addEventListener('click', newChat);

  // Close modals
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.closest('.modal-overlay').classList.remove('active');
    });
  });

  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('active');
    });
  });

  // Load settings into form
  populateSettingsForm();
});

// ---- Agent List ----
function renderAgentList() {
  const list = document.getElementById('agent-list');
  list.innerHTML = AGENTS.map(agent => `
    <div class="agent-item" data-agent-id="${agent.id}" style="--accent-color: ${agent.accent}">
      <div class="agent-avatar" style="border-color: ${agent.accentHex}30">
        ${agent.emoji}
        <div class="status-dot"></div>
      </div>
      <div class="agent-info">
        <div class="name">${agent.name}</div>
        <div class="role">${agent.title}</div>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.agent-item').forEach(item => {
    item.addEventListener('click', () => {
      if (partyMode.active) return;
      selectAgent(item.dataset.agentId);
      document.getElementById('sidebar').classList.remove('open');
    });
  });
}

function selectAgent(agentId) {
  const agent = AGENTS.find(a => a.id === agentId);
  if (!agent) return;

  currentAgent = agent;

  // Update sidebar active state
  document.querySelectorAll('.agent-item').forEach(el => {
    el.classList.toggle('active', el.dataset.agentId === agentId);
  });

  // Update topbar
  document.getElementById('topbar-emoji').textContent = agent.emoji;
  document.getElementById('topbar-name').textContent = agent.name;
  document.getElementById('topbar-role').textContent = agent.title;

  // Load conversation
  const history = storage.getConversation(agentId);
  chatEngine.loadHistory(history, agent);

  // Update input placeholder
  const input = document.getElementById('chat-input');
  if (input) input.placeholder = `Nhắn tin cho ${agent.name}...`;
}

// ---- Send Message ----
async function handleSend() {
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!text || chatEngine.isStreaming) return;

  input.value = '';
  input.style.height = 'auto';

  if (partyMode.active) {
    await handlePartySend(text);
    return;
  }

  if (!currentAgent) return;

  // Add user message
  chatEngine.addMessage({ role: 'user', content: text });
  storage.saveMessage(currentAgent.id, { role: 'user', content: text });

  // Build history for context
  const history = storage.getConversation(currentAgent.id);

  // Start streaming
  const stream = chatEngine.startStreamMessage({
    agentName: currentAgent.name,
    agentEmoji: currentAgent.emoji,
  });

  const sendBtn = document.getElementById('send-btn');
  sendBtn.disabled = true;

  try {
    for await (const chunk of aiApi.streamChat(history, currentAgent.systemPrompt)) {
      stream.append(chunk);
    }
    const fullText = stream.finish();
    storage.saveMessage(currentAgent.id, { role: 'assistant', content: fullText });
  } catch (err) {
    stream.finish();
    showToast(`Lỗi: ${err.message}`, 'error');
    console.error('Stream error:', err);
  }

  sendBtn.disabled = false;
}

// ---- Party Mode ----
async function handlePartySend(text) {
  // Add user message
  chatEngine.addMessage({ role: 'user', content: text });
  if (partyMode.sessionId) {
    storage.savePartyMessage(partyMode.sessionId, { role: 'user', content: text });
  }
  partyTopic = text;

  const sendBtn = document.getElementById('send-btn');
  sendBtn.disabled = true;

  // Each selected agent responds in turn
  const respondingAgents = [...partyMode.selectedAgents];
  const allMessages = [{ role: 'user', content: text }];

  for (const agent of respondingAgents) {
    const systemPrompt = partyMode.getPartySystemPrompt(agent, partyTopic);

    const stream = chatEngine.startStreamMessage({
      agentName: agent.name,
      agentEmoji: agent.emoji,
    });

    try {
      for await (const chunk of aiApi.streamChat(allMessages, systemPrompt)) {
        stream.append(chunk);
      }
      const fullText = stream.finish();
      allMessages.push({ role: 'assistant', content: fullText });

      if (partyMode.sessionId) {
        storage.savePartyMessage(partyMode.sessionId, {
          role: 'assistant',
          content: fullText,
          agentId: agent.id,
        });
      }
    } catch (err) {
      stream.finish();
      showToast(`Lỗi từ ${agent.name}: ${err.message}`, 'error');
      break;
    }

    // Small delay between agents
    await new Promise(r => setTimeout(r, 300));
  }

  sendBtn.disabled = false;
}

function openPartyModal() {
  const modal = document.getElementById('modal-party');
  const grid = document.getElementById('party-agent-grid');

  grid.innerHTML = AGENTS.map(agent => `
    <div class="party-agent-card" data-agent-id="${agent.id}">
      <span class="emoji">${agent.emoji}</span>
      <span class="label">${agent.name} — ${agent.role}</span>
    </div>
  `).join('');

  grid.querySelectorAll('.party-agent-card').forEach(card => {
    card.addEventListener('click', () => card.classList.toggle('selected'));
  });

  modal.classList.add('active');
}

function startParty() {
  const selected = [...document.querySelectorAll('.party-agent-card.selected')]
    .map(el => el.dataset.agentId);

  if (selected.length < 2) {
    showToast('Chọn ít nhất 2 agent để bắt đầu Party Mode!', 'error');
    return;
  }

  partyMode.start(selected);

  // Update UI
  document.getElementById('modal-party').classList.remove('active');
  document.getElementById('btn-stop-party').style.display = 'flex';

  const names = partyMode.selectedAgents.map(a => `${a.emoji}${a.name}`).join(', ');
  document.getElementById('topbar-emoji').textContent = '🎉';
  document.getElementById('topbar-name').textContent = 'Party Mode';
  document.getElementById('topbar-role').textContent = names;

  chatEngine.clear();
  const intro = document.createElement('div');
  intro.className = 'welcome-screen';
  intro.innerHTML = `
    <div class="welcome-emoji">🎉</div>
    <h2>Party Mode — Thảo luận nhóm</h2>
    <p>Đặt câu hỏi và ${partyMode.selectedAgents.length} agent sẽ cùng thảo luận từ góc nhìn chuyên môn của họ.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:16px;">
      ${partyMode.selectedAgents.map(a => `<span class="party-badge">${a.emoji} ${a.name}</span>`).join('')}
    </div>
  `;
  document.getElementById('chat-area').appendChild(intro);

  document.getElementById('chat-input').placeholder = 'Đặt câu hỏi cho cả nhóm...';

  // Disable agent sidebar clicks
  document.querySelectorAll('.agent-item').forEach(el => el.classList.remove('active'));

  showToast('Party Mode đã bắt đầu! 🎉', 'success');
}

function stopParty() {
  partyMode.stop();
  document.getElementById('btn-stop-party').style.display = 'none';
  if (currentAgent) selectAgent(currentAgent.id);
  else selectAgent(AGENTS[0].id);
  showToast('Party Mode đã kết thúc', 'info');
}

// ---- Settings ----
function openSettings() {
  populateSettingsForm();
  document.getElementById('modal-settings').classList.add('active');
  loadModels();
}

function populateSettingsForm() {
  document.getElementById('setting-api-url').value = aiApi.baseUrl;
  document.getElementById('setting-temperature').value = aiApi.temperature;
  document.getElementById('setting-max-tokens').value = aiApi.maxTokens;
}

function saveSettings() {
  const url = document.getElementById('setting-api-url').value.trim();
  const model = document.getElementById('setting-model').value;
  const temp = parseFloat(document.getElementById('setting-temperature').value);
  const tokens = parseInt(document.getElementById('setting-max-tokens').value);

  aiApi.updateSettings({
    baseUrl: url || undefined,
    model: model || undefined,
    temperature: isNaN(temp) ? undefined : temp,
    maxTokens: isNaN(tokens) ? undefined : tokens,
  });

  document.getElementById('modal-settings').classList.remove('active');
  showToast('Đã lưu cài đặt! ✓', 'success');
  checkConnection();
}

async function loadModels() {
  const select = document.getElementById('setting-model');
  select.innerHTML = '<option value="">Đang tải...</option>';

  const models = await aiApi.getModels();
  if (models.length === 0) {
    select.innerHTML = '<option value="">Không tìm thấy model</option>';
    return;
  }

  select.innerHTML = models.map(m =>
    `<option value="${m}" ${m === aiApi.model ? 'selected' : ''}>${m}</option>`
  ).join('');
}

// ---- Connection ----
async function checkConnection() {
  const statusEl = document.getElementById('connection-status');
  const ok = await aiApi.checkConnection();

  statusEl.className = `connection-status ${ok ? 'connected' : 'disconnected'}`;
  statusEl.innerHTML = `
    <span class="connection-dot"></span>
    ${ok ? 'Đã kết nối' : 'Chưa kết nối'}
  `;
}

// ---- New Chat ----
function newChat() {
  if (partyMode.active) {
    stopParty();
    return;
  }
  if (!currentAgent) return;
  storage.clearConversation(currentAgent.id);
  chatEngine.showWelcome(currentAgent);
  showToast('Đã tạo cuộc trò chuyện mới', 'info');
}

// ---- Toast ----
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}
