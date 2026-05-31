    const API_ENDPOINT = "/api/chat";
    const STORAGE_KEY = "syn_chat_history_v3";
    const FEEDBACK_STORAGE_KEY = "syn_chat_feedback_v1";
    const USER_ID_KEY = "sofia_chat_user_id";
    const MAX_CHARS = 500;
    const MAX_STORED_MESSAGES = 80;
    
   const ALLOWED_PARENT_ORIGINS = new Set([
  "https://synetairismos-astynomikon.gr",
  "https://www.synetairismos-astynomikon.gr",
  "https://nyxlabs.gr",
  "https://www.nyxlabs.gr",
  "https://3220260.github.io",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:4174",
  "http://127.0.0.1:4174",
  "http://localhost:4175",
  "http://127.0.0.1:4175",
  "http://localhost:5173",
  "http://127.0.0.1:5173"
]);
    const messagesEl = document.getElementById("messages");
    const formEl = document.getElementById("chatForm");
    const inputEl = document.getElementById("chatInput");
    const sendBtn = document.getElementById("sendBtn");
    const charCounterEl = document.getElementById("charCounter");
    const clearBtn = document.getElementById("clearBtn");
    const minBtn = document.getElementById("minBtn");
    const closeBtn = document.getElementById("closeBtn");
    const restoreBtn = document.getElementById("restoreBtn");
    const scrollBtn = document.getElementById("scrollBtn");
    const toastEl = document.getElementById("toast");

    const quickPrompts = [
      "Ποιες προσφορές υπάρχουν;",
      "Τι είναι ο Π.Κ.Σ.Α.Α.;",
      "Πού βρίσκεται ο Συνεταιρισμός;",
      "Ποια είναι τα τηλέφωνα επικοινωνίας;",
      "Τι δικαιολογητικά χρειάζονται;",
      "Πώς κάνω αίτηση;",
      "Πού στέλνω τα έγγραφα;",
      "Έχει προσφορά για internet;"
    ];

    const userId = getOrCreateUserId();
    let messages = [];
    let feedbackByMessage = readFeedbackStorage(FEEDBACK_STORAGE_KEY);
    let messageIdCounter = 0;
    let isSending = false;
    let abortController = null;
    let typingRow = null;
    let activeParentContext = null;

    init();

    function init() {
      setupViewportHeight();
      loadHistory();
      bindEvents();
      autoResizeTextarea();
      updateComposerState();
      requestAnimationFrame(() => scrollToBottom(false));
    }

    function bindEvents() {
      formEl.addEventListener("submit", (event) => {
        event.preventDefault();
        if (isSending) {
          stopCurrentRequest();
          return;
        }
        submitCurrentMessage();
      });

      inputEl.addEventListener("input", () => {
        autoResizeTextarea();
        updateComposerState();
      });

      inputEl.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
        event.preventDefault();
        if (isSending) {
          stopCurrentRequest();
          return;
        }
        submitCurrentMessage();
      });

      clearBtn.addEventListener("click", clearConversation);
      minBtn.addEventListener("click", minimizeChat);
      closeBtn.addEventListener("click", closeChat);
      restoreBtn.addEventListener("click", restoreChat);
      scrollBtn.addEventListener("click", () => scrollToBottom(true));
      messagesEl.addEventListener("scroll", updateScrollButton);

      window.addEventListener("resize", () => {
        setupViewportHeight();
        scrollToBottom(false);
      });

      window.addEventListener("orientationchange", () => {
        setTimeout(() => {
          setupViewportHeight();
          autoResizeTextarea();
          scrollToBottom(false);
        }, 180);
      });

      if (window.visualViewport) {
        const updateViewport = () => {
          setupViewportHeight();
          scrollToBottom(false);
        };

        window.visualViewport.addEventListener("resize", updateViewport);
        window.visualViewport.addEventListener("scroll", updateViewport);
      }

      window.addEventListener("message", (event) => {
        if (!isAllowedMessageOrigin(event.origin)) return;

        const type = getMessageType(event.data);
        if (type === "restoreChat") {
          restoreChat(false);
        }
        if (type === "minimizeChat" || type === "closeChat") {
          minimizeChat(false);
        }
        if (type === "setContext") {
          setParentContext(event.data?.context || null);
        }
        if (type === "clearContext") {
          clearParentContext();
        }
      });
    }

    function normalizeParentContext(context) {
      if (!context || typeof context !== "object") return null;

      const title = typeof context.title === "string" ? context.title.trim() : "";
      const subtitle = typeof context.subtitle === "string" ? context.subtitle.trim() : "";
      const summary = typeof context.summary === "string" ? context.summary.trim() : "";
      const source = typeof context.source === "string" ? context.source.trim() : "";
      const provider = typeof context.provider === "string" ? context.provider.trim() : "";
      const processType = typeof context.processType === "string" ? context.processType.trim() : "";
      const stepTitle = typeof context.stepTitle === "string" ? context.stepTitle.trim() : "";
      const stepIndex = Number.isFinite(Number(context.stepIndex)) ? Number(context.stepIndex) : null;
      const prompts = Array.isArray(context.prompts)
        ? context.prompts.map((prompt) => String(prompt || "").trim()).filter(Boolean).slice(0, 4)
        : [];

      if (!title && !subtitle && !summary && !prompts.length && !provider && !processType && !stepTitle) {
        return null;
      }

      return {
        title,
        subtitle,
        summary,
        source,
        provider,
        processType,
        stepTitle,
        stepIndex,
        prompts,
      };
    }

    function setParentContext(context) {
      const normalized = normalizeParentContext(context);
      activeParentContext = normalized;
      if (messages.length === 0) {
        messagesEl.innerHTML = "";
        if (activeParentContext) {
          renderContextCard();
        }
        renderWelcome();
        scrollToBottom(false);
        return;
      }
      renderContextCard();
    }

    function clearParentContext() {
      activeParentContext = null;
      if (messages.length === 0) {
        messagesEl.innerHTML = "";
        renderWelcome();
        scrollToBottom(false);
        return;
      }
      renderContextCard();
    }

    function getActiveQuickPrompts() {
      if (!activeParentContext?.prompts?.length) return quickPrompts;

      const merged = [...activeParentContext.prompts, ...quickPrompts];
      return [...new Set(merged)];
    }

    function renderContextCard() {
      const existing = messagesEl.querySelector("[data-parent-context-card='true']");
      if (existing) existing.remove();
      if (!activeParentContext) return;

      const card = document.createElement("div");
      card.className = "context-card";
      card.dataset.parentContextCard = "true";

      const badge = document.createElement("div");
      badge.className = "context-card-badge";
      badge.textContent = "Πλαίσιο συνομιλίας";

      const title = document.createElement("p");
      title.className = "context-card-title";
      title.textContent = activeParentContext.title || "Πλαίσιο από την κάρτα";

      const text = document.createElement("p");
      text.className = "context-card-text";
      text.textContent = activeParentContext.summary || "Μπορώ να βοηθήσω με ό,τι αφορά το σημείο από όπου άνοιξες το chat.";

      card.appendChild(badge);
      card.appendChild(title);
      card.appendChild(text);

      if (activeParentContext.prompts.length) {
        const prompts = document.createElement("div");
        prompts.className = "context-card-prompts";

        activeParentContext.prompts.forEach((prompt) => {
          const promptChip = document.createElement("button");
          promptChip.type = "button";
          promptChip.className = "context-card-prompt";
          promptChip.textContent = prompt;
          promptChip.addEventListener("click", () => {
            if (isSending) return;
            inputEl.value = prompt;
            autoResizeTextarea();
            updateComposerState();
            submitCurrentMessage();
          });
          prompts.appendChild(promptChip);
        });

        card.appendChild(prompts);
      }

      messagesEl.prepend(card);
    }

    function setupViewportHeight() {
      const height = window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight;
      document.documentElement.style.setProperty("--visual-height", `${Math.round(height)}px`);
    }

    function createMessageId(role = "msg") {
      messageIdCounter += 1;
      return `${role}_${Date.now().toString(36)}_${messageIdCounter.toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    }

    function normalizeStoredMessage(item) {
      const role = item?.role;
      const content = String(item?.content || "").trim();
      if ((role !== "user" && role !== "assistant") || !content) return null;

      const normalized = {
        id: typeof item?.id === "string" && item.id.trim() ? item.id : createMessageId(role),
        role,
        content
      };

      if (role === "assistant") {
        const suggestedQuestions = normalizeSuggestedQuestions(item?.suggestedQuestions);
        if (suggestedQuestions.length) {
          normalized.suggestedQuestions = suggestedQuestions;
        }
      }

      return normalized;
    }

    function pruneFeedbackStorage() {
      const validIds = new Set(messages.map((message) => message.id).filter(Boolean));
      let changed = false;

      Object.keys(feedbackByMessage).forEach((messageId) => {
        if (!validIds.has(messageId)) {
          delete feedbackByMessage[messageId];
          changed = true;
        }
      });

      if (changed) {
        writeFeedbackStorage(FEEDBACK_STORAGE_KEY, feedbackByMessage);
      }
    }

    function loadHistory() {
      const stored = readStorage(STORAGE_KEY);

      if (stored.length === 0) {
        renderWelcome();
        return;
      }

      messages = stored
        .map(normalizeStoredMessage)
        .filter(Boolean)
        .slice(-MAX_STORED_MESSAGES);

      writeStorage(STORAGE_KEY, messages);
      pruneFeedbackStorage();

      messages.forEach((message) => renderMessage(message.role, message.content, {
        messageId: message.id,
        smooth: false,
        suggestedQuestions: message.suggestedQuestions
      }));
      updateAssistantActionStates();
    }

    function renderWelcome() {
      const wrapper = document.createElement("div");
      wrapper.className = "welcome";

      const kicker = document.createElement("div");
      kicker.className = "welcome-kicker";
      kicker.textContent = activeParentContext ? "Sofia AI assistant · Πλαίσιο καρτέλας" : "Sofia AI assistant";

      const title = document.createElement("h1");
      title.textContent = activeParentContext?.title ? `Πώς μπορώ να βοηθήσω για ${activeParentContext.title};` : "Πώς μπορώ να βοηθήσω;";

      const text = document.createElement("p");
      text.textContent = activeParentContext?.summary
        || "Γεια σας, είμαι η Sofia. Μπορώ να βοηθήσω με προσφορές, δικαιολογητικά, διαδικασίες και στοιχεία επικοινωνίας του Π.Κ.Σ.Α.Α.";

      const prompts = document.createElement("div");
      prompts.className = "quick-prompts";

      getActiveQuickPrompts().forEach((prompt) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "prompt-btn";
        button.textContent = prompt;
        button.addEventListener("click", () => {
          if (isSending) return;
          inputEl.value = prompt;
          autoResizeTextarea();
          updateComposerState();
          submitCurrentMessage();
        });
        prompts.appendChild(button);
      });

      wrapper.appendChild(kicker);
      wrapper.appendChild(title);
      wrapper.appendChild(text);
      wrapper.appendChild(prompts);
      messagesEl.appendChild(wrapper);
    }

    function clearConversation() {
      messages = [];
      feedbackByMessage = {};
      writeStorage(STORAGE_KEY, messages);
      writeFeedbackStorage(FEEDBACK_STORAGE_KEY, feedbackByMessage);
      messagesEl.innerHTML = "";
      if (activeParentContext) {
        renderContextCard();
      }
      renderWelcome();
      scrollToBottom(false);
      showToast("Η συνομιλία καθαρίστηκε");
    }

    async function submitCurrentMessage() {
      const content = inputEl.value.trim();
      if (!content || isSending) return;

      if (content.length > MAX_CHARS) {
        showToast("Το μήνυμα είναι πολύ μεγάλο");
        return;
      }

      const welcome = messagesEl.querySelector(".welcome");
      if (welcome) welcome.remove();

      inputEl.value = "";
      autoResizeTextarea();
      updateComposerState();

      await sendMessage(content);

      if (isTouchDevice()) {
        inputEl.blur();
      }
    }

    async function sendMessage(content, options = {}) {
      const safeContent = String(content || "").trim();
      if (!safeContent || isSending) return;

      const skipUserMessage = Boolean(options.skipUserMessage);
      if (!skipUserMessage) {
        addMessage("user", safeContent);
      }

      showTyping();
      setSending(true);
      abortController = new AbortController();

      try {
        const response = await fetch(API_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: safeContent, userId, context: activeParentContext }),
          signal: abortController.signal
        });

        const data = await response.json().catch(() => ({}));
        removeTyping();

        if (!response.ok) {
          addMessage("assistant", data.error || "Προέκυψε σφάλμα. Δοκιμάστε ξανά.");
          return;
        }

        const suggestedQuestions = normalizeSuggestedQuestions(data.suggestedQuestions);
        const answer = String(data.answer || data.reply || "Δεν βρέθηκε απάντηση.").trim();
        addMessage("assistant", answer || "Δεν βρέθηκε απάντηση.", { suggestedQuestions });
        postToParent("message-sent");
      } catch (error) {
        removeTyping();

        if (error?.name === "AbortError") {
          addTransientAssistant("Η απάντηση διακόπηκε.");
          return;
        }

        addMessage("assistant", "Δεν ήταν δυνατή η σύνδεση. Δοκιμάστε ξανά σε λίγο.");
      } finally {
        abortController = null;
        setSending(false);
        scrollToBottom(true);
      }
    }

    function getLastUserMessage() {
      for (let i = messages.length - 1; i >= 0; i -= 1) {
        if (messages[i]?.role === "user") {
          return String(messages[i].content || "").trim();
        }
      }
      return "";
    }

    async function regenerateLastAssistantReply() {
      if (isSending) {
        showToast("Περιμένετε να ολοκληρωθεί η τρέχουσα απάντηση.");
        return;
      }

      const lastUserMessage = getLastUserMessage();
      if (!lastUserMessage) {
        showToast("Δεν βρέθηκε προηγούμενο μήνυμα για επανάληψη.");
        return;
      }

      await sendMessage(lastUserMessage, { skipUserMessage: true });
    }

    function normalizeSuggestedQuestions(value) {
      if (!Array.isArray(value)) return [];

      return value
        .map((item) => String(item || "").replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .slice(0, 4);
    }

    function addMessage(role, content, options = {}) {
      const messageId = typeof options.messageId === "string" && options.messageId.trim()
        ? options.messageId
        : createMessageId(role);
      const suggestedQuestions = role === "assistant"
        ? normalizeSuggestedQuestions(options.suggestedQuestions)
        : [];

      const message = {
        id: messageId,
        role,
        content: String(content || "").trim()
      };

      if (suggestedQuestions.length) {
        message.suggestedQuestions = suggestedQuestions;
      }

      messages.push(message);
      messages = messages.slice(-MAX_STORED_MESSAGES);
      writeStorage(STORAGE_KEY, messages);
      pruneFeedbackStorage();

      renderMessage(role, content, {
        messageId,
        smooth: true,
        suggestedQuestions
      });
      updateAssistantActionStates();
    }

    function addTransientAssistant(content) {
      renderMessage("assistant", content, { smooth: true });
    }

    function renderMessage(role, content, options = {}) {
      const row = document.createElement("div");
      row.className = `message-row ${role}`;
      if (typeof options.messageId === "string" && options.messageId.trim()) {
        row.dataset.messageId = options.messageId;
      }

      if (role === "assistant") {
        row.appendChild(createAssistantAvatar());
      }

      const bubble = document.createElement("div");
      bubble.className = "bubble";

      if (role === "assistant") {
        bubble.innerHTML = renderMarkdown(content);
      } else {
        bubble.textContent = String(content || "");
      }

      if (role === "assistant") {
        const stack = document.createElement("div");
        stack.className = "assistant-stack";
        stack.appendChild(bubble);

        const assistantActions = createAssistantActions({
          messageId: options.messageId,
          content: String(content || "")
        });
        if (assistantActions) {
          stack.appendChild(assistantActions);
        }

        const suggestedQuestions = normalizeSuggestedQuestions(options.suggestedQuestions);
        if (suggestedQuestions.length) {
          const chips = document.createElement("div");
          chips.className = "suggested-chips";

          suggestedQuestions.forEach((question) => {
            const chip = document.createElement("button");
            chip.type = "button";
            chip.className = "suggested-chip";
            chip.textContent = question;
            chip.addEventListener("click", () => {
              if (isSending) return;
              inputEl.value = question;
              autoResizeTextarea();
              updateComposerState();
              submitCurrentMessage();
            });
            chips.appendChild(chip);
          });

          stack.appendChild(chips);
        }

        row.appendChild(stack);
      } else {
        row.appendChild(bubble);
      }

      messagesEl.appendChild(row);
      updateAssistantActionStates();
      scrollToBottom(options.smooth !== false);
    }

    function createAssistantActions({ messageId, content }) {
      if (typeof messageId !== "string" || !messageId.trim()) return null;

      const actions = document.createElement("div");
      actions.className = "assistant-actions";
      actions.dataset.messageId = messageId;

      const copyBtn = createAssistantActionButton("copy", "Αντιγραφή", "Copy");
      copyBtn.addEventListener("click", () => {
        copyAssistantReply(content);
      });

      const upBtn = createAssistantActionButton("feedback", "Χρήσιμο", "👍");
      upBtn.dataset.feedback = "up";
      upBtn.addEventListener("click", () => {
        setMessageFeedback(actions, messageId, "up", content);
      });

      const downBtn = createAssistantActionButton("feedback", "Μη χρήσιμο", "👎");
      downBtn.dataset.feedback = "down";
      downBtn.addEventListener("click", () => {
        setMessageFeedback(actions, messageId, "down", content);
      });

      const regenerateBtn = createAssistantActionButton("regenerate", "Νέα απάντηση", "↻");
      regenerateBtn.classList.add("regenerate");
      regenerateBtn.addEventListener("click", () => {
        regenerateLastAssistantReply();
      });

      actions.append(copyBtn, upBtn, downBtn, regenerateBtn);
      applyFeedbackState(actions, messageId);
      return actions;
    }

    function createAssistantActionButton(kind, label, text) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `assistant-action ${kind}`;
      button.setAttribute("aria-label", label);
      button.title = label;
      button.textContent = text;
      return button;
    }

    function applyFeedbackState(actions, messageId) {
      const selectedValue = feedbackByMessage[messageId]?.value;
      const upButton = actions.querySelector("[data-feedback='up']");
      const downButton = actions.querySelector("[data-feedback='down']");
      if (upButton) upButton.classList.toggle("active", selectedValue === "up");
      if (downButton) downButton.classList.toggle("active", selectedValue === "down");
    }

    function setMessageFeedback(actions, messageId, value, content) {
      const currentValue = feedbackByMessage[messageId]?.value;
      const nextValue = currentValue === value ? null : value;

      if (!nextValue) {
        delete feedbackByMessage[messageId];
      } else {
        feedbackByMessage[messageId] = {
          value: nextValue,
          contentPreview: String(content || "").slice(0, 180),
          updatedAt: new Date().toISOString()
        };
      }

      writeFeedbackStorage(FEEDBACK_STORAGE_KEY, feedbackByMessage);
      applyFeedbackState(actions, messageId);
      sendFeedback({
        messageId,
        value: nextValue,
        contentPreview: String(content || "").slice(0, 180)
      });
    }

    function sendFeedback(payload) {
      try {
        console.log("SOFIA_FEEDBACK", payload);
      } catch (_) {}
    }

    async function copyAssistantReply(text) {
      const value = String(text || "").trim();
      if (!value) return;

      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(value);
        } else {
          const fallbackSuccess = fallbackCopyText(value);
          if (!fallbackSuccess) throw new Error("copy_fallback_failed");
        }
        showToast("Η απάντηση αντιγράφηκε.");
      } catch (_) {
        showToast("Δεν ήταν δυνατή η αντιγραφή.");
      }
    }

    function fallbackCopyText(value) {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      textarea.style.pointerEvents = "none";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      let copied = false;
      try {
        copied = Boolean(document.execCommand("copy"));
      } catch (_) {
        copied = false;
      }
      textarea.remove();
      return copied;
    }

    function updateAssistantActionStates() {
      const regenerateButtons = messagesEl.querySelectorAll(".assistant-action.regenerate");
      regenerateButtons.forEach((button) => {
        button.hidden = true;
        button.disabled = true;
      });

      const assistantRows = [...messagesEl.querySelectorAll(".message-row.assistant[data-message-id]")];
      const lastAssistantRow = assistantRows[assistantRows.length - 1];
      if (!lastAssistantRow) return;

      const lastRegenerateButton = lastAssistantRow.querySelector(".assistant-action.regenerate");
      if (!lastRegenerateButton) return;

      lastRegenerateButton.hidden = false;
      lastRegenerateButton.disabled = isSending;
    }

  function createAssistantAvatar() {
  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.setAttribute("aria-hidden", "true");
  avatar.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none">
      <rect x="5" y="7" width="14" height="11" rx="4" fill="currentColor" opacity="0.18"></rect>
      <rect x="6.5" y="8.5" width="11" height="8" rx="3.2" stroke="currentColor" stroke-width="1.8"></rect>
      <circle cx="10.2" cy="12.5" r="1.15" fill="currentColor"></circle>
      <circle cx="13.8" cy="12.5" r="1.15" fill="currentColor"></circle>
      <path d="M10 15c.5.38 1.14.6 2 .6.86 0 1.5-.22 2-.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>
      <path d="M12 4.2v2.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
      <circle cx="12" cy="3.2" r="1.1" fill="currentColor"></circle>
      <path d="M6.1 12.2H4.9M19.1 12.2h-1.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>
    </svg>
  `;
  return avatar;
}

    function showTyping() {
      removeTyping();

      const row = document.createElement("div");
      row.className = "message-row assistant";

      const bubble = document.createElement("div");
      bubble.className = "bubble";

      const typing = document.createElement("span");
      typing.className = "typing";
      typing.appendChild(document.createElement("span"));
      typing.appendChild(document.createElement("span"));
      typing.appendChild(document.createElement("span"));

      bubble.appendChild(typing);
      row.appendChild(createAssistantAvatar());
      row.appendChild(bubble);

      typingRow = row;
      messagesEl.appendChild(row);
      scrollToBottom(true);
    }

    function removeTyping() {
      if (!typingRow) return;
      typingRow.remove();
      typingRow = null;
    }

    function setSending(value) {
      isSending = Boolean(value);
      sendBtn.classList.toggle("is-stopping", isSending);
      sendBtn.setAttribute("aria-label", isSending ? "Διακοπή απάντησης" : "Αποστολή");
      updateComposerState();
      updateAssistantActionStates();
    }

    function stopCurrentRequest() {
      if (abortController) {
        abortController.abort();
      }
    }

    function autoResizeTextarea() {
      inputEl.style.height = "auto";
      inputEl.style.overflowY = "hidden";
      const maxHeight = isTouchDevice() ? 150 : 220;
      const nextHeight = Math.min(inputEl.scrollHeight, maxHeight);
      inputEl.style.height = `${nextHeight}px`;
      if (inputEl.scrollHeight > maxHeight) {
        inputEl.style.overflowY = "auto";
      }
    }

    function updateComposerState() {
      const length = inputEl.value.length;
      charCounterEl.textContent = `${length} / ${MAX_CHARS}`;
      charCounterEl.classList.toggle("warn", length > MAX_CHARS * 0.9);
      sendBtn.disabled = !isSending && inputEl.value.trim().length === 0;
    }

    function scrollToBottom(smooth = true) {
      requestAnimationFrame(() => {
        messagesEl.scrollTo({
          top: messagesEl.scrollHeight,
          behavior: smooth ? "smooth" : "auto"
        });
        updateScrollButton();
      });
    }

    function updateScrollButton() {
      const distance = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight;
      scrollBtn.classList.toggle("show", distance > 180);
    }

    function minimizeChat(notifyParent = true) {
      inputEl.blur();
      document.body.classList.add("is-minimized");
      if (notifyParent) {
        postToParent("minimizeChat");
      }
    }

    function closeChat(notifyParent = true) {
      inputEl.blur();
      document.body.classList.add("is-minimized");

      if (notifyParent) {
        postToParent("PKSAA_CHAT_CLOSE");
        postToParent("closeChat");
      }
    }

    function restoreChat(notifyParent = true) {
      document.body.classList.remove("is-minimized");
      if (notifyParent) {
        postToParent("restoreChat");
      }
      setupViewportHeight();
      setTimeout(() => {
        scrollToBottom(false);
        if (!isTouchDevice()) {
          inputEl.focus();
        }
      }, 80);
    }

    function renderMarkdown(text) {
      const source = String(text || "").replace(/\r\n?/g, "\n");
      const placeholders = [];

      let html = escapeHtml(source).replace(/```([\s\S]*?)```/g, (_, code) => {
        const token = `@@CODE_${placeholders.length}@@`;
        placeholders.push(`<pre><code>${code.trim()}</code></pre>`);
        return token;
      });

      html = html
        .replace(/`([^`\n]+)`/g, "<code>$1</code>")
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/\*([^*]+)\*/g, "<em>$1</em>");

      const lines = html.split("\n");
      const output = [];
      let inUl = false;
      let inOl = false;

      const closeLists = () => {
        if (inUl) {
          output.push("</ul>");
          inUl = false;
        }
        if (inOl) {
          output.push("</ol>");
          inOl = false;
        }
      };

      lines.forEach((rawLine) => {
        const line = rawLine.trim();

        if (!line) {
          closeLists();
          return;
        }

        if (/^[-*]\s+/.test(line)) {
          if (!inUl) {
            if (inOl) {
              output.push("</ol>");
              inOl = false;
            }
            output.push("<ul>");
            inUl = true;
          }
          output.push(`<li>${line.replace(/^[-*]\s+/, "")}</li>`);
          return;
        }

        if (/^\d+\.\s+/.test(line)) {
          if (!inOl) {
            if (inUl) {
              output.push("</ul>");
              inUl = false;
            }
            output.push("<ol>");
            inOl = true;
          }
          output.push(`<li>${line.replace(/^\d+\.\s+/, "")}</li>`);
          return;
        }

        closeLists();
        output.push(`<p>${line}</p>`);
      });

      closeLists();

      let rendered = output.join("");
      placeholders.forEach((fragment, index) => {
        rendered = rendered.replace(`@@CODE_${index}@@`, fragment);
      });

      return rendered || "<p></p>";
    }

    function escapeHtml(value) {
      return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    function showToast(message) {
      toastEl.textContent = message;
      toastEl.classList.add("show");
      clearTimeout(showToast.timer);
      showToast.timer = setTimeout(() => toastEl.classList.remove("show"), 1800);
    }

    function isTouchDevice() {
      const isiPadDesktopMode = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
      const coarsePointer = window.matchMedia?.("(pointer: coarse)")?.matches;
      return Boolean(coarsePointer || isiPadDesktopMode || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
    }

    function postToParent(type) {
      try {
        if (window.parent === window) return;
        const targetOrigin = getParentTargetOrigin();
        const payload = { source: "sofia-chat", type };
        if (targetOrigin) {
          window.parent.postMessage(payload, targetOrigin);
          return;
        }
        window.parent.postMessage(payload, "*");
      } catch (_) {}
    }

    function getMessageType(data) {
      if (typeof data === "string") return data;
      if (data && typeof data.type === "string") return data.type;
      return "";
    }

    function isAllowedMessageOrigin(origin) {
      if (!origin || origin === window.location.origin) return true;
      return ALLOWED_PARENT_ORIGINS.has(origin);
    }

    function getRequestedParentOrigin() {
      try {
        const parentOrigin = new URLSearchParams(window.location.search).get("parentOrigin")?.trim();
        if (parentOrigin) {
          const normalizedOrigin = new URL(parentOrigin).origin;
          if (ALLOWED_PARENT_ORIGINS.has(normalizedOrigin)) return normalizedOrigin;
        }
      } catch (_) {}
      return "";
    }

    function getParentTargetOrigin() {
      const requestedParentOrigin = getRequestedParentOrigin();
      if (requestedParentOrigin) return requestedParentOrigin;
      try {
        const referrerOrigin = document.referrer ? new URL(document.referrer).origin : "";
        if (ALLOWED_PARENT_ORIGINS.has(referrerOrigin)) return referrerOrigin;
        if (ALLOWED_PARENT_ORIGINS.has(window.location.origin)) return window.location.origin;
      } catch (_) {}
      return "";
    }

    function getOrCreateUserId() {
      try {
        const saved = localStorage.getItem(USER_ID_KEY);
        if (saved && typeof saved === "string" && saved.trim().length > 0) {
          return saved;
        }

        const generated = `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
        localStorage.setItem(USER_ID_KEY, generated);
        return generated;
      } catch (_) {
        return `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      }
    }

    function readStorage(key) {
      try {
        const parsed = JSON.parse(localStorage.getItem(key) || "[]");
        if (!Array.isArray(parsed)) return [];

        return parsed
          .filter((item) => {
            const role = item?.role;
            const content = item?.content;
            return (role === "user" || role === "assistant") && typeof content === "string" && content.trim().length > 0;
          })
          .slice(-MAX_STORED_MESSAGES);
      } catch (_) {
        return [];
      }
    }

    function readFeedbackStorage(key) {
      try {
        const parsed = JSON.parse(localStorage.getItem(key) || "{}");
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

        const normalized = {};
        Object.entries(parsed).forEach(([messageId, value]) => {
          if (typeof messageId !== "string" || !messageId.trim()) return;
          const feedbackValue = value?.value;
          if (feedbackValue !== "up" && feedbackValue !== "down") return;
          normalized[messageId] = {
            value: feedbackValue,
            contentPreview: String(value?.contentPreview || ""),
            updatedAt: String(value?.updatedAt || "")
          };
        });
        return normalized;
      } catch (_) {
        return {};
      }
    }

    function writeStorage(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (_) {}
    }

    function writeFeedbackStorage(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value || {}));
      } catch (_) {}
    }