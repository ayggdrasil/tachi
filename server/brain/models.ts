import { MODEL_DEFS } from '../../shared/constants';
import type { ModelKey, ModelOption, ModelState } from '../../shared/types';

function providerAvailable(provider: string): boolean {
  if (provider === 'anthropic') return !!process.env.ANTHROPIC_API_KEY;
  if (provider === 'openai') return !!process.env.OPENAI_API_KEY;
  return true;
}

export function buildOptions(): ModelOption[] {
  return MODEL_DEFS.map(d => ({
    key: d.key, label: d.label, provider: d.provider,
    modelId: d.provider === 'mock' ? '' : (d.env && process.env[d.env]) || d.defaultModelId,
    available: providerAvailable(d.provider),
  }));
}

export class ModelRegistry {
  private activeKey: ModelKey;
  constructor() {
    const opts = buildOptions();
    const env = process.env.TACHI_DEFAULT_MODEL as ModelKey | undefined;
    const envOpt = env && opts.find(o => o.key === env && o.available);
    this.activeKey = envOpt ? envOpt.key
      : (['claude-sonnet', 'gpt-terra', 'demo'] as ModelKey[]).find(k => opts.find(o => o.key === k)?.available) ?? 'demo';
  }
  state(): ModelState { return { active: this.activeKey, options: buildOptions() }; }
  setActive(key: ModelKey): ModelState {
    if (MODEL_DEFS.some(d => d.key === key)) this.activeKey = key;
    return this.state();
  }
  active(): ModelOption { const o = buildOptions(); return o.find(x => x.key === this.activeKey) ?? o[o.length - 1]; }
}
