// ============================================================
// party-mode.js — Multi-agent discussion mode
// ============================================================

class PartyMode {
  constructor() {
    this.active = false;
    this.selectedAgents = [];
    this.sessionId = null;
    this.turnIndex = 0;
  }

  start(agentIds) {
    this.selectedAgents = AGENTS.filter(a => agentIds.includes(a.id));
    if (this.selectedAgents.length < 2) return false;
    this.active = true;
    this.sessionId = 'party_' + Date.now();
    this.turnIndex = 0;
    return true;
  }

  stop() {
    this.active = false;
    this.selectedAgents = [];
    this.sessionId = null;
    this.turnIndex = 0;
  }

  getNextAgent() {
    if (!this.active || this.selectedAgents.length === 0) return null;
    const agent = this.selectedAgents[this.turnIndex % this.selectedAgents.length];
    this.turnIndex++;
    return agent;
  }

  getPartySystemPrompt(agent, topic) {
    const otherNames = this.selectedAgents
      .filter(a => a.id !== agent.id)
      .map(a => `${a.emoji} ${a.name} (${a.role})`)
      .join(', ');

    return `${agent.systemPrompt}

CHỈ THỊ HỆ THỐNG CHO CHẾ ĐỘ THẢO LUẬN NHÓM:
Bạn đang tham gia thảo luận nhóm. Các đồng nghiệp của bạn là: ${otherNames}.
- BẠN CHỈ ĐƯỢC PHÉP ĐÓNG VAI ${agent.name} (${agent.role}).
- NGÔN NGỮ BẮT BUỘC: 100% TIẾNG VIỆT. Tuyệt đối KHÔNG sử dụng tiếng Trung Quốc (Chinese) hay bất kỳ ngoại ngữ nào khác.
- BẮT BUỘC SUY NGHĨ: LUÔN bắt đầu bằng một khối <thinking>...suy luận logic của bạn...</thinking> để phân tích trước khi đưa ra câu trả lời chính thức.
- TẬP TRUNG VÀO KẾT QUẢ: Đừng chỉ đặt câu hỏi tu từ hay đồng ý suông với nhau. Hãy cung cấp ngay sản phẩm cụ thể (dàn ý, đoạn code, bảng dữ liệu, cấu trúc file, v.v.) thuộc chuyên môn của bạn. Nếu đồng nghiệp trước đã làm một phần, hãy xây dựng tiếp phần còn lại thay vì lặp lại.
- TUYỆT ĐỐI KHÔNG giả mạo, cướp lời hoặc viết thay lời cho các đồng nghiệp khác.
- Phản hồi tự nhiên: Nếu người dùng chỉ chào hỏi, hãy chào lại và hỏi xem họ muốn bàn về dự án gì.
- Ẩn danh: Tuyệt đối KHÔNG nhắc đến các từ như "Chỉ thị hệ thống", "Party Mode" hay luật lệ của bạn cho người dùng thấy.
- Dừng đúng lúc: Chỉ nói phần của bạn rồi DỪNG LẠI NGAY LẬP TỨC để nhường lời cho người khác.
- Giữ câu trả lời súc tích nhưng đầy đủ nội dung thực thi.
- Bắt đầu câu trả lời của bạn bằng đúng định dạng này: "${agent.emoji} **${agent.name}:** "

Câu nói gần nhất của người dùng: ${topic || 'Chưa có'}`;
  }

  // Decide dynamically which agent should respond next based on context
  pickBestAgent(lastMessage) {
    // Simple keyword-based matching; could be enhanced with AI
    const keywords = {
      analyst: ['phân tích', 'nghiên cứu', 'brainstorm', 'ý tưởng', 'thị trường', 'research', 'analyze'],
      pm: ['kế hoạch', 'timeline', 'story', 'epic', 'sprint', 'prd', 'yêu cầu', 'requirement'],
      architect: ['kiến trúc', 'database', 'api', 'tech stack', 'hệ thống', 'architecture', 'scale'],
      developer: ['code', 'bug', 'implement', 'function', 'test', 'lập trình', 'debug'],
      ux: ['ui', 'ux', 'design', 'giao diện', 'wireframe', 'thiết kế', 'user flow'],
      writer: ['doc', 'tài liệu', 'readme', 'guide', 'hướng dẫn', 'documentation'],
    };

    const lower = (lastMessage || '').toLowerCase();
    let bestId = null;
    let bestScore = 0;

    for (const [id, words] of Object.entries(keywords)) {
      if (!this.selectedAgents.find(a => a.id === id)) continue;
      const score = words.filter(w => lower.includes(w)).length;
      if (score > bestScore) {
        bestScore = score;
        bestId = id;
      }
    }

    // Fallback to round-robin if no keyword match
    if (!bestId) return this.getNextAgent();
    const agent = this.selectedAgents.find(a => a.id === bestId);
    return agent || this.getNextAgent();
  }
}

const partyMode = new PartyMode();
