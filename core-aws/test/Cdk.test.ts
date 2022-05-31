import { ComponentContext } from '@serverless-components/core';
import proxyquire from 'proxyquire';
import { SinonStub, stub } from 'sinon';
import { App, Stack } from 'aws-cdk-lib';
import { expect } from 'chai';
import { mockClient } from 'aws-sdk-client-mock';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { Cdk } from '../src';
import FakeComponentContext from './FakeComponentContext';

const stsMock = mockClient(STSClient);

describe('Cdk', () => {
  beforeEach(() => {
    stsMock.reset();
  });

  it('bootstraps the AWS CDK automatically', async () => {
    const [cdk, spawnStub] = mockCdk(new FakeComponentContext());

    const app = new App();
    new Stack(app, 'stack-name');
    await cdk.deploy(app);

    expect(spawnStub.callCount).to.be.greaterThanOrEqual(1);
    expect(spawnStub.getCall(0).args[1][1]).to.equal('bootstrap');
  });

  it('does not bootstraps twice', async () => {
    const [cdk, spawnStub] = mockCdk(new FakeComponentContext());

    const app1 = new App();
    new Stack(app1, 'stack-name');
    await cdk.deploy(app1);
    // Deploy again, but with a different stack
    const app2 = new App();
    const stack = new Stack(app2, 'stack-name');
    new Bucket(stack, 'bucket');
    await cdk.deploy(app2);

    expect(spawnStub.callCount).to.equal(3);
    expect(spawnStub.getCall(0).args[1][1]).to.equal('bootstrap');
    expect(spawnStub.getCall(1).args[1][1]).to.equal('deploy');
    expect(spawnStub.getCall(2).args[1][1]).to.equal('deploy');
  });

  it('does not bootstrap the AWS CDK in parallel to avoid race conditions', async () => {
    let isBootstrapping = false;
    let raceCondition = false;

    // Component A
    const [cdkA, spawnStubA] = mockCdk(new FakeComponentContext(), async (command, args) => {
      if (args[0] !== 'bootstrap') return 0; // other commands like `deploy` should resolve instantly
      isBootstrapping = true;
      await sleep(100);
      isBootstrapping = false;
      return 0;
    });
    // Component B
    const [cdkB, spawnStubB] = mockCdk(new FakeComponentContext(), async (command, args) => {
      if (args[0] !== 'bootstrap') return 0; // other commands like `deploy` should resolve instantly
      // Wait a little before starting so that cdkA has time to set `isBootstrapping = true`
      await sleep(20);
      if (isBootstrapping) {
        // If we reach this point we have a bug (we have a race condition)
        raceCondition = true;
      }
      return 0;
    });

    const app = new App();
    new Stack(app, 'stack-name');
    await Promise.all([cdkA.deploy(app), cdkB.deploy(app)]);

    expect(raceCondition).to.be.equal(false);
    // Also make sure that both components actually ran `cdk bootstrap`
    expect(spawnStubA.callCount).to.be.greaterThanOrEqual(1);
    expect(spawnStubA.getCall(0).args[1][1]).to.equal('bootstrap');
    expect(spawnStubB.callCount).to.be.greaterThanOrEqual(1);
    expect(spawnStubB.getCall(0).args[1][1]).to.equal('bootstrap');
  });

  it('skips deploying unchanged stacks', async () => {
    const [cdk, spawnStub] = mockCdk(new FakeComponentContext());

    const app1 = new App();
    new Stack(app1, 'stack-name');
    await cdk.deploy(app1);
    // Deploy the same stack again
    const app2 = new App();
    new Stack(app2, 'stack-name');
    await cdk.deploy(app2);

    expect(spawnStub.callCount).to.equal(2);
    expect(spawnStub.getCall(0).args[1][1]).to.equal('bootstrap');
    expect(spawnStub.getCall(1).args[1][1]).to.equal('deploy');
  });
});

/**
 * @param componentContext
 * @param onSpawn Optional: behavior we want to execute when the CLK CLI runs.
 */
function mockCdk(
  componentContext: ComponentContext,
  onSpawn?: (command: string, args: string[]) => number | Promise<number>
): [Cdk, SinonStub] {
  const spawnStub = stub().callsFake((command: string, args: string[]) => {
    return {
      on: async (arg, cb) => {
        if (arg === 'close') {
          const exitCode = onSpawn ? await onSpawn(command, args) : 0;
          cb(exitCode);
        }
      },
      stdout: {
        on: (arg, cb) => {
          if (arg === 'data') cb('This is the CDK CLI output');
        },
      },
      kill: () => {
        // Nothing to kill
      },
    };
  });
  const MockedCdk = proxyquire('../src/Cdk', {
    child_process: { spawn: spawnStub },
  }).default;

  const cdk = new MockedCdk(componentContext, 'stack-name', {
    region: 'us-east-1',
  }) as Cdk;

  stsMock.on(GetCallerIdentityCommand).resolves({
    // Fake AWS account ID
    Account: '1234567890',
  });

  return [cdk, spawnStub];
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
