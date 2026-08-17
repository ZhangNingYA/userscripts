// ==UserScript==
// @name         PTT 現代化介面
// @name:en      PTT Modern Reader
// @namespace    https://www.ptt.cc/
// @version      2.6.0
// @description  將 PTT 轉換為最新優先的瀑布流 SPA 閱讀器，支援向下無限載入、頁面狀態還原與閱讀設定
// @description:en Transform PTT into a modern latest-first waterfall reader with infinite scrolling, navigation state restoration, and reading preferences
// @author       Codex
// @homepageURL  https://scripts.fulafu.com/scripts/ptt-modern-ui/
// @supportURL   https://github.com/ZhangNingYA/userscripts/issues
// @updateURL    https://scripts.fulafu.com/scripts/ptt-modern-ui/ptt-modern-ui.user.js
// @downloadURL  https://scripts.fulafu.com/scripts/ptt-modern-ui/ptt-modern-ui.user.js
// @match        https://www.ptt.cc/*
// @match        https://ptt.cc/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const SCRIPT_VERSION = '2.6.0';
  const SCRIPT_RELEASED_AT = '2026-08-17 15:35:48 UTC+8';

  if (!/(^|\.)ptt\.cc$/i.test(location.hostname)) return;

  try {
    document.cookie = 'over18=1; path=/; domain=.ptt.cc; max-age=31536000; SameSite=Lax';
  } catch (_) {}

  if (location.pathname === '/ask/over18') {
    approveAgeGate();
    return;
  }

  if (new URLSearchParams(location.search).get('pttr') === 'off') return;

  const storage = {
    get(key, fallback) {
      try { return localStorage.getItem(key) || fallback; } catch (_) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, value); } catch (_) {}
    }
  };

  const storedTheme = storage.get('ptt-modern-theme', 'paper');
  const themeAliases = { midnight: 'ink', ocean: 'mist', sunset: 'rose' };
  const migratedTheme = themeAliases[storedTheme] || storedTheme;

  const state = {
    lang: storage.get('ptt-modern-lang', 'zh-CN'),
    theme: ['paper', 'ink', 'mist', 'rose'].includes(migratedTheme) ? migratedTheme : 'paper',
    fontSize: Math.min(22, Math.max(16, Number(storage.get('ptt-reader-font-size', '18')) || 18)),
    model: null,
    url: location.href,
    requestId: 0,
    controller: null,
    infiniteLoading: false,
    infiniteComplete: false,
    infiniteError: false,
    infiniteController: null,
    infinitePageUrls: new Set(),
    pageCache: new Map()
  };
  if (storedTheme !== state.theme) storage.set('ptt-modern-theme', state.theme);

  const charPairs = '萬:万,與:与,專:专,業:业,東:东,絲:丝,丟:丢,兩:两,嚴:严,個:个,為:为,麗:丽,麼:么,義:义,習:习,鄉:乡,書:书,買:买,亂:乱,爭:争,於:于,雲:云,亞:亚,產:产,親:亲,億:亿,僅:仅,從:从,來:来,侖:仑,倉:仓,價:价,儀:仪,儘:尽,優:优,兒:儿,冊:册,寫:写,決:决,幾:几,劃:划,劇:剧,劉:刘,劍:剑,勸:劝,務:务,動:动,勵:励,勞:劳,勝:胜,勢:势,區:区,醫:医,卻:却,參:参,雙:双,發:发,號:号,臺:台,後:后,嗎:吗,問:问,啟:启,嘆:叹,團:团,國:国,圖:图,圓:圆,場:场,報:报,壓:压,壞:坏,壯:壮,聲:声,處:处,備:备,復:复,夢:梦,夠:够,奮:奋,妳:你,媽:妈,婦:妇,姊:姐,學:学,實:实,寶:宝,寧:宁,導:导,將:将,對:对,層:层,島:岛,峽:峡,幣:币,帥:帅,師:师,帳:帐,帶:带,幫:帮,幹:干,庫:库,廠:厂,廣:广,廢:废,開:开,異:异,弔:吊,彈:弹,強:强,當:当,錄:录,彌:弥,徑:径,總:总,憂:忧,戀:恋,愛:爱,懷:怀,憶:忆,懶:懒,應:应,戲:戏,戰:战,戶:户,掃:扫,拋:抛,掛:挂,採:采,換:换,損:损,搖:摇,摺:折,擊:击,擇:择,擴:扩,擾:扰,攜:携,數:数,斷:断,時:时,晉:晋,暫:暂,會:会,朮:术,機:机,權:权,條:条,極:极,樂:乐,樓:楼,標:标,樣:样,槍:枪,樹:树,橋:桥,橫:横,歐:欧,歡:欢,歲:岁,歷:历,歸:归,殘:残,氣:气,沒:没,沖:冲,漢:汉,滿:满,灣:湾,爐:炉,無:无,煩:烦,熱:热,燈:灯,營:营,爛:烂,爾:尔,牆:墙,狀:状,獎:奖,現:现,環:环,畫:画,疇:畴,療:疗,監:监,盤:盘,眾:众,矯:矫,確:确,碼:码,礙:碍,祕:秘,禮:礼,種:种,積:积,穩:稳,窮:穷,競:竞,筆:笔,節:节,範:范,簡:简,簽:签,類:类,約:约,納:纳,純:纯,紙:纸,級:级,紛:纷,紡:纺,經:经,統:统,絕:绝,給:给,絢:绚,絡:络,結:结,絞:绞,綠:绿,綜:综,綱:纲,網:网,綴:缀,緊:紧,線:线,練:练,縣:县,縱:纵,續:续,缽:钵,罷:罢,羅:罗,聖:圣,聞:闻,聯:联,職:职,聽:听,肅:肃,腳:脚,臉:脸,腦:脑,臨:临,興:兴,舊:旧,艦:舰,著:着,葉:叶,華:华,藥:药,蘇:苏,虛:虚,螢:萤,裏:里,補:补,複:复,覺:觉,覽:览,觀:观,規:规,視:视,計:计,訊:讯,託:托,記:记,訪:访,設:设,許:许,評:评,詞:词,試:试,詩:诗,話:话,該:该,詳:详,誇:夸,認:认,誤:误,說:说,課:课,誰:谁,調:调,談:谈,請:请,論:论,諸:诸,諾:诺,謂:谓,證:证,識:识,譜:谱,譯:译,護:护,變:变,讓:让,讚:赞,豐:丰,貓:猫,貝:贝,財:财,責:责,貴:贵,費:费,賊:贼,賓:宾,賣:卖,賜:赐,賞:赏,賢:贤,質:质,賬:账,賭:赌,賴:赖,贈:赠,趨:趋,車:车,軍:军,軌:轨,轉:转,辦:办,這:这,進:进,遠:远,遲:迟,選:选,邊:边,郵:邮,鄰:邻,尋:寻,過:过,還:还,們:们,噓:嘘,針:针,鈔:钞,鈴:铃,鉅:巨,銀:银,銅:铜,銷:销,鋒:锋,錯:错,鍋:锅,鍵:键,鎖:锁,鏡:镜,鐘:钟,長:长,門:门,閉:闭,間:间,閒:闲,閱:阅,隊:队,陽:阳,陰:阴,陣:阵,階:阶,隨:随,難:难,雜:杂,電:电,霧:雾,靜:静,頁:页,頂:顶,項:项,順:顺,預:预,額:额,頑:顽,領:领,頭:头,題:题,顏:颜,風:风,飛:飞,飄:飘,餘:余,飯:饭,飲:饮,館:馆,馬:马,駐:驻,騎:骑,驚:惊,驗:验,髮:发,鬧:闹,魚:鱼,鳥:鸟,鳴:鸣,鴻:鸿,鹹:咸,麥:麦,黃:黄,黨:党,齊:齐,齒:齿,龍:龙,龜:龟'.split(',').reduce((map, item) => {
    const [from, to] = item.split(':');
    map[from] = to;
    return map;
  }, {});
  Object.assign(charPairs, { 員: '员', 體: '体' });
  const traditionalPattern = new RegExp(`[${Object.keys(charPairs).join('')}]`, 'g');

  const copySets = {
    'zh-CN': {
      reader: 'PTT 阅读器', board: '看板', articles: '文章列表', search: '搜索文章', searchResults: '搜索结果', stories: '文章',
      allDiscussions: '按时间排列的最新讨论', by: '作者', replies: '讨论', readingTime: '阅读时间', minute: '分钟', characters: '字', articleInfo: '文章信息',
      backBoard: '返回看板', original: '原始页面', settings: '阅读设置', releasedAt: '发布于', language: '文字语言', traditional: '繁体', simplified: '简体', appearance: '阅读背景',
      paper: '白纸', ink: '墨夜', mist: '雾蓝', rose: '柔灰', fontSize: '正文字号', smaller: '减小字号', larger: '增大字号',
      up: '推', neutral: '箭头', down: '嘘', progress: '阅读进度', loading: '正在读取 PTT', retry: '重新载入', loadError: '页面读取失败',
      noStories: '本页没有可显示的文章', deleted: '文章已删除', hot: '热', pinned: '置顶', close: '关闭', discussion: '讨论区',
      loadingMore: '正在加载更多文章', noMore: '没有更多文章了', loadMoreFailed: '加载失败，继续下滑重试',
      notFoundTitle: '页面不存在', notFoundDetail: '这个链接可能已经失效，或页码超出了看板范围。', backLatest: '返回 {board} 最新页'
    },
    'zh-TW': {
      reader: 'PTT 閱讀器', board: '看板', articles: '文章列表', search: '搜尋文章', searchResults: '搜尋結果', stories: '文章',
      allDiscussions: '按時間排列的最新討論', by: '作者', replies: '討論', readingTime: '閱讀時間', minute: '分鐘', characters: '字', articleInfo: '文章資訊',
      backBoard: '返回看板', original: '原始頁面', settings: '閱讀設定', releasedAt: '發佈於', language: '文字語言', traditional: '繁體', simplified: '簡體', appearance: '閱讀背景',
      paper: '白紙', ink: '墨夜', mist: '霧藍', rose: '柔灰', fontSize: '正文字號', smaller: '減小字號', larger: '增大字號',
      up: '推', neutral: '箭頭', down: '噓', progress: '閱讀進度', loading: '正在讀取 PTT', retry: '重新載入', loadError: '頁面讀取失敗',
      noStories: '本頁沒有可顯示的文章', deleted: '文章已刪除', hot: '熱門', pinned: '置頂', close: '關閉', discussion: '討論區',
      loadingMore: '正在載入更多文章', noMore: '沒有更多文章了', loadMoreFailed: '載入失敗，繼續下滑重試',
      notFoundTitle: '頁面不存在', notFoundDetail: '這個連結可能已經失效，或頁碼超出了看板範圍。', backLatest: '返回 {board} 最新頁'
    }
  };

  const styles = `
    html.pttr-preload body { opacity:0!important; }
    html[data-pttr-theme="paper"] { --r-bg:#f5f5f3; --r-surface:#ffffff; --r-subtle:#eff1ef; --r-text:#1c211f; --r-muted:#68716c; --r-faint:#8c938f; --r-border:#dfe3e0; --r-accent:#087a65; --r-accent-soft:#e0f2ec; --r-hot:#d94b3d; --r-warm:#a86e18; --r-shadow:0 12px 34px rgba(27,48,39,.10); --r-cover-text:#202522; --r-cover-0:#dcefe6; --r-cover-1:#f2e0e4; --r-cover-2:#dceaf3; --r-cover-3:#e8e2f2; --r-cover-4:#f3e9ca; --r-cover-5:#e3e5df; color-scheme:light; }
    html[data-pttr-theme="ink"] { --r-bg:#0f1211; --r-surface:#181c1a; --r-subtle:#222724; --r-text:#edf1ee; --r-muted:#a0aaa4; --r-faint:#737d77; --r-border:#303632; --r-accent:#65cbb0; --r-accent-soft:#19382f; --r-hot:#ff8170; --r-warm:#e2aa58; --r-shadow:0 16px 40px rgba(0,0,0,.28); --r-cover-text:#eef2ef; --r-cover-0:#183a31; --r-cover-1:#3b252b; --r-cover-2:#1d3541; --r-cover-3:#302a42; --r-cover-4:#3c3521; --r-cover-5:#292e2b; color-scheme:dark; }
    html[data-pttr-theme="mist"] { --r-bg:#edf2f5; --r-surface:#fbfcfd; --r-subtle:#e5edf1; --r-text:#17242c; --r-muted:#61727d; --r-faint:#82919a; --r-border:#d5e0e6; --r-accent:#2c6d86; --r-accent-soft:#d9eaf0; --r-hot:#b84f50; --r-warm:#9a7120; --r-shadow:0 12px 34px rgba(34,58,72,.10); --r-cover-text:#1b2830; --r-cover-0:#d8ebe5; --r-cover-1:#efdfe5; --r-cover-2:#d5e7f0; --r-cover-3:#e6e1f0; --r-cover-4:#eee7cf; --r-cover-5:#dfe6e8; color-scheme:light; }
    html[data-pttr-theme="rose"] { --r-bg:#f3f0f1; --r-surface:#fffefe; --r-subtle:#ece7e9; --r-text:#292124; --r-muted:#77686d; --r-faint:#95878c; --r-border:#e2dadd; --r-accent:#88435a; --r-accent-soft:#f1dfe5; --r-hot:#b84040; --r-warm:#956b1f; --r-shadow:0 12px 34px rgba(60,35,45,.10); --r-cover-text:#2c2226; --r-cover-0:#dceae3; --r-cover-1:#f0dce2; --r-cover-2:#dce6ee; --r-cover-3:#e9dfee; --r-cover-4:#f0e7cf; --r-cover-5:#e6e1e2; color-scheme:light; }
    html, body { margin:0!important; width:100%!important; height:100%!important; background:var(--r-bg)!important; }
    body { padding:0!important; overflow:hidden!important; color:var(--r-text)!important; font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans TC","Microsoft JhengHei",sans-serif!important; }
    #ptt-reader-app, #ptt-reader-app * { box-sizing:border-box; letter-spacing:0!important; }
    #ptt-reader-app { --reader-font:18px; height:100vh; color:var(--r-text); background:var(--r-bg); font-size:15px; line-height:1.55; }
    #ptt-reader-app button, #ptt-reader-app input { font:inherit; }
    #ptt-reader-app button, #ptt-reader-app a { -webkit-tap-highlight-color:transparent; }
    .pttr-header { height:64px; display:flex; align-items:center; position:relative; z-index:30; background:var(--r-surface); border-bottom:1px solid var(--r-border); }
    .pttr-brand { height:100%; flex:0 0 auto; display:flex; align-items:center; gap:11px; padding:0 20px; color:var(--r-text); text-decoration:none; border-right:1px solid var(--r-border); }
    .pttr-brand-mark { width:32px; height:32px; display:grid; place-items:center; border-radius:6px; color:#fff; background:var(--r-accent); font-size:16px; font-weight:800; }
    .pttr-brand-copy { display:flex; flex-direction:column; line-height:1.15; } .pttr-brand-copy strong { font-size:14px; } .pttr-brand-copy span { color:var(--r-muted); font-size:11px; margin-top:3px; }
    .pttr-header-location { min-width:0; display:flex; align-items:center; gap:8px; padding:0 24px; color:var(--r-muted); }
    .pttr-header-location span { font-size:12px; } .pttr-header-location strong { min-width:0; max-width:360px; color:var(--r-text); font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .pttr-header-actions { margin-left:auto; display:flex; align-items:center; gap:6px; padding:0 18px; }
    .pttr-icon-button { width:38px; height:38px; display:grid; place-items:center; flex:0 0 38px; padding:0; border:1px solid transparent; border-radius:7px; color:var(--r-muted); background:transparent; cursor:pointer; text-decoration:none; font-weight:700; }
    .pttr-icon-button:hover { color:var(--r-text); background:var(--r-subtle); border-color:var(--r-border); }
    @keyframes pttr-spin { to { transform:rotate(360deg); } }
    .pttr-icon-button:focus-visible, .pttr-story:focus-visible, .pttr-segment button:focus-visible, .pttr-theme-option:focus-visible { outline:2px solid var(--r-accent); outline-offset:2px; }
    .pttr-top-progress { position:absolute; left:0; right:0; bottom:-1px; height:2px; overflow:hidden; pointer-events:none; }
    .pttr-top-progress span { display:block; width:0; height:100%; background:var(--r-accent); transition:width .12s linear; }
    .pttr-layout { display:grid; grid-template-columns:minmax(0,1fr) 252px; height:calc(100vh - 64px); min-height:0; }
    #ptt-reader-app.board-mode .pttr-layout { grid-template-columns:minmax(0,1fr); }
    #ptt-reader-app.board-mode .pttr-rail { display:none; }
    .pttr-eyebrow { margin:0 0 7px; color:var(--r-accent); font-size:11px; font-weight:750; text-transform:uppercase; }
    .pttr-main { min-width:0; min-height:0; overflow-y:auto; overflow-anchor:none; scroll-behavior:smooth; scrollbar-color:var(--r-border) transparent; }
    .pttr-view { width:min(100%,1040px); margin:0 auto; padding:44px 44px 72px; }
    #ptt-reader-app.board-mode .pttr-view { width:min(100%,1320px); padding:34px 38px 72px; }
    .pttr-view-head { display:flex; align-items:flex-end; justify-content:space-between; gap:32px; padding-bottom:24px; }
    .pttr-view-head h1 { margin:0; color:var(--r-text); font-size:30px; line-height:1.2; font-weight:760; }
    .pttr-view-subtitle { margin:8px 0 0; color:var(--r-muted); font-size:13px; }
    .pttr-search { width:280px; flex:0 0 280px; position:relative; }
    .pttr-search input { width:100%; height:42px; padding:0 12px; border:1px solid var(--r-border); border-radius:7px; color:var(--r-text); background:var(--r-surface); outline:none; }
    .pttr-search input:focus { border-color:var(--r-accent); box-shadow:0 0 0 3px color-mix(in srgb,var(--r-accent) 16%,transparent); }
    .pttr-list-toolbar { min-height:46px; display:flex; align-items:center; color:var(--r-muted); border-top:1px solid var(--r-border); border-bottom:1px solid var(--r-border); }
    .pttr-count { font-size:12px; } .pttr-count strong { color:var(--r-text); }
    .pttr-story-list { display:grid; grid-template-columns:repeat(var(--pttr-column-count,4),minmax(0,1fr)); align-items:start; gap:16px; padding-top:18px; }
    .pttr-story-column { min-width:0; display:flex; flex-direction:column; gap:16px; }
    .pttr-story { width:100%; display:block; overflow:hidden; color:inherit; text-decoration:none; border:1px solid var(--r-border); border-radius:8px; background:var(--r-surface); box-shadow:0 2px 8px rgba(28,38,33,.04); transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease; }
    .pttr-story:hover { transform:translateY(-3px); border-color:color-mix(in srgb,var(--r-accent) 42%,var(--r-border)); box-shadow:var(--r-shadow); }
    .pttr-story.disabled { opacity:.58; cursor:default; }
    .pttr-story-cover { min-height:var(--card-height); display:flex; flex-direction:column; justify-content:space-between; gap:18px; padding:16px; color:var(--r-cover-text); background:var(--card-bg); }
    .pttr-story-badges { min-height:21px; display:flex; align-items:center; gap:6px; }
    .pttr-story-heading { display:block; min-width:0; }
    .pttr-category { flex:0 0 auto; padding:2px 6px; border-radius:4px; color:var(--r-accent); background:var(--r-accent-soft); font-size:11px; font-weight:700; }
    .pttr-story-cover .pttr-category { color:var(--r-cover-text); background:color-mix(in srgb,var(--r-surface) 58%,transparent); }
    .pttr-pin { color:var(--r-warm); font-size:11px; font-weight:700; }
    .pttr-story-cover .pttr-pin { color:var(--r-cover-text); opacity:.68; }
    .pttr-story h2 { min-width:0; margin:0; color:inherit; font-size:17px; line-height:1.5; font-weight:720; overflow-wrap:anywhere; }
    .pttr-story-footer { min-height:52px; display:flex; align-items:center; justify-content:space-between; gap:8px; padding:10px 12px; }
    .pttr-story-author { min-width:0; display:flex; align-items:center; gap:7px; }
    .pttr-card-avatar { width:25px; height:25px; flex:0 0 25px; display:grid; place-items:center; border-radius:50%; color:var(--r-accent); background:var(--r-accent-soft); font-size:10px; font-weight:800; }
    .pttr-story-author strong { min-width:0; max-width:95px; overflow:hidden; color:var(--r-muted); font-size:11px; font-weight:650; text-overflow:ellipsis; white-space:nowrap; }
    .pttr-story-engagement { flex:0 0 auto; display:flex; align-items:center; gap:7px; color:var(--r-faint); font-size:10px; }
    .pttr-story-score { color:var(--r-muted); font-size:11px; font-weight:700; } .pttr-story-score.hot, .pttr-story-score.negative { color:var(--r-hot); }
    .pttr-infinite-status { min-height:54px; display:flex; align-items:center; justify-content:center; gap:9px; padding:18px 0 4px; color:var(--r-faint); font-size:11px; }
    .pttr-infinite-status.loading::before { content:""; width:14px; height:14px; border:2px solid var(--r-border); border-top-color:var(--r-accent); border-radius:50%; animation:pttr-spin .8s linear infinite; }
    .pttr-infinite-status.error { color:var(--r-hot); }
    .pttr-empty { padding:80px 20px; color:var(--r-muted); text-align:center; }
    .pttr-rail { min-width:0; padding:28px 22px; background:var(--r-surface); border-left:1px solid var(--r-border); overflow-y:auto; }
    .pttr-rail-section { padding:0 0 23px; margin:0 0 23px; border-bottom:1px solid var(--r-border); } .pttr-rail-section:last-child { border-bottom:0; }
    .pttr-rail-title { margin:0 0 15px; color:var(--r-text); font-size:12px; font-weight:750; }
    .pttr-stat-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
    .pttr-stat { min-width:0; padding:10px; border-radius:6px; background:var(--r-subtle); } .pttr-stat strong { display:block; color:var(--r-text); font-size:20px; line-height:1.2; } .pttr-stat span { display:block; margin-top:4px; color:var(--r-faint); font-size:10px; }
    .pttr-distribution { display:grid; gap:11px; } .pttr-distribution-row { display:grid; grid-template-columns:minmax(0,1fr) 24px; gap:9px; align-items:center; }
    .pttr-distribution-label { min-width:0; display:flex; justify-content:space-between; color:var(--r-muted); font-size:11px; } .pttr-distribution-label span:first-child { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .pttr-mini-bar { grid-column:1/-1; height:3px; overflow:hidden; background:var(--r-subtle); } .pttr-mini-bar span { display:block; height:100%; background:var(--r-accent); }
    .pttr-author-list { display:grid; gap:12px; } .pttr-author { display:flex; align-items:center; gap:9px; min-width:0; }
    .pttr-avatar { width:28px; height:28px; flex:0 0 28px; display:grid; place-items:center; border-radius:50%; color:var(--r-accent); background:var(--r-accent-soft); font-size:11px; font-weight:800; text-transform:uppercase; }
    .pttr-author div { min-width:0; } .pttr-author strong { display:block; overflow:hidden; color:var(--r-text); font-size:11px; text-overflow:ellipsis; white-space:nowrap; } .pttr-author span { color:var(--r-faint); font-size:10px; }
    .pttr-article-view { width:min(100%,820px); margin:0 auto; padding:32px 46px 90px; }
    .pttr-back { display:inline-flex; align-items:center; gap:8px; min-height:36px; color:var(--r-muted); text-decoration:none; font-size:12px; } .pttr-back:hover { color:var(--r-accent); }
    .pttr-article-header { padding:42px 0 30px; border-bottom:1px solid var(--r-border); }
    .pttr-article-header h1 { max-width:760px; margin:12px 0 22px; color:var(--r-text); font-size:34px; line-height:1.32; font-weight:760; overflow-wrap:anywhere; }
    .pttr-byline { display:flex; align-items:center; gap:10px; color:var(--r-muted); font-size:12px; } .pttr-byline .pttr-avatar { width:34px; height:34px; flex-basis:34px; }
    .pttr-byline-copy { display:flex; flex-direction:column; } .pttr-byline-copy strong { color:var(--r-text); font-size:12px; } .pttr-byline-copy span { margin-top:2px; color:var(--r-faint); font-size:11px; }
    .pttr-prose { padding:36px 0 42px; color:var(--r-text); font-family:ui-serif,"Noto Serif TC","Songti TC","PMingLiU",serif; font-size:var(--reader-font); line-height:1.95; white-space:pre-wrap; overflow-wrap:anywhere; }
    .pttr-prose a { color:var(--r-accent); text-decoration-color:color-mix(in srgb,var(--r-accent) 35%,transparent); text-underline-offset:3px; } .pttr-prose a:hover { text-decoration-color:var(--r-accent); }
    .pttr-prose .f2 { color:var(--r-muted); font-size:.83em; } .pttr-prose img { max-width:100%; height:auto; }
    .pttr-comments { padding-top:30px; border-top:1px solid var(--r-border); }
    .pttr-comments-head { display:flex; align-items:flex-end; justify-content:space-between; gap:20px; padding-bottom:14px; border-bottom:1px solid var(--r-border); }
    .pttr-comments-head h2 { margin:0; color:var(--r-text); font-size:19px; } .pttr-comment-summary { display:flex; gap:12px; color:var(--r-faint); font-size:11px; } .pttr-comment-summary strong { color:var(--r-muted); }
    .pttr-push { display:grid; grid-template-columns:30px 112px minmax(0,1fr) 72px; align-items:start; gap:10px; padding:14px 4px; border-bottom:1px solid var(--r-border); }
    .pttr-push-tag { width:26px; height:26px; display:grid; place-items:center; border-radius:5px; color:var(--r-accent); background:var(--r-accent-soft); font-size:11px; font-weight:800; }
    .pttr-push[data-kind="down"] .pttr-push-tag { color:var(--r-hot); background:color-mix(in srgb,var(--r-hot) 10%,var(--r-surface)); } .pttr-push[data-kind="neutral"] .pttr-push-tag { color:var(--r-muted); background:var(--r-subtle); }
    .pttr-push-user { padding-top:3px; color:var(--r-muted); font-size:12px; font-weight:650; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .pttr-push-content { margin:0; color:var(--r-text); font-size:14px; line-height:1.6; overflow-wrap:anywhere; } .pttr-push-time { padding-top:3px; color:var(--r-faint); font-size:10px; text-align:right; white-space:nowrap; }
    .pttr-progress-value { display:flex; align-items:baseline; gap:5px; margin-bottom:10px; } .pttr-progress-value strong { color:var(--r-text); font-size:28px; } .pttr-progress-value span { color:var(--r-faint); font-size:11px; }
    .pttr-progress-track { height:4px; overflow:hidden; background:var(--r-subtle); } .pttr-progress-track span { display:block; width:0; height:100%; background:var(--r-accent); transition:width .12s linear; }
    .pttr-info-list { display:grid; gap:13px; } .pttr-info-row { display:flex; justify-content:space-between; gap:10px; color:var(--r-faint); font-size:11px; } .pttr-info-row strong { color:var(--r-muted); font-weight:650; text-align:right; overflow-wrap:anywhere; }
    .pttr-settings { width:300px; position:fixed; z-index:60; isolation:isolate; top:58px; right:18px; padding:18px; opacity:1!important; color:var(--r-text,#18201d); border:1px solid var(--r-border,#dbe1de); border-radius:8px; background:var(--r-surface,#ffffff)!important; box-shadow:var(--r-shadow,0 12px 34px rgba(0,0,0,.14)); backdrop-filter:none!important; }
    .pttr-settings[hidden] { display:none; } .pttr-settings-head { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; margin-bottom:18px; } .pttr-settings-head h2 { margin:0; font-size:14px; }
    .pttr-settings-release { display:flex; align-items:center; flex-wrap:wrap; gap:3px 7px; margin:4px 0 0; color:var(--r-faint); font-size:10px; line-height:1.4; }
    .pttr-settings-release strong { color:var(--r-muted); font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:10px; font-weight:700; }
    .pttr-settings-close { width:30px; height:30px; padding:0; border:0; border-radius:6px; color:var(--r-muted); background:transparent; cursor:pointer; font-size:18px; } .pttr-settings-close:hover { color:var(--r-text); background:var(--r-subtle); }
    .pttr-setting-group { padding:15px 0; border-top:1px solid var(--r-border); } .pttr-setting-group:first-of-type { border-top:0; padding-top:0; } .pttr-setting-label { display:block; margin-bottom:9px; color:var(--r-muted); font-size:11px; font-weight:650; }
    .pttr-segment { display:grid; grid-template-columns:1fr 1fr; padding:3px; border-radius:7px; background:var(--r-subtle); } .pttr-segment button { min-height:32px; border:0; border-radius:5px; color:var(--r-muted); background:transparent; cursor:pointer; font-size:12px; } .pttr-segment button.active { color:var(--r-text); background:var(--r-surface); box-shadow:0 1px 4px rgba(0,0,0,.08); font-weight:700; }
    .pttr-theme-grid { display:grid; grid-template-columns:1fr 1fr; gap:7px; }
    .pttr-theme-option { min-height:43px; display:flex; align-items:center; gap:8px; padding:7px 9px; border:1px solid var(--r-border); border-radius:6px; color:var(--r-muted); background:transparent; cursor:pointer; font-size:11px; text-align:left; } .pttr-theme-option.active { color:var(--r-accent); border-color:var(--r-accent); background:var(--r-accent-soft); font-weight:700; }
    .pttr-theme-swatch { width:20px; height:20px; flex:0 0 20px; border-radius:50%; background:var(--swatch); border:1px solid rgba(80,80,80,.2); }
    .pttr-font-control { display:grid; grid-template-columns:36px 1fr 36px; align-items:center; gap:8px; } .pttr-font-control button { width:36px; height:34px; padding:0; border:1px solid var(--r-border); border-radius:6px; color:var(--r-text); background:var(--r-surface); cursor:pointer; } .pttr-font-control button:hover { border-color:var(--r-accent); color:var(--r-accent); } .pttr-font-control output { color:var(--r-muted); text-align:center; font-size:12px; }
    .pttr-loading { padding:34px 0; } .pttr-skeleton { height:82px; border-bottom:1px solid var(--r-border); background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--r-surface) 80%,transparent),transparent); background-size:220% 100%; animation:pttr-shimmer 1.2s linear infinite; } @keyframes pttr-shimmer { to { background-position:-220% 0; } }
    .pttr-error { max-width:560px; margin:clamp(64px,12vh,128px) auto; padding:42px 28px; text-align:center; border-top:1px solid var(--r-border); border-bottom:1px solid var(--r-border); }
    .pttr-error-code { margin:0 0 10px!important; color:var(--r-accent)!important; font-size:11px; font-weight:760; letter-spacing:.08em!important; text-transform:uppercase; }
    .pttr-error h2 { margin:0 0 10px; color:var(--r-text); font-size:24px; line-height:1.35; }
    .pttr-error > p:not(.pttr-error-code) { max-width:430px; margin:0 auto 24px; color:var(--r-muted); font-size:13px; line-height:1.7; }
    .pttr-error-actions { display:flex; align-items:center; justify-content:center; flex-wrap:wrap; gap:10px; }
    .pttr-error-action { min-height:44px; display:inline-flex; align-items:center; justify-content:center; padding:0 18px; border:1px solid var(--r-accent); border-radius:6px; color:var(--r-surface); background:var(--r-accent); cursor:pointer; text-decoration:none; font-size:12px; font-weight:720; }
    .pttr-error-action:hover { filter:brightness(.94); }
    .pttr-error-retry { min-height:44px; padding:0 18px; border:1px solid var(--r-border); border-radius:6px; color:var(--r-muted); background:transparent; cursor:pointer; font-size:12px; font-weight:650; }
    .pttr-error-action:focus-visible, .pttr-error-retry:focus-visible { outline:2px solid var(--r-accent); outline-offset:3px; }
    .pttr-toast { position:fixed; left:50%; bottom:22px; z-index:80; transform:translate(-50%,16px); opacity:0; pointer-events:none; padding:9px 14px; border-radius:6px; color:var(--r-surface); background:var(--r-text); box-shadow:var(--r-shadow); font-size:12px; transition:opacity .2s ease,transform .2s ease; } .pttr-toast.show { opacity:1; transform:translate(-50%,0); }
    @media (max-width:1180px) { .pttr-layout, #ptt-reader-app.board-mode .pttr-layout { grid-template-columns:minmax(0,1fr); } .pttr-rail { display:none; } .pttr-view { max-width:960px; } }
    @media (max-width:820px) { .pttr-header { height:58px; } .pttr-brand { padding:0 12px; border-right:0; } .pttr-brand-copy span { display:none; } .pttr-header-location { padding:0 8px; } .pttr-header-location span { display:none; } .pttr-header-location strong { max-width:150px; } .pttr-header-actions { padding:0 8px; } .pttr-layout, #ptt-reader-app.board-mode .pttr-layout { display:block; height:calc(100vh - 58px); } .pttr-main { height:100%; } .pttr-view, #ptt-reader-app.board-mode .pttr-view { padding:28px 18px 56px; } .pttr-view-head { align-items:stretch; flex-direction:column; gap:20px; } .pttr-search { width:100%; flex-basis:auto; } .pttr-article-view { padding:24px 20px 70px; } .pttr-article-header { padding:28px 0 24px; } .pttr-article-header h1 { font-size:28px; } .pttr-settings { top:54px; right:8px; width:min(300px,calc(100vw - 16px)); } }
    @media (max-width:560px) { .pttr-brand-copy { display:none; } .pttr-header-location strong { max-width:115px; } #ptt-reader-app.board-mode .pttr-view { padding:22px 12px 50px; } .pttr-story-list, .pttr-story-column { gap:10px; } .pttr-story-list { padding-top:12px; } .pttr-story-cover { min-height:var(--card-mobile-height); gap:12px; padding:12px; } .pttr-story h2 { font-size:14px; line-height:1.5; } .pttr-story-footer { min-height:46px; padding:8px 9px; } .pttr-card-avatar { width:22px; height:22px; flex-basis:22px; font-size:9px; } .pttr-story-author { gap:5px; } .pttr-story-author strong { max-width:55px; font-size:10px; } .pttr-story-engagement > span:first-child { display:none; } .pttr-story-score { font-size:10px; } .pttr-list-toolbar { min-height:42px; } .pttr-push { grid-template-columns:27px 82px minmax(0,1fr); gap:7px; } .pttr-push-time { display:none; } .pttr-comments-head { align-items:flex-start; flex-direction:column; gap:8px; } .pttr-comment-summary { flex-wrap:wrap; } .pttr-prose { line-height:1.9; } }
    @media (prefers-reduced-motion:reduce) { #ptt-reader-app *, #ptt-reader-app *::before, #ptt-reader-app *::after { scroll-behavior:auto!important; animation-duration:.01ms!important; transition-duration:.01ms!important; } }
  `;

  let app;
  let view;
  let rail;
  let mainScroller;
  let settings;
  let toastTimer;
  let resizeTimer;

  bootstrap();

  function bootstrap() {
    if (!document.documentElement) {
      setTimeout(bootstrap, 0);
      return;
    }
    document.documentElement.classList.add('pttr-preload');
    injectStyles();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
      init();
    }
  }

  function approveAgeGate() {
    const approve = () => {
      const button = document.querySelector('button[name="yes"], input[name="yes"]');
      if (!button) return false;
      button.click();
      return true;
    };
    if (approve()) return;
    const observer = new MutationObserver(() => {
      if (approve()) observer.disconnect();
    });
    const begin = () => {
      if (!document.documentElement) return;
      observer.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(() => observer.disconnect(), 10000);
    };
    if (document.documentElement) begin();
    else document.addEventListener('readystatechange', begin, { once: true });
  }

  function injectStyles() {
    if (document.getElementById('ptt-reader-styles')) return;
    const style = document.createElement('style');
    style.id = 'ptt-reader-styles';
    style.textContent = styles;
    (document.head || document.documentElement).appendChild(style);
  }

  function init() {
    try {
      const initial = parsePage(document, location.href) || parseNotFoundPage(document, location.href);
      if (!initial) {
        document.documentElement.classList.remove('pttr-preload');
        return;
      }
      state.model = initial;
      state.url = location.href;
      resetInfiniteState();
      buildShell();
      bindEvents();
      const latestUrl = canonicalBoardUrl(location.href);
      if (initial.type === 'board' && !initial.query && latestUrl.href !== location.href) {
        history.replaceState({ ...(history.state || {}), pttr: true }, '', latestUrl.href);
        document.documentElement.classList.remove('pttr-preload');
        navigate(latestUrl.href, false);
        return;
      }
      renderCurrent();
      history.replaceState({ ...(history.state || {}), pttr: true }, '', state.url);
      cacheCurrentPage();
      document.documentElement.classList.remove('pttr-preload');
    } catch (error) {
      console.error('[PTT Reader] init failed', error);
      document.documentElement.classList.remove('pttr-preload');
    }
  }

  function buildShell() {
    app = document.createElement('div');
    app.id = 'ptt-reader-app';
    app.innerHTML = `
      <header class="pttr-header">
        <a class="pttr-brand" id="pttr-brand" href="#" data-pttr-nav>
          <span class="pttr-brand-mark">P</span>
          <span class="pttr-brand-copy"><strong id="pttr-reader-name"></strong><span>ptt.cc</span></span>
        </a>
        <div class="pttr-header-location"><span id="pttr-location-label"></span><strong id="pttr-location-value"></strong></div>
        <div class="pttr-header-actions">
          <a class="pttr-icon-button" id="pttr-original-link" href="#" target="_blank" rel="noopener" title="Original">↗</a>
          <button class="pttr-icon-button" id="pttr-settings-button" type="button" aria-expanded="false" title="Settings">Aa</button>
        </div>
        <div class="pttr-top-progress"><span id="pttr-top-progress"></span></div>
      </header>
      <div class="pttr-layout">
        <main class="pttr-main" id="pttr-main"><div class="pttr-view" id="pttr-view"></div></main>
        <aside class="pttr-rail" id="pttr-rail"></aside>
      </div>
      <aside class="pttr-settings" id="pttr-settings" hidden>
        <div class="pttr-settings-head"><div><h2 id="pttr-settings-title"></h2><p class="pttr-settings-release"><strong id="pttr-settings-version"></strong><span id="pttr-settings-released-at"></span></p></div><button class="pttr-settings-close" id="pttr-settings-close" type="button" aria-label="Close">×</button></div>
        <div class="pttr-setting-group"><span class="pttr-setting-label" id="pttr-language-label"></span><div class="pttr-segment"><button type="button" data-lang="zh-TW"></button><button type="button" data-lang="zh-CN"></button></div></div>
        <div class="pttr-setting-group"><span class="pttr-setting-label" id="pttr-theme-label"></span><div class="pttr-theme-grid">
          <button class="pttr-theme-option" type="button" data-theme="paper"><span class="pttr-theme-swatch" style="--swatch:#f3f5f4"></span><span></span></button>
          <button class="pttr-theme-option" type="button" data-theme="ink"><span class="pttr-theme-swatch" style="--swatch:#171b19"></span><span></span></button>
          <button class="pttr-theme-option" type="button" data-theme="mist"><span class="pttr-theme-swatch" style="--swatch:#dce8ee"></span><span></span></button>
          <button class="pttr-theme-option" type="button" data-theme="rose"><span class="pttr-theme-swatch" style="--swatch:#e8dfe2"></span><span></span></button>
        </div></div>
        <div class="pttr-setting-group"><span class="pttr-setting-label" id="pttr-font-label"></span><div class="pttr-font-control"><button id="pttr-font-smaller" type="button" title="Smaller">A−</button><output id="pttr-font-value"></output><button id="pttr-font-larger" type="button" title="Larger">A+</button></div></div>
      </aside>
      <div class="pttr-toast" id="pttr-toast" role="status"></div>
    `;
    document.body.replaceChildren(app);
    view = app.querySelector('#pttr-view');
    rail = app.querySelector('#pttr-rail');
    mainScroller = app.querySelector('#pttr-main');
    settings = app.querySelector('#pttr-settings');
  }

  function bindEvents() {
    app.addEventListener('click', (event) => {
      const nav = event.target.closest('[data-pttr-nav]');
      if (nav && nav.getAttribute('href') && nav.getAttribute('href') !== '#') {
        if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
          const target = new URL(nav.href, location.href);
          if (target.origin === location.origin && target.pathname.startsWith('/bbs/')) {
            event.preventDefault();
            closeOverlays();
            navigate(target.href, true, nav.hasAttribute('data-pttr-restore'));
          }
        }
      }
      if (event.target.closest('#pttr-settings-button')) toggleSettings();
      if (event.target.closest('#pttr-settings-close')) toggleSettings(false);
      const langButton = event.target.closest('[data-lang]');
      if (langButton) setLanguage(langButton.dataset.lang);
      const themeButton = event.target.closest('[data-theme]');
      if (themeButton) setTheme(themeButton.dataset.theme);
      if (event.target.closest('#pttr-font-smaller')) setFontSize(state.fontSize - 1);
      if (event.target.closest('#pttr-font-larger')) setFontSize(state.fontSize + 1);
      if (event.target.closest('[data-pttr-retry]')) navigate(state.url, false);
    });

    app.addEventListener('submit', (event) => {
      const form = event.target.closest('#pttr-search-form');
      if (!form) return;
      event.preventDefault();
      const query = form.elements.q.value.trim();
      if (!query || !state.model) return;
      const target = new URL(state.model.searchAction || `/bbs/${state.model.board}/search`, state.url);
      target.searchParams.set('q', query);
      navigate(target.href, true);
    });

    mainScroller.addEventListener('scroll', () => {
      updateReadingProgress();
      maybeLoadMore();
    }, { passive: true });
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(reflowStoryColumns, 120);
    });
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.addEventListener('popstate', handleHistoryNavigation);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeOverlays();
    });
    document.addEventListener('click', (event) => {
      if (!settings.hidden && !event.target.closest('#pttr-settings') && !event.target.closest('#pttr-settings-button')) toggleSettings(false);
    });
  }

  function parsePage(doc, pageUrl) {
    const url = new URL(pageUrl, location.origin);
    const boardFromPath = url.pathname.match(/^\/bbs\/([^/]+)/)?.[1] || '';
    const boardLink = doc.querySelector('#topbar a.board');
    const board = clean(boardLink?.textContent).replace(/^看板\s*/, '') || boardFromPath;
    const rows = Array.from(doc.querySelectorAll('.r-ent'));

    if (rows.length || doc.querySelector('#action-bar-container')) {
      const pagination = {};
      doc.querySelectorAll('.btn-group-paging a').forEach((link) => {
        const label = clean(link.textContent);
        const key = label.includes('最舊') ? 'oldest' : label.includes('上頁') ? 'previous' : label.includes('下頁') ? 'next' : label.includes('最新') ? 'latest' : '';
        if (key && link.getAttribute('href') && !link.classList.contains('disabled')) pagination[key] = absoluteUrl(link.getAttribute('href'), pageUrl);
      });
      const stories = rows.map((row) => {
        const titleNode = row.querySelector('.title');
        const link = titleNode?.querySelector('a');
        const rawTitle = clean(titleNode?.textContent) || '（本文已被刪除）';
        const titleParts = splitTitle(rawTitle);
        const score = clean(row.querySelector('.nrec')?.textContent);
        const mark = clean(row.querySelector('.mark')?.textContent);
        return {
          title: rawTitle,
          headline: titleParts.headline,
          category: titleParts.category,
          href: link ? absoluteUrl(link.getAttribute('href'), pageUrl) : '',
          author: clean(row.querySelector('.author')?.textContent) || '—',
          date: clean(row.querySelector('.date')?.textContent),
          score,
          mark,
          pinned: /公告|置底/.test(rawTitle) || Boolean(mark)
        };
      });
      const searchForm = doc.querySelector('#search-bar');
      const query = new URL(pageUrl).searchParams.get('q') || clean(searchForm?.querySelector('[name="q"]')?.value);
      return {
        type: 'board', board, stories, pagination, query,
        boardUrl: absoluteUrl(boardLink?.getAttribute('href') || `/bbs/${board}/index.html`, pageUrl),
        searchAction: absoluteUrl(searchForm?.getAttribute('action') || `/bbs/${board}/search`, pageUrl),
        pageNumber: url.pathname.match(/index(\d+)\.html$/)?.[1] || ''
      };
    }

    const main = doc.querySelector('#main-content');
    if (main && main.querySelector('.article-metaline, .article-metaline-right')) {
      const metadata = {};
      main.querySelectorAll('.article-metaline, .article-metaline-right').forEach((line) => {
        const key = clean(line.querySelector('.article-meta-tag')?.textContent);
        const value = clean(line.querySelector('.article-meta-value')?.textContent);
        if (key) metadata[key] = value;
      });
      const rawTitle = metadata['標題'] || metadata['标题'] || clean(doc.title).replace(/ - 看板.*$/, '');
      const titleParts = splitTitle(rawTitle);
      const pushes = Array.from(main.querySelectorAll('.push')).map((push) => {
        const tag = clean(push.querySelector('.push-tag')?.textContent);
        const rawTime = clean(push.querySelector('.push-ipdatetime')?.textContent);
        const time = rawTime.match(/\d{2}\/\d{2}\s+\d{2}:\d{2}$/)?.[0] || rawTime;
        return {
          tag,
          kind: tag.includes('噓') ? 'down' : tag.includes('推') ? 'up' : 'neutral',
          user: clean(push.querySelector('.push-userid')?.textContent) || '—',
          content: clean(push.querySelector('.push-content')?.textContent).replace(/^:\s*/, ''),
          time
        };
      });
      const content = main.cloneNode(true);
      content.querySelectorAll('.article-metaline, .article-metaline-right, .push, script, style, iframe, object, embed, form, input, button').forEach((node) => node.remove());
      sanitizeContent(content, pageUrl);
      normalizeArticleWraps(content);
      const plainText = clean(content.textContent);
      return {
        type: 'article', board,
        boardUrl: absoluteUrl(boardLink?.getAttribute('href') || `/bbs/${board}/index.html`, pageUrl),
        searchAction: absoluteUrl(`/bbs/${board}/search`, pageUrl),
        title: rawTitle,
        headline: titleParts.headline,
        category: titleParts.category,
        author: metadata['作者'] || '—',
        time: metadata['時間'] || metadata['时间'] || '',
        bodyHtml: content.innerHTML.trim(),
        charCount: plainText.replace(/\s/g, '').length,
        readingMinutes: Math.max(1, Math.ceil(plainText.replace(/\s/g, '').length / 450)),
        pushes
      };
    }
    return null;
  }

  function parseNotFoundPage(doc, pageUrl) {
    const marker = clean(doc.querySelector('.bbs-content')?.textContent || doc.body?.textContent);
    if (!/^404(?:\s|-|$)/i.test(clean(doc.title)) && !/404\s*-\s*Not Found/i.test(marker)) return null;
    const url = new URL(pageUrl, location.origin);
    const encodedBoard = url.pathname.match(/^\/bbs\/([^/]+)/)?.[1] || '';
    if (!encodedBoard) return null;
    let board = encodedBoard;
    try { board = decodeURIComponent(encodedBoard); } catch (_) {}
    const boardUrl = new URL(`/bbs/${encodeURIComponent(board)}/index.html`, url.origin).href;
    return {
      type: 'error',
      kind: 'not-found',
      board,
      boardUrl,
      requestedUrl: url.href
    };
  }

  function renderCurrent(resetScroll = true) {
    if (!state.model) return;
    if (state.model.type === 'error') {
      renderNotFound(state.model, resetScroll);
      return;
    }
    view.removeAttribute('aria-busy');
    app.classList.toggle('board-mode', state.model.type === 'board');
    applyPreferences();
    renderChrome();
    if (state.model.type === 'board') renderBoard(state.model);
    else renderArticle(state.model);
    renderRail(state.model);
    updateSettings();
    decorateContentLinks(view);
    if (resetScroll) mainScroller.scrollTop = 0;
    updateReadingProgress();
    document.title = state.model.type === 'article'
      ? `${translate(state.model.title)} · ${state.model.board} · PTT Reader`
      : `${state.model.board} · ${text('reader')}`;
    if (state.model.type === 'board') requestAnimationFrame(maybeLoadMore);
  }

  function renderNotFound(model, resetScroll = true) {
    view.removeAttribute('aria-busy');
    app.classList.remove('board-mode');
    applyPreferences();
    renderChrome();
    rail.replaceChildren();
    updateSettings();
    const actionLabel = text('backLatest').replace('{board}', model.board);
    view.className = 'pttr-view';
    view.innerHTML = `
      <section class="pttr-error" aria-labelledby="pttr-error-title">
        <p class="pttr-error-code">404 · PTT</p>
        <h2 id="pttr-error-title">${escapeHtml(text('notFoundTitle'))}</h2>
        <p>${escapeHtml(text('notFoundDetail'))}</p>
        <div class="pttr-error-actions">
          <a class="pttr-error-action" href="${escapeAttr(model.boardUrl)}" data-pttr-nav>← ${escapeHtml(actionLabel)}</a>
        </div>
      </section>`;
    if (resetScroll) mainScroller.scrollTop = 0;
    updateReadingProgress();
    document.title = `404 · ${model.board} · PTT Reader`;
  }

  function renderChrome() {
    const model = state.model;
    const boardUrl = model.boardUrl || `/bbs/${model.board}/index.html`;
    app.querySelector('#pttr-brand').href = boardUrl;
    app.querySelector('#pttr-reader-name').textContent = text('reader');
    app.querySelector('#pttr-location-label').textContent = text('board');
    app.querySelector('#pttr-location-value').textContent = model.type === 'article' ? translate(model.title) : model.board;
    app.querySelector('#pttr-original-link').href = originalUrl(state.url);
    app.querySelector('#pttr-original-link').title = text('original');
    app.querySelector('#pttr-settings-button').title = text('settings');
  }

  function renderBoard(model) {
    const heading = model.query ? text('searchResults') : text('articles');
    view.className = 'pttr-view';
    view.innerHTML = `
      <section>
        <header class="pttr-view-head">
          <div><p class="pttr-eyebrow">${escapeHtml(model.board)}</p><h1>${escapeHtml(heading)}</h1><p class="pttr-view-subtitle">${escapeHtml(model.query ? `“${model.query}”` : text('allDiscussions'))}</p></div>
          <form class="pttr-search" id="pttr-search-form"><input name="q" type="search" value="${escapeAttr(model.query || '')}" placeholder="${escapeAttr(text('search'))}" aria-label="${escapeAttr(text('search'))}"></form>
        </header>
        <div class="pttr-list-toolbar"><div class="pttr-count"><strong>${model.stories.length}</strong> ${escapeHtml(text('stories'))}</div></div>
        ${model.stories.length ? '<div class="pttr-story-list" role="list"></div>' : `<div class="pttr-empty">${escapeHtml(text('noStories'))}</div>`}
        <div class="pttr-infinite-status${state.infiniteLoading ? ' loading' : ''}${state.infiniteError ? ' error' : ''}" id="pttr-infinite-status" role="status">${escapeHtml(infiniteStatusText())}</div>
      </section>`;
    if (model.stories.length) renderStoryColumns(model.stories);
  }

  function storyHtml(story) {
    const tag = story.category ? `<span class="pttr-category">${escapeHtml(translate(story.category))}</span>` : '';
    const pinned = story.pinned ? `<span class="pttr-pin">${escapeHtml(text('pinned'))}</span>` : '';
    const scoreClass = story.score === '爆' || Number(story.score) >= 50 ? ' hot' : /^X/.test(story.score) ? ' negative' : '';
    const score = story.score === '爆' ? text('hot') : story.score || '0';
    const element = story.href ? 'a' : 'div';
    const attributes = story.href ? `href="${escapeAttr(story.href)}" data-pttr-nav` : '';
    const visual = storyVisual(story);
    return `<${element} class="pttr-story${story.href ? '' : ' disabled'}" role="listitem" style="--card-height:${visual.height}px;--card-mobile-height:${visual.mobileHeight}px;--card-bg:var(--r-cover-${visual.tone})" ${attributes}>
      <div class="pttr-story-cover"><div class="pttr-story-badges">${tag}${pinned}</div><div class="pttr-story-heading"><h2>${escapeHtml(translate(story.headline || text('deleted')))}</h2></div></div>
      <div class="pttr-story-footer"><div class="pttr-story-author"><span class="pttr-card-avatar">${escapeHtml(initial(story.author))}</span><strong>${escapeHtml(story.author)}</strong></div><div class="pttr-story-engagement"><span>${escapeHtml(story.date)}</span><strong class="pttr-story-score${scoreClass}">♥ ${escapeHtml(score)}</strong></div></div>
    </${element}>`;
  }

  function storyColumnCount(list) {
    if (matchMedia('(max-width:560px)').matches) return 2;
    const width = list.clientWidth || mainScroller.clientWidth;
    return Math.max(1, Math.floor((width + 16) / 266));
  }

  function estimatedStoryHeight(story) {
    const visual = storyVisual(story);
    return matchMedia('(max-width:560px)').matches
      ? visual.mobileHeight + 56
      : visual.height + 68;
  }

  function storyBuckets(stories, count) {
    const buckets = Array.from({ length: count }, () => []);
    const heights = Array(count).fill(0);
    stories.forEach((story) => {
      const target = heights.indexOf(Math.min(...heights));
      buckets[target].push(story);
      heights[target] += estimatedStoryHeight(story);
    });
    return { buckets, heights };
  }

  function renderStoryColumns(stories) {
    const list = view.querySelector('.pttr-story-list');
    if (!list) return;
    const count = storyColumnCount(list);
    const { buckets, heights } = storyBuckets(stories, count);
    list.style.setProperty('--pttr-column-count', String(count));
    list.dataset.pttrColumns = String(count);
    list.innerHTML = buckets.map((bucket, index) => `<div class="pttr-story-column" role="presentation" data-pttr-height="${heights[index]}">${bucket.map(storyHtml).join('')}</div>`).join('');
  }

  function appendStoryColumns(stories) {
    if (!stories.length) return;
    let list = view.querySelector('.pttr-story-list');
    if (!list) {
      const empty = view.querySelector('.pttr-empty');
      if (!empty) return;
      list = document.createElement('div');
      list.className = 'pttr-story-list';
      list.setAttribute('role', 'list');
      empty.replaceWith(list);
      renderStoryColumns(state.model.stories);
      return;
    }
    const columns = Array.from(list.querySelectorAll('.pttr-story-column'));
    stories.forEach((story) => {
      const target = columns.reduce((shortest, column) => Number(column.dataset.pttrHeight) < Number(shortest.dataset.pttrHeight) ? column : shortest);
      target.insertAdjacentHTML('beforeend', storyHtml(story));
      target.dataset.pttrHeight = String(Number(target.dataset.pttrHeight) + estimatedStoryHeight(story));
    });
  }

  function reflowStoryColumns() {
    if (!state.model || state.model.type !== 'board') return;
    const list = view.querySelector('.pttr-story-list');
    if (!list || storyColumnCount(list) === Number(list.dataset.pttrColumns)) return;
    const scrollTop = mainScroller.scrollTop;
    renderStoryColumns(state.model.stories);
    restoreScrollPosition(scrollTop, state.url);
  }

  function storyVisual(story) {
    const seed = stableHash(`${story.title}|${story.author}`);
    const heights = [148, 168, 188, 208, 178, 198];
    const height = heights[seed % heights.length] + (story.headline.length > 36 ? 14 : 0);
    return { tone: seed % 6, height, mobileHeight: Math.max(112, Math.round(height * 0.72)) };
  }

  function stableHash(value) {
    let hash = 2166136261;
    for (const char of value) {
      hash ^= char.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function renderArticle(model) {
    const counts = reactionCounts(model.pushes);
    view.className = 'pttr-article-view';
    view.innerHTML = `
      <a class="pttr-back" href="${escapeAttr(model.boardUrl)}" data-pttr-nav data-pttr-restore><span>←</span><span>${escapeHtml(text('backBoard'))} ${escapeHtml(model.board)}</span></a>
      <article>
        <header class="pttr-article-header">
          ${model.category ? `<span class="pttr-category">${escapeHtml(translate(model.category))}</span>` : ''}
          <h1>${escapeHtml(translate(model.headline))}</h1>
          <div class="pttr-byline"><span class="pttr-avatar">${escapeHtml(initial(model.author))}</span><span class="pttr-byline-copy"><strong>${escapeHtml(model.author)}</strong><span>${escapeHtml(model.time)}</span></span></div>
        </header>
        <div class="pttr-prose" id="pttr-prose">${model.bodyHtml}</div>
        <section class="pttr-comments">
          <header class="pttr-comments-head"><h2>${escapeHtml(text('discussion'))} · ${model.pushes.length}</h2><div class="pttr-comment-summary"><span>${escapeHtml(text('up'))} <strong>${counts.up}</strong></span><span>${escapeHtml(text('neutral'))} <strong>${counts.neutral}</strong></span><span>${escapeHtml(text('down'))} <strong>${counts.down}</strong></span></div></header>
          <div>${model.pushes.map(pushHtml).join('')}</div>
        </section>
      </article>`;
    if (state.lang === 'zh-CN') localizeTextNodes(view.querySelector('#pttr-prose'));
  }

  function pushHtml(push) {
    const symbol = push.kind === 'up' ? '↑' : push.kind === 'down' ? '↓' : '→';
    return `<div class="pttr-push" data-kind="${push.kind}"><span class="pttr-push-tag" title="${escapeAttr(translate(push.tag))}">${symbol}</span><strong class="pttr-push-user">${escapeHtml(push.user)}</strong><p class="pttr-push-content">${escapeHtml(translate(push.content))}</p><time class="pttr-push-time">${escapeHtml(push.time)}</time></div>`;
  }

  function renderRail(model) {
    if (model.type === 'board') {
      rail.replaceChildren();
    } else {
      const counts = reactionCounts(model.pushes);
      rail.innerHTML = `
        <section class="pttr-rail-section"><h2 class="pttr-rail-title">${escapeHtml(text('progress'))}</h2><div class="pttr-progress-value"><strong id="pttr-progress-value">0</strong><span>%</span></div><div class="pttr-progress-track"><span id="pttr-progress-track"></span></div></section>
        <section class="pttr-rail-section"><h2 class="pttr-rail-title">${escapeHtml(text('articleInfo'))}</h2><div class="pttr-info-list"><div class="pttr-info-row"><span>${escapeHtml(text('by'))}</span><strong>${escapeHtml(model.author)}</strong></div><div class="pttr-info-row"><span>${escapeHtml(text('readingTime'))}</span><strong>${model.readingMinutes} ${escapeHtml(text('minute'))}</strong></div><div class="pttr-info-row"><span>${escapeHtml(text('characters'))}</span><strong>${model.charCount}</strong></div><div class="pttr-info-row"><span>${escapeHtml(text('replies'))}</span><strong>${model.pushes.length}</strong></div></div></section>
        <section class="pttr-rail-section"><h2 class="pttr-rail-title">${escapeHtml(text('discussion'))}</h2><div class="pttr-info-list"><div class="pttr-info-row"><span>${escapeHtml(text('up'))}</span><strong>${counts.up}</strong></div><div class="pttr-info-row"><span>${escapeHtml(text('neutral'))}</span><strong>${counts.neutral}</strong></div><div class="pttr-info-row"><span>${escapeHtml(text('down'))}</span><strong>${counts.down}</strong></div></div></section>`;
    }
  }

  function pageKey(value) {
    const url = new URL(value, location.href);
    url.hash = '';
    return url.href;
  }

  function storyKey(story) {
    return story.href || `${story.title}|${story.author}|${story.date}`;
  }

  function resetInfiniteState() {
    state.infiniteController?.abort();
    state.infiniteController = null;
    state.infiniteLoading = false;
    state.infiniteError = false;
    state.infinitePageUrls = new Set(state.model?.type === 'board' ? [pageKey(state.url)] : []);
    state.infiniteComplete = state.model?.type !== 'board' || !state.model.pagination?.previous;
  }

  function cacheCurrentPage() {
    if (!state.model || !mainScroller || !['board', 'article'].includes(state.model.type)) return;
    const key = pageKey(state.url);
    state.pageCache.delete(key);
    state.pageCache.set(key, {
      model: state.model,
      scrollTop: mainScroller.scrollTop,
      infiniteComplete: state.infiniteComplete,
      infinitePageUrls: [...state.infinitePageUrls]
    });
    while (state.pageCache.size > 20) state.pageCache.delete(state.pageCache.keys().next().value);
  }

  function restoreCachedPage(value) {
    const targetUrl = new URL(value, location.href).href;
    const cached = state.pageCache.get(pageKey(targetUrl));
    if (!cached) return false;
    state.controller?.abort();
    state.infiniteController?.abort();
    state.requestId += 1;
    state.controller = null;
    state.infiniteController = null;
    state.model = cached.model;
    state.url = targetUrl;
    state.infiniteLoading = false;
    state.infiniteError = false;
    state.infiniteComplete = cached.infiniteComplete;
    state.infinitePageUrls = new Set(cached.infinitePageUrls);
    renderCurrent(false);
    restoreScrollPosition(cached.scrollTop, targetUrl);
    return true;
  }

  function handleHistoryNavigation() {
    cacheCurrentPage();
    closeOverlays();
    if (!restoreCachedPage(location.href)) navigate(location.href, false);
  }

  function infiniteStatusText() {
    if (state.infiniteLoading) return text('loadingMore');
    if (state.infiniteError) return text('loadMoreFailed');
    if (state.infiniteComplete) return text('noMore');
    return '';
  }

  function updateInfiniteStatus() {
    const status = app?.querySelector('#pttr-infinite-status');
    if (!status) return;
    status.textContent = infiniteStatusText();
    status.classList.toggle('loading', state.infiniteLoading);
    status.classList.toggle('error', state.infiniteError);
  }

  function maybeLoadMore() {
    if (!state.model || state.model.type !== 'board' || state.infiniteLoading || state.infiniteComplete || !state.model.pagination?.previous) return;
    if (!mainScroller.scrollHeight || !mainScroller.clientHeight) return;
    const distanceToBottom = mainScroller.scrollHeight - mainScroller.scrollTop - mainScroller.clientHeight;
    const prefetchDistance = Math.max(900, Math.round(mainScroller.clientHeight * 1.2));
    if (distanceToBottom <= prefetchDistance) loadNextBoardPage();
  }

  async function loadNextBoardPage() {
    if (!state.model || state.model.type !== 'board' || state.infiniteLoading || state.infiniteComplete) return;
    const olderPageUrl = state.model.pagination?.previous;
    if (!olderPageUrl) {
      state.infiniteComplete = true;
      updateInfiniteStatus();
      return;
    }
    const nextPageKey = pageKey(olderPageUrl);
    if (state.infinitePageUrls.has(nextPageKey)) {
      state.infiniteComplete = true;
      updateInfiniteStatus();
      return;
    }

    const modelAtStart = state.model;
    const urlAtStart = state.url;
    const controller = new AbortController();
    state.infiniteController?.abort();
    state.infiniteController = controller;
    state.infiniteLoading = true;
    state.infiniteError = false;
    updateInfiniteStatus();

    try {
      const response = await fetch(olderPageUrl, {
        credentials: 'include',
        cache: 'no-store',
        signal: controller.signal,
        headers: { 'X-Requested-With': 'PTT-Reader' }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      if (state.url !== urlAtStart || state.model !== modelAtStart) return;
      const doc = new DOMParser().parseFromString(html, 'text/html');
      if (doc.querySelector('.over18-notice')) {
        document.cookie = 'over18=1; path=/; domain=.ptt.cc; max-age=31536000; SameSite=Lax';
        throw new Error('Age cookie was rejected');
      }
      const nextModel = parsePage(doc, response.url || olderPageUrl);
      if (!nextModel || nextModel.type !== 'board') throw new Error('Unsupported PTT board page');

      const seen = new Set(modelAtStart.stories.map(storyKey));
      const additions = nextModel.stories.filter((story) => {
        const key = storyKey(story);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      state.infinitePageUrls.add(nextPageKey);
      state.infiniteComplete = !nextModel.pagination?.previous;
      state.model = {
        ...modelAtStart,
        stories: [...modelAtStart.stories, ...additions],
        pagination: nextModel.pagination
      };
      appendStoryColumns(additions);
      const count = view.querySelector('.pttr-count strong');
      if (count) count.textContent = String(state.model.stories.length);
    } catch (error) {
      if (error.name === 'AbortError') return;
      console.warn('[PTT Reader] infinite load failed', error);
      if (state.url === urlAtStart) state.infiniteError = true;
    } finally {
      if (state.infiniteController === controller) {
        state.infiniteController = null;
        state.infiniteLoading = false;
        updateInfiniteStatus();
        if (!state.infiniteError) requestAnimationFrame(maybeLoadMore);
      }
    }
  }

  async function navigate(url, push, preferCache = false) {
    const target = canonicalBoardUrl(url);
    if (target.origin !== location.origin || !target.pathname.startsWith('/bbs/')) {
      location.href = target.href;
      return;
    }
    cacheCurrentPage();
    if (preferCache && state.pageCache.has(pageKey(target.href))) {
      if (push) history.pushState({ pttr: true }, '', target.href);
      restoreCachedPage(target.href);
      return;
    }
    state.controller?.abort();
    state.infiniteController?.abort();
    const controller = new AbortController();
    state.controller = controller;
    const requestId = ++state.requestId;
    state.url = target.href;
    showLoading();
    try {
      const response = await fetch(target.href, { credentials: 'include', signal: controller.signal, headers: { 'X-Requested-With': 'PTT-Reader' } });
      const html = await response.text();
      if (requestId !== state.requestId) return;
      const doc = new DOMParser().parseFromString(html, 'text/html');
      if (response.status === 404) {
        const missing = parseNotFoundPage(doc, response.url || target.href);
        if (!missing) throw new Error('HTTP 404');
        state.model = missing;
        state.url = target.href;
        resetInfiniteState();
        if (push) history.pushState({ pttr: true }, '', target.href);
        renderCurrent();
        return;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (doc.querySelector('.over18-notice')) {
        document.cookie = 'over18=1; path=/; domain=.ptt.cc; max-age=31536000; SameSite=Lax';
        throw new Error('Age cookie was rejected');
      }
      const model = parsePage(doc, response.url || target.href);
      if (!model) throw new Error('Unsupported PTT page');
      state.model = model;
      state.url = target.href;
      resetInfiniteState();
      if (push) history.pushState({ pttr: true }, '', target.href);
      renderCurrent();
      cacheCurrentPage();
    } catch (error) {
      if (error.name === 'AbortError') return;
      console.error('[PTT Reader] navigation failed', error);
      showError(error);
    }
  }

  function restoreScrollPosition(scrollTop, viewUrl) {
    const previousBehavior = mainScroller.style.scrollBehavior;
    mainScroller.style.scrollBehavior = 'auto';
    mainScroller.scrollTop = scrollTop;
    requestAnimationFrame(() => {
      if (state.url === viewUrl) mainScroller.scrollTop = scrollTop;
      mainScroller.style.scrollBehavior = previousBehavior;
      updateReadingProgress();
    });
  }

  function showLoading() {
    view.className = 'pttr-view';
    view.setAttribute('aria-busy', 'true');
    view.innerHTML = `<div class="pttr-view-head"><div><p class="pttr-eyebrow">PTT</p><h1>${escapeHtml(text('loading'))}</h1></div></div><div class="pttr-loading">${'<div class="pttr-skeleton"></div>'.repeat(7)}</div>`;
    rail.innerHTML = '';
  }

  function showError(error) {
    view.removeAttribute('aria-busy');
    view.className = 'pttr-view';
    view.innerHTML = `<div class="pttr-error"><h2>${escapeHtml(text('loadError'))}</h2><p>${escapeHtml(error.message || '')}</p><div class="pttr-error-actions"><button class="pttr-error-retry" type="button" data-pttr-retry>${escapeHtml(text('retry'))}</button></div></div>`;
  }

  function updateReadingProgress() {
    if (!state.model || state.model.type !== 'article') {
      app.querySelector('#pttr-top-progress').style.width = '0%';
      return;
    }
    const max = Math.max(1, mainScroller.scrollHeight - mainScroller.clientHeight);
    const percentage = Math.min(100, Math.max(0, Math.round(mainScroller.scrollTop / max * 100)));
    app.querySelector('#pttr-top-progress').style.width = `${percentage}%`;
    const value = app.querySelector('#pttr-progress-value');
    const track = app.querySelector('#pttr-progress-track');
    if (value) value.textContent = percentage;
    if (track) track.style.width = `${percentage}%`;
  }

  function toggleSettings(force) {
    const open = typeof force === 'boolean' ? force : settings.hidden;
    settings.hidden = !open;
    app.querySelector('#pttr-settings-button').setAttribute('aria-expanded', String(open));
  }

  function closeOverlays() {
    toggleSettings(false);
  }

  function setLanguage(lang) {
    if (!copySets[lang] || state.lang === lang) return;
    state.lang = lang;
    storage.set('ptt-modern-lang', lang);
    renderCurrent(false);
    showToast(lang === 'zh-CN' ? '已切换为简体中文' : '已切換為繁體中文');
  }

  function setTheme(theme) {
    if (!['paper', 'ink', 'mist', 'rose'].includes(theme) || state.theme === theme) return;
    state.theme = theme;
    storage.set('ptt-modern-theme', theme);
    applyPreferences();
    updateSettings();
    showToast(text(theme));
  }

  function setFontSize(size) {
    state.fontSize = Math.min(22, Math.max(16, size));
    storage.set('ptt-reader-font-size', String(state.fontSize));
    applyPreferences();
    updateSettings();
  }

  function applyPreferences() {
    document.documentElement.dataset.pttrTheme = state.theme;
    document.documentElement.lang = state.lang;
    app?.style.setProperty('--reader-font', `${state.fontSize}px`);
  }

  function updateSettings() {
    if (!settings) return;
    app.querySelector('#pttr-settings-title').textContent = text('settings');
    app.querySelector('#pttr-settings-version').textContent = `v${SCRIPT_VERSION}`;
    app.querySelector('#pttr-settings-released-at').textContent = `${text('releasedAt')} ${SCRIPT_RELEASED_AT}`;
    app.querySelector('#pttr-language-label').textContent = text('language');
    app.querySelector('#pttr-theme-label').textContent = text('appearance');
    app.querySelector('#pttr-font-label').textContent = text('fontSize');
    settings.querySelector('[data-lang="zh-TW"]').textContent = text('traditional');
    settings.querySelector('[data-lang="zh-CN"]').textContent = text('simplified');
    settings.querySelector('[data-theme="paper"] > span:last-child').textContent = text('paper');
    settings.querySelector('[data-theme="ink"] > span:last-child').textContent = text('ink');
    settings.querySelector('[data-theme="mist"] > span:last-child').textContent = text('mist');
    settings.querySelector('[data-theme="rose"] > span:last-child').textContent = text('rose');
    settings.querySelectorAll('[data-lang]').forEach((button) => button.classList.toggle('active', button.dataset.lang === state.lang));
    settings.querySelectorAll('[data-theme]').forEach((button) => button.classList.toggle('active', button.dataset.theme === state.theme));
    app.querySelector('#pttr-font-value').textContent = `${state.fontSize}px`;
    app.querySelector('#pttr-font-smaller').title = text('smaller');
    app.querySelector('#pttr-font-larger').title = text('larger');
    app.querySelector('#pttr-settings-close').setAttribute('aria-label', text('close'));
  }

  function showToast(message) {
    const toast = app.querySelector('#pttr-toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1500);
  }

  function decorateContentLinks(root) {
    root.querySelectorAll('a[href]').forEach((link) => {
      const target = new URL(link.getAttribute('href'), state.url);
      if (target.origin === location.origin && target.pathname.startsWith('/bbs/')) {
        link.dataset.pttrNav = '';
      } else {
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      }
    });
  }

  function sanitizeContent(root, baseUrl) {
    root.querySelectorAll('*').forEach((element) => {
      Array.from(element.attributes).forEach((attribute) => {
        if (/^on/i.test(attribute.name) || attribute.name === 'style') element.removeAttribute(attribute.name);
      });
      if (element.tagName === 'A') {
        try {
          const target = new URL(element.getAttribute('href') || '', baseUrl);
          if (!/^https?:$/.test(target.protocol)) element.removeAttribute('href');
          else element.href = target.href;
        } catch (_) {
          element.removeAttribute('href');
        }
      }
    });
  }

  function normalizeArticleWraps(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.parentElement?.closest('pre,code')) continue;
      node.nodeValue = node.nodeValue
        .replace(/\r/g, '')
        .replace(/([^\n])\n(?=[^\n])/g, '$1')
        .replace(/\n{3,}/g, '\n\n');
    }
  }

  function localizeTextNodes(root) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) node.nodeValue = translate(node.nodeValue);
  }

  function splitTitle(title) {
    const match = title.match(/^((?:Re|Fw):\s*)?\[([^\]]+)\]\s*/i);
    return match
      ? { category: match[2], headline: `${match[1] || ''}${title.slice(match[0].length).trim()}` || title }
      : { category: '', headline: title };
  }

  function reactionCounts(pushes) {
    return pushes.reduce((counts, push) => {
      counts[push.kind] += 1;
      return counts;
    }, { up: 0, neutral: 0, down: 0 });
  }

  function originalUrl(value) {
    const url = new URL(value, location.href);
    url.searchParams.set('pttr', 'off');
    return url.href;
  }

  function absoluteUrl(value, base) {
    try { return new URL(value || '', base).href; } catch (_) { return ''; }
  }

  function canonicalBoardUrl(value) {
    const url = new URL(value, location.href);
    const match = url.pathname.match(/^\/bbs\/([^/]+)\/index\d+\.html$/);
    if (!match) return url;
    url.pathname = `/bbs/${match[1]}/index.html`;
    url.search = '';
    url.hash = '';
    return url;
  }

  function translate(value) {
    const string = String(value ?? '');
    return state.lang === 'zh-CN' ? string.replace(traditionalPattern, (char) => charPairs[char] || char) : string;
  }

  function text(key) {
    return copySets[state.lang]?.[key] || copySets['zh-CN'][key] || key;
  }

  function clean(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  function initial(value) {
    return clean(value).replace(/^\[/, '').charAt(0) || 'P';
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }
})();
