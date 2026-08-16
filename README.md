# SillyTavern Connection Pet（连接桌宠）

一个用于 SillyTavern 的第三方扩展：把常用的 Custom OpenAI-compatible 连接保存为独立配置，并通过可拖动桌宠一键切换；同时可从指定提示词预设中挑选“待开启条目”，再由桌宠一键切换预设并开启已勾选条目。

## 支持范围

- SillyTavern `1.16.0`
- 酒馆助手（Tavern Helper / JS-Slash-Runner）`4.9.2`
- 仅支持 `Chat Completion → Custom (OpenAI-compatible)`
- 不操作 OpenRouter、DeepSeek 等独立供应商入口；这些服务仍可通过兼容地址接入
- API 配置与提示词预设完全解耦，切换 API 配置不会切换预设或修改条目

## 安装

1. 先安装并启用酒馆助手 4.9.2。
2. 打开 SillyTavern 的“扩展”面板，点击“安装扩展”。
3. 输入：`https://github.com/wiesen857-gif/SillyTavern-Connection-Pet.git`
4. 安装后刷新页面，在扩展设置中展开“连接桌宠”。

## 使用

### 保存 API 配置

填写配置名称和 API 地址后，可以手动填写模型 ID，也可以点击“获取模型”从接口读取模型列表并下拉选择。可以选择已有的 Custom Secret，也可以临时输入新的 API Key；获取模型或保存配置时，新 Key 只会写入 SillyTavern 原生 Secrets，界面会明确提示“密钥已保存到酒馆 Secrets”。扩展设置仅保存 Secret ID，不保存明文 Key。

扩展设置页只负责管理配置，不会改变当前连接。请在桌宠的“API 配置”页选择配置并点击“一键应用”；它只会设置 Custom API 地址、Custom 模型和对应 Secret ID，然后发起连接，不会加载任何提示词预设。

### 使用酒馆现有连接配置

拓展会自动列出酒馆连接管理器中属于 Chat Completion → Custom 的配置。酒馆现有配置在拓展中只读，也可以复制为可编辑的桌宠独立配置。

选择配置本身不会改变酒馆状态。在桌宠中点击“一键应用”后，拓展只应用 API 地址、模型和 Secret ID；原配置中的提示词预设、代理、提示词后处理、正则预设及其他字段都会被忽略。预设条目只会在桌宠独立的“预设条目”页中改变。

### 添加待开启条目

在“待开启条目”中选择预设，扩展会读取该预设当前包含的所有提示词条目。勾选的条目只会加入桌宠可操作列表，不会立即改变启用状态。

在桌宠的“预设条目”页选择预设并勾选要开启的条目，再点击底部“一键应用”。执行顺序固定为：

1. 验证预设和条目 ID；
2. 加载所选预设；
3. 只开启本次明确勾选的待开启条目，未勾选条目保持原状；
4. 立即刷新提示词管理器。

已从预设中删除的条目会标记为失效，不会按名称猜测或迁移。

## 安全边界

- 不把明文 API Key 写入扩展设置、日志或仓库。
- 删除连接配置不会删除 SillyTavern 原生 Secrets。
- API 地址和模型 ID 会拒绝 STscript 管道、宏和换行控制语法。
- 扩展依赖 SillyTavern 1.16.0 的 `/api`、`/api-url`、`/model` 命令及原生 Secrets 模块；预设操作依赖酒馆助手 4.9.2 的 `getPreset`、`loadPreset`、`replacePreset` 等接口。

## 开发验证

```powershell
npm.cmd test
npm.cmd run check
```
