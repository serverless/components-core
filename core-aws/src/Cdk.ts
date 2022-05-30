import * as crypto from 'crypto';
import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import * as childProcess from 'child_process';
import { App } from 'aws-cdk-lib';
import { ComponentContext } from '@serverless-components/core';
import AsyncLock from 'async-lock';
import uniGlobal from 'uni-global';

export default class Cdk {
  private readonly toolkitStackName = 'serverless-cdk-toolkit';
  public readonly artifactDirectory: string;

  constructor(
    private readonly context: ComponentContext,
    private readonly stackName: string,
    private readonly region: string,
    private readonly sdkConfig: { region: string }
  ) {
    this.artifactDirectory = `.serverless/${this.stackName}`;
  }

  /**
   * @return Whether changes were deployed.
   */
  async deploy(app: App): Promise<boolean> {
    await this.bootstrapCdk();

    this.context.logVerbose(`Packaging ${this.stackName}`);
    const stackArtifact = app.synth().getStackByName(this.stackName);

    const cloudFormationTemplateHash = this.computeStackTemplateHash(stackArtifact.template);
    if (this.context.state.cdk?.cloudFormationTemplateHash === cloudFormationTemplateHash) {
      this.context.logVerbose('Nothing to deploy, the stack is up to date');
      return false;
    }

    this.context.logVerbose(`Deploying ${this.stackName}`);
    await this.execCdk([
      'deploy',
      /**
       * The `:` is a shell "no-op" command. The `--app` arg tells CDK which command to run
       * to package the application. Since we package the app ourselves above (via `synth()`),
       * the artifacts exist already. The CDK can directly take these artifacts and deploy.
       */
      '--app',
      ':',
      '--toolkit-stack-name',
      this.toolkitStackName,
      '--output',
      this.artifactDirectory,
      // We don't want the CDK to interactively ask for approval for sensitive changes.
      '--require-approval',
      'never',
    ]);

    if (this.context.state.cdk === undefined) {
      this.context.state.cdk = {};
    }
    this.context.state.cdk.cloudFormationTemplateHash = cloudFormationTemplateHash;
    await this.context.save();

    this.context.logVerbose('Deployment success');
    return true;
  }

  async remove(app: App): Promise<void> {
    if (!this.context.state.cdk?.cloudFormationTemplateHash) {
      this.context.logVerbose(`${this.stackName} was not deployed, nothing to remove`);
      return;
    }

    await this.bootstrapCdk();

    this.context.logVerbose(`Preparing ${this.stackName}`);
    app.synth().getStackByName(this.stackName);

    this.context.logVerbose(`Removing ${this.stackName}`);
    await this.execCdk([
      'destroy',
      '--force',
      /**
       * The `:` is a shell "no-op" command. The `--app` arg tells CDK which command to run
       * to package the application. Since we package the app ourselves above (via `synth()`),
       * the artifacts exist already. The CDK can directly take these artifacts and deploy.
       */
      '--app',
      ':',
      '--toolkit-stack-name',
      this.toolkitStackName,
      '--output',
      this.artifactDirectory,
      // We don't want the CDK to interactively ask for approval for sensitive changes.
      '--require-approval',
      'never',
    ]);
    delete this.context.state.cdk.cloudFormationTemplateHash;
    await this.context.save();
    this.context.logVerbose('Stack removed with success');
  }

  async getAccountId(): Promise<string> {
    const sts = new STSClient({
      region: this.region,
    });
    const accountId = (await sts.send(new GetCallerIdentityCommand({}))).Account;
    if (accountId === undefined) {
      throw new Error('No AWS account ID could be found via the AWS credentials');
    }
    return accountId;
  }

  async getStackOutputs(): Promise<Record<string, string>> {
    this.context.logVerbose(`Fetching outputs of stack "${this.stackName}"`);

    const cloudFormation = new CloudFormationClient(this.sdkConfig);
    let data;
    try {
      data = await cloudFormation.send(
        new DescribeStacksCommand({
          StackName: this.stackName,
        })
      );
    } catch (e) {
      if (e instanceof Error && e.message === `Stack with id ${this.stackName} does not exist`) {
        this.context.logVerbose(e.message);
        return {};
      }
      throw e;
    }
    if (!data?.Stacks?.[0]?.Outputs) return {};

    const outputs: Record<string, string> = {};
    for (const item of data.Stacks[0].Outputs) {
      if (!item.OutputKey || !item.OutputValue) continue;
      const id = this.lowercaseFirstLetter(item.OutputKey);
      outputs[id] = item.OutputValue;
    }
    return outputs;
  }

  /**
   * @see https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping.html
   */
  private async bootstrapCdk() {
    if (this.context.state.cdk?.cdkBootstrapped) {
      // The CDK is already set up
      return;
    }

    const accountId = await this.getAccountId();

    /**
     * We use a lock to make sure different components don't bootstrap the CDK in the
     * same account/region in parallel. Indeed, if that happens, both components would
     * be deploying the same CloudFormation stack, resulting in an error.
     *
     * The lock has to be global to the whole process: if different versions of this package
     * are installed, we don't want one lock system to exist in each installed version.
     * That's why we use the 'uni-global' package, which behaves like `global` but cleaner.
     *
     * That also means WE MUST KEEP BC on what `globalContext.cdkBootstrapLock` contains
     * because all versions of this package will use it.
     *
     * Note that this lock just guarantees sequential execution. The `cdk bootstrap` command will
     * still be run multiple times (sequentially) for the same account/region, which is
     * inefficient. BUT `cdk bootstrap` on an already bootstrapped account only takes 2.5s, so
     * we will consider the overhead negligible for now.
     */
    const globalContext = uniGlobal('@serverless-components/core-aws');
    if (!globalContext.cdkBootstrapLock) {
      globalContext.cdkBootstrapLock = new AsyncLock();
    }
    // We lock parallel bootstrapping per "CDK environment" (account ID + region)
    // so that bootstrapping different environments happens in parallel
    const lockKey = `@serverless-components/aws/cdk-boostrap/${accountId}/${this.region}`;

    await globalContext.cdkBootstrapLock.acquire(lockKey, async () => {
      this.context.logVerbose(`Bootstrapping the AWS CDK in "aws://${accountId}/${this.region}"`);
      await this.execCdk([
        'bootstrap',
        `aws://${accountId}/${this.region}`,
        /**
         * We use a CDK toolkit stack dedicated to Serverless.
         * The reason for this is:
         * - to keep complete control over that stack
         * - because there are multiple versions, we don't want to force
         *   one specific version on users
         * (see https://docs.aws.amazon.com/cdk/latest/guide/bootstrapping.html#bootstrapping-templates)
         */
        '--toolkit-stack-name',
        this.toolkitStackName,
        /**
         * In the same spirit as the custom stack name, we must provide
         * a different "qualifier": this ID will be used in CloudFormation
         * exports to provide a unique export name.
         */
        '--qualifier',
        'serverless',
      ]);
    });

    if (this.context.state.cdk === undefined) {
      this.context.state.cdk = {};
    }
    this.context.state.cdk.cdkBootstrapped = true;
    await this.context.save();
  }

  private computeStackTemplateHash(stackTemplate: string): string {
    return crypto.createHash('md5').update(JSON.stringify(stackTemplate)).digest('hex');
  }

  private lowercaseFirstLetter(string: string) {
    return string.charAt(0).toLowerCase() + string.slice(1);
  }

  private async execCdk(args: string[]): Promise<{ stdout: string; stderr: string }> {
    this.context.logVerbose(`Running "cdk ${args.join(' ')}"`);
    return new Promise((resolve, reject) => {
      const child = childProcess.spawn('cdk', args, {
        env: {
          ...process.env,
          CDK_DISABLE_VERSION_CHECK: '1',
        },
      });
      let stdout = '';
      let stderr = '';
      let allOutput = '';
      if (child.stdout) {
        child.stdout.on('data', (data) => {
          this.context.logVerbose(data.toString().trim());
          stdout += data;
          allOutput += data;
        });
      }
      if (child.stderr) {
        child.stderr.on('data', (data) => {
          this.context.logVerbose(data.toString().trim());
          stderr += data;
          allOutput += data;
        });
      }
      child.on('error', (err) => reject(err));
      child.on('close', (code) => {
        if (code !== 0) {
          if (
            allOutput.includes(
              'This CDK CLI is not compatible with the CDK library used by your application'
            )
          ) {
            reject(
              'This component uses a version of "aws-cdk-lib" that is more recent than the version of "aws-cdk" used by the "@serverless-components/core-aws" package'
            );
          }
          reject(allOutput);
        }
        resolve({ stdout, stderr });
      });
      // Make sure that when our process is killed, we terminate the subprocess too
      process.on('exit', () => child.kill());
    });
  }
}
