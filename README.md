# Userscripts

ZhangNingYA 的油猴脚本中心。仓库中的脚本会通过 GitHub Pages 发布，并由油猴的 `@updateURL` 自动更新。

## 目录结构

```text
scripts/
  ptt-modern-ui/
    ptt-modern-ui.user.js
site/
  index.html
  assets/
tools/
  build-site.mjs
```

每个脚本放在独立目录中，目录内保留一个以 `.user.js` 结尾的文件。构建工具会自动读取 userscript 元数据、生成脚本目录和独立详情页。

## 本地构建

```bash
npm run build
```

生成结果位于 `dist/`。推送到 `main` 分支后，GitHub Actions 会自动构建并发布 Pages。

## 发布更新

1. 修改对应的 `.user.js` 文件。
2. 提升脚本头部的 `@version`。
3. 提交并推送到 `main`。
4. 等待 Pages 部署完成，已安装脚本会按油猴的更新周期获取新版本。

不要在 userscript 中保存密码、Token 或其他秘密信息；发布后的脚本文件是公开可访问的。

