import { ComponentContext } from '@serverless-components/core';

export default class FakeComponentContext implements ComponentContext {
  stage = 'dev';
  outputs: Record<string, any>;
  state: Record<string, any>;

  constructor(state = {}, outputs = {}) {
    this.state = state;
    this.outputs = outputs;
  }

  writeText(message: string, namespace?: string[]): void {
    // no logs
  }

  logError(error: string | Error, namespace?: string[]): void {
    // no logs
  }

  logVerbose(message: string, namespace?: string[]): void {
    // no logs
  }

  async save(): Promise<void> {
    // ok
  }

  async updateOutputs(outputs: Record<string, any>): Promise<void> {
    this.outputs = outputs;
  }

  startProgress(text: string): void {
    // no logs
  }

  successProgress(text: string): void {
    // no logs
  }

  updateProgress(text: string): void {
    // no logs
  }
}
