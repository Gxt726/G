/**
 * 智慧树自动刷课助手 - 核心内容脚本
 * 功能：自动播放视频、静音、倍速、自动切换下一集、答题弹窗处理
 */

(function () {
  'use strict';

  // ==================== 配置区 ====================
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

  // ==================== 状态区 ====================
  let config = { ...DEFAULT_CONFIG };
  let currentVideo = null;
  let isRunning = false;
  let activityTimer = null;
  let checkTimer = null;
  let logMessages = [];
  let panelElement = null;
  let isMinimized = false;

  // ==================== 工具函数 ====================
  const log = (msg, type = 'info') => {
    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    const prefix = `[${time}]`;
    const entry = { msg, type, prefix };
    logMessages.unshift(entry);
    if (logMessages.length > 50) logMessages.pop();
    console.log(`[智慧树助手] ${msg}`);
    renderLog();
  };

  const wait = (ms) => new Promise(r => setTimeout(r, ms));

  const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  // ==================== 配置存储 ====================
  const loadConfig = async () => {
    try {
      const result = await chrome.storage.sync.get('zhsConfig');
      if (result.zhsConfig) {
        config = { ...DEFAULT_CONFIG, ...result.zhsConfig };
      }
    } catch (e) {
      console.warn('加载配置失败，使用默认配置', e);
    }
  };

  const saveConfig = async () => {
    try {
      await chrome.storage.sync.set({ zhsConfig: config });
    } catch (e) {
      console.warn('保存配置失败', e);
    }
  };

  // ==================== 视频检测与控制 ====================
  const findVideoElement = () => {
    // 智慧树多种视频播放器选择器
    const selectors = [
      'video',
      '.video-box video',
      '.player video',
      '#videoPlayer video',
      'video.vedioPlayer',
      '.vjs-tech',
      'video-js video'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.tagName === 'VIDEO') return el;
    }
    // 搜索iframe中的视频
    const iframes = document.querySelectorAll('iframe');
    for (const iframe of iframes) {
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        for (const sel of selectors) {
          const el = iframeDoc.querySelector(sel);
          if (el && el.tagName === 'VIDEO') return el;
        }
      } catch (e) { /* 跨域忽略 */ }
    }
    return null;
  };

  const ensurePlay = async () => {
    if (!currentVideo) return false;
    try {
      if (currentVideo.paused) {
        const playPromise = currentVideo.play();
        if (playPromise && playPromise.catch) {
          playPromise.catch(e => log('播放失败: ' + e.message, 'warn'));
        }
        await wait(300);
        return !currentVideo.paused;
      }
      return true;
    } catch (e) {
      log('播放异常: ' + e.message, 'error');
      return false;
    }
  };

  const ensureMute = () => {
    if (!currentVideo) return;
    if (config.autoMute && !currentVideo.muted) {
      currentVideo.muted = true;
      currentVideo.volume = 0;
      log('已设置静音');
    }
  };

  const ensurePlaybackRate = () => {
    if (!currentVideo) return;
    if (currentVideo.playbackRate !== config.playbackRate) {
      try {
        currentVideo.playbackRate = config.playbackRate;
        currentVideo.defaultPlaybackRate = config.playbackRate;
        log(`已设置倍速: ${config.playbackRate}x`);
      } catch (e) {
        log('设置倍速失败: ' + e.message, 'warn');
      }
    }
  };

  // ==================== 下一集切换 ====================
  const findNextButton = () => {
    const selectors = [
      '.next-btn',
      '.nextChapter',
      '.btn-next',
      '[class*="next"]:not([disabled])',
      '.chapter-list .active + li a',
      '#nextBtn',
      '.nextLesson',
      'a[title*="下一节"]',
      'button:has(span:contains("下一章"))'
    ];
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (el && el.offsetParent !== null && !el.disabled) return el;
      } catch (e) { /* CSS选择器不兼容时跳过 */ }
    }
    // 尝试查找目录中的下一个未完成章节
    const chapters = document.querySelectorAll('.chapter-list li, .video-list li, .lesson-item');
    let foundCurrent = false;
    for (const ch of chapters) {
      if (foundCurrent && !ch.classList.contains('finished') && !ch.classList.contains('done')) {
        const link = ch.querySelector('a') || ch;
        if (link) return link;
      }
      if (ch.classList.contains('active') || ch.classList.contains('current') || ch.classList.contains('playing')) {
        foundCurrent = true;
      }
    }
    return null;
  };

  const goToNext = async () => {
    log('当前视频已完成，尝试切换下一集...');
    const btn = findNextButton();
    if (btn) {
      btn.click();
      log('已点击下一集按钮');
      await wait(3000);
      return true;
    }
    // 备用方案：检测页面中的完成弹窗
    const popupBtns = document.querySelectorAll(
      '.el-button--primary, .ant-btn-primary, .btn-primary, .pop_btn, [class*="confirm"]'
    );
    for (const pb of popupBtns) {
      if (pb.textContent.includes('下一章') || pb.textContent.includes('下一节') || pb.textContent.includes('继续学习')) {
        pb.click();
        log('已通过弹窗切换下一集');
        await wait(3000);
        return true;
      }
    }
    log('未找到下一集按钮，请手动切换', 'warn');
    return false;
  };

  // ==================== 弹窗处理 ====================
  const closePopups = () => {
    // 各类弹窗关闭按钮
    const closeSelectors = [
      '.el-dialog__close',
      '.el-message-box__close',
      '.ant-modal-close',
      '.close-btn',
      '.modal-close',
      '[class*="popup"] [class*="close"]',
      '.popbox .close',
      '.d-close',
      'i.el-icon-close'
    ];
    let closed = 0;
    for (const sel of closeSelectors) {
      const btns = document.querySelectorAll(sel);
      btns.forEach(b => {
        try { b.click(); closed++; } catch (e) {}
      });
    }
    // 答题弹窗：尝试随机选择答案
    if (config.autoClosePopup) {
      const quizPopups = document.querySelectorAll(
        '.question-box, .quiz-modal, .topic-box, [class*="exam"], [class*="test"]'
      );
      quizPopups.forEach(qp => {
        if (config.answerQuiz) {
          const options = qp.querySelectorAll('.options li, .option-item, .answer-item, [class*="option"]');
          if (options.length > 0) {
            const randomOpt = options[randomInt(0, options.length - 1)];
            randomOpt.click();
            log('已随机选择测验答案', 'warn');
          }
        }
        // 寻找提交/关闭按钮
        const submitBtns = qp.querySelectorAll(
          '.submit-btn, .confirm-btn, .btn-submit, [class*="submit"], [class*="confirm"]'
        );
        submitBtns.forEach(sb => {
          try { sb.click(); closed++; } catch (e) {}
        });
      });
    }
    // 处理alert/confirm覆盖层 - 通过ESC键模拟
    if (closed > 0) {
      log(`已处理 ${closed} 个弹窗`);
    }
    return closed;
  };

  // ==================== 活动模拟（防检测） ====================
  const simulateUserActivity = () => {
    if (!config.simulateActivity) return;
    // 随机滚动
    try {
      const scrollAmount = randomInt(-30, 30);
      window.scrollBy({ top: scrollAmount, behavior: 'smooth' });
    } catch (e) {}
    // 鼠标移动事件
    try {
      const ev = new MouseEvent('mousemove', {
        bubbles: true,
        clientX: randomInt(100, window.innerWidth - 100),
        clientY: randomInt(100, window.innerHeight - 100)
      });
      document.dispatchEvent(ev);
    } catch (e) {}
    // 点击视频区域
    if (currentVideo && Math.random() > 0.7) {
      try {
        const rect = currentVideo.getBoundingClientRect();
        const ev = new MouseEvent('click', {
          bubbles: true,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2
        });
        currentVideo.dispatchEvent(ev);
      } catch (e) {}
    }
  };

  // ==================== 主循环 ====================
  const mainLoop = async () => {
    if (!config.enabled) return;

    // 1. 检测视频元素
    const video = findVideoElement();
    if (video !== currentVideo) {
      if (video) {
        log('检测到视频播放器');
      }
      currentVideo = video;
    }

    if (!currentVideo) {
      // 没有视频时也尝试处理弹窗
      closePopups();
      return;
    }

    // 2. 视频播放控制
    if (config.autoPlay) {
      await ensurePlay();
    }
    ensureMute();
    ensurePlaybackRate();

    // 3. 处理弹窗
    closePopups();

    // 4. 检测是否播放完毕
    if (currentVideo.ended || (currentVideo.duration > 0 && currentVideo.currentTime >= currentVideo.duration - 1)) {
      if (config.autoNext) {
        await goToNext();
      }
    }

    updatePanelInfo();
  };

  // ==================== 控制面板 UI ====================
  const createPanel = () => {
    if (panelElement) return;
    panelElement = document.createElement('div');
    panelElement.className = 'zhs-helper-panel';
    panelElement.innerHTML = `
      <div class="zhs-helper-header">
        <div style="display:flex;align-items:center;gap:8px;">
          <div class="zhs-helper-minimize" title="最小化">—</div>
          <div class="zhs-helper-title">智慧树刷课助手</div>
        </div>
        <div class="zhs-helper-close" title="关闭">✕</div>
      </div>
      <div class="zhs-helper-body">
        <div class="zhs-helper-status">
          <div class="zhs-helper-status-dot" id="zhsStatusDot"></div>
          <div class="zhs-helper-status-text" id="zhsStatusText">助手未启动</div>
        </div>
        <div class="zhs-helper-info">
          <div class="zhs-helper-info-item">
            <div class="zhs-helper-info-label">当前进度</div>
            <div class="zhs-helper-info-value" id="zhsProgress">-</div>
          </div>
          <div class="zhs-helper-info-item">
            <div class="zhs-helper-info-label">倍速</div>
            <div class="zhs-helper-info-value" id="zhsRate">-</div>
          </div>
          <div class="zhs-helper-info-item">
            <div class="zhs-helper-info-label">时长</div>
            <div class="zhs-helper-info-value" id="zhsDuration">-</div>
          </div>
          <div class="zhs-helper-info-item">
            <div class="zhs-helper-info-label">音量</div>
            <div class="zhs-helper-info-value" id="zhsVolume">-</div>
          </div>
        </div>
        <div class="zhs-helper-controls">
          <button class="zhs-helper-btn zhs-helper-btn-primary" id="zhsToggleBtn">▶ 启动刷课</button>
          <div class="zhs-helper-options">
            <div class="zhs-helper-option">
              <span class="zhs-helper-option-label">自动播放</span>
              <div class="zhs-helper-switch" id="zhsAutoPlay"></div>
            </div>
            <div class="zhs-helper-option">
              <span class="zhs-helper-option-label">自动静音</span>
              <div class="zhs-helper-switch" id="zhsAutoMute"></div>
            </div>
            <div class="zhs-helper-option">
              <span class="zhs-helper-option-label">自动下一集</span>
              <div class="zhs-helper-switch" id="zhsAutoNext"></div>
            </div>
            <div class="zhs-helper-option">
              <span class="zhs-helper-option-label">关闭弹窗</span>
              <div class="zhs-helper-switch" id="zhsClosePopup"></div>
            </div>
            <div class="zhs-helper-option">
              <span class="zhs-helper-option-label">模拟活动</span>
              <div class="zhs-helper-switch" id="zhsSimulate"></div>
            </div>
            <div class="zhs-helper-option">
              <span class="zhs-helper-option-label">播放倍速</span>
              <select class="zhs-helper-select" id="zhsRateSelect">
                <option value="1">1.0x</option>
                <option value="1.25">1.25x</option>
                <option value="1.5" selected>1.5x</option>
                <option value="1.75">1.75x</option>
                <option value="2">2.0x</option>
              </select>
            </div>
          </div>
        </div>
        <div class="zhs-helper-log" id="zhsLog"></div>
      </div>
    `;
    document.body.appendChild(panelElement);
    bindPanelEvents();
    applyConfigToUI();
    makeDraggable();
  };

  const makeDraggable = () => {
    const header = panelElement.querySelector('.zhs-helper-header');
    let isDragging = false, startX, startY, startLeft, startTop;
    header.addEventListener('mousedown', e => {
      if (e.target.classList.contains('zhs-helper-close') || e.target.classList.contains('zhs-helper-minimize')) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startLeft = panelElement.offsetLeft;
      startTop = panelElement.offsetTop;
      e.preventDefault();
    });
    document.addEventListener('mousemove', e => {
      if (!isDragging) return;
      panelElement.style.left = (startLeft + e.clientX - startX) + 'px';
      panelElement.style.top = (startTop + e.clientY - startY) + 'px';
      panelElement.style.right = 'auto';
    });
    document.addEventListener('mouseup', () => isDragging = false);
  };

  const bindPanelEvents = () => {
    const $ = id => panelElement.querySelector(id);

    $('#zhsToggleBtn').addEventListener('click', () => {
      config.enabled = !config.enabled;
      saveConfig();
      applyConfigToUI();
      if (config.enabled) start();
      else stop();
    });

    $('#zhsAutoPlay').addEventListener('click', e => toggleSwitch(e, 'autoPlay'));
    $('#zhsAutoMute').addEventListener('click', e => toggleSwitch(e, 'autoMute'));
    $('#zhsAutoNext').addEventListener('click', e => toggleSwitch(e, 'autoNext'));
    $('#zhsClosePopup').addEventListener('click', e => toggleSwitch(e, 'autoClosePopup'));
    $('#zhsSimulate').addEventListener('click', e => toggleSwitch(e, 'simulateActivity'));

    $('#zhsRateSelect').addEventListener('change', e => {
      config.playbackRate = parseFloat(e.target.value);
      saveConfig();
      ensurePlaybackRate();
    });

    $('#zhsClose').addEventListener; // noop
    panelElement.querySelector('.zhs-helper-close').addEventListener('click', () => {
      panelElement.remove();
      panelElement = null;
    });

    panelElement.querySelector('.zhs-helper-minimize').addEventListener('click', () => {
      toggleMinimize();
    });
  };

  const toggleSwitch = (e, key) => {
    e.currentTarget.classList.toggle('on');
    config[key] = e.currentTarget.classList.contains('on');
    saveConfig();
    log(`${key}=${config[key]}`);
  };

  const applyConfigToUI = () => {
    if (!panelElement) return;
    const $ = id => panelElement.querySelector(id);
    $('#zhsStatusDot').classList.toggle('active', config.enabled);
    $('#zhsStatusText').textContent = config.enabled ? '助手运行中...' : '助手未启动';
    $('#zhsToggleBtn').textContent = config.enabled ? '⏹ 停止刷课' : '▶ 启动刷课';
    $('#zhsToggleBtn').classList.toggle('zhs-helper-btn-primary', !config.enabled);
    $('#zhsToggleBtn').classList.toggle('zhs-helper-btn-danger', config.enabled);
    $('#zhsAutoPlay').classList.toggle('on', config.autoPlay);
    $('#zhsAutoMute').classList.toggle('on', config.autoMute);
    $('#zhsAutoNext').classList.toggle('on', config.autoNext);
    $('#zhsClosePopup').classList.toggle('on', config.autoClosePopup);
    $('#zhsSimulate').classList.toggle('on', config.simulateActivity);
    $('#zhsRateSelect').value = config.playbackRate;
  };

  const toggleMinimize = () => {
    if (!panelElement) return;
    isMinimized = !isMinimized;
    const body = panelElement.querySelector('.zhs-helper-body');
    const header = panelElement.querySelector('.zhs-helper-header');
    if (isMinimized) {
      panelElement.dataset.oldWidth = panelElement.style.width;
      panelElement.className = 'zhs-helper-minimized';
      panelElement.innerHTML = `<span class="zhs-helper-minimized-dot"></span>智慧树助手 ${config.enabled ? '运行中' : '未启动'}（点击展开）`;
      panelElement.onclick = () => {
        panelElement.onclick = null;
        isMinimized = false;
        createPanel();
      };
    }
  };

  const formatTime = (sec) => {
    if (!sec || isNaN(sec)) return '-';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const updatePanelInfo = () => {
    if (!panelElement || !panelElement.isConnected) return;
    const $ = id => panelElement.querySelector(id);
    if (currentVideo) {
      const pct = currentVideo.duration > 0
        ? ((currentVideo.currentTime / currentVideo.duration) * 100).toFixed(1) + '%'
        : '-';
      $('#zhsProgress').textContent = pct;
      $('#zhsRate').textContent = currentVideo.playbackRate + 'x';
      $('#zhsDuration').textContent = `${formatTime(currentVideo.currentTime)}/${formatTime(currentVideo.duration)}`;
      $('#zhsVolume').textContent = currentVideo.muted ? '静音' : Math.round(currentVideo.volume * 100) + '%';
    }
  };

  const renderLog = () => {
    const logEl = panelElement && panelElement.querySelector('#zhsLog');
    if (!logEl) return;
    logEl.innerHTML = logMessages.slice(0, 15).map(l =>
      `<div class="zhs-helper-log-item ${l.type}">${l.prefix} ${l.msg}</div>`
    ).join('');
  };

  // ==================== 启动/停止 ====================
  const start = () => {
    if (isRunning) return;
    isRunning = true;
    log('助手已启动');
    createPanel();
    applyConfigToUI();

    // 主循环：每 2 秒检查一次
    checkTimer = setInterval(mainLoop, 2000);

    // 视频事件监听
    setTimeout(() => {
      if (currentVideo) {
        currentVideo.addEventListener('ended', () => {
          log('视频播放结束');
          if (config.autoNext) goToNext();
        });
        currentVideo.addEventListener('play', () => ensurePlaybackRate());
        currentVideo.addEventListener('ratechange', () => ensurePlaybackRate());
      }
    }, 1000);

    // 活动模拟：每 30~60 秒
    if (config.simulateActivity) {
      activityTimer = setInterval(simulateUserActivity, randomInt(30000, 60000));
    }
  };

  const stop = () => {
    if (!isRunning) return;
    isRunning = false;
    log('助手已停止');
    if (checkTimer) { clearInterval(checkTimer); checkTimer = null; }
    if (activityTimer) { clearInterval(activityTimer); activityTimer = null; }
    applyConfigToUI();
  };

  // ==================== 消息通信 ====================
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    switch (msg.type) {
      case 'GET_STATUS':
        sendResponse({
          enabled: config.enabled,
          running: isRunning,
          config: { ...config },
          hasVideo: !!currentVideo,
          currentProgress: currentVideo
            ? { time: currentVideo.currentTime, duration: currentVideo.duration, paused: currentVideo.paused }
            : null
        });
        break;
      case 'TOGGLE':
        config.enabled = !config.enabled;
        saveConfig();
        if (config.enabled) start(); else stop();
        sendResponse({ enabled: config.enabled });
        break;
      case 'UPDATE_CONFIG':
        config = { ...config, ...msg.payload };
        saveConfig();
        applyConfigToUI();
        ensureMute();
        ensurePlaybackRate();
        sendResponse({ ok: true });
        break;
      case 'OPEN_PANEL':
        createPanel();
        sendResponse({ ok: true });
        break;
      default:
        sendResponse({ error: '未知命令' });
    }
    return true;
  });

  // ==================== 初始化 ====================
  const init = async () => {
    await loadConfig();
    // 如果配置为自动启动，或检测到在智慧树学习页，自动创建面板
    const isZhihuishu = location.hostname.includes('zhihuishu') || location.hostname.includes('knowbox');
    if (isZhihuishu) {
      setTimeout(() => {
        createPanel();
        if (config.enabled) start();
      }, 3000);
    }
    log('内容脚本已加载');
  };

  init();
})();
