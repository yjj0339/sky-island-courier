# 浮空岛快递 · Sky Island Courier

驾驶一架珊瑚橙小飞机，在明亮的天空与白云之间穿越漂浮小岛，完成 **5 份天空快递订单**。
低多边形卡通风格，Three.js 实现，桌面与手机横屏均可玩，可「添加到主屏幕」像 App 一样全屏横屏游玩。

**在线试玩：<https://yjj0339.github.io/sky-island-courier/>**

## 玩法

| 模式 | 说明 |
| --- | --- |
| 快递订单 | 天空邮局·第 7 航线：按顺序把 5 份包裹投递到 风车岛 → 灯塔岛 → 樱花岛 → 雪顶岛 → 糖果岛。飞进岛上的金色投递环即可空投，越快送达奖励越多 |
| 风环冲刺 | 90 秒内连穿金色风环，连击越高得分越高，错过一环连击清零 |
| 自由飞行 | 无倒计时，随心游览；风环沿航线不断出现 |

穿过风环会获得冲刺加速并回复加速能量。撞到浮空岛会被弹开并减速。最高分按模式分别保存在本地浏览器（`localStorage`）。

### 操作

| | 键盘 | 触屏 |
| --- | --- | --- |
| 上升 / 下降 | `W` / `S`（或 ↑ / ↓） | 左侧浮动摇杆 上 / 下 |
| 左右转向 | `A` / `D`（或 ← / →） | 左侧浮动摇杆 左 / 右 |
| 加速 | `Space` | 右半屏按住（大按钮） |
| 暂停 / 静音 / 视角 / 语言 / 全屏 | `P` / `M` / `C` / `L` / `F` | 右上角功能键 |

暂停菜单里还有：上下反转、省电画质。另外自带中英文切换（右上角 `EN` / `中`）与音效开关（含轻快背景音乐，全部 WebAudio 合成，无音频文件）。

## iPhone 添加到主屏幕并横屏使用

1. 用 **Safari** 打开上面的在线地址
2. 点底部 **分享** 按钮 → **添加到主屏幕**
3. 从桌面图标打开：全屏、无地址栏，横过手机即可（确保控制中心里 **竖排方向锁定** 已关闭）
4. 首次打开后会自动缓存全部资源，之后没网也能玩

> iOS 不允许网页强制锁定横屏，所以竖着拿时会显示「请横屏使用」提示并自动暂停，横过来就继续。

## 本地运行

必须通过 HTTP 访问（ES Module 与 Service Worker 都不支持 `file://`）：

```bash
node tools/serve.mjs 5300
# 打开 http://localhost:5300/
```

## 目录

```
index.html            页面与 UI 结构
css/game.css          玻璃拟态 UI / HUD / 触控布局
js/main.js            主循环、模式、HUD、雷达、结算
js/world.js           天空、云、浮空岛（程序化低多边形）、碰撞
js/plane.js           GLB 飞机加载 + 街机飞行模型
js/fx.js              粒子、风环、投递光柱、降落伞包裹、速度线
js/input.js           键盘 + 多点触控摇杆/加速
js/audio.js           WebAudio 音效与背景音乐
js/i18n.js            中英文
assets/plane.glb      飞机模型（随源码附带，本地加载）
lib/                  three.js r170 + GLTFLoader（本地化，无 CDN 依赖）
manifest.webmanifest  PWA 清单    sw.js  离线缓存
tools/blender/        用 Blender 程序化生成飞机 GLB 与图标的脚本
```

### 重新生成飞机模型 / 图标（可选，需要 Blender）

```bash
blender -b -P tools/blender/plane.py -- assets/plane.glb
blender -b -P tools/blender/icon.py -- assets/plane.glb icons
```

## 许可

代码 MIT；three.js 见 `lib/THREE_LICENSE.txt`。
