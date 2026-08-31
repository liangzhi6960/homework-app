// 极简静态文件服务器：node server.js
// 用途：让手机和电脑能通过网址访问「作业小管家」，并支持安装到桌面
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const PORT = process.env.PORT || 8080;

http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  } catch (e) {
    urlPath = '/';
  }
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(root, path.normalize(urlPath));

  // 防止越出根目录
  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, buf) => {
    if (err) {
      res.writeHead(404);
      res.end('404 Not Found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': types[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(buf);
  });
}).listen(PORT, () => {
  const os = require('os');
  const ifaces = os.networkInterfaces();
  const ips = [];
  Object.values(ifaces).forEach(list => {
    (list || []).forEach(item => {
      if (item.family === 'IPv4' && !item.internal) ips.push(item.address);
    });
  });
  console.log('作业小管家已启动！');
  console.log('  电脑访问:   http://localhost:' + PORT);
  ips.forEach(ip => console.log('  手机访问(同一WiFi): http://' + ip + ':' + PORT));
  console.log('  按 Ctrl+C 停止服务');
});
