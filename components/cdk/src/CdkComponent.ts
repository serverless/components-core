import { App, Stack } from 'aws-cdk-lib';
import { AwsComponent } from '@serverless-components/core-aws';
import * as path from 'path';
import { ComponentContext } from '@serverless-components/core';
import { CdkComponentInput } from './Input';

export default class CdkComponent extends AwsComponent {
  constructor(
    id: string,
    private readonly context: ComponentContext,
    private readonly inputs: CdkComponentInput
  ) {
    super(id, context, inputs);
  }

  async deploy() {
    this.context.startProgress('deploying');

    const cdk = await this.getCdk();
    const hasChanges = await cdk.deploy((app: App) => this.initApp(app));
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
    await cdk.remove((app: App) => this.initApp(app));

    this.context.state = {};
    await this.context.save();
    await this.context.updateOutputs({});

    this.context.successProgress('removed');
  }

  info() {
    // TODO
  }

  refreshOutputs(): Promise<void> {
    throw new Error('Method not implemented.');
  }

  private initApp(app: App): void {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ConstructClass = require(path.join(process.cwd(), this.inputs.construct));
    if (ConstructClass.prototype instanceof Stack) {
      new ConstructClass(app, this.stackName, this.inputs.props);
    } else {
      const stack = new Stack(app, this.stackName);
      new ConstructClass(stack, 'Construct', this.inputs.props);
    }
  }
}
