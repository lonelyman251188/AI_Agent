// ============================================================
// api.js — Ollama / OpenAI-compatible API client
// ============================================================

class AIApi {
  constructor() {
    this.baseUrl = localStorage.getItem('ai_api_url') || 'http://localhost:11434/v1';
    this.model = localStorage.getItem('ai_model') || 'llama3.2';
    this.temperature = parseFloat(localStorage.getItem('ai_temperature') || '0.7');
    this.maxTokens = parseInt(localStorage.getItem('ai_max_tokens') || '4096');
    this.connected = false;
  }

  updateSettings({ baseUrl, model, temperature, maxTokens }) {
    if (baseUrl !== undefined) { this.baseUrl = baseUrl; localStorage.setItem('ai_api_url', baseUrl); }
    if (model !== undefined) { this.model = model; localStorage.setItem('ai_model', model); }
    if (temperature !== undefined) { this.temperature = temperature; localStorage.setItem('ai_temperature', String(temperature)); }
    if (maxTokens !== undefined) { this.maxTokens = maxTokens; localStorage.setItem('ai_max_tokens', String(maxTokens)); }
  }

  async checkConnection() {
    try {
      const res = await fetch(`${this.baseUrl}/models`, { method: 'GET', signal: AbortSignal.timeout(5000) });
      this.connected = res.ok;
      return this.connected;
    } catch {
      // Try Ollama native endpoint
      try {
        const ollamaUrl = this.baseUrl.replace('/v1', '');
        const res = await fetch(`${ollamaUrl}/api/tags`, { method: 'GET', signal: AbortSignal.timeout(5000) });
        this.connected = res.ok;
        return this.connected;
      } catch {
        this.connected = false;
        return false;
      }
    }
  }

  async getModels() {
    try {
      const res = await fetch(`${this.baseUrl}/models`);
      if (res.ok) {
        const data = await res.json();
        return (data.data || data.models || []).map(m => m.id || m.name);
      }
    } catch { /* ignore */ }
    // Fallback: Ollama native
    try {
      const ollamaUrl = this.baseUrl.replace('/v1', '');
      const res = await fetch(`${ollamaUrl}/api/tags`);
      if (res.ok) {
        const data = await res.json();
        return (data.models || []).map(m => m.name);
      }
    } catch { /* ignore */ }
    return [];
  }

  async *streamChat(messages, systemPrompt) {
    const body = {
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({ role: m.role, content: m.content })),
      ],
      temperature: this.temperature,
      max_tokens: this.maxTokens,
      stream: true,
    };

    const controller = new AbortController();
    this._currentController = controller;

    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => 'Unknown error');
        throw new Error(`API Error ${res.status}: ${errText}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const payload = trimmed.slice(6);
          if (payload === '[DONE]') return;

          try {
            const json = JSON.parse(payload);
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) yield delta;
          } catch { /* ignore parse error */ }
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      throw err;
    }
  }

  abortStream() {
    if (this._currentController) {
      this._currentController.abort();
      this._currentController = null;
    }
  }
}

const aiApi = new AIApi();
