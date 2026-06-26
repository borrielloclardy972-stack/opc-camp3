# GitHub Pages 上线说明

## 正确上传方式

解压本 ZIP 后，打开解压后的文件夹，把里面所有文件上传到 GitHub 仓库根目录。

仓库根目录必须直接看到：

```text
index.html
styles.css
app.js
assets
manifest.webmanifest
sw.js
.github
.nojekyll
```

不要出现：

```text
某个文件夹/index.html
```

也不要只上传 ZIP。

## Pages 设置

进入仓库：

```text
Settings → Pages
```

建议选择：

```text
Source: Deploy from a branch
Branch: main
Folder: /root
```

保存后等待 1–3 分钟。

访问地址通常是：

```text
https://你的GitHub用户名.github.io/仓库名/
```

## 如果出现 404

通常是因为 `index.html` 没在仓库根目录。请确认仓库第一层直接有 `index.html`。
