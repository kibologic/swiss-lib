import { UiCompiler } from 'file:///C:/Users/themb/Documents/dev/office/departments/engineering/projects/active/kibologic/swiss-lib/packages/compiler/dist/index.js';
const compiler = new UiCompiler();
const source = `state { let count: number = 0; }\nstate { let name: string = ''; }\n\nrender() {\n  return (\n    <div>{this.count}</div>\n  );\n}`;
try {
  const result = await compiler.compileAsync(source, 'test.uix');
  console.log('--- COMPILER OUTPUT START ---');
  console.log(result);
  console.log('--- COMPILER OUTPUT END ---');
} catch (err) {
  console.error('Compiler Error:', err);
}
