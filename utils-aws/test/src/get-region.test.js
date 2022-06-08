'use strict';

const path = require('path');
const overrideEnv = require('process-utils/override-env');
const fse = require('fs-extra');

const getRegion = require('../../src/get-region');

const expect = require('chai').expect;

describe('test/src/get-region.test.js', () => {
  let restoreEnv;
  before(async () => {
    const awsDirPath = path.resolve('.aws');
    const credentialsFilePath = path.join(awsDirPath, 'credentials-other');
    const configFilePath = path.join(awsDirPath, 'config-other');
    await fse.outputFile(
      credentialsFilePath,
      ['[named]', 'region = eu-west-1', '[shared]', 'region = eu-west-1'].join('\n')
    );
    await fse.outputFile(
      configFilePath,
      ['[profile shared]', 'region = eu-south-1', '[profile other]', 'region = eu-south-1'].join(
        '\n'
      )
    );
    ({ restoreEnv } = overrideEnv({
      variables: {
        AWS_SHARED_CREDENTIALS_FILE: credentialsFilePath,
        AWS_CONFIG_FILE: configFilePath,
      },
    }));
  });

  after(() => {
    restoreEnv();
  });

  it('gets default region', async () => {
    expect(await getRegion()).to.equal('us-east-1');
  });

  it('gets region from AWS_REGION over AWS_DEFAULT_REGION', async () => {
    await overrideEnv(
      {
        whitelist: ['AWS_SHARED_CREDENTIALS_FILE', 'AWS_CONFIG_FILE'],
        variables: { AWS_REGION: 'eu-central-1', AWS_DEFAULT_REGION: 'us-east-2' },
      },
      async () => {
        expect(await getRegion()).to.equal('eu-central-1');
      }
    );
  });

  it('gets region from AWS_DEFAULT_REGION', async () => {
    await overrideEnv(
      {
        whitelist: ['AWS_SHARED_CREDENTIALS_FILE', 'AWS_CONFIG_FILE'],
        variables: { AWS_DEFAULT_REGION: 'us-east-2' },
      },
      async () => {
        expect(await getRegion()).to.equal('us-east-2');
      }
    );
  });

  it('gets region from credentials for profile', async () => {
    expect(await getRegion({ profile: 'named' })).to.equal('eu-west-1');
  });

  it('gets region from config for profile', async () => {
    expect(await getRegion({ profile: 'other' })).to.equal('eu-south-1');
  });

  it('favors region from config over credentials for profile', async () => {
    expect(await getRegion({ profile: 'shared' })).to.equal('eu-south-1');
  });
});
