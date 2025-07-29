import { ConfigLoader } from './ConfigLoader'
import { Storage } from '../storage/Storage'
import { GuardConfig, HotConfig } from '../contracts/types'

export class HotConfigLoader {
  constructor(
    private baseConfigLoader: ConfigLoader,
    private storage: Storage
  ) {}
  
  async getConfig(): Promise<GuardConfig> {
    // Get base config from file
    const baseConfig = this.baseConfigLoader.getConfig()
    
    // Get hot config overrides
    const hotConfig = await this.storage.getHotConfig()
    if (!hotConfig) {
      return baseConfig
    }
    
    // Deep merge hot config over base config
    return this.mergeConfigs(baseConfig, hotConfig)
  }
  
  async updateConfig(updates: Partial<HotConfig>): Promise<void> {
    const current = await this.storage.getHotConfig() || {
      lastUpdated: new Date().toISOString()
    }
    
    const updated: HotConfig = {
      ...current,
      ...updates,
      lastUpdated: new Date().toISOString()
    }
    
    await this.storage.saveHotConfig(updated)
  }
  
  async clearHotConfig(): Promise<void> {
    await this.storage.delete('hot-config')
  }
  
  isFileWhitelisted(filePath: string): boolean {
    return this.baseConfigLoader.isFileWhitelisted(filePath)
  }
  
  reloadConfig(): void {
    this.baseConfigLoader.reloadConfig()
  }
  
  private mergeConfigs(base: GuardConfig, hot: HotConfig): GuardConfig {
    const result: GuardConfig = {
      enforcement: {
        ...base.enforcement,
        ...(hot.enforcement || {}),
      },
      whitelist: base.whitelist, // Don't allow hot config to change whitelist
    }
    
    // Handle thresholds separately to ensure proper typing
    if (base.thresholds || hot.thresholds) {
      result.thresholds = {
        allowedPositiveLines: hot.thresholds?.allowedPositiveLines ?? base.thresholds?.allowedPositiveLines ?? 0,
      }
    }
    
    return result
  }
}