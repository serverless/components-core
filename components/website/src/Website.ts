import { App } from 'aws-cdk-lib';
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { ComponentContext, ServerlessError } from '@serverless-components/core';
import { AwsComponent } from '@serverless-components/core-aws';
import { exec } from 'child_process';
import WebsiteConstruct from './WebsiteConstruct';
import { WebsiteSchema, WebsiteInput } from './Input';
import S3Sync from './S3Sync';
import { existsSync, statSync } from 'fs-extra';
import * as path from 'path';

export default class Website extends AwsComponent {
  static SCHEMA = WebsiteSchema;

  constructor(id: string, context: ComponentContext, inputs: WebsiteInput) {
    super(id, context, inputs);

    if (inputs.domain !== undefined && inputs.certificate === undefined) {
      throw new ServerlessError(
        `Invalid configuration for website '${this.id}': if a domain is configured, then a certificate ARN must be configured in the 'certificate' option`,
        'INVALID_WEBSITE_CONFIGURATION'
      );
    }
  }

  async deploy() {
    this.context.startProgress('building');

    await this.build();

    this.context.updateProgress('deploying');

    const cdk = await this.getCdk();

    const app = new App({
      outdir: cdk.artifactDirectory,
    });
    new WebsiteConstruct(app, this.stackName, this.inputs as WebsiteInput);

    const hasInfrastructureChanges = await cdk.deploy(app);

    if (hasInfrastructureChanges) {
      await this.context.updateOutputs(await cdk.getStackOutputs());
    }

    const filesChanged = await this.uploadWebsite();

    if (hasInfrastructureChanges || filesChanged > 0) {
      this.context.successProgress('deployed');
    } else {
      this.context.successProgress('no changes');
    }
  }

  async remove() {
    this.context.startProgress('removing');

    const app = new App();
    new WebsiteConstruct(app, this.stackName, this.inputs as WebsiteInput);

    if (this.context.outputs.bucketName) {
      const s3Sync = new S3Sync(await this.getSdkConfig(), this.context);
      await s3Sync.emptyBucket(this.context.outputs.bucketName);
    }

    const cdk = await this.getCdk();
    await cdk.remove(app);

    this.context.state = {};
    await this.context.save();
    await this.context.updateOutputs({});

    this.context.successProgress('removed');
  }

  info() {
    this.context.writeText(this.context.outputs.url);
  }

  async refreshOutputs(): Promise<void> {
    this.context.startProgress('refreshing outputs');
    const cdk = await this.getCdk();
    await this.context.updateOutputs(await cdk.getStackOutputs());
    this.context.successProgress('outputs refreshed');
  }

  private async uploadWebsite(): Promise<number> {
    this.context.updateProgress('uploading assets');

    const pathToSync = this.inputs.build?.outputDir
      ? path.join(this.inputs.path, this.inputs.build.outputDir)
      : this.inputs.path;
    if (!existsSync(pathToSync) || !statSync(pathToSync).isDirectory()) {
      throw new ServerlessError(
        `Cannot upload website: "${pathToSync}" is not a directory`,
        'INVALID_WEBSITE_CONFIGURATION'
      );
    }

    const s3Sync = new S3Sync(await this.getSdkConfig(), this.context);
    const fileChangeCount = await s3Sync.s3Sync({
      bucketName: this.context.outputs.bucketName,
      localPath: pathToSync,
    });
    if (fileChangeCount > 0) {
      await this.clearCDNCache();
    }

    return fileChangeCount;
  }

  private async build() {
    const buildCommand = this.inputs.build?.cmd;
    if (!buildCommand) {
      return;
    }

    this.context.logVerbose(`Running "${buildCommand}"`);
    await new Promise<void>((resolve, reject) => {
      // We use exec() because the command to run is a string command
      // with arguments in it (spawn doesn't support that)
      // exec() also runs in a shell by default, which is probably
      // what users expect
      const child = exec(buildCommand, {
        cwd: this.inputs.path,
        env: {
          ...process.env,
          ...(this.inputs.build.environment ?? {}),
        },
      });
      if (child.stdout) {
        child.stdout.on('data', (data) => this.context.logVerbose(data.toString().trim()));
      }
      if (child.stderr) {
        child.stderr.on('data', (data) => this.context.logVerbose(data.toString().trim()));
      }
      child.on('error', (err) => reject(err));
      child.on('close', (code) => {
        if (code !== 0) {
          reject(`The command "${buildCommand}" failed with exit code ${code}`);
        }
        resolve();
      });
      // Make sure that when our process is killed, we terminate the subprocess too
      process.on('exit', () => child.kill());
    });
  }

  private async clearCDNCache() {
    const distributionId = this.context.outputs.distributionId;
    if (!distributionId) {
      return;
    }

    this.context.logVerbose('Clearing CloudFront DNS cache');
    this.context.updateProgress('clearing CDN cache');
    const cloudFrontClient = new CloudFrontClient(await this.getSdkConfig());
    await cloudFrontClient.send(
      new CreateInvalidationCommand({
        DistributionId: distributionId,
        InvalidationBatch: {
          // This should be a unique ID: we use a timestamp
          CallerReference: Date.now().toString(),
          Paths: {
            // Invalidate everything
            Items: ['/*'],
            Quantity: 1,
          },
        },
      })
    );
  }
}
