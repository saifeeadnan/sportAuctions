import { io as ioClient } from "socket.io-client";

async function main() {
  const client = ioClient("http://localhost:3000", { path: "/socket.io", timeout: 5000 });

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out connecting to live server's socket.io endpoint")), 5000);
    client.on("connect", () => {
      clearTimeout(timer);
      resolve();
    });
    client.on("connect_error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });

  console.log(`OK: connected to live dev server's Socket.io endpoint, socket id=${client.id}`);
  client.disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
