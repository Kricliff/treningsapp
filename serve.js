const http = require("http");
const fs = require("fs");
const path = require("path");

const port = 5757;
const root = __dirname;

const types = { ".html": "text/html", ".js": "application/javascript", ".json": "application/json" };

http.createServer((req, res) => {
  let filePath = req.url === "/" ? "/index.html" : req.url;
  filePath = path.join(root, decodeURIComponent(filePath.split("?")[0]));
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
    res.end(content);
  });
}).listen(port, () => console.log("Serving on http://localhost:" + port));
