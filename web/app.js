"use strict";
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const S = {boot:null, project:null, space:localStorage.getItem("studio.space")==="beauty"?"beauty":"drama", page:"overview", stage:"M00", episode:localStorage.getItem("studio.episode") || "EP001", dirty:false, modalDirty:false, preview:null, stageDraft:null};
const dramaTitles = {overview:"行动中心",pipeline:"生产流程",inbox:"素材箱",sources:"来源素材",stages:"阶段编辑",assets:"角色与资产",shots:"镜头详情",attempts:"结果档案",recipes:"配方与发布",profiles:"工作流档案",templates:"提示词模板"};
const tracks = {drama:"AI 漫剧",daily:"人物 · 日常",outfit:"人物 · 穿搭",dance:"人物 · 舞蹈"};
const projectSpace = p => p.track === "drama" ? "drama" : "beauty";
const beautyTitles = {overview:"行动中心","beauty-create":"生产流程",inbox:"素材箱","beauty-characters":"人物库","beauty-library":"历史作品"};
const sourceKinds = {novel:"小说",comic:"漫画",joke:"段子",other:"其他"};
const trashed = (id, revision) => (S.project?.trash || []).some(t=>t.target===id&&(t.kind==="entity"||t.kind==="version"&&t.revision===revision));
const entities = kind => (S.project?.entities || []).filter(e => (!kind || e.kind === kind) && !trashed(e.id) && e.versions.some(v=>!trashed(e.id,v.revision)));
const entity = id => entities().find(e => e.id === id);
const version = (e, rev) => e?.versions.find(v => v.revision === (rev || e.head));
const accepted = e => e?.accepted ? version(e, e.accepted) : null;
const ref = (e, v = accepted(e)) => ({id:e.id, revision:v.revision});
const episodeEntities = kind => entities(kind).filter(e => !e.episode || e.episode === S.episode);
const mediaURL = id => `/api/projects/${S.project.project.id}/media/${encodeURIComponent(id)}`;
const btn = (text, action, id = "", cls = "") => `<button type="button" class="${cls}" data-action="${action}" data-id="${esc(id)}">${esc(text)}</button>`;
const iconBtn = (action, id, label) => `<button type="button" class="icon danger" data-action="${action}" data-id="${esc(id)}" title="${esc(label)}" aria-label="${esc(label)}">×</button>`;
const badge = (text, cls = "") => `<span class="badge ${cls}">${esc(text)}</span>`;
const field = (label, name, value = "", type = "text", help = "", attrs = "") => `<label class="field">${esc(label)}<input name="${esc(name)}" type="${type}" value="${esc(value)}" ${attrs}>${help ? `<small>${esc(help)}</small>` : ""}</label>`;
const area = (label, name, value = "", help = "", rows = 4) => `<label class="field">${esc(label)}<textarea name="${esc(name)}" rows="${rows}">${esc(value)}</textarea>${help ? `<small>${esc(help)}</small>` : ""}</label>`;
const select = (label, name, options, value = "") => `<label class="field">${esc(label)}<select name="${esc(name)}">${options.map(([id, title]) => `<option value="${esc(id)}" ${String(value) === String(id) ? "selected" : ""}>${esc(title)}</option>`).join("")}</select></label>`;
const check = (label, name, value, checked = false) => `<label class="check"><input type="checkbox" name="${esc(name)}" value="${esc(value)}" ${checked ? "checked" : ""}><span>${esc(label)}</span></label>`;
const empty = (title, text, actions = "") => `<div class="empty"><h2>${esc(title)}</h2><p>${esc(text)}</p><div class="row">${actions}</div></div>`;
const section = (title, text, actions = "") => `<div class="section-head"><div><h2>${esc(title)}</h2><p>${esc(text)}</p></div><div class="row">${actions}</div></div>`;
const brief = text => String(text || "").slice(0, 180);

async function api(path, data, options = {}) {
  const opts = {...options};
  if (data !== undefined) {
    opts.method = "POST";
    opts.headers = {"Content-Type":"application/json","X-Studio-Token":S.boot.token, ...opts.headers};
    opts.body = JSON.stringify(data);
  } else if (opts.method === "POST") {
    opts.headers = {"X-Studio-Token":S.boot.token, ...opts.headers};
  }
  const res = await fetch(path, opts);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || `操作失败（${res.status}）`);
  return body;
}
const projectAPI = (action, data, options) => api(`/api/projects/${S.project.project.id}/${action}`, data, options);
let toastTimer;
function toast(message, error = false) {
  const box = $("#toast");
  box.textContent = message; box.className = "show" + (error ? " error" : "");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => box.className = "", error ? 9000 : 4000);
}
async function boot(projectId) {
  S.boot = await api("/api/bootstrap");
  const requested=S.boot.projects.find(p=>p.id===projectId);
  if(requested)S.space=projectSpace(requested);
  const list=S.boot.projects.filter(p=>projectSpace(p)===S.space);
  const id = projectId || localStorage.getItem("studio.project."+S.space) || localStorage.getItem("studio.project");
  const selected = list.find(p => p.id === id) || list[0];
  const changed = S.project?.project.id !== selected?.id;
  localStorage.setItem("studio.space",S.space);
  $("#project-select").innerHTML = list.map(p => `<option value="${p.id}" ${p.id === selected?.id ? "selected" : ""}>${esc(p.name)}</option>`).join("") || '<option value="">尚未创建项目</option>';
  if (selected) {
    S.project = await api("/api/projects/" + selected.id);
    localStorage.setItem("studio.project", selected.id);
    localStorage.setItem("studio.project."+S.space,selected.id);
    if (S.project.project.track === "drama" && !["M00","M01","M02","M03","Q01","Q02"].includes(S.stage)) S.stage = "M00";
  } else {
    S.project = null;
    localStorage.removeItem("studio.project");
  }
  if(changed){
    beautyReset();
    productionReset();
    if(S.space==="beauty"&&selected){
      const previous=localStorage.getItem("studio.beauty.work."+selected.id);
      if(entity(previous)?.kind==="shot")B.id=previous;
    }
  }
  if(S.space==="beauty"&&!beautyTitles[S.page])S.page="beauty-create";
  if(S.space==="drama"&&!dramaTitles[S.page])S.page="overview";
  $("#episode").value = S.episode;
  await productionLoad();
  render();
}
async function refresh() {
  S.project = await api("/api/projects/" + S.project.project.id);
  await productionLoad();
  render();
}
function canLeave() {
  if(B.saving||P.busy){toast("正在保存或导入，请稍候");return false;}
  return !S.dirty || confirm("当前有未保存的编辑，离开会丢弃这些编辑。继续离开？");
}
function navigate(page, stage) {
  if (!canLeave()) return;
  if(S.space==="beauty"&&S.dirty){B.draft=null;B.extraDeps=[];B.historyDeps=null;}
  S.dirty = false; S.stageDraft = null; S.preview = null; S.templateDraft = undefined; S.page = page;
  P.promptDraft=null;P.voiceDraft=null;
  if (stage) S.stage = stage;
  render();
}
function render() {
  const labels = S.space === "drama" ? dramaTitles : beautyTitles;
  if(!labels[S.page])S.page=S.space==="beauty"?"beauty-create":"overview";
  const mainPages=S.space==="drama"?["overview","pipeline","inbox"]:["overview","beauty-create","inbox","beauty-library"];
  const navButton=([page,title])=>`<button data-page="${page}" class="${S.page===page?"active":""}"><em>${title}</em></button>`;
  $("#nav").innerHTML=mainPages.map(page=>navButton([page,labels[page]])).join("");
  $$('.workspace-tabs [role=tab]').forEach(b=>{
    const active=b.dataset.id===S.space;
    b.setAttribute("aria-selected",String(active));b.tabIndex=active?0:-1;
  });
  $("#workspace-panel").setAttribute("aria-labelledby","tab-"+S.space);
  $("#usage-guide").href="/guide/"+S.space;
  $("#episode-control").hidden=S.space==="beauty";
  $("#page-title").textContent = labels[S.page];
  $("#project-tools").hidden = !S.project;
  $('[data-action="delete-project"]').hidden = !S.project;
  $$("#nav button").forEach(b => {
    b.classList.toggle("active", b.dataset.page === S.page);
    const text=b.querySelector("em"); if(text) text.textContent=labels[b.dataset.page];
  });
  $("#content").innerHTML = !S.project ? welcome() : productionView() ?? (S.space==="beauty" ? beautyView() : ({
    overview:overviewView, sources:sourcesView, stages:stagesView, assets:assetsView, shots:shotsView,
    attempts:attemptsView, recipes:recipesView, profiles:profilesView, templates:templatesView
  })[S.page]());
}
function welcome() {
  if(S.space==="beauty")return `<div class="hero welcome"><span class="hero-tag">AI 美女 / 一位人物，多种生活</span><h2>选一个主题，<br>做出今天的视频。</h2><p>选择人物 → 选择今日主题 → 生成视频 → 导出。<br>提示词在这里整理，媒体到常用 AI 平台生成，再回来选片。</p><div class="row">${btn("创建美女项目 →","new-project","","primary")}${btn("恢复工程","restore")}</div></div>`;
  return `<div class="hero welcome"><span class="hero-tag">AI 漫剧 / 一集六步</span><h2>把故事变成<br>可交付的漫剧片段。</h2><p>编写剧本 → 剧本分镜 → 文字生图 → 图生视频 → 人声配音 → 导出。<br>批量回填、连续判片，保留每次实际输入和当前结果。</p><div class="row">${btn("创建第一个项目 →","new-project","","primary")}${btn("打开原创示例","demo")}${btn("恢复另一台电脑的工程","restore")}</div></div>`;
}
function stageCodes() {
  if(S.project.project.track === "drama"){
    const codes=["M00","M01","M02","M03"];
    if(S.stage==="Q01"||S.stage==="Q02")codes.push(S.stage);
    return codes;
  }
  return ["B04"];
}
const stageEntity = () => entities("stage").find(e => e.id === `stage-${S.stage}-${S.episode}`);
function stateBadge(e) {
  const issues = (S.project.checks[e.id] || []).filter(x=>/版本|上游|回收站/.test(x));
  return issues.length ? badge(`${issues.length} 项待复核`, "warn") :
    e.accepted === e.head ? badge(`当前版本 v${e.accepted}`, "ok") : badge(e.accepted ? `草稿 v${e.head} · 当前仍为 v${e.accepted}` : "草稿 · 尚无当前版本","warn");
}
function dramaOverview(p, shots, attempts, chosen, stats) {
  const assets=entities("asset"), selectedAssets=assets.filter(e=>version(e).content.media_ids?.length).length;
  const imageReady=shots.filter(e=>version(e).content.image_prompt?.trim()).length;
  const phases=[
    ["01","剧本分镜","约 30 分钟","选题、剧本和 JSON 镜头一次成型","stage","M01",entity(`stage-M01-${S.episode}`)?"已有版本":"开始"],
    ["02","角色一致性","选定参考图",`统一人物与造型 · ${selectedAssets}/${assets.length} 已选图`,"goto-page","assets",assets.length?"继续":"待建立"],
    ["03","批量出图","约 20–30 分钟",`标准化图片词、ControlNet 姿态和人工选图 · ${imageReady}/${shots.length} 有图片词`,"stage","M02",shots.length?"继续":"待分镜"],
    ["04","图生视频","约 30–60 分钟",`选定分镜图转动态片段 · ${attempts.length} 次试片`,"stage","M03",attempts.length?"继续":"待出图"],
    ["05","成片复盘","剪辑后",`导出素材、发布并沉淀配方 · ${chosen.length} 镜已有当前结果`,"goto-page","recipes",chosen.length?"复盘":"待选片"]
  ];
  return `<div class="hero drama-hero"><span class="hero-tag">AI 漫剧生产线 / ${esc(p.format)}</span><h2>${esc(p.name)}</h2><p>故事转分镜，统一人物后生成图片与视频提示词。复制到公开 AI 平台生产，再回填、选片和剪辑。</p><div class="row">${btn("开始剧本分镜 →","stage","M01","primary")}${btn("导入小说 / 漫画","goto-sources")}${btn("导出生产包","handoff")}</div></div>
    <div class="stats">${stats.map(([label,n,desc]) => `<div class="stat"><span>${label}</span><strong>${n}</strong><small>${desc}</small></div>`).join("")}</div>
    ${section("本集五步生产线","每一步只产出下一步真正需要的内容；剪辑继续在你的外部工具完成。")}
    <div class="pipeline">${phases.map(([n,title,time,desc,action,id,status])=>`<article class="phase"><div class="phase-top"><span>${n}</span><small>${time}</small></div><h3>${title}</h3><p>${desc}</p><footer>${badge(status,status==="开始"||status==="继续"?"ok":"")}${btn("进入 →",action,id)}</footer></article>`).join("")}</div>
    <div class="notice"><b>每次去平台生成时：</b>复制对应镜头的提示词，并上传已选角色参考图。满意的分镜图回填为视频起始图；仅写外貌文字不能保证人物一致。</div>`;
}
function overviewView() {
  const p = S.project.project, shots = entities("shot"), attempts = entities("attempt"), chosen = Object.keys(S.project.selected);
  const tried = new Set(attempts.map(e => version(e).content.prompt_ref.id));
  let first = 0;
  for (const shot of tried) {
    const firstTake = attempts.find(e => version(e,1).content.prompt_ref.id === shot);
    if (S.project.selected[shot]?.id === firstTake?.id) first++;
  }
  const stats = [["镜头", shots.length, "按全项目统计"],["已选片", chosen.length, "已检查并设为当前结果"],
    ["首轮选中率", tried.size ? `${Math.round(first / tried.size * 100)}%` : "—", "首次尝试即设为当前结果的镜头占比"],
    ["尝试 / 可用镜头", chosen.length ? (attempts.length / chosen.length).toFixed(1) : "—", "包含失败与待检查尝试"]];
  if(p.track === "drama") return dramaOverview(p,shots,attempts,chosen,stats);
  const blockers = shots.flatMap(e => (S.project.checks[e.id] || []).slice(0,2).map(x => `${e.title}：${x}`)).slice(0,5);
  return `<div class="hero"><span class="hero-tag">${esc(tracks[p.track])} / ${esc(p.format)}</span><h2>${esc(p.name)}</h2><p>${esc(p.style || "画风尚未填写")} · 每集目标 ${esc(p.duration)} 秒。当前制作 ${esc(S.episode)}。</p><div class="row">${btn("继续创作 →","goto-stages","","primary")}${btn("导入素材","goto-sources")}${btn("恢复工程","restore")}</div></div><div class="stats">${stats.map(([label,n,desc]) => `<div class="stat"><span>${label}</span><strong>${n}</strong><small>${desc}</small></div>`).join("")}</div>${section("本集制作路径","每一步设为当前版本后，后续阶段即可引用。")}
    <div class="grid">${stageCodes().map(code => {
      const info = S.boot.stages.find(s => s[0] === code);
      const e = entities("stage").find(e => e.id === `stage-${code}-${S.episode}`);
      return `<div class="card"><div class="number">${code}</div><h3>${info[1]}</h3><p>${info[2]}</p><footer>${e ? stateBadge(e) : badge("尚未开始")}${btn("进入 →","stage",code)}</footer></div>`;
    }).join("")}</div>${section("接下来补齐","真实缺项会影响镜头交接，不影响继续写草稿。")}<div class="notice ${blockers.length ? "warn" : ""}">${esc(blockers.length ? blockers.join("\n") : shots.length ? "暂未发现镜头字段缺项。出片后仍需人工检查，再设为当前结果。" : "先导入来源素材，或从参考图、参考视频开始。另一台电脑的工作流信息可以稍后补齐。")}</div>`;
}
function sourcesView() {
  const sources = entities("source");
  const drama=S.project.project.track==="drama";
  return section(drama?"素材与选题":"来源与覆盖范围",drama?"导入小说或漫画，标明本次改编范围；题材、受众和节奏写入项目方向。":"小说按章分段；漫画按页登记；视频用时间码和关键帧校对。",btn("导入 TXT / Markdown","import-text")+btn("＋ 新增来源","edit-source","","primary")) +
    `<div class="grid">${sources.map(e => `<div class="card"><div class="row between"><h3>${esc(e.title)}</h3>${stateBadge(e)}</div><p>${esc(version(e).content.locator || "尚未标注章节 / 页格 / 时间码")}</p><p class="excerpt">${esc(brief(version(e).content.text))}</p><footer><small>${version(e).content.media_ids?.length || 0} 个素材 · v${e.head}</small><div class="row">${btn("校对 / 编辑","edit-source",e.id)}${iconBtn("delete-source",e.id,"删除来源素材")}</div></footer></div>`).join("")}</div>${!sources.length ? empty("保留故事的来处","把本次需要的章节粘贴进来，并注明范围。未选择的内容不会发送给模型。") : ""}
    ${section(drama?"参考图与生成结果":"素材库","只保存在本机。图片只有在生成预览中明确勾选，才会发送给视觉模型。")}
    <div class="upload-zone"><div><b>导入参考图、参考视频或平台生成结果</b><small>图片 / 视频 / 音频，单文件最大 256 MB。视频可手工抽取当前帧。</small></div>${btn("选择文件","upload")}</div>
    <div class="media-grid">${S.project.media.map(m=>mediaCard(m)).join("")}</div>`;
}
function mediaCard(m, compact = false) {
  const url = mediaURL(m.id);
  const preview = m.mime.startsWith("image/") ? `<img src="${url}" alt="${esc(m.name)}" loading="lazy">` :
    m.mime.startsWith("video/") ? `<video src="${url}" controls preload="metadata" aria-label="${esc(m.name)}"></video>` : `<audio src="${url}" controls preload="metadata"></audio>`;
  return `<div class="media-card">${preview}<p>${esc(m.name)}</p>${compact ? "" : `<small>${(m.size/1024/1024).toFixed(2)} MB</small><div class="row">${m.mime.startsWith("video/") ? btn("播放 / 提取关键帧","capture",m.id) : ""}<a href="${url}" download="${esc(m.name)}">下载</a></div>`}</div>`;
}
function mediaChecks(name, selected = [], mime = "") {
  const list = S.project.media.filter(m => !mime || m.mime.startsWith(mime));
  return `<div class="checks" data-media-group="${esc(name)}">${list.length ? list.map(m => check(`${m.name} · ${m.mime.split("/")[0]}`,name,m.id,selected.includes(m.id))).join("") : '<small>先导入文件，再在这里选择。</small>'}</div>`;
}
function contextChecks(kind, name, selected) {
  const list = (kind === "source" ? entities(kind) : entities().filter(e => !["source","run","template"].includes(e.kind)))
    .filter(e => e.accepted && (kind === "source" || !e.episode || e.episode === S.episode || e.kind === "stage"));
  return `<div class="checks">${list.length ? list.map(e => check(`${e.title} · ${e.episode || "全局"} · v${e.accepted}`,name,e.id,
    selected ? selected.includes(e.id) : kind !== "source" && e.kind !== "shot" && e.kind !== "attempt" && (!e.episode || e.episode === S.episode))).join("") : '<small>暂无当前记录。先保存上游内容并设为当前版本。</small>'}</div>`;
}
function stagesView() {
  const e = stageEntity(), v = version(e), draft = S.stageDraft || v?.content || {};
  const inputs = S.preview?.input || v?.meta?.input;
  const info = S.boot.stages.find(s => s[0] === S.stage);
  const upstream={M00:[],M01:["M00"],M02:["M01"],M03:["M02"],D01:[],D02:["D01"],D03:["D02"],D04:["D03"],D05:["D03","D04"],D06:["D05"],B01:[],B02:["B01"],B03:["B01"],Q01:[],Q02:[]}[S.stage] || [];
  const defaults=upstream.map(code=>`stage-${code}-${S.episode}`);
  if(["M02","M03","D04","D05","D06","B02","B03"].includes(S.stage)){
    defaults.push(...entities("asset").filter(accepted).map(e=>e.id));
    const profile=entities("profile").find(accepted);if(profile)defaults.push(profile.id);
  }
  if(["M02","M03"].includes(S.stage)) defaults.push(...episodeEntities("shot").filter(accepted).map(e=>e.id));
  const sourceDefaults=inputs?.source_ids || (["M00","M01"].includes(S.stage) ? entities("source").filter(accepted).map(e=>e.id) : []);
  const sourceMedia=sourceDefaults.flatMap(id=>accepted(entity(id))?.content.media_ids || []).filter(id=>beautyMedia(id)?.mime.startsWith("image/"));
  const mediaDefaults=inputs?.media_ids || (S.stage==="M00"&&S.boot.settings.vision_model?[...new Set(sourceMedia)].slice(0,8):[]);
  const contextBlock=S.stage==="M00"?"":`<label class="field">关联设定与上游版本</label>${contextChecks(null,"context_ids",inputs?.context_ids || defaults)}`;
  return `<div class="stage-workspace">
    <details class="card" ${S.stage==="M00"?"open":""}><summary>${S.stage==="M00"?"用来源素材生成剧本":"AI 辅助 · 来源、参考素材与生成前预览"}</summary><form id="context-form">
    ${field("章节 / 页格 / 时间范围","scope",inputs?.scope || "")}<label class="field">${S.stage==="M00"?"本次改编来源":"来源范围"}（需先设为当前版本）</label>${contextChecks("source","source_ids",sourceDefaults)}
    ${contextBlock}
    <label class="field">${S.stage==="M00"?"用于理解漫画的页面图片":"发送给视觉模型的图片"}（最多 8 张）</label>${mediaChecks("media_ids",mediaDefaults,"image/")}
    ${S.stage==="M00"&&!S.boot.settings.vision_model&&sourceMedia.length?'<div class="notice warn">漫画页不会自动发送：请先配置视觉模型，或在来源中填写人工校对的画面与对白。</div>':""}
    ${area("本次目标与补充要求","extra",inputs?.extra || "", S.stage==="M00"?"例如：60 秒竖屏漫剧，前三秒出现冲突，保留原段子的包袱。":"例如：本集 60 秒、前三秒出现冲突、只做 12 个镜头。",3)}
    ${btn(S.stage==="M00"?"生成剧本预览":"生成前预览","compose","","primary")}</form></details>
    <div class="card"><div class="row between"><div><span class="eyebrow">${S.stage} / ${esc(S.episode)}</span><h2>${info[1]}</h2></div>${e ? stateBadge(e) : badge("尚未保存")}</div>
    <p class="muted">${S.stage==="M00"?"AI 生成后仍可逐字修改；原文与剧本分开保存，便于核对改编。":"直接编写或粘贴外部 AI 的结果。"} 保存草稿保留编辑；设为当前版本后，下一步才会引用。</p>
    <label class="field">${S.stage==="M00"?"本集剧本":"阶段结果"} <span class="dirty" id="stage-dirty"></span><textarea id="stage-output" class="editor" spellcheck="false">${esc(draft.structured ? JSON.stringify(draft.structured,null,2) : draft.text || "")}</textarea></label>
    <div class="row">${btn("保存草稿","save-stage")}${btn("保存并设为当前版本","save-accept-stage","","primary")}${e&&e.head!==e.accepted?btn("设为当前版本","accept-stage"):""}${S.stage!=="M00"?btn("同步镜头与资产","import-structured"):""}</div>
    ${e ? history(e,"stage-history") : ""}${runList()}</div></div>`;
}
function history(e, action) {
  return `<details class="history"><summary>版本记录（载入历史会另存新版本）</summary>${e.versions.filter(v=>!trashed(e.id,v.revision)).slice().reverse().map(v => `<span class="version-row">${btn(`v${v.revision}${e.accepted === v.revision ? " · 当前版本" : ""} · ${v.created.slice(0,16).replace("T"," ")}`,action,`${e.id}|${v.revision}`)}${["source","stage"].includes(e.kind)&&e.accepted!==v.revision?iconBtn("delete-version",`${e.id}|${v.revision}`,`移入回收站 ${e.title} v${v.revision}`):""}</span>`).join("")}${btn("对比最近两版","diff",e.id)}</details>`;
}
function runList() {
  const runs = entities("run").filter(e => e.episode === S.episode && version(e).meta.stage === S.stage).slice(-5).reverse();
  return runs.length ? `<details class="history"><summary>模型生成记录 · 最近 ${runs.length} 次</summary>${runs.map(e => `<div class="row">${badge(version(e).content.status === "ok" ? "已生成草稿" : "失败草稿",version(e).content.status === "ok" ? "" : "warn")}${btn(e.title,"open-run",e.id)}</div>`).join("")}</details>` : "";
}
function assetsView() {
  const drama=S.project.project.track==="drama";
  return section(drama?"角色一致性":"角色与资产",drama?"在常用 AI 平台生成角色图，回填并选定参考，再用于每个分镜。":"身份、造型、场景、道具分别留档；选定真实图片后供镜头引用。",
    (drama?btn("从剧本生成资产","stage","M01"):"")+btn("＋ 新建资产","edit-asset","","primary"))+
    `<div class="grid">${entities("asset").map(e => {const c=version(e).content;const consistency=[c.lora_trigger&&`LoRA: ${c.lora_trigger}${c.lora_weight?` @ ${c.lora_weight}`:""}`,c.ip_adapter_notes&&"IP-Adapter 已记录"].filter(Boolean);return `<div class="card"><div class="number">${esc(c.type || "资产")} / ${esc(e.id)}</div><h3>${esc(e.title)}</h3><p class="excerpt">${esc(c.description)}</p><div class="row">${stateBadge(e)}${badge(c.media_ids?.length ? `已选 ${c.media_ids.length} 张参考` : "待提供参考图",c.media_ids?.length ? "ok":"warn")}${consistency.map(x=>badge(x,"ok")).join("")}</div><footer><small>${esc(c.naming_rule || `v${e.head}`)}</small>${btn("编辑 / 选图","edit-asset",e.id)}</footer></div>`;}).join("")}</div>`+
    (!entities("asset").length ? empty(drama?"先锁主角，不必一次做全剧":"建立第一位角色",drama?"在剧本分镜中同步角色草案，再为主角选择一张清楚参考图。":"也可以在拆解与选角阶段生成资产，再导入成卡片。") : "");
}
function shotsView() {
  const list = episodeEntities("shot"), drama=S.project.project.track==="drama";
  const total = list.reduce((n,e) => n + Number(version(e).content.duration),0);
  return section(`${S.episode} · ${drama?"分镜出图队列":"镜头清单"}`,drama?`${list.length} 镜 / ${total} 秒。统一角色词后批量复制图片提示词，出图后把选中的图绑定为首帧。`:`${list.length} 镜 / 目标剪辑时长合计 ${total} 秒。提示词当前版本与当前实际结果分开记录。`,
    (drama?btn("生成 / 优化出图词","stage","M02")+btn("复制全部图片词","copy-all-images"):"")+btn("＋ 添加镜头","edit-shot","","primary")) +
    list.map((e,i) => {
      const c = version(e).content, issues = S.project.checks[e.id] || [], take = S.project.selected[e.id];
      const firstFrame=!!c.bindings?.first_frame;
      return `<div class="shot-card"><div class="shot-num">${String(i+1).padStart(2,"0")}<small>${c.duration}s</small></div><div><span class="eyebrow">${esc(e.id)} · V${e.head}</span><h3>${esc(e.title)}</h3><p>${esc(c.start || "起点待补")} → ${esc(c.action || "动作待补")} → ${esc(c.end || "落点待补")}</p><p>${esc(c.camera || "构图待补")} · ${esc(c.source || "来源待补")}</p>${drama&&c.image_prompt?`<p class="prompt-preview">${esc(brief(c.image_prompt))}</p>`:""}<div class="row">${issues.length ? badge(issues.join("；"),"warn") : badge("可投产","ok")}${drama?badge(firstFrame?"已选分镜图":"待选分镜图",firstFrame?"ok":"warn"):badge(take ? "已选片" : "未选片",take ? "ok":"")}${c.controlnet?badge("ControlNet"):""}</div></div><div class="shot-actions">${btn(drama?"编辑 / 绑定图片":"编辑提示词","edit-shot",e.id)}${btn(drama?"复制图片词":"复制视频词",drama?"copy-image":"copy-video",e.id)}${drama?"":btn("回填试片","new-attempt",e.id)}</div></div>`;
    }).join("") + (!list.length ? empty(drama?"先生成 JSON 分镜":"把故事拆成可以生成的镜头",drama?"进入「剧本与分镜」，生成并同步镜头后再批量出图。":"完成分镜阶段后导入镜头，也可以直接手工创建。",drama?btn("开始剧本分镜","stage","M01","primary"):"") : "");
}
function attemptsView() {
  const list = episodeEntities("attempt").slice().reverse(), drama=S.project.project.track==="drama", shots=episodeEntities("shot");
  const queue=drama&&shots.length?`${section("待生成动态镜头","复制视频词到支持图生视频的平台，同时上传选定的分镜图。")}<div class="card table-wrap"><table><thead><tr><th>镜号</th><th>起点 → 动作 → 落点</th><th>视频提示词</th><th></th></tr></thead><tbody>${shots.map(e=>{const c=version(e).content;return `<tr><td>${esc(e.id)}</td><td>${esc(c.start)} → ${esc(c.action)} → ${esc(c.end)}</td><td>${esc(brief(c.video_prompt)||"待生成")}</td><td>${btn("复制","copy-video",e.id)} ${btn("回填","new-attempt",e.id)}</td></tr>`}).join("")}</tbody></table></div>`:"";
  return section(drama?"图生视频与选片":"保留失败，选出可用的一条",drama?"一镜一个动作；实际视频、参数和问题时间点都回填到对应提示词版本。":"只收到文字时按用户描述记录；勾选已检查并挂上实际结果后才能设为当前结果。",(drama?btn("生成视频提示词","stage","M03"):"")+btn("＋ 回填生成结果","new-attempt","","primary"))+queue+
    section("试片记录","失败结果也保留，便于只改一个变量。")+
    `<div class="grid">${list.map(e => {const c=version(e).content; const selected=S.project.selected[c.prompt_ref.id]; return `<div class="card"><div class="number">${esc(c.prompt_ref.id)} · PROMPT V${c.prompt_ref.revision}</div><h3>${esc(e.title)}</h3><div class="row">${badge({unreviewed:"待检查",accepted:"可用",rejected:"需返修"}[c.judgment],c.judgment==="accepted"?"ok":"warn")}${selected?.id === e.id ? badge(`当前结果 v${selected.revision}`,"ok") : ""}</div><p>${esc(c.feedback || "尚未填写预期与实际差异")}</p><p>${c.user_reviewed ? "由用户检查媒体" : "未检查媒体 / 用户描述"}</p><div class="media-grid">${(c.result_media || []).map(id => S.project.media.find(m=>m.id===id)).filter(Boolean).slice(0,1).map(m=>mediaCard(m,true)).join("")}</div><footer>${btn("详情 / 修改","edit-attempt",e.id)}${btn("设为当前结果","select-take",e.id)}${btn("返修 →","repair",e.id)}</footer></div>`;}).join("")}</div>`+(!list.length ? empty("从 ComfyUI 带回第一条动态片段","记录实际提示词、参考图和参数；未检查媒体时不会标为可用。") : "");
}
function profilesView() {
  return section("可选工作流档案","使用公开 AI 平台时可以跳过；只有需要 ComfyUI 槽位和参数管理时才填写。",btn("＋ 添加档案","edit-profile","","primary"))+
    `<div class="grid">${entities("profile").map(e => {const c=version(e).content;return `<div class="card"><div class="number">${esc(c.mode.toUpperCase())}</div><h3>${esc(e.title)}</h3><p>${esc(c.checkpoint || "模型版本待填")}</p><div class="row">${badge(c.verification==="verified"?"用户已实测":"未验证",c.verification==="verified"?"ok":"warn")}</div><footer><small>v${e.head} · ${c.slots?.length || 0} 个输入槽</small>${btn("编辑","edit-profile",e.id)}</footer></div>`;}).join("")}</div>`+(!entities("profile").length ? empty("先写草稿，稍后验证工作流","已有首帧、动作驱动或首尾帧工作流，都可以建立独立档案。") : "");
}
function recipesView() {
  const drama=S.project.project.track==="drama";
  const intro=drama?section("成片交付","工作台打包当前片段、提示词、镜头表和声音备注；配音、字幕与剪辑在外部完成。",btn("导出剪辑交接包","handoff","","primary"))+'<div class="notice">建议文件名：项目_集号_镜号_提示词版本_试片号。发布后只回填同一观察窗口的数据。</div>':"";
  return intro+section(drama?"成功配方":"可复用配方","成功后提炼必要输入、模型版本、参数和失败边界。",(drama?btn("AI 复盘","stage","Q02"):"")+btn("＋ 记录配方","edit-recipe","","primary"))+
    `<div class="grid">${entities("recipe").map(e => `<div class="card"><h3>${esc(e.title)}</h3><p class="excerpt">${esc(version(e).content.text)}</p><footer>${stateBadge(e)}${btn("查看 / 编辑","edit-recipe",e.id)}</footer></div>`).join("")}</div>`+
    section("发布记录","手工登记同一观察窗口的数据，并保留所用试片版本。",btn("＋ 记录作品","edit-publication"))+
    `<div class="card table-wrap"><table><thead><tr><th>作品</th><th>观察窗口</th><th>播放</th><th>完播率</th><th>关联镜头</th><th></th></tr></thead><tbody>${entities("publication").map(e => {const c=version(e).content;return `<tr><td>${esc(e.title)}</td><td>${esc(c.window || "未填")}</td><td>${esc(c.views ?? "—")}</td><td>${c.completion == null ? "—" : esc(c.completion)+"%"}</td><td>${c.takes?.length || 0}</td><td>${btn("查看","edit-publication",e.id)}</td></tr>`;}).join("") || '<tr><td colspan="6">暂无作品记录。</td></tr>'}</tbody></table></div>`;
}
function templatesView() {
  const codes=S.project.project.track==="drama"?["P00","M00","M01","M02","M03","Q01","Q02"]:
    ["P00","B01",S.project.project.track==="dance"?"B03":"B02","D04","D05","D06","Q01","Q02"];
  const code=codes.includes(S.templateCode)?S.templateCode:"P00", e = entity("template-"+code);
  S.templateCode=code;
  return section("项目提示词模板","修改只影响本项目的后续生成。每次生成保存实际指令和模板版本。")+
    `<div class="card">${select("选择阶段","template-code",codes.map(k=>[k,`${k} · ${S.boot.templates[k].title}`]),code)}
    ${area("模板正文","template-body",S.templateDraft ?? version(e)?.content.text ?? S.boot.templates[code].body,"占位符会引导模型读取本次上下文；所选来源与版本附在完整指令中。",16)}
    <div class="row">${btn("保存并设为当前版本","save-template","","primary")}${btn("载入内置模板","reset-template")}</div>${e ? history(e,"template-history") : ""}</div>`;
}

function modal(title, body, footer = "", formId = "") {
  const d = $("#modal");
  d.className="";
  S.modalDirty = false;
  d.innerHTML = `<div class="modal-head"><h2 id="modal-title">${esc(title)}</h2>${btn("×","close")}</div>${formId ? `<form id="${formId}">` : ""}<div class="modal-body"><div class="inline-error" id="modal-error"></div>${body}</div>${footer ? `<div class="modal-foot">${footer}</div>` : ""}${formId ? "</form>" : ""}`;
  if (!d.open) d.showModal();
}
function closeModal(force = false) {
  if (!force && S.modalDirty && !confirm("当前表单尚未保存，关闭会丢弃编辑。继续关闭？")) return;
  $("#modal").close(); $("#modal").replaceChildren(); S.modalDirty = false;
}
function deleteProjectDialog() {
  const p=S.project.project;
  modal("项目移入回收站",`<div class="notice">项目、版本和媒体保留至少 30 天，可从工作空间回收站恢复。只有主动永久清空项目才删除媒体。</div>${field("输入项目名称确认","confirmation","","text",p.name,"required autocomplete=off")}`,
    btn("取消","close")+btn("移入回收站","confirm-delete-project","","danger"),"delete-project-form");
}
function deleteSourceDialog(id) {
  const e=entity(id);
  modal("素材移入回收站",`<div class="notice warn">只有未被剧本、资产或镜头引用的素材才能移入回收站。素材库里的原始媒体文件不会一起删除。</div>${field("输入素材名称确认","confirmation","","text",e.title,"required autocomplete=off")}`,
    btn("取消","close")+btn("移入回收站","confirm-delete-source",id,"danger"),"delete-source-form");
}
async function deleteVersion(id) {
  const [entityId,revision]=id.split("|"), e=entity(entityId);
  if(!confirm(`将「${e.title}」v${revision} 移入回收站？当前版本和被下游引用的版本不能移入。`))return;
  await projectAPI("delete-version",{id:entityId,revision:Number(revision)});
  closeModal(true);await refresh();toast(`${e.title} v${revision} 已移入回收站`);
}
function editor(kind, id = "", initial = {}, rev) {
  const e = entity(id), v = version(e,rev), c = v?.content || initial;
  S.edit = {kind,e,v};
  let body = field("名称","title",e?.title || initial.title || "", "text", "", "required maxlength=200");
  if (kind === "source") {
    body += select("素材类型","source_type",Object.entries(sourceKinds),c.source_type || "other");
    body += field("来源位置","locator",c.locator || "", "text","例如：第 3 章 P1–P8 / 漫画第 2 页 / 视频 00:03–00:08");
    body += area("原文 / 人工校对的画面描述","text",c.text || "", "长篇请分章节存档；仅选择本次需要的章节。",8)+field("来源 / 授权备注","rights",c.rights || "");
    body += '<label class="field">关联图片 / 视频（按勾选列表顺序）</label>'+mediaChecks("media_ids",c.media_ids || []);
    body += btn(c.source_type==="comic"?"导入漫画页":"导入关联素材","upload");
    body += check("此范围已由我校对","reviewed","yes",!!c.reviewed);
  } else if (kind === "asset") {
    body += S.space==="beauty"?'<input type="hidden" name="type" value="角色">':select("类型","type",["角色","造型","场景","道具"].map(v=>[v,v]),c.type || "角色");
    body += area("稳定特征与可变状态","description",c.description || "")+area("参考图提示词","image_prompt",c.image_prompt || "");
    if(S.project.project.track==="drama") body += `<details><summary>可选：ComfyUI 与命名参数</summary><div class="form-grid">${field("LoRA 触发词","lora_trigger",c.lora_trigger || "","text","没有训练就留空")}${field("LoRA 建议权重","lora_weight",c.lora_weight || "","text","只记录实际验证值")}${field("统一素材命名","naming_rule",c.naming_rule || "","text","例如 PROJECT_CHAR_LOOK_v01")}</div>${area("IP-Adapter 参考与用法","ip_adapter_notes",c.ip_adapter_notes || "","没有实际参考图时留空，不能写成已验证。",3)}</details>`;
    body += '<label class="field">选定参考图</label>'+mediaChecks("media_ids",c.media_ids || [],"image/");
    body += btn("导入参考图","upload");
  } else if (kind === "profile") {
    body += `<div class="form-grid">${select("工作流路线","mode",[["unknown","未知 / 通用草稿"],["i2v","普通 I2V"],["first_last","首尾帧"],["animate","初代 Wan-Animate"],["animate2","Wan-Animate-2"]],c.mode || "unknown")}${field("模型 / LoRA / 工作流版本","checkpoint",c.checkpoint || "")}${select("提示词语言","language",[["zh","中文"],["en","English"]],c.language || "zh")}${select("负面提示词能力","negative_prompt",[["","未知"],["true","支持"],["false","不支持"]],c.capabilities?.negative_prompt == null ? "" : String(c.capabilities.negative_prompt))}</div>`;
    body += area("输入槽位（JSON 列表）","slots",JSON.stringify(c.slots || [],null,2),'槽位名用于挂图，例如 [{"name":"first_frame","type":"image","required":true}]；视频用 video。切换路线可填入最小槽位。',5);
    body += area("已实测的尺寸 / 帧数规则 / 参数 / 工作流文件备注","settings",c.settings || "");
    body += check("我已在 ComfyUI 实测并确认上述能力","verified","yes",c.verification === "verified");
  } else if (kind === "shot") {
    const profileRef = v?.deps.find(d => entity(d.id)?.kind === "profile");
    const assetRefs = (v?.deps || []).filter(d => entity(d.id)?.kind === "asset").map(d=>d.id);
    body += `<div class="form-grid">${field("镜号（创建后固定）","key",e?.id || initial.key || `${S.episode}-S${String(episodeEntities("shot").length+1).padStart(3,"0")}`,"text","",e?"readonly":"required pattern=[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}")}${field("目标剪辑时长 / 秒","duration",c.duration || 5,"number","","required min=0.1 max=600 step=0.1")}${field("章节 / 场次 / 时间码","source",c.source || "")}${field("景别 / 机位 / 运镜","camera",c.camera || "")}</div>`;
    body += field("起始状态","start",c.start || "")+field("主要动作","action",c.action || "")+field("结束状态","end",c.end || "");
    body += field("生成平台 / 模型（可选）","platform",c.platform || "","text","记录实际使用的平台和模型名称");
    body += `<details ${profileRef?"open":""}><summary>可选：ComfyUI 工作流</summary>`+select("工作流档案（引用当前版本）","profile",[["","公开平台 / 不绑定"],...entities("profile").filter(accepted).map(e=>[e.id,`${e.title} · v${e.accepted}`])],profileRef?.id || "")+"</details>";
    body += '<div id="shot-profile-fields"></div><label class="field">关联资产（使用当前版本）</label><div class="checks">'+entities("asset").filter(accepted).map(a=>check(`${a.title} · v${a.accepted}`,"assets",a.id,assetRefs.includes(a.id))).join("")+'</div>';
    body += area("首帧图片提示词","image_prompt",c.image_prompt || "", "主体 + 静态动作 + 场景 + 构图 + 光线画风。",5);
    if(S.project.project.track==="drama") body += '<details><summary>可选：ControlNet 建议</summary>'+area("ControlNet 姿态 / 构图建议","controlnet",c.controlnet || "","不需要时留空。",3)+"</details>";
    body += area("视频提示词","video_prompt",c.video_prompt || "", "一镜一个主要动作；挂图说明和参数放在相邻字段。",6);
    body += `<div id="negative-field">${area("负面提示词","negative_prompt",c.negative_prompt || "")}</div>`+area("后期 / 挂图补充说明","edit_notes",c.edit_notes || "");
  } else if (kind === "attempt") {
    const shots = entities("shot");
    if (!shots.length) { toast("先创建一个镜头，再回填试片",true); return; }
    const shot = c.prompt_ref?.id || initial.shot || shots[0].id;
    body += select("对应镜头","shot",shots.map(e=>[e.id,e.title]),shot);
    body += '<div id="attempt-revisions"></div>';
    body += field("生成平台 / 模型","platform",c.platform || "");
    body += area("实际使用的视频提示词","actual_prompt",c.actual_prompt || version(entity(shot),c.prompt_ref?.revision)?.content.video_prompt || "", "如果在外部平台改过词，请以实际用词为准。",4);
    body += area("实际参数 / 工作流版本","parameters",c.parameters || "", "填写实际 seed、尺寸、帧数、模型等；未知留空。",3);
    body += '<label class="field">实际输入素材</label>'+mediaChecks("input_media",c.input_media || Object.values(version(entity(shot),c.prompt_ref?.revision)?.content.bindings || {}));
    body += '<label class="field">结果视频 / 截图（先导入素材库）</label>'+mediaChecks("result_media",c.result_media || []);
    body += btn("先导入结果文件","upload")+area("预期 vs 实际 / 问题时间点","feedback",c.feedback || "", "例如 00:02 右手换成了左手；本次希望只修持物。");
    body += select("判定","judgment",[["unreviewed","待检查"],["accepted","可用"],["rejected","需返修"]],c.judgment || "unreviewed");
    body += check("我已实际检查所挂结果媒体","user_reviewed","yes",!!c.user_reviewed);
  } else if (kind === "recipe") {
    body += area("适用模型 / 必要输入 / 配方 / 已知失败边界","text",c.text || "", "可从 Q02 阶段提炼，避免把单次成功当通用规律。",9);
    body += '<label class="field">关联当前版本</label>'+contextChecks(null,"deps",(v?.deps || []).map(d=>d.id));
  } else if (kind === "publication") {
    body += `<div class="form-grid">${field("作品链接 / 平台 ID","url",c.url || "")}${field("发布时间","published_at",c.published_at || "","datetime-local")}${field("观察窗口","window",c.window || "", "text","例如：发布后 24 小时")}${field("播放量","views",c.views ?? "","number","","min=0 step=1")}${field("完播率 / %","completion",c.completion ?? "","number","","min=0 max=100 step=0.01")}${field("点赞 / 评论 / 关注等","interactions",c.interactions || "")}</div>`;
    body += area("观察与下轮假设","text",c.text || "");
    body += '<div class="notice">新作品保存当前所有已选镜头版本。编辑旧作品保留原关联，便于追溯。</div>';
  }
  if (e && v.deps.length && ["asset","shot"].includes(kind)) body += check("我已复核内容，保存时改用上游当前版本","rebase","yes");
  if (e) body += history(e,"edit-history");
  modal(e ? `编辑${{source:"来源",asset:"资产",profile:"档案",shot:"镜头",attempt:"试片",recipe:"配方",publication:"作品"}[kind]} · v${v.revision}` : "新增"+({source:"来源",asset:"资产",profile:"工作流档案",shot:"镜头",attempt:"试片",recipe:"配方",publication:"作品"}[kind]),
    body,btn("取消","close")+'<button type="submit" name="intent" value="draft">保存草稿</button><button type="submit" name="intent" value="current" class="primary">保存并设为当前版本</button>'+(e&&e.head!==e.accepted ? btn("设为当前版本","accept-record",e.id):""),"record-form");
  if (kind === "shot") updateShotProfile(c);
  if (kind === "attempt") updateAttemptRevisions(c.prompt_ref?.revision);
}
function updateShotProfile(c = S.edit?.v?.content || {}) {
  const profile = accepted(entity($('#record-form [name=profile]').value))?.content;
  const defaults = {i2v:["first_frame"],first_last:["first_frame","last_frame"],animate:["character","driving_video"],animate2:["character","driving_video"]};
  const slots = [...(profile?.slots || [])];
  for (const name of defaults[profile?.mode] || ["first_frame"]) if (!slots.some(s=>s.name===name)) slots.push({name,type:name==="driving_video"?"video":"image",required:true});
  $("#shot-profile-fields").innerHTML = slots.map(s=>select(`挂素材 · ${s.name}${s.required!==false ? "（必需）":""}`,`binding:${s.name}`,
    [["","待提供"],...S.project.media.filter(m=>m.mime.startsWith(s.type+"/")).map(m=>[m.id,m.name])],c.bindings?.[s.name] || "")).join("");
  $("#negative-field").hidden = profile?.capabilities?.negative_prompt !== true;
}
function updateAttemptRevisions(rev) {
  const e = entity($('#record-form [name=shot]').value);
  $("#attempt-revisions").innerHTML = select("当时实际使用的镜头版本","prompt_revision",e.versions.map(v=>[v.revision,`v${v.revision} · ${v.created.slice(0,16)}`]),rev || e.accepted || e.head);
}
async function saveRecord(form, setCurrent = false) {
  const f = new FormData(form), data = Object.fromEntries(f), {kind,e,v} = S.edit;
  let c={}, deps=v?.deps || [], id=e?.id, episode=e?.episode || "";
  const get = name => data[name] || "";
  if (kind === "source") c={source_type:get("source_type"),text:get("text"),locator:get("locator"),rights:get("rights"),reviewed:f.has("reviewed"),media_ids:f.getAll("media_ids")};
  if (kind === "asset") c={...v?.content,type:get("type"),description:get("description"),image_prompt:get("image_prompt"),lora_trigger:get("lora_trigger"),lora_weight:get("lora_weight"),ip_adapter_notes:get("ip_adapter_notes"),naming_rule:get("naming_rule"),media_ids:f.getAll("media_ids")};
  if (kind === "profile") c={mode:get("mode"),checkpoint:get("checkpoint"),language:get("language"),settings:get("settings"),slots:JSON.parse(get("slots") || "[]"),verification:f.has("verified")?"verified":"unverified",capabilities:{negative_prompt:get("negative_prompt")===""?null:get("negative_prompt")==="true"}};
  if (kind === "shot") {
    id = get("key"); episode = e?.episode || S.episode;
    c={...v?.content,platform:get("platform"),duration:Number(get("duration")),source:get("source"),camera:get("camera"),start:get("start"),action:get("action"),end:get("end"),image_prompt:get("image_prompt"),controlnet:get("controlnet"),video_prompt:get("video_prompt"),edit_notes:get("edit_notes"),bindings:{}};
    for (const [name,value] of f) if (name.startsWith("binding:") && value) c.bindings[name.slice(8)]=value;
    const profile = entity(get("profile"));
    if (accepted(profile)?.content.capabilities?.negative_prompt === true) c.negative_prompt=get("negative_prompt");
    deps = deps.filter(d=>!["profile","asset"].includes(entity(d.id)?.kind));
    if (profile) deps.push(ref(profile));
    deps.push(...f.getAll("assets").map(id=>ref(entity(id))));
  }
  if (kind === "attempt") {
    const shot=entity(get("shot")), prompt_ref={id:shot.id,revision:Number(get("prompt_revision"))};
    const prompt=version(shot,prompt_ref.revision);
    deps=[prompt_ref,...prompt.deps.filter(d=>entity(d.id)?.kind==="profile")];
    c={...v?.content,prompt_ref,platform:get("platform"),actual_prompt:get("actual_prompt"),parameters:get("parameters"),input_media:f.getAll("input_media"),result_media:f.getAll("result_media"),feedback:get("feedback"),judgment:get("judgment"),user_reviewed:f.has("user_reviewed")};
    episode=shot.episode;
  }
  if (kind === "recipe") {c={text:get("text")};deps=f.getAll("deps").map(id=>ref(entity(id)));}
  if (kind === "publication") c={url:get("url"),published_at:get("published_at"),window:get("window"),views:get("views")===""?null:Number(get("views")),completion:get("completion")===""?null:Number(get("completion")),interactions:get("interactions"),text:get("text"),takes:v?.content.takes || Object.values(S.project.selected)};
  if (f.has("rebase")) deps=deps.map(d=>accepted(entity(d.id))?ref(entity(d.id)):d);
  await projectAPI("save",{id,kind,title:get("title"),episode,base_revision:e?.head || 0,content:c,deps,set_current:setCurrent,expected_accepted:e?.accepted ?? null});
  closeModal(true); await refresh(); toast(setCurrent?"已保存并设为当前版本":"草稿已保存，下游继续使用原当前版本");
}
function parseResult(text) {
  let cleaned=text.trim().replace(/^```(?:json)?\s*|\s*```$/g,"");
  if (cleaned.startsWith("{")) {
    const obj=JSON.parse(cleaned);
    if (typeof obj.text!=="string") throw new Error("JSON 结果需要 text 字段");
    for (const key of ["shots","assets"]) if (obj[key]!==undefined && !Array.isArray(obj[key])) throw new Error(key+" 应为数组");
    return {text:obj.text,structured:obj};
  }
  if (!cleaned) throw new Error("请先填写阶段结果");
  return {text};
}
async function saveStage(shouldAccept = false) {
  const e=stageEntity(), c=parseResult($("#stage-output").value);
  const f=new FormData($("#context-form"));
  const input={stage:S.stage,episode:S.episode,scope:f.get("scope"),extra:f.get("extra"),source_ids:f.getAll("source_ids"),context_ids:f.getAll("context_ids"),media_ids:f.getAll("media_ids")};
  const built=S.preview?.deps?S.preview:{...await projectAPI("compose",input),input};
  await projectAPI("save",{id:`stage-${S.stage}-${S.episode}`,kind:"stage",title:S.boot.stages.find(s=>s[0]===S.stage)[1],episode:S.episode,
    base_revision:e?.head || 0,content:c,deps:built?.deps || version(e)?.deps || [],meta:{input:built?.input || version(e)?.meta?.input,preview:built},set_current:shouldAccept,expected_accepted:e?.accepted??null});
  S.dirty=false; S.stageDraft=null; await refresh(); toast(shouldAccept?"已保存并设为当前版本":"草稿已保存，尚未改变下游引用");
}
async function acceptRecord(e) {
  if (!e) throw new Error("请先保存一个版本");
  await projectAPI("accept",{id:e.id,revision:e.head,expected_accepted:e.accepted});
  await refresh(); toast("已设为当前版本，依赖它的内容会在上游变化时提示复核");
}
async function composePreview() {
  const f=new FormData($("#context-form"));
  const input={stage:S.stage,episode:S.episode,scope:f.get("scope"),extra:f.get("extra"),
    source_ids:f.getAll("source_ids"),context_ids:f.getAll("context_ids"),media_ids:f.getAll("media_ids")};
  const built=await projectAPI("compose",input);
  S.preview={...built,input};
  modal("本次发送内容",`<div class="notice">发送 ${built.characters.toLocaleString()} 字符，${built.media_ids.length} 张图片。${built.deps.some(d=>d.frozen)?"本阶段旧结果及其下游作为固定的历史参考，避免新结果依赖自身。":""}文本会发往设置中的模型服务；视频仅按选定关键帧分析。无 API 时可复制这份指令到外部对话工具。</div>${area("完整流程指令","composed",built.prompt,"",16)}`,
    btn("复制指令","copy-composed")+btn("下载指令","download-composed")+btn("发送给模型生成","generate","","primary"));
}
async function importStructured() {
  if (S.dirty) throw new Error("请先保存当前阶段并设为当前版本");
  const e=stageEntity(), v=accepted(e);
  if (!v || e.accepted!==e.head) throw new Error("请先将当前阶段设为当前版本");
  const obj=v.content.structured;
  if (!obj || (!obj.shots?.length && !obj.assets?.length)) throw new Error("需要包含 shots 或 assets 数组的结构化 JSON；可在流程指令中查看格式");
  const rows=[...(obj.assets || []).map(c=>({kind:"asset",c})),...(obj.shots || []).map(c=>({kind:"shot",c}))];
  if (rows.length>200) throw new Error("单次最多导入 200 个镜头或资产，请分批");
  const keys=new Set();
  for (const {kind,c} of rows) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/.test(c.key || "")) throw new Error("每项需要稳定的英文 / 数字 key，例如 EP001-S001");
    if (keys.has(c.key)) throw new Error("同一次导入的 key 不得重复："+c.key);
    keys.add(c.key);
    const old=entity(c.key);
    if (old && old.kind!==kind) throw new Error("ID 与不同类型记录冲突："+c.key);
    if (kind==="shot" && !(typeof c.duration==="number" && c.duration>0 && c.duration<=600)) throw new Error(c.key+" 缺少有效镜长");
    if (Object.values(c.bindings || {}).some(Boolean) || c.media_ids?.length) throw new Error("请移除 AI 填写的素材 ID，导入后由你选择实际文件");
  }
  if (!confirm(`将导入 ${rows.length} 条镜头 / 资产；已有同 ID 记录会新增草稿版本。继续？`)) return;
  let count=0;
  try {
    for (const {kind,c} of rows) {
      const old=entity(c.key);
      const content={...version(old)?.content,...c};
      if(old){
        if(kind==="shot")content.bindings=version(old).content.bindings || {};
        if(kind==="asset")content.media_ids=version(old).content.media_ids || [];
      }
      const saved=await projectAPI("save",{id:c.key,kind,title:c.title || c.key,episode:kind==="shot"?S.episode:"",base_revision:old?.head || 0,
        content,deps:[ref(e,v),...v.deps.filter(d=>["profile","asset"].includes(entity(d.id)?.kind))]});
      if(S.stage.startsWith("M"))await projectAPI("accept",{id:saved.id,revision:saved.revision,expected_accepted:old?.accepted??null});
      count++;
    }
  } finally {
    await refresh();
    const next={M01:"assets",M02:"shots",M03:"attempts"}[S.stage];
    if(next){S.page=next;render();}
    toast(S.stage.startsWith("M")?`已同步并设定 ${count} 条当前镜头 / 资产`:`已保存 ${count} / ${rows.length} 条草稿；到镜头 / 资产页面校对并设为当前版本`);
  }
}
function settingsDialog() {
  const c=S.boot.settings;
  modal("模型连接设置",`<div class="notice">支持 OpenAI 兼容的 Chat Completions API，也可连接本机模型。API Key 保存在本机用户目录，不进入工程备份。视觉模型需明确支持图片输入。</div>${field("API Base URL","base_url",c.base_url || "https://api.openai.com/v1","url","填写到 /v1，不包含 /chat/completions","required")}${field("文本模型名称","model",c.model || "","text","","required")}${field("视觉模型名称（可选）","vision_model",c.vision_model || "")}${field(c.has_key?"API Key（已保存；留空保持）":"API Key（本机免鉴权模型可留空）","api_key","","password","密钥仅发送给你填写的 API 地址","autocomplete=off")}${check("清除已保存密钥","clear_key","yes")}`,
    btn("取消","close")+'<button type="submit" class="primary">保存连接</button>',"settings-form");
}
async function uploadFile(file, projectId=S.project.project.id) {
  if (file.size>256*1024*1024) throw new Error(file.name+" 超过 256 MB");
  return api(`/api/projects/${projectId}/upload`,undefined,{method:"POST",body:file,headers:{"Content-Type":"application/octet-stream","X-Filename":encodeURIComponent(file.name)}});
}
async function copy(text) {
  await navigator.clipboard.writeText(text); toast("已复制");
}
function download(text,name,type="text/plain") {
  const url=URL.createObjectURL(new Blob([text],{type})), a=document.createElement("a");
  a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function showCapture(id) {
  const m=S.project.media.find(m=>m.id===id);
  S.capture=id;
  modal("播放视频 · 手工选择关键帧",`<div class="notice">暂停在你需要的画面，再提取当前帧。仅截图不能证明连续舞步、速度或音轨内容。</div><div class="clip-preview"><video id="capture-video" src="${mediaURL(id)}" controls preload="metadata"></video></div><p class="muted">${esc(m.name)}</p>`,btn("提取当前帧并登记时间码","capture-frame","","primary"));
}
async function captureFrame() {
  const video=$("#capture-video");
  if (video.readyState<2 || !video.videoWidth) throw new Error("请先播放或定位到一帧可见画面");
  video.pause();
  const canvas=document.createElement("canvas"), ratio=Math.min(1,1600/video.videoWidth);
  canvas.width=Math.round(video.videoWidth*ratio);canvas.height=Math.round(video.videoHeight*ratio);
  canvas.getContext("2d").drawImage(video,0,0,canvas.width,canvas.height);
  const time=video.currentTime.toFixed(3), original=S.project.media.find(m=>m.id===S.capture);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",.9));
  if (!blob) throw new Error("无法提取该编码的视频画面，请换 MP4/H.264 或上传手工截图");
  const file=await uploadFile(new File([blob],`frame-${time}s.jpg`,{type:"image/jpeg"}));
  const saved=await projectAPI("save",{kind:"source",title:`${original.name} · ${time}s`,content:{source_type:"other",locator:`${original.name} / ${time} 秒`,text:"浏览器手工抽取单帧。画面内容待人工校对；不代表已分析连续动作和音轨。",media_ids:[file.id,original.id],reviewed:false,rights:""}});
  closeModal(true);await refresh();editor("source",saved.id);toast("关键帧已保存，请校对来源描述");
}
const actions = {
  "switch-space":async space=>{
    if(!canLeave())return;
    S.space=space;S.page=space==="beauty"?"beauty-create":"overview";S.dirty=false;S.stageDraft=null;S.preview=null;
    beautyReset();await boot();
  },
  "new-project":()=>{
    if(!canLeave())return;
    modal(S.space==="beauty"?"创建 AI 美女项目":"创建 AI 漫剧项目",`${field("项目名称","name","","text","","required maxlength=120")}<input type="hidden" name="track" value="${S.space}"><div class="form-grid">${select("画幅","format",[["9:16","9:16 竖屏"],["16:9","16:9 横屏"],["1:1","1:1 方形"]],"9:16")}${field("单集 / 单条目标时长（秒）","duration",S.space==="beauty"?"5":"30","number","","required min=1 max=3600")}</div>${field("画风 / 受众 / 核心方向","style","","text","例如：二维悬疑漫剧；或自然光真人日常")}`,btn("取消","close")+'<button type="submit" class="primary">创建项目</button>',"project-form");
  },
  "demo":async()=>{const p=await api("/api/demo",{});S.page="overview";await boot(p.id);toast("示例已创建：只有原创文字草稿，没有实际出片");},
  "restore":()=>$("#restore-input").click(),
  "backup":()=>{location.href=`/api/projects/${S.project.project.id}/backup`;toast("正在打包完整工程与素材");},
  "handoff":()=>{location.href=`/api/projects/${S.project.project.id}/handoff`;toast("正在导出提示词、镜头表与已选结果；不是 ComfyUI 工作流 JSON");},
  "settings":settingsDialog,
  "delete-project":deleteProjectDialog,
  "delete-source":deleteSourceDialog,
  "delete-version":deleteVersion,
  "confirm-delete-project":async()=>{
    const name=$('#delete-project-form [name="confirmation"]').value;
    await projectAPI("delete",{confirmation:name});
    localStorage.removeItem("studio.project");localStorage.removeItem("studio.project."+S.space);closeModal(true);S.project=null;S.page="overview";beautyReset();
    await boot();toast("项目已移入回收站，可随时恢复");
  },
  "confirm-delete-source":async id=>{
    const name=$('#delete-source-form [name="confirmation"]').value;
    await projectAPI("delete-entity",{id,confirmation:name});
    closeModal(true);await refresh();toast("上游素材已移入回收站");
  },
  "close":()=>closeModal(),
  "stage":id=>navigate("stages",id),
  "goto-page":id=>navigate(id),
  "goto-stages":()=>navigate("stages"),
  "goto-sources":()=>navigate("sources"),
  "upload":()=>$("#upload-input").click(),
  "import-text":()=>$("#text-input").click(),
  "edit-source":id=>editor("source",id),
  "edit-asset":id=>editor("asset",id),
  "edit-shot":id=>editor("shot",id),
  "edit-profile":id=>editor("profile",id),
  "edit-attempt":id=>editor("attempt",id),
  "edit-recipe":id=>editor("recipe",id),
  "edit-publication":id=>editor("publication",id),
  "new-attempt":id=>editor("attempt","",{shot:id}),
  "accept-record":async id=>{if(S.modalDirty) throw new Error("先保存编辑，再将保存后的版本设为当前");await acceptRecord(entity(id));closeModal(true);},
  "accept-stage":async()=>{if(S.dirty) throw new Error("请先保存当前编辑");await acceptRecord(stageEntity());},
  "save-stage":()=>saveStage(false),
  "save-accept-stage":()=>saveStage(true),
  "compose":composePreview,
  "copy-composed":()=>copy($('[name=composed]').value),
  "download-composed":()=>download($('[name=composed]').value,`${S.stage}-${S.episode}-instruction.txt`),
  "generate":async()=>{
    if ($('[name=composed]').value!==S.preview.prompt) throw new Error("发送内容必须与预览快照一致；请在本次目标或模板中修改后重新预览");
    $("#modal-error").textContent="正在生成，通常需要数十秒；结果与失败草稿都会保存。";
    const scope = [S.project.project.id,S.stage,S.episode].join("|"), preview = S.preview;
    const res=await projectAPI("generate",{input:S.preview.input,preview_hash:S.preview.hash});
    if (scope !== [S.project.project.id,S.stage,S.episode].join("|") || !["stages","pipeline"].includes(S.page) || !$("#modal").open || !$('[name=composed]')) {
      toast("生成记录已保存在原项目阶段中，可稍后载入");
      return;
    }
    S.preview=preview;
    S.stageDraft=res.error ? {text:res.run.content.text} : {text:res.result.text,structured:res.result};
    S.dirty=true;closeModal(true);await refresh();
    toast(res.error || "生成草稿已载入；检查后保存并设为当前版本",!!res.error);
  },
  "import-structured":importStructured,
  "copy-image":id=>copy(version(entity(id)).content.image_prompt || ""),
  "copy-all-images":()=>{
    const text=episodeEntities("shot").map(e=>`## ${e.id} · ${e.title}\n${version(e).content.image_prompt || "待补图片提示词"}\n${version(e).content.controlnet?`ControlNet：${version(e).content.controlnet}\n`:""}`).join("\n");
    if(!text)throw new Error("当前集还没有镜头");
    return copy(text);
  },
  "copy-video":id=>copy(version(entity(id)).content.video_prompt || ""),
  "select-take":async id=>{
    const e=entity(id),c=version(e).content;
    await projectAPI("select",{id,revision:e.head,expected:S.project.selected[c.prompt_ref.id] || null});
    await refresh();toast("已设为当前结果；剪辑包会携带这个版本");
  },
  "repair":id=>{
    if(!canLeave())return;
    const take=entity(id),v=version(take),shot=entity(v.content.prompt_ref.id);
    S.page="stages";S.stage="Q01";S.episode=take.episode || S.episode;$("#episode").value=S.episode;
    S.dirty=false;S.stageDraft=null;S.preview={input:{source_ids:[],context_ids:[shot.id,...(take.accepted?[take.id]:[])],extra:`仅返修 ${shot.id}；实际使用提示词 v${v.content.prompt_ref.revision}。\n试片记录（${v.content.user_reviewed?"用户已检查":"仅用户描述，未检查媒体"}）：\n${JSON.stringify(v.content,null,2)}\n只提出一次最小修改，不扩大为整集重写。`}};
    render();
  },
  "stage-history":id=>{
    if(!canLeave())return;
    const [key,rev]=id.split("|"),v=version(entity(key),Number(rev));
    S.stageDraft=v.content;S.preview=v.meta.preview || {deps:v.deps,input:v.meta.input};
    S.dirty=true;render();toast("历史内容已载入，保存会形成新修订");
  },
  "edit-history":id=>{
    if(S.modalDirty&&!confirm("载入历史版本会替换当前未保存表单，继续？"))return;
    const [key,rev]=id.split("|"),e=entity(key);editor(e.kind,key,{},Number(rev));S.modalDirty=true;
  },
  "diff":id=>{
    const e=entity(id), latest=version(e), previous=e.versions.at(-2);
    if(!previous)throw new Error("只有一个版本，暂无差异可比");
    const before=JSON.stringify(previous.content,null,2).split("\n"),after=JSON.stringify(latest.content,null,2).split("\n");
    const diff=[...before.filter(x=>!after.includes(x)).map(x=>"- "+x),...after.filter(x=>!before.includes(x)).map(x=>"+ "+x)].join("\n");
    if($("#modal").open){toast("请先保存并关闭编辑表单，再查看差异");return;}
    modal(`v${previous.revision} → v${latest.revision} · 内容差异`, `<pre>${esc(diff || "正文无变化，可能更新了依赖或元数据。")}</pre><small>按文本行对比；完整依赖保存在工程版本中。</small>`);
  },
  "open-run":id=>{
    const e=entity(id),v=version(e);S.openRun=id;
    modal("模型生成记录",`<div class="notice ${v.content.error?"warn":""}">${esc(v.content.error || "生成成功，尚需人工检查并设为当前版本。")}</div><pre>${esc(v.content.text || "服务没有返回可保存的文本。")}</pre><details><summary>实际指令与输入快照</summary><pre>${esc(v.meta.prompt)}</pre></details>`,btn("载入编辑器","load-run"));
  },
  "load-run":()=>{
    if(!canLeave())return;
    const v=version(entity(S.openRun));
    S.stageDraft=v.content.status==="ok"?{text:v.content.result.text,structured:v.content.result}:{text:v.content.text};
    S.preview={deps:v.deps,prompt:v.meta.prompt,media_ids:v.meta.media_ids,hash:v.meta.input_hash};
    S.dirty=true;closeModal(true);render();
  },
  "save-template":async()=>{
    const code=$('[name=template-code]').value,e=entity("template-"+code);
    const v=await projectAPI("save",{id:"template-"+code,kind:"template",title:S.boot.templates[code].title,base_revision:e?.head||0,content:{text:$('[name=template-body]').value}});
    await projectAPI("accept",{id:v.id,revision:v.revision,expected_accepted:e?.accepted??null});
    S.dirty=false;S.templateDraft=undefined;await refresh();toast("模板新版本已保存");
  },
  "reset-template":()=>{S.templateDraft=S.boot.templates[S.templateCode||"P00"].body;S.dirty=true;render();},
  "template-history":id=>{const [key,rev]=id.split("|");S.templateDraft=version(entity(key),Number(rev)).content.text;S.dirty=true;render();},
  "capture":showCapture,
  "capture-frame":captureFrame
};
document.addEventListener("click",async event=>{
  const target=event.target.closest("[data-action],[data-page]");
  if(!target || target.disabled)return;
  if(target.dataset.page){navigate(target.dataset.page);return;}
  const action=actions[target.dataset.action];
  if(!action)return;
  target.disabled=true;
  try{await action(target.dataset.id || "");}
  catch(err){toast(err.message,true);if($("#modal").open)$("#modal-error").textContent=err.message;}
  finally{target.disabled=false;}
});
document.addEventListener("submit",async event=>{
  event.preventDefault();
  const form=event.target, f=new FormData(form), data=Object.fromEntries(f), buttons=$$("button[type=submit]",form);
  buttons.forEach(b=>b.disabled=true);
  try {
    if(form.id==="project-form"){const p=await api("/api/projects",data);closeModal(true);S.dirty=false;S.page="overview";await boot(p.id);}
    if(form.id==="settings-form"){S.boot.settings=await api("/api/settings",{...data,clear_key:f.has("clear_key")});closeModal(true);toast("连接设置已保存");}
    if(form.id==="record-form")await saveRecord(form,event.submitter?.value==="current");
  } catch(err){if($("#modal-error"))$("#modal-error").textContent=err.message;toast(err.message,true);}
  finally{buttons.forEach(b=>b.disabled=false);}
});
document.addEventListener("input",event=>{
  if(event.target.closest("#modal form")) S.modalDirty=true;
  if(event.target.id==="stage-output"){S.dirty=true;S.stageDraft={text:event.target.value};$("#stage-dirty").textContent="未保存";}
  if(event.target.name==="template-body")S.dirty=true;
});
document.addEventListener("change",async event=>{
  const el=event.target;
  try {
    if(el.id==="project-select"){if(canLeave()){S.dirty=false;S.stageDraft=null;S.preview=null;await boot(el.value);}else el.value=S.project.project.id;}
    if(el.id==="episode"){if(canLeave()){S.episode=el.value.trim() || "EP001";localStorage.setItem("studio.episode",S.episode);S.dirty=false;S.preview=null;S.stageDraft=null;productionReset();await productionLoad();render();}else el.value=S.episode;}
    if(el.closest("#record-form")&&el.name==="profile")updateShotProfile();
    if(el.closest("#record-form")&&el.name==="shot"){
      updateAttemptRevisions();
      $('#record-form [name=actual_prompt]').value=version(entity(el.value),Number($('#record-form [name=prompt_revision]').value)).content.video_prompt || "";
    }
    if(el.closest("#record-form")&&el.name==="prompt_revision")$('#record-form [name=actual_prompt]').value=version(entity($('#record-form [name=shot]').value),Number(el.value)).content.video_prompt || "";
    if(el.closest("#record-form")&&el.name==="mode"){
      const names={unknown:[],i2v:["first_frame"],first_last:["first_frame","last_frame"],animate:["character","driving_video"],animate2:["character","driving_video"]}[el.value];
      $('#record-form [name=slots]').value=JSON.stringify(names.map(name=>({name,type:name==="driving_video"?"video":"image",required:true})),null,2);
      $('#record-form [name=verified]').checked=false;
    }
    if(el.name==="template-code"){if(canLeave()){S.templateCode=el.value;S.templateDraft=undefined;S.dirty=false;render();}else el.value=S.templateCode||"P00";}
    if(el.id==="text-input"&&el.files[0]){
      const file=el.files[0];if(file.size>1024*1024)throw new Error("请将长篇拆成小于 1 MB 的章节文件");
      editor("source","",{source_type:"novel",title:file.name,text:await file.text(),locator:file.name});el.value="";
    }
    if(el.id==="upload-input"&&el.files.length){
      const files=[...el.files];let done=0;
      for(const file of files){toast(`正在导入 ${++done} / ${files.length}：${file.name}`);await uploadFile(file);}
      el.value="";
      // Keep an open take form intact; append new media choices without discarding edits.
      const oldIds=new Set(S.project.media.map(m=>m.id));
      S.project=await api("/api/projects/"+S.project.project.id);
      if($("#modal").open && $("#record-form")){
        const names=["media_ids","input_media","result_media"];
        const imageOnly=S.edit?.kind==="asset" || S.edit?.kind==="source"&&$('#record-form [name="source_type"]')?.value==="comic";
        for(const name of names){
          const group=$(`#record-form [data-media-group=${name}]`);
          if(group)for(const m of S.project.media.filter(m=>!oldIds.has(m.id) && (!imageOnly || m.mime.startsWith("image/"))))group.insertAdjacentHTML("beforeend",check(m.name,name,m.id,name==="result_media" || ["asset","source"].includes(S.edit?.kind)));
        }
      }else render();
      toast("素材已导入");
    }
    if(el.id==="restore-input"&&el.files[0]){
      toast("正在校验并恢复工程…");const p=await api("/api/restore",undefined,{method:"POST",body:el.files[0],headers:{"Content-Type":"application/zip"}});
      el.value="";S.dirty=false;S.stageDraft=null;S.preview=null;S.page="overview";await boot(p.id);toast("工程已恢复为新项目，原项目保留");
    }
  }catch(err){toast(err.message,true);}
});
$("#modal").addEventListener("cancel",event=>{event.preventDefault();closeModal();});
document.querySelector(".workspace-tabs").addEventListener("keydown",event=>{
  if(!["ArrowLeft","ArrowRight","Home","End"].includes(event.key))return;
  event.preventDefault();
  const space=event.key==="Home"?"drama":event.key==="End"?"beauty":S.space==="drama"?"beauty":"drama";
  actions["switch-space"](space).then(()=>$("#tab-"+S.space).focus()).catch(err=>toast(err.message,true));
});
window.addEventListener("beforeunload",event=>{if(S.dirty||S.modalDirty)event.preventDefault();});
