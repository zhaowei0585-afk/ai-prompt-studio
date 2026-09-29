"use strict";

// Reuse the notebook's asset/shot/attempt versions; the UI works with people and single works.
const B = {id:"", draft:null, pending:null, extraDeps:[], repair:null, historyDeps:null};
const beautyModes = {daily:"日常",outfit:"穿搭",dance:"舞蹈"};
const bodyTypeFields = [
  ["body_height","身高",[["default","默认"],["petite","娇小"],["average","标准"],["tall","高挑"],["very_tall","更高挑"]]],
  ["body_shoulders","肩部",[["default","默认"],["narrow","窄肩"],["natural","自然肩"],["right_angle","直角肩"],["broad","宽肩"]]],
  ["body_chest","胸部",[["default","默认"],["small","偏小"],["medium","适中"],["large","偏大"],["extra","更大"]]],
  ["body_waist","腰部",[["default","默认"],["natural","自然腰线"],["slim","细腰"],["defined","收腰明显"],["soft","柔和腰线"]]],
  ["body_hips","臀部",[["default","默认"],["small","偏小"],["medium","适中"],["large","偏大"],["extra","更大"]]],
  ["body_legs","腿部",[["default","默认"],["balanced","匀称"],["long","长腿比例"],["straight","直腿线条"],["toned","紧致线条"]]],
  ["body_arms","手臂",[["default","默认"],["slender","纤细"],["natural","自然"],["toned","紧致"],["soft","柔和"]]]
];
const bodyOptionText = (key,value) => (bodyTypeFields.find(([id])=>id===key)?.[2].find(([id])=>id===value) || [value,value])[1];
const bodyTypeText = d => bodyTypeFields.map(([key,label])=>d[key]&&d[key]!=="default"?`${label}${bodyOptionText(key,d[key])}`:"").filter(Boolean).join("，");
const beautyWork = () => entity(B.id);
const beautyCharacters = () => entities("asset").filter(e=>version(e).content.type==="角色");
const beautyMedia = id => S.project.media.find(m=>m.id===id);
const beautyTake = (id, medium="image") => {
  const chosen=(medium==="image"?S.project.selected_images:S.project.selected)?.[id];
  return chosen ? {entity:entity(chosen.id),version:version(entity(chosen.id),chosen.revision),ref:chosen} : null;
};
function beautyReset() {
  B.id="";B.draft=null;B.pending=null;B.extraDeps=[];B.repair=null;B.historyDeps=null;
}
function beautyDraft() {
  if(!B.draft){
    const e=beautyWork(), v=version(e), c=v?.content || {};
    const character=v?.deps.find(d=>entity(d.id)?.kind==="asset" && version(entity(d.id),d.revision)?.content.type==="角色");
    B.draft={...c,title:e?.title || "",mode:c.mode || (beautyModes[S.project.project.track]?S.project.project.track:"daily"),
      character:character?`${character.id}|${character.revision}`:"",idea:c.idea || c.start || "",
      platform:c.platform || "",format:c.format || S.project.project.format || "9:16",
      duration:c.duration || Math.min(600,Number(S.project.project.duration)||5),input_media:c.input_media || [],reference_notes:c.reference_notes || "",
      image_prompt:c.image_prompt || "",video_prompt:c.video_prompt || "",bindings:c.bindings || {}};
  }
  return B.draft;
}
function beautyRead() {
  const form=$("#beauty-form");
  if(!form)return beautyDraft();
  const f=new FormData(form);
  B.draft={...beautyDraft(),...Object.fromEntries(f)};
  if($('[data-media-group="input_media"]',form))B.draft.input_media=f.getAll("input_media");
  for(const name of ["character_media_ids","character_reference_media_ids","outfit_media_ids"])
    if($(`[data-media-group="${name}"]`,form))B.draft[name]=f.getAll(name);
  if(f.has("duration"))B.draft.duration=Number(f.get("duration"));
  if($('[name="vision"]',form))B.draft.vision=f.has("vision");
  return B.draft;
}
function beautyClearVideo() {
  const d=beautyDraft();
  d.video_prompt="";delete d.video_source;d.bindings={};
  const field=$('#beauty-form [name="video_prompt"]');
  if(field)field.value="";
}
function beautyView() {
  if(S.page==="beauty-characters")return beautyCharactersView();
  if(S.page==="beauty-library")return beautyLibraryView();
  return beautyCreateView();
}
function beautyCharactersView() {
  return section("人物库","一位人物可重复用于日常、穿搭和舞蹈。先选一张清楚的参考图即可。",
    btn("＋ 新建人物","edit-asset","","primary")+btn("先写人物形象词","beauty-new-portrait"))+
    `<div class="grid">${beautyCharacters().map(e=>{
      const c=version(e).content;
      return `<article class="card"><h3>${esc(e.title)}</h3><p>${esc(c.description)}</p>
        <div class="media-grid">${(c.media_ids || []).map(beautyMedia).filter(Boolean).slice(0,1).map(m=>mediaCard(m,true)).join("")}</div>
        <div class="row">${stateBadge(e)}${badge(c.media_ids?.length?"已有参考图":"待导入参考图",c.media_ids?.length?"ok":"")}</div>
        <footer>${btn("用她创作","beauty-use-character",e.id)}${btn("编辑 / 换图","edit-asset",e.id)}</footer></article>`;
    }).join("")}</div>`+(!beautyCharacters().length?empty("建立你的人物形象","可以导入已有参考图，也可以先写形象词，到公开 AI 平台出图后再保存。"):"")+
    `<details class="history"><summary>素材库 · ${S.project.media.length} 个文件 / 参考视频抽帧</summary>
    <div class="row">${btn("导入素材","upload")}</div><div class="media-grid">${S.project.media.map(m=>mediaCard(m)).join("")}</div></details>`;
}
function beautyCharacterRef() {
  const [id,rev]=(beautyDraft().character || "").split("|"), e=entity(id);
  return {id, revision:Number(rev), entity:e, version:e?version(e,Number(rev) || e.accepted || e.head):null};
}
function bodyTypeControls(d,c) {
  return `<div class="form-grid">${bodyTypeFields.map(([key,label,options])=>select(label,key,options,d[key] ?? c[key] ?? "default")).join("")}</div>`;
}
function characterValue(d,c,key,fallback="") {
  return Object.prototype.hasOwnProperty.call(d,key)?d[key]:(c[key] || fallback);
}
function defaultCharacterPrompt(d,c={},picked={}) {
  const title=characterValue(d,c,"character_title",picked.entity?.title || "新角色");
  const data={...d,character_title:title,character_description:characterValue(d,c,"character_description",c.description || ""),
    body_notes:characterValue(d,c,"body_notes"),face_notes:characterValue(d,c,"face_notes"),
    outfit_notes:characterValue(d,c,"outfit_notes"),outfit_strategy:characterValue(d,c,"outfit_strategy",c.outfit_media_ids?.length?"merge":"keep")};
  for(const [key] of bodyTypeFields)data[key]=d[key] ?? c[key] ?? "default";
  return [
    `为成年原创虚拟女性“${title}”生成同一身份的角色三视图。`,
    "输出正面、侧面、背面，白底或干净棚拍背景，五官、发型、身材比例和服装保持一致。",
    data.character_description&&`稳定身份特征：${data.character_description}`,
    bodyTypeText(data)&&`身材 Type：${bodyTypeText(data)}`,
    data.body_notes&&`身材补充：${data.body_notes}`,
    data.face_notes&&`面部与表情：${data.face_notes}`,
    `穿搭生成方式：${{merge:"把人物三视图与穿搭参考图合成新造型",keep:"沿用当前三视图穿搭",text:"只按文字描述生成穿搭"}[data.outfit_strategy || "merge"]}`,
    data.outfit_notes&&`穿搭要求：${data.outfit_notes}`,
    (d.character_reference_media_ids || c.reference_media_ids || []).length&&"人物参考图已提供，身份和脸部以参考图为准。",
    (d.outfit_media_ids || c.outfit_media_ids || []).length&&"穿搭参考图已提供，服装版型、材质和配色以参考图为准。",
    "避免夸张透视和遮挡；三视图用于后续本地 ComfyUI 角色一致性。"
  ].filter(Boolean).join("\n");
}
function beautyCharacterView() {
  const d=beautyDraft(), picked=beautyCharacterRef(), c=picked.version?.content || {};
  const text=(key,fallback="")=>characterValue(d,c,key,fallback);
  const ids=(key,fallback=[])=>Object.prototype.hasOwnProperty.call(d,key)?d[key]:(c[key] || fallback);
  const choices=beautyCharacters().filter(accepted).map(e=>[`${e.id}|${e.accepted}`,`${e.title} · v${e.accepted}`]);
  if(d.character&&!choices.some(([id])=>id===d.character))choices.push([d.character,`${picked.entity?.title || picked.id} · v${picked.revision || "草稿"}`]);
  const viewIds=ids("character_media_ids").length?ids("character_media_ids"):(c.media_ids || []);
  const confirmed=!!(picked.entity?.accepted&&viewIds.length);
  return `<form id="beauty-form" class="card character-workspace">
    <div class="form-grid">${select("已有角色三视图","character",[["","新建角色 / 不沿用"],...choices],d.character)}
      ${field("角色名称","character_title",text("character_title",picked.entity?.title || ""),"text","","maxlength=200")}</div>
    <div class="media-grid">${viewIds.map(beautyMedia).filter(Boolean).map(m=>mediaCard(m,true)).join("")}</div>
    <div class="row">${badge(confirmed?"三视图已确认":"等待确认三视图",confirmed?"ok":"warn")}${picked.entity?stateBadge(picked.entity):""}${btn("打开共享人物库","workspace-library","asset")}</div>
    <div class="form-grid">
      <section>${area("稳定身份特征","character_description",text("character_description",c.description || ""),"脸型、发型、年龄感、气质、不可漂移的身份特征。",4)}</section>
      <section class="full"><p class="field-title">身材 Type（部位维度）</p>${bodyTypeControls(d,c)}${area("身材补充","body_notes",text("body_notes"),"比例、姿态、肩颈、腰臀、腿型等补充约束。",3)}</section>
      <section>${area("面部 / 表情微调","face_notes",text("face_notes"),"表情、眼神、妆容、脸部细节；和稳定身份冲突时以身份为准。",4)}</section>
      <section>${select("穿搭生成方式","outfit_strategy",[["merge","人物三视图 + 穿搭参考图合成"],["keep","沿用当前三视图穿搭"],["text","只按文字描述"]],text("outfit_strategy",c.outfit_media_ids?.length?"merge":"keep"))}${area("穿搭微调","outfit_notes",text("outfit_notes"),"服装版型、材质、领口、袖长、配饰；有参考图时以参考图为准。",4)}</section>
    </div>
    <details open><summary>三视图与参考素材</summary>
      <label class="field">已确认三视图 / 角色结果图</label>${mediaChecks("character_media_ids",viewIds,"image/")}
      <div class="row">${btn("导入三视图结果","beauty-upload","character_views")}${btn("导入人物参考图","beauty-upload","character_reference")}${btn("导入穿搭参考图","beauty-upload","outfit_reference")}</div>
      <label class="field">人物参考图</label>${mediaChecks("character_reference_media_ids",ids("character_reference_media_ids",c.reference_media_ids || []),"image/")}
      <label class="field">穿搭参考图</label>${mediaChecks("outfit_media_ids",ids("outfit_media_ids"),"image/")}
    </details>
    ${area("三视图生成提示词","character_prompt",text("character_prompt",c.image_prompt || defaultCharacterPrompt(d,c,picked)),"用于外部生图或后续 ComfyUI。生成后把结果导入上面的三视图结果。",7)}
    <div class="row">${btn("组合三视图提示词","beauty-character-basic")}${btn("AI 优化三视图提示词","beauty-compose","character")}<button type="button" class="future-action" disabled title="尚未连接另一台电脑的 ComfyUI">ComfyUI 生三视图（待接入）</button></div>
    <div class="row save-work">${btn("保存三视图草稿","beauty-character-save")}${btn("确认三视图并进入主题","beauty-character-current","","primary")}</div>
  </form>`;
}
function beautyCreateView() {
  const d=beautyDraft(), e=beautyWork(), image=beautyTake(B.id), video=beautyTake(B.id,"video");
  const choices=beautyCharacters().filter(accepted).map(e=>[`${e.id}|${e.accepted}`,`${e.title} · v${e.accepted}`]);
  if(d.character&&!choices.some(([id])=>id===d.character)){
    const [id,rev]=d.character.split("|");
    choices.push([d.character,`${entity(id)?.title || id} · v${rev}（历史设定）`]);
  }
  const refs=d.character?version(entity(d.character.split("|")[0]),Number(d.character.split("|")[1]))?.content.media_ids || []:[];
  const imageIds=image?.version.content.result_media || [];
  const warnings=e?(S.project.checks[e.id] || []).filter(x=>!x.startsWith("待写")):[];
  for(const [take,field,label] of [[image,"image_prompt","图片"],[video,"video_prompt","视频"]]){
    if(take && version(e,take.version.content.prompt_ref.revision)?.content[field]!==d[field])
      warnings.push(`当前${label}对应较早的提示词；新词尚未生成并验证结果`);
  }
  return section(e?e.title:"新作品","选人物与玩法 → 生成提示词 → 到平台生成并回填",
    btn("＋ 新作品","beauty-new")+btn("保存草稿","beauty-save","","primary"))+
    `<div class="beauty-progress"><span>① 人物与想法</span><span>② 图片提示词</span><span>③ 生成结果</span>${badge(video?"当前视频":image?"当前图片 · 可完成":e?"已保存草稿":"未保存",image||video?"ok":"")}</div>
    ${warnings.length?`<div class="notice warn">${esc(warnings.join("；"))}</div>`:""}
    <form id="beauty-form"><div class="beauty-layout">
      <div class="card">
        ${field("作品名称","title",d.title,"text","留空时使用一句话想法命名","maxlength=200")}
        ${select("人物","character",[["","暂不选择 / 设计新人物"],...choices],d.character)}
        <div class="media-grid">${refs.map(beautyMedia).filter(Boolean).slice(0,1).map(m=>mediaCard(m,true)).join("")}</div>
        ${select("这次做什么","mode",Object.entries(beautyModes),d.mode)}
        ${area("一句话想法","idea",d.idea,"例如：咖啡店窗边，白色毛衣，自然回眸。",3)}
        ${field("生成平台 / 模型","platform",d.platform,"text","填写你实际使用的平台；默认输出通用中文提示词")}
        <div class="form-grid">${select("画幅","format",[["9:16","9:16"],["16:9","16:9"],["1:1","1:1"],["3:4","3:4"]],d.format)}
        ${field("视频时长 / 秒（可选）","duration",d.duration,"number","","min=1 max=600 step=1")}</div>
        <details ${d.input_media.length||d.reference_notes?"open":""}><summary>可选：服装图、参考视频与补充要求</summary>
          ${mediaChecks("input_media",d.input_media)}
          ${btn("导入参考素材","beauty-upload","reference")}
          ${area("参考内容 / 时间范围","reference_notes",d.reference_notes,"参考视频请说明时间范围；没有连续动作分析时，只依据你填写的描述。",3)}
        </details>
        ${check("允许本次提示词优化发送相关图片给视觉模型","vision","yes",!!d.vision)}
        <small>默认只发送文字。勾选后，生成预览会列出实际图片；视频原文件不会发给图片模型。</small>
      </div>
      <div class="card">
        <h3>图片提示词 <span class="dirty">${S.dirty?"未保存":e?`v${e.head}`:""}</span></h3>
        ${area("可复制图片正文","image_prompt",d.image_prompt,"只复制这段到生图平台；人物图、服装图需要在平台另行上传。",8)}
        <div class="row">${btn("生成 / 优化图片词","beauty-compose","image","primary")}${btn("组合基础图片词","beauty-basic")}${btn("保存并复制图片词","beauty-copy","image")}</div>
        <p class="muted">基础图片词按你填写的内容组合，不调用模型。AI 优化会先预览，再由你发送。</p>
        ${d.mode==="dance"?'<div class="notice">舞蹈先生成全身起始图。文字只描述风格和动作意图；准确跟跳需要目标平台支持参考视频驱动。</div>':""}
        <details class="history" ${d.video_prompt?"open":""}><summary>可选：让选定图片动起来</summary>
          ${imageIds.length?`<label class="field">当前图片</label><div class="media-grid">${imageIds.slice(0,1).map(beautyMedia).filter(Boolean).map(m=>mediaCard(m,true)).join("")}</div>`:'<p>先回填并设定一张当前图片，再生成视频提示词。</p>'}
          ${area("可复制视频正文","video_prompt",d.video_prompt,"围绕实际起始图写一个动作；修改图片词会清除待用视频词，旧版本仍保留。",5)}
          <div class="row">${btn("生成视频提示词","beauty-compose","video")}${btn("保存并复制视频词","beauty-copy","video")}</div>
        </details>
        <details class="history" ${B.repair?"open":""}><summary>返修：这次只改哪里</summary>
          ${area("预期与实际差异","repair_note",d.repair_note || "","例如：保持原图的白色圆领毛衣，不要改成衬衫。",3)}
          <div class="row">${btn("修图片词","beauty-compose","image")}${btn("修视频词","beauty-compose","video")}</div>
        </details>
      </div>
    </div></form>
    ${section("生成结果","上传实际结果、记录平台和实际用词，再人工设为当前结果；只做图片也可以完成。",
      btn("回填图片","beauty-result","image","primary")+btn("回填视频 / 截图","beauty-result","video"))}
    <div class="result-drop" data-beauty-drop="result">将结果文件拖到这里，或使用上方回填按钮</div>
    <div class="grid">${entities("attempt").filter(a=>version(a).content.prompt_ref.id===B.id).slice().reverse().map(beautyResultCard).join("")}</div>
    ${e?`<details class="history"><summary>提示词历史 · ${e.versions.length} 版</summary><div class="row">${e.versions.slice().reverse().map(v=>btn(`载入 v${v.revision} 另存`,"beauty-history",String(v.revision))).join("")}</div></details>`:""}`;
}
function beautyResultCard(e) {
  const c=version(e).content, medium=c.medium || "video", selected=beautyTake(c.prompt_ref.id,medium);
  return `<article class="card"><span class="eyebrow">${medium==="image"?"图片":"视频 / 截图"} · 提示词 v${c.prompt_ref.revision}</span>
    <h3>${esc(e.title)}</h3><p>${esc(c.platform || "平台未填")} · ${esc(c.feedback || "暂无反馈")}</p>
    <div class="media-grid">${(c.result_media || []).map(beautyMedia).filter(Boolean).slice(0,1).map(m=>mediaCard(m,true)).join("")}</div>
    <div class="row">${badge({accepted:"可用",rejected:"需返修",unreviewed:"待检查"}[c.judgment],c.judgment==="accepted"?"ok":"warn")}
      ${selected?.ref.id===e.id?badge(`当前结果 v${selected.ref.revision}`,"ok"):""}</div>
    <footer>${btn("详情 / 修改","beauty-edit-result",e.id)}${btn(medium==="image"?"设为当前图片":"设为当前视频","beauty-select",e.id)}${btn("据此返修","beauty-repair",e.id)}
    ${medium==="image"?btn("保存为人物","beauty-character-from",e.id):""}</footer></article>`;
}
function beautyLibraryView() {
  const works=entities("shot"), recipes=entities("recipe");
  return section("作品","每条作品独立选择日常、穿搭或舞蹈，图片和视频的当前结果分别保留。",btn("＋ 新作品","beauty-new","","primary"))+
    `<div class="grid">${works.slice().reverse().map(e=>{
      const c=version(e).content, image=beautyTake(e.id), video=beautyTake(e.id,"video");
      const shown=video || image;
      return `<article class="card"><h3>${esc(e.title)}</h3><p>${esc(beautyModes[c.mode] || "历史作品")} · ${esc(c.platform || "平台未填")} · v${e.head}</p>
        <p class="excerpt">${esc(c.idea || c.image_prompt || c.video_prompt)}</p>
        <div class="media-grid">${(shown?.version.content.result_media || []).slice(0,1).map(beautyMedia).filter(Boolean).map(m=>mediaCard(m,true)).join("")}</div>
        <div class="row">${badge(video?"当前视频":image?"当前图片":"草稿",shown?"ok":"")}${(S.project.checks[e.id] || []).length?badge("有待复核项","warn"):""}</div>
        <footer>${btn("打开","beauty-open",e.id)}${btn("收藏为模板","beauty-favorite",e.id)}</footer></article>`;
    }).join("")}</div>`+(!works.length?empty("从一条作品开始","选一个人物、一种玩法，写一句想法。"):"")+
    section("收藏模板","保留当时的提示词和素材条件；套用时创建新作品，结果不会冒充复用成功。")+
    `<div class="grid">${recipes.map(e=>`<article class="card"><h3>${esc(e.title)}</h3><p class="excerpt">${esc(version(e).content.text || "")}</p>
      <footer>${btn("查看","beauty-view-recipe",e.id)}${version(e).content.beauty_template?btn("套用创作","beauty-use-recipe",e.id):btn("编辑","edit-recipe",e.id)}</footer></article>`).join("")}</div>
    <details class="history"><summary>历史阶段记录（兼容旧项目）</summary>${entities("stage").map(e=>`<details><summary>${esc(e.title)} · ${esc(e.episode)}</summary>${e.versions.slice().reverse().map(v=>`<details><summary>v${v.revision}</summary><pre>${esc(v.content.text || JSON.stringify(v.content,null,2))}</pre></details>`).join("")}</details>`).join("") || '<p>暂无历史阶段。</p>'}</details>`;
}
async function beautySave(setCurrent = false) {
  if(B.saving)throw new Error("作品正在保存，请稍候");
  B.saving=true;
  $$("#content button").forEach(b=>b.disabled=true);
  try{return await beautySaveVersion(setCurrent);}finally{B.saving=false;render();}
}
async function beautySaveVersion(setCurrent = false, draft = null) {
  const d=draft || beautyRead(), e=beautyWork(), old=version(e), projectId=S.project.project.id;
  if(!d.character&&!d.idea.trim()&&!d.image_prompt.trim()&&!d.video_prompt.trim())throw new Error("先确认角色三视图或填写主题");
  const [characterId,rev]=(d.character || "").split("|");
  const deps=(B.historyDeps || old?.deps || []).filter(dep=>entity(dep.id)?.kind!=="asset" && dep.id!==old?.content.video_source?.id);
  if(characterId)deps.push({id:characterId,revision:Number(rev)});
  if(d.video_source)deps.push({...d.video_source,frozen:true});
  if(B.repair)deps.push({id:B.repair.id,revision:B.repair.head,frozen:true});
  deps.push(...B.extraDeps);
  const content={...old?.content,workflow:"beauty",mode:d.mode,idea:d.idea,platform:d.platform,format:d.format,
    duration:d.duration,character_id:characterId || "",input_media:d.input_media,reference_notes:d.reference_notes,repair_note:d.repair_note || "",
    generation_route:d.generation_route || "prompt",reference_support:d.reference_support || "unknown",
    image_prompt:d.image_prompt,video_prompt:d.video_prompt,bindings:d.bindings || {}};
  delete content.video_source;
  if(d.video_source)content.video_source=d.video_source;
  if(content.generation_route==="i2v"&&content.video_prompt&&!content.video_source)
    throw new Error("图生视频路线请先选定当前首帧图");
  const title=d.title.trim() || d.idea.trim().slice(0,50) || "新作品";
  const id=e?.id || "WORK-"+crypto.randomUUID().replaceAll("-","");
  const unique=[...new Map(deps.map(dep=>[`${dep.id}|${dep.revision}`,dep])).values()];
  const saved=await api(`/api/projects/${projectId}/save`,{id,kind:"shot",title,episode:e?.episode || id,
    base_revision:e?.head || 0,content,deps:unique,meta:old?.meta || {},set_current:setCurrent,expected_accepted:e?.accepted??null});
  B.id=saved.id;
  localStorage.setItem("studio.beauty.work."+projectId,saved.id);
  S.dirty=false;B.draft={...d,title};B.extraDeps=[];B.historyDeps=null;await refresh();
  return entity(id);
}
async function beautyEnsureSaved() {
  if(!beautyWork() || S.dirty)throw new Error("请先保存并设为当前版本，再生成或回填");
  if(beautyWork().head!==beautyWork().accepted)throw new Error("草稿尚未设为当前版本");
  return beautyWork();
}
async function beautyOpen(id) {
  if(!canLeave())return;
  beautyReset();B.id=id;localStorage.setItem("studio.beauty.work."+S.project.project.id,id);
  S.dirty=false;S.page="beauty-create";P.step=0;await productionLoad();render();
}
function beautyCharacterBasic() {
  const d=beautyRead(), picked=beautyCharacterRef();
  d.character_prompt=defaultCharacterPrompt(d,picked.version?.content || {},picked);
  S.dirty=true;render();toast("已组合三视图提示词，尚未调用 AI");
}
async function beautySaveCharacter(setCurrent=false) {
  const d=beautyRead(), picked=beautyCharacterRef(), e=picked.entity, v=version(e);
  const title=(d.character_title || e?.title || "新角色").trim();
  if(!title)throw new Error("请填写角色名称");
  const content={...v?.content,type:"角色",description:d.character_description || "",image_prompt:d.character_prompt || "",
    body_notes:d.body_notes || "",face_notes:d.face_notes || "",outfit_notes:d.outfit_notes || "",
    outfit_strategy:d.outfit_strategy || "merge",
    reference_media_ids:d.character_reference_media_ids || [],outfit_media_ids:d.outfit_media_ids || [],
    media_ids:d.character_media_ids?.length?d.character_media_ids:(v?.content.media_ids || [])};
  for(const [key] of bodyTypeFields)content[key]=d[key] || "default";
  if(setCurrent&&!content.media_ids.length)throw new Error("请先导入并选择三视图结果图");
  const saved=await projectAPI("save",{id:e?.id || "CHAR-"+crypto.randomUUID().replaceAll("-",""),kind:"asset",title,
    base_revision:e?.head || 0,content,deps:v?.deps || [],set_current:setCurrent,expected_accepted:e?.accepted ?? null});
  d.character=`${saved.id}|${saved.revision}`;
  d.character_title=title;d.character_description=content.description;d.character_prompt=content.image_prompt;
  d.body_notes=content.body_notes;d.face_notes=content.face_notes;d.outfit_notes=content.outfit_notes;d.outfit_strategy=content.outfit_strategy;
  for(const [key] of bodyTypeFields)d[key]=content[key];
  d.character_reference_media_ids=content.reference_media_ids;d.outfit_media_ids=content.outfit_media_ids;d.character_media_ids=content.media_ids;
  if(setCurrent){
    await beautySaveVersion(true,d);
    toast("角色三视图已确认，进入主题前可继续微调");
  }else{
    S.dirty=false;await refresh();toast("三视图草稿已保存，尚未确认");
  }
}
function beautyBasic() {
  const d=beautyRead();
  if(!d.idea.trim())throw new Error("请先写一句话想法");
  const [id,rev]=(d.character || "").split("|"), char=version(entity(id),Number(rev))?.content;
  const character=char?`以提供的人物参考图为身份依据，保持面部特征、发型与体型。${char.description || ""}`:"一位成年原创虚拟女性，面部特征自然。";
  const mode={daily:"生活抓拍感，姿态放松，动作开始前的静态时刻。",outfit:"清楚展示服装版型、领口、袖长与配饰，服装细节以提供的参考为准。",dance:"单人全身构图，双手与双脚完整入画，预留动作空间，背景简洁。"}[d.mode];
  d.image_prompt=[character,d.idea,mode,d.reference_notes,`${d.format} 构图，自然光，真实皮肤与衣物材质，主体清晰。`].filter(Boolean).join("\n");
  beautyClearVideo();S.dirty=true;render();toast("已组合基础图片词，尚未调用 AI");
}
async function beautyCompose(target) {
  beautyRead();
  const d=beautyDraft();
  if(d.vision&&!S.boot.settings.vision_model)throw new Error("请先在模型连接中配置并测试视觉模型");
  let input,pending;
  if(target==="character"){
    const images=[...new Set([...(d.character_reference_media_ids || []),...(d.outfit_media_ids || []),...(d.character_media_ids || [])])].filter(id=>beautyMedia(id)?.mime.startsWith("image/"));
    input={stage:"B04",episode:B.id || "__character__",scope:"image",source_ids:[],context_ids:[],media_ids:d.vision?images:[],
      extra:`只生成角色三视图 image_prompt，不生成视频词。\n角色名称：${d.character_title || "新角色"}。\n稳定身份：${d.character_description || "待设计"}。\n身材 Type：${bodyTypeText(d) || "默认"}。\n身材补充：${d.body_notes || "无"}。\n面部 / 表情微调：${d.face_notes || "按用户输入自由处理"}。\n穿搭生成方式：${{merge:"把人物三视图与穿搭参考图合成新造型",keep:"沿用当前三视图穿搭",text:"只按文字描述生成穿搭"}[d.outfit_strategy || "merge"]}。\n穿搭微调：${d.outfit_notes || "按用户输入自由处理"}。\n${images.length?"已选择人物或穿搭参考图，提示词需明确这些图片需要在生成平台另行上传。":"没有参考图时按成年原创虚拟角色设计。"}\n输出目标：同一身份的正面、侧面、背面三视图，保持身材、脸、发型和服装一致。`};
    pending={project:S.project.project.id,id:B.id,revision:beautyWork()?.head || 0,input,target,vision:!!d.vision};
  }else{
    const e=await beautyEnsureSaved(), image=beautyTake(e.id);
    if(target==="video"&&d.generation_route==="i2v"&&!image)throw new Error("图生视频路线请先选定当前图片");
    const charId=d.character?.split("|")[0];
    const contextIds=[e.id];
    const char=charId?version(entity(charId),Number(d.character.split("|")[1])):null;
    const candidates=[...(char?.content.media_ids || []),...d.input_media,...(target==="video"&&image?image.version.content.result_media:[])];
    const images=[...new Set(candidates)].filter(id=>beautyMedia(id)?.mime.startsWith("image/"));
    input={stage:"B04",episode:e.id,scope:target,source_ids:[],context_ids:contextIds,
      media_ids:d.vision?images:[],extra:`只为这一条作品生成${target==="video"?"视频":"图片"}提示词。\n主题：${beautyModes[d.mode]}；平台：${d.platform || "未知，通用中文"}。\n人物实际引用版本：${d.character || "未选人物"}；设定：${char?JSON.stringify(char.content):"按想法设计成年原创人物"}。\n本次要求：${d.repair_note || "依据想法完成"}。\n${target==="video"?`生成路线：${d.generation_route || "prompt"}。目标时长 ${d.duration} 秒。\n${image?`实际当前图片记录：${JSON.stringify({ref:image.ref,content:image.version.content})}`:"直接根据主题写动作与镜头描述，无已选首帧。"}\n参考视频只依据人工标注的动作与时间范围，不声称看过连续视频。`:"仅描述静态画面，不生成视频词。"}\n${B.repair?`返修按用户描述：${version(B.repair).content.feedback || ""}\n实际用词：${version(B.repair).content.actual_prompt || ""}`:""}`};
    pending={project:S.project.project.id,id:e.id,revision:e.head,input,target,image:image?.ref,
      firstFrame:image?.version.content.result_media[0],repairNote:d.repair_note || "",vision:!!d.vision};
  }
  const built=await projectAPI("compose",input);
  B.pending={...pending,built};
  const names=built.media_ids.map(id=>beautyMedia(id)?.name).join("、");
  modal("提示词生成预览",`<div class="notice">发送 ${built.characters} 字符、${built.media_ids.length} 张图片${names?"："+esc(names):"；未发送图片时仅依据文字描述"}。不会调用生图 API。复制到外部对话平台时，相关参考图片需手工上传。</div>
    ${area("完整指令","beauty-instruction",built.prompt,"",9)}
    <details><summary>无 API：粘贴外部对话平台的结果</summary>${area("外部结果","beauty-external","","可粘贴返回的 JSON，也可只粘贴对应的提示词正文。",6)}${btn("载入外部结果","beauty-load-external")}</details>`,
    btn("复制完整指令","beauty-copy-instruction")+btn("发送给文本 / 视觉模型","beauty-generate","","primary"));
}
function beautyLoadResult(result, run) {
  const p=B.pending;
  if(!p || S.project.project.id!==p.project || (p.target!=="character"&&(B.id!==p.id || beautyWork()?.head!==p.revision || S.dirty)))
    throw new Error("作品已变化，生成记录已保留；请回到原作品重新操作");
  const key=p.target==="video"?"video_prompt":"image_prompt";
  if(typeof result[key]!=="string" || !result[key].trim())throw new Error("结果缺少 "+key+" 正文");
  const d=beautyDraft();
  if(p.target==="character"){
    d.character_prompt=result[key];d.vision=p.vision;S.dirty=true;closeModal(true);render();toast("三视图提示词已载入，生成结果后仍停留在本节点确认");
    return;
  }
  if(p.target!=="video")beautyClearVideo();
  d[key]=result[key];d.vision=p.vision;d.repair_note=p.repairNote;
  if(p.target==="video"&&p.image){d.video_source=p.image;d.bindings={first_frame:p.firstFrame};}
  if(run)B.extraDeps.push({id:run.id,revision:run.revision,frozen:true});
  S.dirty=true;closeModal(true);render();toast("提示词已载入，检查后保存或复制");
}
async function beautyGenerate() {
  const p=B.pending;
  if($('[name="beauty-instruction"]').value!==p.built.prompt)throw new Error("指令已修改，请回创作卡调整输入后重新预览");
  $("#modal-error").textContent="正在生成提示词…";
  const result=await api(`/api/projects/${p.project}/generate`,{input:p.input,preview_hash:p.built.hash});
  if(S.project?.project.id!==p.project || B.pending!==p || !$("#modal").open)return toast("生成记录已保存在原项目");
  if(result.error){
    $('[name="beauty-external"]').value=result.run.content.text || "";
    throw new Error(result.error+" 可展开外部结果查看返回草稿。");
  }
  // refresh data without repainting an open preview
  S.project=await api("/api/projects/"+p.project);
  beautyLoadResult(result.result,result.run);
}
async function beautyResultDialog(medium, id="") {
  const work=await beautyEnsureSaved(), e=entity(id), v=version(e), c=v?.content || {};
  B.result={medium,e,work};
  const prompt=version(work,c.prompt_ref?.revision || work.head);
  const images=medium==="image"?"image/":"";
  const candidates=S.project.media.filter(m=>!images || m.mime.startsWith(images));
  const character=prompt.deps.find(d=>entity(d.id)?.kind==="asset");
  const defaultInputs=[...new Set([...(prompt.content.input_media || []),...Object.values(prompt.content.bindings || {}),
    ...(character?version(entity(character.id),character.revision)?.content.media_ids || []:[])])];
  modal(medium==="image"?"回填图片":"回填视频 / 截图",
    `${field("结果名称","title",e?.title || `${work.title} · ${medium==="image"?"图片":"视频"}`)}
    ${select("实际使用的提示词版本","prompt_revision",work.versions.map(v=>[v.revision,`v${v.revision}`]),prompt.revision)}
    ${field("实际生成平台 / 模型","platform",c.platform || prompt.content.platform || "")}
    ${area("实际使用的提示词","actual_prompt",c.actual_prompt ?? prompt.content[medium+"_prompt"] ?? "","在外部平台改过词，请填写改后的版本。",4)}
    <label class="field">实际输入素材</label>${mediaChecks("input_media",c.input_media || defaultInputs)}
    ${select("结果文件","beauty_result_media",[["","请选择或导入实际结果"],...candidates.map(m=>[m.id,m.name])],c.result_media?.[0] || "")}
    ${btn("导入结果文件","beauty-upload","result")}
    ${area("预期与实际差异 / 返修意见","feedback",c.feedback || "","例如：脸正确，但衣服领口发生变化。",3)}
    ${select("判定","judgment",[["unreviewed","待检查"],["accepted","可用"],["rejected","需返修"]],c.judgment || "unreviewed")}
    ${check("我已实际检查所选结果","user_reviewed","yes",!!c.user_reviewed)}`,
    btn("取消","close")+btn("保存结果记录","beauty-save-result","","primary"),"beauty-result-form");
}
async function beautySaveResult() {
  const f=new FormData($("#beauty-result-form")), {medium,e,work}=B.result;
  const prompt_ref={id:work.id,revision:Number(f.get("prompt_revision"))};
  const id=f.get("beauty_result_media");
  if(!id)throw new Error("请先选择或导入实际结果");
  const content={medium,prompt_ref,platform:f.get("platform"),actual_prompt:f.get("actual_prompt"),
    input_media:f.getAll("input_media"),result_media:[id],feedback:f.get("feedback"),
    judgment:f.get("judgment"),user_reviewed:f.has("user_reviewed")};
  const saved=await projectAPI("save",{id:e?.id,kind:"attempt",title:f.get("title") || "生成结果",episode:work.episode,
    base_revision:e?.head || 0,content,deps:[prompt_ref]});
  B.result.e={...e,id:saved.id,head:saved.revision};
  await projectAPI("accept",{id:saved.id,revision:saved.revision,expected_accepted:e?.accepted ?? null});
  closeModal(true);await refresh();toast("结果已保存，可设为当前结果或据此返修");
}
async function beautyUpload(files,target) {
  beautyRead();
  const projectId=S.project.project.id;
  const added=[];
  for(const file of files){
    if(target==="result"&&B.result?.medium==="image"&&!file.type.startsWith("image/"))throw new Error("图片结果请选择图片文件");
    if(["character_views","character_reference","outfit_reference"].includes(target)&&!file.type.startsWith("image/"))throw new Error("角色三视图和参考图只支持图片："+file.name);
    added.push(await uploadFile(file,projectId));
  }
  if(S.project?.project.id!==projectId)return;
  S.project=await api("/api/projects/"+projectId);
  if(target==="result" && $("#beauty-result-form")){
    const select=$('[name="beauty_result_media"]');
    for(const m of added)select.add(new Option(m.name,m.id));
    select.value=added[0].id;S.modalDirty=true;
  }else{
    const key={character_views:"character_media_ids",character_reference:"character_reference_media_ids",outfit_reference:"outfit_media_ids"}[target] || "input_media";
    B.draft[key]=[...new Set([...(B.draft[key] || []),...added.map(m=>m.id)])];
    if(key==="input_media")beautyClearVideo();
    S.dirty=true;render();
  }
  toast("素材已导入");
}
Object.assign(actions,{
  "beauty-new":()=>beautyOpen(""),
  "beauty-open":beautyOpen,
  "beauty-new-portrait":async()=>{
    await beautyOpen("");
    if(B.id || S.dirty)return;
    beautyDraft().idea="设计一位成年原创虚拟女性，正面自然神态，清楚展示面部与发型，背景简洁。";
    S.dirty=true;render();
  },
  "beauty-use-character":async id=>{
    if(!accepted(entity(id)))throw new Error("先保存人物并设为当前版本");
    if(!canLeave())return;
    beautyReset();S.page="beauty-create";beautyDraft().character=`${id}|${entity(id).accepted}`;S.dirty=true;render();
  },
  "beauty-save":async()=>{await beautySave(false);toast("草稿已保存，下游仍使用原当前版本");},
  "beauty-current":async()=>{await beautySave(true);toast("已保存并设为当前版本");},
  "beauty-character-basic":beautyCharacterBasic,
  "beauty-character-save":()=>beautySaveCharacter(false),
  "beauty-character-current":()=>beautySaveCharacter(true),
  "beauty-basic":beautyBasic,
  "beauty-compose":beautyCompose,
  "beauty-generate":beautyGenerate,
  "beauty-copy-instruction":()=>copy($('[name="beauty-instruction"]').value),
  "beauty-load-external":()=>{
    let raw=$('[name="beauty-external"]').value.trim().replace(/^```(?:json)?\s*|\s*```$/g,"");
    const key=B.pending.target==="video"?"video_prompt":"image_prompt";
    beautyLoadResult(raw.startsWith("{")?JSON.parse(raw):{[key]:raw});
  },
  "beauty-copy":async medium=>{
    beautyRead();
    const text=beautyDraft()[medium+"_prompt"];
    if(!text?.trim())throw new Error("先生成或填写提示词");
    await beautyEnsureSaved();await copy(text);
  },
  "beauty-result":medium=>beautyResultDialog(medium),
  "beauty-edit-result":id=>beautyResultDialog(version(entity(id)).content.medium || "video",id),
  "beauty-save-result":beautySaveResult,
  "beauty-upload":target=>{
    B.uploadTarget=target;
    const imageOnly=["character_views","character_reference","outfit_reference"].includes(target)||target==="result"&&B.result?.medium==="image";
    $("#beauty-upload-input").accept=imageOnly?"image/png,image/jpeg,image/webp,image/gif":"image/*,video/mp4,video/webm,video/quicktime";
    $("#beauty-upload-input").multiple=target!=="result";
    $("#beauty-upload-input").click();
  },
  "beauty-select":async id=>{
    const e=entity(id),c=version(e).content;
    await projectAPI("select",{id,revision:e.head,expected:(c.medium==="image"?S.project.selected_images:S.project.selected)[c.prompt_ref.id] || null});
    beautyRead();await refresh();toast(c.medium==="image"?"图片已设为当前结果，可以完成作品或继续做视频":"视频已设为当前结果");
  },
  "beauty-repair":id=>{
    beautyRead();B.repair=entity(id);beautyDraft().repair_note=version(B.repair).content.feedback || "";
    S.dirty=true;render();toast("已带入反馈，在返修区补充要求后生成新提示词");
  },
  "beauty-history":rev=>{
    if(!canLeave())return;
    const e=beautyWork(),v=version(e,Number(rev)),char=v.deps.find(d=>entity(d.id)?.kind==="asset");
    B.draft={...beautyDraft(),...v.content,title:e.title,character:char?`${char.id}|${char.revision}`:"",repair_note:""};
    if(!v.content.video_source)delete B.draft.video_source;
    B.historyDeps=v.deps;S.dirty=true;render();
  },
  "beauty-character-from":id=>{
    const e=entity(id),v=version(e),c=v.content;
    if(c.judgment!=="accepted"||!c.user_reviewed)throw new Error("先检查图片并标为可用");
    const shot=version(entity(c.prompt_ref.id),c.prompt_ref.revision);
    B.characterOrigin={id:e.id,revision:v.revision,frozen:true};
    modal("保存为人物",`${field("人物名称","title","","text","","required maxlength=200")}
      ${area("稳定外貌特征 / 常用造型","description",shot.content.idea || "")}
      <p>使用本次检查过的图片作为人物参考，后续可更换服装与场景。</p>`,
      btn("取消","close")+btn("保存人物","beauty-save-character",id,"primary"),"beauty-character-form");
  },
  "beauty-save-character":async id=>{
    const form=$("#beauty-character-form");if(!form.reportValidity())return;
    const f=new FormData(form),v=version(entity(id));
    const saved=await projectAPI("save",{kind:"asset",title:f.get("title"),content:{type:"角色",description:f.get("description"),
      image_prompt:v.content.actual_prompt,media_ids:v.content.result_media},deps:[B.characterOrigin]});
    await projectAPI("accept",{id:saved.id,revision:1,expected_accepted:null});
    closeModal(true);await refresh();toast("已保存到人物库");
  },
  "beauty-favorite":async id=>{
    const e=entity(id),v=version(e),chosen=beautyTake(id,"video") || beautyTake(id),deps=[{id,revision:v.revision,frozen:true}];
    if(chosen)deps.push({...chosen.ref,frozen:true});
    const saved=await projectAPI("save",{kind:"recipe",title:e.title+" · 模板",
      content:{text:`${beautyModes[v.content.mode] || "人物"} / ${v.content.platform || "平台未填"}\n${chosen?"已有人工作品样本；效果以该平台和素材条件为限。":"草稿模板，尚无当前结果。"}\n${v.content.idea || ""}`,
        beauty_template:v.content},deps});
    await projectAPI("accept",{id:saved.id,revision:1,expected_accepted:null});
    await refresh();toast("已收藏，可套用为新作品");
  },
  "beauty-view-recipe":id=>{
    const e=entity(id),c=version(e).content;
    modal(e.title,`<pre>${esc(c.text || "")}</pre><pre>${esc(c.beauty_template?.image_prompt || "")}</pre><pre>${esc(c.beauty_template?.video_prompt || "")}</pre>`,btn("关闭","close"));
  },
  "beauty-use-recipe":async id=>{
    const c=version(entity(id)).content.beauty_template;
    if(!canLeave())return;
    beautyReset();S.page="beauty-create";
    B.draft={...c,title:"",character:c.character_id&&entity(c.character_id)?.accepted?`${c.character_id}|${entity(c.character_id).accepted}`:"",video_prompt:"",bindings:{},repair_note:""};
    delete B.draft.video_source;S.dirty=true;render();
  }
});
document.addEventListener("input",event=>{
  if(!event.target.closest("#beauty-form"))return;
  beautyRead();S.dirty=true;
  if(["character","mode","idea","input_media","reference_notes","format","image_prompt"].includes(event.target.name))beautyClearVideo();
  if(event.target.name==="video_prompt" && !B.draft.video_source){
    const image=beautyTake(B.id);
    if(image){B.draft.video_source=image.ref;B.draft.bindings={first_frame:image.version.content.result_media[0]};}
  }
});
document.addEventListener("change",async event=>{
  const el=event.target;
  if(el.closest("#beauty-form")){
    beautyRead();S.dirty=true;
    if(el.name==="character"){
      for(const key of ["character_title","character_description","body_notes","face_notes","outfit_notes","character_prompt","character_media_ids","character_reference_media_ids","outfit_media_ids"])delete B.draft[key];
    }
    if(["character","mode","input_media","format"].includes(el.name))beautyClearVideo();
    if(["character","mode"].includes(el.name))render();
  }
  if(el.closest("#beauty-result-form")&&el.name==="prompt_revision"){
    const prompt=version(B.result.work,Number(el.value));
    $('[name="actual_prompt"]').value=prompt.content[B.result.medium+"_prompt"] || "";
  }
  if(el.id==="beauty-upload-input"&&el.files.length){
    try{await beautyUpload([...el.files],B.uploadTarget);}catch(err){toast(err.message,true);}
    finally{el.value="";}
  }
});
document.addEventListener("dragover",event=>{
  if(event.target.closest("[data-beauty-drop]"))event.preventDefault();
});
document.addEventListener("drop",async event=>{
  if(!event.target.closest("[data-beauty-drop]"))return;
  event.preventDefault();
  const file=event.dataTransfer.files[0];if(!file)return;
  try{
    await beautyResultDialog(file.type.startsWith("image/")?"image":"video");
    await beautyUpload([file],"result");
  }catch(err){toast(err.message,true);}
});
// Both UI modules must be initialized before the first project is rendered.
