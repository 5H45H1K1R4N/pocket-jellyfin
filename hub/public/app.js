// KHURE HOME SERVER — Frontend Interactions with Real-Time WebSockets

let ws;
const state = {
  currentChannel: 'home',
  username: prompt("Welcome to KHURE HOME SERVER! What's your username? (Type 'admin' for the owner profile)") || "Anonymous",
  onlineUsers: []
};

const channels = document.querySelectorAll('.channel');
const chatArea = document.querySelector('.chat-area');
const membersList = document.querySelector('.members-list');

function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${window.location.host}`);
  
  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'join', username: state.username }));
    if (state.currentChannel === 'general-chat') {
      ws.send(JSON.stringify({ type: 'get_history' }));
    }
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'presence') {
      state.onlineUsers = msg.data;
      renderMembers();
      if (state.currentChannel === 'minecraft-server') renderMinecraftPlayers();
    } else if (msg.type === 'history') {
      if (state.currentChannel === 'general-chat') renderChatHistory(msg.data);
    } else if (msg.type === 'chat') {
      if (state.currentChannel === 'general-chat') appendChatMessage(msg.data);
    }
  };
}

function formatTime(isoString) {
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function renderMembers() {
  const onlineCount = state.onlineUsers.length;
  let html = `<div class="members-category">Online — ${onlineCount}</div>`;
  
  state.onlineUsers.forEach(user => {
    const isAdmin = user.role === 'admin';
    const initial = user.username.charAt(0).toUpperCase();
    const bgColor = isAdmin ? '#f04747' : '#23a55a';
    
    html += `
      <div class="member ${isAdmin ? 'admin-member' : ''}">
        ${isAdmin ? '<div class="member-banner"></div>' : ''}
        <div class="member-content">
          <div class="member-avatar-wrap">
            <div class="user-avatar" style="width:100%;height:100%;border-radius:50%;background:${bgColor};display:flex;align-items:center;justify-content:center;color:white;">${initial}</div>
            <div class="status-dot online"></div>
          </div>
          <div class="member-info">
            <div class="member-name">${user.username} ${isAdmin ? '<span class="crown">👑</span>' : ''}</div>
            <div class="member-status">${user.status}</div>
          </div>
        </div>
      </div>
    `;
  });
  membersList.innerHTML = html;
}

const VIEWS = {
  'home': `
    <div class="top-bar">
      <div class="top-bar-left"><span class="ch-hash">#</span><h2>home</h2></div>
    </div>
    <div class="messages" style="padding: 32px; justify-content: flex-start;">
      <h1 style="color: white; margin-bottom: 24px; font-size: 28px;">Server Dashboard</h1>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px;">
        <div style="background: #2b2d31; padding: 20px; border-radius: 8px; border-top: 4px solid var(--brand-color);">
          <h3 style="color: white; margin-bottom: 12px; font-size: 16px;">🖥️ System Status</h3>
          <div style="color: var(--text-normal); font-size: 14px; line-height: 1.8;">
            <div style="display: flex; justify-content: space-between;"><strong>CPU Usage:</strong> <span style="color: #23a55a;" id="sys-cpu">Loading...</span></div>
            <div style="display: flex; justify-content: space-between;"><strong>RAM Usage:</strong> <span id="sys-ram">Loading...</span></div>
            <div style="display: flex; justify-content: space-between;"><strong>Server Uptime:</strong> <span id="sys-uptime">Loading...</span></div>
          </div>
        </div>
        <div style="background: #2b2d31; padding: 20px; border-radius: 8px; border-top: 4px solid #f0b232;">
          <h3 style="color: white; margin-bottom: 12px; font-size: 16px;">🌐 Network</h3>
          <div style="color: var(--text-normal); font-size: 14px; line-height: 1.8;">
            <div style="display: flex; justify-content: space-between;"><strong>Local IP:</strong> <span>192.168.31.178</span></div>
            <div style="display: flex; justify-content: space-between;"><strong>Active Connections:</strong> <span id="sys-connections">Loading...</span></div>
          </div>
        </div>
      </div>
      <h3 style="color: white; margin-bottom: 16px; font-size: 18px;">Quick Shortcuts</h3>
      <div style="display: flex; gap: 16px;">
        <button class="discord-btn" onclick="navigate('movies-and-tv')" style="flex: 1; padding: 16px; font-size: 16px; display: flex; flex-direction: column; align-items: center; gap: 8px; background: #232428; border: 1px solid #1e1f22;"><span style="font-size: 24px;">🎬</span><span>Jellyfin Media</span></button>
        <button class="discord-btn" onclick="navigate('file-drop')" style="flex: 1; padding: 16px; font-size: 16px; display: flex; flex-direction: column; align-items: center; gap: 8px; background: #232428; border: 1px solid #1e1f22;"><span style="font-size: 24px;">📁</span><span>File Drop</span></button>
        <button class="discord-btn" onclick="navigate('minecraft-server')" style="flex: 1; padding: 16px; font-size: 16px; display: flex; flex-direction: column; align-items: center; gap: 8px; background: #232428; border: 1px solid #1e1f22;"><span style="font-size: 24px;">⛏️</span><span>Minecraft Server</span></button>
      </div>
    </div>
  `,
  'general-chat': `
    <div class="top-bar">
      <div class="top-bar-left"><span class="ch-hash">#</span><h2>general-chat</h2></div>
    </div>
    <div class="messages" id="chat-messages" style="overflow-y: auto;">
      <div class="welcome-message">
        <div class="welcome-icon">#</div>
        <h1>Welcome to #general-chat!</h1>
        <p>This is the start of the real-time chat channel.</p>
      </div>
    </div>
    <div class="chat-input-area">
      <div class="chat-input">
        <input type="text" id="chat-input-box" placeholder="Message #general-chat" autocomplete="off" style="margin-left: 16px;">
      </div>
    </div>
  `,
  'movies-and-tv': `
    <div class="top-bar">
      <div class="top-bar-left"><span class="ch-hash">#</span><h2>movies-and-tv</h2></div>
    </div>
    <div class="messages" style="padding: 0; justify-content: flex-start; overflow-y: auto;">
      <div style="background: linear-gradient(135deg, #1f1235 0%, #0d0614 100%); padding: 64px 32px; text-align: center; border-bottom: 1px solid #1f2023;">
        <h1 style="color: #00a4dc; font-size: 40px; margin-bottom: 16px; font-weight: 800; letter-spacing: -1px;">Jellyfin Media Server</h1>
        <p style="color: var(--text-normal); font-size: 18px; margin-bottom: 32px; max-width: 500px; margin-inline: auto; line-height: 1.5;">Stream your entire collection of movies, TV shows, and music from anywhere on the network.</p>
        <button class="discord-btn" style="background: #00a4dc; color: white; padding: 16px 40px; font-size: 18px; border-radius: 30px; font-weight: bold; box-shadow: 0 8px 16px rgba(0, 164, 220, 0.2);" onclick="window.open('http://192.168.31.178:8096')">▶ Launch Web Player</button>
      </div>
      <div style="padding: 32px;">
        <p style="color: var(--text-muted); text-align: center; margin-top: 20px;">Media library preview disabled. Please launch Jellyfin to view your library.</p>
      </div>
    </div>
  `,
  'file-drop': `
    <div class="top-bar">
      <div class="top-bar-left"><span class="ch-hash">#</span><h2>file-drop</h2></div>
    </div>
    <div class="messages" style="padding: 32px; justify-content: flex-start; overflow-y: auto;">
      <h2 style="color: white; margin-bottom: 24px; font-size: 28px;">File Drop & Storage</h2>
      <div class="drop-zone" id="in-page-dropzone" style="border: 2px dashed #5865F2; border-radius: 12px; padding: 48px; text-align: center; background: rgba(88,101,242,0.05); margin-bottom: 32px; cursor: pointer;">
        <div style="font-size: 48px; margin-bottom: 16px;">📤</div>
        <h3 style="color: white; margin-bottom: 8px; font-size: 20px;">Drag & Drop Files Here</h3>
        <p style="color: var(--text-muted);">Files will be securely saved to the server</p>
      </div>
      <h3 style="color: white; margin-bottom: 16px; font-size: 18px;">Recently Uploaded Files</h3>
      <div style="background: #2b2d31; border-radius: 8px; overflow: hidden; border: 1px solid #1e1f22;">
        <div style="display: flex; align-items: center; padding: 12px 16px; background: #232428;">
          <div style="flex: 1; color: var(--text-muted); font-size: 12px; font-weight: 700; text-transform: uppercase;">File Name</div>
          <div style="width: 100px; color: var(--text-muted); font-size: 12px; font-weight: 700; text-transform: uppercase;">Size</div>
          <div style="width: 100px; color: var(--text-muted); font-size: 12px; font-weight: 700; text-transform: uppercase;">Action</div>
        </div>
        <div id="file-list-container">
          <div style="padding: 16px; color: var(--text-muted); text-align: center;">Loading files...</div>
        </div>
      </div>
    </div>
  `,
  'minecraft-server': `
    <div class="top-bar">
      <div class="top-bar-left"><span class="ch-hash">#</span><h2>minecraft-server</h2></div>
    </div>
    <div class="messages" style="padding: 32px; justify-content: flex-start; overflow-y: auto; background: linear-gradient(180deg, rgba(35,165,90,0.03) 0%, transparent 400px);">
      <div style="display: flex; align-items: center; gap: 24px; margin-bottom: 32px;">
        <div style="width: 96px; height: 96px; border-radius: 16px; background: #4e5058; display: flex; align-items: center; justify-content: center; font-size: 48px; box-shadow: 0 8px 16px rgba(0,0,0,0.2);">🟩</div>
        <div>
          <h1 style="color: white; font-size: 36px; margin-bottom: 8px; font-weight: 800;">MineLok smp</h1>
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="width: 12px; height: 12px; border-radius: 50%; background: #23a55a; box-shadow: 0 0 10px #23a55a;"></div>
            <span style="color: #23a55a; font-weight: 700; font-size: 16px;">Server is Online</span>
          </div>
        </div>
      </div>
      <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 24px;">
        <div style="background: #2b2d31; padding: 24px; border-radius: 12px; border: 1px solid #1e1f22;">
          <h3 style="color: var(--text-muted); font-size: 13px; text-transform: uppercase; margin-bottom: 16px; font-weight: 800;">Connection Info</h3>
          <div style="background: #1e1f22; padding: 16px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border: 1px solid #111214;">
            <code style="color: #23a55a; font-size: 18px; font-family: monospace; font-weight: bold;">192.168.31.178:25565</code>
            <button class="discord-btn" style="background: #5865F2; padding: 8px 16px; font-weight: bold;" onclick="alert('IP Copied to clipboard!')">Copy IP</button>
          </div>
          <div style="color: var(--text-normal); font-size: 15px; line-height: 1.8;">
            <div style="display: flex; justify-content: space-between;"><strong>Server Version:</strong> <span>Java Edition 1.20.4 (PaperMC)</span></div>
          </div>
        </div>
        <div style="background: #2b2d31; padding: 24px; border-radius: 12px; border: 1px solid #1e1f22;">
          <h3 style="color: var(--text-muted); font-size: 13px; text-transform: uppercase; margin-bottom: 16px; font-weight: 800;">Players Online</h3>
          <div id="minecraft-players-list" style="display: flex; flex-direction: column; gap: 12px;">
            <div style="color: var(--text-muted);">Fetching players...</div>
          </div>
        </div>
      </div>
    </div>
  `
};

// Data Fetchers
async function fetchStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    document.getElementById('sys-cpu').innerText = data.cpuLoad.toFixed(2) + '%';
    document.getElementById('sys-ram').innerText = data.memUsed + 'GB / ' + data.memTotal + 'GB';
    const hours = Math.floor(data.uptime / 3600);
    const minutes = Math.floor((data.uptime % 3600) / 60);
    document.getElementById('sys-uptime').innerText = hours + 'h ' + minutes + 'm';
    document.getElementById('sys-connections').innerText = state.onlineUsers.length + ' active hub users';
  } catch (e) {
    console.error(e);
  }
}

async function fetchFiles() {
  try {
    const res = await fetch('/api/files');
    const files = await res.json();
    const container = document.getElementById('file-list-container');
    if (!container) return;
    
    if (files.length === 0) {
      container.innerHTML = '<div style="padding: 16px; color: var(--text-muted);">No files uploaded yet. Drag files into the window to upload!</div>';
      return;
    }
    
    let html = '';
    files.forEach(f => {
      const sizeMB = (f.size / 1024 / 1024).toFixed(2);
      html += `
        <div style="display: flex; align-items: center; padding: 12px 16px; border-top: 1px solid #1e1f22;">
          <div style="flex: 1; color: var(--text-normal); display: flex; align-items: center; gap: 12px; font-weight: 500;"><span style="font-size: 20px;">📄</span> ${f.name}</div>
          <div style="width: 100px; color: var(--text-muted); font-size: 13px;">${sizeMB} MB</div>
          <div style="width: 100px;"><a href="/uploads/${encodeURIComponent(f.name)}" download class="discord-btn" style="padding: 6px 12px; font-size: 12px; background: #4e5058; text-decoration: none; display: inline-block;">Download</a></div>
        </div>
      `;
    });
    container.innerHTML = html;
  } catch (e) {
    console.error(e);
  }
}

function renderMinecraftPlayers() {
  const container = document.getElementById('minecraft-players-list');
  if (!container) return;
  if (state.onlineUsers.length === 0) {
    container.innerHTML = '<div style="color: var(--text-muted);">No players online.</div>';
    return;
  }
  let html = '';
  state.onlineUsers.forEach(u => {
    html += `
      <div style="display: flex; align-items: center; gap: 12px; color: var(--text-normal); background: #232428; padding: 8px 12px; border-radius: 6px;">
        <div style="width: 24px; height: 24px; background: #5865F2; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; color: white;">${u.username.charAt(0).toUpperCase()}</div> 
        <strong>${u.username}</strong>
      </div>
    `;
  });
  container.innerHTML = html;
}

// Chat functions
function renderChatHistory(messages) {
  const container = document.getElementById('chat-messages');
  if (!container) return;
  const welcome = container.querySelector('.welcome-message').outerHTML;
  container.innerHTML = welcome;
  messages.forEach(msg => appendChatMessage(msg, false));
  scrollToBottom();
}

function appendChatMessage(msg, scroll = true) {
  const container = document.getElementById('chat-messages');
  if (!container) return;
  const isAdmin = msg.role === 'admin';
  const nameColor = isAdmin ? '#f47fff' : '#23a55a';
  const initial = msg.author.charAt(0).toUpperCase();

  const msgHtml = `
    <div style="display: flex; margin-top: 16px; padding: 2px 16px;">
      <div style="width: 40px; height: 40px; border-radius: 50%; background: ${isAdmin ? '#f04747' : '#5865F2'}; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; margin-right: 16px; flex-shrink: 0;">${initial}</div>
      <div>
        <div>
          <span style="color: ${nameColor}; font-weight: 500; font-size: 15px;">${msg.author}</span>
          <span style="color: var(--text-muted); font-size: 12px; margin-left: 4px;">${formatTime(msg.timestamp)}</span>
        </div>
        <div style="color: var(--text-normal); font-size: 15px; margin-top: 2px; line-height: 1.4;">${msg.text}</div>
      </div>
    </div>
  `;
  container.insertAdjacentHTML('beforeend', msgHtml);
  if (scroll) scrollToBottom();
}

function scrollToBottom() {
  const container = document.getElementById('chat-messages');
  if (container) container.scrollTop = container.scrollHeight;
}

function navigate(channelId) {
  state.currentChannel = channelId;
  channels.forEach(ch => {
    if (ch.dataset.id === channelId) ch.classList.add('active');
    else ch.classList.remove('active');
  });

  chatArea.innerHTML = VIEWS[channelId] || VIEWS['home'];

  if (channelId === 'home') fetchStatus();
  if (channelId === 'file-drop') fetchFiles();
  if (channelId === 'minecraft-server') renderMinecraftPlayers();

  if (channelId === 'general-chat') {
    const input = document.getElementById('chat-input-box');
    if (input) {
      input.onkeydown = (e) => {
        if (e.key === 'Enter' && input.value.trim() !== '') {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'chat', text: input.value.trim() }));
            input.value = '';
          }
        }
      };
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'get_history' }));
    }
  }
}

// Actual File Upload via Drop
async function handleFilesDrop(files) {
  const container = document.getElementById('file-list-container');
  if (container) container.innerHTML = '<div style="padding: 16px; color: #23a55a;">Uploading ' + files.length + ' file(s)...</div>';
  
  for (const file of files) {
    await fetch('/api/upload?filename=' + encodeURIComponent(file.name), {
      method: 'POST',
      body: file
    });
  }
  
  if (state.currentChannel === 'file-drop') fetchFiles();
}

function initDragDrop() {
  const overlay = document.getElementById('drop-overlay');
  if (!overlay) return;
  let dragCount = 0;

  window.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCount++;
    if (dragCount === 1) overlay.style.display = 'flex';
  });

  window.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dragCount--;
    if (dragCount <= 0) {
      dragCount = 0;
      overlay.style.display = 'none';
    }
  });

  window.addEventListener('dragover', e => e.preventDefault());

  window.addEventListener('drop', (e) => {
    e.preventDefault();
    dragCount = 0;
    overlay.style.display = 'none';
    
    if (e.dataTransfer.files.length > 0) {
      if (state.currentChannel !== 'file-drop') navigate('file-drop');
      handleFilesDrop(e.dataTransfer.files);
    }
  });
}

// Modal Logic
function initModal() {
  const serverInfoBtn = document.getElementById('server-info-btn');
  const serverInfoModal = document.getElementById('server-info-modal');
  
  if (serverInfoBtn && serverInfoModal) {
    serverInfoBtn.addEventListener('click', () => {
      serverInfoModal.style.display = 'flex';
    });
    
    serverInfoModal.addEventListener('click', (e) => {
      if (e.target === serverInfoModal) {
        serverInfoModal.style.display = 'none';
      }
    });
  }
}

channels.forEach(ch => {
  ch.addEventListener('click', () => {
    if (ch.dataset.id) navigate(ch.dataset.id);
  });
});

document.addEventListener('DOMContentLoaded', () => {
  navigate('general-chat'); 
  initWebSocket();
  initDragDrop();
  initModal();
});
