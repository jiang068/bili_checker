// ==UserScript==
// @name         B站查成分_改
// @namespace    bilibili.auto.labeling2
// @version      1.7a
// @description  带悬浮控制窗+扩充成分字典，可在评论区、直播间弹幕、个人主页使用。支持配置持久化、高频限流优化。新增智能可见性监听，挂后台黑听时自动进入零消耗冬眠模式。
// @author       jiang068 (@github)
// @match        https://*.bilibili.com/*
// @connect      api.bilibili.com
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    const blogApi = 'https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space?&host_mid=';
    const cache = new Map();
    const pending = new Set();
    const requestQueue = [];
    let isProcessingQueue = false;

    // --- 持久化配置初始化 ---
    const config = {
        videoEnabled: GM_getValue('bili_checker_video_enabled', true),
        liveEnabled: GM_getValue('bili_checker_live_enabled', true),
        isMinimized: GM_getValue('bili_checker_minimized', false),
        pos: GM_getValue('bili_checker_pos', { top: '80px', left: (window.innerWidth - 200) + 'px' })
    };

// --- 状态提示精简 ---
    const defaultTag = ["纯良", "#11DD77"]; // 经典生机绿
    const errorTag = ["未查到", "#999999"]; // 中立深灰

    // --- 1. VTUBER 阵营（保留并优化各V标志性应援色，微调亮度确保双模可读） ---
    const vtuberList = [
        ["嘉心糖", "嘉然|jaransan", "#E799B0"], 
        ["顶碗人", "向晚", "#7BC2E9"], 
        ["贝极星", "贝拉", "#DB7D74"], 
        ["奶淇琳", "乃琳", "#576690"], 
        ["皇珈", "珈乐", "#C71585"], 
        ["雏草姬", "塔菲|tafei", "#FF00CC"], 
        ["棺材板", "東雪莲|东雪莲", "#A0A0A0"], 
        ["杰尼", "七海|nanami", "#A38594"], 
        ["喵喵露", "猫雷", "#10D010"], 
        ["三畜", "小狗说|卡卡", "#B8A6D9"], 
        ["星星", "星瞳", "#B0B0B0"], 
        ["小孩梓", "阿梓|梓", "#A64DFF"],
        ["呜米人", "呜米|wumi", "#4169E1"], 
        ["可可人", "小可", "#FF69B4"], 
        ["桃几", "桃皇|桃几", "#FF1493"], 
        ["星咏者", "星街彗星|星街|すいせい|suisei", "#E6A23C"], 
        ["夸友", "凑阿夸|阿夸|minato|aqua", "#00BFFF"],
        ["Holo", "hololive|兔田|pekora|宝钟|船长", "#FF4F81"],
        ["彩虹", "nijisanji|彩虹社|葛叶", "#3A5FCD"]
    ];

    // --- 2. 跨游组合阵营 ---
    const threeList = [
        ["三相之力", "原神&明日方舟&王者荣耀", "#FFD700"], 
    ];

    // --- 3. V家与歌姬 ---
    const vocaloadList = [
        ["Miku", "初音|miku|MIKU", "#00CC99"], 
        ["天依", "洛天依|天依", "#00B2EE"],
        ["言和", "言和", "#00F5FF"], 
        ["魂友", "A-SOUL|一个魂", "#FF56A9"]
    ];

    // --- 4. 经典网游（采用古风门派翠、蓝、黛色系） ---
    const igameList = [
        ["仙剑", "仙剑奇侠传|仙剑", "#14B8A6"], 
        ["古剑", "古剑奇谭|古剑", "#0D9488"], 
        ["逆水寒", "逆水寒", "#06B6D4"], 
        ["诛仙", "诛仙世界|诛仙", "#6366F1"], 
        ["剑网3", "剑网|剑三|剑侠情缘", "#EC4899"], 
        ["FF14", "最终幻想14|FF14|狒狒|艾欧泽亚", "#4169E1"], 
        ["魔兽", "魔兽世界", "#2B8A3E"]
    ];

    // --- 5. 竞技端游（采用高能动感暖色调与力量感冷色调） ---
    const cgameList = [
        ["黑神话", "黑神话|天命人|悟空", "#D97706"], 
        ["LOL", "英雄联盟|LOL|下路|大乱斗", "#FF4500"], 
        ["COD", "使命召唤|COD|现代战争", "#EA580C"], 
        ["Dota2", "Dota2|Dota|刀塔", "#EF4444"], 
        ["CS2", "CS2|CSGO|开箱|大地球", "#F59E0B"], 
        ["瓦罗兰特", "无畏契约|瓦罗兰特|无畏契约|瓦", "#FF1493"],
        ["三角洲", "三角洲行动|三角洲", "#0284C7"], 
        ["CF", "穿越火线|火线", "#DC2626"], 
        ["DNF", "地下城与勇士|DNF|西海岸", "#B91C1C"], 
        ["和平精英", "和平精英|吃鸡手游", "#65A30D"], 
        ["逆战", "逆战", "#2563EB"],
        ["王者荣耀", "王者荣耀", "#EAB308"]
    ];

    // --- 6. 热门二游（【重构重点】：彻底击碎统一的米家蓝色调，做精细化区分） ---
    const ecygameList = [
        ["鸣潮", "鸣潮|漂泊者|库洛", "#FFCC66"],               // 鸣潮专属：库洛金
        ["绝区零", "绝区零|ZZZ|zzz|新艾利都", "#84CC16"],       // ZZZ专属：潮酷荧光绿
        ["星铁", "星穹铁道|崩铁|开拓者", "#4F46E5"],           // 星铁专属：星穹深邃靛蓝
        ["原神", "原神|旅行者|提瓦特|雷国|草国|胡桃", "#0284C7"], // 原神专属：提瓦特天青蓝
        ["方舟", "明日方舟|罗德岛|博士", "#10B981"],           // 舟专属：工业结晶薄荷绿
        ["尘白", "尘白禁区|分析员|海姆达尔", "#38BDF8"],       // 尘白专属：冰晶浅蓝
        ["恋深", "恋与深空", "#F43F5E"],                       // 恋深专属：炽热玫瑰红
        ["战双", "战双|帕弥什", "#E11D48"],                     // 战双专属：构造体猩红
        ["幻塔", "幻塔", "#F97316"],                           // 幻塔：废土霓虹橙
        ["光遇", "光遇", "#FBBF24"],                           // 光遇：暖心晨曦黄
        ["碧蓝", "碧蓝航线|指挥官", "#0EA5E9"],                 // 碧蓝：纯澈海洋蓝
        ["FGO", "FGO|冠位指定|月球人", "#8B5CF6"],             // FGO：迦勒底神秘紫
        ["公主", "公主连结|兰德索尔", "#10B981"],               // 公主：生机草原绿
        ["车万", "东方project|灵梦|芙兰朵露|魔理沙", "#EF4444"], // 车万：博丽巫女正红
        ["妮姬", "胜利女神|NIKKE|妮姬", "#D946EF"],             // 妮姬：莱彻极光紫粉
        ["少前", "少女前线|少前2|格里芬", "#6B7280"],            // 少前：战术流沙灰
        ["洛克", "洛克王国|洛克", "#FF6B35"],                  // 洛克王国：童趣活力橙
        ["异环", "异环|Neverness|neverness", "#A855F7"],       // 异环：超自然霓虹紫
        ["卡厄斯", "卡厄斯|Chaos Dream|chaos", "#DC2626"],    // 卡厄斯梦境：混沌赤红
        ["深空", "深空之眼|修正者|深空", "#6366F1"],          // 深空之眼：修正者靛蓝
        ["灵魂", "灵魂潮汐|人偶师|蚀月", "#EC4899"],          // 灵魂潮汐：人偶梦幻粉
        ["无限大", "无限大|Ananta|ananta", "#06B6D4"],        // 无限大：都市青蓝
        ["蓝原", "蓝色星原|旅谣", "#3B82F6"],                 // 蓝色星原：旅谣天空蓝
        ["星布谷", "星布谷地|PetitPlanet", "#22C55E"],         // 星布谷地：田园生机绿
        ["望月", "望月|月灵", "#F59E0B"],                     // 望月：月灵琥珀金
        ["白城", "白银之城|白银城", "#94A3B8"],               // 白银之城：白银金属灰
        ["绯月", "绯月絮语|绯月", "#F43F5E"],                 // 绯月絮语：绯红玫瑰
        ["猫娘", "猫娘日记|猫娘", "#FB923C"],                 // 猫娘日记：暖橙猫系
        ["七罪", "七大罪|Origin|七原罪", "#8B5CF6"]           // 七大罪：魔导神秘紫
    ];

    // --- 7. 主机与单机大作 ---
    const zgameList = [
        ["塞尔达", "塞尔达|王国之泪|旷野之息", "#06B6D4"], 
        ["怪猎", "怪物猎人|怪猎|荒野", "#CA8A04"], 
        ["魂系", "黑暗之魂|Elden Ring|只狼|法环|血源|不死人", "#8B0000"], 
        ["GTA", "GTA6|GTA5|侠盗猎车", "#EC4899"], 
        ["马里奥", "超级马里奥|马力欧|任天堂", "#FF0000"],
        ["大镖客", "荒野大镖客|亚瑟·摩根", "#991B1B"]
    ];

    // --- 8. 独立与沙盒游戏 ---
    const ogameList = [
        ["MC", "MINECRAFT|Minecraft|我的世界|史蒂夫", "#15803D"], 
        ["传说之下", "UNDERTALE|undertale|传说之下", "#818CF8"], 
        ["SCP", "SCP|scp", "#4B5563"], 
        ["空洞", "空洞骑士|Hollow Knight", "#60A5FA"], 
        ["星露谷", "星露谷物语|鹈鹕镇", "#22C55E"]
    ];

    // --- 9. 特殊群体与亚文化 ---
    const otherList = [
        ["抽奖狂魔", "抽奖|互动抽奖", "#3B82F6"],
        ["转发动态", "转发动态",  "#2563EB"],
        ["抽象派", "抽象|带带大师兄|孙笑川|药水哥", "#8A2BE2"],
        ["乐子人", "乐子|看乐子|反串|神仙打架", "#FF4500"],
        ["老二次元", "老二次元|老害|入坑十年|时代眼泪", "#9932CC"],
        ["米线人", "米线|底线|李赣|地狱飞人", "#FF6600"]
    ];

    // --- 映射收集器定义（保持不变，承接上层颜色） ---
    const captor = [
        ['Vtuber', vtuberList], 
        ['组合', threeList], 
        ['V家', vocaloadList], 
        ['网游', igameList, "#6666FF"], 
        ['端游', cgameList, "#6699FF"], 
        ['二游', ecygameList, "#FF6699"], 
        ['主机', zgameList, "#FF4500"], 
        ['独立', ogameList, "#FF6600"], 
        ['特殊', otherList]
    ];

    function searchStr(text, rule) {
        if (!rule) return false;
        const ruleAnd = rule.split('&');
        return ruleAnd.every(rAnd => {
            const ruleOr = rAnd.split('|');
            return ruleOr.some(rOr => {
                if (rOr.startsWith('!')) return !text.includes(rOr.substring(1));
                return text.includes(rOr);
            });
        });
    }

    function getResultTags(text) {
    let finalTags = [];
    captor.forEach(([groupName, list, groupColor]) => {
        list.forEach(([viewName, keyword, color]) => {
            const kw = keyword || viewName;
            if (searchStr(text, kw)) {
                // 智能缩写：将 Vtuber->V, 二游->二, 端游->端 
                const shortGroup = groupName ? `[${groupName.slice(0,1)}]` : '';
                finalTags.push({
                    name: `${shortGroup}${viewName}`,
                    color: color || groupColor || "#ff6699"
                });
            }
        });
    });
    // 默认标签和错误标签同步精简字数
    return finalTags.length > 0 ? finalTags : [{ name: defaultTag[0], color: defaultTag[1] }];
}

    // --- 限流队列处理器 ---
    function processRequestQueue() {
        if (requestQueue.length === 0) {
            isProcessingQueue = false;
            return;
        }

        isProcessingQueue = true;
        const { uid, render, headerContainer } = requestQueue.shift();

        // 如果在此期间页面切到后台，直接抛弃后续排队，停止网络请求
        if (document.hidden || !headerContainer.isConnected) {
            pending.delete(uid);
            setTimeout(processRequestQueue, 0);
            return;
        }

        if (cache.has(uid)) {
            pending.delete(uid);
            render(cache.get(uid));
            setTimeout(processRequestQueue, 0);
            return;
        }

        GM_xmlhttpRequest({
            method: "GET",
            url: blogApi + uid,
            timeout: 4000,
            onload: res => {
                pending.delete(uid);
                if (res.status === 200) {
                    try {
                        const resData = JSON.parse(res.response);
                        const textData = resData.data ? JSON.stringify(resData.data) : "";
                        const tags = getResultTags(textData);
                        cache.set(uid, tags);
                        if (headerContainer.isConnected && !document.hidden) render(tags);
                    } catch (e) {
                        cache.set(uid, [{ name: errorTag[0], color: errorTag[1] }]);
                        if (headerContainer.isConnected && !document.hidden) render(cache.get(uid));
                    }
                } else {
                    headerContainer.dataset.uid = "";
                }
                setTimeout(processRequestQueue, 350);
            },
            onerror: () => { pending.delete(uid); headerContainer.dataset.uid = ""; setTimeout(processRequestQueue, 350); },
            ontimeout: () => { pending.delete(uid); headerContainer.dataset.uid = ""; setTimeout(processRequestQueue, 350); }
        });
    }

    // --- 标签渲染逻辑 ---
    function applyTags(uid, headerContainer) {
        if (!uid || (headerContainer.dataset.uid === uid && headerContainer.querySelector(".my-tag"))) return;
        headerContainer.dataset.uid = uid;

        const render = (tagList) => {
            headerContainer.querySelectorAll(".my-tag").forEach(el => el.remove());
            tagList.forEach(item => {
                const span = document.createElement("span");
                span.className = "my-tag";
                span.textContent = item.name;
                span.style.cssText = `
                    display: inline-block; margin-left: 6px; margin-bottom: 2px; font-size: 11px; line-height: 14px;
                    padding: 1px 4px; border-radius: 3px; background: rgba(0,0,0,0.05); color: ${item.color};
                    border: 1px solid ${item.color}80; white-space: nowrap; vertical-align: middle;
                    max-width: 150px; overflow: hidden; text-overflow: ellipsis; user-select: none;
                `;
                headerContainer.appendChild(span);
            });
        };

        if (cache.has(uid)) return render(cache.get(uid));
        if (pending.has(uid)) return;

        pending.add(uid);
        requestQueue.push({ uid, render, headerContainer });
        if (!isProcessingQueue) processRequestQueue();
    }

    // --- 熔断清理函数 ---
    function clearTagsAndQueue(type) {
        requestQueue.length = 0; 
        pending.clear();
        if (type === 'video') {
            getCommentRoot()?.querySelectorAll(".my-tag").forEach(el => el.remove());
            getThreads().forEach(t => { if(t.shadowRoot?.querySelector("bili-comment-renderer")) t.shadowRoot.querySelector("bili-comment-renderer").shadowRoot.querySelector("#header").dataset.uid = ""; });
        } else if (type === 'live') {
            document.querySelectorAll("#chat-items .my-tag").forEach(el => el.remove());
            document.querySelectorAll("#chat-items .common-nickname-wrapper").forEach(el => el.dataset.uid = "");
        }
    }

    // --- 视频评论区扫描 ---
    function getCommentRoot() { return document.querySelector("bili-comments")?.shadowRoot; }
    function getThreads() { return getCommentRoot()?.querySelectorAll("bili-comment-thread-renderer") || []; }

    function scanVideoComment() {
        if (document.hidden) return; // 【新增】如果网页挂后台黑听，立即熔断DOM扫描，节省系统资源
        if (!config.videoEnabled) return; 
        const threads = getThreads();
        threads.forEach(thread => {
            const sr1 = thread.shadowRoot;
            if (!sr1) return;

            const renderer = sr1.querySelector("bili-comment-renderer");
            const header = renderer?.shadowRoot?.querySelector("#header");
            const uid = renderer?.shadowRoot?.querySelector("#user-avatar")?.dataset.userProfileId;
            if (header && uid) applyTags(uid, header);

            const repliesContainer = sr1.querySelector("#replies");
            const repliesRenderer = repliesContainer?.querySelector("bili-comment-replies-renderer");
            const replies = repliesRenderer?.shadowRoot?.querySelectorAll("bili-comment-reply-renderer");

            replies?.forEach(reply => {
                const rHeader = reply.shadowRoot?.querySelector("#main");
                const rUid = reply.shadowRoot?.querySelector("#user-avatar")?.dataset.userProfileId;
                if (rHeader && rUid) applyTags(rUid, rHeader);
            });
        });
    }

    // --- 直播间弹幕扫描 ---
    function scanLiveChat() {
        if (document.hidden) return; // 【新增】如果网页挂后台黑听，立即熔断DOM扫描，节省系统资源
        if (!config.liveEnabled) return; 
        const chatItemsContainer = document.querySelector("#chat-items");
        if (!chatItemsContainer) return;

        const danmakuItems = chatItemsContainer.querySelectorAll(".chat-item.danmaku-item");
        danmakuItems.forEach(item => {
            const uid = item.dataset.uid;
            const nicknameWrapper = item.querySelector(".common-nickname-wrapper");

            if (uid && nicknameWrapper) {
                nicknameWrapper.style.setProperty("display", "inline", "important");
                const userName = nicknameWrapper.querySelector(".user-name");
                if (userName) {
                    userName.style.setProperty("white-space", "nowrap", "important");
                    userName.style.setProperty("display", "inline-block", "important");
                }
                applyTags(uid, nicknameWrapper);
            }
        });
    }

    // --- 新增：智能可见性全局监听器 ---
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            // 切去后台的瞬间，斩断当前积累的全部待发网络请求队列，防止不可见状态下后台网络偷跑
            requestQueue.length = 0;
            pending.clear();
        }
    });

    // --- 创建可视化悬浮窗面板 ---
    function createControlPanel() {
        const container = document.createElement('div');
        container.id = 'bili-checker-panel-root';
        container.style.cssText = `
            position: fixed; top: ${config.pos.top}; left: ${config.pos.left}; z-index: 100000;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            user-select: none; box-shadow: 0 4px 16px rgba(0,0,0,0.15); border-radius: 8px;
            background: var(--bg1, #ffffff); border: 1px solid var(--line_regular, #e3e8ec);
            color: var(--text1, #18191c); transition: opacity 0.2s; width: 170px;
        `;

        const style = document.createElement('style');
        style.textContent = `
            .bcp-header { padding: 8px 10px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--line_regular, #e3e8ec); background: var(--bg2, #f6f7f8); cursor: move; border-radius: 8px 8px 0 0; font-size: 12px; font-weight: bold; }
            .bcp-btn-min { cursor: pointer; padding: 2px 6px; border-radius: 4px; font-size: 10px; color: var(--text3, #9499a0); }
            .bcp-btn-min:hover { background: var(--bg3, #e3e5e7); }
            .bcp-body { padding: 10px; display: flex; flex-direction: column; gap: 8px; }
            .bcp-item { display: flex; align-items: center; justify-content: space-between; font-size: 12px; }
            .bcp-switch { position: relative; display: inline-block; width: 34px; height: 18px; cursor: pointer; }
            .bcp-switch input { opacity: 0; width: 0; height: 0; }
            .bcp-slider { position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-color: #ccc; transition: .3s; border-radius: 18px; }
            .bcp-slider:before { position: absolute; content: ""; height: 12px; width: 12px; left: 3px; bottom: 3px; background-color: white; transition: .3s; border-radius: 50%; }
            input:checked + .bcp-slider { background-color: #00aeec; }
            input:checked + .bcp-slider:before { transform: translateX(16px); }
            .bcp-badge { width: 36px; height: 36px; border-radius: 50%; background: #00aeec; color: #fff; display: flex; align-items: center; justify-content: center; cursor: move; font-size: 16px; box-shadow: 0 4px 12px rgba(0,174,236,0.3); }
        `;
        document.head.appendChild(style);

        const renderUI = () => {
            if (config.isMinimized) {
                container.style.width = 'auto';
                container.style.boxShadow = 'none';
                container.style.background = 'transparent';
                container.style.border = 'none';
                container.innerHTML = `<div class="bcp-badge" title="双击或轻点展开查成分面板">🔍</div>`;

                container.querySelector('.bcp-badge').addEventListener('click', (e) => {
                    if (container.dataset.dragging === 'true') return;
                    config.isMinimized = false;
                    GM_setValue('bili_checker_minimized', false);
                    renderUI();
                });
            } else {
                container.style.width = '170px';
                container.style.boxShadow = '0 4px 16px rgba(0,0,0,0.15)';
                container.style.background = 'var(--bg1, #ffffff)';
                container.style.border = '1px solid var(--line_regular, #e3e8ec)';
                container.innerHTML = `
                    <div class="bcp-header" id="bcp-drag-handle">
                        <span>成分助手配置</span>
                        <span class="bcp-btn-min" id="bcp-min-btn">━</span>
                    </div>
                    <div class="bcp-body">
                        <div class="bcp-item">
                            <span>评论区查成分</span>
                            <label class="bcp-switch">
                                <input type="checkbox" id="bcp-video-sw" ${config.videoEnabled ? 'checked' : ''}>
                                <span class="bcp-slider"></span>
                            </label>
                        </div>
                        <div class="bcp-item">
                            <span>直播弹幕查成分</span>
                            <label class="bcp-switch">
                                <input type="checkbox" id="bcp-live-sw" ${config.liveEnabled ? 'checked' : ''}>
                                <span class="bcp-slider"></span>
                            </label>
                        </div>
                    </div>
                `;

                container.querySelector('#bcp-video-sw').addEventListener('change', (e) => {
                    config.videoEnabled = e.target.checked;
                    GM_setValue('bili_checker_video_enabled', config.videoEnabled);
                    if (!config.videoEnabled) clearTagsAndQueue('video');
                });
                container.querySelector('#bcp-live-sw').addEventListener('change', (e) => {
                    config.liveEnabled = e.target.checked;
                    GM_setValue('bili_checker_live_enabled', config.liveEnabled);
                    if (!config.liveEnabled) clearTagsAndQueue('live');
                });
                container.querySelector('#bcp-min-btn').addEventListener('click', () => {
                    config.isMinimized = true;
                    GM_setValue('bili_checker_minimized', true);
                    renderUI();
                });
            }
            bindDragLogic();
        };

        function bindDragLogic() {
            const handle = container.querySelector('#bcp-drag-handle') || container.querySelector('.bcp-badge');
            if (!handle) return;

            let diffX = 0, diffY = 0;
            let isDragging = false;

            handle.onmousedown = (e) => {
                e.preventDefault();
                container.dataset.dragging = 'false';
                diffX = e.clientX - container.offsetLeft;
                diffY = e.clientY - container.offsetTop;
                isDragging = true;

                document.onmousemove = (moveEvent) => {
                    if (!isDragging) return;
                    container.dataset.dragging = 'true';
                    let left = moveEvent.clientX - diffX;
                    let top = moveEvent.clientY - diffY;

                    left = Math.max(0, Math.min(window.innerWidth - container.offsetWidth, left));
                    top = Math.max(0, Math.min(window.innerHeight - container.offsetHeight, top));

                    container.style.left = left + 'px';
                    container.style.top = top + 'px';
                };

                document.onmouseup = () => {
                    isDragging = false;
                    document.onmousemove = null;
                    document.onmouseup = null;
                    GM_setValue('bili_checker_pos', { top: container.style.top, left: container.style.left });
                };
            };
        }

        renderUI();
        document.body.appendChild(container);
    }

    // --- 页面环境判断与轮询初始化调度 ---
    const isLivePage = window.location.host.includes("live.bilibili.com");
    const isSpacePage = window.location.host.includes("space.bilibili.com");

    // 从空间页URL提取UID
    function getSpaceUid() {
        const match = window.location.pathname.match(/^\/(\d+)/);
        return match ? match[1] : null;
    }

    // --- 个人空间页扫描：在等级标签后注入成分标签 ---
    function scanSpacePage() {
        if (document.hidden) return;

        const levelEl = document.querySelector('a.level');
        if (!levelEl) return;

        const uid = getSpaceUid();
        if (!uid) return;

        // 创建/复用等级标签后的持久化标签容器
        let tagWrapper = levelEl.nextElementSibling;
        if (!tagWrapper || !tagWrapper.classList.contains('my-tag-wrapper')) {
            tagWrapper = document.createElement('span');
            tagWrapper.className = 'my-tag-wrapper';
            tagWrapper.style.cssText = 'display: inline; vertical-align: middle;';
            levelEl.after(tagWrapper);
        }

        applyTags(uid, tagWrapper);
    }

    setTimeout(createControlPanel, 1000);

    if (isLivePage) {
        const liveTimer = setInterval(() => {
            if (document.querySelector("#chat-items")) {
                clearInterval(liveTimer);
                setInterval(scanLiveChat, 300);
            }
        }, 500);
    } else if (isSpacePage) {
        // 空间页面：等 .level 元素出现后开始轮询
        const spaceTimer = setInterval(() => {
            const levelEl = document.querySelector('a.level');
            if (levelEl) {
                clearInterval(spaceTimer);
                scanSpacePage(); // 立执首扫
                setInterval(scanSpacePage, 2000); // 降低频率，空间页变动少
            }
        }, 500);
    } else {
        const videoTimer = setInterval(() => {
            if (getCommentRoot()?.querySelector("#contents")) {
                clearInterval(videoTimer);
                setInterval(scanVideoComment, 1000);
            }
        }, 400);
    }

})();