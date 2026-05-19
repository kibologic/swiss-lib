
import { SwissComponent, createElement } from '@swissjs/core';
import { _getActiveRouter } from './router-registry.js';

export interface LinkProps {
    to: string;
    replace?: boolean;
    class?: string;
    activeClass?: string;
    children?: unknown;
    [key: string]: unknown;
}

export class Link extends SwissComponent {
    declare props: LinkProps;

    private handleClick = (e: MouseEvent) => {
        e.preventDefault();
        const router = _getActiveRouter();
        if (!router) return;
        if (this.props.replace) {
            router.replace(this.props.to);
        } else {
            router.push(this.props.to);
        }
    };

    render() {
        const { to, replace: _replace, activeClass, class: className, children, ...rest } = this.props;

        const isActive = typeof window !== 'undefined' && window.location.pathname === to;
        const resolvedClass = [className, isActive && activeClass].filter(Boolean).join(' ') || undefined;

        return createElement('a', {
            href: to,
            onClick: this.handleClick,
            ...(resolvedClass ? { class: resolvedClass } : {}),
            ...rest,
        }, children as any);
    }
}
