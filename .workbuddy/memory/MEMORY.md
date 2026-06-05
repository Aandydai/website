# MEMORY.md

## 项目：website 博客网站

- 项目路径：`c:/Users/daish/WorkBuddy/20260428215408/website/`
- 技术栈：Node.js + Express + sql.js + bcryptjs + marked.js
- 服务器端口：3000
- 管理后台：admin，账号：promise / PROMISE110820qq

## 网站版本记录

### 版本5 - 2026-04-29
文件上传功能优化（版本4基础上）：

**问题：** 上传文件时，文件名出现中文乱码。

**修复：**
- 后端 `server.js`：`/api/admin/upload` 不再从 `req.file.originalname` 取文件名（multipart解析编码错误根源），改为只返回 `{ url, mimetype }`
- 前端 `dashboard.html`：`doUpload()` 改为前端根据 `file.name`（浏览器 File API 提供的正确 UTF-8 文件名）自己构造嵌入代码，彻底绕过后端编码问题
- 附件类型：图片 `![](url)`、音频 `<audio controls>`、视频 `<video controls>`、其他文件 `[📎 文件名](url)`

### 版本4 - 2026-04-29
导航栏间距微调（版本3基础上）：
- `.nav .nav-right` gap: 32px → 10px（链接间距收紧）
- 搜索按钮 `padding-left`: 16px → 3px（紧贴 Admin）

### 版本3 - 2026-04-29
搜索功能完整上线：
- 导航栏右侧新增搜索图标按钮（放大镜 SVG）
- 点击 / 按 `/` 键均可唤起搜索弹窗
- 搜索结果按"标题匹配 > 内容匹配"排序，相同匹配级别按时间降序
- 所有页面（index/about/archive/link/post/dashboard）均已引入 search.js
- 搜索图标使用 `insertAdjacentHTML` 注入，`margin-left:auto` 推至右侧

## 重要操作记录

### 2026-04-29 下午：Header 布局与导航栏样式优化（版本2）

**页面结构统一：**
- `about.html`、`link.html`、`archive.html`、`post.html` 均添加 `header-left` 包裹层（与 `index.html` 结构对齐），副标题始终紧贴在标题下方
- `nav` 从页面独立元素移入 `header` 内，配合 `justify-content: space-between` 实现左右分布

**Header 样式：**
- `.header` 改为全宽，底部边框横线铺满浏览器，内容区域用 `calc()` 居中于 900px
- `.nav` 移除 `max-width`、`margin: auto`，不再居中，靠右对齐

**导航栏 active 下划线样式：**
- `padding: 0`（无额外撑开距离）
- `bottom: 0`（紧贴文字底部）
- `height: 1px`（细线）
- `background: #ccc`（淡色）

**Bug 修复：**
- `style.css` mobile 媒体查询中原有孤立的 `font-size: 12px;` 和多余 `}` 导致后面规则逃逸，已修正

### 2026-04-29：导航栏动态外链功能

为网站导航栏添加动态外链管理功能：

**数据库变更：**
- `database.js` 新增 `nav_links` 表：`id`, `name`, `url`, `sort_order`, `is_external`, `created_at`
- 初始化一条默认数据：`Friends → /link`（站内链接，is_external=0）

**后端 API：**
- `GET /api/nav-links` — 公开接口，供前端导航栏读取
- `GET /api/admin/nav-links` — 管理后台读取
- `POST /api/admin/nav-links` — 新增
- `PUT /api/admin/nav-links/:id` — 修改
- `DELETE /api/admin/nav-links/:id` — 删除
- `/api/admin/stats` 新增返回 `navLinkCount`

**前端变更：**
- 新增 `public/js/nav.js`：动态替换导航栏中的 "Link" 为下拉菜单，从 `/api/nav-links` 读取
- 所有页面（index/about/archive/link/post/dashboard.html）均引入 `nav.js`
- `style.css` 新增 `.nav-dropdown-*` 下拉菜单样式，含移动端适配
- `dashboard.html` 新增 Nav Links 统计卡片、标签页、管理表格、增删改 modal

**关键实现细节：**
- `nav.js` 通过 `fetch('/api/nav-links')` 获取链接列表，动态生成下拉菜单
- `is_external=1` 时链接加 `target="_blank"`，并显示 `↗` 图标
- 移动端（≤768px）下拉菜单改为 inline flex 排列，不绝对定位

### 2026-04-28：网站汉→英翻译
完成了整个 website 项目的全量中译英：

| 文件 | 修改内容 |
|------|----------|
| public/index.html | lang="zh"→en，文章RSS→Posts RSS，中文注释翻译 |
| public/about.html | JS中的页面标题、footer版权信息全部翻译 |
| public/archive.html | footer版权翻译 |
| public/link.html | "暂无友链"→"No friends links yet"，footer翻译 |
| public/post.html | 密码保护表单、评论区标签全部翻译 |
| public/css/style.css | 全局样式注释翻译 |
| server.js | 所有API错误信息、注释、RSS内容、console.log翻译；默认分类'日常'→'general' |
| database.js | 所有注释翻译；默认分类'日常'→'general'；示例文章/友链全部英译 |
| package.json | description翻译 |

注意：index.html footer 中的 ICP备案号 `云ICP备18023681号-3` 保留未动（法律要求）。
