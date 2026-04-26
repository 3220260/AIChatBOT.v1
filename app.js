const messagesEl = document.getElementById("chat-messages");
const inputEl = document.getElementById("user-input");
const sendBtn = document.getElementById("send-button");

function getUserId() {
  let id = localStorage.getItem("chat_user_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("chat_user_id", id);
  }
  return id;
}

const userId = getUserId();

function addMessage(text, sender) {
  const wrapper = document.createElement("div");
  wrapper.className = `message ${sender}`;

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.innerText = text;

  wrapper.appendChild(bubble);
  messagesEl.appendChild(wrapper);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function showTyping() {
  const wrapper = document.createElement("div");
  wrapper.className = "message bot typing";
  wrapper.id = "typing";

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  bubble.innerHTML = `<span></span><span></span><span></span>`;
  wrapper.appendChild(bubble);
  messagesEl.appendChild(wrapper);
}

function hideTyping() {
  document.getElementById("typing")?.remove();
}

async function sendMessage() {
  const message = inputEl.value.trim();
  if (!message) return;

  addMessage(message, "user");
  inputEl.value = "";

  showTyping();

  const res = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ message, userId })
  });

  const data = await res.json();

  hideTyping();
  addMessage(data.reply, "bot");
}

sendBtn.onclick = sendMessage;

inputEl.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});