import http from "http";
import fs from "fs";
import path from "path";
import type { AddressInfo } from "net";

const FIXTURES_DIR = path.resolve(process.cwd(), "tests/fixtures/pages");

export function startFixtureServer(): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const filePath = path.join(
        FIXTURES_DIR,
        req.url === "/" ? "linkedin-jobs.html" : req.url!,
      );
      if (fs.existsSync(filePath)) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(fs.readFileSync(filePath));
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
    });
    server.listen(0, () => {
      const port = (server.address() as AddressInfo).port;
      resolve({ server, port });
    });
  });
}
