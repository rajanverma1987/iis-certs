import fs from 'fs';
import http from 'http';
import https from 'https';
import path from 'path';
import * as acme from 'acme-client';
import forge from 'node-forge';
import { getDataDir, getSettings } from './settings.service';
import {
  dpapiProtect,
  dpapiUnprotect,
  generateStrongPassword,
  lockDownDirectory,
  secureUnlink,
  secureWriteFile,
} from './secure.service';
import {
  assertSafeAcmeToken,
  assertSafeDomains,
  assertSafeEmail,
} from './validation';

export type ProgressFn = (phase: string, message: string, percent: number) => void;

const ACCOUNT_KEY_FILE = 'account.key.dpapi';

// Let's Encrypt often closes keep-alive sockets; reusing them hangs forever.
acme.axios.defaults.httpAgent = new http.Agent({ keepAlive: false });
acme.axios.defaults.httpsAgent = new https.Agent({ keepAlive: false });
acme.axios.defaults.timeout = 30_000;
acme.axios.defaults.headers.common['Connection'] = 'close';

function accountDir(): string {
  const dir = path.join(getDataDir(), 'acme');
  lockDownDirectory(dir);
  return dir;
}

function accountKeyPath(): string {
  return path.join(accountDir(), ACCOUNT_KEY_FILE);
}

async function loadOrCreateAccountKey(): Promise<Buffer> {
  const file = accountKeyPath();
  if (fs.existsSync(file)) {
    const protectedKey = fs.readFileSync(file);
    return dpapiUnprotect(protectedKey);
  }

  const legacy = path.join(accountDir(), 'account.key');
  if (fs.existsSync(legacy)) {
    const plain = fs.readFileSync(legacy);
    const protectedKey = await dpapiProtect(plain);
    secureWriteFile(file, protectedKey);
    secureUnlink(legacy);
    return plain;
  }

  const key = await acme.crypto.createPrivateKey();
  const protectedKey = await dpapiProtect(key);
  secureWriteFile(file, protectedKey);
  return key;
}

function challengeDir(sitePhysicalPath: string): string {
  const resolved = path.resolve(sitePhysicalPath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error(`Site physical path is not a directory: ${sitePhysicalPath}`);
  }
  return path.join(resolved, '.well-known', 'acme-challenge');
}

function writeWebConfig(filePath: string, contents: string): void {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, contents, 'utf8');
  }
}

function ensureChallengeWebConfigs(sitePhysicalPath: string, challengeDirectory: string): void {
  const wellKnownDir = path.dirname(challengeDirectory);
  fs.mkdirSync(challengeDirectory, { recursive: true });

  // Allow serving under /.well-known (IIS may treat it as a hidden segment)
  writeWebConfig(
    path.join(wellKnownDir, 'web.config'),
    `<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <security>
      <requestFiltering>
        <hiddenSegments>
          <remove segment="web.config" />
        </hiddenSegments>
      </requestFiltering>
    </security>
  </system.webServer>
</configuration>
`,
  );

  writeWebConfig(
    path.join(challengeDirectory, 'web.config'),
    `<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <staticContent>
      <remove fileExtension="." />
      <mimeMap fileExtension="." mimeType="text/plain" />
    </staticContent>
    <handlers>
      <clear />
      <add name="StaticFile" path="*" verb="*" modules="StaticFileModule" resourceType="Either" requireAccess="Read" />
    </handlers>
    <security>
      <requestFiltering allowDoubleEscaping="false">
        <fileExtensions allowUnlisted="true">
          <remove fileExtension="." />
          <add fileExtension="." allowed="true" />
        </fileExtensions>
        <hiddenSegments>
          <remove segment="web.config" />
        </hiddenSegments>
      </requestFiltering>
    </security>
  </system.webServer>
</configuration>
`,
  );
}

function writeChallengeFile(
  sitePhysicalPath: string,
  token: string,
  keyAuthorization: string,
): string {
  const safeToken = assertSafeAcmeToken(token);
  if (keyAuthorization.length > 1024 || /[\r\n\0]/.test(keyAuthorization)) {
    throw new Error('Invalid ACME key authorization payload.');
  }

  const dir = challengeDir(sitePhysicalPath);
  ensureChallengeWebConfigs(sitePhysicalPath, dir);
  const filePath = path.join(dir, safeToken);
  if (path.dirname(filePath) !== dir) {
    throw new Error('ACME challenge path traversal blocked.');
  }
  fs.writeFileSync(filePath, keyAuthorization, 'utf8');
  return filePath;
}

function cleanupChallengeFiles(files: string[]): void {
  for (const file of files) {
    secureUnlink(file);
  }
}

function buildPfx(
  privateKeyPem: string,
  certificatePem: string,
  password: string,
): Buffer {
  const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);
  const certs = certificatePem
    .split(/(?=-----BEGIN CERTIFICATE-----)/g)
    .map((c) => c.trim())
    .filter(Boolean)
    .map((pem) => forge.pki.certificateFromPem(pem));

  if (certs.length === 0) {
    throw new Error('No certificates returned from ACME');
  }

  const asn1 = forge.pkcs12.toPkcs12Asn1(privateKey, certs, password, {
    algorithm: 'aes256',
  });
  const der = forge.asn1.toDer(asn1).getBytes();
  return Buffer.from(der, 'binary');
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function fetchChallengeBody(url: string, timeoutMs: number): Promise<{
  status: number;
  body: string;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { Connection: 'close', Accept: '*/*' },
    });
    const body = (await response.text()).trim();
    return { status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Confirm the challenge URL is reachable before asking Let's Encrypt.
 * Fails fast with actionable errors instead of hanging on verifyChallenge.
 */
async function assertChallengeReachable(
  domain: string,
  token: string,
  expectedBody: string,
  onProgress: ProgressFn,
): Promise<void> {
  const url = `http://${domain}/.well-known/acme-challenge/${token}`;
  onProgress('challenge', `Checking ${url}`, 48);

  let lastError = '';
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const { status, body } = await fetchChallengeBody(url, 12_000);
      if (status !== 200) {
        lastError = `HTTP ${status} from ${url}`;
      } else if (body !== expectedBody.trim()) {
        lastError =
          `Challenge file content mismatch at ${url}. IIS may not be serving the extensionless file (check web.config / static content).`;
      } else {
        onProgress('challenge', `Challenge URL OK for ${domain}`, 50);
        return;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      lastError = msg.includes('abort')
        ? `Timed out fetching ${url}`
        : `Could not fetch ${url}: ${msg}`;
    }
    if (attempt < 3) {
      onProgress('challenge', `Retry ${attempt}/3 — ${lastError}`, 48);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  throw new Error(
    `${lastError}. Ensure DNS for ${domain} points to this server, Windows Firewall allows TCP 80, and IIS serves http://${domain}/.well-known/acme-challenge/`,
  );
}

export interface IssuedCertificate {
  domains: string[];
  pfx: Buffer;
  pfxPassword: string;
}

export async function issueCertificate(options: {
  domains: string[];
  sitePhysicalPath: string;
  onProgress?: ProgressFn;
}): Promise<IssuedCertificate> {
  const settings = getSettings();
  const email = assertSafeEmail(settings.contactEmail);
  const domains = assertSafeDomains(options.domains);

  const onProgress = options.onProgress ?? (() => undefined);
  const directoryUrl = acme.directory.letsencrypt.production;

  onProgress('account', 'Using Let\'s Encrypt production', 5);

  const accountKey = await loadOrCreateAccountKey();
  const client = new acme.Client({
    directoryUrl,
    accountKey,
    backoffAttempts: 8,
    backoffMin: 3000,
    backoffMax: 15000,
  });

  onProgress('account', 'Registering / ensuring ACME account', 10);
  await withTimeout(
    client.createAccount({
      termsOfServiceAgreed: true,
      contact: [`mailto:${email}`],
    }),
    60_000,
    'ACME account registration',
  );

  onProgress('order', `Creating order for ${domains.join(', ')}`, 20);
  const order = await withTimeout(
    client.createOrder({
      identifiers: domains.map((domain) => ({ type: 'dns', value: domain })),
    }),
    60_000,
    'ACME create order',
  );

  const authorizations = await withTimeout(
    client.getAuthorizations(order),
    60_000,
    'ACME get authorizations',
  );
  const challengeFiles: string[] = [];

  try {
    let index = 0;
    for (const authz of authorizations) {
      index += 1;
      const domain = authz.identifier.value;
      assertSafeDomainOrThrow(domain);

      if (authz.status === 'valid') {
        onProgress('challenge', `${domain} already authorized`, 55);
        continue;
      }

      const challenge = authz.challenges.find((c) => c.type === 'http-01');
      if (!challenge) {
        throw new Error(`No http-01 challenge available for ${domain}`);
      }

      const keyAuthorization = await client.getChallengeKeyAuthorization(challenge);
      const filePath = writeChallengeFile(
        options.sitePhysicalPath,
        challenge.token,
        keyAuthorization,
      );
      challengeFiles.push(filePath);

      onProgress(
        'challenge',
        `Wrote HTTP-01 file for ${domain} → /.well-known/acme-challenge/${challenge.token}`,
        40,
      );

      await assertChallengeReachable(domain, challenge.token, keyAuthorization, onProgress);

      onProgress('challenge', `Asking Let's Encrypt to validate ${domain}`, 52);
      await withTimeout(
        client.completeChallenge(challenge),
        60_000,
        `completeChallenge(${domain})`,
      );

      onProgress('challenge', `Waiting for Let's Encrypt validation of ${domain}…`, 55);
      await withTimeout(
        client.waitForValidStatus(challenge),
        180_000,
        `Let's Encrypt validation for ${domain}`,
      );
      onProgress('challenge', `${domain} validated`, 58);
    }

    onProgress('csr', 'Generating CSR and finalizing order', 65);
    const [keyPem, csrPem] = await acme.crypto.createCsr({
      commonName: domains[0],
      altNames: domains,
    });

    await withTimeout(client.finalizeOrder(order, csrPem), 120_000, 'finalizeOrder');
    onProgress('download', 'Downloading issued certificate', 85);
    const certificatePem = await withTimeout(
      client.getCertificate(order),
      120_000,
      'getCertificate',
    );

    const pfxPassword = generateStrongPassword(32);
    const pfx = buildPfx(keyPem.toString(), certificatePem, pfxPassword);

    onProgress('issued', 'Certificate issued successfully', 95);

    return {
      domains,
      pfx,
      pfxPassword,
    };
  } finally {
    cleanupChallengeFiles(challengeFiles);
  }
}

function assertSafeDomainOrThrow(domain: string): void {
  assertSafeDomains([domain]);
}
