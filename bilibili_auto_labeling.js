// ==UserScript==
// @name         B站自动查成分
// @namespace    bilibili.auto.labeling
// @version      1.0
// @description  基于Shadow DOM穿透技术，异步调用接口查询动态成分。整合完整关键词列表。
// @author       TPPPP
// @match        https://*.bilibili.com/*
// @connect      api.bilibili.com
// @grant        GM_xmlhttpRequest
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    const blogApi = 'https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space?&host_mid=';
    const cache = new Map();
    const pending = new Set();

    const vtuberList = [["嘉心糖", "嘉然", "#E799B0"], ["雏草姬", "塔菲", "#FF00CC"], ["棺材板", "東雪蓮", "#C0C0C0"], ["杰尼", "七海", "#947583"], ["喵喵露", "猫雷", "#00FF00"], ["三畜", "小狗说", "#B8A6D9"], ["顶碗人", "向晚", "#9AC8E2"], ["贝极星", "贝拉", "#DB7D74"], ["奶淇琳", "乃琳", "#576690"], ["小星星", "星瞳", "#E0E0E0"], ["小孩梓", "梓", "#9900FF"]];
    const threeList = [["【 传奇 | 三相之力】", "原神&明日方舟&王者荣耀", "#FFD700"], ["【 史诗 | 二刺螈双象限】", "原神&明日方舟&!王者荣耀", "#FF0000"], ["【 史诗 | 双批齐聚】", "原神&!明日方舟&王者荣耀", "#FF0000"], ["【 史诗 | 稀有的存在】", "!原神&明日方舟&王者荣耀", "#FF0000"], ["【 稀有 | 原批】", "原神&!明日方舟&!王者荣耀", "#6600CC"], ["【 稀有 | 粥畜】", "!原神&明日方舟&!王者荣耀", "#6600CC"], ["【 稀有 | 农批】", "!原神&!明日方舟&王者荣耀", "#6600CC"]];
    const vocaloadList = [["骑士团", "初音|miku|MIKU", "#00CC99"], ["洛天依", "天依", "#33CCFF"]];
    const igameList = [["仙剑"], ["古剑"], ["逆水寒"], ["诛仙世界"], ["剑网"]];
    const cgameList = [["黑神话"], ["LOL", "英雄联盟|LOL"], ["COD", "使命召唤"]];
    const ecygameList = [["幻塔", null, "#FFCC66"], ["战双"], ["鸣潮"], ["米-零", "绝区零", "#0066FF"], ["米-崩", "崩坏|崩三", "#0066FF"], ["米-铁", "星穹铁道", "#0066FF"], ["光遇"], ["碧蓝", null, "#33CCC"], ["月球人", "FGO|冠位指定"], ["公主", "公主连结", "#CCFF99"], ["车万人", "东方project|灵梦|芙兰朵露|魔理沙"]];
    const zgameList = [["塞尔达"], ["怪猎", "怪物猎人"]];
    const ogameList = [["安慕希", "MINECRAFT|Minecraft|我的世界", "#006600"], ["传说之下", "UNDERTALE|undertale|Undertale|传说之下", "#333366"], ["SCP", null, "#330000"]];
    const otherList = [["【 隐藏 | 动态抽奖】", "抽奖", "#254680"]];
    const defaultTag = ["【 普通 |  纯良】", "#11DD77"];
    const errorTag = ["【 查询失败/无动态 】", "#999999"];

    const captor = [['Vtuber', vtuberList], ['', threeList], ['V家', vocaloadList], ['网游', igameList, "#6666FF"], ['端游', cgameList, "#6699FF"], ['二游', ecygameList, "pink"], ['主机', zgameList], ['混沌', ogameList, "#FF6600"], ['', otherList]];

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
                    finalTags.push({
                        name: groupName ? `【${groupName}|${viewName}】` : viewName,
                        color: color || groupColor || "#ff6699"
                    });
                }
            });
        });
        return finalTags.length > 0 ? finalTags : [{ name: defaultTag[0], color: defaultTag[1] }];
    }

    function getCommentRoot() { return document.querySelector("bili-comments")?.shadowRoot; }
    function getThreads() { return getCommentRoot()?.querySelectorAll("bili-comment-thread-renderer") || []; }

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
                    display: inline-flex;
                    align-items: center;
                    margin-left: 6px;
                    font-size: 11px;
                    line-height: 14px;
                    padding: 1px 4px;
                    border-radius: 3px;
                    background: rgba(0,0,0,0.04);
                    color: ${item.color};
                    border: 1px solid ${item.color}80;
                    white-space: nowrap;
                    vertical-align: middle;
                    max-width: 150px; 
                    overflow: hidden;
                    text-overflow: ellipsis;
                    user-select: none;
                    flex-shrink: 0;
                `;
                headerContainer.appendChild(span);
            });
        };

        if (cache.has(uid)) return render(cache.get(uid));
        if (pending.has(uid)) return;

        pending.add(uid);
        GM_xmlhttpRequest({
            method: "GET",
            url: blogApi + uid,
            timeout: 5000,
            onload: res => {
                pending.delete(uid);
                if (res.status === 200) {
                    try {
                        const resData = JSON.parse(res.response);
                        const textData = resData.data ? JSON.stringify(resData.data) : "";
                        const tags = getResultTags(textData);
                        cache.set(uid, tags);
                        render(tags);
                    } catch (e) {
                        cache.set(uid, [{ name: errorTag[0], color: errorTag[1] }]);
                        render(cache.get(uid));
                    }
                } else {
                    pending.delete(uid);
                    headerContainer.dataset.uid = "";
                }
            }
        });
    }

    function scan() {
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

    const timer = setInterval(() => {
        if (getCommentRoot()?.querySelector("#contents")) {
            clearInterval(timer);
            setInterval(scan, 1000);
        }
    }, 400);

})();