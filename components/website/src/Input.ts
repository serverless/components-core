export type WebsiteInput = {
  path: string;
  build?: {
    cmd: string;
    outputDir?: string;
    environment?: Record<string, string>;
  };
  region?: string;
  domain?: string | string[];
  certificate?: string;
  security?: {
    allowIframe: boolean;
  };
  redirectToMainDomain?: boolean;
};
