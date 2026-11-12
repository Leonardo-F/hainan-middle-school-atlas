/**
 * js/interiors.js —— 重点建筑首层室内场景（供自动化影片「进入建筑内部」使用）。
 *
 * 设计说明
 * --------
 * 场景约定（与 js/site.js / js/campus-accurate.js 一致）：
 *   1 场景单位 = 2 m；x = 东，z = 南（北 = -z）；建筑群组基座 y = 0.06。
 *   建筑群组用「中心点 + rotation.y」放样：
 *     主教学楼  js/landmarks/teaching.js，rotation.y = deg(-obb[2]) = deg(-138.5)；前端 +z 朝西北校园内。
 *     图书馆    js/landmarks/library.js， rotation.y = deg(180 - obb[2]) = deg(41.5)；前端 +z 朝东南。
 *     凤栖堂    js/landmarks/fengqi.js，  rotation.y = deg(180 - obb[2]) = deg(39.75)；前端 +z 朝庭院。
 *   因此本模块为每栋建筑建一个与外壳完全同位置/同旋转的 Group，室内几何一律用
 *   **该建筑的局部坐标**（场景单位）书写，再由 localToWorld() 把机位换算成世界坐标。
 *
 * 为什么室内不会被外壳挡住/看不到：
 *   三栋外壳都是实体 Box/Extrude，材质单面（FrontSide）。从建筑内部看时，外壳面都是
 *   背面 → 被剔除；而室外看时外壳正面不透明 → 室内被完全遮住。因此把室内几何塞进
 *   外壳体积内既能从内部看到，也不会影响外景。室内自带地板/天花/四面墙，形成封闭房间。
 *
 * 尺度依据（各模块的米制常量 × 0.5 = 场景单位）：
 *   主教学楼：TOTAL_L 114 m → 57，WING_FRONT 8.2 m → 4.1，BACK_Z -7.8 m → -3.9，
 *            PLINTH 0.75 m → 0.375（室内地面），中央门厅通高 CENTER_GROUND_TOP 7.5 m → 3.75。
 *   图书馆：  W 38 m → 19，D 20 m → 10，PLINTH 1.1 m → 0.55，一层顶板 F1_TOP 5.3 m → 2.65。
 *   凤栖堂：  W 22.1 m → 11.05，HALL_FRONT 3.25 m → 1.625，HALL_BACK -6.25 m → -3.125，
 *            FLOOR 0.78 m → 0.39，WALL_TOP 5.05 m → 2.525。
 *   除地板/天花与灯具外不新增外部资源；黑板、书架书脊用 Canvas 现场绘制（Node 下容错）。
 *
 * 导出：buildInteriors({ M, tex, reducedMotion }) → { group, cameras }
 *   group   室内全部几何 + 暖点光（Lead 会 world.add，dispose 由 world.traverse 覆盖）
 *   cameras 固定键名：mainHallLobby / mainHallCorridor / mainHallClassroom /
 *           mainHallClassroomBack / libraryReading，
 *           每项 { position:[x,y,z], target:[x,y,z], fov }，
 *           世界场景坐标，相机高度约 1.2–1.5（人眼高度 = 地面 + 约 0.8 单位 ≈ 1.6 m）。
 */
import * as THREE from 'three';
import { SITE } from './site.js';

const D2R = Math.PI / 180;
const BASE_Y = 0.06;          // 与 campus-accurate.js 中建筑 group.position.y 一致

/* ------------------------------------------------------------------ */
/*  小工具                                                             */
/* ------------------------------------------------------------------ */

function findBuilding(name) {
  const b = SITE.buildings.find((item) => item.name === name);
  if (!b) throw new Error(`interiors.js: site.js 缺少建筑「${name}」`);
  return b;
}

/** 建筑局部坐标（场景单位）→ 世界坐标；ly 为相对群组基座的高度。 */
function localToWorld(b, rotDeg, [lx, ly, lz]) {
  const th = rotDeg * D2R;
  const c = Math.cos(th);
  const s = Math.sin(th);
  return [
    b.center[0] + c * lx + s * lz,
    BASE_Y + ly,
    b.center[1] - s * lx + c * lz
  ];
}

/** 盒体：y 为几何中心高度（局部坐标）。 */
function addBox(parent, material, w, h, d, x, y, z, ry = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.rotation.y = ry;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/** 沿 x 方向的墙（法线朝 ±z），z 固定。 */
function wallX(parent, material, z, x0, x1, y0, y1, thickness = 0.12) {
  if (x1 - x0 < 1e-3 || y1 - y0 < 1e-3) return null;
  return addBox(parent, material, x1 - x0, y1 - y0, thickness,
    (x0 + x1) / 2, (y0 + y1) / 2, z);
}

/** 沿 z 方向的墙（法线朝 ±x），x 固定。 */
function wallZ(parent, material, x, z0, z1, y0, y1, thickness = 0.12) {
  if (z1 - z0 < 1e-3 || y1 - y0 < 1e-3) return null;
  return addBox(parent, material, thickness, y1 - y0, z1 - z0,
    x, (y0 + y1) / 2, (z0 + z1) / 2);
}

/** 发光/透光面板（不需要光照，视觉上像窗/灯）。 */
function addPane(parent, material, w, h, x, y, z, ry = 0, d = 0.05) {
  return addBox(parent, material, w, h, d, x, y, z, ry);
}

/** Canvas 贴图（Node / 无 document 时返回 null，调用方需容错）。 */
function makeCanvasTexture(w, h, draw) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  draw(ctx, w, h);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** 固定种子伪随机（Canvas 手绘细节要可复现，避免截图回归抖动）。 */
function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** 暖点光（室内专用；强度/距离都限制在房间尺度，避免溢到外景）。 */
function addWarmLight(parent, x, y, z, intensity, distance) {
  const light = new THREE.PointLight(0xffcf9e, intensity, distance, 2);
  light.position.set(x, y, z);
  light.castShadow = false;
  parent.add(light);
  return light;
}

/* ------------------------------------------------------------------ */
/*  材质                                                               */
/* ------------------------------------------------------------------ */

function buildMats(M, tex) {
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra });
  const signMaterial = (map) => (map
    ? (M.signMaterial ? M.signMaterial(map, true) : mat(0xffffff, { map }))
    : mat(0xcfc3a8));
  const blackboardMap = makeCanvasTexture(1024, 384, (g, w, h) => {
    g.fillStyle = '#26362f';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(238,232,214,.18)';
    g.lineWidth = 10;
    g.strokeRect(18, 18, w - 36, h - 36);
    g.fillStyle = 'rgba(240,235,220,.86)';
    g.font = '600 96px "Songti SC", "STSong", "Noto Serif SC", serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('海 南 中 學', w / 2, h * 0.36);
    g.font = '500 44px "Songti SC", "STSong", serif';
    g.fillStyle = 'rgba(240,235,220,.6)';
    g.fillText('— 自 强 不 息 · 厚 德 载 物 —', w / 2, h * 0.66);
    g.strokeStyle = 'rgba(240,235,220,.45)';
    g.lineWidth = 5;
    for (const y of [h * 0.82, h * 0.89]) {
      g.beginPath();
      g.moveTo(w * 0.2, y);
      g.lineTo(w * 0.8, y);
      g.stroke();
    }
  });
  const bookSpineMap = makeCanvasTexture(512, 256, (g, w, h) => {
    g.fillStyle = '#3a2d22';
    g.fillRect(0, 0, w, h);
    const colors = ['#8a4b32', '#33594a', '#8c6a3a', '#5a3d55', '#7a3b3b', '#3f4f6b', '#6d5b3a'];
    const shelfs = 4;
    const rows = 4;
    const rowH = h / rows;
    for (let r = 0; r < rows; r += 1) {
      g.fillStyle = '#241a12';
      g.fillRect(0, r * rowH + rowH - 7, w, 7);   // 每层隔板
      let x = 8;
      let i = 0;
      while (x < w - 10) {
        const bw = 12 + ((i * 7 + r * 11) % 13);
        const bh = rowH * (0.62 + ((i * 5 + r * 3) % 4) * 0.07);
        g.fillStyle = colors[(i + r * 3) % colors.length];
        g.fillRect(x, r * rowH + rowH - 7 - bh, bw - 3, bh);
        g.fillStyle = 'rgba(240,228,200,.4)';
        g.fillRect(x + 2, r * rowH + rowH - 7 - bh + 6, bw - 7, 3);
        x += bw;
        i += 1;
      }
    }
    g.fillStyle = 'rgba(0,0,0,.18)';
    for (let s = 1; s < shelfs; s += 1) g.fillRect(0, (s * h) / shelfs - 2, w, 3);
  });
  // 地面：浅暖灰石砖网格（Canvas）——给室内一个可读的尺度/透视参照
  const tileMap = makeCanvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#b9b0a0';
    g.fillRect(0, 0, w, h);
    const n = 4;
    for (let r = 0; r < n; r += 1) {
      for (let c = 0; c < n; c += 1) {
        const v = 172 + ((r * 7 + c * 5) % 4) * 6;
        g.fillStyle = `rgb(${v + 8},${v + 4},${v - 6})`;
        g.fillRect((c * w) / n + 2, (r * h) / n + 2, w / n - 4, h / n - 4);
      }
    }
    g.strokeStyle = 'rgba(74,68,58,.22)';
    g.lineWidth = 2;
    for (let i = 0; i <= n; i += 1) {
      g.beginPath(); g.moveTo((i * w) / n, 0); g.lineTo((i * w) / n, h); g.stroke();
      g.beginPath(); g.moveTo(0, (i * h) / n); g.lineTo(w, (i * h) / n); g.stroke();
    }
  });
  if (tileMap) {
    tileMap.wrapS = tileMap.wrapT = THREE.RepeatWrapping;
    tileMap.repeat.set(3, 3);
  }
  const woodMap = makeCanvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#7a5a3c';
    g.fillRect(0, 0, w, h);
    const rows = 8;
    for (let r = 0; r < rows; r += 1) {
      const v = 108 + ((r * 13) % 5) * 9;
      g.fillStyle = `rgb(${v + 34},${v - 4},${v - 42})`;
      g.fillRect(0, (r * h) / rows + 2, w, h / rows - 4);
      g.strokeStyle = 'rgba(40,28,18,.28)';
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(0, (r * h) / rows); g.lineTo(w, (r * h) / rows); g.stroke();
    }
  });
  if (woodMap) {
    woodMap.wrapS = woodMap.wrapT = THREE.RepeatWrapping;
    woodMap.repeat.set(2, 4);
  }
  /* ---------------- 教室专属 Canvas 贴图 ----------------
   * 教室朝向参考照片做「白储物柜 + 学生海主题壁画 + 绿窗帘」的识别点；
   * 全部由 Canvas 生成，不引入外部资源。贴图按真实版面比例绘制，
   * 避免普通平面图被拉伸后校徽变椭圆。 */
  // 储物柜门板：7 列 × 1 层，门板横向比约 3.4:1（与最终 0.58 × 0.17 平面一致）
  const lockerMap = makeCanvasTexture(3072, 128, (g, w, h) => {
    g.fillStyle = '#b7b0a1';
    g.fillRect(0, 0, w, h);
    const cols = 7;
    const cw = w / cols;
    for (let c = 0; c < cols; c += 1) {
      const x = c * cw;
      // 门缝阴影
      g.fillStyle = '#9c9484';
      g.fillRect(x + 2, 2, cw - 4, h - 4);
      // 米白门板 + 上亮下暗的轻微渐变
      const grad = g.createLinearGradient(0, 4, 0, h - 4);
      grad.addColorStop(0, '#fbf8ef');
      grad.addColorStop(0.62, '#f2eddf');
      grad.addColorStop(1, '#e2dccb');
      g.fillStyle = grad;
      g.fillRect(x + 6, 5, cw - 12, h - 10);
      // 内嵌门框与倒角
      g.strokeStyle = 'rgba(126,118,101,.42)';
      g.lineWidth = 3;
      g.strokeRect(x + 11, 9, cw - 22, h - 18);
      g.strokeStyle = 'rgba(255,253,245,.72)';
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(x + 14, h - 13); g.lineTo(x + 14, 13); g.lineTo(x + cw - 16, 13); g.stroke();
      // 顶部通风槽
      g.fillStyle = 'rgba(86,88,80,.32)';
      for (let v = 0; v < 3; v += 1) g.fillRect(x + cw - 78, 20 + v * 7, 40, 2);
      // 圆形校徽（深青圆章 + 暖白内圈 + 单字「海」）
      const bx = x + cw * 0.255;
      const by = h * 0.52;
      const br = h * 0.285;
      g.fillStyle = 'rgba(52,50,43,.22)';
      g.beginPath(); g.arc(bx + 2, by + 2, br + 3, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#eee6d2';
      g.beginPath(); g.arc(bx, by, br + 3, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#8b8069';
      g.lineWidth = 2;
      g.beginPath(); g.arc(bx, by, br + 2, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#2c4d4b';
      g.beginPath(); g.arc(bx, by, br, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(236,226,202,.92)';
      g.lineWidth = 2;
      g.beginPath(); g.arc(bx, by, br - 4, 0, Math.PI * 2); g.stroke();
      g.fillStyle = 'rgba(243,235,215,.95)';
      g.font = `600 ${Math.round(br * 1.05)}px "Songti SC", "STSong", serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('海', bx, by + 1);
      // 深色细把手 + 高光
      const hx = x + cw * 0.735;
      const hy = h * 0.53;
      g.fillStyle = 'rgba(46,43,36,.9)';
      g.fillRect(hx - 5, hy - 22, 10, 44);
      g.fillStyle = 'rgba(255,250,235,.34)';
      g.fillRect(hx - 3, hy - 19, 2, 16);
      g.fillStyle = 'rgba(46,43,36,.75)';
      g.fillRect(hx - 8, hy - 25, 16, 4);
      g.fillRect(hx - 8, hy + 21, 16, 4);
      // 门板底部轻微磨损
      g.fillStyle = 'rgba(118,106,86,.12)';
      g.fillRect(x + 18, h - 18, cw - 36, 4);
    }
    // 层板接缝
    g.fillStyle = 'rgba(86,79,67,.42)';
    g.fillRect(0, h - 3, w, 3);
  });
  // 学生壁画：深海、浪、鲸、橙色鱼群、珊瑚与胶带贴纸
  const muralMap = makeCanvasTexture(1536, 320, (g, w, h) => {
    const rand = seededRandom(20261112);
    const bg = g.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#0a2a44');
    bg.addColorStop(0.52, '#124c65');
    bg.addColorStop(1, '#072132');
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    // 颜料/画布肌理：横向短笔触
    for (let i = 0; i < 950; i += 1) {
      const x = rand() * w;
      const y = rand() * h;
      const a = 0.02 + rand() * 0.045;
      g.fillStyle = `rgba(${148 + Math.round(rand() * 90)},${185 + Math.round(rand() * 60)},${196 + Math.round(rand() * 50)},${a})`;
      g.fillRect(x, y, 3 + rand() * 34, 1 + rand() * 2);
    }
    // 远海的水色横带
    g.fillStyle = 'rgba(35,122,144,.5)';
    g.fillRect(0, h * 0.34, w, h * 0.17);
    g.fillStyle = 'rgba(84,174,178,.28)';
    g.fillRect(0, h * 0.47, w, h * 0.12);
    // 三层滚浪：用贝塞尔画不规则浪脊，再填充到画布底部
    const wave = (baseY, amp, fill, crest, lw) => {
      g.beginPath();
      g.moveTo(-30, baseY);
      for (let x = -30; x < w + 30; x += 120) {
        const yy = baseY + Math.sin(x / 150 + baseY) * amp * 0.32 + (rand() - 0.5) * amp;
        g.quadraticCurveTo(x + 60, yy - amp * 0.8, x + 120, yy);
      }
      g.lineTo(w + 30, h);
      g.lineTo(-30, h);
      g.closePath();
      g.fillStyle = fill;
      g.fill();
      // 浪脊高光
      g.save();
      g.strokeStyle = crest;
      g.lineWidth = lw;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(-20, baseY + 4);
      for (let x = -20; x < w + 20; x += 120) {
        const yy = baseY + Math.sin(x / 150 + baseY) * amp * 0.32 + (rand() - 0.5) * amp;
        g.quadraticCurveTo(x + 60, yy - amp * 0.8, x + 120, yy);
      }
      g.stroke();
      g.restore();
    };
    wave(h * 0.42, 30, 'rgba(30,111,138,.66)', 'rgba(176,229,226,.38)', 5);
    wave(h * 0.55, 38, 'rgba(18,75,106,.82)', 'rgba(186,236,231,.58)', 7);
    wave(h * 0.72, 30, 'rgba(8,37,58,.92)', 'rgba(130,208,210,.5)', 6);
    // 鲸鱼剪影放在壁画中段（后排机位能看到整只，而不是被画面左缘切掉）。
    // 先定义、等鱼群画完再落笔，避免橙色小鱼把鲸鱼盖成一块难以辨认的黑斑。
    const drawWhale = () => {
      g.save();
      g.translate(w * 0.53, h * 0.37);
      g.rotate(-0.06);
      g.scale(0.92, 0.92);
      g.fillStyle = '#061a29';
      g.beginPath();
      g.moveTo(-118, 20);
      g.bezierCurveTo(-98, -34, -12, -48, 70, -22);
      g.bezierCurveTo(112, -8, 122, 18, 96, 34);
      g.bezierCurveTo(64, 52, -8, 50, -58, 40);
      g.bezierCurveTo(-86, 35, -108, 30, -118, 20);
      g.closePath();
      g.fill();
      // 尾鳍
      g.beginPath();
      g.moveTo(-112, 22);
      g.quadraticCurveTo(-150, 2, -168, -16);
      g.quadraticCurveTo(-150, 35, -136, 36);
      g.quadraticCurveTo(-124, 34, -112, 22);
      g.fill();
      // 背鳍
      g.beginPath();
      g.moveTo(-34, -36);
      g.quadraticCurveTo(-24, -64, -2, -38);
      g.closePath();
      g.fill();
      // 腹部高光与眼睛，让剪影更像鲸而不是黑色块
      g.strokeStyle = 'rgba(126,198,206,.55)';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(-92, 30);
      g.quadraticCurveTo(-6, 44, 82, 25);
      g.stroke();
      g.fillStyle = 'rgba(187,232,233,.78)';
      g.beginPath(); g.arc(84, -9, 3.6, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(6,26,41,.9)';
      g.beginPath(); g.arc(85, -9, 1.8, 0, Math.PI * 2); g.fill();
      g.restore();
    };
    // 橙色/珊瑚色鱼群（大小错落，部分带白色环纹）
    const fish = (x, y, s, color, flip) => {
      g.save();
      g.translate(x, y);
      g.scale(flip ? -s : s, s);
      g.rotate((rand() - 0.5) * 0.24);
      g.fillStyle = color;
      g.beginPath();
      g.ellipse(0, 0, 22, 10, 0, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.moveTo(-18, 0);
      g.lineTo(-36, -12);
      g.lineTo(-31, 0);
      g.lineTo(-36, 12);
      g.closePath();
      g.fill();
      g.beginPath();
      g.moveTo(-2, -9);
      g.lineTo(4, -18);
      g.lineTo(12, -7);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(255,241,214,.88)';
      g.beginPath();
      g.ellipse(2, -4, 7, 2.6, -0.2, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#1c2427';
      g.beginPath(); g.arc(12, -2, 2.1, 0, Math.PI * 2); g.fill();
      g.restore();
    };
    const fishColors = ['#e76f2c', '#f2a13a', '#d9532c', '#ef8a3f', '#f6bd58'];
    for (let i = 0; i < 12; i += 1) {
      const x = w * (0.46 + rand() * 0.48);
      const y = h * (0.25 + rand() * 0.43);
      const s = 0.55 + rand() * 0.75;
      fish(x, y, s, fishColors[i % fishColors.length], rand() < 0.45);
    }
    fish(w * 0.62, h * 0.34, 1.75, '#f08a32', false);
    fish(w * 0.72, h * 0.55, 1.35, '#e35d2f', true);
    drawWhale();
    // 水泡
    for (let i = 0; i < 26; i += 1) {
      const x = w * (0.42 + rand() * 0.53);
      const y = h * (0.18 + rand() * 0.55);
      g.strokeStyle = `rgba(208,242,238,${0.18 + rand() * 0.28})`;
      g.lineWidth = 1.5;
      g.beginPath(); g.arc(x, y, 2 + rand() * 6, 0, Math.PI * 2); g.stroke();
    }
    // 右下角珊瑚
    const coral = (x, y, len, color, dir) => {
      g.strokeStyle = color;
      g.lineCap = 'round';
      for (let b = 0; b < 3; b += 1) {
        g.lineWidth = 8 - b * 1.6;
        g.beginPath();
        g.moveTo(x + b * 15, y);
        g.quadraticCurveTo(x + b * 20 + dir * 26, y - len * 0.5, x + b * 20 + dir * (36 + b * 8), y - len);
        g.stroke();
      }
    };
    coral(w * 0.82, h * 0.96, 68, '#e06a44', 1);
    coral(w * 0.9, h * 0.98, 54, '#f0a15a', -1);
    coral(w * 0.74, h * 0.98, 46, '#cf4f45', 1);
    // 贴在壁画上的白纸（胶带 + 淡淡铅笔线）
    const paper = (px, py, pw, ph, rot) => {
      g.save();
      g.translate(px, py);
      g.rotate(rot);
      g.fillStyle = 'rgba(20,20,18,.21)';
      g.fillRect(-pw / 2 + 2, -ph / 2 + 3, pw, ph);
      g.fillStyle = '#f3eddb';
      g.fillRect(-pw / 2, -ph / 2, pw, ph);
      g.strokeStyle = 'rgba(74,92,92,.24)';
      g.lineWidth = 1.5;
      for (let l = 1; l <= 4; l += 1) {
        g.beginPath();
        g.moveTo(-pw / 2 + 9, -ph / 2 + (ph / 5.5) * l);
        g.lineTo(pw / 2 - 9, -ph / 2 + (ph / 5.5) * l);
        g.stroke();
      }
      g.fillStyle = 'rgba(214,207,186,.9)';
      g.fillRect(-pw / 2 + pw * 0.12, -ph / 2 - 5, 34, 10);
      g.fillRect(pw / 2 - pw * 0.24, -ph / 2 - 5, 34, 10);
      g.restore();
    };
    paper(w * 0.79, h * 0.21, 104, 132, 0.03);
    paper(w * 0.91, h * 0.17, 76, 96, -0.06);
    paper(w * 0.36, h * 0.14, 58, 76, -0.04);
    // 白色浪花/颜料点
    for (let i = 0; i < 120; i += 1) {
      g.fillStyle = `rgba(232,248,244,${0.06 + rand() * 0.18})`;
      g.beginPath(); g.arc(rand() * w, h * (0.4 + rand() * 0.58), 1 + rand() * 3, 0, Math.PI * 2); g.fill();
    }
  });
  // 绿色窗帘：竖向褶皱 + 上下卷边
  const curtainMap = makeCanvasTexture(160, 512, (g, w, h) => {
    for (let x = 0; x < w; x += 1) {
      const f = 0.5 + 0.5 * Math.sin((x / w) * Math.PI * 7 + 0.7);
      const f2 = 0.5 + 0.5 * Math.sin((x / w) * Math.PI * 15 + 1.6);
      const v = 58 + 24 * f + 7 * f2;
      g.fillStyle = `rgb(${Math.round(v * 0.78)},${Math.round(v * 1.1)},${Math.round(v * 0.8)})`;
      g.fillRect(x, 0, 1, h);
    }
    // 横向的织物褶皱阴影，避免像硬条纹布
    for (let y = 0; y < h; y += 1) {
      const band = Math.sin((y / h) * Math.PI * 6 + 0.4) * 0.5 + 0.5;
      g.fillStyle = `rgba(16,34,20,${0.02 + band * 0.035})`;
      g.fillRect(0, y, w, 1);
    }
    g.fillStyle = 'rgba(32,54,35,.55)';
    g.fillRect(0, 0, w, 14);
    g.fillRect(0, h - 18, w, 18);
    g.strokeStyle = 'rgba(190,216,181,.16)';
    g.lineWidth = 2;
    for (let y = 48; y < h - 24; y += 62) g.beginPath(), g.moveTo(0, y), g.lineTo(w, y + 3), g.stroke();
    g.strokeStyle = 'rgba(232,244,224,.3)';
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, 13); g.lineTo(w, 13); g.stroke();
  });
  // 班级铜牌：高三拾伍班 / SENIOR 3 · CLASS 15
  const classSignMap = makeCanvasTexture(768, 224, (g, w, h) => {
    g.fillStyle = '#f4eedd';
    g.fillRect(0, 0, w, h);
    const frame = g.createLinearGradient(0, 0, 0, h);
    frame.addColorStop(0, '#315844');
    frame.addColorStop(1, '#1d3a2d');
    g.strokeStyle = frame;
    g.lineWidth = 14;
    g.strokeRect(9, 9, w - 18, h - 18);
    g.strokeStyle = '#b99a5d';
    g.lineWidth = 3;
    g.strokeRect(29, 29, w - 58, h - 58);
    g.fillStyle = '#223f33';
    g.font = '600 76px "Songti SC", "STSong", "Noto Serif SC", serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('高三拾伍班', w / 2, h * 0.44);
    g.fillStyle = '#6b6d61';
    g.font = '500 25px "Helvetica Neue", Arial, sans-serif';
    g.letterSpacing = '4px';
    g.fillText('SENIOR 3 · CLASS 15', w / 2, h * 0.74);
  });
  // 傍晚窗景：深蓝绿地平线 + 远处暖灯 + 防盗栏反光
  const windowMap = makeCanvasTexture(384, 512, (g, w, h) => {
    const rand = seededRandom(8093);
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#0a1d2b');
    sky.addColorStop(0.5, '#12343e');
    sky.addColorStop(0.78, '#1c4848');
    sky.addColorStop(1, '#0d2428');
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h);
    // 远处树影
    for (let i = 0; i < 14; i += 1) {
      const x = rand() * w;
      const y = h * (0.63 + rand() * 0.2);
      const r = 18 + rand() * 42;
      g.fillStyle = `rgba(8,28,28,${0.32 + rand() * 0.25})`;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    // 远处暖色灯点
    for (let i = 0; i < 16; i += 1) {
      const x = rand() * w;
      const y = h * (0.52 + rand() * 0.3);
      const r = 1.5 + rand() * 5;
      g.fillStyle = `rgba(240,188,112,${0.14 + rand() * 0.45})`;
      g.beginPath(); g.arc(x, y, r * 2.8, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,224,168,.72)';
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    // 横向栏杆
    g.strokeStyle = 'rgba(3,13,16,.72)';
    g.lineWidth = 10;
    for (const ry of [0.58, 0.66, 0.74, 0.82]) {
      g.beginPath(); g.moveTo(0, h * ry); g.lineTo(w, h * ry); g.stroke();
    }
    g.strokeStyle = 'rgba(160,196,184,.16)';
    g.lineWidth = 2;
    for (const ry of [0.575, 0.655, 0.735, 0.815]) {
      g.beginPath(); g.moveTo(0, h * ry); g.lineTo(w, h * ry); g.stroke();
    }
    // 室内灯管在玻璃上的斜向反光
    g.save();
    g.globalAlpha = 0.1;
    g.strokeStyle = '#e9f4e9';
    g.lineWidth = 20;
    g.beginPath(); g.moveTo(-30, 120); g.lineTo(w + 20, 40); g.stroke();
    g.lineWidth = 7;
    g.beginPath(); g.moveTo(-20, 260); g.lineTo(w + 20, 200); g.stroke();
    g.restore();
  });
  return {
    wall: M.plasterWarm || M.plasterPale,
    wainscot: M.darkWood,
    stoneBase: M.stone,
    ceilingDark: mat(0xd8cdb9),
    floorTile: tileMap ? mat(0xd9d2c3, { map: tileMap, roughness: 0.95 }) : M.stoneLight,
    floorWood: woodMap ? mat(0xcbb08e, { map: woodMap, roughness: 0.92 }) : (M.warmWood || M.redWood),
    carpet: new THREE.MeshStandardMaterial({ color: 0x7c3a2e, roughness: 0.96 }),
    wallOld: M.plasterPale,
    wallWarm: M.plasterWarm,
    stoneFloor: M.stoneLight,   // 兼容旧引用
    woodFloor: M.warmWood || M.redWood,
    ceiling: M.plasterWarm,
    wallBase: M.stoneLight,
    wood: M.warmWood || M.redWood,
    redWood: M.redWood,
    darkWood: M.darkWood,
    stoneDark: M.stoneDark || M.stone,
    glass: M.glassBand,
    leaf: M.leaf,
    brass: M.bronze || M.gold,
    deskTop: M.warmWood || M.redWood,
    chair: M.courtBlue || M.darkWood,
    daylight: new THREE.MeshBasicMaterial({ color: 0xf2e6cb }),
    glow: new THREE.MeshBasicMaterial({ color: 0xffe2b4 }),
    white: M.whiteBand || M.plasterPale,
    blackboard: blackboardMap ? mat(0xffffff, { map: blackboardMap, roughness: 0.86 }) : mat(0x26362f),
    bookSpines: bookSpineMap ? mat(0xffffff, { map: bookSpineMap, roughness: 0.88 }) : mat(0x6d4a33),
    plaqueMain: signMaterial(tex && tex.mainPlaque),
    plaqueFengqi: signMaterial(tex && tex.fengqiPlaque),

    /* ---------------- 教室（主楼右翼）专属材质 ---------------- */
    classWall: M.plasterPale || M.plasterWarm,
    classCeiling: mat(0xe9e3d5, { roughness: 0.96 }),
    classWainscot: mat(0x93a397, { roughness: 0.9 }),
    classTrim: mat(0x4e6157, { roughness: 0.7, metalness: 0.08 }),
    lockerBody: mat(0xe8e3d5, { roughness: 0.72, metalness: 0.03 }),
    lockerCap: mat(0xf1ede2, { roughness: 0.6, metalness: 0.04 }),
    lockerFace: lockerMap
      ? mat(0xffffff, { map: lockerMap, roughness: 0.62, metalness: 0.03 })
      : mat(0xece7da, { roughness: 0.62 }),
    lockerDark: mat(0x37342d, { roughness: 0.52, metalness: 0.24 }),
    mural: muralMap
      ? mat(0xffffff, {
        map: muralMap,
        roughness: 0.97,
        emissive: 0xffffff,
        emissiveMap: muralMap,
        emissiveIntensity: 0.14
      })
      : mat(0x174a61),
    curtain: curtainMap
      ? mat(0xffffff, { map: curtainMap, roughness: 0.96, side: THREE.DoubleSide })
      : mat(0x4d7353, { roughness: 0.96, side: THREE.DoubleSide }),
    curtainRod: mat(0x373a34, { roughness: 0.44, metalness: 0.42 }),
    windowGlass: windowMap
      ? mat(0xffffff, {
        map: windowMap,
        roughness: 0.32,
        metalness: 0.16,
        emissive: 0x2a4444,
        emissiveMap: windowMap,
        emissiveIntensity: 0.2
      })
      : mat(0x16333a, { roughness: 0.3, metalness: 0.2 }),
    classPlaque: classSignMap ? mat(0xffffff, { map: classSignMap, roughness: 0.78 }) : mat(0xd9c9a5),
    deskTop: mat(0xe7e0d2, { roughness: 0.72 }),
    deskSteel: mat(0x35689c, { roughness: 0.48, metalness: 0.3 }),
    chairBlue: mat(0x2f6db2, { roughness: 0.5, metalness: 0.04 }),
    chairSteel: mat(0x6f7d80, { roughness: 0.45, metalness: 0.3 }),
    toteWhite: mat(0xf1eee3, { roughness: 0.96 }),
    plushGray: mat(0x9a9c9a, { roughness: 1 }),
    plushDark: mat(0x2a2b29, { roughness: 0.9 }),
    paperWhite: mat(0xf6f2e7, { roughness: 0.98 }),
    fanBlade: mat(0xd7d3c8, { roughness: 0.7 }),
    fanHub: mat(0x30342e, { roughness: 0.5, metalness: 0.3 }),
    houseWood: M.warmWood || M.redWood,
    houseWoodLight: mat(0xa76d45, { roughness: 0.76 }),
    houseWoodDark: mat(0x5a3724, { roughness: 0.82 }),
    houseRoof: mat(0x8b5234, { roughness: 0.78 }),
    houseRed: mat(0xb34e3f, { roughness: 0.8 }),
    houseGold: mat(0xc19a4b, { roughness: 0.62, metalness: 0.18 }),
    bookRed: mat(0x8d3b32, { roughness: 0.86 }),
    bookBlue: mat(0x34546f, { roughness: 0.86 }),
    bookMustard: mat(0xb28e43, { roughness: 0.86 }),
    bookGreen: mat(0x4b6a54, { roughness: 0.86 }),
    bookCream: mat(0xd9cdb2, { roughness: 0.86 })
  };
}

/* ------------------------------------------------------------------ */
/*  1) 主教学楼（teaching.js）：门厅 + 中央走廊 + 一间教室              */
/* ------------------------------------------------------------------ */
/**
 * 局部坐标：x = 沿楼长轴（±28.6 为楼身端部），+z = 正面（校园内）。
 * 中央体块宽 30 m → ±7.5；两翼在 |x| > 7.5；主体进深 16 m（前墙 +4.1，后墙 -3.9）。
 * 室内地面 = 基座顶 PLINTH = 0.375；门厅吊顶 3.30（保留通高门厅感），
 * 两翼首层吊顶 1.98（层高约 3.2 m + 梁板）。
 */
function buildMainHallInterior(root, mats, cameras) {
  const b = findBuilding('主教学楼');
  const ROT = -138.5;                       // teaching.js: rotation.y = deg(-obb[2])
  const g = new THREE.Group();
  g.name = 'interior: main hall';
  g.position.set(b.center[0], BASE_Y, b.center[1]);
  g.rotation.y = ROT * D2R;
  root.add(g);

  const F = 0.375;                          // 首层地面（PLINTH 0.75 m × 0.5）
  // 门厅夹在教学楼中央两座深色石材竖塔之间（TOWER_INNER 11 m → ±5.5 场景单位）：
  // x 取 ±5.3 才能确保室内不被模块的石塔实体穿透（此前 ±7.3 会在画面里看到石塔内壁）。
  const LOBBY = { x0: -5.3, x1: 5.3, z0: -3.66, z1: 4.02, ceil: 3.30 };
  const WING = { ceil: 1.98 };
  const CORR = { x0: 7.3, x1: 22.6, z0: 1.46, z1: 3.16 };
  // 教室位置避开 1↔办公楼 西侧 OSM 连廊（其柱列在主楼局部 x 8.75–11.68,
  // z > -4 的区域会伸进主楼体量内），因此取右翼 x 12.2–17.4 一段。
  const ROOM = { x0: 12.2, x1: 17.4, z0: -3.50, z1: 1.46 };

  /* ---------------- 门厅 ---------------- */
  addBox(g, mats.floorTile, LOBBY.x1 - LOBBY.x0 + 0.3, 0.08, LOBBY.z1 - LOBBY.z0 + 0.3,
    0, F - 0.04, (LOBBY.z0 + LOBBY.z1) / 2);
  addBox(g, mats.ceilingDark, LOBBY.x1 - LOBBY.x0 + 0.3, 0.1, LOBBY.z1 - LOBBY.z0 + 0.3,
    0, LOBBY.ceil + 0.05, (LOBBY.z0 + LOBBY.z1) / 2);
  // 门厅红毯（加强地面透视与「门厅」识别度）
  addBox(g, mats.carpet, 2.2, 0.03, 5.4, 0, F + 0.015, -0.9);
  // 墙：前墙（中央大门 3.4 宽 + 门头）、后墙、左墙、右墙（通走廊门洞）
  const frontZ = LOBBY.z1 - 0.06;
  const backZ = LOBBY.z0 + 0.06;
  wallX(g, mats.wall, frontZ, LOBBY.x0, -1.7, F, LOBBY.ceil);
  wallX(g, mats.wall, frontZ, 1.7, LOBBY.x1, F, LOBBY.ceil);
  wallX(g, mats.wall, frontZ, -1.7, 1.7, F + 2.3, LOBBY.ceil);          // 门头
  wallX(g, mats.wall, backZ, LOBBY.x0, LOBBY.x1, F, LOBBY.ceil);
  wallZ(g, mats.wall, LOBBY.x0 + 0.06, LOBBY.z0, LOBBY.z1, F, LOBBY.ceil);
  const doorZ0 = CORR.z0 + 0.02;
  const doorZ1 = CORR.z1 - 0.02;
  // 右墙留一个通向右翼走廊的门洞（门洞后是暗色过道；走廊机位单独在翼楼里）
  wallZ(g, mats.wall, LOBBY.x1 - 0.06, LOBBY.z0, doorZ0, F, LOBBY.ceil);
  wallZ(g, mats.wall, LOBBY.x1 - 0.06, doorZ1, LOBBY.z1, F, LOBBY.ceil);
  wallZ(g, mats.wall, LOBBY.x1 - 0.06, doorZ0, doorZ1, F + 1.85, LOBBY.ceil); // 洞头
  addBox(g, mats.stoneDark, 0.14, 1.85, doorZ1 - doorZ0, LOBBY.x1 + 0.02, F + 0.93, (doorZ0 + doorZ1) / 2);
  for (const dz of [doorZ0, doorZ1]) addBox(g, mats.darkWood, 0.16, 1.85, 0.12, LOBBY.x1 - 0.05, F + 0.93, dz);
  // 墙裙（深木色）与踢脚线：给浅色墙面增加对比与尺度
  for (const seg of [[LOBBY.x0, -1.7], [1.7, LOBBY.x1]]) {
    addBox(g, mats.wainscot, seg[1] - seg[0], 0.42, 0.06, (seg[0] + seg[1]) / 2, F + 0.21, frontZ - 0.09);
    addBox(g, mats.stoneBase, seg[1] - seg[0], 0.1, 0.1, (seg[0] + seg[1]) / 2, F + 0.05, frontZ - 0.11);
  }
  addBox(g, mats.wainscot, LOBBY.x1 - LOBBY.x0, 0.42, 0.06, 0, F + 0.21, backZ + 0.09);
  addBox(g, mats.stoneBase, LOBBY.x1 - LOBBY.x0, 0.1, 0.1, 0, F + 0.05, backZ + 0.11);
  for (const side of [-1, 1]) {
    const wx = side < 0 ? LOBBY.x0 + 0.09 : LOBBY.x1 - 0.09;
    addBox(g, mats.wainscot, 0.06, 0.42, LOBBY.z1 - LOBBY.z0, wx, F + 0.21, (LOBBY.z0 + LOBBY.z1) / 2);
  }
  // 大门门框 + 室外亮光（在实体外壳内部，视觉上像门外天光）
  for (const dx of [-1.72, 1.72]) {
    addBox(g, mats.darkWood, 0.16, 2.3, 0.22, dx, F + 1.15, frontZ);
  }
  addBox(g, mats.darkWood, 3.6, 0.14, 0.22, 0, F + 2.36, frontZ);
  addPane(g, mats.daylight, 3.2, 2.15, 0, F + 1.12, frontZ + 0.16);
  // 两根方柱 + 金线柱头
  for (const dx of [-3.2, 3.2]) {
    addBox(g, mats.stoneLight, 0.44, LOBBY.ceil - F, 0.44, dx, (F + LOBBY.ceil) / 2, 1.1);
    addBox(g, mats.brass, 0.5, 0.09, 0.5, dx, LOBBY.ceil - 0.08, 1.1);
    addBox(g, mats.stoneDark, 0.56, 0.12, 0.56, dx, F + 0.06, 1.1);
  }
  // 两侧墙面挂画/告示（增强墙面尺度）
  for (const side of [-1, 1]) {
    addBox(g, mats.darkWood, 0.06, 0.9, 1.7, side * (LOBBY.x1 - 0.16), F + 1.75, -0.3);
    addPane(g, mats.white, 0.02, 0.72, side * (LOBBY.x1 - 0.2), F + 1.75, -0.3, 0, 1.4);
  }
  // 服务台 / 「中央教学楼」匾额 / 长凳 / 花盆
  addBox(g, mats.wood, 2.8, 0.08, 0.72, 0, F + 0.44, -2.55);
  addBox(g, mats.redWood, 2.8, 0.42, 0.1, 0, F + 0.22, -2.18);
  addBox(g, mats.redWood, 0.1, 0.42, 0.7, -1.4, F + 0.22, -2.55);
  addBox(g, mats.redWood, 0.1, 0.42, 0.7, 1.4, F + 0.22, -2.55);
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 0.9), mats.plaqueMain);
  plaque.position.set(0, 2.42, backZ + 0.07);
  plaque.receiveShadow = true;
  g.add(plaque);
  for (const dx of [-2.9, 2.9]) {
    addBox(g, mats.wood, 1.9, 0.1, 0.5, dx, F + 0.42, -1.5);
    addBox(g, mats.wood, 1.9, 0.5, 0.1, dx, F + 0.62, -1.73);
    addBox(g, mats.darkWood, 0.09, 0.42, 0.44, dx - 0.8, F + 0.21, -1.5);
    addBox(g, mats.darkWood, 0.09, 0.42, 0.44, dx + 0.8, F + 0.21, -1.5);
  }
  for (const dx of [-4.5, 4.5]) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 0.42, 12), mats.stoneDark);
    pot.position.set(dx, F + 0.21, 1.6);
    pot.castShadow = false;
    g.add(pot);
    const bush = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.62, 10), mats.leaf);
    bush.position.set(dx, F + 0.7, 1.6);
    g.add(bush);
  }
  for (const dx of [-2.8, 2.8]) addPane(g, mats.glow, 2.6, 0.05, dx, LOBBY.ceil - 0.04, 0.2, 0, 0.7);
  addWarmLight(g, 0, Math.min(2.55, LOBBY.ceil - 0.5), 0.2, 7, 16);

  /* ---------------- 中央走廊（右翼首层） ---------------- */
  const corridorLen = CORR.x1 - CORR.x0;
  const corridorCx = (CORR.x0 + CORR.x1) / 2;
  const corridorCz = (CORR.z0 + CORR.z1) / 2;
  const corridorW = CORR.z1 - CORR.z0;
  addBox(g, mats.floorTile, corridorLen + 0.2, 0.08, corridorW + 0.2, corridorCx, F - 0.04, corridorCz);
  addBox(g, mats.ceilingDark, corridorLen + 0.2, 0.1, corridorW + 0.2, corridorCx, WING.ceil + 0.05, corridorCz);
  const corrWallZ0 = CORR.z0 + 0.05;
  const corrWallZ1 = CORR.z1 - 0.05;
  // 北墙（教室侧）：留教室门洞
  const roomDoor0 = 13.2;
  const roomDoor1 = 14.7;
  wallX(g, mats.wall, corrWallZ0, CORR.x0, roomDoor0, F, WING.ceil);
  wallX(g, mats.wall, corrWallZ0, roomDoor1, CORR.x1, F, WING.ceil);
  wallX(g, mats.wall, corrWallZ0, roomDoor0, roomDoor1, F + 1.78, WING.ceil);
  // 南墙（临空侧）：通长墙 + 内嵌发光窗带
  wallX(g, mats.wall, corrWallZ1, CORR.x0, CORR.x1, F, WING.ceil);
  for (let i = 0; i < 6; i += 1) {
    const wx = CORR.x0 + 1.7 + i * 2.2;
    addPane(g, mats.daylight, 1.62, 0.62, wx, F + 0.95, corrWallZ1 - 0.09);
    addBox(g, mats.white, 1.7, 0.06, 0.09, wx, F + 0.62, corrWallZ1 - 0.1);
    addBox(g, mats.white, 1.7, 0.06, 0.09, wx, F + 1.28, corrWallZ1 - 0.1);
  }
  // 走廊西端封墙（走廊与门厅之间被石材门塔分隔，影片用镜头切换衔接）
  wallZ(g, mats.wall, CORR.x0 + 0.05, CORR.z0, CORR.z1, F, WING.ceil);
  // 走廊墙裙
  addBox(g, mats.wainscot, corridorLen, 0.4, 0.06, corridorCx, F + 0.2, corrWallZ0 + 0.09);
  addBox(g, mats.wainscot, corridorLen, 0.4, 0.06, corridorCx, F + 0.2, corrWallZ1 - 0.09);
  // 走廊尽端墙 + 窗
  wallZ(g, mats.wall, CORR.x1 - 0.06, CORR.z0, CORR.z1, F, WING.ceil);
  addPane(g, mats.daylight, 0.95, 0.9, CORR.x1 - 0.13, F + 1.1, corridorCz, 0);
  // 教室门框
  for (const wx of [roomDoor0, roomDoor1]) {
    addBox(g, mats.darkWood, 0.12, 1.78, 0.2, wx, F + 0.89, corrWallZ0);
  }
  addBox(g, mats.darkWood, roomDoor1 - roomDoor0 + 0.1, 0.12, 0.2, (roomDoor0 + roomDoor1) / 2, F + 1.78, corrWallZ0);
  // 走廊吊顶灯带
  for (let i = 0; i < 4; i += 1) {
    addPane(g, mats.glow, 1.8, 0.05, CORR.x0 + 2.2 + i * 3.6, WING.ceil - 0.04, corridorCz, 0, 0.55);
  }
  // 走廊北墙公告栏（写意）
  for (const wx of [14.2, 17.6, 20.4]) addPane(g, mats.white, 1.9, 0.72, wx, F + 1.18, corrWallZ0 + 0.1);

  /* ---------------- 一间教室（顶楼 · 左翼，面向大门左侧） ----------------
   * 2026-11 根据用户补充：教室在主教学楼顶楼、面向大门左侧；储物柜那一墙
   * 是教室后边，课桌面向 x1 前墙（黑板），因此把整间教室抬高 4 层并移到
   * 左翼，同时把黑板/讲台移到 x1、课桌顺时针旋转 90°。
   * 参考用户实拍：后墙（x0）三层白色储物柜 + 上方海主题壁画；侧墙大窗 +
   * 绿色窗帘；木制「小房子」柜；蓝框课桌 + 蓝色塑料椅 + 成堆书本。 */
  const CLASSROOM_LIFT = 6.6;               // 4 层 × 3.3 m ÷ 2
  const CLASSROOM_X = -29.6;                // 从右翼 +x 移到左翼 -x
  const roomG = new THREE.Group();
  roomG.position.set(CLASSROOM_X, CLASSROOM_LIFT, 0);
  g.add(roomG);
  const roomCx = (ROOM.x0 + ROOM.x1) / 2;
  const roomCz = (ROOM.z0 + ROOM.z1) / 2;
  // 地板抬高 0.02：教室地板与外壳/首层楼板顶面几乎共面，近距离机位会
  // 出现 z-fighting 斑块（底下的深色地面透出来），抬高后彻底避免。
  const roomFloor = addBox(roomG, mats.floorTile, ROOM.x1 - ROOM.x0 + 0.2, 0.08, ROOM.z1 - ROOM.z0 + 0.2,
    roomCx, F - 0.02, roomCz);
  // 室内地板不参与太阳阴影采样：房间已被外壳包住，阳光本照不进来；
  // 保留 receiveShadow 反而会在近距离机位下出现 shadow acne 横纹。
  roomFloor.receiveShadow = false;
  addBox(roomG, mats.classCeiling, ROOM.x1 - ROOM.x0 + 0.2, 0.1, ROOM.z1 - ROOM.z0 + 0.2,
    roomCx, WING.ceil + 0.05, roomCz);
  // 侧墙与后墙（前墙 = 走廊北墙，已建）：教室用更亮的米白墙面 + 灰绿墙裙
  wallZ(roomG, mats.classWall, ROOM.x0 + 0.06, ROOM.z0, ROOM.z1, F, WING.ceil);
  wallZ(roomG, mats.classWall, ROOM.x1 - 0.06, ROOM.z0, ROOM.z1, F, WING.ceil);
  wallX(roomG, mats.classWall, ROOM.z0 + 0.06, ROOM.x0, ROOM.x1, F, WING.ceil);
  // 原“前墙”是右翼走廊北墙；搬到左翼后补一面自己的南墙 + 一扇门，避免露天。
  wallX(roomG, mats.classWall, ROOM.z1 - 0.06, ROOM.x0, ROOM.x1, F, WING.ceil);
  addBox(roomG, mats.darkWood, 0.95, 1.75, 0.06, ROOM.x0 + 1.4, F + 0.875, ROOM.z1 - 0.12);
  addBox(roomG, mats.classTrim, 1.02, 0.05, 0.08, ROOM.x0 + 1.4, F + 1.78, ROOM.z1 - 0.12);
  addBox(roomG, mats.classWainscot, ROOM.x1 - ROOM.x0, 0.4, 0.06, roomCx, F + 0.2, ROOM.z0 + 0.15);
  addBox(roomG, mats.classWainscot, 0.06, 0.4, ROOM.z1 - ROOM.z0, ROOM.x0 + 0.14, F + 0.2, roomCz);
  addBox(roomG, mats.classWainscot, 0.06, 0.4, ROOM.z1 - ROOM.z0, ROOM.x1 - 0.14, F + 0.2, roomCz);
  // 墙裙压顶细线，给浅色墙面加一道横向尺度
  addBox(roomG, mats.classTrim, ROOM.x1 - ROOM.x0, 0.026, 0.075, roomCx, F + 0.41, ROOM.z0 + 0.155);
  addBox(roomG, mats.classTrim, 0.075, 0.026, ROOM.z1 - ROOM.z0, ROOM.x1 - 0.145, F + 0.41, roomCz);

  /* ---- 前墙（x1）：黑板 + 班级牌 + 讲台；后墙（x0）留给储物柜 ---- */
  const boardZ = -0.72;
  addBox(roomG, mats.darkWood, 0.07, 0.94, 2.42, ROOM.x1 - 0.155, 1.16, boardZ);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(2.28, 0.80), mats.blackboard);
  board.position.set(ROOM.x1 - 0.195, 1.16, boardZ);
  board.rotation.y = -Math.PI / 2;
  board.receiveShadow = true;
  roomG.add(board);
  addBox(roomG, mats.darkWood, 0.16, 0.045, 2.36, ROOM.x1 - 0.19, 0.74, boardZ);
  addBox(roomG, mats.paperWhite, 0.025, 0.035, 0.13, ROOM.x1 - 0.22, 0.765, boardZ - 0.55);
  addBox(roomG, mats.paperWhite, 0.022, 0.03, 0.11, ROOM.x1 - 0.22, 0.763, boardZ - 0.30);
  addBox(roomG, mats.darkWood, 0.05, 0.05, 0.16, ROOM.x1 - 0.22, 0.768, boardZ + 1.43);
  // 班级牌：黑板正上方，影片两个机位都能读到
  addBox(roomG, mats.darkWood, 0.035, 0.29, 0.98, ROOM.x1 - 0.17, 1.78, boardZ);
  const classPlaque = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.24), mats.classPlaque);
  classPlaque.position.set(ROOM.x1 - 0.192, 1.78, boardZ);
  classPlaque.rotation.y = -Math.PI / 2;
  roomG.add(classPlaque);
  // 讲台：贴着前墙，面向学生（学生在西侧）
  addBox(roomG, mats.wood, 0.48, 0.55, 0.95, ROOM.x1 - 0.72, F + 0.275, boardZ);
  addBox(roomG, mats.darkWood, 0.56, 0.06, 1.05, ROOM.x1 - 0.72, F + 0.58, boardZ);
  addBox(roomG, mats.bookBlue, 0.18, 0.035, 0.26, ROOM.x1 - 0.72, F + 0.61, boardZ - 0.2, 0.12);
  addBox(roomG, mats.paperWhite, 0.15, 0.008, 0.22, ROOM.x1 - 0.72, F + 0.612, boardZ + 0.18, -0.08);

  // 后墙窗洞（黑板右侧）：3 扇深色框玻璃窗，窗外为傍晚
  const winY0 = 0.88;
  const winY1 = 1.80;
  const winCy = (winY0 + winY1) / 2;
  const winH = winY1 - winY0;
  const backWin0 = 14.92;
  const backWin1 = 17.12;
  const backWinCx = (backWin0 + backWin1) / 2;
  addBox(roomG, mats.classTrim, backWin1 - backWin0 + 0.14, 0.06, 0.09, backWinCx, winY1 + 0.03, ROOM.z0 + 0.18);
  addBox(roomG, mats.classTrim, backWin1 - backWin0 + 0.16, 0.07, 0.14, backWinCx, winY0 - 0.035, ROOM.z0 + 0.16);
  for (const fx of [backWin0 - 0.02, backWin1 + 0.02]) {
    addBox(roomG, mats.classTrim, 0.07, winH + 0.13, 0.09, fx, winCy, ROOM.z0 + 0.18);
  }
  for (const mx of [15.655, 16.385]) {
    addBox(roomG, mats.classTrim, 0.035, winH + 0.06, 0.08, mx, winCy, ROOM.z0 + 0.175);
  }
  for (const gx of [15.30, 16.02, 16.74]) {
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.66, winH), mats.windowGlass);
    pane.position.set(gx, winCy, ROOM.z0 + 0.145);
    roomG.add(pane);
  }
  // 后墙窗帘杆 + 两侧绿色窗帘
  const backRod = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, backWin1 - backWin0 + 0.20, 8), mats.curtainRod);
  backRod.rotation.z = Math.PI / 2;
  backRod.position.set(backWinCx, 1.885, ROOM.z0 + 0.20);
  roomG.add(backRod);
  for (const fx of [backWin0 - 0.10, backWin1 + 0.10]) {
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), mats.curtainRod);
    finial.position.set(fx, 1.885, ROOM.z0 + 0.20);
    roomG.add(finial);
  }
  const curtainPanel = (x, y, z, w, h, ry) => {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mats.curtain);
    panel.position.set(x, y, z);
    panel.rotation.y = ry;
    panel.receiveShadow = true;
    roomG.add(panel);
    return panel;
  };
  curtainPanel(backWin0 + 0.05, 1.345, ROOM.z0 + 0.245, 0.31, 1.04, 0);
  curtainPanel(backWin1 - 0.06, 1.345, ROOM.z0 + 0.245, 0.29, 1.03, 0);

  /* ---- z1 侧墙：与 z0 对称的窗带 + 绿窗帘（用户 2026-11 补充） ---- */
  const symZ = ROOM.z1 - 0.06;
  addBox(roomG, mats.classWainscot, ROOM.x1 - ROOM.x0, 0.4, 0.06, roomCx, F + 0.2, symZ - 0.09);
  addBox(roomG, mats.classTrim, ROOM.x1 - ROOM.x0, 0.026, 0.075, roomCx, F + 0.41, symZ - 0.095);
  addBox(roomG, mats.classTrim, backWin1 - backWin0 + 0.14, 0.06, 0.09, backWinCx, winY1 + 0.03, symZ - 0.12);
  addBox(roomG, mats.classTrim, backWin1 - backWin0 + 0.16, 0.07, 0.14, backWinCx, winY0 - 0.035, symZ - 0.10);
  for (const fx of [backWin0 - 0.02, backWin1 + 0.02]) {
    addBox(roomG, mats.classTrim, 0.07, winH + 0.13, 0.09, fx, winCy, symZ - 0.12);
  }
  for (const mx of [15.655, 16.385]) {
    addBox(roomG, mats.classTrim, 0.035, winH + 0.06, 0.08, mx, winCy, symZ - 0.115);
  }
  for (const gx of [15.30, 16.02, 16.74]) {
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.66, winH), mats.windowGlass);
    pane.position.set(gx, winCy, symZ - 0.085);
    pane.rotation.y = Math.PI;
    roomG.add(pane);
  }
  const symRod = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, backWin1 - backWin0 + 0.20, 8), mats.curtainRod);
  symRod.rotation.z = Math.PI / 2;
  symRod.position.set(backWinCx, 1.885, symZ - 0.14);
  roomG.add(symRod);
  for (const fx of [backWin0 - 0.10, backWin1 + 0.10]) {
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), mats.curtainRod);
    finial.position.set(fx, 1.885, symZ - 0.14);
    roomG.add(finial);
  }
  curtainPanel(backWin0 + 0.05, 1.345, symZ - 0.185, 0.31, 1.04, Math.PI);
  curtainPanel(backWin1 - 0.06, 1.345, symZ - 0.185, 0.29, 1.03, Math.PI);

  // x1 前墙改为黑板墙，不再开窗；采光由两侧窗与天花板灯带负责。

  /* ---- 储物柜旁边：长方体木书柜 + 正面中央的三角形装饰 ----
   * 用户 2026-11 修正：它首先是一个长方体书柜，不是坡顶「小房子」；
   * 三角形只是正面中间的装饰。 */
  const bookX = 12.72;
  const bookZ = -2.92;
  const bookD = 0.44;           // 进深（x）
  const bookW = 0.74;           // 面宽（z）
  const bookH = 1.14;
  const bookFront = bookX + bookD / 2;
  const bookTop = F + bookH;
  // 底座、背板、两侧板、顶板、底板：全部直角，保持长方体轮廓
  addBox(roomG, mats.houseWoodDark, bookD + 0.08, 0.06, bookW + 0.08, bookX, F + 0.03, bookZ);
  addBox(roomG, mats.houseWoodDark, 0.035, bookH, bookW, bookX - bookD / 2 + 0.018, F + bookH / 2, bookZ);
  for (const side of [-1, 1]) {
    addBox(roomG, mats.houseWood, bookD, bookH, 0.055, bookX, F + bookH / 2, bookZ + side * (bookW / 2 - 0.027));
    addBox(roomG, mats.houseWoodLight, 0.045, bookH - 0.04, 0.035, bookFront - 0.025, F + bookH / 2, bookZ + side * (bookW / 2 - 0.045));
  }
  addBox(roomG, mats.houseWood, bookD + 0.04, 0.05, bookW + 0.04, bookX, bookTop - 0.025, bookZ);
  addBox(roomG, mats.houseWoodLight, bookD - 0.02, 0.055, bookW - 0.06, bookX, F + 0.075, bookZ);
  // 三层书架板
  const bookShelfY = [0.34, 0.62, 0.90];
  for (const sy of bookShelfY) {
    addBox(roomG, mats.houseWoodLight, bookD - 0.035, 0.035, bookW - 0.07, bookX, F + sy, bookZ);
  }
  // 书架上的书：高度/颜色/厚度略有变化
  const shelfBookMats = [mats.bookRed, mats.bookBlue, mats.bookMustard, mats.bookGreen, mats.bookCream];
  const bookRows = [
    [0.085, 0.16, 0.10, 0.21, 0.13, 0.18],
    [0.14, 0.12, 0.19, 0.11, 0.17],
    [0.18, 0.10, 0.15, 0.20, 0.12, 0.16]
  ];
  bookRows.forEach((heights, row) => {
    let bz = bookZ - (bookW / 2 - 0.10);
    heights.forEach((bh, i) => {
      const bw = 0.045 + (i % 3) * 0.012;
      addBox(roomG, shelfBookMats[(row * 2 + i) % shelfBookMats.length],
        0.16, bh, bw, bookX + 0.06, F + bookShelfY[row] + 0.018 + bh / 2, bz);
      bz += bw + 0.018;
    });
  });
  // 正面中央的三角形装饰：金色三角框，不改变长方体轮廓
  const triShape = new THREE.Shape();
  triShape.moveTo(0, 0.20);
  triShape.lineTo(-0.20, -0.13);
  triShape.lineTo(0.20, -0.13);
  triShape.closePath();
  const triHole = new THREE.Path();
  triHole.moveTo(0, 0.105);
  triHole.lineTo(-0.115, -0.075);
  triHole.lineTo(0.115, -0.075);
  triHole.closePath();
  triShape.holes.push(triHole);
  const triangle = new THREE.Mesh(new THREE.ShapeGeometry(triShape), mats.houseGold);
  triangle.rotation.y = Math.PI / 2;
  triangle.position.set(bookFront + 0.028, F + 0.735, bookZ);
  roomG.add(triangle);
  // 三角形下方一条很小的横线装饰
  addBox(roomG, mats.houseGold, 0.015, 0.018, 0.30, bookFront + 0.028, F + 0.555, bookZ);

  /* ---- 左墙：三层白色储物柜 + 上方学生壁画 ---- */
  const lockerZ0 = -2.45;
  const lockerZ1 = 0.92;
  const lockerLen = lockerZ1 - lockerZ0;
  const lockerCz = (lockerZ0 + lockerZ1) / 2;
  addBox(roomG, mats.lockerBody, 0.28, 0.08, lockerLen + 0.05, 12.46, F + 0.04, lockerCz);
  addBox(roomG, mats.lockerBody, 0.23, 0.60, lockerLen, 12.45, F + 0.37, lockerCz);
  addBox(roomG, mats.lockerCap, 0.27, 0.06, lockerLen + 0.06, 12.46, F + 0.70, lockerCz);
  // 门板贴图：每层一张平面，比逐门做 mesh 便宜得多
  for (const ty of [F + 0.175, F + 0.365, F + 0.555]) {
    const face = new THREE.Mesh(new THREE.PlaneGeometry(lockerLen - 0.07, 0.17), mats.lockerFace);
    face.position.set(12.567, ty, lockerCz);
    face.rotation.y = Math.PI / 2;
    face.receiveShadow = true;
    roomG.add(face);
  }
  for (const sy of [F + 0.27, F + 0.46, F + 0.65]) {
    addBox(roomG, mats.lockerCap, 0.31, 0.016, lockerLen + 0.02, 12.48, sy, lockerCz);
  }
  addBox(roomG, mats.lockerDark, 0.24, 0.02, lockerLen, 12.445, F + 0.085, lockerCz);
  // 壁画：深蓝海、浪、鲸、橙色鱼群与胶带纸（Canvas 手绘）
  const mural = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 0.81), mats.mural);
  mural.position.set(12.338, 1.505, -1.12);
  mural.rotation.y = Math.PI / 2;
  mural.receiveShadow = true;
  roomG.add(mural);
  // 两张实体白纸轻轻翘起，打破整面贴图的平面感
  for (const [pz, py, pw, ph, tilt] of [[-0.25, 1.73, 0.22, 0.29, 0.035], [0.36, 1.79, 0.18, 0.23, -0.04]]) {
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), mats.paperWhite);
    sheet.position.set(12.348, py, pz);
    sheet.rotation.set(tilt * 0.3, Math.PI / 2 + tilt, tilt * 0.5);
    roomG.add(sheet);
  }

  /* ---- 课桌椅：面向 x1 前墙（顺时针旋转 90°），3 列 × 4 排 ---- */
  const deskX = [13.35, 14.75, 16.15];
  const deskZ = [0.72, -0.36, -1.44, -2.46];
  const bookMats = [mats.bookRed, mats.bookBlue, mats.bookMustard, mats.bookGreen, mats.bookCream];
  const deskRand = seededRandom(1515);
  const addBookStack = (bx, bz, n) => {
    let y = F + 0.402;
    for (let i = 0; i < n; i += 1) {
      const bw = 0.19 + (i % 3) * 0.018;
      const bd = 0.13 + ((i * 2) % 3) * 0.012;
      const bh = 0.016 + (i % 2) * 0.007;
      addBox(roomG, bookMats[(i + n) % bookMats.length], bw, bh, bd,
        bx + ((i % 2) - 0.5) * 0.014, y + bh / 2, bz + ((i % 3) - 1) * 0.009,
        (deskRand() - 0.5) * 0.2);
      y += bh;
    }
  };
  const addPaper = (px, pz, rot) => {
    addBox(roomG, mats.paperWhite, 0.20, 0.004, 0.15, px, F + 0.403, pz, rot);
    addBox(roomG, mats.paperWhite, 0.17, 0.004, 0.13, px + 0.012, F + 0.407, pz - 0.008, rot - 0.14);
  };
  for (let r = 0; r < deskZ.length; r += 1) {
    for (let c = 0; c < deskX.length; c += 1) {
      // 最后一排只放中间/右侧两张，给讲台和房子柜留出呼吸
      if (r === 3 && c === 0) continue;
      const dx = deskX[c];
      const dz = deskZ[r];
      // 桌面：长边沿 z，短边沿 x；学生面向 +x（黑板）
      addBox(roomG, mats.deskTop, 0.44, 0.05, 0.72, dx, F + 0.375, dz);
      addBox(roomG, mats.deskSteel, 0.035, 0.026, 0.72, dx + 0.222, F + 0.36, dz);
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          addBox(roomG, mats.deskSteel, 0.035, 0.36, 0.035, dx + sx * 0.18, F + 0.18, dz + sz * 0.315);
        }
      }
      addBox(roomG, mats.deskSteel, 0.03, 0.03, 0.66, dx - 0.18, F + 0.10, dz);
      // 椅子在桌子西侧（-x），椅背再向西
      const cx = dx - 0.46;
      addBox(roomG, mats.chairBlue, 0.34, 0.055, 0.36, cx, F + 0.26, dz);
      addBox(roomG, mats.chairBlue, 0.05, 0.30, 0.36, cx - 0.15, F + 0.43, dz);
      for (const sz of [-1, 1]) {
        addBox(roomG, mats.chairSteel, 0.04, 0.22, 0.04, cx, F + 0.11, dz + sz * 0.14);
        addBox(roomG, mats.chairSteel, 0.28, 0.035, 0.035, cx - 0.02, F + 0.02, dz + sz * 0.14);
      }
    }
  }
  // 桌面书本/试卷：只放在中后几排，避免最前景挡镜头
  addBookStack(14.75, -0.36, 4);
  addPaper(14.67, -0.10, 0.24);
  addBookStack(16.15, 0.72, 3);
  addPaper(16.09, 0.58, -0.18);
  addBookStack(13.35, -1.44, 5);
  addPaper(13.45, -1.30, 0.1);
  addBookStack(14.75, -1.44, 3);
  addBookStack(16.15, -2.46, 4);
  addPaper(16.08, -2.30, -0.12);
  addBookStack(14.75, -2.46, 3);
  addPaper(13.35, 0.72, 0.16);
  // 白色帆布袋挂在中间一把椅子上
  const toteX = 14.14;
  const toteZ = -0.36;
  addBox(roomG, mats.toteWhite, 0.24, 0.28, 0.05, toteX, F + 0.36, toteZ);
  for (const sx of [-1, 1]) {
    addBox(roomG, mats.toteWhite, 0.018, 0.13, 0.015, toteX + sx * 0.075, F + 0.545, toteZ - 0.015);
  }
  addBox(roomG, mats.bookBlue, 0.06, 0.075, 0.012, toteX - 0.01, F + 0.36, toteZ + 0.028);
  // 右下角的灰色毛绒玩偶（低多边形球 + 耳朵 + 眼睛）
  const plushX = 16.15;
  const plushZ = -1.44;
  const plush = new THREE.Mesh(new THREE.SphereGeometry(0.10, 8, 6), mats.plushGray);
  plush.scale.set(1.12, 0.86, 0.96);
  plush.position.set(plushX, F + 0.478, plushZ);
  roomG.add(plush);
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.038, 7, 5), mats.plushGray);
    ear.position.set(plushX + sx * 0.062, F + 0.548, plushZ - 0.02);
    roomG.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.013, 6, 4), mats.plushDark);
    eye.position.set(plushX + sx * 0.034, F + 0.492, plushZ + 0.083);
    roomG.add(eye);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.015, 6, 4), mats.plushDark);
  nose.position.set(plushX, F + 0.472, plushZ + 0.091);
  roomG.add(nose);

  /* ---- 天花：三根荧光灯管 + 两台吊扇 ---- */
  for (const lz of [-2.45, -0.55, 1.25]) {
    // 浅色窄灯槽 + 发光面板：从下方看是白色荧光灯，而不是深色横梁
    addBox(roomG, mats.lockerCap, 1.80, 0.022, 0.16, roomCx, 1.966, lz);
    addPane(roomG, mats.glow, 1.72, 0.035, roomCx, 1.944, lz, 0, 0.13);
  }
  const addFan = (fx, fz, phase) => {
    addBox(roomG, mats.fanHub, 0.045, 0.13, 0.045, fx, 1.905, fz);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.06, 8), mats.fanHub);
    hub.position.set(fx, 1.82, fz);
    roomG.add(hub);
    for (let i = 0; i < 3; i += 1) {
      const a = phase + (i * Math.PI * 2) / 3;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.012, 0.105), mats.fanBlade);
      blade.position.set(fx + Math.cos(a) * 0.31, 1.79, fz + Math.sin(a) * 0.31);
      blade.rotation.y = -a;
      roomG.add(blade);
    }
  };
  addFan(13.45, -1.55, 0.35);
  addFan(16.15, 0.35, 1.25);
  addWarmLight(roomG, roomCx, WING.ceil - 0.28, -0.4, 5.5, 10);
  addWarmLight(roomG, 13.55, 1.66, -1.25, 2.2, 5.5);
  const windowFill = new THREE.PointLight(0xc8dcda, 1.9, 6.5, 2);
  windowFill.position.set(16.5, 1.55, -2.4);
  roomG.add(windowFill);

  /* ---------------- 机位（世界坐标） ---------------- */
  const toW = (p) => localToWorld(b, ROT, p);
  // 教室整体在 roomG 里偏移/抬高；镜头坐标同步房间偏移。
  const toRoom = (p) => toW([p[0] + CLASSROOM_X, p[1] + CLASSROOM_LIFT, p[2]]);
  // 门厅机位：从入口内侧斜 45° 望向走廊门洞——同时纳入接待台、方柱、
  // 红毯与通向右翼走廊的门洞（Lead 2026-11 反馈：原机位太贴墙，需看到门厅纵深）。
  // 机位贴近大门中轴（x≈-0.9）：影片「沿视反方向退回 4.2 单位再推入」时，
  // 反向射线正好穿过入口门洞（门洞 x∈[-1.7,1.7]），进门镜头不会撞墙。
  cameras.mainHallLobby = {
    position: toW([-0.9, F + 0.95, 3.4]),
    target: toW([2.2, F + 0.78, -2.6]),
    fov: 64
  };
  cameras.mainHallCorridor = {
    position: toW([8.35, F + 0.84, 2.30]),
    target: toW([21.9, F + 0.76, 2.30]),
    fov: 60
  };
  // 影片机位：站在教室后侧（x0）看向前墙 x1 的黑板与讲台。
  cameras.mainHallClassroom = {
    position: toRoom([13.0, F + 0.88, 1.05]),
    target: toRoom([17.0, F + 0.78, -1.0]),
    fov: 58
  };
  // 后排机位：从教室前侧（x1）回看 x0 后墙的三层储物柜、海主题壁画与
  // 旋转后的课桌；讲台/黑板在镜头身后。
  cameras.mainHallClassroomBack = {
    position: toRoom([15.4, F + 0.95, 0.35]),
    target: toRoom([12.4, F + 0.75, -1.1]),
    fov: 62
  };
  return g;
}

/* ------------------------------------------------------------------ */
/*  2) 图书馆（library.js）：首层阅览室                                 */
/* ------------------------------------------------------------------ */
/**
 * 局部坐标：x = 面宽（W 38 m → ±9.5），+z = 正面（东南校园内，D 20 m → ±5.0）。
 * 室内地面 = 台地标高 PLINTH = 0.55；一层顶板 F1_TOP 5.3 m → 2.65，吊顶 2.52。
 */
function buildLibraryInterior(root, mats, cameras) {
  const b = findBuilding('图书馆');
  const ROT = 180 - 138.5;                  // library.js 集成：rotation.y = deg(180 - obb[2])
  const g = new THREE.Group();
  g.name = 'interior: library reading room';
  g.position.set(b.center[0], BASE_Y, b.center[1]);
  g.rotation.y = ROT * D2R;
  root.add(g);

  const F = 0.55;                           // PLINTH 1.1 m × 0.5
  const CEIL = 2.52;
  const ROOM = { x0: -9.15, x1: 9.15, z0: -4.85, z1: 4.85 };
  const w = ROOM.x1 - ROOM.x0;
  const d = ROOM.z1 - ROOM.z0;
  const cx = (ROOM.x0 + ROOM.x1) / 2;
  const cz = (ROOM.z0 + ROOM.z1) / 2;
  const frontZ = ROOM.z1 - 0.06;
  const backZ = ROOM.z0 + 0.06;
  // 木地板 / 吊顶
  addBox(g, mats.floorWood, w + 0.24, 0.07, d + 0.24, cx, F - 0.035, cz);
  addBox(g, mats.ceilingDark, w + 0.24, 0.1, d + 0.24, cx, CEIL + 0.05, cz);
  // 墙：入口（拱门近似为矩形门洞，宽 2.9、高 2.0）+ 门头
  const archX = -1.8;
  wallX(g, mats.wall, frontZ, ROOM.x0, archX - 1.45, F, CEIL);
  wallX(g, mats.wall, frontZ, archX + 1.45, ROOM.x1, F, CEIL);
  wallX(g, mats.wall, frontZ, archX - 1.45, archX + 1.45, F + 2.0, CEIL);
  wallX(g, mats.wall, backZ, ROOM.x0, ROOM.x1, F, CEIL);
  wallZ(g, mats.wall, ROOM.x0 + 0.06, ROOM.z0, ROOM.z1, F, CEIL);
  wallZ(g, mats.wall, ROOM.x1 - 0.06, ROOM.z0, ROOM.z1, F, CEIL);
  // 入口门洞亮光 + 白色门套
  addPane(g, mats.daylight, 2.86, 2.0, archX, F + 1.0, frontZ + 0.16);
  for (const dx of [-1.48, 1.48]) addBox(g, mats.white, 0.16, 2.0, 0.22, archX + dx, F + 1.0, frontZ);
  // 高窗（前墙左右 + 后墙）
  for (let i = 0; i < 3; i += 1) {
    addPane(g, mats.daylight, 1.7, 0.58, 2.4 + i * 2.2, F + 1.95, frontZ - 0.09);
    addPane(g, mats.daylight, 1.7, 0.58, ROOM.x0 + 1.3 + i * 2.2, F + 1.95, frontZ - 0.09);
  }
  for (let i = 0; i < 4; i += 1) {
    addPane(g, mats.daylight, 1.6, 0.9, -6.4 + i * 3.4, F + 1.6, backZ + 0.14);
    addBox(g, mats.white, 1.7, 0.06, 0.1, -6.4 + i * 3.4, F + 1.12, backZ + 0.14);
  }
  // 墙裙（深木色）+ 踢脚线
  addBox(g, mats.wainscot, w, 0.46, 0.06, cx, F + 0.23, backZ + 0.14);
  addBox(g, mats.wainscot, w, 0.46, 0.06, cx, F + 0.23, frontZ - 0.14);
  addBox(g, mats.wainscot, 0.06, 0.46, d, ROOM.x0 + 0.14, F + 0.23, cz);
  addBox(g, mats.wainscot, 0.06, 0.46, d, ROOM.x1 - 0.14, F + 0.23, cz);
  addBox(g, mats.stoneBase, w, 0.08, 0.1, cx, F + 0.04, backZ + 0.15);
  addBox(g, mats.stoneBase, w, 0.08, 0.1, cx, F + 0.04, frontZ - 0.15);
  /* 书架（两组：后墙一排 + 前墙一排），书架正面贴「书脊」Canvas 贴图 */
  const shelfUnit = (x, z, ry, width) => {
    const s = new THREE.Group();
    s.position.set(x, 0, z);
    s.rotation.y = ry;
    const h = 1.56;
    addBox(s, mats.darkWood, width, h, 0.08, 0, F + h / 2, -0.24);            // 背板
    for (const sideX of [-width / 2 + 0.04, width / 2 - 0.04]) {
      addBox(s, mats.darkWood, 0.08, h, 0.56, sideX, F + h / 2, 0.02);        // 侧板
    }
    for (const y of [F + 0.34, F + 0.74, F + 1.14, F + 1.52]) {
      addBox(s, mats.darkWood, width - 0.08, 0.05, 0.54, 0, y, 0.02);         // 层板
    }
    const spines = new THREE.Mesh(new THREE.PlaneGeometry(width - 0.16, h - 0.14), mats.bookSpines);
    spines.position.set(0, F + h / 2 - 0.02, 0.30);
    s.add(spines);
    g.add(s);
    return s;
  };
  // 后墙一排（面朝室内 +z）
  for (const x of [-6.1, -2.0, 2.1, 6.2]) shelfUnit(x, ROOM.z0 + 0.62, 0, 3.9);
  // 前墙一排（避开入口，面朝室内 -z）
  for (const x of [3.2, 7.3]) shelfUnit(x, ROOM.z1 - 0.62, Math.PI, 3.7);
  /* 阅览长桌 + 台灯 + 座椅 */
  const tableXs = [-3.4, 2.6];
  for (const tx of tableXs) {
    addBox(g, mats.wood, 3.4, 0.09, 1.0, tx, F + 0.74, 0.6);
    for (const lx of [-1.45, 1.45]) {
      for (const lz of [-0.38, 0.38]) {
        addBox(g, mats.darkWood, 0.09, 0.7, 0.09, tx + lx, F + 0.35, 0.6 + lz);
      }
    }
    addBox(g, mats.darkWood, 3.3, 0.06, 0.12, tx, F + 0.4, 0.6);
    for (const seatX of [-0.9, 0.9]) {
      addBox(g, mats.chair, 0.4, 0.06, 0.4, tx + seatX, F + 0.42, 1.28);
      addBox(g, mats.chair, 0.4, 0.4, 0.06, tx + seatX, F + 0.62, 1.5);
      addBox(g, mats.darkWood, 0.08, 0.4, 0.08, tx + seatX - 0.15, F + 0.21, 1.28);
      addBox(g, mats.darkWood, 0.08, 0.4, 0.08, tx + seatX + 0.15, F + 0.21, 1.28);
    }
  }
  // 台灯：三盏（灯罩发光）
  for (const [lx, lz] of [[-4.4, 0.25], [-2.4, 0.95], [3.4, 0.25]]) {
    addBox(g, mats.darkWood, 0.16, 0.03, 0.16, lx, F + 0.8, lz);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.34, 6), mats.brass);
    stem.position.set(lx, F + 0.98, lz);
    g.add(stem);
    addBox(g, mats.glow, 0.36, 0.04, 0.26, lx, F + 1.12, lz);
  }
  // 服务台（入口内侧）
  addBox(g, mats.wood, 2.4, 0.72, 0.7, 3.4, F + 0.36, 3.7);
  addBox(g, mats.redWood, 2.5, 0.07, 0.8, 3.4, F + 0.75, 3.7);
  // 吊顶灯带
  for (const lx of [-5.2, 0, 5.2]) addPane(g, mats.glow, 3.2, 0.05, lx, CEIL - 0.04, 0.3, 0, 0.5);
  addWarmLight(g, 0, CEIL - 0.35, 0.4, 6.5, 15);

  const toW = (p) => localToWorld(b, ROT, p);
  // 机位在入口拱门中轴附近（拱门 x=-1.8，宽 2.9），影片推门而入时反向射线穿过拱洞
  cameras.libraryReading = {
    position: toW([-1.8, F + 0.86, 3.9]),
    target: toW([2.2, F + 0.62, -2.9]),
    fov: 58
  };
  return g;
}

/* ------------------------------------------------------------------ */
/*  入口                                                               */
/* ------------------------------------------------------------------ */

/**
 * 构建主教学楼与图书馆的室内场景（凤栖堂厅堂的旧写意室内已移除）。
 * @param {{ M: object, tex: object, reducedMotion?: boolean }} ctx
 * @returns {{ group: THREE.Group, cameras: Record<string, { position:number[], target:number[], fov:number }> }}
 */
export function buildInteriors(ctx = {}) {
  const { M, tex } = ctx;
  if (!M) throw new Error('interiors.js: buildInteriors 需要 ctx.M（材质库）');
  const mats = buildMats(M, tex || {});
  const group = new THREE.Group();
  group.name = 'interiors';
  group.userData.isInterior = true;
  const cameras = {};
  buildMainHallInterior(group, mats, cameras);
  buildLibraryInterior(group, mats, cameras);
  return { group, cameras };
}
