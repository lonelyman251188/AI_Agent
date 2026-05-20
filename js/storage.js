// ============================================================
// storage.js — LocalStorage persistence for conversations
// ============================================================

class Storage {
  constructor() {
    this.KEYS = {
      conversations: 'vteam_conversations',
      settings: 'vteam_settings',
    };
  }

  // --- Conversations ---
  getConversations() {
    try {
      return JSON.parse(localStorage.getItem(this.KEYS.conversations)) || {};
    } catch { return {}; }
  }

  getConversation(agentId) {
    const all = this.getConversations();
    return all[agentId] || [];
  }

  saveMessage(agentId, message) {
    const all = this.getConversations();
    if (!all[agentId]) all[agentId] = [];
    all[agentId].push({
      ...message,
      timestamp: message.timestamp || Date.now(),
    });
    // Keep last 200 messages per agent
    if (all[agentId].length > 200) {
      all[agentId] = all[agentId].slice(-200);
    }
    localStorage.setItem(this.KEYS.conversations, JSON.stringify(all));
  }

  clearConversation(agentId) {
    const all = this.getConversations();
    delete all[agentId];
    localStorage.setItem(this.KEYS.conversations, JSON.stringify(all));
  }

  clearPartyConversation(sessionId) {
    localStorage.removeItem(`vteam_party_${sessionId}`);
  }

  clearAllConversations() {
    localStorage.setItem(this.KEYS.conversations, JSON.stringify({}));
  }

  // --- Party mode conversations ---
  getPartyConversation(sessionId) {
    try {
      return JSON.parse(localStorage.getItem(`vteam_party_${sessionId}`)) || [];
    } catch { return []; }
  }

  savePartyMessage(sessionId, message) {
    const msgs = this.getPartyConversation(sessionId);
    msgs.push({ ...message, timestamp: message.timestamp || Date.now() });
    if (msgs.length > 300) msgs.splice(0, msgs.length - 300);
    localStorage.setItem(`vteam_party_${sessionId}`, JSON.stringify(msgs));
  }

  // --- Settings ---
  getSettings() {
    try {
      return JSON.parse(localStorage.getItem(this.KEYS.settings)) || {};
    } catch { return {}; }
  }

  saveSetting(key, value) {
    const settings = this.getSettings();
    settings[key] = value;
    localStorage.setItem(this.KEYS.settings, JSON.stringify(settings));
  }

  // --- Export / Import ---
  exportData() {
    return JSON.stringify({
      conversations: this.getConversations(),
      settings: this.getSettings(),
      exportedAt: new Date().toISOString(),
    }, null, 2);
  }

  importData(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      if (data.conversations) localStorage.setItem(this.KEYS.conversations, JSON.stringify(data.conversations));
      if (data.settings) localStorage.setItem(this.KEYS.settings, JSON.stringify(data.settings));
      return true;
    } catch { return false; }
  }
}

const storage = new Storage();
