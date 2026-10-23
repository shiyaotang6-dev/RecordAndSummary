# 总结记录

总结记录是一款 Windows x64 单机日记应用，可记录每天做过的事，并按周、月自动汇总。记录只保存在当前 Windows 用户的本地设备，不会上传或同步。

## 下载

打开 GitHub 仓库的 **Releases** 页面，下载最新版本的安装程序或便携版 `.exe`。

## 构建

需要 Windows x64、Node.js 和 npm。在仓库根目录执行：

```powershell
cd work/shiri-desktop
npm ci
npm run build
```

构建结果写入 `outputs/installers`。安装程序创建快捷方式；便携版无需安装。

## 本地数据

应用使用 `%APPDATA%\ZongjieJilu` 保存记录和周/月感想。卸载不会删除该目录。新安装的首次启动会显示内置的通用演示记录；这些演示内容不是任何用户的本机日志，可在应用中删除。

## 版本

当前发布版本：1.0.4（Windows x64）。
