export interface Component {
  deploy(): Promise<void> | void;
  remove(): Promise<void> | void;
  info(): Promise<void> | void;
  refreshOutputs(): Promise<void> | void;
  logs?(): Promise<void> | void;
}

export type ComponentCommands = {
  [key: string]: {
    handler: (options: Record<string, any>) => Promise<void> | void;
  };
};

export interface ComponentContext {
  readonly stage: string;
  state: Record<string, any>;
  outputs: Record<string, any>;
  save(): Promise<void>;
  updateOutputs(outputs: Record<string, any>): Promise<void>;
  writeText(message: string, namespace?: string[]): void;
  logVerbose(message: string, namespace?: string[]): void;
  logError(error: string | Error, namespace?: string[]): void;
  startProgress(text: string): void;
  updateProgress(text: string): void;
  successProgress(text: string): void;
}

export declare class ServerlessError extends Error {
  constructor(message: string, code: string);
}
