import fs from 'fs';
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

  // Migrate plaintext key if present from older builds
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

function ensureChallengeWebConfig(dir: string): void {
  const webConfigPath = path.join(dir, 'web.config');
  if (fs.existsSync(webConfigPath)) return;
  const webConfig = `<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <staticContent>
      <mimeMap fileExtension="." mimeType="text/plain" />
    </staticContent>
    <handlers>
      <clear />
      <add name="StaticFile" path="*" verb="*" modules="StaticFileModule" resourceType="Either" requireAccess="Read" />
    </handlers>
    <security>
      <requestFiltering>
        <fileExtensions>
          <remove fileExtension="." />
          <add fileExtension="." allowed="true" />
        </fileExtensions>
      </requestFiltering>
    </security>
  </system.webServer>
</configuration>
`;
  fs.writeFileSync(webConfigPath, webConfig, 'utf8');
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
  fs.mkdirSync(dir, { recursive: true });
  ensureChallengeWebConfig(dir);
  const filePath = path.join(dir, safeToken);
  // Prevent path traversal via token
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
  });

  onProgress('account', 'Registering / ensuring ACME account', 10);
  await client.createAccount({
    termsOfServiceAgreed: true,
    contact: [`mailto:${email}`],
  });

  onProgress('order', `Creating order for ${domains.join(', ')}`, 20);
  const order = await client.createOrder({
    identifiers: domains.map((domain) => ({ type: 'dns', value: domain })),
  });

  const authorizations = await client.getAuthorizations(order);
  const challengeFiles: string[] = [];

  try {
    let index = 0;
    for (const authz of authorizations) {
      index += 1;
      const domain = authz.identifier.value;
      assertSafeDomainOrThrow(domain);
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
        25 + Math.floor((index / authorizations.length) * 25),
      );

      await client.verifyChallenge(authz, challenge);
      await client.completeChallenge(challenge);
      await client.waitForValidStatus(challenge);
    }

    onProgress('csr', 'Generating CSR and finalizing order', 60);
    const [keyPem, csrPem] = await acme.crypto.createCsr({
      commonName: domains[0],
      altNames: domains,
    });

    await client.finalizeOrder(order, csrPem);
    onProgress('download', 'Downloading issued certificate', 80);
    const certificatePem = await client.getCertificate(order);

    const pfxPassword = generateStrongPassword(32);
    const pfx = buildPfx(keyPem.toString(), certificatePem, pfxPassword);

    onProgress('issued', 'Certificate issued successfully', 90);

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
