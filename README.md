# petlog 网页 App

petlog 是一个可以安装到 iPhone 主屏幕的宠物健康记录、护理提醒与成长档案 PWA。

## 已完成的功能

- 多只宠物独立管理与切换
- 宠物头像、品种、生日、芯片号、性别和绝育状态
- 呕吐、拉稀、看医生、内驱、外驱、疫苗、体重、洗澡、美容及其他记录
- 首页快速记录、今日提醒、最近记录和最新体重
- 一键完成护理并自动计算下一次日期
- 从首页记录内驱、外驱、疫苗、洗澡或美容时自动更新对应提醒
- 体重折线趋势、分类统计及全部历史明细
- 身长、胸围、颈围、肩高、背长和自定义身体尺寸记录
- 宠物年龄自动计算及生日前 7 天主页横幅
- 免费导出 `.ics` 日历事件，包含提前 1 天、提前 2 小时和到期时三次提醒
- 打开 App 时检查到期项目的浏览器通知
- Google 登录及 Firestore 自动同步
- 同一设备上的不同 Google 账号使用各自独立的本地和云端资料
- JSON 完整备份与恢复
- 离线访问及 iPhone 主屏幕安装

## 上传到 GitHub

将压缩包里的全部文件上传并覆盖仓库根目录。GitHub Pages 继续设置为：

- Branch：`main`
- Folder：`/(root)`

发布完成后，用 Safari 打开 GitHub Pages 地址，点击“分享”→“添加到主屏幕”。主屏幕名称会显示为 **petlog**。

## Firebase 设置

现有 Firebase 项目 `petlog-backup` 的配置已保留，不会因为 App 改版而断开已有账号和数据。

1. Firebase Authentication 中启用 Google 登录。
2. Authentication → Settings → Authorized domains 中加入你的 GitHub Pages 域名。
3. Firestore → Rules 中使用本包的 `firestore.rules` 并发布。

文字和护理记录在 Firestore 中按用户 UID 隔离。照片和宠物头像保存在当前手机，并包含在 JSON 备份中，不写入 Firestore。

## 关于照片和免费方案

从 2026 年 2 月起，Firebase Storage 要求项目升级为 Blaze 并绑定付款账号。因此这个完全免费版本没有启用 Storage，避免产生付费依赖。以后如果决定启用 Blaze，可以再把照片迁移到 Storage；现有文字记录结构无需更改。

## 数据兼容

- 保留原 Firestore 文档路径 `users/{uid}/app/pawsnote`，所以旧云端记录仍可恢复。
- 自动迁移旧版 IndexedDB 数据。
- 旧版“食欲”和“精神状态”数据不会删除，只是不再显示为主要记录类型。
- Firebase 技术项目 ID 保持不变。
