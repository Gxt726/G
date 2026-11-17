/* 数据生成层 - AQI/污染物/城市数据模拟 */
/* ==================== 数据层 ==================== */
const provinces = ['北京市','天津市','上海市','重庆市','河北省','山西省','辽宁省','吉林省','黑龙江省',
    '江苏省','浙江省','安徽省','福建省','江西省','山东省','河南省','湖北省','湖南省','广东省','海南省',
    '四川省','贵州省','云南省','陕西省','甘肃省','青海省','台湾省','内蒙古自治区','广西壮族自治区','西藏自治区',
    '宁夏回族自治区','新疆维吾尔自治区','香港特别行政区','澳门特别行政区'];

function seededRandom(seed) {
    let x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
}
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function aqiLevel(v) {
    if (v <= 50) return { name: '优', color: '#43e97b' };
    if (v <= 100) return { name: '良', color: '#84fab0' };
    if (v <= 150) return { name: '轻度污染', color: '#fddb3a' };
    if (v <= 200) return { name: '中度污染', color: '#fa709a' };
    return { name: '重度污染', color: '#ff6b6b' };
}

// 季节因子：月份偏移
function seasonFactor(month) {
    // 冬季(12,1,2)高，夏季(6,7,8)低
    if ([0,1,11].includes(month)) return 1.35;
    if ([2,3,9].includes(month)) return 1.1;
    if ([4,5,10].includes(month)) return 0.95;
    return 0.7;
}

// 基于日期偏移的数据生成
function generateAqiData(dateOffset) {
    const data = [];
    const today = new Date();
    const d = new Date(today); d.setDate(d.getDate() - dateOffset);
    const month = d.getMonth();
    const sf = seasonFactor(month);
    
    const highPollution = ['河北省','山西省','山东省','河南省','陕西省','新疆维吾尔自治区','内蒙古自治区'];
    const goodAir = ['海南省','福建省','台湾省','西藏自治区','云南省','四川省','香港特别行政区','澳门特别行政区'];
    
    provinces.forEach((p, i) => {
        let base = (40 + seededRandom(i + 1 + dateOffset * 7) * 80) * sf;
        if (highPollution.includes(p)) base += (40 + seededRandom(i * 2) * 30) * sf;
        if (goodAir.includes(p)) base *= 0.55;
        data.push({ name: p, value: Math.round(clamp(base, 15, 280)) });
    });
    return data;
}

function generatePollutantData(type, dateOffset) {
    const aqiData = generateAqiData(dateOffset);
    return aqiData.map(d => {
        let v = d.value;
        if (type === 'pm25') v = Math.round(clamp(d.value * 0.58 + seededRandom(provinces.indexOf(d.name) + dateOffset) * 18, 5, 200));
        if (type === 'pm10') v = Math.round(clamp(d.value * 0.85 + seededRandom(provinces.indexOf(d.name) + 50 + dateOffset) * 25, 10, 300));
        if (type === 'o3') v = Math.round(clamp(40 + seededRandom(provinces.indexOf(d.name) + 100 + dateOffset) * 80, 20, 180));
        if (type === 'no2') v = Math.round(clamp(20 + seededRandom(provinces.indexOf(d.name) + 200 + dateOffset) * 40, 8, 100));
        if (type === 'so2') v = Math.round(clamp(8 + seededRandom(provinces.indexOf(d.name) + 300 + dateOffset) * 25, 2, 60));
        return { name: d.name, value: v };
    });
}

const cities = {
    good: ['三亚','海口','舟山','龙岩','福州','厦门','泉州','宁德','普洱','临沧',
           '迪庆','深圳','珠海','湛江','茂名','北海','防城港','钦州','贵港','安顺'],
    bad: ['石家庄','太原','保定','邯郸','邢台','唐山','洛阳','咸阳','渭南','临汾',
          '大同','张家口','西安','郑州','安阳','新乡','焦作','聊城','德州','滨州']
};
function generateCityData(type, dateOffset) {
    const list = cities[type];
    const sf = seasonFactor(new Date().getMonth());
    return list.map((c, i) => {
        if (type === 'good') return { name: c, value: Math.round(clamp(20 + seededRandom(i + 50 + dateOffset) * 30 * sf * 0.7, 10, 80)) };
        return { name: c, value: Math.round(clamp((120 + seededRandom(i + 60 + dateOffset) * 100) * sf, 60, 280)) };
    });
}