# 能不能接钉钉 AI 听记 / 闪记的转写？（2026-11-21 调研）

> 结论先说：**钉钉视频会议里的「云录制（闪记）」能接**，有官方接口，按发言人返回转写文本，已接入（`/app/meeting/new` →「📞 从钉钉会议导入」）。
> **独立的「AI 听记」App（含 A1 录音卡）目前没有公开接口**，只能通过钉钉官方的 dws 命令行、经企业管理员授权拿到，暂不接。
> 两条路都**没有用真实钉钉应用联调**（没有 AppKey / AppSecret），请求格式按官方文档写，响应用演示数据和本地模拟服务验证。

## 钉钉侧有哪几条路

| 路径 | 拿到什么 | 时机 | 接口 / 方式 | 门槛 | 本产品 |
|---|---|---|---|---|---|
| ① 视频会议云录制（闪记）文本 | 段落文本 + 发言人 unionId / 昵称 + 起止时间（毫秒）+ 逐句、逐词 | 会议录制期间 / 结束后拉取 | `GET https://api.dingtalk.com/v1.0/conference/videoConferences/{conferenceId}/cloudRecords/getTexts`，请求头 `x-acs-dingtalk-access-token`，参数 `unionId` `startTime` `direction` `maxResults`（≤2000）`nextToken` | 企业内部应用或第三方企业应用；权限「视频会议信息读权限」；会议必须开「云录制（闪记）」 | ✅ 已接入（未联调） |
| ② 视频会议 ASR 实时事件 | 每句话的识别结果 `payload.result` + `speakerUnionId` + 逐字时间 | 会中实时推送 | 事件 `meeting_asr_result_event`（bizType 411），企业内部应用支持 Stream 模式 / HTTP 推送 | 同上，另需事件订阅；Stream 模式要一个常驻长连接进程 | ⏳ 未接（见下） |
| ③ 闪记状态变更事件 | 「摘要已生成」「视频已生成」通知 | 会后 | 事件 `flash_minutes_open_event`（bizType 396） | 同上 | ⏳ 可用来触发 ① 自动拉取 |
| ④ 独立 AI 听记（App / A1 录音卡） | 转写、摘要、待办、关键词 | 只能拿**已完成转写**的听记，录音中的拿不到 | 只有 dws CLI：`dws minutes get transcription / summary / todos`，OAuth 设备授权，以个人身份访问 | 项目处于共创期，需要企业管理员开通 CLI 访问；没有公开的 REST 文档 | ❌ 暂不接；可以在听记里导出文字后粘贴 |

## 和现在的百炼语音识别比

| | 百炼 Qwen-ASR（现方案） | 钉钉闪记（① + ②） |
|---|---|---|
| 会议形式 | 任何形式：线下围坐一台电脑也行 | 必须开钉钉视频会议并打开云录制（线下开会也得有人发起钉钉会议） |
| 发言人 | 不区分，组长手动选「当前发言人」或会后改 | **自带**：每段有 unionId + 昵称，按入会账号区分（每人用自己设备入会时最准） |
| 实时性 | 浏览器按静音切段，每段约 1–2 秒出字 | ② 实时推送；① 会后拉取 |
| 账号门槛 | 只要产品方有百炼 Key，组员什么都不用装 | 要一个钉钉组织 + 企业内部应用 + 管理员开权限；小组成员要在同一组织里 |
| 成本（我们付） | 按秒计费：paraformer-realtime-v2 0.00024 元/秒（华北2 原价），qwen3-asr-flash 单价待核对 | 不按次付给钉钉：闪记是钉钉会议自带能力，免费额度和会员权益以钉钉为准（**待核对**） |
| 数据在哪 | 语音段发给百炼，文字存在本产品 | 录音和文字先存在钉钉，本产品再拉一份 |
| 可控性 | 开录、切段、上传全在我们手里 | 受钉钉会议客户端和权限约束 |

**怎么选（建议）**：两条都留，按小组的习惯走。

- 小组本来就用钉钉开会（学校发了钉钉组织，或者组长建了一个小组组织）：用钉钉闪记。发言人准，我们不付转写费。
- 线下围坐开会、或者不想折腾组织和权限：用会议室的麦克风 + 百炼转写。
- 两条路最后都进同一条纪要流水线：组长确认后才保存，计量照常写 usage_log（钉钉导入不调模型，不记 ASR 费用）。

## 已经做了什么

- `lib/dingtalk/client.ts`：获取企业内部应用 accessToken（`POST /v1.0/oauth2/accessToken`，缓存到过期前 1 分钟）；调 getTexts 按时间正序翻页，最多 50 页 × 2000 条；按文档错误码给中文提示（没开云录制、组织不对、没开权限等）。
- `lib/dingtalk/cloud-texts.ts`：钉钉段落 → 本产品转写格式。按时间排序，每 5 分钟打时间戳，钉钉昵称用花名册别名映射（「然哥」→ 浩然），对不上的保留原昵称。分页游标 `nextToken` / 文档示例里的拼写 `nextTtoken` 都认。
- `POST /api/dingtalk/import`：输入 conferenceId（和可选的 unionId）。没配 `DINGTALK_APP_KEY` / `DINGTALK_APP_SECRET` 时，返回按官方响应字段构造的演示数据，页面标「演示模拟」。
- 纪要页「📞 从钉钉会议导入」：填会议 ID，点导入，转写和发言人映射结果填进输入框，后面照常整理、确认。
- 单测 4 例（排序、昵称映射、分页游标、演示数据）。用本地模拟的钉钉服务（`DINGTALK_API_BASE` 指过去）跑通了真实模式代码：取 token、带请求头、两页翻页、错误码提示。

## 接实时事件（②）还差什么

1. 钉钉开发者后台给应用订阅 `meeting_asr_result_event`，推送方式选 Stream 模式（不需要公网回调地址）。
2. 起一个常驻进程（官方有 dingtalk-stream SDK）收事件，按 `openConfModel.conferenceId` 归到会议室会话，把 `payload.result` + `speakerUnionId` 推给会议室页面（SSE 或轮询）。这样会中「这事定过了」提醒也能用钉钉的转写驱动。
3. Next.js 的请求式路由不适合挂长连接，这个进程要单独部署（Render 上再开一个 worker）。所以这次没做。

## 怎么配真实环境

1. 钉钉开发者后台 → 创建「企业内部应用」→ 权限管理里申请「视频会议信息读权限」。
2. 把 AppKey / AppSecret 填进 `.env.local` 的 `DINGTALK_APP_KEY` / `DINGTALK_APP_SECRET`。可选填 `DINGTALK_UNION_ID`，用来指定默认用哪个人的身份查询。
3. 开钉钉视频会议，主持人开启「会议录制 → 云录制（闪记）」。会后在纪要页填会议 ID 导入。

## 参考

- [查询会议录制中的文本信息](https://open.dingtalk.com/document/development/queries-the-text-information-about-cloud-recording)（2026-06-02 更新）
- [视频会议ASR转写结果开放事件](https://open.dingtalk.com/document/orgapp/events-meeting-asr-result-event)（2025-07-01 更新）
- [闪记状态变更开放事件](https://open.dingtalk.com/document/orgapp/events-flash-minutes-open-event)（2025-02-25 更新）
- [dingtalk-workspace-cli 命令索引（dws minutes）](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/blob/main/docs/command-index.md)
- [dws issue #1255：只能拿到已完成转写的听记](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/issues/1255)
