import { MODEL_DEFS } from '../../shared/constants';
import type { ModelKey, ModelOption, ModelState } from '../../shared/types';
import { getLocale } from './locale';

function providerAvailable(provider: string): boolean {
  if (provider === 'anthropic') return !!process.env.ANTHROPIC_API_KEY;
  if (provider === 'openai') return !!process.env.OPENAI_API_KEY;
  return true;
}

export function buildOptions(): ModelOption[] {
  return MODEL_DEFS.map(d => ({
    key: d.key, label: d.provider === 'mock' && getLocale() === 'en' ? 'Demo brain' : d.label, provider: d.provider,
    modelId: d.provider === 'mock' ? '' : (d.env && process.env[d.env]) || d.defaultModelId,
    available: providerAvailable(d.provider),
  }));
}

export class ModelRegistry {
  private activeKey: ModelKey;
  private health = new Map<ModelKey, { healthy: boolean; latencyMs: number }>();
  constructor() {
    const opts = buildOptions();
    const env = process.env.TACHI_DEFAULT_MODEL as ModelKey | undefined;
    const envOpt = env && opts.find(o => o.key === env && o.available);
    this.activeKey = envOpt ? envOpt.key
      : (['claude-sonnet', 'gpt-terra', 'demo'] as ModelKey[]).find(k => opts.find(o => o.key === k)?.available) ?? 'demo';
  }
  recordHealth(key: ModelKey, healthy: boolean, latencyMs: number): void { this.health.set(key, { healthy, latencyMs }); }
  private options(): ModelOption[] {
    return buildOptions().map(o => { const h = this.health.get(o.key); return h ? { ...o, healthy: h.healthy, latencyMs: h.latencyMs } : o; });
  }
  state(): ModelState { return { active: this.activeKey, options: this.options() }; }
  setActive(key: ModelKey): ModelState {
    if (buildOptions().some(o => o.key === key && o.available)) this.activeKey = key;
    return this.state();
  }
  active(): ModelOption { const o = this.options(); return o.find(x => x.key === this.activeKey) ?? o[o.length - 1]; }
}
