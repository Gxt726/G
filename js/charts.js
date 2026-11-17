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

// 兜底：不依赖外部 GeoJSON 时，用省份中心经纬度画散点图代替地图
function registerFallbackMap() {
    // 用一个极简的空 GeoJSON 注册，ECharts map 会退化成散点
    const fallbackGeo = {
        type: 'FeatureCollection',
        features: provinces.map((name, i) => ({
            type: 'Feature',
            properties: { name: name, adcode: i + 1 },
            geometry: { type: 'Point', coordinates: [0, 0] }
        }))
    };
    echarts.registerMap('china', fallbackGeo);
    mapRegistered = true;
}

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

function initOverview() {
    const aqiData = generateAqiData(currentDateOffset);
    const avg = Math.round(aqiData.reduce((s, d) => s + d.value, 0) / aqiData.length);
    animateNumber(document.getElementById('avgAqi'), avg);
    animateNumber(document.getElementById('goodRate'), 68.5 + seededRandom(currentDateOffset + 1) * 12, '', 1);
    animateNumber(document.getElementById('pollutedCities'), 75 + Math.round(seededRandom(currentDateOffset + 2) * 20));
    document.getElementById('topPollutantVal').textContent = Math.round(avg * 0.6) + ' μg/m³';
    document.getElementById('updateTime').textContent = new Date().toLocaleTimeString('zh-CN', { hour12: false });
}

/* ==================== 地图 ==================== */
function initMap() {
    try {
        const c = ensureChart('chinaMap');
        if (!c) return;
        // 判断 china 地图是否可用
        try {
            // 尝试一个空 setOption，如果地图没注册会抛异常
            c.setOption({ series: [{ type: 'map', map: 'china', data: [] }] });
        } catch(e) {
            console.warn('[initMap] china map not registered, using scatter fallback');
            renderScatterFallback('aqi');
            // 绑定点击
            c.on('click', (p) => { if (p.name) openProvinceModal(p.name); });
            return;
        }
        // 注册成功，绑定点击并渲染
        c.on('click', (p) => { if (p.componentType === 'series' && p.name) openProvinceModal(p.name); });
        renderMap('aqi');
    } catch(e) {
        console.error('[initMap] FAILED', e);
        renderScatterFallback('aqi');
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
        c.setOption({
            tooltip: {
                trigger: 'item',
                backgroundColor: 'rgba(15,12,41,0.95)', borderColor: '#4facfe',
                textStyle: { color: '#e0e0e0', fontSize: 13 },
                formatter: p => {
                    const v = p.value, lvl = v ? aqiLevel(v) : null;
                    return `<b style="color:${lvl ? lvl.color : '#ccd6f6'}">${p.name}</b><br/>
                            ${titleMap[type]}: ${v || '--'} ${lvl ? '· <span style="color:'+lvl.color+'">'+lvl.name+'</span>' : ''}`;
                }
            },
            visualMap: {
                min: 20, max: 220, left: 16, bottom: 16, calculable: true,
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
                text: '⚠ 地图数据加载中，暂以散点显示',
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
    } catch(e) {
        console.error('[renderScatterFallback] FAILED', e);
    }
}

/* ==================== 饼图 ==================== */
function initPie() {
    const c = ensureChart('levelPie');
    c.setOption({
        tooltip: { trigger: 'item', backgroundColor: 'rgba(15,12,41,0.95)', textStyle: { color: '#e0e0e0' } },
        legend: { bottom: 0, textStyle: { color: '#8892b0', fontSize: 11 }, itemWidth: 10, itemHeight: 10 },
        series: [{
            type: 'pie', radius: ['38%', '72%'], center: ['50%', '45%'],
            animationType: 'scale', animationEasing: 'elasticOut', animationDuration: 800,
            label: { show: true, color: '#ccd6f6', fontSize: 11, formatter: '{d}%' },
            labelLine: { lineStyle: { color: 'rgba(255,255,255,0.2)' } },
            itemStyle: { borderColor: 'rgba(15,12,41,1)', borderWidth: 3 },
            data: [
                { value: 89, name: '优', itemStyle: { color: '#43e97b' } },
                { value: 156, name: '良', itemStyle: { color: '#84fab0' } },
                { value: 58, name: '轻度', itemStyle: { color: '#fddb3a' } },
                { value: 28, name: '中度', itemStyle: { color: '#fa709a' } },
                { value: 8, name: '重度', itemStyle: { color: '#ff6b6b' } }
            ]
        }]
    }, true);
}

/* ==================== 雷达 ==================== */
function initRadar() {
    const c = ensureChart('pollutantRadar');
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
                { name: '全国', value: [78,112,15,42,1.2,85], symbol:'circle', symbolSize:5, areaStyle:{opacity:0.12}, itemStyle:{color:'#4facfe'} },
                { name: '北京', value: [98,135,12,58,1.5,95], symbol:'circle', symbolSize:5, areaStyle:{opacity:0.08}, itemStyle:{color:'#ff6b6b'} },
                { name: '上海', value: [55,88,8,38,0.9,78], symbol:'circle', symbolSize:5, areaStyle:{opacity:0.08}, itemStyle:{color:'#43e97b'} },
                { name: '广州', value: [48,72,5,32,0.7,88], symbol:'circle', symbolSize:5, areaStyle:{opacity:0.08}, itemStyle:{color:'#fddb3a'} }
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
            const base = seasonFactor(i === 11 ? -1 : i) * 75;
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
            // 预测置信区间（以全国为例，灰色带）
            { name: 'AI 置信区间', type: 'line', data: [null,...Array(12).fill(null),...s1.upper],
                lineStyle: { opacity: 0 }, symbol: 'none', stack: 'conf',
                areaStyle: { color: 'rgba(161,140,209,0.1)' } },
            { name: 'AI 置信区间', type: 'line', data: [null,...Array(12).fill(null),...s1.lower],
                lineStyle: { opacity: 0 }, symbol: 'none',
                areaStyle: { color: 'rgba(15,12,41,1)' } },
            
            { name: '全国', type: 'line', smooth: true, data: s1.allData,
                lineStyle: { width: 3, color: s1.color }, itemStyle: { color: s1.color },
                areaStyle: { color: new echarts.graphic.LinearGradient(0,0,0,1,[
                    { offset:0, color:'rgba(79,172,254,0.3)' }, { offset:1, color:'rgba(79,172,254,0)' }
                ])},
                markLine: { silent: true, symbol: 'none',
                    lineStyle: { color: 'rgba(161,140,209,0.5)', type: 'dashed' },
                    data: [{ xAxis: 12 }]
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
    const barData = provinces.map((p, i) => ({
        name: p.replace(/省|市|自治区|特别行政区|壮族|回族|维吾尔/g,''),
        value: Math.round(clamp(30 + seededRandom(i * 7 + currentDateOffset * 3) * 90, 10, 180))
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
                    if (v < 50) return '#43e97b';
                    if (v < 75) return '#fddb3a';
                    if (v < 100) return '#fa709a';
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
    const data = [];
    for (let i = 0; i < 200; i++) {
        const pm25 = 10 + seededRandom(i * 3 + currentDateOffset) * 180;
        const pm10 = pm25 * 1.3 + seededRandom(i * 5) * 30;
        data.push([Math.round(pm25), Math.round(pm10)]);
    }
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
            return Math.round(base + peak + seededRandom(i + offset) * 10);
        });
    }
    c.setOption({
        tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,12,41,0.95)', textStyle: { color: '#e0e0e0' } },
        legend: { data: ['PM2.5','NO₂','O₃','CO'], textStyle: { color: '#8892b0', fontSize: 10 }, top: 0 },
        grid: { left: 40, right: 20, top: 30, bottom: 24 },
        xAxis: { type: 'category', data: hours, axisLabel: { color: '#8892b0', fontSize: 9 }, axisLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } } },
        yAxis: { type: 'value', axisLabel: { color: '#8892b0', fontSize: 10 }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } } },
        series: [
            { name: 'PM2.5', type: 'line', smooth: true, data: genSeries(45,1), itemStyle: { color:'#4facfe' }, lineStyle:{width:2} },
            { name: 'NO₂', type: 'line', smooth: true, data: genSeries(25,50), itemStyle: { color:'#fddb3a' }, lineStyle:{width:2} },
            { name: 'O₃', type: 'line', smooth: true, data: hours.map((_,i)=>Math.max(40, 90+Math.sin(i/24*Math.PI*2)*25+seededRandom(i+200)*8)), itemStyle: { color:'#43e97b' }, lineStyle:{width:2} },
            { name: 'CO', type: 'line', smooth: true, data: genSeries(0.8,150).map(v=>(v/30).toFixed(2)), itemStyle: { color:'#fa709a' }, lineStyle:{width:2} }
        ]
    }, true);
}

/* ==================== 区域对比 ==================== */
function initRegion() {
    const c = ensureChart('regionChart');
    c.setOption({
        tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,12,41,0.95)', textStyle: { color: '#e0e0e0' }, axisPointer: { type: 'shadow' } },
        legend: { data: ['华北','华东','华南','西南','西北'], textStyle: { color: '#8892b0' }, top: 0, itemWidth: 14, itemHeight: 8 },
        grid: { left: 50, right: 30, top: 40, bottom: 30 },
        xAxis: { type: 'category', data: ['AQI','PM2.5','PM10','NO₂','O₃'],
            axisLabel: { color: '#ccd6f6' }, axisLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } } },
        yAxis: { type: 'value', axisLabel: { color: '#8892b0' }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } } },
        series: [
            { name:'华北', type:'bar', data:[120,85,125,48,90], itemStyle:{color:'#ff6b6b',borderRadius:[4,4,0,0]}, barWidth:12 },
            { name:'华东', type:'bar', data:[78,52,82,38,88], itemStyle:{color:'#4facfe',borderRadius:[4,4,0,0]}, barWidth:12 },
            { name:'华南', type:'bar', data:[55,35,58,28,95], itemStyle:{color:'#43e97b',borderRadius:[4,4,0,0]}, barWidth:12 },
            { name:'西南', type:'bar', data:[62,40,68,32,80], itemStyle:{color:'#fddb3a',borderRadius:[4,4,0,0]}, barWidth:12 },
            { name:'西北', type:'bar', data:[95,65,110,45,75], itemStyle:{color:'#fa709a',borderRadius:[4,4,0,0]}, barWidth:12 }
        ]
    }, true);
}