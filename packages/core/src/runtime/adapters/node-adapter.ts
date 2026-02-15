/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { RuntimeAdapter } from "../runtime-adapter.js";
import fs from "fs-extra";
import path from "path";
import { spawn, exec } from "child_process";
import chokidar from "chokidar";
import express from "express";

export class NodeAdapter implements RuntimeAdapter {
  async readFile(filePath: string): Promise<string> {
    return fs.readFile(filePath, "utf-8");
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    return fs.writeFile(filePath, content, "utf-8");
  }

  async readDir(dirPath: string): Promise<string[]> {
    const entries = await fs.readdir(dirPath);
    const filtered: string[] = [];
    for (const entry of entries) {
      const stat = await fs.stat(path.join(dirPath, entry));
      if (!stat.isDirectory()) filtered.push(entry);
    }
    return filtered;
  }

  async exists(filePath: string): Promise<boolean> {
    return fs.pathExists(filePath);
  }

  spawn(command: string, args: string[]): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args);
      proc.on("error", reject);
      proc.on("exit", resolve);
    });
  }

  exec(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      exec(command, (error, stdout) => {
        if (error) reject(error);
        else resolve(stdout);
      });
    });
  }

  createServer(): unknown {
    return express();
  }

  join(...pathsArr: string[]): string {
    return path.join(...pathsArr);
  }

  resolve(...pathsArr: string[]): string {
    return path.resolve(...pathsArr);
  }

  dirname(filePath: string): string {
    return path.dirname(filePath);
  }

  basename(filePath: string, ext?: string): string {
    return path.basename(filePath, ext);
  }

  watchFiles(
    watchPath: string,
    callback: (event: string, filename: string) => void,
  ): unknown {
    return chokidar
      .watch(watchPath, { persistent: true })
      .on("change", callback);
  }

  async bundle(entry: string, options: unknown): Promise<unknown> {
    // Use SWITE builder instead of Vite
    // Dynamic import - types will be available at runtime
    const switeModule = await import("@swissjs/swite");

    const root = process.cwd();
    const builder = new switeModule.SwiteBuilder({
      root,
      entry,
      outDir:
        options &&
        typeof options === "object" &&
        "outDir" in (options as Record<string, unknown>)
          ? String((options as Record<string, unknown>).outDir)
          : "dist",
      minify:
        options &&
        typeof options === "object" &&
        "minify" in (options as Record<string, unknown>)
          ? Boolean((options as Record<string, unknown>).minify)
          : true,
      sourcemap:
        options &&
        typeof options === "object" &&
        "sourcemap" in (options as Record<string, unknown>)
          ? Boolean((options as Record<string, unknown>).sourcemap)
          : false,
    });

    try {
      await builder.build();
      return Promise.resolve(undefined);
    } catch (error) {
      return Promise.reject(error);
    }
  }
}
