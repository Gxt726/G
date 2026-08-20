/**
 * 智慧树自动刷课助手 - Service Worker 后台脚本
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

// ==================== 安装与更新 ====================
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[智慧树助手] 扩展已安装/更新:', details.reason);

  // 初始化默认配置
  try {
    const result = await chrome.storage.sync.get('zhsConfig');
    if (!result.zhsConfig) {
      await chrome.storage.sync.set({ zhsConfig: { ...DEFAULT_CONFIG } });
      console.log('[智慧树助手] 已初始化默认配置');
    } else {
      // 补齐缺失的配置项
      const merged = { ...DEFAULT_CONFIG, ...result.zhsConfig };
      await chrome.storage.sync.set({ zhsConfig: merged });
    }
  } catch (e) {
    console.error('[智慧树助手] 配置初始化失败', e);
  }

  // 设置扩展 Badge 背景色
  try {
    chrome.action.setBadgeBackgroundColor({ color: '#667eea' });
  } catch (e) {}
});

// ==================== Tab 更新监听 ====================
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    const isZhihuishu =
      tab.url.includes('zhihuishu.com') ||
      tab.url.includes('zhihuishu.com.cn') ||
      tab.url.includes('knowbox.cn');

    if (isZhihuishu) {
      console.log('[智慧树助手] 检测到智慧树页面:', tab.url);
      try {
        // 更新 badge
        chrome.action.setBadgeText({ tabId, text: 'ZHS' });
      } catch (e) {}
    }
  }
});

// ==================== 配置变更监听 ====================
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.zhsConfig) {
    const newConfig = changes.zhsConfig.newValue;
    console.log('[智慧树助手] 配置已更新:', newConfig);
    // 通知所有相关 Tab
    chrome.tabs.query({ url: [
      '*://*.zhihuishu.com/*',
      '*://*.zhihuishu.com.cn/*',
      '*://*.knowbox.cn/*'
    ]}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {
          type: 'CONFIG_CHANGED',
          payload: newConfig
        }).catch(() => { /* Tab 可能没有注入脚本，忽略 */ });
      });
    });
  }
});

// ==================== 消息中转 ====================
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log('[智慧树助手] 收到消息:', msg.type, 'from tab', sender.tab?.id);

  switch (msg.type) {
    case 'PING':
      sendResponse({ pong: true, time: Date.now() });
      break;
    case 'LOG':
      console.log('[智慧树助手] 内容脚本日志:', msg.message);
      sendResponse({ ok: true });
      break;
    default:
      break;
  }
  return true;
});

// ==================== 快捷键支持 ====================
chrome.commands?.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  switch (command) {
    case 'toggle-helper':
      chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE' }).catch(() => {});
      break;
    case 'open-panel':
      chrome.tabs.sendMessage(tab.id, { type: 'OPEN_PANEL' }).catch(() => {});
      break;
  }
});
