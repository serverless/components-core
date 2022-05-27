import { ComponentContext } from '@serverless-components/core';
import proxyquire from 'proxyquire';
import { SinonSpy, spy } from 'sinon';
import { App, Stack } from 'aws-cdk-lib';
import { expect } from 'chai';
import { Cdk } from '../src';
import FakeComponentContext from './FakeComponentContext';

describe('Cdk', () => {
  it('bootstraps the AWS CDK automatically', async () => {
    const [cdk, spawnStub] = mockCdk(new FakeComponentContext());

    const app = new App();
    new Stack(app, 'stack-name');
    await cdk.deploy(app);

    expect(spawnStub.callCount).to.be.greaterThanOrEqual(1);
    expect(spawnStub.getCall(0).args[0]).to.equal('cdk');
    expect(spawnStub.getCall(0).args[1][0]).to.equal('bootstrap');
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
    expect(spawnStubA.getCall(0).args[0]).to.equal('cdk');
    expect(spawnStubA.getCall(0).args[1][0]).to.equal('bootstrap');
    expect(spawnStubB.callCount).to.be.greaterThanOrEqual(1);
    expect(spawnStubB.getCall(0).args[0]).to.equal('cdk');
    expect(spawnStubB.getCall(0).args[1][0]).to.equal('bootstrap');
  });
});

/**
 * @param componentContext
 * @param onSpawn Optional: behavior we want to execute when the CLK CLI runs.
 */
function mockCdk(
  componentContext: ComponentContext,
  onSpawn?: (command: string, args: string[]) => number | Promise<number>
): [Cdk, SinonSpy] {
  const spawnStub = spy((command: string, args: string[]) => {
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
    };
  });
  const MockedCdk = proxyquire('../src/Cdk', {
    child_process: { spawn: spawnStub },
  }).default;

  const cdk = new MockedCdk(componentContext, 'stack-name', 'us-east-1', {
    region: 'us-east-1',
  }) as Cdk;

  return [cdk, spawnStub];
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
