/**
 * 智慧树刷课助手 - Popup 弹窗控制逻辑
 */

const DEFAULT_CONFIG = {
  enabled: false,
  autoPlay: true,
  autoMute: true,
  autoNext: true,
  playbackRate: 1.5,
  autoClosePopup: true,
  simulateActivity: true,
  answerQuiz: false
};

let currentConfig = { ...DEFAULT_CONFIG };
let currentStatus = null;
let activeTabId = null;

// ==================== 工具函数 ====================
const $ = (id) => document.getElementById(id);

const formatTime = (sec) => {
  if (!sec || isNaN(sec)) return '-';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

// ==================== 存储读写 ====================
const loadConfig = async () => {
  try {
    const result = await chrome.storage.sync.get('zhsConfig');
    if (result.zhsConfig) {
      currentConfig = { ...DEFAULT_CONFIG, ...result.zhsConfig };
    }
  } catch (e) {
    console.warn('加载配置失败', e);
  }
};

const saveConfig = async () => {
  try {
    await chrome.storage.sync.set({ zhsConfig: currentConfig });
  } catch (e) {
    console.warn('保存配置失败', e);
  }
};

// ==================== 发送消息到内容脚本 ====================
const sendToContent = async (type, payload = {}) => {
  if (!activeTabId) return null;
  try {
    return await chrome.tabs.sendMessage(activeTabId, { type, payload });
  } catch (e) {
    console.warn('发送消息失败（可能页面未加载内容脚本）:', e.message);
    return null;
  }
};

// ==================== 获取当前 Tab ====================
const getActiveTab = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
};

// ==================== UI 渲染 ====================
const renderUI = () => {
  // 状态
  const enabled = currentConfig.enabled;
  $('statusDot').classList.toggle('active', enabled);
  $('statusText').textContent = enabled ? '助手运行中...' : '助手未启动';

  const toggleBtn = $('toggleBtn');
  toggleBtn.textContent = enabled ? '⏹ 停止助手' : '▶ 启动助手';
  toggleBtn.classList.toggle('btn-primary', !enabled);
  toggleBtn.classList.toggle('btn-danger', enabled);

  // 开关
  document.querySelectorAll('.switch').forEach(sw => {
    const key = sw.dataset.key;
    sw.classList.toggle('on', currentConfig[key]);
  });

  // 倍速
  $('rateSelect').value = currentConfig.playbackRate;

  // 学习信息
  if (currentStatus && currentStatus.currentProgress) {
    const p = currentStatus.currentProgress;
    const pct = p.duration > 0 ? ((p.time / p.duration) * 100).toFixed(1) + '%' : '-';
    $('infoProgress').textContent = pct;
    $('infoDuration').textContent = `${formatTime(p.time)}/${formatTime(p.duration)}`;
  } else {
    $('infoProgress').textContent = '-';
    $('infoDuration').textContent = '-';
  }
  $('infoRate').textContent = currentConfig.playbackRate + 'x';
  $('infoVideo').textContent = currentStatus?.hasVideo ? '✓ 已检测' : '✗ 未检测';
  $('infoVideo').style.color = currentStatus?.hasVideo ? '#52c41a' : '#ff4d4f';
};

// ==================== 刷新状态 ====================
const refreshStatus = async () => {
  const tab = await getActiveTab();
  if (tab) {
    activeTabId = tab.id;
    currentStatus = await sendToContent('GET_STATUS');
    if (currentStatus?.config) {
      currentConfig = { ...currentConfig, ...currentStatus.config };
    }
  }
  renderUI();
};

// ==================== 事件绑定 ====================
const bindEvents = () => {
  // 开关点击
  document.querySelectorAll('.switch').forEach(sw => {
    sw.addEventListener('click', async () => {
      const key = sw.dataset.key;
      currentConfig[key] = !currentConfig[key];
      sw.classList.toggle('on', currentConfig[key]);
      await saveConfig();
      await sendToContent('UPDATE_CONFIG', { [key]: currentConfig[key] });
    });
  });

  // 倍速选择
  $('rateSelect').addEventListener('change', async (e) => {
    const rate = parseFloat(e.target.value);
    currentConfig.playbackRate = rate;
    await saveConfig();
    await sendToContent('UPDATE_CONFIG', { playbackRate: rate });
    renderUI();
  });

  // 启动/停止按钮
  $('toggleBtn').addEventListener('click', async () => {
    currentConfig.enabled = !currentConfig.enabled;
    await saveConfig();
    const resp = await sendToContent('TOGGLE');
    if (resp?.enabled !== undefined) {
      currentConfig.enabled = resp.enabled;
    }
    renderUI();
  });

  // 显示面板按钮
  $('openPanelBtn').addEventListener('click', async () => {
    await sendToContent('OPEN_PANEL');
    window.close();
  });
};

// ==================== 初始化 ====================
const init = async () => {
  await loadConfig();
  bindEvents();
  await refreshStatus();
  // 每 3 秒自动刷新一次状态
  setInterval(refreshStatus, 3000);
};

document.addEventListener('DOMContentLoaded', init);
