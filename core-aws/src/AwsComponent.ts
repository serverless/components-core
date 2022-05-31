import { ComponentContext } from '@serverless-components/core';
import { getCredentialProvider, getRegion } from '@serverless-components/utils-aws';
import Cdk from './Cdk';

type AwsComponentInputs = {
  region?: string;
  profile?: string;
};

export default abstract class AwsComponent {
  readonly stackName: string;
  // These properties are not named `context`/`inputs` to avoid conflicting with properties
  // with the same name in child classes (thanks JS/TS…).
  private readonly _context: ComponentContext;
  private readonly _inputs: AwsComponentInputs;

  protected constructor(id: string, context: ComponentContext, inputs: AwsComponentInputs) {
    this._context = context;
    this._inputs = inputs;
    this.stackName = `${id}-${context.stage}`;
  }

  async getRegion(): Promise<string> {
    return this._inputs.region || (await getRegion({ profile: this._inputs.profile }));
  }

  async getCdk(): Promise<Cdk> {
    return new Cdk(this._context, this.stackName, await this.getSdkConfig());
  }

  async getSdkConfig() {
    const region = await this.getRegion();
    return {
      region,
      credentials: await getCredentialProvider({ region, profile: this._inputs.profile }),
    };
  }
}
