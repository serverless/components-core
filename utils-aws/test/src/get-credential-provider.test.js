'use strict';

const path = require('path');
const overrideEnv = require('process-utils/override-env');
const fse = require('fs-extra');

const getCredentialProvider = require('../../src/get-credential-provider');

const expect = require('chai').expect;

describe('test/src/get-credential-provider.test.js', () => {
  const defaultAccessKey = 'DEFAULTACCESS123';
  const defaultSecretKey = 'DEFAULTSECRET123';
  const namedAccessKey = 'NAMEDACCESS123';
  const namedSecretKey = 'NAMEDSECRET123';
  const otherAccessKey = 'OTHERACCESS123';
  const otherSecretKey = 'OTHERSECRET123';

  let restoreEnv;

  before(async () => {
    const awsDirPath = path.resolve('.aws');
    const credentialsFilePath = path.join(awsDirPath, 'credentials-file');
    await fse.outputFile(
      credentialsFilePath,
      [
        '[default]',
        `aws_access_key_id = ${defaultAccessKey}`,
        `aws_secret_access_key = ${defaultSecretKey}`,
        '[named]',
        `aws_access_key_id = ${namedAccessKey}`,
        `aws_secret_access_key = ${namedSecretKey}`,
        '[other]',
        `aws_access_key_id = ${otherAccessKey}`,
        `aws_secret_access_key = ${otherSecretKey}`,
      ].join('\n')
    );
    ({ restoreEnv } = overrideEnv({
      variables: { AWS_SHARED_CREDENTIALS_FILE: credentialsFilePath },
    }));
  });

  after(() => {
    restoreEnv();
  });

  it('recognizes explicit profile param', async () => {
    await overrideEnv(
      {
        whitelist: ['AWS_SHARED_CREDENTIALS_FILE'],
        variables: {
          AWS_ACCESS_KEY_ID: 'fromenvaccess123',
          AWS_SECRET_ACCESS_KEY: 'fromenvsecret123',
          AWS_PROFILE: 'named',
          AWS_DEFAULT_PROFILE: 'other',
        },
      },
      async () => {
        const provider = await getCredentialProvider({ profile: 'other' });
        expect(await provider()).to.deep.equal({
          accessKeyId: otherAccessKey,
          secretAccessKey: otherSecretKey,
          sessionToken: undefined,
        });
      }
    );
  });

  it('recognizes AWS_ACCESS_KEY_ID and AWS_ACCESS_SECRET_KEY_ID', async () => {
    await overrideEnv(
      {
        whitelist: ['AWS_SHARED_CREDENTIALS_FILE'],
        variables: {
          AWS_ACCESS_KEY_ID: 'fromenvaccess123',
          AWS_SECRET_ACCESS_KEY: 'fromenvsecret123',
          AWS_PROFILE: 'named',
          AWS_DEFAULT_PROFILE: 'other',
        },
      },
      async () => {
        const provider = await getCredentialProvider();
        expect(await provider()).to.deep.equal({
          accessKeyId: 'fromenvaccess123',
          secretAccessKey: 'fromenvsecret123',
        });
      }
    );
  });

  it('recognizes AWS_PROFILE', async () => {
    await overrideEnv(
      {
        whitelist: ['AWS_SHARED_CREDENTIALS_FILE'],
        variables: { AWS_PROFILE: 'named', AWS_DEFAULT_PROFILE: 'other' },
      },
      async () => {
        const provider = await getCredentialProvider();
        expect(await provider()).to.deep.equal({
          accessKeyId: namedAccessKey,
          secretAccessKey: namedSecretKey,
          sessionToken: undefined,
        });
      }
    );
  });

  it('recognizes AWS_DEFAULT_PROFILE', async () => {
    await overrideEnv(
      {
        whitelist: ['AWS_SHARED_CREDENTIALS_FILE'],
        variables: { AWS_DEFAULT_PROFILE: 'other' },
      },
      async () => {
        const provider = await getCredentialProvider();
        expect(await provider()).to.deep.equal({
          accessKeyId: otherAccessKey,
          secretAccessKey: otherSecretKey,
          sessionToken: undefined,
        });
      }
    );
  });

  it('recognizes default profile from config', async () => {
    const provider = await getCredentialProvider();
    expect(await provider()).to.deep.equal({
      accessKeyId: defaultAccessKey,
      secretAccessKey: defaultSecretKey,
      sessionToken: undefined,
    });
  });
});
