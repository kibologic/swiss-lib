/**
 * CSS Compiler for Swiss components
 * Integrates with @kibologic/compiler to process CSS in .ui/.uix files
 */

import postcss from 'postcss';
import { transform } from 'lightningcss';
import { transformCSSModule } from '../modules/transformer.js';
import type { CSSModuleOptions } from '../modules/transformer.js';

export interface CSSCompilerOptions {
    modules?: boolean | CSSModuleOptions;
    minify?: boolean;
    autoprefixer?: boolean;
}

export interface CompiledCSS {
    code: string;
    map?: string;
    modules?: Record<string, string>;
}

/**
 * Compile CSS from Swiss component.
 * Runs CSS Modules scoping → PostCSS → lightningcss (minify + autoprefixer).
 */
export async function compileCSS(
    css: string,
    filename: string,
    options: CSSCompilerOptions = {}
): Promise<CompiledCSS> {
    let processedCSS = css;
    let modules: Record<string, string> | undefined;

    // CSS Modules scoping
    if (options.modules) {
        const moduleOptions = typeof options.modules === 'object' ? options.modules : {};
        const result = transformCSSModule(processedCSS, filename, moduleOptions);
        processedCSS = result.css;
        modules = result.exports;
    }

    // PostCSS — pipeline is live for future plugin additions (e.g. postcss-nesting)
    const postcssResult = await postcss([]).process(processedCSS, { from: filename, to: filename });
    processedCSS = postcssResult.css;

    // lightningcss: minification and vendor prefixing
    if (options.minify || options.autoprefixer) {
        const { code } = transform({
            filename,
            code: Buffer.from(processedCSS),
            minify: options.minify ?? false,
            // Basic modern browser targets for autoprefixing via lightningcss
            targets: options.autoprefixer
                ? { chrome: 100 << 16, firefox: 100 << 16, safari: 15 << 16 }
                : undefined,
        });
        processedCSS = new TextDecoder().decode(code);
    }

    return { code: processedCSS, modules };
}

/**
 * Extract CSS from Swiss component file
 */
export function extractCSS(componentSource: string): {
    css: string;
    isModule: boolean;
} | null {
    // Match <style> or <style module> tags
    const styleRegex = /<style(\s+module)?>([\s\S]*?)<\/style>/;
    const match = componentSource.match(styleRegex);

    if (!match) {
        return null;
    }

    return {
        css: match[2].trim(),
        isModule: !!match[1]
    };
}
