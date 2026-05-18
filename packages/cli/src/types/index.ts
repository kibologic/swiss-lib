/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

export interface TemplateMetadata {
    name: string;
    type: string;
    version: string;
    description: string;
    author: string;
    tags: string[];
    capabilities: string[];
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
    source: 'builtin' | 'community';
    path: string;
    createdAt: string;
    updatedAt: string;
    repository?: string;
  }
  
  export interface TemplateRegistry {
    version: string;
    templates: TemplateMetadata[];
    lastUpdated: string;
  }
  
  export interface RegistryConfig {
    registryPath: string;
    templatesPath: string;
    defaultRegistry?: string;
  }
  
  export interface GenerationOptions {
    outputPath: string;
    templatePath: string;
    variables: Record<string, unknown>;
    overwrite?: boolean;
    skipInstall?: boolean;
    skipGit?: boolean;
    dryRun?: boolean;
    verbose?: boolean;
  }
  
  export interface ValidatorConfig {
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    message?: string;
  }

  export interface FilterConfig {
    toLowerCase?: boolean;
    trim?: boolean;
    kebabCase?: boolean;
  }

  export interface TransformerConfig {
    preview?: boolean;
  }