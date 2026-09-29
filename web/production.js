"use strict";

const P={step:0,status:null,shot:"",focus:"",medium:"image",filter:"all",index:0,compare:[],rows:[],busy:false,promptDraft:null,voiceDraft:null};
const flowLabels=()=>S.space==="drama"?["编写剧本","剧本分镜","文字生图","图生视频","人声配音","导出"]:["选择人物","选择今日主题","生成视频","导出"];
function productionReset(){Object.assign(P,{step:0,status:null,shot:"",focus:"",medium:"image",filter:"all",index:0,compare:[],rows:[],promptDraft:null,voiceDraft:null});}
async function productionLoad(){
  P.status=S.project?await projectAPI("production",S.space==="drama"?{episode:S.episode}:{work:B.id || "__new__"}):null;
}
function flowNav(){
  return `<nav class="flow-nav" aria-label="作品生产阶段">${flowLabels().map((label,i)=>`<button data-action="flow-step" data-id="${i}" aria-current="${P.step===i?"step":"false"}"><span>${P.status?.stages[i]?.ready?"✓":String(i+1).padStart(2,"0")}</span>${label}</button>`).join("")}</nav>`;
}
function versionNotice(e){
  if(!e)return '<div class="notice">尚未保存。写好后设为当前版本，再进入下一步。</div>';
  return `<div class="version-notice">${stateBadge(e)}<span>保存草稿保留编辑；设为当前版本才更新下游引用。</span>${e.accepted!==e.head?btn("设为当前版本","flow-accept",e.id):""}</div>`;
}
function flowFooter(){
  const last=P.step===flowLabels().length-1, issues=(P.status?.issues || []).filter(x=>x.step<=P.step);
  return `<div class="flow-footer"><span>${S.dirty?"有未保存编辑":issues.length?`${issues.length} 项待补齐`:"本步已就绪"} · ${flowLabels()[P.step]}</span>
    ${last?btn("检查并下载交付包","delivery-download","","primary"):btn("完成并进入"+flowLabels()[P.step+1],"flow-next","","primary")}</div>`;
}
function scriptSourcesView(){
  const sources=entities("source");
  return `<section class="card script-sources">
    ${section("剧本来源","导入或粘贴原始素材，确认范围后再由 AI 改编；未选中的内容不会发送。",
      btn("导入小说文件","import-text","","primary")+btn("粘贴小说","script-source","novel")+btn("添加漫画页","script-source","comic")+btn("粘贴段子","script-source","joke"))}
    <div class="action-queue">${sources.map(e=>{
      const c=version(e).content;
      return `<div class="queue-row"><div><h3>${esc(e.title)}</h3><p>${esc(sourceKinds[c.source_type] || "其他")} · ${esc(c.locator || "范围未标注")} · ${c.media_ids?.length || 0} 个关联文件</p><p>${esc(brief(c.text) || "尚未填写原文或画面描述")}</p></div>
        <div class="row">${stateBadge(e)}${btn("编辑","edit-source",e.id)}${e.accepted!==e.head?btn("设为当前版本","flow-accept",e.id):""}${iconBtn("delete-source",e.id,"移入回收站")}</div></div>`;
    }).join("")||'<div class="empty"><h3>先添加本集素材</h3><p>小说按章节导入；漫画按页上传并校对对白；段子直接粘贴原文。</p></div>'}</div>
  </section>`;
}
function productionView(){
  if(S.page==="overview")return actionCenter();
  if(S.page==="inbox")return section("素材箱","生成结果按镜头自动入列并排序，在候选图片或视频列表中统一筛选")+inboxView()+galleryView();
  if(S.page==="beauty-create")return beautyFlowView();
  if(S.page!=="pipeline")return null;
  let body;
  if(P.step<2){
    S.stage=["M00","M01"][P.step];
    body=(P.step===0?scriptSourcesView():"")+stagesView()+(P.step===1?`<details class="card"><summary>镜头顺序、人物与场景</summary>${shotsView()}${assetsView()}</details>`:"");
  }else if(P.step<4){
    S.stage=P.step===2?"M02":"M03";P.medium=P.step===2?"image":"video";
    body=`<details class="card"><summary>批量生成 / 粘贴${P.medium==="image"?"图片":"视频"}提示词</summary>${stagesView()}</details>`+
      promptWorkspace()+inboxView()+galleryView();
  }else body=P.step===4?voiceView():deliveryView();
  return flowNav()+body+flowFooter();
}
function actionCenter(){
  const shots=episodeEntities("shot"), list=S.space==="drama"?shots:entities("shot");
  const pending=entities().filter(e=>!["run","attempt"].includes(e.kind)&&e.accepted!==e.head);
  const unreviewed=entities("attempt").filter(e=>version(e).content.judgment==="unreviewed");
  const groups=flowLabels().map((label,i)=>({label,step:i,issues:(P.status?.issues || []).filter(x=>x.step===i)})).filter(g=>g.issues.length);
  return `<div class="hero"><span class="hero-tag">${S.space==="drama"?"一集六步":"一条视频四步"} / ${esc(S.space==="drama"?S.episode:"单作品创作")}</span><h2>${esc(S.project.project.name)}</h2><p>${flowLabels().join(" → ")}</p><div class="row">${btn("继续制作","flow-step",String(groups[0]?.step || 0),"primary")}${S.space==="beauty"?btn("＋ 新作品","beauty-new"):""}</div></div>
    <div class="stats">${[["镜头 / 作品",list.length],["待设为当前",pending.length],["待筛选",unreviewed.length],["已选视频",list.filter(e=>S.project.selected[e.id]).length]].map(([label,n])=>`<div class="stat"><span>${label}</span><strong>${n}</strong></div>`).join("")}</div>
    ${section("现在该处理什么","点击一项，直接进入需要处理的节点。",btn("打开素材箱","goto-page","inbox"))}
    <div class="action-queue">${groups.map(g=>`<article class="queue-row"><div><h3>${g.label} · ${g.issues.length} 项</h3><p>${esc(g.issues.slice(0,2).map(x=>x.message).join("；"))}</p></div>${btn("去处理","flow-step",String(g.step))}</article>`).join("")||`<article class="queue-row"><div><h3>本次交付已就绪</h3><p>已选结果、配音和版本检查通过。</p></div>${btn("导出","flow-step",String(flowLabels().length-1))}</article>`}</div>
    ${pending.length?`<details class="history"><summary>草稿尚未设为当前版本 · ${pending.length}</summary>${pending.map(e=>`<div class="queue-row"><span>${esc(e.title)} · 草稿 v${e.head} / 当前 ${e.accepted?"v"+e.accepted:"未设置"}</span>${btn("打开并检查","open-entity",e.id)}</div>`).join("")}</details>`:""}
    ${S.space==="beauty"?beautyLibraryView():""}`;
}
function productionShots(){
  const shots=S.space==="drama"?episodeEntities("shot"):entities("shot");
  return S.space==="drama"?shots.slice().sort((a,b)=>(version(a).content.order??Number.MAX_SAFE_INTEGER)-(version(b).content.order??Number.MAX_SAFE_INTEGER)||a.id.localeCompare(b.id)):shots;
}
function activeShot(){
  const list=productionShots();
  if(!list.some(e=>e.id===P.focus))P.focus=S.space==="beauty"&&B.id?B.id:list[0]?.id || "";
  return entity(P.focus);
}
function promptWorkspace(){
  const e=activeShot(),v=version(e),c=v?.content || {};
  if(!e)return empty("先完成分镜","同步分镜后，这里会显示每一镜的提示词。");
  const image=beautyTake(e.id), frame=image?.version.content.result_media[0] || c.bindings?.first_frame;
  const comfy=`<button type="button" class="future-action" data-action="comfyui-generate" data-id="${P.medium}" disabled title="尚未连接另一台电脑的 ComfyUI">${P.medium==="image"?"ComfyUI 生图":"ComfyUI 生视频"}（待接入）</button>`;
  return `<div class="production-layout"><aside class="shot-list" aria-label="镜头列表">${productionShots().map(s=>`<button data-action="flow-shot" data-id="${esc(s.id)}" class="${s.id===e.id?"active":""}">${esc(s.id)}<small>${esc(s.title)}</small></button>`).join("")}</aside>
    <article class="card">${section(e.title,`${e.id} · ${c.duration} 秒`,btn("详情与历史","edit-shot",e.id))}${versionNotice(e)}
      <form id="prompt-form">${area(P.medium==="image"?"图片提示词":"视频提示词","prompt",P.promptDraft ?? c[P.medium+"_prompt"] ?? "","到生成平台使用这一段正文。",7)}
      <div class="row">${btn("保存草稿","prompt-save")}${btn("保存并设为当前版本","prompt-current","","primary")}${btn("复制当前提示词","prompt-copy")}${comfy}</div></form></article>
    <aside class="card"><h3>${P.medium==="image"?"参考与参数":"实际首帧"}</h3>${frame&&beautyMedia(frame)?mediaCard(beautyMedia(frame),true):'<p>当前没有首帧，先完成文字生图并选定图片。</p>'}
      <p>${esc(c.platform || "公开平台 · 手动生成")}</p>${btn("人物 / 场景资产","flow-assets")}</aside></div>`;
}
function inboxView(){
  const shots=productionShots(),ready=shots.filter(accepted),used=new Set(entities("attempt").flatMap(e=>version(e).content.result_media || []));
  const available=S.project.media.filter(m=>/^(image|video)\//.test(m.mime)&&!used.has(m.id));
  const resultName=new Set(P.rows.map(row=>row.medium)).size===1?(P.rows[0]?.medium==="image"?"图片":"视频"):"结果";
  return `<section class="inbox card">
    ${section("生成结果导入","文件名包含镜号时自动关联并进入候选列表；无法识别时再手工确认。",btn("选择结果文件","inbox-upload")+btn("从已上传素材选择","inbox-existing"))}
    <div class="result-drop" data-inbox-drop>拖入一批图片或视频 · 单批最多 200 个 · 自动按镜头和候选版本排序</div>
    <small>${available.length} 个已上传文件尚未关联结果。</small>
    ${P.rows.length?`<div class="form-grid">${select("统一关联镜头 / 作品","batch-shot",[["","保留自动匹配"],...ready.map(e=>[e.id,e.id+" · "+e.title])],P.shot)}
      ${field("按时间顺序：每镜候选数","batch-count",4,"number","按文件修改时间排序，再按镜号分组。","min=1 max=200")}</div>
      <div class="row">${btn("关联到所选镜头并进入筛选","inbox-map")}${btn("按文件时间关联并进入筛选","inbox-time")}${btn("清除待关联列表","inbox-clear")}</div>
      <details><summary>统一填写实际平台、参数或修改后的提示词（可选）</summary>${field("实际平台 / 模型","batch-platform")}
        ${area("实际参数","batch-parameters","","未改参数可留空",2)}${area("实际提示词覆盖","batch-prompt","","留空则使用每行所选提示词版本的原文。",3)}</details>
      <div class="table-wrap mapping-table"><table><thead><tr><th>文件</th><th>对应镜头</th><th>实际提示词版本</th></tr></thead><tbody>${P.rows.map((row,i)=>{
        const e=entity(row.shot);
        return `<tr><td>${esc(row.name)}<small>${row.shot?"请核对匹配":"未匹配，需手选"}</small></td>
          <td><select aria-label="文件 ${i+1} 对应镜头" data-map-shot="${i}"><option value="">选择镜头</option>${shots.map(s=>`<option value="${esc(s.id)}" ${s.id===row.shot?"selected":""}>${esc(s.id+" · "+s.title)}</option>`).join("")}</select></td>
          <td><select aria-label="文件 ${i+1} 提示词版本" data-map-rev="${i}">${(e?.versions || []).filter(v=>!trashed(e.id,v.revision)).map(v=>`<option value="${v.revision}" ${v.revision===row.revision?"selected":""}>v${v.revision}${e.accepted===v.revision?" · 当前":""}</option>`).join("")}</select></td></tr>`;
      }).join("")}</tbody></table></div>
      <div class="row">${btn(`确认关联并进入候选${resultName}筛选`,"inbox-commit","","primary")}</div>`:""}
    </section>`;
}
function orderedAttempts(){
  const shots=productionShots(),order=new Map(shots.map((s,i)=>[s.id,i]));
  return shots.length?entities("attempt").filter(e=>{
    const c=version(e).content;
    return order.has(c.prompt_ref.id)&&(c.medium || "video")===P.medium;
  }).sort((a,b)=>order.get(version(a).content.prompt_ref.id)-order.get(version(b).content.prompt_ref.id)):[];
}
function galleryItems(all=orderedAttempts()){
  return all.filter(e=>{
    const c=version(e).content;
    return (!P.shot||P.shot===c.prompt_ref.id)&&(P.filter==="all"||c.judgment===P.filter);
  });
}
function galleryView(){
  const all=orderedAttempts(),numbers=new Map(),counts={};
  all.forEach(e=>{const shot=version(e).content.prompt_ref.id;numbers.set(e.id,counts[shot]=(counts[shot]||0)+1);});
  const items=galleryItems(all);P.index=Math.max(0,Math.min(P.index,items.length-1));
  const e=items[P.index],c=version(e)?.content,shot=c?entity(c.prompt_ref.id):null;
  const current=c?(P.medium==="image"?S.project.selected_images:S.project.selected)[c.prompt_ref.id]:null;
  return `<section id="gallery" class="card">${section(P.medium==="image"?"候选图片筛选":"候选视频筛选",`${items.length} 个候选 · J / K 或左右键切换 · A 设为当前 · R 返修 · X 淘汰`,btn(`并排对比 (${P.compare.length})`,"compare-open"))}
    <div class="gallery-filters">${select("结果类型","gallery-medium",[["image","图片"],["video","视频"]],P.medium)}
      ${select("镜头 / 作品","gallery-shot",[["","全部镜头"],...productionShots().map(s=>[s.id,s.id+" · "+s.title])],P.shot)}
      ${select("筛选状态","gallery-filter",[["all","全部"],["unreviewed","待筛选"],["accepted","可用"],["rejected","需返修"],["discarded","已淘汰"]],P.filter)}</div>
    ${e?`<div class="review-layout"><div class="review-media">${(c.result_media || []).map(beautyMedia).filter(Boolean).map(m=>mediaCard(m,true)).join("")}</div>
      <div class="review-controls"><span class="eyebrow">${P.index+1} / ${items.length} · ${esc(shot?.title)}</span><h3>${esc(c.prompt_ref.id)} · 候选 V${numbers.get(e.id)}</h3>
        <div class="row">${badge({accepted:"可用",rejected:"需返修",discarded:"已淘汰",unreviewed:"待筛选"}[c.judgment])}${current?.id===e.id?badge("当前结果","ok"):""}${badge(`提示词版本 v${c.prompt_ref.revision}`)}</div>
        <p>${esc(e.title)} · ${esc(c.platform || "未记录平台")}</p>
        ${c.prompt_ref.revision!==shot?.accepted?check(`我已对照当前提示词 v${shot?.accepted} 复核这个旧结果`,"review-revalidate","yes"):""}
        ${area("返修意见","review-feedback",c.feedback || "","只有返修时需要填写，其他结果可直接判断。",3)}
        <div class="row">${btn("设为当前 · A","review-accept",e.id,"primary")}${btn("需返修 · R","review-reject",e.id)}${btn("淘汰 · X","review-discard",e.id)}</div>
        <div class="row">${btn("← 上一个","review-prev")}${btn("下一个 →","review-next")}${btn("修改此镜头词","review-edit",e.id)}</div>
        <details><summary>实际用词、输入与历史</summary><pre>${esc(c.actual_prompt || "")}</pre><p>${esc(c.parameters || "参数未填")}</p>
          <p>${esc((c.input_media || []).map(id=>beautyMedia(id)?.name || id).join("、"))}</p>${btn("编辑完整记录",S.space==="beauty"?"beauty-edit-result":"edit-attempt",e.id)}${btn("胜出结果保存为配方","winner-recipe",e.id)}</details>
      </div></div>
      <div class="candidate-strip">${items.map((a,i)=>{const ac=version(a).content,m=beautyMedia(ac.result_media?.[0]);return `<div class="candidate ${i===P.index?"active":""}"><button data-action="review-at" data-id="${i}" title="${esc(a.title)}">${m?.mime.startsWith("image/")?`<img src="${mediaURL(m.id)}" loading="lazy" alt="${esc(m.name)}">`:""}${esc(`${ac.prompt_ref.id} · 候选 V${numbers.get(a.id)}`)}</button>${check("加入对比","compare-take",a.id,P.compare.includes(a.id))}</div>`;}).join("")}</div>`:empty("暂无候选结果","生成或导入结果后，会按镜头顺序显示在这里。")}
    </section>`;
}
function beautyFlowView(){
  const d=beautyDraft(),e=beautyWork(),image=beautyTake(B.id);
  let body="";
  if(P.step===0){
    const choices=beautyCharacters().filter(accepted).map(a=>[`${a.id}|${a.accepted}`,a.title]);
    if(d.character&&!choices.some(([id])=>id===d.character))choices.push([d.character,d.character+" · 历史人物版本"]);
    const [id,rev]=(d.character || "").split("|"),char=version(entity(id),Number(rev));
    body=`<form id="beauty-form" class="card">${select("当前人物","character",[["","选择一位人物"],...choices],d.character)}
      <div class="media-grid">${(char?.content.media_ids || []).map(beautyMedia).filter(Boolean).map(m=>mediaCard(m,true)).join("")}</div>
      <p>${esc(char?.content.description || "选择带参考图的人物，保持多条作品的人物身份。")}</p>
      <div class="row">${btn("新建人物","edit-asset")}${btn("打开共享人物库","workspace-library","asset")}</div></form>`;
  }else if(P.step===1){
    body=`<form id="beauty-form" class="card"><div class="theme-cards">${Object.entries(beautyModes).map(([id,title])=>btn(title,"beauty-theme",id,d.mode===id?"active":"")).join("")}</div>
      ${field("作品名称","title",d.title)}${area("今日主题","idea",d.idea,"例如：咖啡店窗边，白色毛衣，自然回眸。",4)}
      <div class="form-grid">${field("生成平台 / 模型","platform",d.platform)}${select("画幅","format",[["9:16","9:16"],["16:9","16:9"],["1:1","1:1"]],d.format)}
      ${field("时长 / 秒","duration",d.duration,"number","","min=1 max=600")}</div></form>`;
  }else if(P.step===2){
    const route=d.generation_route || "prompt";
    body=`<form id="beauty-form" class="card">${select("视频生成路线","generation_route",[["prompt","直接用提示词"],["reference","参考视频"],["i2v","需要首帧的图生视频"]],route)}
      ${route==="reference"?`${select("目标平台的参考视频能力","reference_support",[["unknown","尚未确认"],["supported","支持参考视频驱动"],["unsupported","不支持"]],d.reference_support)}
        <div class="notice ${d.reference_support==="supported"?"":"warn"}">先确认生成平台支持参考视频输入。工作台用人工标注与关键帧整理提示词。</div>`:""}
      <details ${route==="reference"?"open":""}><summary>参考视频、图片与动作标注</summary>${mediaChecks("input_media",d.input_media)}
        ${btn("导入参考素材","beauty-upload","reference")}${area("动作、节奏与时间范围","reference_notes",d.reference_notes,"记录实际观察到的时间点；可从下方视频入口提取关键帧。",3)}
        <div class="row">${d.input_media.filter(id=>beautyMedia(id)?.mime.startsWith("video/")).map(id=>btn("视频抽帧："+beautyMedia(id).name,"capture",id)).join("")}</div></details>
      ${route==="i2v"?`<details open><summary>首帧准备（在本节点完成）</summary>${image?mediaCard(beautyMedia(image.version.content.result_media[0]),true):'<p>还没有当前首帧。先写图片词，回填并选定图片。</p>'}
        ${area("图片提示词","image_prompt",d.image_prompt,"",4)}<div class="row">${btn("组合基础图片词","beauty-basic")}${btn("AI 优化图片词","beauty-compose","image")}${btn("复制当前图片词","beauty-copy","image")}${btn("查看图片候选","beauty-images")}</div></details>`:""}
      ${area("视频提示词","video_prompt",d.video_prompt,"描述一个主要动作、镜头运动和结束状态。",7)}
      <div class="row">${btn("AI 辅助视频词","beauty-compose","video")}${btn("复制当前视频词","beauty-copy","video")}</div>
      ${check("本次优化发送相关图片给视觉模型","vision","yes",!!d.vision)}${capabilityNotice()}
      <details ${B.repair?"open":""}><summary>返修要求</summary>${area("本次只改哪里","repair_note",d.repair_note || "","",3)}</details></form>`;
  }else body=deliveryView()+`<div class="row">${e?btn("主题保存为模板","beauty-favorite",e.id):""}${btn("沿用人物再做一条","beauty-another")}</div>`;
  return flowNav()+section(e?.title || "今日新作品","每步确认当前版本后继续。",btn("＋ 新作品","beauty-new"))+
    (P.step<3?versionNotice(e):"")+body+(P.step<3?`<div class="row save-work">${btn("保存草稿","beauty-save")}${btn("保存并设为当前版本","beauty-current","","primary")}</div>`:"")+
    (P.step===2?inboxView()+galleryView():"")+flowFooter();
}
function capabilityNotice(){
  const s=S.boot.settings,t=s.connection_test;
  return `<div class="notice ${s.vision_model?"":"warn"}">${s.vision_model?"视觉模型已配置："+esc(s.vision_model):"尚未配置视觉模型；可先只用文字整理提示词。"}${t?" 最近测试："+esc(t.message):" 尚未测试连接。"}${btn("模型连接","settings")}</div>`;
}
function voiceView(){
  const shot=activeShot();
  if(!shot)return empty("还没有镜头","先完成剧本分镜。");
  const voice=entities("voice").find(e=>version(e).content.shot_ref.id===shot.id),c=P.voiceDraft || version(voice)?.content || {},v=accepted(shot)||version(shot);
  return section("人声配音","在外部平台生成配音后导入；逐镜安排对白时间。无对白也要明确标记。",btn("导入音频","upload"))+
    `<div class="production-layout voice-layout"><aside class="shot-list">${productionShots().map(s=>btn(s.id+" · "+s.title,"flow-shot",s.id,s.id===shot.id?"active":"")).join("")}</aside>
    <form id="voice-form" class="card"><h3>${esc(shot.title)} · ${v.content.duration} 秒</h3>${versionNotice(voice)}
      ${check("本镜明确无配音","no_voice","yes",!!c.no_voice)}
      ${mediaChecks("voice_media",c.media_ids || [],"audio/")}
      <div class="media-grid">${(c.media_ids || []).map(beautyMedia).filter(Boolean).map(m=>mediaCard(m,true)).join("")}</div>
      <div class="form-grid">${field("角色 / 音色绑定","speaker",c.speaker || "")}${field("音色标识","voice",c.voice || "")}
      ${field("语速备注","rate",c.rate || "")}${field("情绪","emotion",c.emotion || "")}</div>
      ${area("台词时间轴（JSON）","lines",c.lineText ?? JSON.stringify(c.lines || (v.content.dialogue?[{speaker:"",text:v.content.dialogue,start:0,end:v.content.duration}]:[]),null,2),'每行包含 speaker、text、start、end；时间相对于本镜，单位为秒。导出时生成整集 SRT。',8)}
      ${btn("保存配音为当前版本","voice-save","","primary")}</form></div>`;
}
function issueRows(issues){
  return issues.map(x=>`<div class="queue-row"><span>${esc(x.message)}</span>${btn("返回"+flowLabels()[x.step],"flow-fix",`${x.step}|${x.id}`)}</div>`).join("");
}
function referenceList(){
  return `<details class="history"><summary>下一步实际引用的版本与更新时间</summary><div class="table-wrap"><table><thead><tr><th>内容</th><th>当前 / 草稿</th><th>更新于</th></tr></thead><tbody>${(P.status?.references || []).map(r=>`<tr><td>${esc(r.title)}</td><td>${r.revision?"v"+r.revision:"未设置"} / v${r.head}</td><td>${esc(r.updated)}</td></tr>`).join("")}</tbody></table></div></details>`;
}
function deliveryView(){
  const issues=P.status?.issues || [];
  return section("交付检查",S.space==="drama"?`${S.episode} · 仅导出本集当前视频、配音、SRT 字幕、提示词与素材清单。`:"仅导出当前作品的视频、可用封面、提示词与参考素材。")+
    `<div class="card"><div class="notice ${issues.length?"warn":""}">${issues.length?`${issues.length} 项需要处理，完成后可生成交付包。`:"检查通过，可以下载交付包。"}</div>${issueRows(issues)}${referenceList()}</div>`;
}
async function flowStep(step, bypass=false){
  if(!canLeave())return;
  await productionLoad();
  const blockers=(P.status?.issues || []).filter(x=>x.step<step);
  if(step>P.step&&!bypass&&blockers.length){
    modal("先完成上游再继续",issueRows(blockers)+referenceList(),btn("关闭","close"));return;
  }
  S.dirty=false;S.stageDraft=null;S.preview=null;B.draft=null;P.promptDraft=null;P.voiceDraft=null;P.step=step;P.index=0;
  S.page=S.space==="drama"?"pipeline":"beauty-create";
  if(S.space==="beauty"){P.shot=B.id;P.medium="video";}
  if(S.space==="drama"&&step===3)await bindSelectedImages();
  render();window.scrollTo({top:0});
}
async function bindSelectedImages(){
  for(const e of productionShots()){
    const image=beautyTake(e.id),v=accepted(e);
    if(!image||!v)continue;
    const first=image.version.content.result_media[0];
    if(v.content.bindings?.first_frame===first&&v.content.video_source?.revision===image.ref.revision)continue;
    const deps=v.deps.filter(d=>d.id!==v.content.video_source?.id);
    deps.push({...image.ref,frozen:true});
    await projectAPI("save",{id:e.id,kind:"shot",title:e.title,episode:e.episode,base_revision:e.head,
      content:{...v.content,bindings:{...v.content.bindings,first_frame:first},video_source:image.ref},deps,
      set_current:true,expected_accepted:e.accepted});
  }
  await refresh();
}
async function savePrompt(current){
  const e=activeShot(),v=version(e),text=$('#prompt-form [name="prompt"]').value;
  await projectAPI("save",{id:e.id,kind:"shot",title:e.title,episode:e.episode,base_revision:e.head,
    content:{...v.content,[P.medium+"_prompt"]:text},deps:v.deps,meta:v.meta,set_current:current,expected_accepted:e.accepted});
  S.dirty=false;P.promptDraft=null;await refresh();toast(current?"已保存并设为当前版本":"草稿已保存，当前版本未改变");
}
function addInboxRow(m,time=0){
  const shots=productionShots(),matches=shots.filter(s=>m.name.toLowerCase().includes(s.id.toLowerCase()));
  const shot=matches.length===1?matches[0]:shots.length===1?shots[0]:null;
  const revision=shot?(shot.accepted || shot.head):0;
  P.rows.push({media_id:m.id,name:m.name,medium:m.mime.split("/")[0],shot:shot?.id || "",revision,time});
}
function inboxRowsReady(){
  return P.rows.length>0&&P.rows.every(row=>{const e=entity(row.shot);return e&&row.revision&&version(e,row.revision);});
}
async function uploadInbox(files){
  if(S.dirty)throw new Error("请先保存编辑，再上传候选结果");
  if(P.rows.length+files.length>200)throw new Error("单批最多 200 个，请先关联当前批次");
  P.busy=true;
  try{
    for(const [i,file] of files.entries()){
      if(!/^(image|video)\//.test(file.type))throw new Error("候选结果仅支持图片与视频："+file.name);
      toast(`正在导入 ${i+1}/${files.length}：${file.name}`);
      addInboxRow(await uploadFile(file),file.lastModified);
    }
  }finally{P.busy=false;await refresh();}
  if(inboxRowsReady())await commitInbox();
  else toast("部分文件未识别镜头，请确认关联后进入候选筛选");
}
async function commitInbox(){
  if(P.busy)return;
  const platform=$('[name="batch-platform"]').value,parameters=$('[name="batch-parameters"]').value,prompt=$('[name="batch-prompt"]').value;
  const rows=P.rows.map(row=>{
    const e=entity(row.shot);
    if(!e||!row.revision||!version(e,row.revision))throw new Error(row.name+" 尚未选择有效镜头版本");
    const result={media_id:row.media_id,medium:row.medium,prompt_ref:{id:row.shot,revision:row.revision},parameters};
    if(platform)result.platform=platform;
    if(prompt)result.actual_prompt=prompt;
    return result;
  });
  const resultName=new Set(rows.map(row=>row.medium)).size===1?(rows[0].medium==="image"?"图片":"视频"):"结果";
  P.busy=true;
  try{
    const result=await projectAPI("batch-attempts",{rows});
    P.rows=[];P.shot="";P.filter="unreviewed";P.medium=rows[0].medium;P.index=0;
    await refresh();$("#gallery").scrollIntoView({behavior:"smooth"});toast(`已导入 ${result.count} 个候选${resultName}`);
  }finally{P.busy=false;}
}
async function review(id,judgment){
  if(P.busy)return;
  const e=entity(id),c=version(e).content,feedback=$('[name="review-feedback"]')?.value || "";
  if(judgment==="rejected"&&!feedback.trim()){ $('[name="review-feedback"]').focus();throw new Error("请写一句返修意见");}
  P.busy=true;
  try{
    await projectAPI("review",{id,revision:e.head,judgment,feedback,revalidate:!!$('[name="review-revalidate"]')?.checked,expected:(P.medium==="image"?S.project.selected_images:S.project.selected)[c.prompt_ref.id] || null});
    if(P.filter==="all")P.index++;
    await refresh();toast({accepted:"已设为当前结果",rejected:"已标记返修，意见已保留",discarded:"已淘汰，记录仍可查看"}[judgment]);
  }finally{P.busy=false;}
}
function compareDialog(){
  const items=P.compare.map(entity).filter(Boolean);
  if(items.length<2||items.length>4)throw new Error("请选择同镜头的 2～4 个候选");
  const first=version(items[0]).content;
  if(items.some(e=>version(e).content.prompt_ref.id!==first.prompt_ref.id))throw new Error("对比请选择同一镜头");
  const fields=[["actual_prompt","实际提示词"],["platform","平台 / 模型"],["parameters","参数"],["input_media","输入素材"]];
  modal("候选并排对比",`<div class="compare-grid" style="--columns:${items.length}">${items.map(e=>{
    const c=version(e).content;
    return `<article><h3>${esc(e.title)}</h3>${(c.result_media||[]).map(beautyMedia).filter(Boolean).map(m=>mediaCard(m,true)).join("")}
      ${fields.map(([key,label])=>{
        const text=key==="input_media"?(c[key]||[]).map(id=>beautyMedia(id)?.name || id).join("、"):c[key] || "";
        const different=JSON.stringify(c[key])!==JSON.stringify(first[key]);
        const words=key==="actual_prompt"&&different?text.split(/(\s+|[，。；、])/).map(w=>first[key]?.includes(w)?esc(w):`<mark>${esc(w)}</mark>`).join(""):esc(text || "未记录");
        return `<div class="diff-field ${different?"changed":""}"><b>${label}${different?" · 有差异":""}</b><pre>${words}</pre></div>`;
      }).join("")}${btn("查看并筛选","compare-review",e.id)}</article>`;
  }).join("")}</div>`,btn("关闭","close"));
  $("#modal").classList.add("wide");
}
async function sharedLibrary(kind=""){
  P.library=await api("/api/library");
  modal("工作空间共享库",`<div class="notice">人物、素材、模板、配方和模型档案可跨项目复用。导入会复制当前快照与媒体，两个项目后续独立修改。</div>
    <div class="library-list">${P.library.filter(e=>!kind||e.kind===kind).map(e=>`<div class="queue-row"><div><h3>${esc(e.title)}</h3><p>${esc(e.project_name)} · v${e.revision} · ${esc({asset:"人物 / 资产",source:"来源素材",template:"提示词模板",profile:"模型档案",recipe:"配方"}[e.kind])}</p></div>${S.project&&e.project!==S.project.project.id?btn("导入当前项目","library-import",`${e.project}|${e.id}|${e.revision}`):badge("本项目")}</div>`).join("")||empty("暂无共享内容","先在任一项目保存人物、模板或素材为当前版本。")}</div>`,btn("关闭","close"));
}
async function trashDialog(){
  P.trash=await api("/api/trash");
  modal("工作空间回收站",`<div class="notice">至少保留 30 天；到期不会自动清理。恢复后保留原版本与素材。</div>${P.trash.map(t=>`<div class="queue-row"><div><h3>${esc(t.title)}</h3><p>${esc(t.project_name)} · 删除于 ${esc(t.deleted_at.slice(0,10))} · 保留至 ${esc(t.retain_until.slice(0,10))}</p>
    <p>${t.kind==="project"?`${t.impact.records} 条记录 / ${t.impact.versions} 个版本 / ${t.impact.media} 个媒体 / ${t.impact.deliveries} 条交付记录`:`引用：${esc(t.impact.references.join("、") || "无")}`}</p></div>
    <div class="row">${btn("恢复","trash-restore",t.id)}${btn("永久清空…","trash-confirm",t.id,"danger")}</div></div>`).join("")||empty("回收站为空","移入回收站的项目与记录会出现在这里。")}`,btn("关闭","close"));
}
const originalSettings=settingsDialog;
Object.assign(actions,{
  "flow-step":id=>flowStep(Number(id)),
  "flow-next":()=>flowStep(P.step+1),
  "script-source":id=>editor("source","",{source_type:id,title:{novel:"小说素材",comic:"漫画素材",joke:"段子素材"}[id] || "外部素材"}),
  "shot-refresh":async id=>{P.focus=id;P.shot=id;await flowStep(2,true);$$(".stage-workspace").forEach(el=>{const outer=el.closest("details");if(outer)outer.open=true;const inner=$("details",el);if(inner)inner.open=true;});$("#context-form")?.scrollIntoView();},
  "flow-fix":async id=>{const [step,shot]=id.split("|");closeModal(true);P.shot=shot;P.focus=shot;await flowStep(Number(step),true);},
  "flow-accept":async id=>{if(S.dirty)throw new Error("先保存当前编辑，再设置当前版本");await acceptRecord(entity(id));},
  "flow-shot":id=>{if(!canLeave())return;S.dirty=false;P.promptDraft=null;P.voiceDraft=null;P.shot=id;P.focus=id;P.index=0;render();},
  "flow-assets":()=>modal("本项目人物与场景",assetsView(),btn("关闭","close")),
  "open-entity":id=>{const e=entity(id);if(e.kind==="stage"){const step={M00:0,M01:1,M02:2,M03:3}[e.id.split("-")[1]];step===undefined?navigate("stages",e.id.split("-")[1]):flowStep(step,true);}else if(e.kind==="shot"&&S.space==="beauty")beautyOpen(id);else editor(e.kind,id);},
  "prompt-save":()=>savePrompt(false),
  "prompt-current":()=>savePrompt(true),
  "prompt-copy":()=>{const e=activeShot();if(S.dirty||e.head!==e.accepted)throw new Error("先保存并设为当前版本");return copy(accepted(e).content[P.medium+"_prompt"] || "");},
  "inbox-upload":()=>$("#inbox-input").click(),
  "inbox-clear":()=>{if(confirm("清除待关联列表？已上传文件仍保留在素材库。")){P.rows=[];render();}},
  "inbox-map":async()=>{const e=entity($('[name="batch-shot"]').value);if(!e)throw new Error("先选择统一镜头");P.rows.forEach(r=>{r.shot=e.id;r.revision=e.accepted || e.head;});await commitInbox();},
  "inbox-time":async()=>{
    const count=Number($('[name="batch-count"]').value),shots=productionShots();
    if(!Number.isInteger(count)||count<1||P.rows.length>shots.length*count)throw new Error("每镜候选数与镜头数不足以分配这批文件");
    P.rows.sort((a,b)=>a.time-b.time||a.name.localeCompare(b.name)).forEach((r,i)=>{const e=shots[Math.floor(i/count)];r.shot=e.id;r.revision=e.accepted||e.head;});await commitInbox();
  },
  "inbox-existing":()=>{
    const used=new Set([...entities("attempt").flatMap(e=>version(e).content.result_media || []),...P.rows.map(r=>r.media_id)]);
    modal("关联已上传素材",`<div class="checks">${S.project.media.filter(m=>/^(image|video)\//.test(m.mime)&&!used.has(m.id)).map(m=>check(m.name,"inbox-media",m.id)).join("")}</div>`,btn("添加到待关联列表","inbox-add-existing"));
  },
  "inbox-add-existing":async()=>{const ids=$$('[name="inbox-media"]:checked').map(el=>el.value);if(P.rows.length+ids.length>200)throw new Error("单批最多 200 个");ids.map(beautyMedia).forEach(m=>addInboxRow(m));closeModal(true);render();if(inboxRowsReady())await commitInbox();},
  "inbox-commit":commitInbox,
  "review-prev":()=>{P.index=Math.max(0,P.index-1);render();},
  "review-next":()=>{P.index++;render();},
  "review-at":id=>{P.index=Number(id);render();},
  "review-accept":id=>review(id,"accepted"),
  "review-reject":id=>review(id,"rejected"),
  "review-discard":id=>review(id,"discarded"),
  "review-edit":id=>{const e=entity(version(entity(id)).content.prompt_ref.id);if(S.space==="beauty"){B.repair=entity(id);beautyDraft().repair_note=version(B.repair).content.feedback;render();}else editor("shot",e.id);},
  "compare-open":compareDialog,
  "compare-review":id=>{const c=version(entity(id)).content;P.shot=c.prompt_ref.id;P.medium=c.medium || "video";P.filter="all";P.index=galleryItems().findIndex(e=>e.id===id);closeModal(true);render();},
  "winner-recipe":async id=>{
    const e=entity(id),v=version(e),c=v.content,current=(c.medium==="image"?S.project.selected_images:S.project.selected)[c.prompt_ref.id];
    if(current?.id!==id)throw new Error("先将胜出的结果设为当前");
    await projectAPI("save",{kind:"recipe",title:e.title+" · 配方",content:{text:`平台 / 模型：${c.platform || "未记录"}\n参数：${c.parameters || "未记录"}\n实际提示词：${c.actual_prompt}\n反馈：${c.feedback || "无"}\n单次样本，效果限于实际输入条件。`,input_media:c.input_media || []},deps:[{id,revision:v.revision,frozen:true}],set_current:true,expected_accepted:null});
    await refresh();toast("胜出结果已沉淀到共享配方库");
  },
  "beauty-theme":id=>{beautyRead();beautyDraft().mode=id;S.dirty=true;render();},
  "beauty-images":()=>{beautyRead();P.medium="image";P.shot=B.id;P.index=0;render();$("#gallery").scrollIntoView();},
  "beauty-another":async()=>{const char=beautyDraft().character;if(!canLeave())return;await beautyOpen("");beautyDraft().character=char;S.dirty=true;render();},
  "voice-save":async()=>{
    const shot=activeShot(),v=accepted(shot);if(!v)throw new Error("先设定当前镜头版本");
    const form=$("#voice-form"),f=new FormData(form),old=entities("voice").find(e=>version(e).content.shot_ref.id===shot.id);
    await projectAPI("save",{id:old?.id || "voice-"+shot.id,kind:"voice",title:shot.title+" · 配音",episode:shot.episode,base_revision:old?.head || 0,
      content:{shot_ref:ref(shot),no_voice:f.has("no_voice"),media_ids:f.getAll("voice_media"),lines:JSON.parse(f.get("lines") || "[]"),speaker:f.get("speaker"),voice:f.get("voice"),rate:f.get("rate"),emotion:f.get("emotion")},
      deps:[ref(shot)],set_current:true,expected_accepted:old?.accepted ?? null});S.dirty=false;P.voiceDraft=null;await refresh();toast("配音已保存为当前版本");
  },
  "import-structured":async()=>{
    if(S.dirty)throw new Error("先保存并设为当前阶段版本");
    const e=stageEntity();if(!e)throw new Error("请先保存阶段");
    const result=await projectAPI("sync-stage",{id:e.id,revision:e.head});await refresh();toast(`已同步 ${result.count} 个镜头 / 资产，真实素材绑定已保留`);
  },
  "handoff":()=>flowStep(flowLabels().length-1,true),
  "delivery-download":async()=>{
    if(S.dirty)throw new Error("请先保存当前编辑");
    await productionLoad();render();
    if(!P.status.ready)throw new Error("请先处理交付检查中的缺项");
    const query=new URLSearchParams(S.space==="drama"?{episode:S.episode,checked:"1"}:{work:B.id,checked:"1"});
    location.href=`/api/projects/${S.project.project.id}/handoff?${query}`;toast("正在打包当前集 / 作品");
  },
  "workspace-library":sharedLibrary,
  "library-import":async id=>{const [project,key,rev]=id.split("|");await projectAPI("import-library",{project,id:key,revision:Number(rev)});closeModal(true);await refresh();toast("已复制到当前项目");},
  "workspace-trash":trashDialog,
  "trash-restore":async id=>{const r=await api("/api/trash/restore",{id});closeModal(true);await boot(r.project);toast("已恢复，原版本与媒体均保留");},
  "trash-confirm":id=>{
    const t=P.trash.find(t=>t.id===id);P.purge=t;
    modal("永久清空确认",`<div class="notice warn">此操作不可撤销。${t.kind==="project"?`${t.impact.records} 条记录、${t.impact.versions} 个版本、${t.impact.media} 个媒体、${t.impact.deliveries} 条交付记录将永久删除。`:`会删除此记录，现有交付包仍可能引用它。当前历史引用：${esc(t.impact.references.join("、") || "无")}。`}</div>
      ${field("输入完整名称确认","purge-name","","text",t.title)}`,btn("取消","workspace-trash")+btn("永久清空","trash-purge",id,"danger"));
  },
  "trash-purge":async id=>{await api("/api/trash/purge",{id,confirmation:$('[name="purge-name"]').value});await trashDialog();toast("已永久清空所选项目 / 记录");},
  "settings":()=>{
    originalSettings();$("#settings-form .modal-body").insertAdjacentHTML("beforeend",capabilityNotice().replace(/<button[\s\S]*?<\/button>/,"")+
      '<div class="row">'+btn("测试已保存的文本连接","settings-test","text")+btn("测试已保存的图片输入","settings-test","vision")+"</div>");
  },
  "settings-test":async mode=>{
    if(S.modalDirty)throw new Error("请先保存连接，再重新打开测试");
    $("#modal-error").textContent="正在用最小请求测试，最多约 20 秒…";
    const result=await api("/api/settings/test",{vision:mode==="vision"});S.boot=await api("/api/bootstrap");
    $("#modal-error").textContent=result.tested_at+" · "+result.message;
  }
});
document.addEventListener("input",event=>{
  if(event.target.closest("#prompt-form")){S.dirty=true;P.promptDraft=event.target.value;}
  if(event.target.closest("#voice-form")){
    S.dirty=true;const f=new FormData($("#voice-form"));
    P.voiceDraft={...Object.fromEntries(f),no_voice:f.has("no_voice"),media_ids:f.getAll("voice_media"),lineText:f.get("lines")};
  }
});
document.addEventListener("change",async event=>{
  const el=event.target;
  try{
    if(el.id==="inbox-input"&&el.files.length){await uploadInbox([...el.files]);el.value="";}
    if(el.dataset.mapShot!==undefined){const row=P.rows[Number(el.dataset.mapShot)],e=entity(el.value);row.shot=el.value;row.revision=e?.accepted || e?.head || 0;render();}
    if(el.dataset.mapRev!==undefined)P.rows[Number(el.dataset.mapRev)].revision=Number(el.value);
    if(["gallery-medium","gallery-shot","gallery-filter"].includes(el.name)){
      if(!canLeave()){render();return;}P[{ "gallery-medium":"medium","gallery-shot":"shot","gallery-filter":"filter"}[el.name]]=el.value;P.index=0;render();
    }
    if(el.name==="compare-take"){
      if(el.checked&&P.compare.length===4){el.checked=false;throw new Error("最多对比 4 个结果");}
      P.compare=el.checked?[...P.compare,el.value]:P.compare.filter(id=>id!==el.value);
      $('[data-action="compare-open"]').textContent=`并排对比 (${P.compare.length})`;
    }
    if(el.name==="generation_route"){beautyRead();beautyDraft().video_prompt="";delete beautyDraft().video_source;beautyDraft().bindings={};S.dirty=true;render();}
    if(el.name==="vision"&&el.checked&&!S.boot.settings.vision_model){el.checked=false;beautyDraft().vision=false;toast("请先配置并测试视觉模型，再选择图片输入",true);}
    if(el.closest("#context-form")&&el.name==="media_ids"&&el.checked&&!S.boot.settings.vision_model){el.checked=false;toast("请先配置视觉模型；当前可只用文字生成",true);}
  }catch(err){toast(err.message,true);}
});
document.addEventListener("dragover",event=>{if(event.target.closest("[data-inbox-drop]"))event.preventDefault();});
document.addEventListener("drop",async event=>{
  if(!event.target.closest("[data-inbox-drop]"))return;event.preventDefault();
  try{await uploadInbox([...event.dataTransfer.files]);}catch(err){toast(err.message,true);}
});
document.addEventListener("keydown",event=>{
  if(event.ctrlKey||event.metaKey||event.altKey||event.repeat||$("#modal").open||S.dirty||P.busy||event.target.closest("input,textarea,select,video,audio,[contenteditable]")||!$("#gallery"))return;
  const action={j:"review-prev",ArrowLeft:"review-prev",k:"review-next",ArrowRight:"review-next",a:"review-accept",r:"review-reject",x:"review-discard"}[event.key];
  const e=galleryItems()[P.index];if(!action||!e)return;
  event.preventDefault();Promise.resolve(actions[action](e.id)).catch(err=>toast(err.message,true));
});
boot().catch(err=>{$("#content").innerHTML=empty("工作台未能打开",err.message);});
