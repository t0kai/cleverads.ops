import type { AdvertiserModule } from './types';

/**
 * Module id → module, loaded only when needed (choosing ACM never downloads another advertiser's code).
 * Add a line here for each new module.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each module has its own Config/Result types
type AnyModule = AdvertiserModule<any, any>;

const loaders: Record<string, () => Promise<AnyModule>> = {
  acm: () => import('./acm').then((m) => m.acmModule),
};

export function listModuleIds(): string[] {
  return Object.keys(loaders);
}

export async function loadModule(id: string): Promise<AnyModule | null> {
  const load = loaders[id];
  return load ? load() : null;
}
