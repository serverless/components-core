import { App, Stack } from 'aws-cdk-lib';
import { AwsComponent } from '@serverless-components/core-aws';
import * as path from 'path';

export default class CdkComponent extends AwsComponent {
  async deploy() {
    this.context.startProgress('deploying');

    const cdk = await this.getCdk();
    const app = this.createApp(cdk.artifactDirectory);
    const hasChanges = await cdk.deploy(app);
    if (!hasChanges) {
      this.context.successProgress('no changes');
      return;
    }

    await this.context.updateOutputs(await cdk.getStackOutputs());
    this.context.successProgress('deployed');
  }

  async remove() {
    this.context.startProgress('removing');

    const cdk = await this.getCdk();
    const app = this.createApp(cdk.artifactDirectory);
    await cdk.remove(app);

    this.context.state = {};
    await this.context.save();
    await this.context.updateOutputs({});

    this.context.successProgress('removed');
  }

  private createApp(artifactDirectory: string): App {
    const app = new App({
      outdir: artifactDirectory,
    });
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ConstructClass = require(path.join(process.cwd(), this.inputs.construct));
    if (ConstructClass.prototype instanceof Stack) {
      new ConstructClass(app, this.stackName, this.inputs.props);
    } else {
      const stack = new Stack(app, this.stackName);
      new ConstructClass(stack, 'Construct', this.inputs.props);
    }
    return app;
  }

  info() {
    // TODO
  }

  refreshOutputs(): Promise<void> {
    throw new Error('Method not implemented.');
  }
}
