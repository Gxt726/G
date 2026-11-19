/* 图表渲染层 - ECharts 实例管理与9类图表配置 */
/* ==================== 图表实例管理 ==================== */
const charts = {};
let currentMapType = 'aqi';
let currentRankType = 'good';
let currentDateOffset = 0;
let mapRegistered = false;

// 安全 init：dispose + 判空 + try/catch + 尺寸保底
function ensureChart(id) {
    try {
        const el = document.getElementById(id);
        if (!el) { console.warn('[ensureChart] DOM not found:', id); return null; }
        // 强制容器有尺寸（防止被 loading-mask 或父容器 collapse）
        if (!el.style.height || el.offsetHeight < 20) {
            el.style.height = el.style.height || '300px';
        }
        // 清理残留
        if (charts[id]) { try { charts[id].dispose(); } catch(e){} charts[id] = null; }
        // 用 canvas renderer（兼容性更好）
        charts[id] = echarts.init(el, null, { renderer: 'canvas' });
        return charts[id];
    } catch(e) {
        console.error('[ensureChart] FAILED:', id, e);
        // 失败时写占位文本让用户知道
        const el = document.getElementById(id);
        if (el) el.innerHTML = '<div style="color:#ff6b6b;text-align:center;padding:40px;font-size:13px;">图表加载失败，请查看控制台</div>';
        return null;
    }
}

// 地图加载失败标记（用于兜底视图提示文案）
let mapFailed = false;

/* ==================== 概览 ==================== */
function animateNumber(el, target, suffix = '', decimals = 0) {
    const start = parseFloat(el.textContent) || 0;
    const duration = 800;
    const t0 = performance.now();
    function step(t) {
        const p = Math.min(1, (t - t0) / duration);
        const ease = 1 - Math.pow(1 - p, 3);
        const val = start + (target - start) * ease;
        el.textContent = decimals > 0 ? val.toFixed(decimals) : Math.round(val);
        if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

function setTrendBadge(id, text, better) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.classList.remove('trend-better', 'trend-worse', 'trend-up', 'trend-down');
    el.classList.add(better ? 'trend-better' : 'trend-worse');
}

function initOverview() {
    const aqiData = generateAqiData(currentDateOffset);
    const prevData = generateAqiData(currentDateOffset + 1);
    const avgOf = list => Math.round(list.reduce((s, d) => s + d.value, 0) / list.length);
    const rateOf = list => list.filter(d => d.value <= 100).length / list.length * 100;
    const pollutedOf = list => list.filter(d => d.value > 100).length;

    const avg = avgOf(aqiData), avgPrev = avgOf(prevData);
    const rate = rateOf(aqiData), ratePrev = rateOf(prevData);
    const polluted = pollutedOf(aqiData), pollutedPrev = pollutedOf(prevData);

    // 平均 AQI 同比：下降为好
    const aqiDelta = avgPrev ? (avg - avgPrev) / avgPrev * 100 : 0;
    setTrendBadge('trendAqi', `${aqiDelta <= 0 ? '↓' : '↑'} ${Math.abs(aqiDelta).toFixed(1)}%`, avg <= avgPrev);
    // 优良率：上升为好
    const rateDelta = rate - ratePrev;
    setTrendBadge('trendGood', `${rateDelta >= 0 ? '↑' : '↓'} ${Math.abs(rateDelta).toFixed(1)}%`, rateDelta >= 0);
    // 污染城市数：下降为好
    const pollutedDelta = polluted - pollutedPrev;
    setTrendBadge('trendPolluted', `${pollutedDelta <= 0 ? '↓' : '↑'} ${Math.abs(pollutedDelta)}`, pollutedDelta <= 0);

    animateNumber(document.getElementById('avgAqi'), avg);
    animateNumber(document.getElementById('goodRate'), rate, '', 1);
    animateNumber(document.getElementById('pollutedCities'), polluted);

    const pm25Avg = Math.round(generatePollutantData('pm25', currentDateOffset)
        .reduce((s, d) => s + d.value, 0) / provinces.length);
    document.getElementById('topPollutantVal').textContent = pm25Avg + ' μg/m³';
    setTrendBadge('trendTop', `${avg <= avgPrev ? '↓' : '↑'} ${Math.abs(aqiDelta).toFixed(1)}%`, avg <= avgPrev);

    document.getElementById('updateTime').textContent = new Date().toLocaleTimeString('zh-CN', { hour12: false });
}

/* ==================== 地图 ==================== */
// 地图容器在切换/重建后会更换实例，点击事件必须每次重新绑定
function bindMapClick(c) {
    if (!c) return;
    c.off('click');
    c.on('click', (p) => {
        if (!p) return;
        // 地图模式取 p.name；散点模式名称存在数据数组第 4 位
        const name = p.name || (Array.isArray(p.data) ? p.data[3] : null);
        if (name && provinces.includes(name)) openProvinceModal(name);
    });
}

function initMap() {
    try {
        if (mapRegistered) {
            try { renderMap(currentMapType); } catch(e) { renderScatterFallback(currentMapType); }
        } else {
            renderScatterFallback(currentMapType);
        }
    } catch(e) {
        console.error('[initMap] FAILED', e);
        renderScatterFallback(currentMapType);
    }
}
function switchMap(type, btn) {
    document.querySelectorAll('.map-card .ctrl-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentMapType = type;
    if (mapRegistered) {
        try { renderMap(type); } catch(e) { renderScatterFallback(type); }
    } else {
        renderScatterFallback(type);
    }
}
function renderMap(type) {
    try {
        const c = ensureChart('chinaMap');
        if (!c) return;
        const data = type === 'aqi' ? generateAqiData(currentDateOffset) : generatePollutantData(type, currentDateOffset);
        const titleMap = { aqi: 'AQI', pm25: 'PM2.5', pm10: 'PM10', o3: 'O₃', no2: 'NO₂', so2: 'SO₂' };
        const rangeMap = { aqi: [20, 220], pm25: [10, 160], pm10: [20, 240], o3: [30, 160], no2: [10, 80], so2: [2, 50] };
        const range = rangeMap[type] || [20, 220];
        c.setOption({
            tooltip: {
                trigger: 'item',
                backgroundColor: 'rgba(15,12,41,0.95)', borderColor: '#4facfe',
                textStyle: { color: '#e0e0e0', fontSize: 13 },
                formatter: p => {
                    const v = p.value;
                    if (!v) return `<b>${p.name}</b><br/>${titleMap[type]}: --`;
                    // 仅 AQI 使用空气质量等级着色，污染物按浓度显示
                    if (type !== 'aqi') {
                        return `<b style="color:#ccd6f6">${p.name}</b><br/>
                                ${titleMap[type]}: <span style="color:#4facfe">${v}</span> μg/m³`;
                    }
                    const lvl = aqiLevel(v);
                    return `<b style="color:${lvl.color}">${p.name}</b><br/>
                            AQI: ${v} · <span style="color:${lvl.color}">${lvl.name}</span>`;
                }
            },
            visualMap: {
                min: range[0], max: range[1], left: 16, bottom: 16, calculable: true,
                textStyle: { color: '#8892b0', fontSize: 11 },
                inRange: { color: ['#43e97b','#84fab0','#fddb3a','#fa709a','#ff6b6b','#c0392b'] }
            },
            series: [{
                name: titleMap[type], type: 'map', map: 'china', roam: true,
                label: { show: false },
                emphasis: {
                    label: { show: true, color: '#fff', fontWeight: 'bold' },
                    itemStyle: { areaColor: '#00f2fe', shadowBlur: 20, shadowColor: 'rgba(0,242,254,0.5)' }
                },
                select: { disabled: true },
                itemStyle: { borderColor: 'rgba(255,255,255,0.2)', borderWidth: 0.5 },
                data: data
            }]
        }, true);
        bindMapClick(c);
    } catch(e) {
        console.error('[renderMap] FAILED', e);
        renderScatterFallback(type);
    }
}

// 兜底散点图（地图 GeoJSON 不可用时）
function renderScatterFallback(type) {
    try {
        const c = ensureChart('chinaMap');
        if (!c) return;
        const data = type === 'aqi' ? generateAqiData(currentDateOffset) : generatePollutantData(type, currentDateOffset);
        const titleMap = { aqi: 'AQI', pm25: 'PM2.5', pm10: 'PM10', o3: 'O₃', no2: 'NO₂', so2: 'SO₂' };
        // 用模拟经纬度（中国大致范围 73-135°E, 18-54°N）均匀分布各省份
        const lon = [116,117,121,107,114,112,123,125,126,118,120,117,119,115,117,113,114,113,113,110,
                     104,106,102,109,104,101,121,111,108,91,106,87,114,113];
        const lat = [39,39,31,29,38,37,41,43,47,32,30,32,27,28,36,34,30,28,23,20,
                     30,26,25,34,36,36,25,40,22,29,38,43,22,22];
        const scatterData = data.map((d,i) => [lon[i] || 100, lat[i] || 35, d.value, d.name]);
        c.setOption({
            tooltip: {
                trigger: 'item', backgroundColor: 'rgba(15,12,41,0.95)', borderColor: '#4facfe',
                textStyle: { color: '#e0e0e0' },
                formatter: p => `<b>${p.data[3]}</b><br/>${titleMap[type]}: ${p.data[2]}`
            },
            title: {
                text: mapFailed ? '⚠ 地图资源不可用，已切换为经纬度散点视图' : '地图数据加载中，暂以散点显示…',
                left: 'center', top: 8, textStyle: { color: '#8892b0', fontSize: 12, fontWeight: 'normal' }
            },
            visualMap: {
                min: 20, max: 220, left: 16, bottom: 16, calculable: true,
                textStyle: { color: '#8892b0', fontSize: 11 },
                inRange: { color: ['#43e97b','#84fab0','#fddb3a','#fa709a','#ff6b6b'] }
            },
            xAxis: { type: 'value', name: '经度', min: 70, max: 140, axisLabel: { color: '#8892b0' }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } } },
            yAxis: { type: 'value', name: '纬度', min: 15, max: 55, axisLabel: { color: '#8892b0' }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } } },
            series: [{
                type: 'scatter', data: scatterData,
                symbolSize: v => Math.max(6, Math.min(30, v[2] / 8)),
                itemStyle: { borderColor: '#fff', borderWidth: 0.8, opacity: 0.9 },
                emphasis: { itemStyle: { shadowBlur: 15, shadowColor: 'rgba(0,242,254,0.6)' } }
            }]
        }, true);
        bindMapClick(c);
    } catch(e) {
        console.error('[renderScatterFallback] FAILED', e);
    }
}

/* ==================== 饼图 ==================== */
function initPie() {
    const c = ensureChart('levelPie');
    // 按当前日期数据的实际 AQI 等级统计
    const levels = [
        { name: '优', color: '#43e97b', test: v => v <= 50 },
        { name: '良', color: '#84fab0', test: v => v > 50 && v <= 100 },
        { name: '轻度', color: '#fddb3a', test: v => v > 100 && v <= 150 },
        { name: '中度', color: '#fa709a', test: v => v > 150 && v <= 200 },
        { name: '重度', color: '#ff6b6b', test: v => v > 200 }
    ];
    const aqiData = generateAqiData(currentDateOffset);
    const pieData = levels.map(l => ({
        name: l.name,
        value: aqiData.filter(d => l.test(d.value)).length,
        itemStyle: { color: l.color }
    }));
    c.setOption({
        tooltip: { trigger: 'item', backgroundColor: 'rgba(15,12,41,0.95)', textStyle: { color: '#e0e0e0' } },
        legend: { bottom: 0, textStyle: { color: '#8892b0', fontSize: 11 }, itemWidth: 10, itemHeight: 10 },
        series: [{
            type: 'pie', radius: ['38%', '72%'], center: ['50%', '45%'],
            animationType: 'scale', animationEasing: 'elasticOut', animationDuration: 800,
            label: { show: true, color: '#ccd6f6', fontSize: 11, formatter: '{d}%' },
            labelLine: { lineStyle: { color: 'rgba(255,255,255,0.2)' } },
            itemStyle: { borderColor: 'rgba(15,12,41,1)', borderWidth: 3 },
            data: pieData
        }]
    }, true);
}

/* ==================== 雷达 ==================== */
function initRadar() {
    const c = ensureChart('pollutantRadar');
    const pm25 = generatePollutantData('pm25', currentDateOffset);
    const pm10 = generatePollutantData('pm10', currentDateOffset);
    const so2 = generatePollutantData('so2', currentDateOffset);
    const no2 = generatePollutantData('no2', currentDateOffset);
    const o3 = generatePollutantData('o3', currentDateOffset);
    const pick = (list, name) => list.find(d => d.name === name)?.value || 0;
    const coOf = name => parseFloat((0.5 + seededRandom(provinces.indexOf(name) + currentDateOffset) * 1.2).toFixed(1));

    const avgOf = list => Math.round(provinces.reduce((s, n) => s + pick(list, n), 0) / provinces.length);
    const vectorOf = name => [pick(pm25,name), pick(pm10,name), pick(so2,name), pick(no2,name), coOf(name), pick(o3,name)];
    const national = [avgOf(pm25), avgOf(pm10), avgOf(so2), avgOf(no2),
                      parseFloat((0.9 + seededRandom(currentDateOffset + 9) * 0.3).toFixed(1)), avgOf(o3)];

    c.setOption({
        tooltip: { backgroundColor: 'rgba(15,12,41,0.95)', textStyle: { color: '#e0e0e0' } },
        legend: { bottom: 0, textStyle: { color: '#8892b0', fontSize: 10 }, itemWidth: 12, itemHeight: 8 },
        radar: {
            center: ['50%', '48%'], radius: '60%',
            indicator: [
                { name: 'PM2.5', max: 150 }, { name: 'PM10', max: 200 },
                { name: 'SO₂', max: 50 }, { name: 'NO₂', max: 80 },
                { name: 'CO', max: 2 }, { name: 'O₃', max: 150 }
            ],
            axisName: { color: '#8892b0', fontSize: 11 },
            splitLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
            splitArea: { areaStyle: { color: ['rgba(255,255,255,0.02)','rgba(255,255,255,0.05)'] } },
            axisLine: { lineStyle: { color: 'rgba(255,255,255,0.12)' } }
        },
        series: [{
            type: 'radar', emphasis: { lineStyle: { width: 3 } },
            data: [
                { name: '全国', value: national, symbol:'circle', symbolSize:5, areaStyle:{opacity:0.12}, itemStyle:{color:'#4facfe'} },
                { name: '北京', value: vectorOf('北京市'), symbol:'circle', symbolSize:5, areaStyle:{opacity:0.08}, itemStyle:{color:'#ff6b6b'} },
                { name: '上海', value: vectorOf('上海市'), symbol:'circle', symbolSize:5, areaStyle:{opacity:0.08}, itemStyle:{color:'#43e97b'} },
                { name: '广州', value: vectorOf('广东省'), symbol:'circle', symbolSize:5, areaStyle:{opacity:0.08}, itemStyle:{color:'#fddb3a'} }
            ]
        }]
    }, true);
}

/* ==================== 排行榜 ==================== */
function initRank() { renderRank(currentRankType); }
function switchRank(type, btn) {
    const parent = btn.closest('.chart-card');
    parent.querySelectorAll('.ctrl-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentRankType = type;
    renderRank(type);
}
function renderRank(type) {
    const data = generateCityData(type, currentDateOffset);
    const color = type === 'good' ? '#43e97b' : '#ff6b6b';
    const c = ensureChart('cityRank');
    c.setOption({
        grid: { left: 80, right: 40, top: 10, bottom: 20 },
        tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,12,41,0.95)', textStyle: { color: '#e0e0e0' },
            formatter: p => {
                const v = p[0].value, lvl = aqiLevel(v);
                return `<b>${p[0].name}</b><br/>AQI: <span style="color:${lvl.color}">${v}</span> · ${lvl.name}`;
            }
        },
        xAxis: { type: 'value', axisLabel: { color: '#8892b0' }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } } },
        yAxis: { type: 'category', data: data.map(d => d.name).reverse(),
            axisLabel: { color: '#ccd6f6', fontSize: 12 }, axisLine: { show: false }, axisTick: { show: false } },
        series: [{
            type: 'bar', data: data.map(d => d.value).reverse(),
            itemStyle: {
                color: new echarts.graphic.LinearGradient(0,0,1,0, [
                    { offset: 0, color: color + '30' }, { offset: 1, color: color }
                ]),
                borderRadius: [0,6,6,0]
            },
            barWidth: 16,
            label: { show: true, position: 'right', color: '#ccd6f6', fontSize: 12, formatter: '{c}' },
            animationDuration: 1000
        }]
    }, true);
}

/* ==================== 月度趋势 + 7天预测 ==================== */
function initTrend() {
    const c = ensureChart('trendChart');
    const months = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
    const forecast = ['0天','1天','2天','3天','4天','5天','6天','7天'];
    
    function genHist(offset) {
        return months.map((_, i) => {
            const base = seasonFactor(i) * 75;
            return Math.round(clamp(base + seededRandom(i + offset) * 18, 30, 180));
        });
    }
    
    // 基于历史趋势推算预测值
    function genForecast(baseOffset) {
        const hist = genHist(baseOffset);
        const avgHist = hist.slice(-3).reduce((s,v)=>s+v,0)/3;
        const trend = hist[hist.length-1] - hist[hist.length-2];
        return forecast.map((_, i) => Math.round(clamp(hist[hist.length-1] + trend * (i+1) * 0.5 + seededRandom(i+baseOffset+100) * 12, 30, 200)));
    }
    
    const hist1 = genHist(100), hist2 = genHist(200), hist3 = genHist(300), hist4 = genHist(400);
    const fc1 = genForecast(100), fc2 = genForecast(200), fc3 = genForecast(300), fc4 = genForecast(400);
    
    // 构造带预测的 series
    function buildSeries(name, color, hist, fc) {
        const allData = [...hist, null, ...fc];
        const upper = fc.map(v => Math.round(v + 15 + seededRandom(v) * 10));
        const lower = fc.map(v => Math.round(v - 10 - seededRandom(v + 1) * 5));
        return { name, color, allData, upper, lower };
    }
    
    const s1 = buildSeries('全国','#4facfe',hist1,fc1);
    const s2 = buildSeries('北京','#ff6b6b',hist2,fc2);
    const s3 = buildSeries('上海','#43e97b',hist3,fc3);
    const s4 = buildSeries('广州','#fddb3a',hist4,fc4);
    
    // 组合 xAxis: 12月 + 预测分隔 + 7天预测
    const xData = [...months, '', ...forecast];
    
    c.setOption({
        tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,12,41,0.95)', textStyle: { color: '#e0e0e0' } },
        legend: { data: ['全国','北京','上海','广州'], textStyle: { color: '#8892b0' }, top: 0, itemWidth: 20, itemHeight: 2 },
        grid: { left: 50, right: 30, top: 40, bottom: 30 },
        xAxis: {
            type: 'category', data: xData,
            axisLabel: { color: '#8892b0', fontSize: 11, formatter: v => v === '' ? '' : v },
            axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
            splitLine: { show: false }
        },
        yAxis: { type: 'value', name: 'AQI', nameTextStyle: { color: '#8892b0' },
            axisLabel: { color: '#8892b0' }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } } },
        series: [
            // 预测置信区间（以全国为例）：下界为基线，上界画差值，堆叠成带状
            { name: '区间下界', type: 'line', stack: 'conf', symbol: 'none',
                data: [...Array(13).fill(null), ...s1.lower],
                lineStyle: { opacity: 0 }, areaStyle: { opacity: 0 } },
            { name: '置信区间', type: 'line', stack: 'conf', symbol: 'none',
                data: [...Array(13).fill(null), ...s1.upper.map((v, i) => v - s1.lower[i])],
                lineStyle: { opacity: 0 },
                areaStyle: { color: 'rgba(161,140,209,0.18)' } },
            
            { name: '全国', type: 'line', smooth: true, data: s1.allData,
                lineStyle: { width: 3, color: s1.color }, itemStyle: { color: s1.color },
                areaStyle: { color: new echarts.graphic.LinearGradient(0,0,0,1,[
                    { offset:0, color:'rgba(79,172,254,0.3)' }, { offset:1, color:'rgba(79,172,254,0)' }
                ])},
                markLine: { silent: true, symbol: 'none',
                    lineStyle: { color: 'rgba(161,140,209,0.5)', type: 'dashed' },
                    label: { show: false },
                    data: [{ xAxis: '0天' }]
                }
            },
            { name: '北京', type: 'line', smooth: true, data: s2.allData,
                lineStyle: { width: 2, color: s2.color, type: 'solid' }, itemStyle: { color: s2.color } },
            { name: '上海', type: 'line', smooth: true, data: s3.allData,
                lineStyle: { width: 2, color: s3.color }, itemStyle: { color: s3.color } },
            { name: '广州', type: 'line', smooth: true, data: s4.allData,
                lineStyle: { width: 2, color: s4.color }, itemStyle: { color: s4.color } }
        ]
    }, true);
}

/* ==================== 省份对比 ==================== */
function initProvinceBar() {
    const c = ensureChart('provinceBar');
    const barData = generatePollutantData('pm25', currentDateOffset).map(d => ({
        name: d.name.replace(/省|市|自治区|特别行政区|壮族|回族|维吾尔/g,''),
        value: d.value
    })).sort((a, b) => b.value - a.value).slice(0, 15);
    
    c.setOption({
        tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,12,41,0.95)', textStyle: { color: '#e0e0e0' } },
        grid: { left: 80, right: 40, top: 10, bottom: 20 },
        xAxis: { type: 'value', axisLabel: { color: '#8892b0' }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } } },
        yAxis: { type: 'category', data: barData.map(d => d.name).reverse(),
            axisLabel: { color: '#ccd6f6', fontSize: 11 }, axisLine: { show: false }, axisTick: { show: false } },
        series: [{
            type: 'bar', data: barData.map(d => d.value).reverse(),
            itemStyle: {
                color: p => {
                    const v = p.value;
                    if (v < 35) return '#43e97b';
                    if (v < 75) return '#fddb3a';
                    if (v < 115) return '#fa709a';
                    return '#ff6b6b';
                },
                borderRadius: [0,4,4,0]
            },
            barWidth: 12,
            label: { show: true, position: 'right', color: '#ccd6f6', fontSize: 10 }
        }]
    }, true);
}

/* ==================== 散点 ==================== */
function initScatter() {
    const c = ensureChart('scatterChart');
    // 以各省 PM2.5 / PM10 为基准，为每个省份生成若干监测点，保持真实相关性
    const pm25List = generatePollutantData('pm25', currentDateOffset);
    const pm10List = generatePollutantData('pm10', currentDateOffset);
    const data = [];
    pm25List.forEach((d, i) => {
        const basePm10 = pm10List[i]?.value || d.value * 1.5;
        for (let k = 0; k < 5; k++) {
            const x = Math.max(5, Math.round(d.value + (seededRandom(i * 13 + k * 7 + currentDateOffset) - 0.5) * 16));
            const y = Math.max(10, Math.round(basePm10 + (seededRandom(i * 29 + k * 11 + 5) - 0.5) * 24));
            data.push([x, y]);
        }
    });
    c.setOption({
        tooltip: { trigger: 'item', backgroundColor: 'rgba(15,12,41,0.95)', textStyle: { color: '#e0e0e0' },
            formatter: p => `PM2.5: ${p.value[0]} μg/m³<br/>PM10: ${p.value[1]} μg/m³` },
        grid: { left: 50, right: 30, top: 20, bottom: 30 },
        xAxis: { name: 'PM2.5', nameTextStyle: { color: '#8892b0', fontSize: 11 }, type: 'value',
            axisLabel: { color: '#8892b0' }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } } },
        yAxis: { name: 'PM10', nameTextStyle: { color: '#8892b0', fontSize: 11 }, type: 'value',
            axisLabel: { color: '#8892b0' }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } } },
        series: [{
            type: 'scatter', data: data, symbolSize: 6,
            itemStyle: { color: 'rgba(79,172,254,0.55)', borderColor: '#4facfe', borderWidth: 0.8 }
        }, {
            type: 'line', smooth: true, showSymbol: false,
            lineStyle: { color: '#ff6b6b', width: 2, type: 'dashed' },
            data: [[10,25],[50,78],[100,145],[150,210],[190,265]]
        }]
    }, true);
}

/* ==================== 24小时 ==================== */
function initHour() {
    const c = ensureChart('hourChart');
    const hours = Array.from({ length: 24 }, (_, i) => i + ':00');
    function genSeries(base, offset) {
        return hours.map((_, i) => {
            let peak = 0;
            if (i >= 7 && i <= 9) peak = 25;
            if (i >= 17 && i <= 19) peak = 35;
            return Math.round(base + peak + seededRandom(i + offset + currentDateOffset) * 10);
        });
    }
    c.setOption({
        tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,12,41,0.95)', textStyle: { color: '#e0e0e0' } },
        legend: { data: ['PM2.5','NO₂','O₃','CO'], textStyle: { color: '#8892b0', fontSize: 10 }, top: 0 },
        grid: { left: 40, right: 44, top: 30, bottom: 24 },
        xAxis: { type: 'category', data: hours, axisLabel: { color: '#8892b0', fontSize: 9 }, axisLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } } },
        yAxis: [
            { type: 'value', name: 'μg/m³', nameTextStyle: { color: '#5a6280', fontSize: 9 },
              axisLabel: { color: '#8892b0', fontSize: 10 }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } } },
            { type: 'value', name: 'CO mg/m³', nameTextStyle: { color: '#5a6280', fontSize: 9 },
              axisLabel: { color: '#8892b0', fontSize: 10 }, splitLine: { show: false } }
        ],
        series: [
            { name: 'PM2.5', type: 'line', smooth: true, data: genSeries(45,1), itemStyle: { color:'#4facfe' }, lineStyle:{width:2} },
            { name: 'NO₂', type: 'line', smooth: true, data: genSeries(25,50), itemStyle: { color:'#fddb3a' }, lineStyle:{width:2} },
            { name: 'O₃', type: 'line', smooth: true, data: hours.map((_,i)=>Math.max(40, 90+Math.sin(i/24*Math.PI*2)*25+seededRandom(i+200+currentDateOffset)*8)), itemStyle: { color:'#43e97b' }, lineStyle:{width:2} },
            { name: 'CO', type: 'line', smooth: true, yAxisIndex: 1,
              data: hours.map((_,i)=>parseFloat((0.55 + Math.sin((i-6)/24*Math.PI*2)*0.18 + seededRandom(i+150+currentDateOffset)*0.12).toFixed(2))),
              itemStyle: { color:'#fa709a' }, lineStyle:{width:2} }
        ]
    }, true);
}

/* ==================== 区域对比 ==================== */
function initRegion() {
    const c = ensureChart('regionChart');
    const palette = { 华北:'#ff6b6b', 东北:'#fbc2eb', 华东:'#4facfe', 华南:'#43e97b', 西南:'#fddb3a', 西北:'#fa709a' };
    const stats = generateRegionStats(currentDateOffset);
    c.setOption({
        tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,12,41,0.95)', textStyle: { color: '#e0e0e0' }, axisPointer: { type: 'shadow' } },
        legend: { data: stats.map(r => r.name), textStyle: { color: '#8892b0' }, top: 0, itemWidth: 14, itemHeight: 8 },
        grid: { left: 50, right: 30, top: 40, bottom: 30 },
        xAxis: { type: 'category', data: ['AQI','PM2.5','PM10','NO₂','O₃'],
            axisLabel: { color: '#ccd6f6' }, axisLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } } },
        yAxis: { type: 'value', axisLabel: { color: '#8892b0' }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } } },
        series: stats.map(r => ({
            name: r.name, type: 'bar', data: r.values,
            itemStyle: { color: palette[r.name] || '#4facfe', borderRadius: [4,4,0,0] },
            barWidth: 12
        }))
    }, true);
}