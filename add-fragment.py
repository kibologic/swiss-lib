#!/usr/bin/env python3
import sys

# Read the file
with open('packages/core/src/renderer/renderer.ts', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Add Fragment import after line 8
lines.insert(8, 'import { Fragment } from "../vdom/vdom.js";\n')

# Add isFragmentVNode type guard after isComponentVNode (around line 38 now)
fragment_guard = '''
function isFragmentVNode(vnode: VNode): vnode is VElement {
  return typeof vnode === 'object' && vnode !== null && 'type' in vnode && vnode.type === Fragment;
}
'''
lines.insert(38, fragment_guard)

# Find createDOMNode function and add Fragment handling
for i, line in enumerate(lines):
    if 'if (isTextVNode(vnode))' in line and 'createDOMNode' in lines[i-2]:
        # Insert Fragment check before isElementVNode
        fragment_handling = '''    } else if (isFragmentVNode(vnode)) {
      // Fragment: render children directly
      const fragment = document.createDocumentFragment();
      (vnode.children || []).forEach((child: VNode) => fragment.appendChild(createDOMNode(child)));
      if (fragment.childNodes.length === 1) {
        return fragment.childNodes[0];
      } else if (fragment.childNodes.length === 0) {
        return document.createTextNode('');
      }
      const wrapper = document.createElement('div');
      wrapper.appendChild(fragment);
      return wrapper;
'''
        # Find the line with "} else if (isElementVNode(vnode))"
        for j in range(i, min(i+10, len(lines))):
            if 'isElementVNode(vnode)' in lines[j]:
                lines.insert(j, fragment_handling)
                break
        break

# Write back
with open('packages/core/src/renderer/renderer.ts', 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("Fragment support added successfully!")
