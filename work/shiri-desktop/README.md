# 总结记录 Windows 单机版

## Build

Install dependencies with `npm install`, then run:

- `npm run build:installer` to create a Windows setup executable.
- `npm run build:portable` to create a no-install executable.
- `npm start` to open the desktop app during development.

Build output is written to `outputs/installers`.

The app stores its records in the current Windows user's application data directory. It does not use a server or sync data between devices. Existing browser data is not copied automatically into the desktop app.
