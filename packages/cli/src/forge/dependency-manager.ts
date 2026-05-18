/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import { spawn } from 'child_process';
import type { DependencyInstallOptions } from '../types/template.types.js';

export class DependencyManager {
  async installDependencies(
    projectPath: string,
    dependencies: string[],
    options: DependencyInstallOptions
  ): Promise<void> {
    const { packageManager = 'npm', dev = false, skipInstall = false } = options;

    if (skipInstall || dependencies.length === 0) return;

    const args: string[] = ['add'];
    if (dev) {
      if (packageManager === 'yarn') args.push('--dev');
      else args.push('-D');
    }
    args.push(...dependencies);

    await this.run(packageManager, args, projectPath);
  }

  async addDependency(name: string, version: string, dev: boolean = false): Promise<void> {
    await this.installDependencies(process.cwd(), [`${name}@${version}`], {
      packageManager: 'npm',
      dev,
    });
  }

  async initGit(projectPath: string): Promise<void> {
    await this.run('git', ['init'], projectPath);
  }

  private run(cmd: string, args: string[], cwd: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const child = spawn(cmd, args, {
        cwd,
        stdio: 'inherit',
        shell: process.platform === 'win32',
      });
      child.on('close', code => {
        if (code === 0) resolve();
        else reject(new Error(`'${cmd}' exited with code ${code}`));
      });
      child.on('error', reject);
    });
  }
}
