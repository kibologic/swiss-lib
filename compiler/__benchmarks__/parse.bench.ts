/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import { bench, describe } from 'vitest';
import { parseTemplate } from '../src/template-parser.js';

// ~1000-line realistic template: a data-table page with nested structure,
// expressions, slots, components, and mixed static/dynamic attributes.
function buildLargeTemplate(): string {
  const rows = Array.from({ length: 80 }, (_, i) => `
  <TableRow key={row${i}.id} class={row${i}.selected ? 'selected' : ''}>
    <TableCell>{row${i}.index}</TableCell>
    <TableCell>
      <Avatar src={row${i}.avatar} alt={row${i}.name} size="sm" />
      <span class="name">{row${i}.name}</span>
    </TableCell>
    <TableCell>{row${i}.email}</TableCell>
    <TableCell>
      <Badge variant={row${i}.status === 'active' ? 'success' : 'danger'}>
        {row${i}.status}
      </Badge>
    </TableCell>
    <TableCell>
      <Button variant="ghost" size="xs" onClick={handleEdit(row${i}.id)}>Edit</Button>
      <Button variant="ghost" size="xs" onClick={handleDelete(row${i}.id)}>Delete</Button>
    </TableCell>
  </TableRow>`).join('\n');

  return `
<Page>
  <PageHeader>
    <Breadcrumb>
      <BreadcrumbItem href="/">Home</BreadcrumbItem>
      <BreadcrumbItem href="/users">Users</BreadcrumbItem>
      <BreadcrumbItem active>User List</BreadcrumbItem>
    </Breadcrumb>
    <div class="header-actions">
      <SearchInput
        value={searchQuery}
        onChange={handleSearchChange}
        placeholder="Search users..."
        debounce={300}
      />
      <Button variant="primary" onClick={handleCreate}>
        <Icon name="plus" />
        Add User
      </Button>
    </div>
  </PageHeader>

  <FilterBar>
    <FilterGroup label="Status">
      <Checkbox checked={filters.active} onChange={toggleFilter('active')}>Active</Checkbox>
      <Checkbox checked={filters.inactive} onChange={toggleFilter('inactive')}>Inactive</Checkbox>
      <Checkbox checked={filters.pending} onChange={toggleFilter('pending')}>Pending</Checkbox>
    </FilterGroup>
    <FilterGroup label="Role">
      <Select value={filters.role} onChange={handleRoleFilter}>
        <option value="">All roles</option>
        <option value="admin">Admin</option>
        <option value="user">User</option>
        <option value="viewer">Viewer</option>
      </Select>
    </FilterGroup>
    <div class="filter-meta">
      <span>{filteredCount} of {totalCount} users</span>
      <Button variant="ghost" size="sm" onClick={clearFilters}>Clear</Button>
    </div>
  </FilterBar>

  <DataTable
    rows={users}
    sortBy={sortConfig.key}
    sortDir={sortConfig.dir}
    onSort={handleSort}
    loading={isLoading}
    emptyMessage="No users match the current filters"
  >
    <slot name="header">
      <TableHeader>
        <TableHeaderCell sortKey="index" width="60px">#</TableHeaderCell>
        <TableHeaderCell sortKey="name">Name</TableHeaderCell>
        <TableHeaderCell sortKey="email">Email</TableHeaderCell>
        <TableHeaderCell sortKey="status" width="120px">Status</TableHeaderCell>
        <TableHeaderCell width="160px">Actions</TableHeaderCell>
      </TableHeader>
    </slot>
    <slot name="body">
      <TableBody>
        ${rows}
      </TableBody>
    </slot>
    <slot name="footer">
      <Pagination
        page={page}
        pageSize={pageSize}
        total={totalCount}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
        pageSizes={[10, 25, 50, 100]}
      />
    </slot>
  </DataTable>

  <ConfirmDialog
    open={deleteDialog.open}
    title="Delete User"
    message={"Are you sure you want to delete " + deleteDialog.userName + "?"}
    confirmLabel="Delete"
    cancelLabel="Cancel"
    variant="danger"
    onConfirm={handleConfirmDelete}
    onCancel={handleCancelDelete}
  />
</Page>`;
}

const largeTemplate = buildLargeTemplate();

describe('compiler parse', () => {
  bench('parse large template (~1000 lines)', () => {
    parseTemplate(largeTemplate);
  });

  bench('parse small template (single element)', () => {
    parseTemplate('<div class="hello">{greeting}</div>');
  });

  bench('parse component tree (10 nested components)', () => {
    parseTemplate(`
      <App>
        <Router>
          <Layout>
            <Header title={appTitle} />
            <Sidebar items={navItems} active={currentRoute} />
            <Main>
              <PageContent>
                <Card>
                  <slot />
                </Card>
              </PageContent>
            </Main>
            <Footer />
          </Layout>
        </Router>
      </App>
    `);
  });
});
