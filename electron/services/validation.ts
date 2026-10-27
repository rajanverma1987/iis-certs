const EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
const DOMAIN_RE = /^(?=.{1,253}$)(?!-)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
const SITE_ID_RE = /^\d{1,10}$/;
const THUMBPRINT_RE = /^[A-F0-9]{40}$/;
const ACME_TOKEN_RE = /^[A-Za-z0-9_-]{1,128}$/;

export function assertSafeEmail(email: string): string {
  const value = email.trim().toLowerCase();
  if (!EMAIL_RE.test(value) || value.length > 254) {
    throw new Error('Invalid contact email address.');
  }
  return value;
}

export function assertSafeDomain(domain: string): string {
  const value = domain.trim().toLowerCase();
  if (!DOMAIN_RE.test(value)) {
    throw new Error(`Invalid domain name: ${domain}`);
  }
  if (value.endsWith('.local') || value.endsWith('.localhost') || value === 'localhost') {
    throw new Error(`Domain is not publicly validatable: ${domain}`);
  }
  return value;
}

export function assertSafeDomains(domains: string[]): string[] {
  if (!domains.length) {
    throw new Error('At least one domain is required.');
  }
  if (domains.length > 100) {
    throw new Error('Too many domains on one certificate (max 100).');
  }
  return domains.map(assertSafeDomain);
}

export function assertSafeSiteId(siteId: unknown): string {
  if (typeof siteId !== 'string' || !SITE_ID_RE.test(siteId)) {
    throw new Error('Invalid IIS site id.');
  }
  return siteId;
}

export function assertSafeThumbprint(thumbprint: string): string {
  const value = thumbprint.replace(/\s+/g, '').toUpperCase();
  if (!THUMBPRINT_RE.test(value)) {
    throw new Error('Invalid certificate thumbprint.');
  }
  return value;
}

export function assertSafeAcmeToken(token: string): string {
  if (!ACME_TOKEN_RE.test(token)) {
    throw new Error('Invalid ACME challenge token.');
  }
  return token;
}

export function assertSafeStoreName(storeName: string): string {
  if (storeName !== 'WebHosting' && storeName !== 'My') {
    throw new Error('Invalid certificate store name.');
  }
  return storeName;
}

export function assertSafeSiteName(siteName: string): string {
  const value = siteName.trim();
  if (!value || value.length > 200) {
    throw new Error('Invalid IIS site name.');
  }
  // Block PowerShell metacharacters that should never appear in site names we inject
  if (/[`$]|(\r|\n)/.test(value)) {
    throw new Error('IIS site name contains unsafe characters.');
  }
  return value;
}
