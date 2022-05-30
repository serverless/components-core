import { Component, ComponentContext } from '@serverless-components/core';
import { getCredentialProvider, getRegion } from '@serverless-components/utils-aws';
import Cdk from './Cdk';

export default abstract class AwsComponent extends Component {
  readonly stackName: string;

  protected constructor(id: string, context: ComponentContext, inputs: Record<string, any>) {
    super(id, context, inputs);

    this.stackName = `${this.id}-${this.context.stage}`;
    // TODO validate input
  }

  async getRegion(): Promise<string> {
    return this.inputs.region || await getRegion({ profile: this.inputs.profile });
  }

  async getCdk(): Promise<Cdk> {
    return new Cdk(this.context, this.stackName, await this.getSdkConfig());
  }

  async getSdkConfig() {
    const region = await this.getRegion();
    return {
     region,
      credentials: await getCredentialProvider({ region, profile: this.inputs.profile }),
    };
  }
}
