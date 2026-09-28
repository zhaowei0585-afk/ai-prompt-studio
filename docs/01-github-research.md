# GitHub 调研与选型

核验时间：2026-09-28。核验对象为当日主分支资料。

## 结论

**有成熟思路可借鉴，没必要从零发明整条产线。最贴近“只输出提示词、自己用 ComfyUI 生产”的是 Drama Skills。**

建议以其阶段划分、连续性管理和文本交接方式为参考，独立实现所需工作台。优先补齐人物短视频、生成结果回填、版本关联和本地 ComfyUI 模型档案。是否直接复用其脚本，等最小样片验证后再定。

如果希望直接使用现成界面，可优先试用 Nomi；如果希望从宽松许可证的完整应用二次开发，LocalMiniDrama 值得进一步评估。两者都覆盖了当前不需要的媒体生产功能，不能直接等同于本需求。

## 候选比较

以下“已有能力”来自仓库文档及注明的源码阅读，**不是本机安装或出片实测**。没有把仓库中的“一键成片”“稳定一致性”等宣传作为性能结论。

| 项目 | 已核验的相关能力 | 当前许可证 | 本需求中的定位 |
|---|---|---|---|
| [Drama Skills](https://github.com/zenstory-ai/drama-skills) | 原著分析、分集剧本、视觉资产、分镜、图片/视频提示词；支持文本交付与用户自行挂图；有本地创作台和文档检查器 | [MIT](https://github.com/zenstory-ai/drama-skills/blob/main/LICENSE) | **首选流程参考**；尚不能据此认定覆盖人物短视频和本地试片闭环 |
| [LocalMiniDrama](https://github.com/xuanyustudio/LocalMiniDrama) | 剧集、角色/场景/道具、分镜、提示词覆盖、列表/画布、导入导出；Vue + Node + SQLite | [MIT](https://github.com/xuanyustudio/LocalMiniDrama/blob/main/LICENSE) | **完整应用二开备选**；默认链路偏媒体生成，公开下载主要面向 Windows |
| [Nomi](https://github.com/aqm857886159/Nomi) | 本地项目文件夹、分镜、参考素材、逐镜模型选择、ComfyUI、画布与时间线；macOS/Windows | [AGPL-3.0-only，README 声明](https://github.com/aqm857886159/Nomi#license) | **现成工作台试用备选**；允许商业使用，但修改、分发及网络服务需遵守相应源码义务 |
| [BigBanana AI Director](https://github.com/shuyu-labs/BigBanana-AI-Director) | 剧本→资产→关键帧；服装变体；提示词版本；README 表示后续完整源码不再公开同步 | [BigBanana Community License 1.0](https://github.com/shuyu-labs/BigBanana-AI-Director/blob/main/LICENSE) | 学习资产与关键帧思路；**不作为无授权商业生产底座** |
| [Huobao Drama](https://github.com/chatfire-AI/huobao-drama) | 原著改写、资产提取、分镜、提示词生成的阶段职责；当前 README 为 TS/Hono/Nuxt/SQLite 架构 | [CC BY-NC-SA 4.0](https://github.com/chatfire-AI/huobao-drama/blob/main/LICENSE) | 流程参考；商业使用不能只依据“GitHub 可下载”判断授权 |
| [waoowaoo](https://github.com/waooAI/waoowaoo) | 助手、画布、参考图、模型相关输入模式、生成结果版本 | [Elastic License 2.0](https://github.com/waooAI/waoowaoo/blob/main/LICENSE) | 当前版为 source-available；可个人/内部业务使用，但有托管服务限制，部署栈也较重 |
| [Wan2.2 / Wan-Animate](https://github.com/Wan-Video/Wan2.2#run-wan-animate) | 人物图+视频驱动；初代 Animate 预处理涉及姿态、面部等控制素材 | Apache-2.0，见仓库模型许可说明 | 舞蹈动作驱动的技术依据；不是提示词工作台 |
| [Wan-Animate-2](https://github.com/Wan-Video/Wan-Animate-2) | 直接输入人物图和驱动视频；官方示例先生成外观/背景描述 | [Apache-2.0](https://github.com/Wan-Video/Wan-Animate-2/blob/main/LICENSE) | 更新的动作驱动候选；不能据此推定用户现有硬件和节点可以运行 |
| [ComfyUI-WanVideoWrapper](https://github.com/kijai/ComfyUI-WanVideoWrapper) | Wan 相关模型与多种视频控制能力的 ComfyUI 自定义节点 | Apache-2.0，GitHub 元数据 | 了解已有生态；原生节点已满足需要时，作者也建议优先原生方案 |

### 必须保留的版本差异

- BigBanana 的 README 仍写 CC BY-NC-SA 4.0，**本次实际读取的 `LICENSE` 为 Community License 1.0**，明确限制收益活动及企业内部商业生产。存在资料不一致，落地时需锁定具体版本及其许可，不能套用 README 的旧结论。
- waoowaoo 当前 README 明确从 `v0.5.0-beta.1` 起采用 ELv2，旧版保留各自许可证。不能因历史 fork 标记 MIT 就判断当前主分支是 MIT。
- Nomi 当前为 AGPL，README 说明历史 Apache-2.0 版本保留原许可。AGPL 不是“禁止商用”。
- LocalMiniDrama 有 ComfyUI 配置文档，但读到的方式是额外部署 OpenAI API 代理。**文档存在不等于已验证原生、开箱即用的 ComfyUI 接入。**
- “素材保存在本地”和“模型推理在本地”是两回事。配置云端语言/视觉模型时，实际请求仍会传输对应文本或图片。

## 哪些思路值得复用

### 1. Drama Skills：将跨阶段事实写清楚

本次进一步阅读了：

- [漫剧全流程](https://github.com/zenstory-ai/drama-skills/blob/main/docs/comic-drama-workflow.md)
- [跨集、跨镜角色一致性](https://github.com/zenstory-ai/drama-skills/blob/main/docs/character-consistency-across-shots.md)
- 仓库 README 的文本交接、挂图计划及文档检查示例

最有价值的做法：

1. 单集剧本、视觉设定、分镜、图片提示词、视频提示词各自承担明确职责。
2. 区分角色身份、服装/状态变体、逐镜动作。换衣服不新建角色；抬手不改角色档案。
3. 区分“准备生成的图”和“实际存在并选定的参考图”。
4. 首帧只描述动作开始前的瞬间，运动描述再负责从起点到终点。
5. 提示词可以先交付，缺少实际图片时明确列出待挂图，而不是谎称已经绑定参考。

本方案沿用这些思想，但工作台的数据结构、反馈记录和人物短视频模板独立设计。本轮未安装或直接复制其技能代码；后续若复用实质性内容，应保留 MIT 版权和许可声明。

### 2. LocalMiniDrama：模板可编辑与资产可复用

除 README 外，还检查了：

- [提示词覆盖服务](https://github.com/xuanyustudio/LocalMiniDrama/blob/main/backend-node/src/services/promptOverridesService.js)：提供基于 SQLite 的覆盖项读写。
- [ComfyUI 配置资料](https://github.com/xuanyustudio/LocalMiniDrama/blob/main/docs/comfyui配置.md)：描述额外代理的接入路线。

可借鉴：默认模板和用户覆盖分开，角色/场景按项目复用，镜头逐条编辑。上面读到的简单覆盖服务没有展示完整提示词历史，不能把“能修改模板”当成“有版本追溯”。

### 3. Nomi：镜头与模型能力一起管理

根据 [README](https://github.com/aqm857886159/Nomi/blob/main/README.md) 和[模型接入指南](https://github.com/aqm857886159/Nomi/blob/main/docs/provider-integration.md)，其思路适合参考：一镜一个生产单元，关联提示词、参考素材、模型、时长和不同 take（拍摄版本）。

本需求只取“镜头卡片+版本+参考素材”的交互，不需要在首版加入 3D 导演、时间线编辑器和自动渲染。

### 4. Wan：动作不能统一当成文字任务

[初代 Animate 官方说明](https://github.com/Wan-Video/Wan2.2#run-wan-animate)要求人物图和驱动视频，按模式准备姿态/面部等输入。

[Wan-Animate-2 的推理说明](https://github.com/Wan-Video/Wan-Animate-2#inference)则直接使用驱动视频，官方给出的图像描述格式强调人物外观和背景，不描述动作行为。这说明：

- “视频→提示词”适合提取动作意图、镜头语言和内容模板。
- 精确动作复现仍依赖驱动素材及模型能力。
- 老模型的姿态预处理流程不能直接当成新模型的必经步骤。
- 普通 I2V 的运动描述模板，不能不加区分地用于所有 Animate 模型。

官方 Wan-Animate-2 示例针对多卡环境；没有测试用户配置前，不承诺速度、显存占用或实时运行。

## 选型路线

| 路线 | 好处 | 需要承担的工作 | 建议 |
|---|---|---|---|
| 直接用 Drama Skills + 文件 | 先验证内容流程，最少开发 | 人物短视频、反馈、图形管理仍需补 | 适合先完成第一条样片 |
| 基于 LocalMiniDrama 改造 | 有现成界面、资产和模板管理，MIT | 梳理生成链路、删减无关部分、补版本与反馈 | 样片后再评估二开成本 |
| 直接使用 Nomi | macOS 可用、已有 ComfyUI 与镜头工作台 | 确认只做提示词的操作体验，接受许可证要求 | 可作为现成软件对照体验 |
| 借鉴流程，独立做轻量工作台 | 符合两条赛道和外部 ComfyUI 边界 | 需要实现存储、阶段生成、版本及回填 | **推荐的产品方向** |

现有项目已经提供可借鉴的通用流程，独立开发可以集中在两条产线的管理、交接和反馈上。

## 验证范围与尚未验证项

已做：GitHub 仓库检索；主要 README、许可文件和关键流程文档阅读；LocalMiniDrama 少量源码检查。

未做：逐个安装运行；完整代码质量/安全审计；在用户 GPU 上测显存和耗时；对比真实出片一致性；核实视频平台后台当前展示的全部发布规则。

因此本报告能支持流程和候选选型，不能作为这些项目的运行质量保证。也不能从“Star 数多”推导出适合本需求。

## 关键许可的固定版本证据

为避免主分支更新后难以复核，以下许可另以当日 HEAD 提交重新读取确认：

- Drama Skills：[`0afa4ea` 的 MIT License](https://github.com/zenstory-ai/drama-skills/blob/0afa4ea253cf4d1aa2d134863b15a592547cfb54/LICENSE)。
- BigBanana：[`052e1ec` 的 Community License 1.0](https://github.com/shuyu-labs/BigBanana-AI-Director/blob/052e1ec810d75f954034b36b692c14c7f8332ca3/LICENSE)。
