const messagesElement = document.querySelector('#messages');
const welcomeElement = document.querySelector('#welcome');
const composer = document.querySelector('#composer');
const input = document.querySelector('#message-input');
const sendButton = document.querySelector('.send-button');
const fileInput = document.querySelector('#file-input');
const attachmentPreview = document.querySelector('#attachment-preview');
const fileName = document.querySelector('#file-name');
const removeFileButton = document.querySelector('#remove-file');
const attachButton = document.querySelector('#attach-button');
const attachmentMenu = document.querySelector('#attachment-menu');
const chooseFileButton = document.querySelector('#choose-file');
const chooseGoogleButton = document.querySelector('#choose-google');
const linkInputRow = document.querySelector('#link-input-row');
const linkInput = document.querySelector('#link-input');
const linkType = document.querySelector('#link-type');
const removeLinkButton = document.querySelector('#remove-link');
const documentsButton = document.querySelector('#documents-button');
const documentsCount = document.querySelector('#documents-count');
const documentsModal = document.querySelector('#documents-modal');
const documentsList = document.querySelector('#documents-list');
const modalClose = document.querySelector('#modal-close');
const modalBackdrop = document.querySelector('#modal-backdrop');
const updatePopup = document.querySelector('#update-popup');
const updatePopupMessage = document.querySelector('#update-popup-message');
const updateNowButton = document.querySelector('#update-now');
const updateLaterButton = document.querySelector('#update-later');
const checkAllDocumentsButton = document.querySelector('#check-all-documents');
const updateAllDocumentsButton = document.querySelector('#update-all-documents');
const connectionLabel = document.querySelector('#connection-label');
const statusDot = document.querySelector('.status-dot');
const conversationList = document.querySelector('#conversation-list');
const themeToggle = document.querySelector('#theme-toggle');
const conversationsStorageKey = 'docas-conversations';
const activeConversationStorageKey = 'docas-active-conversation';
const themeStorageKey = 'docas-theme';
const documentDataDatabaseName = 'docas-document-data';
const documentDataStoreName = 'documents';
const documentCheckIntervals = { '15m': 15 * 60 * 1000, '1h': 60 * 60 * 1000, '1d': 24 * 60 * 60 * 1000 };
const documentCheckTimers = new Map();
let documentDataDatabasePromise;
let history = [];
let selectedFile = null;
let selectedLink = '';
let sentDocuments = [];
let conversations = loadConversations();
let activeConversationId = localStorage.getItem(activeConversationStorageKey);

function setTheme(theme) {
  const isLight = theme === 'light';
  document.documentElement.dataset.theme = isLight ? 'light' : 'dark';
  themeToggle.textContent = isLight ? '☾' : '☼';
  themeToggle.setAttribute('aria-label', isLight ? 'Bật giao diện tối' : 'Bật giao diện sáng');
  themeToggle.title = isLight ? 'Bật giao diện tối' : 'Bật giao diện sáng';
  document.querySelector('meta[name="theme-color"]').setAttribute('content', isLight ? '#f7f7f2' : '#11110f');
}

setTheme(localStorage.getItem(themeStorageKey));

function loadConversations() {
  try {
    const stored = JSON.parse(localStorage.getItem(conversationsStorageKey) || '[]');
    if (!Array.isArray(stored)) return [];
    return stored.filter((conversation) => conversation && typeof conversation.id === 'string');
  } catch {
    return [];
  }
}

function persistConversations() {
  try {
    localStorage.setItem(conversationsStorageKey, JSON.stringify(conversations));
    localStorage.setItem(activeConversationStorageKey, activeConversationId);
  } catch {
    connectionLabel.textContent = 'Không thể lưu trên thiết bị';
  }
}

function createConversation() {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: 'Cuộc trò chuyện mới',
    history: [],
    sentDocuments: [],
    updatedAt: Date.now(),
  };
}

function getActiveConversation() {
  return conversations.find((conversation) => conversation.id === activeConversationId);
}

function updateConversationTitle(conversation) {
  const firstMessage = conversation.history.find((message) => message.role === 'user');
  if (!firstMessage) {
    conversation.title = 'Cuộc trò chuyện mới';
    return;
  }
  conversation.title = firstMessage.text.split('\n')[0].trim().slice(0, 42) || 'Cuộc trò chuyện mới';
}

function renderConversations() {
  const recentConversations = [...conversations].sort((first, second) => second.updatedAt - first.updatedAt);
  conversationList.replaceChildren(...recentConversations.map((conversation) => {
    const button = document.createElement('button');
    button.className = `conversation${conversation.id === activeConversationId ? ' active' : ''}`;
    button.type = 'button';
    button.dataset.conversationId = conversation.id;
    button.innerHTML = '<span class="conversation-dot"></span><span class="conversation-title"></span><span class="more">•••</span>';
    button.querySelector('.conversation-title').textContent = conversation.title;
    button.addEventListener('click', () => openConversation(conversation.id));
    return button;
  }));
}

function saveActiveConversation() {
  const conversation = getActiveConversation();
  if (!conversation) return;
  conversation.history = history;
  conversation.sentDocuments = sentDocuments;
  conversation.updatedAt = Date.now();
  updateConversationTitle(conversation);
  persistConversations();
  renderConversations();
}

function renderConversationMessages() {
  messagesElement.replaceChildren();
  history.forEach((message) => addMessage(message.role, message.text, false));
  welcomeElement.hidden = history.length > 0;
}

function openConversation(conversationId) {
  const conversation = conversations.find((item) => item.id === conversationId);
  if (!conversation) return;
  activeConversationId = conversation.id;
  history = Array.isArray(conversation.history) ? conversation.history : [];
  sentDocuments = Array.isArray(conversation.sentDocuments) ? conversation.sentDocuments : [];
  selectedFile = null;
  selectedLink = '';
  clearSelectedFile();
  clearSelectedLink();
  renderConversationMessages();
  renderDocuments();
  persistConversations();
  renderConversations();
  input.focus();
}

function startNewConversation() {
  const conversation = createConversation();
  conversations.push(conversation);
  activeConversationId = conversation.id;
  history = [];
  sentDocuments = [];
  clearSelectedFile();
  clearSelectedLink();
  renderConversationMessages();
  renderDocuments();
  persistConversations();
  renderConversations();
  input.focus();
}

function clearSelectedFile() {
  selectedFile = null;
  fileInput.value = '';
  attachmentPreview.hidden = true;
  fileName.textContent = '';
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('Không thể đọc tệp.'));
    reader.readAsDataURL(file);
  });
}

function textToBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function clearSelectedLink() {
  selectedLink = '';
  linkInput.value = '';
  linkInputRow.hidden = true;
}

function setAttachmentMenu(open) {
  attachmentMenu.hidden = !open;
}

function formatCheckTime(timestamp) {
  if (!timestamp) return 'Chưa kiểm tra';
  return `Đã kiểm tra ${new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp))}`;
}

function getDocumentStatusText(itemDocument) {
  if (itemDocument.lastStatus === 'changed') return 'Phát hiện bản cập nhật';
  if (itemDocument.lastStatus === 'error') return itemDocument.lastError || 'Không thể kiểm tra';
  return formatCheckTime(itemDocument.lastCheckedAt);
}

function closeUpdatePopup() {
  updatePopup.hidden = true;
}

function showUpdatePopup(itemDocument) {
  updatePopupMessage.textContent = `"${itemDocument.title}" đã có phiên bản mới. Bạn có muốn cập nhật bản đang lưu không?`;
  updateNowButton.dataset.documentId = itemDocument.id;
  updatePopup.hidden = false;
  updateNowButton.focus();
}

function clearDocumentCheckTimers() {
  documentCheckTimers.forEach((timer) => clearInterval(timer));
  documentCheckTimers.clear();
}

async function updateDocument(itemDocument) {
  try {
    const response = await fetch('/api/document-download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ link: itemDocument.url }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Không thể cập nhật tài liệu.');
    itemDocument.fingerprint = data.fingerprint;
    itemDocument.pendingFingerprint = '';
    itemDocument.notifiedFingerprint = itemDocument.fingerprint;
    itemDocument.lastStatus = 'current';
    saveActiveConversation();
    renderDocuments();
    if (updateNowButton.dataset.documentId === itemDocument.id) closeUpdatePopup();
    await sendMessage(`Tài liệu "${itemDocument.title}" đã được cập nhật. Hãy sử dụng nội dung tài liệu mới này để trả lời các câu hỏi tiếp theo.`, {
      attachment: {
        name: data.filename,
        mimeType: data.mimeType,
        data: textToBase64(data.content),
      },
      includeStoredLink: false,
    });
  } catch (error) {
    itemDocument.lastStatus = 'error';
    itemDocument.lastError = error.message;
    persistConversations();
    renderDocuments();
    return;
  }
}

async function checkAllDocuments() {
  const linkDocuments = sentDocuments.filter((itemDocument) => itemDocument.url);
  await Promise.all(linkDocuments.map((itemDocument) => {
    const statusElement = documentsList.querySelector(`[data-document-id="${itemDocument.id}"] .document-status`);
    return checkDocumentUpdates(itemDocument, statusElement);
  }));
}

async function updateAllDocuments() {
  const linkDocuments = sentDocuments.filter((itemDocument) => itemDocument.url);
  for (const itemDocument of linkDocuments) {
    await updateDocument(itemDocument);
  }
}

async function checkDocumentUpdates(itemDocument, statusElement, { automatic = false } = {}) {
  if (!itemDocument.url || itemDocument.checking) return;
  itemDocument.checking = true;
  if (statusElement) statusElement.textContent = 'Đang kiểm tra...';
  try {
    const response = await fetch('/api/document-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ link: itemDocument.url, fingerprint: itemDocument.fingerprint || undefined }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Không thể kiểm tra tài liệu.');
    itemDocument.lastCheckedAt = data.checkedAt;
    if (data.changed) {
      itemDocument.pendingFingerprint = data.fingerprint;
      itemDocument.lastStatus = 'changed';
      if (automatic && itemDocument.notifiedFingerprint !== data.fingerprint) {
        itemDocument.notifiedFingerprint = data.fingerprint;
        showUpdatePopup(itemDocument);
      }
    } else {
      itemDocument.lastStatus = 'current';
    }
    itemDocument.lastError = '';
  } catch (error) {
    itemDocument.lastStatus = 'error';
    itemDocument.lastError = error.message;
  } finally {
    itemDocument.checking = false;
    if (statusElement) {
      statusElement.textContent = getDocumentStatusText(itemDocument);
      statusElement.classList.toggle('document-status-changed', itemDocument.lastStatus === 'changed');
      statusElement.title = itemDocument.lastStatus === 'error' ? itemDocument.lastError : '';
      const updateButton = statusElement.parentElement.querySelector('.document-update-action');
      if (updateButton) updateButton.hidden = itemDocument.lastStatus !== 'changed';
    }
    persistConversations();
  }
}

function scheduleDocumentChecks() {
  clearDocumentCheckTimers();
  sentDocuments.forEach((itemDocument) => {
    const interval = documentCheckIntervals[itemDocument.checkFrequency];
    if (!itemDocument.url || !interval) return;
    const statusElement = documentsList.querySelector(`[data-document-id="${itemDocument.id}"] .document-status`);
    checkDocumentUpdates(itemDocument, statusElement, { automatic: true });
    const timer = setInterval(() => {
      const currentStatusElement = documentsList.querySelector(`[data-document-id="${itemDocument.id}"] .document-status`);
      checkDocumentUpdates(itemDocument, currentStatusElement, { automatic: true });
    }, interval);
    documentCheckTimers.set(itemDocument.id, timer);
  });
}

function renderDocuments() {
  clearDocumentCheckTimers();
  documentsCount.textContent = sentDocuments.length;
  if (!sentDocuments.length) {
    documentsList.innerHTML = '<div class="empty-documents"><span>◇</span><p>Chưa có tài liệu nào</p><small>Tệp và liên kết bạn gửi sẽ xuất hiện ở đây.</small></div>';
    return;
  }
  documentsList.replaceChildren(...sentDocuments.map((itemDocument, index) => {
    itemDocument.id ||= `document-${Date.now()}-${index}`;
    const item = document.createElement('article');
    item.className = 'document-item';
    item.dataset.documentId = itemDocument.id;
    const symbol = document.createElement('div');
    symbol.className = 'document-symbol';
    symbol.textContent = itemDocument.kind === 'link' ? '↗' : '⌁';
    const info = document.createElement('div');
    info.className = 'document-info';
    const title = document.createElement('strong');
    title.textContent = itemDocument.title;
    const meta = document.createElement('span');
    meta.textContent = `${itemDocument.kind === 'link' ? 'Liên kết' : 'Tệp đính kèm'} · ${itemDocument.name || 'Google document'}`;
    info.append(title, meta);
    item.append(symbol, info);
    if (itemDocument.url) {
      const link = document.createElement('a');
      link.href = itemDocument.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'Mở ↗';
      link.setAttribute('aria-label', `Mở ${itemDocument.title}`);
      item.append(link);
    }
    if (itemDocument.url) {
      const monitor = document.createElement('div');
      monitor.className = 'document-monitor';
      const monitorLabel = document.createElement('label');
      monitorLabel.textContent = 'Kiểm tra cập nhật';
      monitorLabel.htmlFor = `${itemDocument.id}-frequency`;
      const frequency = document.createElement('select');
      frequency.id = `${itemDocument.id}-frequency`;
      frequency.className = 'document-frequency';
      frequency.innerHTML = '<option value="off">Tắt</option><option value="15m">Mỗi 15 phút</option><option value="1h">Mỗi giờ</option><option value="1d">Mỗi ngày</option>';
      frequency.value = itemDocument.checkFrequency || 'off';
      frequency.addEventListener('change', () => {
        itemDocument.checkFrequency = frequency.value;
        itemDocument.lastStatus = 'unchecked';
        persistConversations();
        renderDocuments();
        if (frequency.value !== 'off') {
          checkDocumentUpdates(itemDocument, document.querySelector(`[data-document-id="${itemDocument.id}"] .document-status`));
        }
      });
      const status = document.createElement('small');
      status.className = 'document-status';
      status.textContent = getDocumentStatusText(itemDocument);
      monitor.append(monitorLabel, frequency, status);
      const checkNow = document.createElement('button');
      checkNow.type = 'button';
      checkNow.className = 'document-action';
      checkNow.textContent = 'Kiểm tra ngay';
      checkNow.addEventListener('click', () => checkDocumentUpdates(itemDocument, status));
      const updateNow = document.createElement('button');
      updateNow.type = 'button';
      updateNow.className = 'document-action document-update-action';
      updateNow.textContent = 'Cập nhật ngay';
      updateNow.hidden = itemDocument.lastStatus !== 'changed';
      updateNow.addEventListener('click', () => updateDocument(itemDocument));
      monitor.append(checkNow, updateNow);
      item.append(monitor);
    }
    return item;
  }));
  scheduleDocumentChecks();
}

function setDocumentsModal(open) {
  documentsModal.hidden = !open;
  if (open) modalClose.focus();
}

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[character]);
}

function renderInlineMarkdown(value) {
  const codeTokens = [];
  const escaped = escapeHtml(value).replace(/`([^`\n]+)`/g, (_, code) => {
    const token = `@@CODE${codeTokens.length}@@`;
    codeTokens.push(`<code>${code}</code>`);
    return token;
  });
  const linked = escaped.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  const formatted = linked
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>')
    .replace(/(?<!_)_([^_\n]+)_(?!_)/g, '<em>$1</em>');
  return formatted.replace(/@@CODE(\d+)@@/g, (_, index) => codeTokens[index]);
}

function renderMarkdown(value) {
  const lines = value.replace(/\r\n?/g, '\n').split('\n');
  const html = [];
  let paragraph = [];
  let listType = null;
  let codeLines = null;

  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  };
  const flushParagraph = () => {
    if (paragraph.length) {
      html.push(`<p>${paragraph.map(renderInlineMarkdown).join('<br>')}</p>`);
      paragraph = [];
    }
  };

  for (const line of lines) {
    const fence = line.match(/^\s*```(?:[\w+-]+)?\s*$/);
    if (fence) {
      flushParagraph();
      closeList();
      if (codeLines) {
        html.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
        codeLines = null;
      } else {
        codeLines = [];
      }
      continue;
    }
    if (codeLines) {
      codeLines.push(line);
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      closeList();
      continue;
    }
    const heading = line.match(/^\s*(#{1,3})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }
    if (/^\s*(?:---+|\*\s*\*\s*\*|___+)\s*$/.test(line)) {
      flushParagraph();
      closeList();
      html.push('<hr>');
      continue;
    }
    const listItem = line.match(/^\s*([-*+]\s+|\d+[.)]\s+)(.+)$/);
    if (listItem) {
      flushParagraph();
      const nextListType = /^\d/.test(listItem[1]) ? 'ol' : 'ul';
      if (listType !== nextListType) {
        closeList();
        listType = nextListType;
        html.push(`<${listType}>`);
      }
      html.push(`<li>${renderInlineMarkdown(listItem[2])}</li>`);
      continue;
    }
    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) {
      flushParagraph();
      closeList();
      html.push(`<blockquote>${renderInlineMarkdown(quote[1])}</blockquote>`);
      continue;
    }
    closeList();
    paragraph.push(line);
  }

  if (codeLines) html.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
  flushParagraph();
  closeList();
  return html.join('');
}

function addMessage(role, text, shouldScroll = true) {
  const message = document.createElement('article');
  message.className = `message ${role}`;
  message.innerHTML = role === 'assistant'
    ? `<div class="avatar">✦</div><div class="message-body"><div class="message-label">Docas</div><div class="message-text"></div></div>`
    : '<div class="message-body"><div class="message-text"></div></div>';
  const messageText = message.querySelector('.message-text');
  if (role === 'assistant') messageText.innerHTML = renderMarkdown(text);
  else messageText.textContent = text;
  messagesElement.append(message);
  if (shouldScroll) message.scrollIntoView({ behavior: 'smooth', block: 'end' });
  return message;
}

function addTyping() {
  const message = document.createElement('article');
  message.className = 'message assistant';
  message.innerHTML = '<div class="avatar">✦</div><div class="message-body"><div class="message-label">Docas</div><div class="typing"><i></i><i></i><i></i></div></div>';
  messagesElement.append(message);
  message.scrollIntoView({ behavior: 'smooth', block: 'end' });
  return message;
}

async function checkConfig() {
  try {
    const response = await fetch('/api/config');
    const config = await response.json();
    if (config.configured) {
      connectionLabel.textContent = 'OpenRouter đã kết nối';
      statusDot.classList.add('ready');
    } else {
      connectionLabel.textContent = 'Chờ API key';
    }
  } catch {
    connectionLabel.textContent = 'Server ngoại tuyến';
  }
}

async function sendMessage(text, options = {}) {
  const message = text.trim();
  const file = options.attachment || selectedFile;
  const newLink = options.link ?? selectedLink.trim();
  const storedLink = [...sentDocuments].reverse().find((itemDocument) => itemDocument.url)?.url || '';
  const link = newLink || (options.includeStoredLink === false ? '' : storedLink);
  const storedFileDocument = !file && options.includeStoredLink !== false
    ? [...sentDocuments].reverse().find((itemDocument) => itemDocument.kind === 'file' && itemDocument.id)
    : null;
  const storedFile = storedFileDocument ? await getDocumentData(storedFileDocument.id) : null;
  const contextFile = file || storedFile;
  if ((!message && !contextFile && !link) || sendButton.disabled) return;
  welcomeElement.hidden = true;
  const visibleMessage = `${message || 'Hãy phân tích nội dung đính kèm.'}${file ? `\n\n📎 ${file.name}` : ''}${newLink ? `\n\n🔗 ${newLink}` : ''}`;
  const userMessageElement = addMessage('user', visibleMessage);
  input.value = '';
  input.style.height = 'auto';
  clearSelectedFile();
  clearSelectedLink();
  sendButton.disabled = true;
  const typing = addTyping();
  try {
    const attachment = contextFile
      ? (contextFile.data ? contextFile : { name: contextFile.name, mimeType: contextFile.type, data: await readFileAsBase64(contextFile) })
      : undefined;
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: message || 'Hãy phân tích nội dung đính kèm.', history, attachment, link: link || undefined }),
    });
    const data = await response.json();
    typing.remove();
    if (!response.ok) throw new Error(data.error || 'Không thể gửi tin nhắn.');
    if (newLink && data.linkTitle) {
      userMessageElement.querySelector('.message-text').textContent = `${message || 'Hãy phân tích nội dung đính kèm.'}${file ? `\n\n📎 ${file.name}` : ''}\n\n🔗 ${data.linkTitle}`;
    }
    let fileDocument = null;
    if (file) {
      fileDocument = { kind: 'file', title: file.name, name: file.type || 'Tệp' };
      sentDocuments.push(fileDocument);
    }
    if (newLink && !sentDocuments.some((itemDocument) => itemDocument.url === newLink)) {
      sentDocuments.push({ kind: 'link', title: data.linkTitle || 'Liên kết tài liệu', name: newLink, url: newLink, fingerprint: data.linkFingerprint, fingerprintFormat: 'text-v1', checkFrequency: 'off', lastStatus: 'unchecked' });
    }
    renderDocuments();
    if (fileDocument && attachment) await saveDocumentData(fileDocument.id, attachment);
    addMessage('assistant', data.answer);
    history.push({ role: 'user', text: visibleMessage }, { role: 'assistant', text: data.answer });
    saveActiveConversation();
  } catch (error) {
    typing.remove();
    addMessage('assistant', `Mình chưa thể trả lời lúc này: ${error.message}`);
  } finally {
    sendButton.disabled = false;
    input.focus();
  }
}

composer.addEventListener('submit', (event) => { event.preventDefault(); sendMessage(input.value); });
input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 150)}px`; });
input.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); composer.requestSubmit(); } });
document.querySelectorAll('[data-prompt]').forEach((button) => button.addEventListener('click', () => { input.value = button.dataset.prompt; input.focus(); composer.requestSubmit(); }));
fileInput.addEventListener('change', () => {
  const [file] = fileInput.files;
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) {
    addMessage('assistant', 'Tệp quá lớn. Vui lòng chọn tệp nhỏ hơn 10 MB.');
    clearSelectedFile();
    return;
  }
  selectedFile = file;
  fileName.textContent = file.name;
  attachmentPreview.hidden = false;
  input.focus();
});
removeFileButton.addEventListener('click', clearSelectedFile);
attachButton.addEventListener('click', () => setAttachmentMenu(attachmentMenu.hidden));
chooseFileButton.addEventListener('click', () => { setAttachmentMenu(false); fileInput.click(); });
chooseGoogleButton.addEventListener('click', () => { setAttachmentMenu(false); linkInputRow.hidden = false; linkInput.focus(); });
removeLinkButton.addEventListener('click', clearSelectedLink);
linkInput.addEventListener('input', () => { selectedLink = linkInput.value; });
linkType.addEventListener('change', () => { linkInput.placeholder = `Dán liên kết ${linkType.value === 'document' ? 'Google Docs' : 'Google Sheets'}...`; });
document.addEventListener('click', (event) => { if (!attachmentMenu.contains(event.target) && event.target !== attachButton) setAttachmentMenu(false); });
document.querySelector('#new-chat').addEventListener('click', startNewConversation);
document.querySelector('#clear-chat').addEventListener('click', async () => {
  await deleteDocumentData(sentDocuments.map((itemDocument) => itemDocument.id).filter(Boolean));
  history = [];
  sentDocuments = [];
  clearSelectedFile();
  clearSelectedLink();
  renderConversationMessages();
  renderDocuments();
  saveActiveConversation();
});
themeToggle.addEventListener('click', () => {
  const nextTheme = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  setTheme(nextTheme);
  localStorage.setItem(themeStorageKey, nextTheme);
});
documentsButton.addEventListener('click', () => setDocumentsModal(true));
modalClose.addEventListener('click', () => setDocumentsModal(false));
modalBackdrop.addEventListener('click', () => setDocumentsModal(false));
updateLaterButton.addEventListener('click', closeUpdatePopup);
updatePopup.querySelector('.update-popup-backdrop').addEventListener('click', closeUpdatePopup);
updateNowButton.addEventListener('click', () => {
  const itemDocument = sentDocuments.find((item) => item.id === updateNowButton.dataset.documentId);
  if (itemDocument) updateDocument(itemDocument);
});
checkAllDocumentsButton.addEventListener('click', async () => {
  checkAllDocumentsButton.disabled = true;
  checkAllDocumentsButton.textContent = 'Đang kiểm tra...';
  try {
    await checkAllDocuments();
  } finally {
    checkAllDocumentsButton.disabled = false;
    checkAllDocumentsButton.textContent = 'Kiểm tra cập nhật ngay';
  }
});
updateAllDocumentsButton.addEventListener('click', async () => {
  updateAllDocumentsButton.disabled = true;
  updateAllDocumentsButton.textContent = 'Đang cập nhật...';
  try {
    await updateAllDocuments();
  } finally {
    updateAllDocumentsButton.disabled = false;
    updateAllDocumentsButton.textContent = 'Cập nhật ngay toàn bộ';
  }
});
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') setDocumentsModal(false); });
if (!conversations.length) conversations.push(createConversation());
if (!conversations.some((conversation) => conversation.id === activeConversationId)) {
  activeConversationId = [...conversations].sort((first, second) => second.updatedAt - first.updatedAt)[0].id;
}
openConversation(activeConversationId);
checkConfig();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
}

function openDocumentDataDatabase() {
  if (documentDataDatabasePromise) return documentDataDatabasePromise;
  documentDataDatabasePromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB không khả dụng trên thiết bị này.'));
      return;
    }
    const request = indexedDB.open(documentDataDatabaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(documentDataStoreName, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Không thể mở kho dữ liệu tài liệu.'));
  });
  return documentDataDatabasePromise;
}

async function saveDocumentData(documentId, data) {
  if (!documentId || !data?.data) return;
  try {
    const database = await openDocumentDataDatabase();
    await new Promise((resolve, reject) => {
      const request = database.transaction(documentDataStoreName, 'readwrite')
        .objectStore(documentDataStoreName)
        .put({ id: documentId, name: data.name, mimeType: data.mimeType, data: data.data });
      request.onsuccess = resolve;
      request.onerror = () => reject(request.error);
    });
  } catch {
    connectionLabel.textContent = 'Không thể lưu nội dung tài liệu';
  }
}

async function getDocumentData(documentId) {
  if (!documentId) return null;
  try {
    const database = await openDocumentDataDatabase();
    return await new Promise((resolve, reject) => {
      const request = database.transaction(documentDataStoreName, 'readonly')
        .objectStore(documentDataStoreName)
        .get(documentId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

async function deleteDocumentData(documentIds) {
  if (!documentIds.length) return;
  try {
    const database = await openDocumentDataDatabase();
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(documentDataStoreName, 'readwrite');
      const store = transaction.objectStore(documentDataStoreName);
      documentIds.forEach((documentId) => store.delete(documentId));
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
  } catch {
    // localStorage data remains authoritative if IndexedDB is unavailable.
  }
}