# SWISS Build Strategy for Module Development

> **Note:** Alpine and skltn have been removed from the SWS monorepo. References to them in this doc are historical.

## Overview
This document outlines the recommended build strategy for developing and testing individual modules in the SWISS ecosystem.

## Build Strategy Options

### Option 1: Standalone Test Pages (Recommended for Development)
**Best for**: Individual component testing and development

**Structure**:
```
SwissEnterpriseRepo/
  apps/
    alpine/              # Main app
    component-tests/     # New test app
      cart-test/         # Test page for cart
      pos-terminal-test/ # Test page for POS Terminal
```

**Pros**:
- Isolated testing environment
- Easy to test components in isolation
- Can test different configurations
- No interference with main app

**Cons**:
- Requires creating test apps
- More setup overhead

**Implementation**:
1. Create `apps/component-tests/` directory
2. Each test app has its own `package.json`, `src/`, `public/`
3. Use SWISS CLI to build/run each test app
4. Test components with mock data and various scenarios

---

### Option 2: Component Playground (Storybook-style)
**Best for**: Comprehensive component documentation and testing

**Structure**:
```
SwissEnterpriseRepo/
  apps/
    alpine/
    playground/          # Component playground app
      src/
        pages/
          SkltnShowcase.uix
          CartShowcase.uix
          PosTerminalShowcase.uix
```

**Pros**:
- Single app for all component tests
- Easy navigation between components
- Can showcase all components together
- Good for documentation

**Cons**:
- All components in one app (potential conflicts)
- More complex routing/navigation

**Implementation**:
1. Create `apps/playground/` directory
2. Build a simple navigation system
3. Each component gets its own showcase page
4. Use Alpine's Shell component for navigation

---

### Option 3: In-App Testing (Current Approach)
**Best for**: Integration testing within Alpine

**Structure**:
```
SwissEnterpriseRepo/
  apps/
    alpine/
      src/
        modules/
          skltn-test/
          cart-test/
          pos-terminal-test/
```

**Pros**:
- Tests components in real app context
- Easy to see how components integrate
- No additional apps needed

**Cons**:
- Can interfere with main app development
- Harder to isolate issues
- Requires careful module management

---

## Recommended Strategy: Hybrid Approach

### Phase 1: Standalone Test Pages (Sprints 2-4)
- Create dedicated test apps for each module
- Test components in isolation
- Verify build system works for each module
- Document component APIs and usage

### Phase 2: Integration Testing (Sprint 5)
- Integrate tested components into Alpine
- Test component interactions
- Verify full app functionality
- Refine based on integration findings

## Build Commands for Each Module

### Building Individual Modules

#### skltn (Library)
```bash
cd lib/skltn
npm run build  # Uses SWISS CLI
```

#### cart (Package)
```bash
cd packages/cart
npm run build  # Uses SWISS CLI
```

#### Alpine App (with all dependencies)
```bash
cd apps/alpine
npm run build  # Uses SWISS CLI, includes all workspace deps
```

### Testing Individual Modules

#### Standalone Test App
```bash
cd apps/skltn-test
npm run dev    # Start dev server
npm run build  # Build for production
```

## Module Build Requirements

### Each Module Must:
1. ✅ Have `package.json` with SWISS build scripts
2. ✅ Have `tsconfig.json` for TypeScript compilation
3. ✅ Export source files (`.ui`/`.uix`) in `exports` field
4. ✅ Use SWISS CLI for building (`node ../../../SWISS/packages/cli/dist/index.js build`)
5. ✅ Be buildable standalone (if no dependencies) OR with dependencies

### Build Verification Checklist

For each module sprint:
- [ ] Module builds standalone (if applicable)
- [ ] Module builds with dependencies (if applicable)
- [ ] Module works in dev server
- [ ] Module works in production build
- [ ] Module exports are correct
- [ ] Module can be imported by other modules
- [ ] Module tests pass (if tests exist)

## Sprint-Specific Build Tasks

### Sprint 2: SKLTN
- [ ] Build skltn library standalone
- [ ] Test skltn components in isolation
- [ ] Verify Shell component renders correctly
- [ ] Test slot functionality
- [ ] Verify design tokens work
- [ ] Build skltn with test app

### Sprint 3: CART
- [ ] Build cart package standalone
- [ ] Test cart components individually
- [ ] Test PosProvider context
- [ ] Test PosTerminal component
- [ ] Test ProductBrowser component
- [ ] Build cart with test app

### Sprint 4: POS TERMINAL
- [ ] Build PosTerminal component
- [ ] Test POS workflows
- [ ] Test cart integration
- [ ] Test product management
- [ ] Test checkout flow
- [ ] Build POS Terminal with test app

### Sprint 5: ALPINE REDESIGN
- [ ] Integrate all modules into Alpine
- [ ] Test full app build
- [ ] Test module interactions
- [ ] Verify production build
- [ ] Test all workflows end-to-end

## Notes

- **Always build from the module's directory** using its own build script
- **Test both dev and production builds** for each module
- **Verify workspace package resolution** works correctly
- **Check that exports are correct** in `package.json`
- **Ensure no circular dependencies** between modules

