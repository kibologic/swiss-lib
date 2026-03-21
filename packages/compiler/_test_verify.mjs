import { UiCompiler } from './dist/index.js';
const compiler = new UiCompiler();
const source = `state { let count: number = 0; }\nrender() {\n  return (<div>{this.count}</div>);\n}`;
const result = await compiler.compileAsync(source, 'test.uix');
console.log(result);
