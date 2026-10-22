/* =========================================================
 * Slide & Triple — 图形掩码库（Shape Masks）Δ19b / FR-045
 * UMD 双导出（D-02）：浏览器挂 STM.ShapeMasks / Node module.exports
 * 纯数据 + 纯函数——前端渲染层与离线生成器/迁移器共用同一份定义
 * （宪章 II 零构建约束不破；FR-045 §2/§5 纯生成层约束）
 *
 * 36 套高辨识度轮廓模板（Shape Masks）:
 *   ① 每套定义为**格点集合**（可程序化推导的轮廓点集）
 *   ② 成型规则纯函数——给定「模板 id + 层号 + 棋盘尺寸」输出该层滑块落位集合
 *   ③ 模板 id MUST 落库于关卡 cfg（运行时 MUST NOT 随机选取——FR-045 §1）
 *   ④ 掩码覆盖率约为网格的 60%~90%，随层高 z 递增自然向内收拢成
 *      金字塔/阶梯叠落——确保上层 100% 落在下层支撑面之上（零悬空）
 *
 * 坐标模型（FR-044 奇偶层半格错位）:
 *   偶数层 z=0,2,4 → 标准格 (r,c) ∈ [0,n-1]²
 *   奇数层 z=1,3  → 半格位 (r+0.5,c+0.5)，(r,c) ∈ [0,n-2]²
 *   奇数层瓦片恰压在下层 2×2 四格的十字交界中心
 * ========================================================= */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else (global.STM = global.STM || {}).ShapeMasks = factory();
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  /* ---------- 模板登记表（36 套，id 0~35） ----------
   * 每条目 = { id, name, kind, build }
   *   kind = 'ring' | 'poly' | 'blob' | 'sym'
   *   build(n, z, params) → 格点数组 [{r,c}]
   *   模板 id MUST 落库于关卡 cfg（运行时 MUST NOT 随机选取）
   */
  var TEMPLATES = [];

  /* ---------- 通用几何工具 ---------- */

  function inBounds(n, r, c) { return r >= 0 && r < n && c >= 0 && c < n; }

  /* 归一化坐标到 [0,1]（以棋盘中心为原点） */
  function norm(n, r, c) {
    var mid = (n - 1) / 2;
    return { x: (c - mid) / (mid || 1), y: (r - mid) / (mid || 1) };
  }

  /* 极坐标（角度 0 = 右，逆时针为正） */
  function polar(n, r, c) {
    var p = norm(n, r, c);
    return { ang: Math.atan2(-p.y, p.x), rad: Math.sqrt(p.x * p.x + p.y * p.y) };
  }

  /* 曼哈顿距离归一 */
  function manh(n, r, c) {
    var p = norm(n, r, c);
    return Math.abs(p.x) + Math.abs(p.y);
  }

  /* 极坐标距离（欧氏）归一 */
  function eucl(n, r, c) {
    var p = norm(n, r, c);
    return Math.sqrt(p.x * p.x + p.y * p.y);
  }

  /* 收集满足谓词的格点（按行优先列优先排序——确定性） */
  function collect(n, pred) {
    var out = [];
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        if (pred(r, c)) out.push({ r: r, c: c });
      }
    }
    return out;
  }

  /* 注册模板 */
  function reg(id, name, kind, build) {
    TEMPLATES.push({ id: id, name: name, kind: kind, build: build });
  }

  /* =========================================================
   * 36 套模板定义
   * 每套 build(n) 返回该层落位格点集（格单位坐标）
   *
   * 造型口径（FR-045 §1「高辨识度轮廓」+ 覆盖率 60%~90%）:
   *   **打分取集**（score-threshold）——每套模板给每个格点打一个
   *   「归属分」（signature score），取分数最高的一批格点作为轮廓。
   *   该口径确保：
   *     · 覆盖率在任何棋盘尺寸 n 下恒落在 60%~90% 区间（不随 n 漂移）；
   *     · 轮廓随 n 增大自然细化，保持同一「造型语言」；
   *     · 分层收拢只需统一调低阈值即可（shapeAt 内执行）。
   *   分数定义：score = 1 - dist（dist 为该点到造型中心的归一化距离）
   *   或极角相关项；统一走 shapeScore() 排序取集。
   * ========================================================= */

  /* 打分取集：按分数降序取前 count 个格点（分数相同按行优先列优先——确定性） */
  function takeTop(n, scoreFn, count) {
    var cells = [];
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) cells.push({ r: r, c: c, s: scoreFn(r, c) });
    }
    cells.sort(function (a, b) {
      if (b.s !== a.s) return b.s - a.s;
      if (a.r !== b.r) return a.r - b.r;
      return a.c - b.c;
    });
    return cells.slice(0, count).map(function (x) { return { r: x.r, c: x.c }; });
  }

  /* 覆盖率目标：n² 的 60%~90% → 取 n²*0.74 附近（居中，留出特征镂空余量） */
  function covCount(n, pct) { return Math.max(1, Math.round(n * n * (pct || 0.74))); }

  /* 距离型分数（score = 1 - 归一化距离），越大越靠近造型中心 */
  function dScore(fn) {
    return function (r, c) { return 1 - fn(r, c); };
  }
  /* 角度型分数（score = 1 - 与目标角带的偏差） */
  function aScore(lobes) {
    return function (r, c) {
      var po = polar(n_arg, r, c);
      return Math.abs(Math.sin(po.ang * lobes));
    };
  }
  var n_arg = 0; /* aScore 闭包用（由 build 包装注入） */

  /* 构造一个「角度型 + 半径型」复合打分器 */
  function polarScore(n, lobes, radialFn) {
    return function (r, c) {
      var po = polar(n, r, c);
      var angTerm = Math.abs(Math.sin(po.ang * lobes));
      var radTerm = radialFn(po.rad);
      return angTerm * 0.55 + radTerm * 0.45;
    };
  }

  /* —— 1~6 基础几何族 —— */

  reg(0, '蝶翼双翼', 'sym', function (n) {
    /* 蝴蝶：左右双翼（中央腰部收窄） + 中央蝶身 */
    return takeTop(n, function (r, c) {
      var p = norm(n, r, c);
      var waist = 1 - Math.abs(p.x) * 0.55;          /* 越靠中央越高 */
      var body = Math.abs(p.x) < 0.2 ? 0.35 : 0;    /* 蝶身加成 */
      var spread = 1 - Math.abs(p.y) * 0.35;
      return waist * spread + body;
    }, covCount(n, 0.76));
  });

  reg(1, '爱心', 'sym', function (n) {
    /* 爱心：上方双圆瓣 + 下方尖角 */
    return takeTop(n, function (r, c) {
      var p = norm(n, r, c);
      var y = -p.y;                                  /* y 向上为正 */
      /* 双瓣：两个圆心 (-0.34,0.34)/(0.34,0.34) */
      var l = Math.sqrt((p.x + 0.34) * (p.x + 0.34) + (y - 0.34) * (y - 0.34));
      var rr = Math.sqrt((p.x - 0.34) * (p.x - 0.34) + (y - 0.34) * (y - 0.34));
      var lobe = Math.min(l, rr);
      /* 尖角：底部三角 */
      var tip = y < 0 ? Math.abs(p.x) * 1.5 + (-y) * 0.55 : 99;
      return 1 - Math.min(lobe, tip) * 1.15;
    }, covCount(n, 0.72));
  });

  reg(2, '上下分岛', 'sym', function (n) {
    /* 上下分岛：中间水平带留空（双岛） */
    return takeTop(n, function (r, c) {
      var p = norm(n, r, c);
      var gap = Math.abs(p.y);
      var rad = 1 - eucl(n, r, c) * 0.45;
      return rad - gap * 1.4;
    }, covCount(n, 0.74));
  });

  reg(3, '弯月拱桥', 'sym', function (n) {
    /* 弯月：圆盘主体 − 下方大缺口 */
    return takeTop(n, function (r, c) {
      var p = norm(n, r, c);
      var d = eucl(n, r, c);
      var bite = Math.sqrt(p.x * p.x + (p.y + 0.4) * (p.y + 0.4));
      return 1 - d * 0.5 - Math.max(0, 0.62 - bite) * 1.6;
    }, covCount(n, 0.72));
  });

  reg(4, '金字塔', 'poly', function (n) {
    /* 金字塔：底宽顶尖的三角阶梯 */
    return takeTop(n, function (r, c) {
      var p = norm(n, r, c);
      var y = -p.y;
      var width = 0.9 - y * 0.62;                   /* 越高越窄 */
      return 1 - Math.max(0, Math.abs(p.x) - width) * 1.5 - Math.max(0, Math.abs(y) - 0.92) * 1.2;
    }, covCount(n, 0.74));
  });

  reg(5, '钥匙孔环岛', 'sym', function (n) {
    /* 钥匙孔：环形主体 + 中心锁孔（低分） */
    return takeTop(n, function (r, c) {
      var p = norm(n, r, c);
      var d = eucl(n, r, c);
      var ring = 1 - Math.abs(d - 0.68) * 1.5;
      var hole = d < 0.3 ? -0.6 : 0;                /* 锁孔挖空 */
      var slot = (Math.abs(p.x) < 0.18 && p.y < 0 && p.y > -0.6) ? -0.6 : 0;
      return ring + hole + slot;
    }, covCount(n, 0.72));
  });

  /* —— 7~12 礼盒与器物族 —— */

  reg(6, '十字礼盒', 'sym', function (n) {
    /* 十字礼盒：横竖臂（十字形） */
    return takeTop(n, function (r, c) {
      var p = norm(n, r, c);
      var v = Math.abs(p.x) < 0.4 && Math.abs(p.y) < 0.95;
      var h = Math.abs(p.y) < 0.4 && Math.abs(p.x) < 0.95;
      return (v || h) ? 1 : -1;
    }, covCount(n, 0.66));
  });

  reg(7, '菱形切割', 'poly', function (n) {
    /* 菱形 + 中心十字切割 */
    return takeTop(n, function (r, c) {
      var p = norm(n, r, c);
      var dia = 1 - manh(n, r, c) * 0.95;
      var cut = (Math.abs(p.x) < 0.1 || Math.abs(p.y) < 0.1) && manh(n, r, c) < 0.5 ? -0.55 : 0;
      return dia + cut;
    }, covCount(n, 0.72));
  });

  reg(8, '沙漏', 'sym', function (n) {
    /* 沙漏：上下宽、中间窄 */
    return takeTop(n, function (r, c) {
      var p = norm(n, r, c);
      var width = 0.26 + 0.6 * Math.abs(p.y);
      return 1 - Math.max(0, Math.abs(p.x) - width) * 1.6;
    }, covCount(n, 0.72));
  });

  reg(9, '风车', 'sym', function (n) {
    /* 风车：四叶旋转 + 中心毂 */
    return takeTop(n, polarScore(n, 4, function (rad) { return 1 - rad; }), covCount(n, 0.74));
  });

  reg(10, '皇冠双角', 'sym', function (n) {
    /* 皇冠：冠带 + 三尖 */
    return takeTop(n, function (r, c) {
      var p = norm(n, r, c);
      var y = -p.y;
      var band = (y > -0.3 && y < 0.2) ? 1.1 : 0;
      var spike = 0;
      if (y >= 0.2) {
        var s2 = Math.min(Math.abs(p.x), Math.abs(Math.abs(p.x) - 0.55));
        spike = y < 0.9 ? (1 - s2 * 3) : 0;
      }
      return band + spike - Math.max(0, y - 0.92) * 2;
    }, covCount(n, 0.70));
  });

  reg(11, '四叶草', 'sym', function (n) {
    /* 四叶草：四叶 + 中心缝 */
    return takeTop(n, function (r, c) {
      var p = norm(n, r, c);
      var lobe = Math.min(
        Math.hypot(p.x, p.y - 0.45), Math.hypot(p.x, p.y + 0.45),
        Math.hypot(p.x - 0.45, p.y), Math.hypot(p.x + 0.45, p.y));
      return 1 - lobe * 1.2;
    }, covCount(n, 0.74));
  });

  /* —— 13~18 几何星形族 —— */

  reg(12, '六芒星', 'poly', function (n) {
    /* 六芒星：六角辐射 */
    return takeTop(n, polarScore(n, 6, function (rad) { return 1 - rad; }), covCount(n, 0.70));
  });

  reg(13, '螺旋', 'blob', function (n) {
    /* 螺旋：沿极角的阿基米德螺线 */
    return takeTop(n, function (r, c) {
      var po = polar(n, r, c);
      var t = (po.ang + Math.PI * 2) % (Math.PI * 2);
      var spiralR = 0.2 + 0.115 * t;
      return 1 - Math.abs(po.rad - spiralR) * 1.3;
    }, covCount(n, 0.72));
  });

  reg(14, '铁锚', 'sym', function (n) {
    /* 铁锚：竖杆 + 横梁 + 底部钩 */
    return takeTop(n, function (r, c) {
      var p = norm(n, r, c);
      var y = -p.y;
      var stem = (Math.abs(p.x) < 0.18 && y < 0.92 && y > -0.3) ? 1.2 : 0;
      var bar = (Math.abs(p.y) < 0.18 && Math.abs(p.x) < 0.8 && y > 0.1) ? 1.1 : 0;
      var d = Math.hypot(p.x, y + 0.45);
      var hook = (d > 0.42 && d < 0.9 && y < -0.2) ? 1.0 : 0;
      return stem + bar + hook;
    }, covCount(n, 0.68));
  });

  reg(15, '双塔', 'sym', function (n) {
    /* 双塔：左右两竖列 + 底桥（中间上部镂空） */
    return takeTop(n, function (r, c) {
      var p = norm(n, r, c);
      var y = -p.y;
      var tower = (Math.abs(p.x) > 0.34 && Math.abs(p.x) < 0.78) ? 1.1 : 0;
      var bridge = (y > 0.5 && Math.abs(p.x) < 0.78) ? 1.05 : 0;
      return tower + bridge;
    }, covCount(n, 0.68));
  });

  reg(16, '蜂巢六边', 'sym', function (n) {
    /* 蜂巢：六边形 + 三条缝 */
    return takeTop(n, function (r, c) {
      var p = norm(n, r, c);
      var q = Math.abs(p.x) * 0.866 + Math.abs(p.y) * 0.5;
      var hex = 1 - Math.max(q, Math.abs(p.y)) * 1.05;
      var seam = (Math.abs(p.x) < 0.09 || Math.abs(p.y) < 0.09 || Math.abs(p.x - p.y) < 0.09) ? -0.5 : 0;
      return hex + seam;
    }, covCount(n, 0.70));
  });

  reg(17, '盾牌', 'sym', function (n) {
    /* 盾牌：上宽下尖 */
    return takeTop(n, function (r, c) {
      var p = norm(n, r, c);
      var y = -p.y;
      var width = y > 0 ? 0.9 : 0.9 * (1 - Math.pow(-y, 1.7));
      return 1 - Math.max(0, Math.abs(p.x) - width) * 1.8;
    }, covCount(n, 0.72));
  });

  /* —— 19~24 生灵飞行族 —— */

  reg(18, '飞鸟展翼', 'sym', function (n) {
    /* 飞鸟：上展双翼 + 身体 + 尾 */
    return takeTop(n, function (r, c) {
      var p = norm(n, r, c);
      var y = -p.y;
      var wing = (y > 0 && Math.abs(p.x) < 0.95) ? (1 - Math.abs(p.x) * 0.5) : 0;
      var body = (Math.abs(p.x) < 0.2 && y > -0.7 && y < 0.4) ? 1.15 : 0;
      var tail = (y > 0.55 && Math.abs(p.x) < 0.42) ? 1.0 : 0;
      return wing + body + tail;
    }, covCount(n, 0.70));
  });

  reg(19, '雪花六枝', 'sym', function (n) {
    /* 雪花：六向辐射枝 + 中心 */
    return takeTop(n, function (r, c) {
      var po = polar(n, r, c);
      var branch = Math.abs(Math.sin(po.ang * 3));
      return branch * (1 - po.rad * 0.5) + (po.rad < 0.3 ? 0.6 : 0);
    }, covCount(n, 0.70));
  });

  reg(20, '双鱼双尾', 'sym', function (n) {
    /* 双鱼：双翼 + 中央 S 形脊 */
    return takeTop(n, function (r, c) {
      var p = norm(n, r, c);
      var wing = 1 - Math.abs(p.x) * 0.5 - Math.abs(p.y) * 0.3;
      var spine = 1 - Math.abs(Math.abs(p.y) - Math.abs(p.x) * 0.55) * 2.2;
      return Math.max(wing, spine);
    }, covCount(n, 0.74));
  });

  reg(21, '百合花冠', 'sym', function (n) {
    /* 百合：六瓣 */
    return takeTop(n, polarScore(n, 6, function (rad) { return 1 - rad; }), covCount(n, 0.70));
  });

  reg(22, '猫耳双峰', 'sym', function (n) {
    /* 猫耳：底宽 + 顶双角（中央凹口） */
    return takeTop(n, function (r, c) {
      var p = norm(n, r, c);
      var y = -p.y;
      var head = (y < 0.35 && Math.abs(p.x) < 0.85) ? 1.1 : 0;
      var ears = 0;
      if (y >= 0.35 && y < 0.92) {
        var s2 = Math.min(Math.abs(p.x), Math.abs(Math.abs(p.x) - 0.5));
        ears = 1 - s2 * 2.6;
      }
      return head + ears;
    }, covCount(n, 0.72));
  });

  reg(23, '灯笼提绳', 'sym', function (n) {
    /* 灯笼：椭圆身 + 上下盖 + 提绳 */
    return takeTop(n, function (r, c) {
      var p = norm(n, r, c);
      var body = 1 - Math.hypot(p.x / 0.78, p.y / 0.95) * 1.05;
      var caps = (Math.abs(p.y) > 0.66 && Math.abs(p.x) < 0.55) ? 1.15 : 0;
      var rope = (Math.abs(p.x) < 0.1 && p.y < -0.62) ? 1.1 : 0;
      return Math.max(body, Math.max(caps, rope));
    }, covCount(n, 0.72));
  });

  /* —— 25~30 建筑器物族 —— */

  reg(24, '星塔尖顶', 'poly', function (n) {
    /* 塔尖：三角尖顶 + 塔身 */
    return takeTop(n, function (r, c) {
      var p = norm(n, r, c);
      var y = -p.y;
      var spire = (y > 0.2) ? (1 - Math.max(0, Math.abs(p.x) - (0.9 - y) * 0.8) * 1.6) : 0;
      var tower = (y <= 0.2 && y > -0.9 && Math.abs(p.x) < 0.6) ? 1.1 : 0;
      return Math.max(spire, tower);
    }, covCount(n, 0.70));
  });

  reg(25, '拱门回廊', 'sym', function (n) {
    /* 拱门：外框 + 拱洞（洞内低分） */
    return takeTop(n, function (r, c) {
      var p = norm(n, r, c);
      var frame = 1 - Math.max(Math.abs(p.x), Math.abs(p.y)) * 1.05;
      var arch = (Math.hypot(p.x, p.y - 0.15) < 0.52 && p.y < 0.55) ? -0.7 : 0;
      return frame + arch;
    }, covCount(n, 0.72));
  });

  reg(26, '帆船三角', 'poly', function (n) {
    /* 帆船：三角帆 + 船身 */
    return takeTop(n, function (r, c) {
      var p = norm(n, r, c);
      var y = -p.y;
      var sail = (y > -0.25) ? (1 - Math.abs(p.x + y * 0.42) * 2.4) : 0;
      var hull = (y <= -0.25 && y > -0.72 && Math.abs(p.x) < 0.9) ? 1.1 : 0;
      return Math.max(sail, hull);
    }, covCount(n, 0.70));
  });

  reg(27, '蘑菇伞盖', 'sym', function (n) {
    /* 蘑菇：半圆伞盖 + 菌柄 */
    return takeTop(n, function (r, c) {
      var p = norm(n, r, c);
      var y = -p.y;
      var cap = (y > -0.1) ? (1 - Math.hypot(p.x / 0.9, y / 0.78) * 1.05) : 0;
      var stem = (y <= -0.1 && y > -0.9 && Math.abs(p.x) < 0.26) ? 1.1 : 0;
      return Math.max(cap, stem);
    }, covCount(n, 0.70));
  });

  reg(28, '火箭箭体', 'sym', function (n) {
    /* 火箭：尖头 + 箭体 + 尾翼 */
    return takeTop(n, function (r, c) {
      var p = norm(n, r, c);
      var y = -p.y;
      var nose = (y > 0.28) ? (1 - Math.max(0, Math.abs(p.x) - (0.88 - y) * 1.5) * 1.6) : 0;
      var shaft = (y <= 0.28 && y > -0.28 && Math.abs(p.x) < 0.3) ? 1.2 : 0;
      var fins = (y <= -0.28 && y > -0.9 && Math.abs(p.x) < 0.85 && Math.abs(p.x) > 0.28) ? 1.0 : 0;
      return Math.max(nose, Math.max(shaft, fins));
    }, covCount(n, 0.70));
  });

  reg(29, '热气球吊篮', 'sym', function (n) {
    /* 热气球：球体 + 篮 + 吊绳 */
    return takeTop(n, function (r, c) {
      var p = norm(n, r, c);
      var y = -p.y;
      var ball = (y > -0.22) ? (1 - Math.hypot(p.x / 0.78, p.y / 0.92) * 1.05) : 0;
      var basket = (y <= -0.22 && y > -0.78 && Math.abs(p.x) < 0.32) ? 1.2 : 0;
      var ropes = (y <= -0.22 && y > -0.62 && Math.abs(p.x) >= 0.32 && Math.abs(p.x) < 0.46) ? 1.05 : 0;
      return Math.max(ball, Math.max(basket, ropes));
    }, covCount(n, 0.70));
  });

  /* —— 31~36 抽象符号族 —— */

  reg(30, '日晕光环', 'sym', function (n) {
    /* 光环：外环 + 内核（环缝低分） */
    return takeTop(n, function (r, c) {
      var d = eucl(n, r, c);
      var ring = 1 - Math.abs(d - 0.66) * 1.8;
      var core = d < 0.32 ? 0.9 : 0;
      return Math.max(ring, core);
    }, covCount(n, 0.70));
  });

  reg(31, '锁孔方章', 'sym', function (n) {
    /* 方章 + 键孔 */
    return takeTop(n, function (r, c) {
      var p = norm(n, r, c);
      var plate = 1 - Math.max(Math.abs(p.x), Math.abs(p.y)) * 1.05;
      var hole = (Math.hypot(p.x, p.y - 0.12) < 0.3) ? -0.75 : 0;
      var slot = (Math.abs(p.x) < 0.16 && p.y < 0 && p.y > -0.62) ? -0.75 : 0;
      return plate + hole + slot;
    }, covCount(n, 0.72));
  });

  reg(32, '闪电折线', 'blob', function (n) {
    /* 闪电：菱形主体 − Z 形厚缝 */
    return takeTop(n, function (r, c) {
      var p = norm(n, r, c);
      var dia = 1 - manh(n, r, c) * 0.95;
      var bolt = (Math.abs(p.x + p.y * 0.5) < 0.16 || Math.abs(p.x - p.y * 0.5) < 0.16) ? -0.7 : 0;
      return dia + bolt;
    }, covCount(n, 0.72));
  });

  reg(33, '音符符尾', 'blob', function (n) {
    /* 音符：符头 + 竖杆 + 旗 */
    return takeTop(n, function (r, c) {
      var p = norm(n, r, c);
      var head = 1 - Math.hypot((p.x + 0.36) / 0.45, (p.y + 0.42) / 0.34) * 1.05;
      var stem = (p.x > 0.14 && p.x < 0.38 && p.y > -0.3 && p.y < 0.8) ? 1.2 : 0;
      var flag = (p.x > 0.05 && p.x < 0.74 && p.y > 0.46 && p.y < 0.84) ? 1.15 : 0;
      return Math.max(head, Math.max(stem, flag));
    }, covCount(n, 0.70));
  });

  reg(34, '齿轮轮齿', 'sym', function (n) {
    /* 齿轮：齿盘 + 中心毂 */
    return takeTop(n, function (r, c) {
      var po = polar(n, r, c);
      var gear = (po.rad < 0.62) ? 0.8 : (Math.abs(Math.sin(po.ang * 4)) < 0.5 ? 1.1 : 0);
      var hub = po.rad < 0.22 ? 1.2 : 0;
      return Math.max(gear, hub) - Math.max(0, po.rad - 0.95) * 3;
    }, covCount(n, 0.70));
  });

  reg(35, '书页双翼', 'sym', function (n) {
    /* 展开的书：左右两页 + 中央书脊 */
    return takeTop(n, function (r, c) {
      var p = norm(n, r, c);
      var page = 1 - Math.max(Math.abs(p.x), Math.abs(p.y)) * 1.05;
      var spine = Math.abs(p.x) < 0.1 ? 0.9 : 0;
      var gap = (Math.abs(p.x) > 0.1 && Math.abs(p.x) < 0.22) ? -0.4 : 0;
      return page + spine + gap;
    }, covCount(n, 0.74));
  });

  /* =========================================================
   * 成型规则（FR-045 §2 纯函数）
   *   shapeAt(templateId, z, n) → 该层滑块落位集合 [{r,c}]
   *   分层收拢：层 z 的轮廓 = 层 0 轮廓**向内收拢**（保证上层 100%
   *   落在下层支撑面之上——零悬空）
   * ========================================================= */

  /* 收拢半径（层 z 相对于层 0 的收缩量）——奇数层收缩略大（半格压角） */
  function shrinkFor(z) {
    /* z=0 → 0；z=1 → 0.16；z=2 → 0.30；z=3 → 0.42；z=4 → 0.52 */
    var table = [0, 0.16, 0.30, 0.42, 0.52];
    return table[Math.min(z, 4)] || 0;
  }

  function shapeAt(templateId, z, n) {
    var tpl = TEMPLATES[templateId];
    if (!tpl) return [];
    var base = tpl.build(n, 0);
    if (z === 0) return base;

    /* 分层收拢：按「到中心的距离」保留内缩后的部分
     * 收拢判据使用**偶数层格距**——奇数层坐标域少一格，半格位中心
     * (r+0.5,c+0.5) 恰好落在下层 2×2 交界，故以渲染实坐标判内缩 */
    var shrink = shrinkFor(z);
    var out = [];
    for (var i = 0; i < base.length; i++) {
      var cell = base[i];
      var d = eucl(n, cell.r, cell.c);
      if (d <= 0.94 - shrink) out.push({ r: cell.r, c: cell.c });
    }
    /* 收拢后为空（极端小棋盘）→ 保留最靠近中心的若干格 */
    if (!out.length) {
      var sorted = base.slice().sort(function (a, b) { return eucl(n, a.r, a.c) - eucl(n, b.r, b.c); });
      out = sorted.slice(0, Math.max(1, Math.min(3, base.length)));
    }
    return out;
  }

  /* 奇数层坐标域裁剪——半格位 (r,c) 须 r,c ∈ [0, n-2] */
  function clipToLayerDomain(cells, z, n) {
    var lim = (z % 2 === 1) ? n - 1 : n;
    var out = [];
    for (var i = 0; i < cells.length; i++) {
      if (cells[i].r >= 0 && cells[i].r < lim && cells[i].c >= 0 && cells[i].c < lim) {
        out.push(cells[i]);
      }
    }
    return out;
  }

  /* 该层坐标域边长（奇数层少一格） */
  function layerSize(n, z) { return (z % 2 === 1) ? Math.max(0, n - 1) : n; }

  /* =========================================================
   * 跨层支撑校验（FR-044 §3 零悬空）
   *   given: 下层落位集合 lower（层 z-1）
   *   given: 上层落位集合 upper（层 z）
   *   given: 上层奇偶 parity（上层 z 的奇偶——决定支撑象限口径）
   *   返回: 违规上层格点数组（下方无支撑者）
   *   支撑判据（与 RulesEngine.crossPositions 严格同形）:
   *     · 上层为**奇数层** (r,c) → 支撑位 (r,c)(r,c+1)(r+1,c)(r+1,c+1)
   *     · 上层为**偶数层** (r,c) → 支撑位 (r-1,c-1)(r-1,c)(r,c-1)(r,c)
   * ========================================================= */
  function supportViolations(lowerCells, upperCells, upperOdd) {
    var set = {};
    for (var i = 0; i < lowerCells.length; i++) set[lowerCells[i].r + ':' + lowerCells[i].c] = true;
    var bad = [];
    for (var j = 0; j < upperCells.length; j++) {
      var r = upperCells[j].r, c = upperCells[j].c;
      var ok;
      if (upperOdd) {
        ok = set[r + ':' + c] || set[r + ':' + (c + 1)] || set[(r + 1) + ':' + c] || set[(r + 1) + ':' + (c + 1)];
      } else {
        ok = set[(r - 1) + ':' + (c - 1)] || set[(r - 1) + ':' + c] || set[r + ':' + (c - 1)] || set[r + ':' + c];
      }
      if (!ok) bad.push({ r: r, c: c });
    }
    return bad;
  }

  /* 供生成器/迁移器使用：给定模板 id 与层数矩阵，逐层产出落位集合
   *   buildLayers(templateId, n, layerCount) → [{z, cells}]（自下而上）
   *   保证：上层 100% 有下层支撑（构造时即已剔除违规格） */
  function buildLayers(templateId, n, layerCount) {
    var layers = [];
    var prev = null;
    for (var z = 0; z < layerCount; z++) {
      var cells = clipToLayerDomain(shapeAt(templateId, z, n), z, n);
      if (prev) {
        /* 剔除悬空格（无下层支撑者）——保证零悬空 */
        var viol = supportViolations(prev, cells, (z % 2) === 1);
        if (viol.length) {
          var bad = {};
          for (var v = 0; v < viol.length; v++) bad[viol[v].r + ':' + viol[v].c] = true;
          cells = cells.filter(function (cell) { return !bad[cell.r + ':' + cell.c]; });
        }
      }
      layers.push({ z: z, cells: cells });
      prev = cells;
    }
    return layers;
  }

  /* 模板 id → 名称（关卡 cfg 落库用；渲染层/tooltip 展示用） */
  function templateName(id) {
    var t = TEMPLATES[id];
    return t ? t.name : ('模板' + id);
  }

  return {
    TEMPLATES: TEMPLATES,
    TEMPLATE_COUNT: TEMPLATES.length,
    templateName: templateName,
    shapeAt: shapeAt,
    buildLayers: buildLayers,
    clipToLayerDomain: clipToLayerDomain,
    supportViolations: supportViolations,
    layerSize: layerSize,
    shrinkFor: shrinkFor
  };
});
