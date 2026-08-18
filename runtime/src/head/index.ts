/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

export {
  pushHeadContext,
  popHeadContext,
  currentHeadContext,
  createHeadConfig,
  renderHeadToString,
  htmlAttrsString,
  bodyAttrsString,
  type HeadConfig,
  type HeadInput,
  type HeadMeta,
  type HeadLink,
} from "./head-context.js";

export { useHead, setTitle, addMeta, addLink, collectHead } from "./use-head.js";
