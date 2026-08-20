/**
 * 生成智慧树助手扩展图标 (PNG)
 * 用法: node generate-icons.js
 */

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const COLORS = {
  bg1: { r: 102, g: 126, b: 234 }, // #667eea
  bg2: { r: 118, g: 75, b: 162 },  // #764ba2
  white: { r: 255, g: 255, b: 255 },
  screen1: { r: 255, g: 255, b: 255 },
  screen2: { r: 240, g: 244, b: 255 },
  play: { r: 102, g: 126, b: 234 },
  success: { r: 82, g: 196, b: 26 }, // #52c41a
  stroke: { r: 255, g: 255, b: 255 }
};

const lerp = (a, b, t) => a + (b - a) * t;
const lerpColor = (c1, c2, t) => ({
  r: Math.round(lerp(c1.r, c2.r, t)),
  g: Math.round(lerp(c1.g, c2.g, t)),
  b: Math.round(lerp(c1.b, c2.b, t))
});

const setPixel = (png, x, y, color, alpha = 255) => {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const idx = (png.width * y + x) << 2;
  png.data[idx] = color.r;
  png.data[idx + 1] = color.g;
  png.data[idx + 2] = color.b;
  png.data[idx + 3] = alpha;
};

// 圆角矩形使用中点圆算法
const fillRoundedRect = (png, x, y, w, h, r, color) => {
  // 主体矩形
  for (let j = y + r; j < y + h - r; j++) {
    for (let i = x; i < x + w; i++) {
      setPixel(png, i, j, color);
    }
  }
  // 顶部/底部无圆角区域
  for (let j = y; j < y + r; j++) {
    for (let i = x + r; i < x + w - r; i++) {
      setPixel(png, i, j, color);
    }
  }
  for (let j = y + h - r; j < y + h; j++) {
    for (let i = x + r; i < x + w - r; i++) {
      setPixel(png, i, j, color);
    }
  }
  // 四个圆角
  const corners = [
    { cx: x + r, cy: y + r },           // TL
    { cx: x + w - r - 1, cy: y + r },   // TR
    { cx: x + r, cy: y + h - r - 1 },   // BL
    { cx: x + w - r - 1, cy: y + h - r - 1 } // BR
  ];
  for (const c of corners) {
    for (let jj = -r; jj <= r; jj++) {
      for (let ii = -r; ii <= r; ii++) {
        if (ii * ii + jj * jj <= r * r + r) {
          setPixel(png, c.cx + ii, c.cy + jj, color);
        }
      }
    }
  }
};

// 绘制线性渐变背景
const fillGradientBg = (png) => {
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const t = (x / png.width) * 0.5 + (y / png.height) * 0.5;
      const c = lerpColor(COLORS.bg1, COLORS.bg2, t);
      setPixel(png, x, y, c);
    }
  }
};

// 填充圆
const fillCircle = (png, cx, cy, r, color) => {
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      if (x * x + y * y <= r * r) {
        setPixel(png, cx + x, cy + y, color);
      }
    }
  }
};

// 填充三角形 (scanline)
const fillTriangle = (png, x1, y1, x2, y2, x3, y3, color) => {
  const minY = Math.min(y1, y2, y3);
  const maxY = Math.max(y1, y2, y3);
  for (let y = minY; y <= maxY; y++) {
    const xs = [];
    const edges = [[x1,y1,x2,y2],[x2,y2,x3,y3],[x3,y3,x1,y1]];
    for (const [a, b, c, d] of edges) {
      if ((b <= y && d >= y) || (d <= y && b >= y)) {
        if (b === d) continue;
        const t = (y - b) / (d - b);
        xs.push(Math.round(a + t * (c - a)));
      }
    }
    xs.sort((a,b) => a-b);
    for (let x = xs[0]; x <= xs[xs.length-1]; x++) {
      setPixel(png, x, y, color);
    }
  }
};

// 绘制线段
const drawLine = (png, x1, y1, x2, y2, color, thickness = 1) => {
  const dx = Math.abs(x2 - x1), sx = x1 < x2 ? 1 : -1;
  const dy = -Math.abs(y2 - y1), sy = y1 < y2 ? 1 : -1;
  let err = dx + dy;
  let x = x1, y = y1;
  while (true) {
    for (let a = -Math.floor(thickness/2); a <= Math.floor(thickness/2); a++) {
      for (let b = -Math.floor(thickness/2); b <= Math.floor(thickness/2); b++) {
        setPixel(png, x + a, y + b, color);
      }
    }
    if (x === x2 && y === y2) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
};

const generateIcon = (size) => {
  console.log(`正在生成 ${size}x${size} 图标...`);
  const png = new PNG({ width: size, height: size });
  const S = size / 128; // 缩放系数 (基准 128px)

  // 1. 渐变背景
  fillGradientBg(png);

  // 2. 圆角裁剪 (透明背景圆角)
  // 用蒙版实现：先绘制背景，再把圆角外的像素设为透明
  const mask = new PNG({ width: size, height: size });
  fillRoundedRect(mask, 0, 0, size, size, Math.round(28 * S), { r: 1, g: 1, b: 1 });
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const mIdx = (size * y + x) << 2;
      if (mask.data[mIdx] === 0) {
        const idx = (size * y + x) << 2;
        png.data[idx + 3] = 0; // 透明
      }
    }
  }

  // 3. 屏幕矩形
  const screenX = Math.round(24 * S), screenY = Math.round(32 * S);
  const screenW = Math.round(80 * S), screenH = Math.round(56 * S);
  const screenR = Math.round(8 * S);
  // 屏幕渐变
  for (let j = 0; j < screenH; j++) {
    const t = j / screenH;
    const c = lerpColor(COLORS.screen1, COLORS.screen2, t);
    for (let i = 0; i < screenW; i++) {
      // 用距离判断圆角
      const rx = i < screenR ? screenR - 1 : (i >= screenW - screenR ? screenW - screenR : i);
      const ry = j < screenR ? screenR - 1 : (j >= screenH - screenR ? screenH - screenR : j);
      const dx = i - rx, dy = j - ry;
      if (dx*dx + dy*dy <= screenR*screenR) {
        setPixel(png, screenX + i, screenY + j, c);
      }
    }
  }

  // 4. 播放按钮三角形
  const p1x = Math.round(54 * S), p1y = Math.round(52 * S);
  const p2x = Math.round(82 * S), p2y = Math.round(60 * S);
  const p3x = Math.round(54 * S), p3y = Math.round(68 * S);
  fillTriangle(png, p1x, p1y, p2x, p2y, p3x, p3y, COLORS.play);

  // 5. 底座线
  const stand1Y = Math.round(96 * S), stand1H = Math.max(2, Math.round(6 * S));
  const stand1X = Math.round(36 * S), stand1W = Math.round(56 * S);
  for (let j = 0; j < stand1H; j++) {
    for (let i = 0; i < stand1W; i++) {
      setPixel(png, stand1X + i, stand1Y + j, { r: 255, g: 255, b: 255 }, 230);
    }
  }
  const stand2Y = Math.round(108 * S), stand2H = Math.max(2, Math.round(6 * S));
  const stand2X = Math.round(44 * S), stand2W = Math.round(40 * S);
  for (let j = 0; j < stand2H; j++) {
    for (let i = 0; i < stand2W; i++) {
      setPixel(png, stand2X + i, stand2Y + j, { r: 255, g: 255, b: 255 }, 180);
    }
  }

  // 6. 成功圆点 (仅限 48px 和 128px)
  if (size >= 48) {
    const dotCx = Math.round(96 * S), dotCy = Math.round(42 * S);
    const dotR = Math.max(4, Math.round(10 * S));
    fillCircle(png, dotCx, dotCy, dotR, { ...COLORS.success, a: 230 });
    // 对勾
    if (size >= 64) {
      const tk = Math.max(2, Math.round(2.5 * S));
      drawLine(png, Math.round(91*S), Math.round(42*S),
        Math.round(95*S), Math.round(46*S), COLORS.white, tk);
      drawLine(png, Math.round(95*S), Math.round(46*S),
        Math.round(101*S), Math.round(39*S), COLORS.white, tk);
    }
  }

  // 输出文件
  const outDir = path.join(__dirname, 'icons');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `icon${size}.png`);
  const buffer = PNG.sync.write(png);
  fs.writeFileSync(outPath, buffer);
  console.log(`✓ 已保存: ${outPath} (${buffer.length} bytes)`);
};

// 生成三种尺寸
generateIcon(16);
generateIcon(48);
generateIcon(128);
console.log('\n全部图标生成完成！');
