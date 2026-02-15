import { Command } from "commander";

interface DevOptions {
  port: string;
  host: string;
  open: boolean;
}

export const devCommand = new Command("dev")
  .description("Start SWITE development server")
  .option("-p, --port <port>", "Port number", "3000")
  .option("-h, --host <host>", "Host name", "localhost")
  .option("--hmr-port <port>", "HMR WebSocket port (default: auto-detect)")
  .option("--no-open", "Do not open browser")
  .action(async (options: DevOptions & { hmrPort?: string }) => {
    // Use tsx to handle TypeScript compilation at runtime
    const { SwiteServer } = await import("@swissjs/swite");
    const server = new SwiteServer({
      root: process.cwd(),
      publicDir: "public",
      port: parseInt(options.port),
      host: options.host,
      open: options.open,
      hmrPort: options.hmrPort ? parseInt(options.hmrPort) : undefined,
    });

    await server.start();
  });
