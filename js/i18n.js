// 中英文切换
const DICT = {
  zh: {
    title: '浮空岛快递',
    route: '天空邮局 · 第 7 航线',
    tagline: '驾驶珊瑚橙小飞机，穿过金色风环，把快递送到每一座浮空岛。',
    mode_orders: '快递订单', mode_orders_d: '5 份订单 · 依次送达',
    mode_dash: '风环冲刺', mode_dash_d: '90 秒 · 连穿风环刷高分',
    mode_free: '自由飞行', mode_free_d: '无倒计时 · 随心游览天空',
    best: '最高分', score: '得分', speed: '速度', alt: '高度', boost: '加速',
    start: '起飞',
    brief_orders: '今日 5 份天空订单',
    brief_orders_p: '从天空邮局出发，按顺序把包裹投递到 5 座岛屿：飞进岛上的金色投递环即可空投。沿途风环会让你冲刺加速，越快送达奖励越多。',
    brief_dash_t: '风环冲刺',
    brief_dash_p: '90 秒内尽可能多地穿过金色风环。连续穿环会累积连击倍数，每环得分更高；错过一环连击清零。',
    brief_dash_1: '穿环获得冲刺加速，并回复加速能量',
    brief_dash_2: '连击越高，每环得分越高',
    brief_dash_3: '小心浮空岛：撞上会被弹开并减速',
    brief_free_t: '自由飞行',
    brief_free_p: '没有时间限制，没有订单压力。绕着浮空岛兜风、钻过云层、穿过风环，随时按暂停回到主页。',
    brief_free_1: '右上角可切换近景 / 远景视角',
    brief_free_2: '雷达会显示附近岛屿与下一个风环',
    brief_free_3: '风环会沿航线不断出现，想穿就穿',
    k_ud: '升降', k_turn: '转向', k_boost: '加速', k_pause: '暂停', k_mute: '静音', k_cam: '视角',
    k_arrows: '方向键同样可用',
    t_stick: '左侧摇杆：升降 / 转向', t_boost: '右侧按住：加速',
    install_tip: 'iPhone：点 Safari 底部「分享」→「添加到主屏幕」，之后从桌面图标打开即可全屏横屏游玩。',
    credit: 'Three.js · 低多边形飞行小游戏',
    paused: '已暂停', resume: '继续', restart: '重新开始', home: '返回主页',
    sound: '音效', language: '语言', invert: '上下反转', lite: '省电画质',
    pause: '暂停', camera: '切换视角', fullscreen: '全屏',
    rotate: '请横屏使用', rotate_sub: '把手机横过来，天空会更宽广 ✈',
    loading: '正在装载包裹…',
    new_record: '新纪录！',
    again: '再飞一次',
    res_done: '全部送达！', res_time: '时间到！', res_free: '本次飞行',
    st_time: '用时', st_rings: '风环', st_combo: '最高连击', st_delivered: '送达', st_dist: '航程',
    // HUD & toasts
    order_n: '订单',
    go: '出发！',
    ring: '风环', combo: '连击',
    delivered: '送达成功！', order_next: '下一份订单',
    bonus_speed: '极速奖励',
    miss: '错过风环',
    bump: '撞到小岛！',
    back_route: '返回航线区域',
    time_up: '时间到',
    view_near: '近景', view_far: '远景',
    dash_hint: '穿过金色风环！',
    free_hint: '自由飞行 · 随心游览',
    meter: '米',
    // 订单
    o1_name: '风车岛', o1_note: '给磨坊主送去刚出炉的面包',
    o2_name: '灯塔岛', o2_note: '给守塔人送一壶热茶',
    o3_name: '樱花岛', o3_note: '把生日蛋糕送到樱花树下的派对',
    o4_name: '雪顶岛', o4_note: '给登山队送去保暖毛毯',
    o5_name: '糖果岛', o5_note: '最后一封情书，要送进糖果小屋',
    home_name: '天空邮局',
    ringlabel: '下一个风环',
  },
  en: {
    title: 'Sky Island Courier',
    route: 'Sky Post · Route 7',
    tagline: 'Pilot a coral-orange plane through golden wind rings and deliver parcels to every floating island.',
    mode_orders: 'Parcel Orders', mode_orders_d: '5 orders · deliver in order',
    mode_dash: 'Ring Dash', mode_dash_d: '90 s · chain rings for a high score',
    mode_free: 'Free Flight', mode_free_d: 'No timer · roam the sky',
    best: 'Best', score: 'Score', speed: 'Speed', alt: 'Alt', boost: 'BOOST',
    start: 'Take off',
    brief_orders: "Today's 5 sky orders",
    brief_orders_p: 'Leave the Sky Post Office and deliver to 5 islands in order — fly through the golden delivery ring above each island to air-drop. Wind rings on the way give you a speed burst; faster deliveries earn more.',
    brief_dash_t: 'Ring Dash',
    brief_dash_p: 'Fly through as many golden rings as you can in 90 seconds. Chain rings to build a combo for bigger points. Miss one and the combo resets.',
    brief_dash_1: 'Rings give a speed burst and refill boost energy',
    brief_dash_2: 'Higher combo = more points per ring',
    brief_dash_3: 'Mind the islands — hitting one bounces you back and slows you',
    brief_free_t: 'Free Flight',
    brief_free_p: 'No timer, no pressure. Cruise around the islands, dive through clouds and thread the rings. Pause any time to head home.',
    brief_free_1: 'Switch near / far camera from the top-right',
    brief_free_2: 'The radar shows nearby islands and the next ring',
    brief_free_3: 'Rings keep appearing along your flight path',
    k_ud: 'Climb/Dive', k_turn: 'Steer', k_boost: 'Boost', k_pause: 'Pause', k_mute: 'Mute', k_cam: 'Camera',
    k_arrows: 'Arrow keys work too',
    t_stick: 'Left stick: climb / steer', t_boost: 'Hold right side: boost',
    install_tip: 'iPhone: tap Share in Safari → "Add to Home Screen", then launch from the icon for full-screen landscape play.',
    credit: 'Three.js · low-poly flight game',
    paused: 'Paused', resume: 'Resume', restart: 'Restart', home: 'Home',
    sound: 'Sound', language: 'Language', invert: 'Invert Y', lite: 'Battery saver',
    pause: 'Pause', camera: 'Camera', fullscreen: 'Fullscreen',
    rotate: 'Please rotate your phone', rotate_sub: 'Landscape gives you a wider sky ✈',
    loading: 'Loading parcels…',
    new_record: 'New record!',
    again: 'Fly again',
    res_done: 'All delivered!', res_time: "Time's up!", res_free: 'Flight summary',
    st_time: 'TIME', st_rings: 'RINGS', st_combo: 'BEST COMBO', st_delivered: 'DELIVERED', st_dist: 'DISTANCE',
    order_n: 'Order',
    go: 'Take off!',
    ring: 'Ring', combo: 'Combo',
    delivered: 'Delivered!', order_next: 'Next order',
    bonus_speed: 'Speed bonus',
    miss: 'Ring missed',
    bump: 'Bonk!',
    back_route: 'Return to flight area',
    time_up: "Time's up",
    view_near: 'Near view', view_far: 'Far view',
    dash_hint: 'Fly through the golden rings!',
    free_hint: 'Free flight · roam freely',
    meter: 'm',
    o1_name: 'Windmill Isle', o1_note: 'Fresh bread for the miller',
    o2_name: 'Lighthouse Isle', o2_note: 'A pot of hot tea for the keeper',
    o3_name: 'Blossom Isle', o3_note: 'Birthday cake for the party under the blossoms',
    o4_name: 'Snowcap Isle', o4_note: 'Warm blankets for the climbing team',
    o5_name: 'Candy Isle', o5_note: 'The last love letter, for the candy cottage',
    home_name: 'Sky Post Office',
    ringlabel: 'Next ring',
  },
};

let lang = 'zh';
try {
  const s = localStorage.getItem('sic.lang');
  if (s === 'zh' || s === 'en') lang = s;
  else lang = (navigator.language || 'zh').toLowerCase().startsWith('zh') ? 'zh' : 'en';
} catch (e) {
  lang = (navigator.language || 'zh').toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

const listeners = [];
export const getLang = () => lang;
export function t(key) { return (DICT[lang] && DICT[lang][key]) || DICT.zh[key] || key; }
export function onLang(fn) { listeners.push(fn); }

export function apply(root = document) {
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  document.title = lang === 'zh' ? '浮空岛快递 · Sky Island Courier' : 'Sky Island Courier';
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  document.querySelectorAll('.txt[id$="Lang"]').forEach((el) => { el.textContent = lang === 'zh' ? 'EN' : '中'; });
  const v = document.getElementById('tLangVal');
  if (v) v.textContent = lang === 'zh' ? '中文' : 'English';
}

export function setLang(l) {
  lang = l;
  try { localStorage.setItem('sic.lang', l); } catch (e) { /* ignore */ }
  apply();
  listeners.forEach((f) => f(l));
}
export function toggleLang() { setLang(lang === 'zh' ? 'en' : 'zh'); }
