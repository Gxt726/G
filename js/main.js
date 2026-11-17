/* 交互与启动层 - 弹窗/控件/启动入口 */
/* ==================== 省份详情弹窗 ==================== */
function openProvinceModal(provinceName) {
    const aqiData = generateAqiData(currentDateOffset);
    const row = aqiData.find(d => d.name === provinceName);
    if (!row) return;
    
    const lvl = aqiLevel(row.value);
    const pm25 = generatePollutantData('pm25', currentDateOffset).find(d => d.name === provinceName)?.value || 0;
    const pm10 = generatePollutantData('pm10', currentDateOffset).find(d => d.name === provinceName)?.value || 0;
    const o3 = generatePollutantData('o3', currentDateOffset).find(d => d.name === provinceName)?.value || 0;
    const no2 = generatePollutantData('no2', currentDateOffset).find(d => d.name === provinceName)?.value || 0;
    const so2 = generatePollutantData('so2', currentDateOffset).find(d => d.name === provinceName)?.value || 0;
    
    document.getElementById('modalProvinceName').textContent = provinceName.replace(/省|市|自治区|特别行政区|壮族|回族|维吾尔/g,'');
    const badge = document.getElementById('modalAqiBadge');
    badge.textContent = `AQI ${row.value} · ${lvl.name}`;
    badge.style.background = lvl.color + '30';
    badge.style.color = lvl.color;
    
    const grid = document.getElementById('modalPollutants');
    const items = [
        { name: 'PM2.5', val: pm25, unit: 'μg/m³', color: pm25 > 75 ? '#ff6b6b' : '#4facfe' },
        { name: 'PM10', val: pm10, unit: 'μg/m³', color: pm10 > 150 ? '#ff6b6b' : '#43e97b' },
        { name: 'O₃',   val: o3,   unit: 'μg/m³', color: '#43e97b' },
        { name: 'NO₂',  val: no2,  unit: 'μg/m³', color: '#fddb3a' },
        { name: 'SO₂',  val: so2,  unit: 'μg/m³', color: '#fa709a' },
        { name: 'CO',   val: (0.5 + seededRandom(provinces.indexOf(provinceName)) * 1.2).toFixed(2), unit: 'mg/m³', color: '#a18cd1' }
    ];
    grid.innerHTML = items.map(it => `
        <div class="modal-pollutant-item">
            <div class="pname">${it.name}</div>
            <div class="pval" style="color:${it.color}">${it.val}</div>
            <div class="punit">${it.unit}</div>
        </div>
    `).join('');
    
    document.getElementById('modalTimestamp').textContent = new Date().toLocaleString('zh-CN');
    document.getElementById('provinceModal').classList.add('show');
}
function closeModal() { document.getElementById('provinceModal').classList.remove('show'); }
document.getElementById('provinceModal').addEventListener('click', closeModal);

/* ==================== 控制函数 ==================== */
function refreshAll() {
    try {
        Object.values(charts).forEach(c => { try { c && c.dispose(); } catch(e){} });
        charts.map = charts.pie = charts.radar = charts.rank = charts.trend = null;
        charts.province = charts.scatter = charts.hour = charts.region = null;
    } catch(e) { console.warn('[refreshAll] dispose warn:', e); }
    initAllCharts();
}
function toggleFullscreen() {
    document.body.classList.toggle('fullscreen-mode');
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(()=>{});
    } else {
        document.exitFullscreen?.();
    }
    setTimeout(() => Object.values(charts).forEach(c => c && c.resize()), 300);
}
function exportCSV() {
    const aqiData = generateAqiData(currentDateOffset);
    const header = '省份,AQI,PM2.5,PM10,O3,NO2,SO2\n';
    const rows = aqiData.map(d => {
        const p = d.name;
        const pm25 = generatePollutantData('pm25', currentDateOffset).find(x => x.name === p)?.value || '';
        const pm10 = generatePollutantData('pm10', currentDateOffset).find(x => x.name === p)?.value || '';
        const o3   = generatePollutantData('o3',   currentDateOffset).find(x => x.name === p)?.value || '';
        const no2  = generatePollutantData('no2',  currentDateOffset).find(x => x.name === p)?.value || '';
        const so2  = generatePollutantData('so2',  currentDateOffset).find(x => x.name === p)?.value || '';
        return `"${p}",${d.value},${pm25},${pm10},${o3},${no2},${so2}`;
    }).join('\n');
    const blob = new Blob(['\uFEFF' + header + rows], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `空气质量数据_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
}

/* ==================== 初始化入口 ==================== */
// 带 try/catch 隔离的 safeInit：每个图表初始化独立包裹，单图失败不阻断其他
function safeInit(name, fn) {
    try {
        fn();
        console.log('[OK]', name);
    } catch(e) {
        console.error('[FAIL]', name, e);
    }
}

function initAllCharts() {
    safeInit('概览', () => initOverview());
    safeInit('地图', () => initMap());
    safeInit('等级饼图', () => initPie());
    safeInit('污染物雷达', () => initRadar());
    safeInit('城市排行榜', () => initRank());
    safeInit('月度趋势+预测', () => initTrend());
    safeInit('省份对比', () => initProvinceBar());
    safeInit('散点相关性', () => initScatter());
    safeInit('24小时变化', () => initHour());
    safeInit('区域对比', () => initRegion());
    // 延迟 resize 等 DOM 完全渲染
    setTimeout(() => {
        Object.values(charts).forEach(c => { try { c && c.resize(); } catch(e){} });
    }, 200);
}

// 多源兜底加载地图 GeoJSON
const MAP_SOURCES = [
    'https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json',
    'https://geo.datav.aliyun.com/areas_v3/bound/100000.json',
    'https://cdn.jsdelivr.net/gh/apache/echarts-website@asf-site/examples/data/asset/geo/china.json'
];

function loadGeoJson() {
    return new Promise((resolve) => {
        let idx = 0;
        function tryNext() {
            if (idx >= MAP_SOURCES.length) {
                console.warn('[GeoJSON] 所有源失败，使用散点兜底');
                resolve(null);
                return;
            }
            const url = MAP_SOURCES[idx++];
            // 用带超时的 fetch
            const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
            const timeout = setTimeout(() => { try { ctrl && ctrl.abort(); } catch(e){} }, 5000);
            fetch(url, ctrl ? { signal: ctrl.signal } : {})
                .then(res => { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
                .then(geo => { clearTimeout(timeout); resolve(geo); })
                .catch(err => { clearTimeout(timeout); console.warn('[GeoJSON] 源 ' + idx + ' 失败:', err.message); tryNext(); });
        }
        tryNext();
    });
}

// 启动：DOM ready → 加载地图 → 初始化所有图表
function boot() {
    console.log('[BOOT] 开始初始化...');
    // 先假设地图不可用，initMap 会自动降级
    loadGeoJson().then(geo => {
        if (geo) {
            try {
                echarts.registerMap('china', geo);
                mapRegistered = true;
                console.log('[BOOT] 地图注册成功');
            } catch(e) {
                console.warn('[BOOT] registerMap 失败:', e);
            }
        } else {
            registerFallbackMap();
        }
    }).finally(() => {
        try { initAllCharts(); } catch(e) { console.error('[BOOT] initAllCharts 异常:', e); }
        // 无论成功失败，都关闭 loading
        setTimeout(() => document.getElementById('loadingMask').classList.add('hidden'), 800);
    });
}

// DOM ready 后启动
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
} else {
    boot();
}

// resize（只注册一次）
window.addEventListener('resize', () => {
    Object.values(charts).forEach(c => { try { c && c.resize(); } catch(e){} });
});

// 历史回放
const slider = document.getElementById('timeSlider');
const sliderLabel = document.getElementById('sliderLabel');
slider.addEventListener('input', e => {
    currentDateOffset = 30 - parseInt(e.target.value);
    const d = new Date(); d.setDate(d.getDate() - currentDateOffset);
    sliderLabel.textContent = currentDateOffset === 0 ? '今天' : `${currentDateOffset}天前`;
    document.getElementById('datePicker').value = d.toISOString().slice(0,10);
    refreshAll();
});

// 日期选择
const datePicker = document.getElementById('datePicker');
datePicker.valueAsDate = new Date();
datePicker.addEventListener('change', e => {
    const target = new Date(e.target.value);
    const diff = Math.round((new Date() - target) / (1000 * 60 * 60 * 24));
    currentDateOffset = clamp(diff, 0, 180);
    slider.value = 30 - Math.min(currentDateOffset, 30);
    sliderLabel.textContent = currentDateOffset === 0 ? '今天' : `${currentDateOffset}天前`;
    refreshAll();
});

// 自动刷新（每60秒更新时间戳和概览）
setInterval(() => {
    document.getElementById('updateTime').textContent = new Date().toLocaleTimeString('zh-CN', { hour12: false });
}, 30000);