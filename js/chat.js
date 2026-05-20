// ============================================================
// chat.js — Chat engine: rendering, markdown, interactions
// ============================================================

class ChatEngine {
  constructor(containerEl, inputEl, sendBtnEl) {
    this.container = containerEl;
    this.input = inputEl;
    this.sendBtn = sendBtnEl;
    this.isStreaming = false;
    this.shouldAutoScroll = true;
    this._autoResize();
    this._initScrollListener();
  }

  _initScrollListener() {
    if (!this.container) return;
    this.container.addEventListener('scroll', () => {
      const threshold = 80;
      const distanceFromBottom = this.container.scrollHeight - this.container.scrollTop - this.container.clientHeight;
      this.shouldAutoScroll = (distanceFromBottom <= threshold);
    });
  }

  _autoResize() {
    if (!this.input) return;
    this.input.addEventListener('input', () => {
      this.input.style.height = 'auto';
      this.input.style.height = Math.min(this.input.scrollHeight, 150) + 'px';
    });
  }

  scrollToBottom(force = false) {
    if (force) {
      this.shouldAutoScroll = true;
    }
    if (!this.shouldAutoScroll) return;
    requestAnimationFrame(() => {
      this.container.scrollTop = this.container.scrollHeight;
    });
  }

  // Simple markdown → HTML
  renderMarkdown(text) {
    let html = text
      // Thinking blocks
      .replace(/<thinking>([\s\S]*?)<\/thinking>/g, '<details class="thinking-block"><summary>🧠 Nhấn để xem luồng suy nghĩ</summary><div class="thinking-content">$1</div></details>')
      // Code blocks
      .replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
        const escaped = code.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return `<pre><code class="language-${lang || 'text'}">${escaped}</code><div class="code-actions"><button class="code-copy-btn" onclick="chatEngine.copyCode(this)">Copy</button><button class="code-download-btn" onclick="chatEngine.downloadCode(this, '${lang}')">Download</button></div></pre>`;
      })
      // Inline code
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // Bold
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      // Italic
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      // Headers
      .replace(/^### (.+)$/gm, '<h4>$1</h4>')
      .replace(/^## (.+)$/gm, '<h3>$1</h3>')
      .replace(/^# (.+)$/gm, '<h2>$1</h2>')
      // Unordered list
      .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
      // Ordered list
      .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
      // Horizontal rule
      .replace(/^---$/gm, '<hr>')
      // Line breaks → paragraphs
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>');

    // Wrap consecutive <li> in <ul>
    html = html.replace(/((?:<li>.*<\/li><br>?)+)/g, '<ul>$1</ul>');
    html = html.replace(/<br><\/ul>/g, '</ul>');
    html = html.replace(/<ul><br>/g, '<ul>');

    return `<p>${html}</p>`.replace(/<p><\/p>/g, '');
  }

  copyCode(btnEl) {
    const pre = btnEl.closest('pre');
    const code = pre ? pre.querySelector('code') : null;
    if (code) {
      navigator.clipboard.writeText(code.textContent).then(() => {
        btnEl.textContent = '✓ Copied';
        setTimeout(() => btnEl.textContent = 'Copy', 2000);
      });
    }
  }

  downloadCode(btnEl, lang) {
    const pre = btnEl.closest('pre');
    const code = pre ? pre.querySelector('code') : null;
    if (code) {
      const text = code.textContent;
      const extensions = {
        'javascript': 'js', 'js': 'js',
        'python': 'py', 'py': 'py',
        'html': 'html',
        'css': 'css',
        'json': 'json',
        'markdown': 'md', 'md': 'md',
        'csv': 'csv',
        'xml': 'xml',
        'sql': 'sql',
        'typescript': 'ts', 'ts': 'ts'
      };
      const ext = extensions[lang ? lang.toLowerCase() : ''] || 'txt';
      const filename = `export_${Date.now()}.${ext}`;
      
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }

  formatTime(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  }

  // Add a complete message to the chat
  addMessage({ role, content, agentName, agentEmoji, timestamp }) {
    const isUser = role === 'user';
    const msg = document.createElement('div');
    msg.className = `message ${isUser ? 'user-message' : 'agent-message'}`;

    msg.innerHTML = `
      <div class="message-avatar" ${!isUser ? `style="background:rgba(255,255,255,0.05)"` : ''}>
        ${isUser ? '👤' : (agentEmoji || '🤖')}
      </div>
      <div class="message-content">
        <div class="message-header">
          <span class="name">${isUser ? 'Bạn' : (agentName || 'AI')}</span>
          <span class="time">${this.formatTime(timestamp || Date.now())}</span>
        </div>
        <div class="message-bubble">${this.renderMarkdown(content)}</div>
      </div>
    `;

    // Remove welcome screen if present
    const welcome = this.container.querySelector('.welcome-screen');
    if (welcome) welcome.remove();

    this.container.appendChild(msg);
    this.scrollToBottom(isUser);
    return msg;
  }

  // Start a streaming message (returns an updater object)
  startStreamMessage({ agentName, agentEmoji }) {
    const msg = document.createElement('div');
    msg.className = 'message agent-message';
    const ts = Date.now();

    msg.innerHTML = `
      <div class="message-avatar" style="background:rgba(255,255,255,0.05)">
        ${agentEmoji || '🤖'}
      </div>
      <div class="message-content">
        <div class="message-header">
          <span class="name">${agentName || 'AI'}</span>
          <span class="time">${this.formatTime(ts)}</span>
        </div>
        <div class="message-bubble">
          <div class="typing-indicator">
            <span></span><span></span><span></span>
          </div>
        </div>
      </div>
    `;

    const welcome = this.container.querySelector('.welcome-screen');
    if (welcome) welcome.remove();

    this.container.appendChild(msg);
    this.scrollToBottom(true);

    const bubble = msg.querySelector('.message-bubble');
    let fullText = '';
    this.isStreaming = true;

    return {
      element: msg,
      timestamp: ts,
      append: (chunk) => {
        fullText += chunk;
        bubble.innerHTML = this.renderMarkdown(fullText);
        this.scrollToBottom();
      },
      finish: () => {
        bubble.innerHTML = this.renderMarkdown(fullText);
        this.isStreaming = false;
        this.scrollToBottom();
        return fullText;
      },
      getText: () => fullText,
    };
  }

  // Show welcome screen
  showWelcome(agent) {
    this.container.innerHTML = '';
    const welcome = document.createElement('div');
    welcome.className = 'welcome-screen';

    const suggestionsHtml = (agent.suggestions || [])
      .map(s => `
        <div class="suggestion-card" data-prompt="${s.title}">
          <div class="icon">${s.icon}</div>
          <div class="title">${s.title}</div>
          <div class="desc">${s.desc}</div>
        </div>
      `).join('');

    welcome.innerHTML = `
      <div class="welcome-emoji">${agent.emoji}</div>
      <h2>Xin chào! Tôi là ${agent.name}</h2>
      <p>${agent.description}</p>
      <div class="welcome-suggestions">${suggestionsHtml}</div>
    `;

    this.container.appendChild(welcome);
  }

  // Reload conversation history
  loadHistory(messages, agent) {
    this.container.innerHTML = '';
    if (messages.length === 0) {
      this.showWelcome(agent);
      return;
    }
    messages.forEach(m => {
      this.addMessage({
        role: m.role,
        content: m.content,
        agentName: agent.name,
        agentEmoji: agent.emoji,
        timestamp: m.timestamp,
      });
    });
  }

  clear() {
    this.container.innerHTML = '';
  }
}
