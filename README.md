# Ayuan 的博客

一个以 HTML 文件为文章的静态个人博客。上传文章后，GitHub Actions 自动更新首页、分类、搜索、RSS 和站点地图，再发布到 GitHub Pages。

**博客地址：<https://ayuan2002.github.io/blog/>**

本仓库已经启用 GitHub Pages，发布源为 GitHub Actions。日常使用直接看下面的“发一篇文章”即可。

## 第一次启用

1. 打开 [Settings → Pages](https://github.com/Ayuan2002/blog/settings/pages)。
2. 将 **Build and deployment → Source** 设为 **GitHub Actions**。本仓库使用自动构建，不要选择分支发布。
3. 打开 [Actions](https://github.com/Ayuan2002/blog/actions/workflows/pages.yml)，选择 **Build and deploy blog → Run workflow → main → Run workflow**。
4. 等待 `build` 和 `deploy` 成功后访问博客。若首次运行发生在启用 Pages 之前，启用后重新运行即可。

之后提交到 `main` 的更改都会自动发布；PR 只验证，不发布。无需配置访问令牌、数据库或服务器。

## 发一篇文章

### 方法一：上传现成的 HTML

1. 进入仓库的 [`posts`](./posts) 文件夹。
2. 点击 **Add file → Upload files**，上传文章，如 `my-first-post.html`。
3. 配图可以上传到 `assets/images/`，也可以与文章放在同一个文件夹；在 HTML 中使用正确的相对路径。
4. **Commit changes** 到 `main`（若选择新分支，则合并 PR 后发布）。
5. 在 Actions 查看运行结果。首页会自动收录文章，不用手动改首页。

文章 HTML 会原样发布，因此可以使用自己的排版、CSS 和 JavaScript。系统不会自动替你套用主题、修改标题或添加导航。想要与首页统一，请使用下面的模板。

### 方法二：使用统一模板

复制 [`templates/post.html`](./templates/post.html)，改名后放到 `posts/`。修改 `<head>` 中的信息，以及正文中的标题、日期、分类和内容：

```html
<title>我的文章标题</title>
<meta name="description" content="一句话介绍这篇文章。">
<meta name="date" content="2026-10-07">
<meta name="category" content="技术">
<meta name="keywords" content="HTML, 学习笔记">
```

- `title`：首页显示的文章标题；也支持用 `blog:title` 元数据单独设置首页标题。
- `description`：摘要；省略时从正文提取。
- `date`：发布日期，格式为 `YYYY-MM-DD`。省略时优先读取文件名前的日期，再读取文件首次 Git 提交日期；本地未提交的文件使用当天日期。无效日期会使构建失败，并提示出错文件。
- `category`：分类；省略时归入“随笔”。
- `keywords`：用逗号分隔的标签，支持搜索。

`<title>` 省略时，系统依次尝试 `<h1>`、文件名。页面需要保存为 UTF-8。

推荐把文章直接放在 `posts/`，使用英文小写和短横线命名，例如 `learning-html.html`。同时支持中文文件名、`.htm` 和子文件夹。每个 `.html` / `.htm` 都会作为文章收录，因此不要把辅助 HTML 页面放进 `posts/`。

**图片与样式路径：** 对 `posts/example.html`，引用公共样式用 `../assets/style.css`，引用图片用 `../assets/images/example.jpg`。如果文章位于更深的子目录，需要相应增加 `../`。不要使用电脑上的绝对路径。

> `posts/` 中所有非隐藏文件都会公开发布。这里没有草稿开关；未完成的内容请放在未合并的分支或本地，不要提交到 `main` 的 `posts/`。

## 修改已有内容

- 修改文章：编辑对应 HTML 并提交。
- 删除文章：删除对应 HTML 并提交，下一次发布会同时移除页面与首页条目。
- 修改博客名称、简介、首页大标题、关于页面：编辑 [`site.config.json`](./site.config.json)。
- 修改外观：编辑 [`assets/style.css`](./assets/style.css)。
- 示例文章：[`posts/hello.html`](./posts/hello.html) 是开篇占位内容，可以替换或删除。
- 修改配置中的作者名后，已有 HTML 文章里的作者署名仍需自行修改，因为文章会原样发布。

## 本地预览（可选）

安装 Node.js 22 或更新版本后，在仓库目录执行：

```sh
npm test
npm run build
npm run preview
```

打开 <http://127.0.0.1:4173/blog/>。没有第三方依赖，不需要 `npm install`。修改文件后重新运行 `npm run build`，然后刷新浏览器。预览服务按 `Ctrl+C` 停止。

## 目录

```text
posts/                # 上传文章及配套资源
assets/               # 公共样式、脚本、图片
templates/post.html   # 文章模板，不会发布
site.config.json      # 站点信息
scripts/build.mjs     # 生成首页、关于页、404、RSS、站点地图
scripts/serve.mjs     # 本地预览
tests/                # 文章收录和发布输出的测试
.github/workflows/    # 自动验证与发布
dist/                 # 自动生成，不要手工修改或提交
```

## 自定义域名

先在 Settings → Pages 配置自己的域名与 DNS，再把 `site.config.json` 的 `url` 改成完整新地址（例如 `https://blog.example.com/`），提交并重新部署。生成的导航、RSS、站点地图会随之更新；文章推荐使用相对路径，因此无需改动。

## 常见问题

- **第一次发布失败：** 确认 Pages 的 Source 是 GitHub Actions，再重新运行工作流。
- **上传了文章却没有出现：** 确认文件位于 `main` 分支的 `posts/` 中、扩展名为 `.html` 或 `.htm`，并检查 Actions 是否成功。
- **图片或样式 404：** 路径与文件名大小写必须完全一致，且不能指向本地电脑路径。普通项目站的网址包含 `/blog/`，建议使用相对路径。
- **日期报错：** 使用真实日期，如 `2026-10-07`，不要写成 `2026/10/07` 或不存在的日期。
- **删除所有文章：** 首页会显示空状态；请保留 `posts/` 文件夹（可放一个 `.gitkeep`）。
- **搜索范围：** 标题、摘要、分类和标签；不是正文全文搜索。
- **功能范围：** 纯静态网站，默认没有登录、评论后台、数据库或访问统计。

官方参考：[GitHub Pages 工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。
