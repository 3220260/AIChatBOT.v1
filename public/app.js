import { findBestMatch } from './faq.js';

class ChatBot {
  constructor() {
    this.conversationHistory = [];
    this.isTyping = false;
    this.tokensSaved = 0;
    this.faqAnswers = 0;
    this.geminiAnswers = 0;
    
    this.initElements();
    this.attachEventListeners();
    this.showWelcomeMessage();
  }

  initElements() {
    this.chatMessages = document.getElementById('chat-messages');
    this.userInput = document.getElementById('user-input');
    this.sendButton = document.getElementById('send-button');
    this.statsElement = document.getElementById('stats');
  }

  attachEventListeners() {
    this.sendButton.addEventListener('click', () => this.handleSend());
    this.userInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleSend();
      }
    });
  }

  showWelcomeMessage() {
    this.addMessage(
      'Γεια σας! Καλώς ήρθατε στο chatbot μας. Πώς μπορώ να σας βοηθήσω σήμερα;',
      'bot'
    );
  }

  async handleSend() {
    const message = this.userInput.value.trim();
    if (!message || this.isTyping) return;

    // Προσθέτουμε το μήνυμα του χρήστη
    this.addMessage(message, 'user');
    this.userInput.value = '';
    
    // Προσθέτουμε typing indicator
    this.showTypingIndicator();

    // Πρώτα ψάχνουμε στο FAQ
    const faqAnswer = findBestMatch(message);
    
    if (faqAnswer) {
      // Βρήκαμε απάντηση στο FAQ! Εξοικονομούμε tokens!
      setTimeout(() => {
        this.hideTypingIndicator();
        this.addMessage(faqAnswer, 'bot', 'faq');
        this.conversationHistory.push(
          { role: 'user', content: message },
          { role: 'bot', content: faqAnswer }
        );
        this.faqAnswers++;
        this.tokensSaved += this.estimateTokens(message) + this.estimateTokens(faqAnswer);
        this.updateStats();
      }, 500); // Μικρή καθυστέρηση για φυσικότερη αίσθηση
    } else {
      // Δεν βρήκαμε στο FAQ, χρησιμοποιούμε το Gemini
      await this.getGeminiResponse(message);
    }
  }

  async getGeminiResponse(message) {
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          conversationHistory: this.conversationHistory.slice(-6) // Κρατάμε τα τελευταία 3 ζευγάρια
        }),
      });

      const data = await response.json();
      
      this.hideTypingIndicator();
      
      if (response.ok) {
        this.addMessage(data.response, 'bot', 'gemini');
        this.conversationHistory.push(
          { role: 'user', content: message },
          { role: 'bot', content: data.response }
        );
        this.geminiAnswers++;
        this.updateStats();
      } else {
        this.addMessage(
          data.message || 'Λυπούμαστε, κάτι πήγε στραβά. Παρακαλώ δοκιμάστε ξανά.',
          'bot',
          'error'
        );
      }
    } catch (error) {
      console.error('Error:', error);
      this.hideTypingIndicator();
      this.addMessage(
        'Λυπούμαστε, δεν μπορώ να επικοινωνήσω με τον server. Παρακαλώ ελέγξτε τη σύνδεσή σας.',
        'bot',
        'error'
      );
    }
  }

  addMessage(text, sender, source = null) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}-message`;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.textContent = text;
    
    messageDiv.appendChild(contentDiv);
    
    // Προσθέτουμε badge για την πηγή
    if (source) {
      const badge = document.createElement('span');
      badge.className = `source-badge ${source}`;
      badge.textContent = source === 'faq' ? '⚡ FAQ' : '🤖 AI';
      messageDiv.appendChild(badge);
    }
    
    this.chatMessages.appendChild(messageDiv);
    this.scrollToBottom();
  }

  showTypingIndicator() {
    this.isTyping = true;
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message bot-message typing-indicator';
    typingDiv.id = 'typing-indicator';
    typingDiv.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';
    this.chatMessages.appendChild(typingDiv);
    this.scrollToBottom();
  }

  hideTypingIndicator() {
    this.isTyping = false;
    const typingIndicator = document.getElementById('typing-indicator');
    if (typingIndicator) {
      typingIndicator.remove();
    }
  }

  scrollToBottom() {
    this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
  }

  estimateTokens(text) {
    // Rough estimation: ~4 characters per token for Greek text
    return Math.ceil(text.length / 4);
  }

  updateStats() {
    const savingsPercentage = this.faqAnswers + this.geminiAnswers > 0
      ? Math.round((this.faqAnswers / (this.faqAnswers + this.geminiAnswers)) * 100)
      : 0;
    
    this.statsElement.innerHTML = `
      <div class="stat">
        <span class="stat-label">FAQ Απαντήσεις:</span>
        <span class="stat-value">${this.faqAnswers}</span>
      </div>
      <div class="stat">
        <span class="stat-label">AI Απαντήσεις:</span>
        <span class="stat-value">${this.geminiAnswers}</span>
      </div>
      <div class="stat">
        <span class="stat-label">Εξοικονόμηση:</span>
        <span class="stat-value">${savingsPercentage}%</span>
      </div>
      <div class="stat">
        <span class="stat-label">Tokens Εξοικ.:</span>
        <span class="stat-value">~${this.tokensSaved}</span>
      </div>
    `;
  }
}

// Αρχικοποίηση όταν φορτώσει η σελίδα
document.addEventListener('DOMContentLoaded', () => {
  new ChatBot();
});
