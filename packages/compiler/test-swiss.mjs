// Test script to compile Swiss syntax
import { UiCompiler } from './dist/compiler.js';
import { readFileSync, writeFileSync } from 'fs';

const compiler = new UiCompiler();
const source = readFileSync('./test-component.ui', 'utf-8');

console.log('=== Original Swiss Syntax ===');
console.log(source);
console.log('\n=== Compiled Output ===');

compiler.compileFile('./test-component.ui', './test-component.js').then(() => {
    const output = readFileSync('./test-component.js', 'utf-8');
    console.log(output);
    console.log('\n✅ Compilation successful!');
}).catch(err => {
    console.error('❌ Compilation failed:', err);
    process.exit(1);
});
