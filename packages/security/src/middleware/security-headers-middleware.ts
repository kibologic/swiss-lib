export interface SecurityHeadersOptions {
  contentSecurityPolicy?: string;
  crossOriginEmbedderPolicy?: boolean;
  crossOriginOpenerPolicy?: boolean;
  crossOriginResourcePolicy?: string;
  dnsPrefetchControl?: boolean;
  frameOptions?: 'DENY' | 'SAMEORIGIN' | 'ALLOW-FROM';
  hsts?: boolean | { maxAge: number; includeSubDomains?: boolean; preload?: boolean };
  ieNoOpen?: boolean;
  noSniff?: boolean;
  originAgentCluster?: boolean;
  permittedCrossDomainPolicies?: boolean;
  referrerPolicy?: string;
  xssProtection?: boolean;
}

export function createSecurityHeadersMiddleware(options: SecurityHeadersOptions = {}) {
  return (_req: any, res: any, next: any) => {
    // Content Security Policy
    if (options.contentSecurityPolicy) {
      res.set('Content-Security-Policy', options.contentSecurityPolicy);
    }
    
    // Cross Origin Embedder Policy
    if (options.crossOriginEmbedderPolicy) {
      res.set('Cross-Origin-Embedder-Policy', 'require-corp');
    }
    
    // Cross Origin Opener Policy
    if (options.crossOriginOpenerPolicy) {
      res.set('Cross-Origin-Opener-Policy', 'same-origin');
    }
    
    // Cross Origin Resource Policy
    if (options.crossOriginResourcePolicy) {
      res.set('Cross-Origin-Resource-Policy', options.crossOriginResourcePolicy);
    }
    
    // DNS Prefetch Control
    if (options.dnsPrefetchControl !== false) {
      res.set('X-DNS-Prefetch-Control', 'off');
    }
    
    // Frame Options
    if (options.frameOptions) {
      res.set('X-Frame-Options', options.frameOptions);
    }
    
    // HTTP Strict Transport Security
    if (options.hsts) {
      if (typeof options.hsts === 'boolean') {
        res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      } else {
        let value = `max-age=${options.hsts.maxAge}`;
        if (options.hsts.includeSubDomains) value += '; includeSubDomains';
        if (options.hsts.preload) value += '; preload';
        res.set('Strict-Transport-Security', value);
      }
    }
    
    // IE No Open
    if (options.ieNoOpen !== false) {
      res.set('X-Download-Options', 'noopen');
    }
    
    // No Sniff
    if (options.noSniff !== false) {
      res.set('X-Content-Type-Options', 'nosniff');
    }
    
    // Origin Agent Cluster
    if (options.originAgentCluster !== false) {
      res.set('Origin-Agent-Cluster', '?1');
    }
    
    // Permitted Cross Domain Policies
    if (options.permittedCrossDomainPolicies !== false) {
      res.set('X-Permitted-Cross-Domain-Policies', 'none');
    }
    
    // Referrer Policy
    if (options.referrerPolicy) {
      res.set('Referrer-Policy', options.referrerPolicy);
    }
    
    // XSS Protection
    if (options.xssProtection !== false) {
      res.set('X-XSS-Protection', '1; mode=block');
    }
    
    next();
  };
}
