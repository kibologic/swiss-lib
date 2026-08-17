/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

/**
 * @swissjs/testing — official component testing library for SwissJS.
 *
 * `render()` mounts a component through the real SwissApp/renderer mount path
 * (see render.ts). Queries (getByText/getByRole/getByTestId and their
 * query/find/getAll/queryAll variants) read the real mounted DOM. `fireEvent`
 * dispatches real DOM events and drains the real UpdateManager scheduler
 * (see flush.ts) so reactive updates are visible immediately after. `waitFor`
 * polls for async/reactive updates using the same scheduler drain.
 */

export { render, cleanup, flushUpdates, type RenderOptions, type RenderResult } from "./render.js";
export { fireEvent, userEvent, type EventInit } from "./fire-event.js";
export { waitFor, type WaitForOptions } from "./wait-for.js";
export { SwissTestingError, createQueries, type BoundQueries, type CreateQueriesOptions } from "./queries.js";
export { setupAutoCleanup } from "./setup.js";
